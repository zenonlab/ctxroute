// ═══════════════════════════════════════════════════════════════════════
// EMISSION LAYER — the ONLY path by which a context leaves this place.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS FILE EXISTS (05/08/2026, REFACTOR-PLAN ⑯). The transport
//    (budget · chunking · seal · frames · queue) lived IN `pretool-core.js`,
//    that is to say in the orchestration of ONE ONLY of the two emitters. The
//    second one (`session-inject.js`) did not go through it, and NOTHING forced
//    it to: it was opt-in by copy-paste. Measured result: the docs of
//    `docs/session/` went out in one block, without a seal, without chunking,
//    without a queue — hence subject to the harness's silent spill as soon as
//    they grew. It was not an oversight, it was a SKELETON DEFECT, and
//    it would have happened again with the 3rd emitter (PostCompact Codex,
//    SubagentStart, Stop… — 5 events already listed).
//
// ⚠️ THE RULE THAT HOLDS THE SKELETON: *no emitter composes its output —
//    it hands segments to this layer.* That is the pattern of web frameworks
//    (a handler never serializes its response; the pipeline does).
//    CAPITAL DIFFERENCE with them: over there you CANNOT bypass the
//    pipeline, you do not own the transport. Here we own everything ⇒ only a
//    MACHINE can enforce it. Hence `emission-core-gate.test.js`: "every file
//    that writes `additionalContext` MUST import this module", derived from the
//    code hence valid for FUTURE emitters. Without this gate, the layer exists
//    but stays optional and all we did was move the problem.
//
// ⚠️ THIS MODULE IS AN I/O SHELL (queue store) — never mutated by Stryker,
//    never imported by the pure engine. ALL the transport decision is
//    PURE and lives in `budget.js` (`orderSegments`, `planFrames`, `baseId`),
//    which is mutated at 100 %. NEVER bring logic back here: this file must
//    contain nothing but "read the queue → delegate → rewrite the queue".
//
// ⚠️ WE DO NOT MERGE THE EMITTERS FOR ALL THAT. SessionStart and PreToolUse
//    have DIFFERENT events and output contracts (invariant written
//    in session-gate.md). We share the EMISSION LAYER, never
//    the orchestration.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const budget = require('./budget');
const store = require('./session-store');

// 🛑 THE STATE BACKEND IS AN ARGUMENT, NEVER AN AMBIENT SETTING (2026-08-20).
//    The daemon owns its state IN MEMORY (the kernel serialises the callers, so
//    nothing needs a lock); a spawned hook keeps the on-disk store. Both must be
//    reachable from the SAME code, so the choice travels as a PARAMETER.
// 🔴 AN ENVIRONMENT VARIABLE WAS CONSIDERED AND REFUSED: env vars are INHERITED
//    by child processes. One leak and a spawned hook would silently read an
//    empty memory instead of the real state — every `once` re-delivered, no
//    error anywhere. An ambient switch on a state backend is a silent-bug
//    generator; an explicit argument cannot leak.
// ⚠️ Default = the disk store, so every existing caller keeps byte-identical
//    behaviour and the differentials stay green without a single edit.
const backend = (s) => s || store;

// ⚠️ EMISSION QUEUE — what does not fit in the N frames of ONE action waits
//    here and leaves at the NEXT action. Distinct prefix, keyed by the agent
//    scope, purged by `ctxroute-reset.js` like the other stores.
//
//    IT IS THE BEHAVIOUR OF THE TCP SENDER, and this is not a decorative
//    analogy: window full ⇒ the data STAYS in the send buffer
//    and leaves at the next window. No transport protocol
//    throws away because the window is full — bounded channel, unlimited flow.
//    Direct consequence: the number of declared frames is no longer a DELIVERY
//    ceiling, only a THROUGHPUT.
//
// ⚠️ STORE SHARED BY ALL EMITTERS, DELIBERATELY (05/08/2026). One
//    queue per emitter would be a regression: at SessionStart there is no
//    "next action" in which to drain, so its remainder would never leave. With
//    a common store keyed by agent scope, what the SESSION gate could not
//    deliver is picked up by the PreToolUse gate at the very first tool call.
//    NEVER prefix the queue per emitter.
const REMAINDER_PREFIX = 'remainder-';

// ⚠️ WE STORE THE TEXT, NOT A REFERENCE TO BE RECOMPUTED. Two reasons, neither
//    negotiable: ① the N parallel processes must see EXACTLY the same
//    input, otherwise their frames no longer reassemble; ② a doc EDITED between
//    two actions would make chunks of one version be reassembled with chunks of
//    another — a silent Frankenstein.
function loadQueue(scopeId, st) {
  const f = backend(st).loadState(REMAINDER_PREFIX, scopeId);
  return Array.isArray(f.segments) ? f.segments : [];
}

// ⚠️ UNCONDITIONAL WRITE, including with an EMPTY remainder: that is what
//    EMPTIES the queue when everything is finally delivered. Making it
//    conditional on being non-empty would make the last delivery loop at every
//    action, forever.
function persistQueue(scopeId, deferred, emissions, st) {
  backend(st).saveState(REMAINDER_PREFIX, scopeId, { segments: deferred, emissions });
}

/**
 * EMISSION COUNTER — how many times this layer actually made context GO OUT,
 * for this agent scope, since the last compaction.
 *
 * ⚠️ REASON FOR BEING (07/08/2026, porting the canary to Codex). The canary must
 *    answer "we emitted, did it ARRIVE?". It therefore needs a
 *    DENOMINATOR: without it, "zero injection observed" is undecidable
 *    (perhaps we simply emitted nothing). On the Claude Code side this
 *    denominator was counted by looking for `"type":"tool_use"` in the
 *    transcript — that is to say by reading the harness DIALECT.
 * 🛑 THIS PATH IS CLOSED FOR CODEX, AND IT IS DOCUMENTED IN BLACK AND WHITE.
 *    Official Codex hooks documentation (learn.chatgpt.com/docs/hooks, re-read on
 *    07/08/2026): "the transcript format isn't a stable interface for hooks
 *    and may change over time". Counting tool calls by guessing a
 *    marker in that file would be building on a format that the vendor
 *    explicitly reserves the right to break. NEVER do it.
 * ✅ The denominator is therefore data of OUR OWN, produced by our own
 *    emission layer: independent of any harness, true everywhere, and
 *    free (it travels in a store write that already existed).
 *
 * ⚠️ INCREMENTED ONLY WHEN CONTENT REALLY LEAVES (`segments` non-empty).
 *    Counting empty passes would inflate the denominator without ever
 *    producing an expected trace on the other side — the canary would report a
 *    non-existent breakdown, and an alarm that screams about healthy things
 *    stops being read.
 * ⚠️ Purged by `ctxroute-reset.js` along with the rest of the `remainder-`
 *    prefix: after a compaction the sample STARTS OVER, which is correct — the
 *    context has been emptied, injections from before no longer prove anything
 *    about now.
 */
function emissionCount(scopeId, st) {
  const f = backend(st).loadState(REMAINDER_PREFIX, scopeId);
  // ⚠️ Store written BEFORE 07/08/2026: the key does not exist. Absent = 0,
  //    never an error — that is what makes the addition backward-compatible
  //    (expand/contract: the new key appears, nobody breaks).
  return Number.isInteger(f.emissions) && f.emissions > 0 ? f.emissions : 0;
}

/**
 * SPLITTING ALONE — without touching the queue.
 *
 * ⚠️ Reserved for REPLAYS of an already decided split (memoized plan of frames
 *    2..N) and for DEGRADED paths where the queue cannot be touched
 *    safely (lock unavailable). A normal emitter calls `emit`.
 *    The splitting is PURE and deterministic: replaying gives the same result.
 */
function split(segments, budgetMax, nbFrames) {
  return budget.planFrames(segments, budgetMax, nbFrames);
}

/**
 * EMIT — the MANDATORY point of passage of every outgoing context.
 *
 * Takes FRESH segments, puts them behind what is already waiting in
 * the queue, splits the whole thing into frames, persists what did not go out, and
 * returns the frames. The caller chooses NONE of that: it provides content and
 * its frame index, it receives text ready to go out in ITS dialect.
 *
 * ⚠️ CALL UNDER LOCK. Reading then rewriting the queue without mutual exclusion
 *    would lose segments when two processes cross. A caller that
 *    could not take the lock MUST degrade to `split` (fresh only,
 *    queue intact) — never keep silent, never write without a lock.
 *
 * @returns {{segments, frames, plan}} `segments` = the real input of the
 *   splitting (to be memoized for the following frames); `plan` = the frame of
 *   the requested index, or `undefined` if the index does not exist.
 */
function emit({ fresh, budgetMax, nbFrames, index, scopeId, store: st = null, carried = [] }) {
  // 🔑 `carried` = SEGMENTS RECLAIMED FROM AN INVOCATION WHOSE FRAMES NEVER
  //    CONNECTED (`carryover-pure.js`, 2026-08-31). They belong on the QUEUE
  //    side, never with `fresh`: they were decided BEFORE this action, so they
  //    keep priority over anything newly matched — the same rank the queue has
  //    always had, for the same reason (what is already owed goes out first).
  // ⚠️ ABSENT ⇒ `[]` ⇒ byte-for-byte the behaviour before this parameter
  //    existed. Every caller that supplies none of it is untouched, which is
  //    what keeps the spawn lane and every differential green: only a daemon
  //    can observe a connection that never arrived, so only a daemon supplies
  //    this.
  const inherited = Array.isArray(carried) && carried.length > 0
    ? loadQueue(scopeId, st).concat(carried)
    : loadQueue(scopeId, st);
  const segments = budget.orderSegments(inherited, fresh);
  const frames = split(segments, budgetMax, nbFrames);
  // ⚠️ THE COUNTER TRAVELS IN THE WRITE THAT ALREADY EXISTED — zero extra I/O,
  //    zero extra lock. That is what makes the canary's denominator FREE;
  //    a dedicated store would have added one write per action on the hot path.
  //    The empty pass does not count (cf `emissionCount`).
  const emissions = emissionCount(scopeId, st) + (segments.length > 0 ? 1 : 0);
  persistQueue(scopeId, frames[frames.length - 1].deferred, emissions, st);
  return { segments, frames, plan: frames[index - 1] };
}

module.exports = { emit, split, loadQueue, emissionCount, REMAINDER_PREFIX };
