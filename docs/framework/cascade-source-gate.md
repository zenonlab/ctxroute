---
match: ["cascade-source-gate", "explain.js"]
mode: smart
threshold: 20
note: |
  `pretool-core` was REMOVED from the match on 2026-08-09, from MEASUREMENT and
  reluctantly: the action "Read pretool-core.js" already weighs 77,200 c out of
  91,932 (skill 61,569 + gate.md 14,888), and since each document is framed
  SEPARATELY, this 743 c doc cost a 13th frame — hence the capacity alarm on
  EVERY action. A permanent alarm is an alarm nobody reads anymore.
  The invariant stays sealed by `cascade-source-gate.test.js` (fail-closed at
  push): we lose the reminder at the moment of the action, not the protection.
  Restore it once the load drops — the real target is `gate.md` (14,888 c,
  far beyond the "short tier-1 + pointer" convention).
---

# Cascade: 3 ARGUMENTS, the SOURCE included

🛑 `modeForDoc`/`thresholdForDoc`/`driftUnitForDoc`/`enforceForDoc` = `(config, decl, source)`. **Without `source`, tier ② (`defaults.{source}`) is INVISIBLE** ⇒ amputated cascade, divergent from `gate.decide`.
🔴 **Real bug 2026-08-09**: `pretool-core` and `explain.js` called with 2 args ⇒ a `smart` doc in TURNS unit degenerated into `once`, SILENTLY. Found by READING — 1117 tests + 100 % mutation both blind (I/O shells not mutated, no test set `defaults`).
⚠️ Sealed by `cascade-source-gate.test.js` (behavior + arg counting by parenthesis DEPTH, never `split(',')`). Full account: `REFACTOR-PLAN.md`.
