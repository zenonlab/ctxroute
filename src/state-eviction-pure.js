// ═══════════════════════════════════════════════════════════════════════
// STATE-EVICTION-PURE — WHAT the disk state must lose. Zero I/O.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHY THIS FILE EXISTS: `state/` had NO eviction at all. Measured on the live
//    install (2026-08-21): **615 files, 5.1 MB, of which 544 (88 %) were
//    `plan-` keys** — one born at every tool call, useless the moment its action
//    ends. `ctxroute-reset.js` purges ONE scope and only on a compaction order;
//    a 30-day TTL existed in `legacy-mcp-inject.js` but has been UNWIRED SINCE
//    2026-07-17, so it has never run, and it covered 1 prefix out of 5 anyway.
//    Monotonic growth is not "a big number", it is a DATED outage: this machine
//    runs for YEARS with no operator, and "we will purge later" puts the human
//    back inside the loop this project exists to remove.
// 🛑 THE DECISION LIVES HERE, NOT IN THE SHELL, and that is not cosmetic:
//    Stryker never mutates an I/O file (equivalent mutants guaranteed), so a
//    deletion rule written next to the `unlink` would ship MEASURED BY NOTHING.
//    Precedents and remedy: `memory-store-pure.js`, `temporal-budget-pure.js`.
// ⚠️ CONTRACT: no `fs`, no `path`, no `process`, no clock. It RECEIVES a listing
//    (names + modification times) and RETURNS the names to delete. The shell
//    reads the directory and obeys — it decides nothing.
//
// 🔴 TRAP ①, WRITTEN HERE BECAUSE IT IS THE ONE THAT LOOKS LIKE A SOLUTION: a
//    threshold probe is NOT an eviction. "Alert when state/ exceeds N MB" only
//    CONSTATES, and by then it is too late. We evict by AGE and by COUNT; a
//    probe may watch the SLOPE, never replace this.
// 🔴 TRAP ②: an eviction is proven by what it DELETES. A real fleet script
//    targeted `*.tar.gz` while the producer wrote `*.sql.gz`: 0 bytes removed
//    since forever, disk at 87 %. A cleaner that matches nothing is
//    indistinguishable from a cleaner that works — hence `planEviction` returns
//    the LIST of names, so its cell can assert on the files themselves, and
//    hence the REFUSAL below rather than a silent no-op on a missing bound.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 🛑 THE EPHEMERAL PREFIX IS IMPORTED, NEVER RE-TYPED. The RAM store already
//    owns the answer to "which key dies with its action?" (`memory-store-pure`),
//    and the disk holds THE SAME key population. Two copies of that answer would
//    drift, and the drift would be silent: the disk would keep evicting a class
//    the RAM no longer considers ephemeral, or the reverse. Pure → pure import,
//    no I/O enters this module.
const memory = require('./memory-store-pure');

const EPHEMERAL_PREFIX = memory.EPHEMERAL_PREFIX;

// ⚠️ THE DURABLE CLASS, one file per agent scope, alive as long as its agent.
//    🛑 CLOSED LIST ON PURPOSE, AND FAIL-CLOSED: a file whose name matches NO
//    entry here is NEVER deleted. A state prefix invented tomorrow is therefore
//    not evicted (a leak we can see) instead of being deleted by surprise (a
//    loss we cannot undo). The list is confronted with the sweep of
//    `ctxroute-reset.js` by a cell — a copied enumeration nobody re-derives is
//    this repo's oldest way of shipping a stale rule.
const DURABLE_PREFIXES = ['doc-seen-', 'ctxroute-seen-', 'turn-count-', 'remainder-'];

// ⚠️ CEILINGS TAKEN FROM THE RAM STORE, and the arithmetic is ITS arithmetic
//    (re-checkable in `memory-store-pure.js`): 3 durable keys per agent ⇒ 4096
//    covers ≈ 1300 simultaneous agents; plans die within their action, so 2048
//    covers far more concurrent invocations than a fleet can have in flight.
// 🛑 ONE CEILING PER CLASS, NEVER A SHARED ONE — the defect corrected in RAM on
//    2026-08-21 is exactly reproducible here: under a single ceiling the
//    ephemeral flood (88 % of the files) evicts the durable, so one busy agent
//    erases every other agent's memory, silently, and it gets WORSE with scale.
const MAX_DURABLE = memory.MAX_SCOPES;
const MAX_EPHEMERAL = memory.MAX_EPHEMERAL;

// 🔑 THE ONLY DURATION IN THIS FILE, AND THE FACT THAT MAKES IT SAFE IS OURS,
//    NOT A GUESS ABOUT THE AGENT. Every hook process of this framework arms
//    `deadline.arm()` before any I/O (sealed by `deadline-gate.test.js`) and
//    therefore DIES, by our own timer, at most `deadline.DEFAULT_MS` after it
//    starts. A `plan-` file is read only by the frames of the invocation that
//    wrote it, and those frames are hook processes. So after one deadline every
//    process that could still read it is dead — killed by us, observably, not
//    presumed dead. The factor 10 pays for the spread between the first frame
//    and the last of the same action, and costs nothing but disk we have.
// 🛑 THIS IS NOT "the file looks old so its session is over". That inference is
//    forbidden here and would be wrong: a DURABLE key belongs to an agent whose
//    death nothing local can decide, which is why the durable class below has
//    NO age rule at all — only a declared count, coldest first.
const DEADLINE_MULTIPLE = 10;

/**
 * The age bound, DERIVED from the process deadline instead of being a second
 * number that drifts. The shell passes `deadline.DEFAULT_MS`; importing
 * `deadline.js` here would drag `setTimeout`/`process.exit` into a pure module.
 * @param {number} deadlineMs
 */
function ageBound(deadlineMs) {
  return deadlineMs * DEADLINE_MULTIPLE;
}

/**
 * Which class a state file belongs to — or `null`, which means UNTOUCHABLE.
 * ⚠️ `.tmp` FIRST, and it is a class of its own: `session-store.saveState`
 *    writes `<dest>.<pid>.<rand>.tmp` then renames. Such a file carries a known
 *    prefix, so without this branch a leftover would be counted as a plan or a
 *    scope and could be evicted by COUNT while its writer is still filling it —
 *    the rename would then fail and the write would be lost in silence (an
 *    unrecorded `once`, i.e. a re-injection). It is evicted by AGE ONLY, under
 *    the very same fact: no writer of ours outlives its deadline.
 * @param {string} name
 * @returns {'scratch'|'ephemeral'|'durable'|null}
 */
function classify(name) {
  if (name.endsWith('.tmp')) return 'scratch';
  // ⚠️ Anything that is not a `.json` state file is not ours to delete: the
  //    canary verdict, the daemon snapshot, a `.lock-*` directory, a file a
  //    human dropped there. Fail-closed.
  // 🛑 IT DECIDES SOMETHING ONLY WHEN THE NAME ALSO CARRIES A DECLARED PREFIX —
  //    `plan-a.txt`, `doc-seen-s.log` — and that shape is reachable BY
  //    CONSTRUCTION: the argument is a real directory listing, whose content
  //    nobody owns. Remove this line and those names get DELETED. Its cell uses
  //    exactly that shape; asserted on a `.txt` alone, the fall-through returns
  //    `null` too and the mutant is indistinguishable.
  if (!name.endsWith('.json')) return null;
  if (name.startsWith(EPHEMERAL_PREFIX)) return 'ephemeral';
  for (const prefix of DURABLE_PREFIXES) {
    if (name.startsWith(prefix)) return 'durable';
  }
  return null;
}

/**
 * COLDEST FIRST — the order the count ceiling consumes.
 * ⚠️ The tie-break on the name is not decoration: two files written in the same
 *    millisecond must not make the verdict depend on the order the OS happened
 *    to walk the directory. A cleaner whose output changes between two runs on
 *    the same disk is a cleaner nobody can assert on.
 * 🛑 EXPORTED ON PURPOSE, AND IT IS NOT A CONVENIENCE — do not un-export it.
 *    Observed through `planEviction` ALONE, this comparator is UNKILLABLE: the
 *    verdict is `.sort()`ed before it is returned, so any tie order produces the
 *    same list, and the `-1`/`1` clauses cover each other under a STABLE sort
 *    (ECMAScript guarantees stability, so dropping one clause degrades the
 *    comparator to an inconsistent one whose result V8 happens to keep correct).
 *    Measured: 8 mutants surviving on lines below with a green suite. The SIGN
 *    is the contract — a comparator is judged on what it RETURNS, and only a
 *    direct call can see that. Its wiring into the eviction is proven
 *    separately, by a cell where a tie evicts exactly one of the two files.
 * @param {{name: string, mtimeMs: number}} a
 * @param {{name: string, mtimeMs: number}} b
 * @returns {number}
 */
function byAgeThenName(a, b) {
  if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

/**
 * THE VERDICT — pure, total, deterministic.
 *
 * @param {{name: string, mtimeMs: number}[]} entries what the shell really listed
 * @param {{now: number, maxAgeMs: number, maxEphemeral?: number, maxDurable?: number}} options
 * @returns {{remove: string[], expired: string[], overflow: string[], unclassified: string[]}}
 *
 * ⚠️ Returns the NAMES, never a count: a cleaner is judged on what it removes.
 * ⚠️ `unclassified` is not a leftover, it is a MEASUREMENT: every `.json` in
 *    `state/` that belongs to no declared class. Nothing in this repo detected
 *    an UNDECLARED disk writer; a gate reading this list on a real state
 *    directory turns that blindness into a red.
 */
function planEviction(entries, options) {
  // ⚠️ THE CAST IS THE CONTRACT, WRITTEN RATHER THAN IMPLIED. `options || {}`
  //    widens to `{}` for the checker, which then refuses every key the JSDoc
  //    above declares — and `check:types` exists precisely to refuse a JSDoc
  //    that lies. Naming the shape here is what keeps the two in agreement.
  const o = /** @type {{now?: number, maxAgeMs?: number, maxEphemeral?: number, maxDurable?: number}} */ (
    options || {}
  );
  const now = o.now;
  const maxAgeMs = o.maxAgeMs;
  const maxEphemeral = o.maxEphemeral === undefined ? MAX_EPHEMERAL : o.maxEphemeral;
  const maxDurable = o.maxDurable === undefined ? MAX_DURABLE : o.maxDurable;

  // 🛑 A NAMED REFUSAL, NEVER A SILENT NO-OP. Without a usable bound this
  //    function would return an empty list and look exactly like a healthy
  //    eviction on a healthy disk — trap ② with extra steps. The caller is
  //    fail-open, so the cost of this throw is one uncollected sweep; the cost
  //    of the silence would be an eviction nobody knows is dead.
  if (!(maxAgeMs > 0)) {
    throw new Error('state-eviction: maxAgeMs must be > 0 — derive it with ageBound(deadline.DEFAULT_MS)');
  }

  const expired = [];
  const unclassified = [];
  const ephemeral = [];
  const durable = [];

  for (const e of entries) {
    const kind = classify(e.name);
    if (kind === null) {
      if (e.name.endsWith('.json')) unclassified.push(e.name);
      continue;
    }
    // ⚠️ AGE FIRST, and it applies to the two classes whose death OUR OWN timer
    //    decides. `>=` and not `>`: the bound is the instant from which no
    //    reader can exist, so that instant already qualifies.
    if (kind !== 'durable' && now - e.mtimeMs >= maxAgeMs) {
      expired.push(e.name);
      continue;
    }
    // A `.tmp` younger than the bound may belong to a LIVE writer: it is never
    // touched by the count pass. Only its age can condemn it.
    if (kind === 'ephemeral') ephemeral.push(e);
    if (kind === 'durable') durable.push(e);
  }

  const overflow = [];
  collectOverflow(ephemeral, maxEphemeral, overflow);
  collectOverflow(durable, maxDurable, overflow);

  const remove = expired.concat(overflow);
  remove.sort();
  expired.sort();
  overflow.sort();
  unclassified.sort();
  return { remove, expired, overflow, unclassified };
}

/**
 * THE COUNT CEILING — the coldest go, and that is the whole algorithm.
 * ⚠️ A COUNT IS NOT AN INFERENCE ABOUT DEATH: we never claim the evicted file is
 *    finished, we state that keeping more than N is beyond the declared budget.
 *    Losing a durable scope costs one extra delivery; losing a live plan costs a
 *    re-decision, which is why the ceilings sit far above any real concurrency.
 * @param {{name: string, mtimeMs: number}[]} bucket
 * @param {number} ceiling
 * @param {string[]} out
 */
function collectOverflow(bucket, ceiling, out) {
  // ⚠️ NO `if (bucket.length <= ceiling) return;` GUARD, AND THAT IS DELIBERATE:
  //    the loop below already does nothing when the surplus is zero or negative,
  //    so the guard would be REDUNDANT — i.e. an EQUIVALENT mutant by
  //    construction (`<=` → `<` changes no output), hence an eternal survivor.
  //    A redundant guard is avoided, never tested.
  bucket.sort(byAgeThenName);
  const surplus = bucket.length - ceiling;
  for (let i = 0; i < surplus; i += 1) out.push(bucket[i].name);
}

module.exports = {
  planEviction,
  classify,
  ageBound,
  byAgeThenName,
  EPHEMERAL_PREFIX,
  DURABLE_PREFIXES,
  DEADLINE_MULTIPLE,
  MAX_DURABLE,
  MAX_EPHEMERAL,
};
