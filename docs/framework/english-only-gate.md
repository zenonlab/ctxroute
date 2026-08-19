---
match: [english-only-gate.test.js]
mode: dumb
---

# english-only-gate.test.js — the PUBLISHED surface cannot slip out of English

🔴 **BORN OF THE RULE BEING BROKEN THREE TIMES IN FOUR DAYS**, always by an agent that had just READ it. One slip survived a whole session that ended with the agent certifying "everything is clean": a French paragraph in `docs/framework/mutation-floor-gate.md` — the mirror a FORK receives. **A rule that only prose guards is not a rule.**
🛑 **SCOPE = `docs/framework/` ONLY.** The maintainer's personal fleet docs stay in any language: they never leave the machine. Widening this gate to them makes it red forever, hence ignored, hence dead.
⚠️ **NOT a French detector — a NOT-ENGLISH detector.** Contributors are international; the next slip may be German or Japanese. `eld` covers 60 languages.
📐 **THE DEPENDENCY WAS CHOSEN BY MEASUREMENT, AND THE MEASUREMENT REFUTED THE MARKET LEADER.** `franc` = 1,374,671 downloads/month, 4,407 stars (vs 119 for `eld`) — and **97 FALSE POSITIVES** on this corpus, reading English lines as Scots (`sco`), whose trigrams overlap English. `eld`: **0 false positives, 2 real violations caught out of 2.** 🛑 Never swap back on reputation: replay the measurement. (Measured too: the npm package `lingua` is NOT the Lingua detector — unrelated i18n module; real Lingua has no maintained JS port.)
⚠️ **`isReliable()` IS LOAD-BEARING, not a refinement** — the detector says ITSELF when the sample is too short to decide. That is precisely what `franc` lacks. A gate that guesses on short text becomes noise, and a noisy gate gets disarmed.
⚠️ **MIN_CHARS = 90, MEASURED**: at 60 a bare list of config filenames was reliably called Swedish. Code spans, URLs and markdown are stripped BEFORE judging — we judge PROSE, never syntax.
⚠️ **ANTI-VACUITY in two parts**: the detector must still recognise a foreign sentence AND cover >= 50 languages; the scan must really read >= 20 mirrored docs. Without them, a broken import or glob turns the gate green while measuring nothing — the failure mode already paid for three times here.
