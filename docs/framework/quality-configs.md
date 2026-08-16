---
match: [stryker.conf.json, .dependency-cruiser.json, .jscpd.json]
scope: [ctxroute]
mode: smart
threshold: 6
rank: 370
---
# stryker.conf.json / .dependency-cruiser.json / .jscpd.json — invariants

⚠️ `stryker.conf.json` mutates ALL PURE modules: `lib-pure.js` + `sources/file.js` + `frontmatter.js` (their purity is guaranteed by the dependency-cruiser gates). NEVER the I/O files — equivalent mutants guaranteed. New pure module ⇒ add it to `mutate` **AND** to the `include` of `vitest.stryker.config.mjs` (the ONLY suites launched by Stryker — vitest perTest runner since 2026-07-16, commandRunner BANNED, anti-return gate in mutation-workflow-gate.test.js); a mutated file without its suite = misleading massacre (mutants "surviving" for lack of a LAUNCHED test, not a missing one).
⚠️ Break 99, **ratchet NEVER lowered**. Do not raise it to the exact score either: the margin is deliberate.
⚠️ `timeoutMS: 60000` = THE ROOT CAUSE of "the local score lies" (fixed 2026-07-15). Without it, Stryker default ~12s ⇒ loaded machine ⇒ a normal run expires ⇒ Stryker counts the EXPIRED one as KILLED ⇒ INFLATED score (measured: **100% local with 411 timeouts and 0.17 test/mutant** = almost nothing was executed). Since the fix: **local 99.33% = CI 99.33%, 0 timeout on both sides**. NEVER lower it to "speed things up": that reintroduces the silent lie, and a false score is worse than no score.
⚠️ Suspicious local score (timeouts > 0, or "X tests per mutant" < 1) ⇒ the run proves NOTHING, whatever the displayed figure. Read these 2 lines BEFORE the score.
CI remains FASTER (4 min vs 12 min on a loaded machine): the normal loop is "push → read the CI". Local is now TRUE, not faster.
⚠️ Property tests EXCLUDED from the Stryker runner (slow, non-deterministic) ⇒ any guard proven by a property MUST have its deterministic case in `*.test.js`, otherwise its mutant survives and the score lies.
⚠️ A test must NEVER derive its expectation from the value it checks: `for (const m of MODES)` mutated WITH the code → invisible mutant. CONTRACT values = written HARDCODED in the test.
⚠️ REDUNDANT guard = equivalent mutant: avoid it BY CONSTRUCTION, never test it. (The parser's `#` check was already covered by the `[A-Za-z0-9_-]+` regex → removed, 3 mutants gone and simpler code.)
⚠️ Truly equivalent mutant (message wording) ⇒ TARGETED `// Stryker disable StringLiteral` + a comment that justifies it. NEVER extend a disable to LOGIC; never couple a test to an internal Stryker string (breaks on tool upgrade).
⚠️ `"incremental": true` served a STALE result (2026-07-15): suspicious score ⇒ purge `reports/` + `.stryker-tmp/` BEFORE concluding. The cache lies in BOTH directions.
`.dependency-cruiser.json`: new `.js` ⇒ add it to `includeOnly`, otherwise `check:deps` does not see it (silent false negative). Purity gated: lib-pure, sources/, frontmatter · Autonomy gated: deadline, stdin-json, paths.
`jsconfig.json` (㉑, 2026-08-16): tsc --checkJs via `npm run check:types`, ratchet 0 error. WITHOUT noImplicitAny/strictNullChecks (pragmatic JS level); `paths` redirects `string_decoder` to the builtin types (an npm package 1.1.1 from HOME shadows the builtin via @types/node — 53 false errors otherwise).
`vitest.stryker.config.mjs` carries `testTimeout: 30000` (2026-08-16): the exhaustive differential under instrumentation + 3 runners crossed vitest's 5 s wall ⇒ aborted dry-run, INTERMITTENT. A bound lengthens no test — NEVER remove it "because it passes cold".
`.jscpd.json`: threshold 1%. Duplication detected ⇒ extract a shared module, NEVER raise the threshold.
