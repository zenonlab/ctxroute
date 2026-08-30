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
