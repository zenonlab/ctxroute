---
rules: [{"pattern":"commit-msg-leak.js","scope":["ctxroute"]},{"pattern":"commit-msg-leak.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 20
---
# commit-msg-leak.js — the published MESSAGE is scanned too (2026-08-27)

🔴 **BORN OF A HOLE NOBODY GUARDED**: `.githooks/pre-commit` scans TRACKED FILES, `commit-msg`
checked ENGLISH only. Between the two, the message TEXT was read by no anti-leak gate at all — and
`git log` is the first surface a fork reads, forever.
🛑 **THE TRAILER BLOCK IS EXCLUDED, and that is not a convenience.** `Co-Authored-By:` carries an
address BY DEFINITION, so scanning the whole message refuses the repository's most ordinary commit.
Measured the day it shipped: **it blocked its own delivery commit.** The reader is REUSED from
`commit-msg-lang.js` (`bodyLines` + `trailerBlockStart`) — two definitions of "trailer" would
diverge in silence. Sealed by a founding cell, seen red by removing the exclusion, with a CONTROL
cell for a leak in the body (without it the exclusion could swallow the whole message and stay
green).
⚠️ **PURE**: the module decides, the shell (`tools/commit-msg-check.js`) reads the file and builds
the patterns. Stryker does not mutate test code — a rule written in a suite is verified by nothing.
⚠️ It consumes the SAME terms as the file gate, through `leak-list.privateTerms()`. A second term
source would be a second truth, and the two would drift apart the day one is edited.

🔴 **TRI-STATE, 2026-08-30 — the matcher package is a `file:../personal-data-guard` sibling
checkout, present on the maintainer's machine and ABSENT on any clean clone or CI runner.** A
top-level `require`/`import` of it used to CRASH at LOAD time everywhere but the maintainer's
machine: `tsc` could not resolve its types, and every test file importing it became a FAILED SUITE
in CI, not individual assertions. ✅ **PRESENT ⇒ unchanged, byte-for-byte** — `verdict()` calls the
real `scan()`. **ABSENT ⇒ this module still LOADS** (the `require` is wrapped in try/catch) and
`verdict()` returns `{violations: [], unavailable: true}` — a NAMED state, never a silent
`violations: []` read as "nothing to see". `refusal()` REFUSES on `unavailable` too, loudly naming
the missing package — 🛑 **NEVER treat a missing matcher as permission to let a commit through**:
this is the anti-leak gate for a PUBLIC repository's history, and a silent green here is
indistinguishable from a working gate. `tools/commit-msg-check.js` mirrors the same try/catch around
its own `forbiddenPatterns` call and checks `lv.unavailable` alongside `lv.violations.length`.
⚠️ **`types/zenon-lab-personal-data-guard.d.ts`** is the ambient module declaration that makes
`tsc` pass on a clean clone: real package present ⇒ its own types win; absent ⇒ TypeScript falls
back to this file. Kept in sync with the SLICE this repo actually calls, never the package's full API.
