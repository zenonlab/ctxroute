// ═══════════════════════════════════════════════════════════════════════
// PreToolUse GATE CORE — body COMMON to all harnesses (single source).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ EXTRACTED from doc-inject.js on 19/07/2026 for the Codex port: the
//    orchestration logic (collection → decision → format) is THE SAME on all
//    harnesses whose PreToolUse payload exposes session_id/tool_name/tool_input
//    (MEASURED contract: Claude Code + Codex CLI ≥ 0.144). Duplicating it per
//    shell = the drift this framework fights. ONLY the `emit` (the harness's
//    OUTPUT dialect) varies — it is INJECTED by the calling shell.
//
// ⚠️ THE CORE NEVER KILLS THE PROCESS (06/08/2026). It RETURNS when there is
//    nothing to emit; it is the SHELL that decides to exit. It used to call
//    `process.exit(0)` in 4 places: the process life cycle is a
//    shell decision, exactly like the output dialect — a shared core
//    that arrogates to itself the death of the process is the SAME layer leak as
//    the transport orchestrated in a single emitter (⑯). Concrete side effect:
//    `run()` was untestable and uncallable from another context.
// ⚠️ CONTRACT emit(decision, fullDoc, systemMessage): called at most ONCE,
//    MUST terminate the process (exit 0) — it is the shell that writes it.
//    `decision ∈ 'none' | 'allow' | 'deny'` — THREE values, never four.
// 🛑 THIS COMMENT STILL ANNOUNCED `'ask'` (corrected on 09/08/2026), a word
//    REMOVED from the framework on 05/08/2026 and whose reintroduction is
//    FORBIDDEN (human escalation = anti 0-human · absent from Codex · `enforce`
//    covers the need). The anti-return is sealed by tests, but the header of the
//    shared core — the text read first by whoever ports the framework onto a
//    new harness — was teaching the banned word. A doc is not stacked up: when
//    a word dies, we REWRITE the places that cite it.
//
// ⚠️ This module is a SHARED SHELL (I/O: lock, store, config) — never
//    mutated by Stryker, never imported by the pure engine. The business
//    invariants live in gate.js/sources/*; NEVER bring any of them back here.
//
// ⚠️ Full FAIL-OPEN (unreadable config/corpus/state → exit 0 without stdout),
//    EXCEPT the direction of the injection on a LOCK failure: we then decide
//    WITHOUT state (state = {}) rather than keeping silent — keeping silent on
//    contention = silent regression.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const lib = require('./lib-pure');
const gate = require('./gate');
const { ADAPTERS } = require('./source-adapters');
// ⚠️ SHARED COLLECTION (31/07/2026): the gate and `explain.js` MUST collect
//    through the SAME code, otherwise the introspection tool would end up
//    describing an engine that does not exist — the bug it is supposed to
//    prevent. `collect-core` is the single source; NEVER rebuild the
//    accumulator here.
const { collectAll, loadConfig } = require('./collect-core');
// FRAME budget (31/07/2026): bounds what goes out, announces what does not fit.
const budget = require('./budget');
// ⚠️ EMISSION LAYER (05/08/2026, REFACTOR-PLAN ⑯) — SINGLE SOURCE of the
//    transport (queue + splitting). It lived HERE, which made it
//    optional for the OTHER emitters: `session-inject.js` did not go
//    through it and therefore went out without a seal or chunking. NEVER
//    bring the queue or the splitting back into this orchestration — the gate
//    `emission-core-gate.test.js` requires every emitter to go through the module.
const emission = require('./emission-core');
const lockModule = require('./lock');
const paths = require('./paths');
const store = require('./session-store');

// Per-session state, prefix 'doc-seen-' (dedup by DOC) — cf session-store.js.
const STORE_PREFIX = 'doc-seen-';
// ⚠️ PLAN MEMOIZED PER INVOCATION (03/08/2026) — DISTINCT prefix mandatory.
//    Without it, multi-frame mode would be FALSE: the N processes each call
//    `gate.decide`, which WRITES the state. The first one consumes the `once`
//    docs ⇒ the following ones decide "nothing to inject" ⇒ frames 2..N EMPTY.
//    Here, the first to arrive decides and files its decision away; the others
//    READ IT BACK. The splitting itself is pure and deterministic: each one
//    recomputes it and emits only its index. Purged by ctxroute-reset.js.
const PLAN_PREFIX = 'plan-';
// ⚠️ THE EMISSION QUEUE HAS LEFT THIS FILE (05/08/2026, REFACTOR-PLAN ⑯).
//    It now lives in `emission-core.js`, the layer that EVERY emitter
//    goes through. Keeping it here made it optional for the other emitters
//    — that is exactly the defect that left the SESSION gate without transport.
//    NEVER redeclare a queue prefix here.
// TURN counter (turn-count.js gate, UserPromptSubmit) — distinct prefix.
const TURN_PREFIX = 'turn-count-';

// ⚠️ `loadConfig` lived HERE as a copy — moved into collect-core.js on
//    31/07/2026 (same fail-open behaviour: config absent = defaults,
//    framework ACTIVE). Do not reintroduce it.

/**
 * Effective emission budget, in characters. CASCADE:
 *   ① FRAMEWORK default (`budget.DEFAULT_BUDGET`) — exists even without config or shell
 *   ② HARNESS limit, declared by the shell (`options.budget`)
 *   ③ global config (`budgetInjection`) — the operator may REDUCE, never exceed
 *
 * ⚠️ The `Math.min` is NOT a convenience: the harness limit is PHYSICAL
 *    (beyond it, the content is filed away in a file and the agent only sees a
 *    preview). Letting a config exceed it would make the truncation silent
 *    at the very moment when the operator believes they are loosening the
 *    constraint.
 * ⚠️ No harness value is written here: `porte-core` is shared by
 *    ALL harnesses. The number comes from the shell, always.
 */
function budgetFor(config, options) {
  // ⚠️ `Infinity` IS a valid value — "this harness bounds nothing". Filtering
  //    it out with `Number.isFinite` alone made it fall back to the FLOOR of
  //    8 000 while the pipe accepted everything: a skill went out in 7 chunks
  //    for nothing, SILENTLY, all green (measured on Codex on 05/08/2026).
  const b = options ? options.budget : undefined;
  const declare = b === Infinity || (Number.isFinite(b) && b > 0);
  const duHarnais = declare ? b : budget.DEFAULT_BUDGET;
  const c = config && config.budgetInjection;
  if (Number.isFinite(c) && c > 0) return Math.min(duHarnais, c);
  return duHarnais;
}

// Common body. `data` = already parsed stdin payload of the harness; `emit` =
// output dialect of the shell; `options.budget` = frame limit of the harness
// (optional — absent ⇒ framework default, so NO shell is broken).
// Any error = silent exit 0 (fail-open).
function run(data, emit, options) {
  try {
    // 🛑 WHO OWNS THE STATE IS AN ARGUMENT (2026-08-20). A spawned hook keeps the
    //    on-disk store and its cross-process lock; the DAEMON owns its state in
    //    memory and needs no lock at all — the KERNEL serialises its callers
    //    (one connection delivered at a time onto a single-threaded loop), so
    //    the mutual exclusion the lock simulates already exists, for free, above
    //    us. Everything the two have in common stays in ONE code path.
    // 🔴 REFUSED: an environment variable. They are INHERITED by children, so a
    //    single leak would make a spawned hook read an empty memory instead of
    //    the real state — every `once` delivered again, silently, with no error
    //    anywhere. An ambient switch on a state backend manufactures silent bugs.
    // ⚠️ Defaults are the historical modules ⇒ every existing caller is
    //    byte-identical and the differentials stay green untouched.
    const st = (options && options.store) || store;
    // ⚠️ THE LOCAL NAME STAYS `withLock`, ON PURPOSE. `state-write-under-lock-gate`
    //    proves that no state write escapes the critical section by matching the
    //    SHAPE of the call site. Renaming it to something prettier made the gate
    //    blind — it went red immediately, which is precisely its job: "an alias
    //    that hides a write is flagged". A guardrail is not worked around by
    //    choosing another identifier.
    const withLock = (options && options.withLock) || lockModule.withLock;
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    // ⚠️ SCOPE PER AGENT (19/07/2026): the once/smart state is keyed by
    // lib.scopeId(session_id, agent_id) — NEVER session_id alone. session_id
    // is SHARED between master and sub-agents (harness contract): keying on it
    // = the 1st agent consumes the `once` and all the following sub-agents
    // receive NOTHING (hole proven 19/07/2026). Harness WITHOUT agent_id (Codex):
    // scopeId returns the simple key — shared state, absorbed by construction.
    const sessionId = lib.scopeId(data.session_id, data.agent_id);
    const config = loadConfig();

    // Global switch — same semantics on all harnesses.
    if (!lib.isFrameworkEnabled(config)) return;

    // ── COLLECTION (collect-core.js → source-adapters.js registry) ──
    // Each adapter puts its matched docs + decls/bodies/labels into
    // the accumulator. Registry order = concatenation order.
    // `cwd` = COMMON field of the hook contracts MEASURED on both harnesses
    // (Claude Code: common field of every payload · Codex CLI: base payload
    // session_id/transcript_path/cwd/hook_event_name). Consumed
    // ONLY by the skill source, FAIL-SOFT: absent → behaviour
    // from before. The file/MCP sources IGNORE it — protect-files parity.
    const payload = { toolName, toolInput, cwd: data.cwd };
    const acc = collectAll(config, payload);
    const { matched, decls, bodies } = acc;

    // TURN counter read ONLY if a matched doc is in driftUnit
    // 'turn' (gate.driftUnitForDoc = the single cascade, never copied here):
    // zero added disk read for a 100 % 'tool' fleet (perf parity).
    // Read-only outside the lock: the counter is monotonic, written by the
    // turn-count gate under ITS lock. gate.decide CONTRACT: always an integer.
    let turnCount = 0;
    // ⚠️ `acc.owner[d]` IS MANDATORY — 3 arguments, never 2 (bug fixed on
    //    09/08/2026). Without the source, stage ② of the cascade
    //    (`defaults.{source}.driftUnit`) is INVISIBLE here while
    //    `gate.decide` SEES it: the gate concluded "tool unit", did not read
    //    the counter and passed 0, while the gate measured in
    //    TURNS ⇒ zero elapsing forever ⇒ a `smart` doc degenerated into
    //    `once`, SILENTLY. Sealed by `cascade-source-gate.test.js`.
    if (matched.some((d) => gate.driftUnitForDoc(config, decls[d], acc.owner[d]) === 'turn')) {
      const t = st.loadState(TURN_PREFIX, sessionId).turns;
      if (Number.isInteger(t)) turnCount = t;
    }

    // [source: …] — vocabulary laid down by EACH source (acc.labels):
    // file = '.claude/hooks/docs/…', MCP = 'docs/mcp/…'. Parity preserved.
    // ⚠️ ORDINAL `DOC i/T` — THE INTENDED ORDER MUST REMAIN KNOWABLE (08/08/2026).
    //    `rank` orders the docs (loader.js) and the concatenation preserves that
    //    order — but the N frames arrive OUT OF ORDER, so the place
    //    of a document was UNOBSERVABLE. `CHUNK j/m` reassembles ONE document;
    //    this reassembles the WHOLE. It is the symmetric hole, and it closes here.
    // 🛑 HERE AND NOWHERE ELSE. The ordinal is IDENTITY (who I am,
    //    where I place myself), never TRANSPORT (how I am split). Putting
    //    it in `budget.js` was TRIED then CANCELLED on 08/08/2026: it
    //    required TWO header functions there (whole doc + chunk) hence two
    //    places that diverge, and the header cost ~35 chars per document
    //    (repeated label) instead of ~12 here — measured by the BOUNDARY test, which
    //    saw the density of a frame drop. The tag already exists: we enrich it.
    // ⚠️ SILENT WITH A SINGLE DOCUMENT (T < 2): an ordinal on a single document
    //    teaches NOTHING, and this silence keeps the protect-files parity to the
    //    BYTE (single-doc case = the differential oracle). NEVER emit it at T=1.
    // 🛑 THE ORDINAL GOES AFTER THE CLOSING BRACKET, NEVER INSIDE.
    //    `[source: <path>]` is a CONTRACT TOWARDS THE AGENT: it reads there the
    //    EXACT path to go and UPDATE THE DOC when it discovers
    //    that it is wrong or incomplete. That is the loop that makes the
    //    corpus self-repairing — breaking it would make every doc non-editable.
    // ⚠️ TRIED THEN CANCELLED ON 08/08/2026: slipped INSIDE, the capture
    //    of `gate.js` (`[^\]]+` between `source:` and `]`) returned
    //    "<path> — DOC 2/5" — an INVALID path, and the badge with it.
    //    🔴 538 TESTS WERE GREEN: none asserted the content of the tag in
    //    multi-document mode. It is the MAINTAINER who saw it, not the machine.
    //    ⇒ a test now seals this contract (see doc-inject.test.js).
    const rang = (i, t) => (t < 2 ? '' : ' [DOC ' + (i + 1) + '/' + t + ']');
    const segmentsPour = (docs) =>
      docs.map((doc, i) => ({
        id: doc,
        text: (bodies[doc] || '').trim()
          + '\n[source: ' + acc.labels[doc] + ']' + rang(i, docs.length),
        label: acc.labels[doc],
      }));
    const budgetMax = budgetFor(config, options);

    // ── MULTI-FRAME TRANSPORT (provided by the SHELL, never read here) ──
    // ⚠️ EXTENSION CONTRACT §7: the core reads NO harness field.
    //    `invocationId` (Claude Code: `tool_use_id`) is passed by the shell
    //    like the budget. A harness that does not have one ⇒ `fragmente` false ⇒
    //    ONE frame, today's behaviour to the byte. Degradation, not breakage.
    const nbDeclare = options && Number.isInteger(options.nbFrames) && options.nbFrames >= 2 ? options.nbFrames : 1;
    const invocationId = options && typeof options.invocationId === 'string' ? options.invocationId : '';
    // ⚠️ Fragmentation requires BOTH: a multi-frame declaration AND an
    //    invocation identifier to share the decision. If one is missing ⇒
    //    we fall back ENTIRELY to the single frame — splitting included.
    //    Splitting without memoizing would produce frames decided separately:
    //    `once` docs consumed by the first, following frames empty.
    const fragmente = nbDeclare >= 2 && invocationId !== '';
    const nbFrames = fragmente ? nbDeclare : 1;
    const indice = fragmente && Number.isInteger(options.frame) && options.frame >= 1 ? options.frame : 1;

    // Critical section under lock (per-session state, dedup by doc). A 100 %
    // dumb corpus produces no write (changed=false) — perf parity.
    const lockDir = path.join(paths.stateDir(), `.lock-doc-${lib.sanitizeSessionId(sessionId)}`);
    // ⚠️ EVERYTHING GOES THROUGH THE EMISSION LAYER — never `budget.planFrames`
    //    directly from an emitter. `split` alone = REPLAY of an already decided
    //    splitting (memoized plan) or DEGRADED path without a lock; the normal
    //    path is `emission.emit`, which touches the queue.
    const split = (segs) => emission.split(segs, budgetMax, nbFrames);
    // Identity of a document: single source in `budget.js` (the chunks
    // carry `<doc>#<j>`). It lived here as a local copy — it is a rule of the
    // TRANSPORT, not of this orchestration.
    const baseId = budget.baseId;
    let res = withLock(lockDir, () => {
      // ⚠️ RE-READING THE PLAN — the heart of multi-frame mode. The N processes
      //    are PARALLEL and cannot talk to each other: only one decides (and
      //    writes the state), all recompute the SAME splitting by pure
      //    determinism. Any of them may be the first — it does not matter.
      // ⚠️ Key PREFIXED BY THE SESSION (and not the invocation alone): that is
      //    what makes the plan purgeable by `ctxroute-reset.js`, which sweeps by
      //    session prefix. An orphan key would only be cleaned by the
      //    TTL GC — a silent piece of waste, exactly what we refuse.
      const clePlan = sessionId + '--inv-' + invocationId;
      const cache = fragmente ? st.loadState(PLAN_PREFIX, clePlan) : {};
      // ⚠️ THE PLAN MEMOIZES THE **SEGMENTS**, NO LONGER ONLY THE IDS (05/08/2026).
      //    Since the queue exists, the input of the splitting is no longer
      //    derivable from the ids alone: it mixes chunks INHERITED from previous
      //    actions with fresh docs. Processes 2..N must see EXACTLY what the
      //    first one saw — otherwise their frames no longer reassemble. NEVER go
      //    back to a cache of ids "to make it lighter": that would make the
      //    splitting non-reproducible, that is to say break multi-frame mode
      //    silently.
      if (Array.isArray(cache.segments)) {
        return { segments: cache.segments, decision: cache.decision, frames: split(cache.segments), filteredOut: cache.filteredOut || [] };
      }
      const state = st.loadState(STORE_PREFIX, sessionId);
      const r = gate.decide(config, decls, matched, state, turnCount, acc.owner, toolName);

      // ── EMISSION: queue first, fresh next, remainder persisted ──
      // ⚠️ THIS WHOLE MECHANISM LIVES IN `emission-core.js` (RFC 6455 order,
      //    dedup by document, unconditional write of the queue). It was WRITTEN
      //    HERE until 05/08/2026 — hence invisible and not reusable for
      //    the other emitters. NEVER reinstall it in this function:
      //    that would recreate the copy that ⑯ has just removed.
      const em = emission.emit({
        frais: segmentsPour(r.inject),
        budgetMax,
        nbFrames,
        indice,
        scopeId: sessionId,
        store: st,
      });
      const segments = em.segments;
      const frames = em.frames;

      // ⚠️ THE STATE RESTORATION LOOP FOR DEFERRED ITEMS WAS REMOVED HERE
      //    (05/08/2026). It "un-marked" a deferred doc so that the next action
      //    would re-decide it, because a deferred item was then LOST. That is
      //    no longer true: the deferred item is IN FLIGHT, the queue guarantees its
      //    arrival. Keeping it would produce the opposite of the intended goal —
      //    the doc would be both in the queue AND re-decided, hence delivered
      //    twice. The guarantee "never consumed without being delivered" has not
      //    disappeared: it has changed guardian, and its guardian is now sealed
      //    by a property.
      if (r.changed) st.saveState(STORE_PREFIX, sessionId, r.state);
      // ⚠️ `filteredOut` MEMOIZED with the plan: frames 2..N read the cache back
      //    and must see the SAME finding as the 1st (same reason as segments).
      if (fragmente) st.saveState(PLAN_PREFIX, clePlan, { segments, decision: r.decision, filteredOut: r.filteredOut });
      return { segments, decision: r.decision, frames, filteredOut: r.filteredOut };
    }, { fallback: null });
    // Lock unavailable → decide WITHOUT state (never keep silent, cf header).
    // ⚠️ NEITHER READING NOR WRITING THE QUEUE ON THIS PATH: without a lock, two
    //    processes could consume then rewrite the queue concurrently and
    //    lose part of it. So we degrade to fresh only — the old
    //    behaviour, never a corruption. The queue stays intact and leaves at the
    //    next action.
    if (!res) {
      // 🛑 THE STATE IS READ, IT IS NOT GUESSED. NEVER put `{}` back here:
      //    a `once` already delivered would be re-emitted on EVERY contention
      //    (orphan chunk in production, 07/08/2026). The lock serializes the
      //    WRITES — reading never needed it and has no side effect.
      //    We read, we decide, we write NOTHING. Detail: `gate.md`.
      const etatConnu = st.loadState(STORE_PREFIX, sessionId);
      const r = gate.decide(config, decls, matched, etatConnu, turnCount, acc.owner, toolName);
      // 🔴 `injectLockless`, NOT `inject` — fix of 2026-08-20, proved sufficient by the TLA+
      //    spec (`TransportCandidateFix.cfg`) BEFORE being written here.
      //    Without the lock we may DELIVER but never WRITE. A `once` document delivered and
      //    not recorded is re-decided as fresh by the NEXT action's leader and delivered a
      //    SECOND time — a defect that only appears under contention, hence rare, hence
      //    unreproducible on demand. Exactly the bug that bites once every few months.
      // 🛑 The cure is NOT to let this path write: that would break `NoWriteWithoutLock`,
      //    the reason the lock exists. We deliver only what stays correct with no record.
      // ⚠️ NOTHING IS LOST, it is DELAYED by one action: we write nothing, so the document
      //    stays unseen and the next action delivers it under the lock.
      // 🛑 The subset and its decision are RESOLVED BY THE GATE. Never re-derive them here —
      //    a cadence rule read in two places diverges (paid twice: ㊱, ㊳).
      const segments = segmentsPour(r.injectLockless);
      res = { segments, decision: r.decisionLockless, frames: split(segments), filteredOut: r.filteredOut };
    }

    // ⚠️ `segments`, NOT `r.inject`: the queue may carry content while
    //    gate.decide has decided nothing new (everything is already `seen`).
    //    Testing the old field would exit silently with a full queue — the doc
    //    would then NEVER arrive. That is the exact trap of this work item.
    if (res.segments.length === 0) return;

    // ⚠️ An EMPTY frame goes out SILENTLY (exit 0): it has neither content nor
    //    announcement. In single-frame mode this case is impossible as soon as
    //    `inject` is non-empty — parity is therefore intact.
    const plan = res.frames[indice - 1];
    if (!plan || plan.text === '') return;

    const fullDoc = plan.text;

    // systemMessage: each source composes ITS OWN on ITS injected docs
    // (message() contract), joined by ' · ' — before the merge, two hooks
    // emitted two messages; we keep them all.
    const msgs = [];
    for (const a of ADAPTERS) {
      // ⚠️ `plan.emitted`, NOT `r.inject`: the marker ("🧩 skill: …") announces what
      //    is REALLY in the context. Announcing a deferred doc
      //    would make the agent believe it has received it — the "green that lies".
      //    ⚠️ In multi-frame mode, it is the content of THIS frame — each frame
      //    announces what IT carries, never what the others transport.
      //    ⚠️ `baseId` + dedup: a frame may carry `foo#2` and `foo#3` of the
      //    SAME document. Without falling back on the base, no owner would be
      //    recognized (the badge would go silent as soon as a doc is chunked) and a
      //    document would count twice. A chunk inherited from the queue whose doc
      //    no longer matches has no owner: it is not announced, which
      //    is honest — it is delivered, not attributed.
      const injected = [...new Set(plan.emitted.map(baseId))].filter((d) => acc.owner[d] === a.id);
      if (injected.length === 0) continue;
      const m = a.message(injected, { fullDoc, config, acc });
      if (m) msgs.push(m);
    }
    // ⚠️ CHUNK SUFFIX — ADDED ONE SINGLE TIME, HERE (06/08/2026).
    //    It describes the FRAME, not a source: computing it in each
    //    `message()` would duplicate it 4 times (jscpd) and would make it diverge at
    //    the first adapter added. The badge becomes "🧩 skill: ctxroute
    //    (chunk 3/7)" instead of 7 rigorously identical lines.
    // ⚠️ CONCATENATED AFTER the join, NEVER injected into `fullDoc`: it is
    //    description intended for the human, it does not consume the budget and
    //    can therefore evict NOTHING.
    // ⚠️ IF ALL THE MESSAGES ARE SILENT, THE SUFFIX IS TOO: a badge
    //    reduced to "(chunk 3/7)", without saying of WHAT, would be more worrying
    //    than no badge — and `showNotification: false` must remain a TOTAL
    //    silence, never a partial silence that lets a fragment leak.
    const badge = msgs.join(' · ');

    // ⚠️ CAPACITY ALARM — the ONLY channel that speaks to the HUMAN (07/08/2026).
    //
    // 🔴 WHY IT EXISTS: a remainder is NOT harmless. Nothing is lost
    //    (the queue drains at the next action), but the agent ACTS before having
    //    received everything. That is precisely what the maintainer requires us
    //    to avoid: "the context must be complete before the next tool call".
    //    Without this message, the transition "everything arrives at once" → "it
    //    overflows" is perfectly SILENT: no error, no red, just an
    //    agent that starts deciding again on partial knowledge. It is the hole
    //    "nothing measures the THROUGHPUT" of the backlog (⑱), closed here.
    //
    // ⚠️ IT GOES OUT IN `systemMessage`, NEVER in `additionalContext`: official
    //    documentation, `systemMessage` = "Warning message shown to the user",
    //    and it is the ONLY channel towards the human. The technical announcement
    //    intended for the AGENT already exists elsewhere (budget.announcement) — do not
    //    confuse the two audiences, nor duplicate one into the other.
    //
    // ⚠️ ONE SINGLE TIME PER ACTION, by construction: `planFrames` only
    //    puts `deferred` on the LAST frame. NEVER replace this
    //    condition by a test on the index — 12 frames would scream 12 times, and
    //    a repeated alarm is an alarm that people stop reading.
    //
    // ⚠️ WE COUNT DOCUMENTS, NOT CHUNKS (same trap as
    //    `budget.announcement`, measured on 05/08/2026: a chunked doc produced
    //    56 entries). `baseId` brings `doc#3/7` back to `doc`.
    //
    // 🛑 THE MESSAGE SAYS TO INCREASE `frames`, AND THAT IS DELIBERATE:
    //    `budget.md` FORBADE it until 07/08/2026, on the grounds that a deferral
    //    is a normal transport phenomenon. Framing corrected by the maintainer —
    //    the deferral degrades the agent's DECISION, and only a human can arbitrate
    //    this setting since increasing it costs ~330 ms of process per frame AND
    //    per tool call. So it is not toil: it is an arbitration.
    const reportes = Array.isArray(plan.deferred) ? plan.deferred : [];
    let alarme = '';
    if (reportes.length > 0) {
      const docs = new Set(reportes.map((s) => budget.baseId(s.id)));
      alarme = ` · ⚠️ ${docs.size} doc(s) DEFERRED to the next action — capacity exceeded `
        + `(${nbFrames} frame(s)). Increase "frames" in ctxroute-config.json.`;
    }

    // ⚠️ Empty badge ⇒ suffix AND alarm removed: `showNotification: false`
    //    must remain a TOTAL silence, never a partial silence that lets
    //    a fragment leak. An orphan "(chunk 3/7)" is more worrying than a
    //    silence — and an alarm without knowing WHAT it is talking about even more so.
    // ⚠️ GLOBAL FILTER BY TARGET (52): a SILENT exclusion would be a hole — the
    //    badge says it and NAMES the setting. ONCE per action (1st frame):
    //    the capacity alarm proved that 12 identical screams are unreadable.
    //    ⚠️ Counts the DOCS excluded by gate.decide on THIS action — never a
    //    "maybe": these are docs that MATCHED and that the filter removes.
    const filteredOut = Array.isArray(res.filteredOut) ? res.filteredOut : [];
    const filtre = filteredOut.length > 0 && indice === 1
      ? ` · 🚫 ${filteredOut.length} doc(s) excluded by filterMode/filterList`
      : '';
    emit(res.decision, fullDoc, badge === '' ? '' : badge + budget.chunkSuffix(plan.emitted) + alarme + filtre);
  } catch {
    // fail-open: we ANSWER "nothing to inject", we do not kill the process.
  }
}

/**
 * `deny` OUTPUT — DIALECT COMMON to both harnesses (05/08/2026).
 *
 * ⚠️ WHY HERE AND NOT IN EACH SHELL: the refusal JSON is
 *    RIGOROUSLY IDENTICAL on Claude Code and Codex (official documentation of
 *    both + strings verified in the Codex 0.144.6 binary). Duplicating it
 *    in the 2 shells was a 22-line CLONE — jscpd saw it, and the
 *    porting contract forbids it ("NEVER a copy"). Identical precedent:
 *    `decision: block` of guard-core.js.
 * ⚠️ The day a harness diverges on THIS point, it would take back its own
 *    emit — that is the rule: we share what is MEASURED identical, never what
 *    we suppose to be identical.
 * ⚠️ The doc goes out in `permissionDecisionReason`, NEVER in `additionalContext`:
 *    the latter only arrives next to the tool RESULT, hence too late for
 *    the call we are refusing. That is the whole point of `enforce`.
 */
function denyOutput(fullDoc) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[ACTION REFUSED — read this, then start over]\n\n' + fullDoc,
    },
  };
}

module.exports = { run, denyOutput };
