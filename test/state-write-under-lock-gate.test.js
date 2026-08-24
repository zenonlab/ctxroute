// ═══════════════════════════════════════════════════════════════════════
// STATE WRITE UNDER LOCK — the queue invariant stops being carried by prose
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-20, audit of work item 58). `emission.md` states
//    "`emettre` IS CALLED UNDER LOCK" — and NOTHING checked it. The writer
//    (`emission-core.js`) does not take the lock itself: it is safe only because BOTH
//    of its callers happen to wrap it. That is an invariant held by the CALLER, the
//    exact shape this repo has already paid for twice (`keys` ㊿, the lockless
//    fallback). And `emission-core.js` is BY DESIGN the layer every future emitter
//    crosses ⇒ the third emitter writes the queue unlocked, in silence.
//
// 🔑 WHAT WORK ITEM 58 ACTUALLY MEASURED, and it settles the first question:
//    **the cross-process lock MUST exist.** Reading the critical section shows it is
//    not a per-doc counter (which would decompose into independent files and make the
//    lock pointless) but a LEADER ELECTION plus a memoized plan: among N parallel
//    frame processes, ONE decides and writes, the others read its plan back. That is
//    shared truth by construction. And it already uses the OS primitive (atomic
//    `mkdir`), so the "never reimplement what the OS provides" doctrine is satisfied.
//
// ⚠️ SCOPE = THE WRITES, never the reads. Reading has never needed the lock (sealed
//    elsewhere: putting `{}` back on the lockless path was a production bug).
// ⚠️ DERIVED, not a list: the rule matches the SHAPE of a write, so a writer added
//    tomorrow is covered the day it is written. The only exemption is declared below
//    and its truth is guaranteed BY THE SAME SCAN (see EXEMPTIONS).
// ⚠️ ANTI-INERT: a witness in the REAL form must be detected, and the same call INSIDE
//    a lock must NOT be — a gate that flags everything gets disarmed as fast as one
//    that flags nothing.
// ⚠️ `ast-grep` HONOURS `.gitignore` (3rd blindness measured 06/08/2026) ⇒ witnesses
//    are written into the OS tmpdir, never into the repository.
// 🛑 Call the binary DIRECTLY: `shell: true` is forbidden in every layer here, and
//    `npx` goes to the network from a tmpdir.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.join(import.meta.dirname, '..');

// 🛑 THE ROOTS THIS GATE JUDGES. They are what makes a `guarded-by-scan`
//    exemption TRUE rather than hopeful: such an exemption claims "every caller
//    of my write reaches it from inside a lock", and that claim is only
//    re-established if the scan actually LOOKS everywhere a caller can live.
//    Cell ① below derives the real writer surface from the whole repository and
//    turns RED the day a state write appears outside these roots.
const ROOTS = ['src', 'tools'];
/** Where a state write is allowed to live outside `ROOTS` — suites drive stores
 *  directly, on purpose, and locking them would test the test. */
const OUT_OF_JUDGEMENT = 'test/';

// 🛑 THE TWO KINDS OF EXEMPTION, AND THE DISTINCTION IS THE WHOLE POINT OF THIS
//    TABLE (2026-08-23). It is not documentary: each kind names the MACHINE that
//    re-reads its condition, and an exemption may not exist without one.
//    · `guarded-by-scan` — the reason is RE-ESTABLISHED BY THIS SCAN ITSELF
//      ("my callers are matched here, so an unlocked one turns this gate red").
//      Safe, because nothing outside can make it stale silently — provided the
//      scan covers the whole writer surface, which is cell ①.
//    · `unwired-relic` — the reason asserts a fact about ANOTHER FILE (this
//      module is not wired, so nothing calls it). That kind is a BOMB unless a
//      machine re-reads that other file, which is cell ②: the wiring manifest
//      and the import graph, both DERIVED.
// 🔴 WHY THE TAXONOMY EXISTS AT ALL. The daemon used to be exempted as "nothing
//    to serialise against — one process, one thread", WITH its own expiry clause
//    written in bold: *true only while the daemon owns its state alone*. The
//    clause FIRED on 2026-08-22, when the daemon became a write-through cache
//    onto the files a spawned peer locks, and NOTHING WENT RED. A human reading
//    the routes found it a day later, after a race measured at 209 lost
//    read-modify-writes out of 800. **An exemption whose truth depends on a fact
//    elsewhere needs a judge that re-reads that fact** — so a reason of that
//    shape must now name its judge, or it cannot be written down.
const KINDS = ['guarded-by-scan', 'unwired-relic'];

// 🛑 EXEMPTION = a writer whose lock is held by its CALLERS, with the reason.
//    Its truth is not taken on trust: the rule ALSO matches `.emit(`, the module's
//    only entry point, so a call site outside a lock turns this same gate RED.
const EXEMPTIONS = {
  'src/emission-core.js': { kind: 'guarded-by-scan', reason:
    'Queue writer. It is the layer EVERY emitter crosses, so it cannot take the lock '
    + 'itself without double-locking its callers, which already hold it around the '
    + 'read-then-rewrite of the queue. Guaranteed by the `.emit(` half of this rule.' },
  // ⚠️ FLAGGED ON AN INDIRECTION, and that is the rule working as intended: the write
  //    hides behind `const saveState = (...) => store.saveState(...)`, so its safety
  //    can no longer be read at the call. Both real call sites ARE inside this file's
  //    own `withLock`. RELIC besides: unwired since 17/07/2026, kept only as the
  //    differential oracle — rewiring it would mean double injection, and the doctor
  //    screams. 🛑 NEVER use this entry as a precedent for LIVE code: an alias that
  //    hides a write is exactly what the gate exists to surface.
  // 🛑 THE ONLY `unwired-relic` ENTRY, AND THE ONLY REASON HERE THAT ASSERTS A
  //    FACT ABOUT ANOTHER FILE. Cell ② re-reads BOTH halves of that fact from
  //    the code: the wiring manifest must not declare this module as a consumer,
  //    and nothing in the judged roots may import it. The day either changes, the
  //    excuse dies loudly instead of quietly excusing a live unlocked writer.
  'src/hooks/legacy-mcp-inject.js': { kind: 'unwired-relic', reason:
    'Unwired relic (differential oracle). The write is behind an alias; its two call '
    + 'sites both sit inside the withLock of that same file.' },
  // ⚠️ SHARED CORE: the increment rule lives here so the spawned shell and the daemon
  //    cannot read one store-shape rule in two places and drift apart (paid twice —
  //    ㊱, ㊳). It therefore cannot take the lock itself without double-locking the
  //    shell, which already wraps this call.
  'src/turn-core.js': { kind: 'guarded-by-scan', reason:
    'The turn counter\'s read-modify-write, shared by the spawned shell and the daemon '
    + 'so one store-shape rule is not read in two places. BOTH callers now wrap it in '
    + 'their own withLock; taking it here would double-lock them.' },
  // 🔴 THE ENTRY THAT USED TO SIT HERE WAS `src/hooks/http-server.js`, AND ITS REASON
  //    WAS THE THIRD KIND — "the daemon writes with NO lock because there is NOTHING TO
  //    SERIALISE AGAINST: one process, one thread, one connection at a time". It is
  //    GONE, and its removal is the whole change of 2026-08-23, so read why before
  //    reintroducing anything shaped like it.
  //    That reason carried its own expiry clause — "TRUE ONLY WHILE THE DAEMON OWNS ITS
  //    STATE ALONE" — and the clause had ALREADY FIRED on 2026-08-22, the day the daemon
  //    became a WRITE-THROUGH CACHE: it now writes the durable class onto the very files
  //    a spawned client reads and rewrites under the cross-process lock. The kernel
  //    serialises the daemon's OWN callers; it serialises NOTHING against a peer process.
  // 📐 MEASURED, never argued: two real processes doing read-modify-write on one
  //    `remainder-` key, one daemon-shaped and lock-less, one spawned and locked, lost
  //    **209 updates out of 800**; the control with BOTH writers locked lost 0-1 of 800.
  //    The write is atomic (tmp + rename) so nothing was ever corrupt — what vanished is
  //    a RECORDED DELIVERY, i.e. a document delivered twice, in silence.
  // 🛑 THE LESSON IS THE EXPIRY CLAUSE, NOT THE LOCK. An exemption whose truth depends on
  //    a fact elsewhere in the system goes stale WITHOUT ANYTHING GOING RED: the clause
  //    was written, honestly and in bold, and it still took a human reading the daemon's
  //    routes to notice it had fired. Prefer an exemption the SCAN itself keeps true.
  // ⚠️ THE WRITE-THROUGH OF THE DURABLE CLASS. This is the "caller holds the lock" kind,
  //    and it is guaranteed BY THIS SAME SCAN rather than trusted: the only callers of
  //    `memory-store.saveState` are `pretool-core` (matched here, inside its withLock),
  //    `emission-core` and `turn-core` (both exempted above, both entered from inside a
  //    caller's withLock — the daemon's `/emit` and `/turn` routes take the REAL lock,
  //    at the SAME address as the spawned peers, since 2026-08-23).
  // 🛑 The address comes from `store-resolve` on both sides. A lock only serialises
  //    writers that take the SAME name: two spellings are two locks, and two locks are
  //    no lock at all — silently, with every suite green.
  // ⚠️ ITS `purge` IS NOW MATCHED TOO (2026-08-23): the rule learned the shape of
  //    a DESTRUCTIVE state write (`.purge(` / `.purgeByPrefix(`) the day the
  //    PreCompact sweep turned out to be the last durable writer with no lock.
  //    Both its callers — the reset shell and the daemon's `/purge` route — hold
  //    the address `store-resolve.lockDirForKey` hands them, and they are matched
  //    by this same scan.
  'src/memory-store.js': { kind: 'guarded-by-scan', reason:
    'Write-through of the durable class onto `session-store`. Every caller reaches it '
    + 'from inside a withLock — pretool-core directly, emission-core and turn-core '
    + 'through callers that hold it on both the spawn lane and the daemon. Guaranteed by '
    + 'the other halves of this same scan, not taken on trust.' },
};

const RULE = `
id: state-write-outside-lock
language: javascript
severity: error
rule:
  any:
    - pattern: $O.saveState($$$A)
    - pattern: $O.emit($$$A)
    - pattern: $O.purge($$$A)
    - pattern: $O.purgeByPrefix($$$A)
  not:
    inside:
      pattern: withLock($$$W)
      stopBy: end
`;

const CONTROL = `
id: any-state-write
language: javascript
severity: error
rule:
  pattern: $O.saveState($$$A)
`;

// 🔑 THE SURFACE PROBE OF CELL ①. Same shapes as `REGLE`, WITHOUT the lock
//    condition, run over the WHOLE repository: it answers "where does a state
//    write live?", never "is it safe?". Two rules for one question would drift,
//    so the shapes are the only thing repeated and they are repeated ON PURPOSE
//    — a `not:` clause here would make the cell blind to exactly what it hunts.
const WIDE_CONTROL = `
id: any-state-write-anywhere
language: javascript
severity: error
rule:
  any:
    - pattern: $O.saveState($$$A)
    - pattern: $O.emit($$$A)
    - pattern: $O.purge($$$A)
    - pattern: $O.purgeByPrefix($$$A)
`;

// 🔑 THE IMPORT PROBE OF CELL ②. A relic is only a relic while NOBODY calls it,
//    and that is a fact about OTHER files — so it is read out of them, by AST.
const REQUIRE = `
id: any-require
language: javascript
severity: error
rule:
  pattern: require($P)
`;

function binary() {
  const itemName = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(REPO, 'node_modules', '@ast-grep', 'cli', itemName);
  if (!fs.existsSync(bin)) throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. `npm ci`.');
  return bin;
}

function scan(rule, target) {
  // ⚠️ `ast-grep scan` EXITS NON-ZERO as soon as it matches an `error` rule — that is
  //    its contract, not a failure. Letting `execFileSync` throw would turn every
  //    FINDING into a crash, and the gate would report "tool broken" instead of the
  //    defect. We read stdout in both cases and let a truly malformed output fail at
  //    `JSON.parse`, loudly.
  let out;
  try {
    const targets = Array.isArray(target) ? target : [target];
    out = execFileSync(binary(), ['scan', '--inline-rules', rule, ...targets, '--json=compact'], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    if (typeof e.stdout !== 'string') throw e;
    out = e.stdout;
  }
  return JSON.parse(out.trim() || '[]');
}

const rel = (f) => f.split(path.sep).join('/');

test('ANTI-VACUITY — the scan really reads the sources', () => {
  // 🛑 Without this floor, a broken path or a gitignored `src/` makes the gate green
  //    while measuring NOTHING — the repository's worst defect.
  const all = scan(CONTROL, ROOTS);
  assert.ok(all.length >= 5,
    `only ${all.length} state writes seen in ${ROOTS.join(', ')} — the scan is broken, `
    + 'not the repository');
});

test('ANTI-INERT — the rule sees a REAL unlocked write, and stays silent on a locked one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-lockgate-'));
  try {
    // Forms taken from the REAL code, never a textbook case.
    const nu = path.join(dir, 'nu.js');
    fs.writeFileSync(nu, 'function f(){ store.saveState(PREFIX, sessionId, r.state); }\n');
    assert.strictEqual(scan(RULE, nu).length, 1,
      'the rule does not see an unlocked write — it would certify instead of protect');

    const sous = path.join(dir, 'sous.js');
    fs.writeFileSync(sous,
      'function f(){ withLock(dir, () => { store.saveState(PREFIX, sessionId, r.state); }); }\n');
    assert.deepStrictEqual(scan(RULE, sous), [],
      'false positive on a write already under lock — a noisy gate gets disarmed, then bypassed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('58 — no state write escapes the cross-process lock', () => {
  const offenders = scan(RULE, ROOTS)
    .map((h) => ({ f: rel(h.file), l: h.range.start.line + 1, t: h.lines.trim() }))
    .filter((h) => !(h.f in EXEMPTIONS));
  assert.deepStrictEqual(offenders, [],
    'STATE WRITTEN OUTSIDE `withLock` — two crossing processes lose part of the queue,\n'
    + 'and the loss is SILENT (the doc said this was true; only this gate makes it true).\n'
    + 'Wrap the write, or declare the file in EXEMPTIONS with the reason its callers hold the lock.\n'
    + offenders.map((h) => `  ${h.f}:${h.l} ${h.t}`).join('\n'));
});

test('58 INVERSE — an exemption that has become pointless is RED', () => {
  // 🛑 A stale exemption is a hole reopened in silence: it would excuse a FUTURE
  //    unlocked write in a file that no longer needs the excuse.
  const vus = new Set(scan(RULE, ROOTS).map((h) => rel(h.file)));
  assert.ok(vus.size > 0, 'the scan saw NO unlocked write at all — it measured nothing');
  for (const f of Object.keys(EXEMPTIONS)) {
    assert.ok(vus.has(f),
      `\`${f}\` is exempted and writes NOTHING outside a lock any more — remove the entry.`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// THE EXEMPTIONS THEMSELVES ARE JUDGED — a permit needs a machine, not a reason
// ═══════════════════════════════════════════════════════════════════════

test('⓪ every exemption names the MACHINE that re-reads its condition', () => {
  const itemNames = Object.keys(EXEMPTIONS);
  // 🛑 ANTI-VACUITY: an empty table would make every cell below pass by
  //    measuring nothing, which is this repository's worst defect.
  assert.ok(itemNames.length > 0, 'EXEMPTIONS is empty — the cells below judge nothing');
  for (const f of itemNames) {
    const e = EXEMPTIONS[f];
    assert.ok(e && typeof e === 'object' && typeof e.reason === 'string' && e.reason.length > 0,
      `\`${f}\`: an exemption is { kind, reason } — a bare string carries no judge.`);
    assert.ok(KINDS.includes(e.kind),
      `\`${f}\`: kind ${JSON.stringify(e.kind)} is not one of ${KINDS.join(' | ')}.\n`
      + 'A NEW kind needs a NEW cell that re-reads its condition from the code. That is the '
      + 'whole lesson of 2026-08-23: the daemon\'s exemption stated its own expiry clause, in '
      + 'bold, and went stale with nothing going red.');
    assert.ok(fs.existsSync(path.join(REPO, f)), `\`${f}\` is exempted and does not exist.`);
  }
});

test('① `guarded-by-scan` is only true while the scan sees the WHOLE writer surface', () => {
  // 🔑 THE MACHINE BEHIND THAT KIND. Such an exemption says "my callers are
  //    matched here, so an unlocked one turns this gate red" — which is a claim
  //    about files this scan MIGHT NOT BE LOOKING AT. So the surface is derived
  //    from the whole repository, not declared: a state write appearing in a root
  //    nobody scans makes every one of those exemptions quietly hopeful again.
  const everywhere = scan(WIDE_CONTROL, '.').map((h) => rel(h.file));
  assert.ok(everywhere.length >= 10,
    `only ${everywhere.length} state writes seen in the whole repository — the traversal is `
    + 'broken (ast-grep honours .gitignore), so this cell measured nothing');
  const roots = new Set(everywhere.map((f) => f.split('/')[0]));
  assert.ok(roots.size >= 2,
    `the repository-wide scan only ever reached ${[...roots]} — it did not traverse past one `
    + 'directory, so it cannot testify about the surface');

  const outside = [...new Set(everywhere.filter(
    (f) => !ROOTS.some((r) => f.startsWith(`${r}/`)) && !f.startsWith(OUT_OF_JUDGEMENT)))];
  assert.deepStrictEqual(outside, [],
    'A STATE WRITE LIVES OUTSIDE THE JUDGED ROOTS.\n'
    + `Judged: ${ROOTS.join(', ')} — outside judgement: ${OUT_OF_JUDGEMENT}\n`
    + 'Every `guarded-by-scan` exemption claims its callers are matched by this gate. A writer\n'
    + 'the gate never looks at breaks that claim for ALL of them at once, in silence.\n'
    + 'Add the root to ROOTS, or move the writer.\n' + outside.map((f) => `  ${f}`).join('\n'));
});

test('② `unwired-relic` — the machine re-reads the OTHER file, twice', () => {
  const relics = Object.keys(EXEMPTIONS).filter((f) => EXEMPTIONS[f].kind === 'unwired-relic');
  // 🛑 ANTI-VACUITY: if the kind is declared it must be exercised. Zero relics is
  //    legitimate ONLY if no exemption claims to be one.
  assert.equal(relics.length, Object.values(EXEMPTIONS).filter((e) => e.kind === 'unwired-relic').length,
    'internal: the relic set was computed twice and disagrees with itself');
  if (relics.length === 0) return;

  // ⓐ THE WIRING MANIFEST — read, never remembered. `wiring.json` is the SINGLE
  //    source the harness declarations are generated from, so a module listed
  //    there is EXECUTED, relic or not.
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'wiring.json'), 'utf8'));
  const cables = (manifest.consumers || []).map((c) => c.module);
  assert.ok(cables.length >= 2,
    `the manifest declares ${cables.length} consumers — it was not read properly, so this half `
    + 'of the check is vacuous');

  // ⓑ THE IMPORT GRAPH — a relic nobody wires can still be REQUIRED by live code.
  const imports = new Set(scan(REQUIRE, ROOTS).map((h) => h.text || h.lines || ''));
  assert.ok(imports.size >= 10,
    `only ${imports.size} require() calls found across ${ROOTS.join(', ')} — the import scan is `
    + 'broken, so this half of the check is vacuous');

  for (const f of relics) {
    assert.ok(!cables.includes(f),
      `\`${f}\` is exempted as an UNWIRED RELIC and \`wiring.json\` declares it as a consumer.\n`
      + 'It is LIVE. The excuse must go, and its write must take the lock.');
    const base = path.basename(f, '.js');
    const importers = [...imports].filter((t) => new RegExp(`['"][^'"]*/${base}['"]`).test(t));
    assert.deepStrictEqual(importers, [],
      `\`${f}\` is exempted as an UNWIRED RELIC and something imports it:\n`
      + importers.map((t) => `  ${t}`).join('\n')
      + '\nA relic with a caller is not a relic — the caller must hold the lock, or the excuse '
      + 'must be re-stated as `guarded-by-scan` and proved by this scan.');
  }
});
