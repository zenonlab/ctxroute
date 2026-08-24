---
rules: [{"pattern":"session-inject.js","scope":["ctxroute"]},{"pattern":"session-inject.test.js","scope":["ctxroute"]},{"pattern":"sources-session.test.js","scope":["ctxroute"]}]
mode: dumb
---
# session-inject.js / sources/session.js — SESSION gate (LIVE 2026-07-17)

⚠️ `session-inject.js` = SISTER SessionStart gate: injects ALL of docs/session/*.md at EVERY session start (startup/resume/clear/compact) — the "CLAUDE.md managed by the framework". NEVER merge it with doc-inject.js (different events/contracts).
⚠️ NO CADENCE, NO dedup: reinjection after compaction is the POINT. Do not "optimize" by adding a once/smart here.
⚠️ **TRANSPORT ADDED on 2026-08-05 (⑯/⑮) — it had NONE**: it emitted a single block, without seal or chunking, and that only "worked" because `docs/session/` weighed ~1.2 KB (static sizing). It now goes through `emission-core.js`. The only state it touches is the QUEUE (transport, not cadence) ⇒ **lock MANDATORY** around it; lock unavailable = degradation to fresh content only, never a silence.
⚠️ **A SINGLE FRAME here (`nbFrames: 1`), deliberately**: whether a SessionStart hook declared N times is spawned N times is NOT measured (dedup by command+args is proven only on PreToolUse). We do not reverse-engineer — at one frame, chunking still delivers EVERYTHING, just more slowly. Going to N = a setting AFTER measurement.
⚠️ `sources/session.js` = PURE (Stryker-mutated 13/13), ALPHA order by id via localeCompare (a `<` ternary = guaranteed equivalent mutant, removed by construction). Frontmatter stripped via frontmatter.parse (single source).
⚠️ Full FAIL-OPEN (missing folder included); liveness covered by the doctor (probe 3 + session-inject wiring check) — do not remove those checks.
⚠️ `enabled: false` in ctxroute-config.json ALSO cuts this gate (single global switch).
