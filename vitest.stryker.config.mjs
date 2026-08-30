// ═══════════════════════════════════════════════════════════════════════
// vitest — config DEDICATED TO STRYKER (stryker.conf.json → vitest.configFile).
// ⚠️ Includes ONLY the DETERMINISTIC suites covering the mutated modules.
//    - NEVER the property tests (slow, non-deterministic: one flaky run
//      per mutant = a score that lies) — their invariant MUST have its
//      deterministic case in one of the suites below (cf lib-pure.md).
//    - NEVER the spawning suites (doctor/integration/lint-corpus/lock):
//      they do not cover the pure in-process modules; they would only
//      inflate the initial dry run.
// ⚠️ New mutated pure module ⇒ its deterministic suite is added HERE (and the
//    mutation-workflow-gate.test.js gate checks the mirror with mutation.yml).
// ═══════════════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/harness-conformance.test.js',
    'test/differential-normalize.test.js',
    'test/corpus-cache.test.js',
      'test/deps-criticality-pure.test.js',
      'test/lib-pure.test.js',
      'test/canary.test.js',
      // ⚠️ The stale-code verdict (2026-08-24): deterministic, hermetic, and the
      //    ONLY suite covering `src/stale-code-pure.js`. Absent here its mutants sit
      //    at NoCoverage while the module looks mutated.
      'test/stale-code-pure.test.js',
      // ⚠️ English-only COMMIT gate: deterministic suite covering src/commit-msg-lang.js.
      'test/commit-msg-lang.test.js',
      // ⚠️ Anti-leak COMMIT gate (2026-08-27): deterministic suite covering
      //    src/commit-msg-leak.js. Absent from this list its mutants sit at
      //    NoCoverage while the module looks measured.
      'test/commit-msg-leak.test.js',
      // ⚠️ English-only IDENTIFIER gate. `foreign-identifier-gate.test.js` spawns `git`
      //    and `ast-grep`, so it never enters this runner: only the PURE verdict is
      //    mutated, and this is the suite that kills its mutants. It was MISSING from
      //    this list while `src/foreign-identifier-pure.js` sat in `mutate` and in
      //    `mutation.yml` — measured 2026-08-25: the module was mutated and measured by
      //    NOTHING, the exact "misleading massacre" the header above warns about, and
      //    no gate could see it because the two mirror checks only compared
      //    stryker.conf.json and mutation.yml to each other.
      'test/foreign-identifier-pure.test.js',
      // The four route names of our own wire protocol (2026-08-25): the ONLY
      // suite covering `src/protocol-routes-pure.js`. Absent here its mutants
      // would sit at NoCoverage while the module looks measured — the exact hole
      // `foreign-identifier-pure.js` fell into the day before.
      'test/protocol-routes-pure.test.js',
      // Which content index a connecting HTTP frame receives (2026-08-29): the
      // ONLY suite covering `src/frame-sequencer-pure.js`. Same reasoning as the
      // protocol-routes suite above — absent here, its mutants sit at
      // NoCoverage while the module looks measured.
      'test/frame-sequencer-pure.test.js',
      'test/delivery-notice-pure.test.js',
      'test/sources-file.test.js',
      // ⚠️ `keys` operator (19/08/2026): DETERMINISTIC suite covering sources/file.js.
      //    Absent from this list its cases exist but Stryker never runs them ⇒ the
      //    operator's branches sit at NoCoverage while the fleet suite is green —
      //    a module believed mutated and measured on nothing (62 survivors, measured).
      'test/keys-operator.test.js',
      'test/operator-consumption-gate.test.js',
      'test/observable-reach-gate.test.js',
      // ⚠️ The judge of `language-spec.js` is the EXHAUSTIVE differential: a mutant
      //    of the spec must be killed by the confrontation with the engine. It is
      //    deterministic (total enumeration, zero randomness) — it belongs here.
      'test/spec-differential.test.js',
      'test/sources-tool.test.js',
      'test/sources-mcp.test.js',
      'test/sources-session.test.js',
      'test/sources-skill.test.js',
      'test/frontmatter.test.js',
      'test/loader.test.js',
      'test/lint.test.js',
      'test/collisions.test.js',
      'test/gate.test.js',
      // ⚠️ The cadence differential exercises `gate.js` — WHICH IS MUTATED — over 11,346
      //    exhaustive cases. Absent from this list, those cases exist and Stryker never
      //    runs them: the cascade/alternation/filter branches would be measured on
      //    nothing, exactly the trap `keys-operator.test.js` fell into (62 survivors).
      //    Deterministic (total enumeration, zero randomness) — it belongs here.
      'test/cadence-differential.test.js',
      'test/budget.test.js',
      'test/docfacts.test.js',
      // ⚠️ DETERMINISTIC half only — the LAWS of the scanner live in the same file
      //    but fast-check is excluded from this runner; each law has its case here.
      'test/scope-reach-pure.test.js',
      'test/derived-observables.test.js',
      'test/temporal-budget-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the disk-writer gate. `disk-writers-gate.test.js`
      //    spawns `git` and `ast-grep`, so it never enters this runner; absent
      //    this line the verdict would be MUTATED and measured by NOTHING —
      //    exactly the "misleading massacre" the header above warns about.
      'test/disk-writers-pure.test.js',
      // ⚠️ The DECISION half of the fleet's DEAD-MAN SWITCH. `doctor.test.js` spawns the real tool
      //    and never enters this runner; absent this line the split-brain, frame-coordinate and
      //    lane-coherence verdicts would be MUTATED and measured by NOTHING — a misleading
      //    massacre on the one judge that decides whether the framework is alive at all.
      'test/doctor-wiring-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the quadratic gate. `quadratic-gate.test.js`
      //    itself spawns `git` and `ast-grep`, so it never enters this runner:
      //    only the PURE verdict is mutated, and this is the suite that kills
      //    its mutants. Absent from this list, `quadratic-budget-pure.js` would
      //    be mutated and measured by NOTHING — a misleading massacre.
      'test/quadratic-budget-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the rendezvous gate (2026-08-25).
      //    `rendezvous-address-gate.test.js` spawns `git` and `ast-grep`, so it
      //    never enters this runner: only the PURE verdict is mutated, and this
      //    is the suite that kills its mutants. Absent from this list,
      //    `rendezvous-budget-pure.js` would be mutated and measured by NOTHING —
      //    the exact hollow green `mutation-workflow-gate` was extended to catch.
      'test/rendezvous-budget-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the state-entry-rebuild gate.
      //    `state-entry-rebuild-gate.test.js` itself spawns `git` and
      //    `ast-grep`, so it never enters this runner: only the PURE verdict is
      //    mutated, and this is the suite that kills its mutants. Absent from
      //    this list, `state-entry-rebuild-pure.js` would be mutated and
      //    measured by NOTHING — a misleading massacre.
      'test/state-entry-rebuild-pure.test.js',
      // ⚠️ `memory-store.js` is the I/O shell and is NOT mutated; its DECISIONS
      //    live in `memory-store-pure.js`, which is — and this suite is what
      //    kills those mutants. Absent from this list, the LRU and the ceiling
      //    would be measured by nothing.
      'test/memory-store.test.js',
      // ⚠️ `state-eviction.js` is the I/O shell (readdir/unlink) and is NOT mutated; the rule that
      //    decides WHAT disappears lives in `state-eviction-pure.js`, which is — and this is the
      //    deterministic suite that kills its mutants. Absent from this list, the age bound, the
      //    per-class ceilings and the matcher would be measured by NOTHING: exactly the "cleaner
      //    that selects nothing" the module exists to make impossible.
      'test/state-eviction-pure.test.js',
      // ⚠️ The DETERMINISTIC half of `state-crdt-pure.js` — the lattice laws AND the
      //    zero-regression differential against `gate.decide` / `turn-core.bump` /
      //    `emission-core.emit`. The LAWS themselves are generated
      //    (`state-crdt-pure.property.test.js`) and fast-check never enters this
      //    runner: absent this line the module would be mutated and measured by
      //    NOTHING — a structure whose whole claim is "these writes commute",
      //    believed proven.
      'test/state-crdt-pure.test.js',
      // ⚠️ The rendezvous address: a PURE function, deterministic, spawn-free.
      //    The behaviour under real processes lives in `state-daemon.test.js`,
      //    which spawns and therefore never enters this runner.
      'test/kernel-endpoint.test.js',
      // ⚠️ The DRIFT GATE spawns and skips without a machine wiring, so it carries NO
      //    mutant. Only this in-process suite can kill them — absent, `wiring-plan.js`
      //    would be mutated and measured by NOTHING.
      'test/wiring-plan.test.js',
      // ⚠️ The SPLICE half of the same module — the decision that removes
      //    declarations from the operator's settings.json. Absent from this
      //    list its cases exist and Stryker never runs them: ownership,
      //    block keying and entry writing would sit at NoCoverage while the
      //    fleet suite is green — a decision that DELETES configuration,
      //    believed mutated and measured by NOTHING.
      'test/wiring-plan-splice.test.js',
      // ⚠️ The HARNESS DIALECT of a wiring — the decision that turns the neutral
      //    declaration list into the document a THIRD harness reads. Its own
      //    integration cell spawns the generator and therefore never enters this
      //    runner: absent from this list, `wiring-dialect.js` would be mutated and
      //    measured by NOTHING — a renderer that silently drops a field, believed
      //    covered.
      'test/wiring-dialect.test.js',
      // ⚠️ `lifecycle-log.js` is the I/O shell (stat/rename/append) and is NOT
      //    mutated; the rules that decide WHEN the journal turns over and WHAT a
      //    record looks like live in `lifecycle-log-pure.js`, which is — and this
      //    is the deterministic suite that kills its mutants. Absent from this
      //    list, the ceiling and the closed event vocabulary would be mutated and
      //    measured by NOTHING: a bounded writer proven by nobody.
      'test/lifecycle-log-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the model-twin gate. `model-twin-gate.test.js` itself spawns
      //    `git`, so it never enters this runner: only the PURE detector and verdict are mutated,
      //    and this is the suite that kills their mutants. Absent from this list,
      //    `model-twin-pure.js` would be mutated and measured by NOTHING — a misleading massacre
      //    on the judge whose entire job is to keep the OTHER judges honest.
      'test/model-twin-pure.test.js',
      // ⚠️ The DETERMINISTIC half of the declarable addresses (state, MCP docs,
      //    session docs, and the config's own launch argument).
      //    `test/declared-paths.test.js` mutates `process.env` and SPAWNS, so it
      //    belongs to the heavy lane and never enters this runner: only the PURE
      //    precedence is mutated, and this is the suite that kills its mutants.
      //    Absent from this list, an inverted order — the config beating
      //    `CTXROUTE_STATE_DIR` — would be measured by NOTHING, and every
      //    self-isolating suite would start writing into the REAL state.
      'test/declared-paths-pure.test.js',
    ],
    exclude: ['**/node_modules/**'],
    // ⚠️ A BOUND, not a wait (the repo's testTimeout doctrine): the exhaustive
    //    differential (~409k cases, ~2 s cold) runs here UNDER Stryker
    //    INSTRUMENTATION with 3 concurrent runners — measured 16/08/2026:
    //    dry run > 5,000 ms ⇒ vitest's default wall hit, ENTIRE run aborted,
    //    intermittently (it had passed an hour earlier). No test is slowed
    //    down: only whatever exceeds the bound is tolerated up to it.
    testTimeout: 30000,
    reporters: ['default'],
  },
});
