// ═══════════════════════════════════════════════════════════════════════
// CANARY — the only witness that looks at the OTHER END of the pipe.
// ═══════════════════════════════════════════════════════════════════════
//
// REASON FOR EXISTING (03/08/2026, a hole NAMED then closed). Everything else
// in the framework tests ITSELF: the doctor spawns our hook with OUR payload
// and checks OUR output. That is necessary, and perfectly blind to the only
// remaining risk: that the HARNESS changes its mind.
//
// ⚠️ WHAT THE REST ALREADY COVERS (do not redo it here):
//    · size limit lowered      → the SEAL makes it loud (marker missing);
//    · packet lost or deduped  → the missing NUMBER makes it loud;
//    · our code broken         → the DOCTOR screams.
// ⚠️ WHAT IT ALONE COVERS: the harness renames the fields it sends, or stops
//    CONSUMING `additionalContext`. Then our hooks fail open in silence, the
//    doctor stays GREEN, and nothing reaches the agent any more. No test can
//    see that: we would be testing ourselves. You have to observe the REAL.
//
// ⚠️ THE SIGNAL IS DECIDABLE, NEVER HEURISTIC. The harness writes the session
//    transcript; an injection that has LANDED leaves its trace there
//    (`[source: …]`, placed by the gate on EVERY segment). We guess nothing,
//    we observe: tool calls happened, and zero injections landed.
//
// ⚠️ THE ALARM MUST NEVER TRAVEL THROUGH THE PIPE IT TESTS. If the injection
//    channel is dead, screaming THROUGH an injection would be useless — the
//    alarm would die together with what it signals. Hence the output through a
//    health file read by the STATUSLINE (out-of-band channel, already proven in
//    this fleet by `mem-health.json`). NEVER "simplify" by going back through
//    additionalContext.
//
// ⚠️ PURE: zero I/O, zero clock, zero randomness — the shell counts, this
//    module decides. That is the condition for mutation without equivalent
//    mutants.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Number of EMISSIONS beyond which "zero injection landed" stops being a
// coincidence and becomes PROOF.
// ⚠️ This is not a delay, it is a SAMPLE SIZE — the fleet rule "time must be
//    declared" does not apply: we wait for nothing, we require having observed
//    enough before concluding.
// ⚠️ JUSTIFICATION RECALIBRATED ON 07/08/2026, AND IT HAD TO BE. The number was
//    valid for TOOL CALLS (measurement of 03/08: 109 calls / 174 injections).
//    It now counts EMISSIONS — ANOTHER quantity. Keeping the number without
//    redoing the measurement means dragging along an expired justification that
//    looks like one: exactly what this repo hunts elsewhere.
// ⚠️ NEW MEASUREMENT (real 46 MB transcript, 13 compactions spotted by
//    `isCompactSummary`): between two compactions, **94 to 335 injections**
//    landed — so far more than 25 emissions. The threshold is crossed early in
//    each interval, and the counter (purged on PreCompact) has time to rebuild.
//    🛑 This measurement holds for THIS fleet: on very short, heavily compacted
//    sessions the canary would stay `undecidable` — a SAFE degradation
//    (silence), never a false alarm, sealed by the "AFTER COMPACTION" test of
//    `canary-check.test.js`.
// ⚠️ Lowering it would manufacture false alerts — and a recurring warning on
//    healthy state is a channel one stops reading (lesson of rush mode).
const EMISSIONS_THRESHOLD = 25;

// Transcript reading window, in bytes, read from the END.
// ⚠️ MANDATORY BOUND: a real fleet transcript weighed **104 MB** on
//    03/08/2026. Reading it whole cost 524 ms and as much memory, on EVERY
//    turn. Reading the tail costs 5 ms and already sees ~109 calls: 100 times
//    cheaper, for an identical signal. NEVER go back to a full read "to be
//    sure" — it is RECENT activity that says whether the channel is alive now.
const BYTE_WINDOW = 2 * 1024 * 1024;

// Mark left in the transcript by an injection that has LANDED.
// ⚠️ `[source:` is placed by the gate on EVERY emitted segment, sealed or not,
//    whole or chunked — it is therefore the BROADEST possible witness. Do not
//    replace it with the `###FIN:` seal: that one only appears beyond 50 % of
//    the budget, and the canary would go blind to small injections.
const INJECTION_MARK = '[source:';

// ⚠️ Max length of a PLAUSIBLE label (a doc path). Generous on purpose: the
//    discriminating filter is the SHAPE (`.md` / `skill/`), not the size —
//    which only rules out very distant false `]`.
const LONGUEUR_ETIQUETTE_MAX = 200;

// ⚠️ THERE IS NO HARNESS MARK ANYWHERE ANY MORE — neither here nor in the
//    shell (07/08/2026). Until that date, the DENOMINATOR ("how many
//    opportunities to inject?") was counted by looking for `"type":"tool_use"`
//    in the Claude Code transcript, and porting to another harness meant
//    guessing ITS equivalent marker.
// 🛑 THAT APPROACH IS DEAD, AND THE OFFICIAL DOC SAYS SO IN BLACK AND WHITE.
//    Codex hooks (learn.chatgpt.com/docs/hooks, re-read on 07/08/2026):
//    "the transcript format isn't a stable interface for hooks and may change
//    over time". The transcript is a reading CONVENIENCE, never a contract.
//    Building a denominator on its schema means betting on a format the vendor
//    reserves the right to break — a permanent ban in this repo.
// ✅ WHAT REPLACES IT: the EMISSIONS counter from `emission-core.js`, data of
//    OUR own. The canary now asks "we emitted N times, did it arrive?" instead
//    of "N things happened at the harness". It is the SAME question, asked of a
//    source we author. Happy consequence: both harnesses share the SAME shell —
//    the port to Codex cost no file, only one line of wiring.
//
// ⚠️ `INJECTION_MARK` STAYS here, and it alone: it is OUR mark, placed by our
//    own gate. Looking for it in the transcript depends on NO schema — it is a
//    substring in text. If the harness changes its file format, our mark stays
//    there; if it stops writing a transcript, `transcript_path` is `null`
//    (documented) and the canary keeps quiet.

/**
 * Decides the state of the injection channel.
 *
 * @param {number} emissions — times the framework pushed context OUT.
 * @param {number} injections — injections that LANDED within the window.
 * @returns {'alive'|'dead'|'undecidable'}
 *
 * ⚠️ TOTAL: NEVER throws and never returns anything other than these 3 values.
 *    A canary that crashes would be a mute canary — hence worse than absent,
 *    since we would believe we are being watched.
 * ⚠️ THE ORDER OF THE TESTS CARRIES MEANING: a single observed injection is
 *    ENOUGH to prove the channel is alive. We NEVER compare a number of
 *    injections to an expected number — that would fall back into estimation.
 */
function verdict(emissions, injections) {
  // ⚠️ `Math.max(0, …)` and NOT `x > 0 ? x : 0`: at x = 0 both branches of the
  //    ternary return the same thing ⇒ the comparator is UNKILLABLE (equivalent
  //    mutant, hence an eternal survivor). Same lesson as `parseFrameArgs` and
  //    `frameCapacity` — always write the TESTABLE form.
  const e = Number.isInteger(emissions) ? Math.max(0, emissions) : 0;
  const i = Number.isInteger(injections) ? Math.max(0, injections) : 0;
  if (i > 0) return 'alive';
  // Not enough observed to accuse: we KEEP QUIET rather than cry wolf.
  if (e >= EMISSIONS_THRESHOLD) return 'dead';
  return 'undecidable';
}

/**
 * Ready-to-display label, for ANY out-of-band display.
 *
 * ⚠️ The framework DOES NOT PROVIDE the display and does not depend on one: it
 *    publishes a verdict in a file, full stop. At the maintainer's it is a
 *    statusline; elsewhere it will be a shell prompt, a notification, a log.
 *    NEVER couple this module to a particular display — the framework must
 *    install as-is for anyone.
 *
 * ⚠️ SILENCE WHEN ALL IS WELL (empty string): a permanent alarm on healthy
 *    state becomes scenery nobody reads any more. The canary speaks ONLY to
 *    announce a failure — that is what makes its word credible the day it
 *    comes.
 */
function sourceTag(v) {
  return v === 'dead' ? '💉⚠️ INJECTION DEAD' : '';
}

/**
 * Counts the injections that LANDED in a transcript excerpt.
 *
 * ⚠️ Tolerant to TRUNCATED lines: the window cuts the file mid-line by
 *    construction. We count SUBSTRINGS, never parsed JSON — parsing would
 *    require whole lines, would make the canary fragile to the cut, and above
 *    all would make the canary DEPEND on the transcript schema, which the Codex
 *    doc declares unstable (see header). Counting a substring we wrote
 *    ourselves depends on no format.
 * ⚠️ ONE SINGLE WITNESS HERE, no longer two (07/08/2026): the denominator is no
 *    longer read from the transcript, it comes from the emissions counter.
 *    NEVER reintroduce a "call mark" parameter — that would let a harness
 *    dialect back into the core.
 */
function countInjections(extract) {
  // ⚠️ EARLY return rather than a fallback to `''`: the fallback introduced an
  //    ARBITRARY string nothing can observe ⇒ equivalent mutant. Here, zero is
  //    a contract value, hence testable.
  if (typeof extract !== 'string') return 0;
  let n = 0;
  let k = extract.indexOf(INJECTION_MARK);
  while (k !== -1) {
    const start = k + INJECTION_MARK.length;
    const fin = extract.indexOf(']', start);
    // ⚠️ `fin === -1` = mark CUT by the 2 MB window. Undecidable ⇒ we do not
    //    count. NEVER count here "so as not to miss anything": that would
    //    reopen exactly hole ㉘ on truncated marks.
    if (fin !== -1 && isTagEmitted(extract.slice(start, fin))) n++;
    k = extract.indexOf(INJECTION_MARK, start);
  }
  return n;
}

/**
 * Does the label have the shape of those OUR GATE EMITS?
 *
 * 🛑 DEFECT ㉘ (07/08/2026) — READ BEFORE TOUCHING THIS FUNCTION.
 *    The canary counted every occurrence of `[source:`. But that literal also
 *    lives in TEXT THAT TALKS ABOUT IT: the comments of this very file, and
 *    **64 fleet docs out of 386** (MEASURED that day) which QUOTE a source file
 *    in that form. Consequence: an agent READING one of those docs turned the
 *    canary GREEN — that is, the dead-man switch disarmed itself at the precise
 *    moment someone was INVESTIGATING a dead injection. The only scenario where
 *    it is useful is the one where it lied.
 *
 * ✅ WHAT DISCRIMINATES: an EMITTED label always designates a DOCUMENT — it
 *    ends with `.md` (file, MCP, session docs) or starts with `skill/`. A code
 *    quote designates a SOURCE file. Fleet measurement on HARD-CODED markers:
 *    23 `.js`, 18 `.ts`, 7 `.tsx`, 4 `.sh`, 3 `.py`, 1 `.mjs`, 1 `.service` —
 *    and only 4 in `.md`.
 *
 * ✅ ㉘ bis CLOSED ON 08/08/2026 — IN DATA, NOT IN THE ENGINE (commit `edd4358`).
 * 🛑 THIS BLOCK ANNOUNCED AN OPEN WORKSITE (fixed on 09/08/2026) and sent the
 *    reader towards a fix that was ABANDONED, not postponed. It said: "the 4
 *    fleet docs quoting a `.md` are still wrongly counted; the TOTAL fix =
 *    accept only labels actually emitted, re-read in `emission-core`".
 *    Two errors, and the second is costly:
 *    ① THOSE 4 DOCS QUOTED NOTHING — they carried the `[source: …]` tag
 *      HARD-PASTED (an injection copy-paste: the engine already adds it, so they
 *      arrived with their tag TWICE). Removed from all 4 ⇒ no source of false
 *      green left. Anti-return = lint rule `hardcoded-source-tag` (ERROR, zero
 *      exemption across 393 docs) — the fleet reports 0 today.
 *    ② THE FIX VIA `emission-core` IS RULED OUT ON MEASUREMENT: it imposed a
 *      state write on the HOT path (12 processes × every tool call × every
 *      agent) for a defect that 4 TEXT corrections remove. Extension contract:
 *      a hole is fixed in DATA first, the engine as a LAST resort. 🛑 Do NOT
 *      reopen it without a NEW and MEASURED defect.
 */
function isTagEmitted(brut) {
  const l = brut.trim();
  // ⚠️ UPPER bound: a mark followed by a very distant `]` (prose, escaped JSON)
  //    is not a label. Without it, any text containing `[source:` and then a
  //    `]` would end up validating.
  // ⚠️ NO `l.length === 0` guard: it was DEAD (surviving mutant, 07/08/2026).
  //    An empty label does not end with `.md` and does not start with
  //    `skill/` ⇒ it is ALREADY rejected by the shape test. Writing a test to
  //    resurrect it would have frozen useless code forever.
  if (l.length > LONGUEUR_ETIQUETTE_MAX) return false;
  return l.endsWith('.md') || l.startsWith('skill/');
}


// ⚠️ `occurrences()` WAS DELETED on 08/08/2026 — DEAD CODE, not an oversight.
//    It dated from the canary that compared RECEIVED vs EXPECTED (two counters
//    taken from the transcript). Since 07/08 the denominator comes from
//    `emission-core.emissionCount` and `countInjections` does its own scan: no
//    caller left, and it was not exported.
// 🛑 DO NOT RESURRECT IT "just in case". It carried the 4 ONLY surviving
//    mutants of the repo (`NoCoverage`, canary.js at 93.85 %) and masked the
//    question that matters: *why does a function nothing calls still live
//    here?* Writing a test to cover it would have frozen useless code
//    forever — mutation = ELIMINATE, never TEST.

module.exports = { verdict, sourceTag, countInjections, EMISSIONS_THRESHOLD, BYTE_WINDOW, INJECTION_MARK };
