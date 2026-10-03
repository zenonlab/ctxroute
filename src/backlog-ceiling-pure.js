// backlog-ceiling-pure.js — PURE decision. Zero fs, zero process, zero console.
//
// 🔑 WHY THIS EXISTS, AND IT IS THE REDIS PATTERN, NOT A REVIVAL OF A DEAD THEORY
//    (2026-09-17). `listen(2)` is capped by `net.core.somaxconn`: a server may ask
//    for 65535 and silently get 128. Every serious server SAYS SO — Redis prints a
//    line at startup, PostgreSQL documents it — and **not one of them refuses to
//    start over it**, because a kernel-wide setting is a system administration
//    decision, never an application's to enforce.
// 🛑 AN INSTALLER WALL STOOD HERE THIS MORNING AND WAS REMOVED THE SAME DAY. It
//    refused to install below 4096, for a burst-refusal class later measured
//    absent (`accept-queue-ceiling.md`: peak 32 against a 232-deep queue, and no
//    connection attempt on the wire at all). **A guardrail with no measured
//    disease aimed at your own adopters is a denial of service.** What replaces it
//    is this: OBSERVE, RECORD, never block.
// ⚠️ THE VALUE OF THE FIGURE IS NOT THE POINT — declaring it is. A default that
//    varies by runtime and platform (Node 511, other stacks 128 or 5) is an
//    implicit dependency, and this project removes those everywhere else.
// ⚠️ UNKNOWN IS A VERDICT, NEVER A ZERO. Off Linux — or when the file cannot be
//    read — the ceiling is `null` and the record says so. Printing `0` would
//    assert a measured zero, which is exactly the "I could not measure is never
//    healthy" fault this repository refuses.
'use strict';

/**
 * Fields describing what backlog was ASKED for and what the kernel will allow.
 *
 * 🛑 FIELDS ON AN EXISTING EVENT (`start`), never a new event and never a new
 *    frequency: the journal's ceiling rests on nothing being written per request,
 *    and `start` fires exactly once per process life.
 *
 * @param {unknown} declared the backlog this process passes to `listen`
 * @param {unknown} kernelCeiling `net.core.somaxconn`, or null when unknowable
 * @returns {{backlog: number|null, backlogCap: number|null, backlogCapped: boolean}}
 */
function backlogFields(declared, kernelCeiling) {
  // Stryker disable ConditionalExpression: EQUIVALENT mutants, and the guards STAY.
  //    ① `typeof x === 'number'` → `true`: `Number.isFinite` never coerces (ECMAScript:
  //    it answers false for anything whose type is not Number), so no input tells the
  //    two apart. ② `asked !== null` → `true`: `cap` is null or `>= 0`, and `n < null`
  //    compares against 0, so an unknown `asked` can never make `capped` true.
  //    🛑 KEPT ON PURPOSE rather than deleted: they are the explicit type guards of a
  //    public contract, and a removal is mandated, never discovered by a score. The
  //    killable mutants this region also silences (`Number.isFinite(x)` → `true`) are
  //    still pinned by cell ⑥, which turns red on each of them when sabotaged by hand.
  const asked = typeof declared === 'number' && Number.isFinite(declared) && declared > 0
    ? declared
    : null;
  const cap = typeof kernelCeiling === 'number' && Number.isFinite(kernelCeiling) && kernelCeiling >= 0
    ? kernelCeiling
    : null;
  // ⚠️ CAPPED IS ONLY TRUE WHEN BOTH NUMBERS ARE KNOWN. An unknown ceiling can
  //    never accuse: it is the absence of a measurement, not a low value.
  const capped = asked !== null && cap !== null && cap < asked;
  // Stryker restore ConditionalExpression
  return { backlog: asked, backlogCap: cap, backlogCapped: capped };
}

module.exports = { backlogFields };
