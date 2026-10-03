// ═══════════════════════════════════════════════════════════════════════
// cadence-differential.test.js — THE MODEL ⟷ THE ENGINE, ON THE CADENCE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY (19/08/2026): the twin of `spec-differential.test.js`, for the half of
//    the language that had no machine judge. Every other cadence test CALLS the
//    engine, so they prove what it DOES, never what it SHOULD DO — and the
//    cadence axis had already paid that twice, both times "accepted and inert"
//    (`enforce` not transported to the MCP channel, i.e. mute exactly where the
//    founding incident lives; then `defaults.mcp` short-circuited by a source
//    that FILLED a default). Both found by ARMING them for real, never by a test.
//
// 📐 METHOD, identical to the matching side: EXHAUSTIVE enumeration on a finite
//    domain — a proof, not a sample. Zero dependency; on a domain you can
//    exhaust, a `for` loop is strictly stronger than a solver.
// 🛑 NEVER reimplement `gate.js` here to "predict" the answers: we call the
//    source, period. And a divergence is NEVER silenced by "adjusting" the
//    model — you DECIDE which side is right and you write it down.
// ⚠️ THE DOMAIN MUST CARRY EVERY FORM OF THE CADENCE: the 4 cascade stages, the
//    INVALID values (they are what prove the total fallback), the two drift
//    units, the alternation flag, and the filter at BOTH stages. Removing one
//    makes a whole class unreachable — the lesson of the depth hole of 14/08.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import gate from '../src/gate.js';
import * as spec from '../src/cadence-spec.js';
import { knownKeys } from '../src/frontmatter.js';

// ⚠️ A BOUND, NEVER A WAIT: no test here is slowed down, only one that exceeds it is cut.
//    MEASURED 2026-10-02: the whole-domain cell takes 3.1 s cold on the maintainer's machine,
//    and ~30 s on a GitHub runner during Stryker's dry run (instrumentation + perTest coverage
//    + 3 runners). Its domain doubled on 2026-09-23 (408,996 → 883,386 cases) and nobody moved
//    the old 30 s bound: the dry run passed on 2026-10-01 and timed out on 2026-10-02, so the
//    WHOLE mutation verdict died on a ceiling, not on a defect. Four times the observed worst.
// 🛑 If the domain grows again, re-measure under instrumentation and move THIS line, never
//    shrink the domain to fit the clock.
const EXHAUSTIVE_BOUND_MS = 120000;

// The owner sources of the real registry, plus `undefined` = the parity path
// (no `owners` passed at all, i.e. what every differential replays).
const SOURCES = ['file', 'mcp', 'skill', 'tool', undefined];

// ⚠️ EVERY LIST CARRIES AN INVALID VALUE, ON PURPOSE. The total fallback ("an
//    invalid value ignores itself and we go down") is a LOAD-BEARING promise: a
//    domain of valid values only would never test it.
const VALUES = {
  mode: [undefined, 'dumb', 'once', 'smart', 'bogus'],
  threshold: [undefined, 0, 1, 3, 'x'],
  driftUnit: [undefined, 'tool', 'turn', 'x'],
  enforce: [undefined, true, false, 'x'],
  // `category` NORMALIZES to a list (string → singleton, list → filtered), so
  // its own DEDICATED cascade test (①bis, below) compares by VALUE, never by
  // `!==` — an array is never `===` its own equal twin. The generic loop of
  // ① stays scalar-only on purpose; adding category there would silently
  // pass by REFERENCE inequality on every single case (a vacuous green).
  category: [undefined, 'x', ['x'], ['x', 'y'], '', [], 'bogus'],
  // `response` is an OBJECT, compared BY VALUE in its own test (①ter) for the same reason as
  // `category`. The invalid forms are the load-bearing half: an empty filter, an empty `scope`,
  // an unknown key, a mixed `scope`, a grouped `exclude`, a bare string.
  response: [
    undefined, { scope: ['posted'] }, { exclude: ['error'] }, { scope: [['a', 'b'], ['c']] },
    { scope: ['x'], exclude: ['y'] }, {}, { scope: [] }, { foo: ['x'] }, { scope: ['a', ['b']] },
    { exclude: [['a']] }, 'posted', null,
  ],
};
const GLOBAL_KEY = { mode: 'mode', threshold: 'defaultThreshold', driftUnit: 'defaultDriftUnit', enforce: 'enforce' };

// ── ⓪ THE DOMAIN EXERCISES EVERY CADENCE KEY OF THE VOCABULARY ──────────
// 🔴 THE CLASS THIS CLOSES: on 19/08/2026 `keys` shipped into the vocabulary and into NO
//    judge — only PROSE said an operator must be taught to its models, and the operator
//    shipped outside anyway. A machine now refuses it, on BOTH halves of the language.
// ⚠️ DERIVED FROM `KNOWN` (the whole vocabulary), so a word added tomorrow lands here by
//    itself and stays RED until someone either exercises it or declares why it is not a
//    cadence key. Every exclusion below is a DECISION, never a convenience.
const HORS_CADENCE = {
  match: 'a TRIGGER: it selects, it does not schedule (spec-differential + triggers-gate)',
  mcp: 'corpus routing by PATH, consumed by no cadence resolver',
  rules: 'a TRIGGER in per-entry form (same judges as `match`)',
  tool: 'a TRIGGER on the tool name (same judges)',
  inject: 'disarms a doc upstream of any cadence — it never reaches `decide`',
  scope: 'a MATCHING filter — judged by spec-differential, on the other half',
  exclude: 'a MATCHING filter — same',
  keys: 'the MATCHING key universe — same',
  rank: 'an emission ORDER: it decides no delivery (loader.test.js)',
  note: 'the ONLY field the engine NEVER reads — an author comment, inert by contract',
};
// 🛑 BOUND DECLARED HERE, NOT RAISED GLOBALLY (2026-08-20). These tests ENUMERATE a domain, so
//    their cost follows the domain, not the machine. CI measured 6,232 ms against ~3,600 ms
//    locally and the 5 s wall of the fast lane BROKE — after having already been grazed at
//    4,992 ms. Raising the lane to 30 s would make 1,000 tests that should fail in 5 s wait for
//    30. A timeout is a BOUND, never a wait: it lengthens nothing, it only refuses what runs long.
//    ⚠️ Growing the domain is what moves this number — re-measure, never bump it to silence a red.

test('⓪ the DOMAIN exercises every CADENCE key of the vocabulary', () => {
  const exercised = new Set(Object.keys(VALUES));
  assert.ok(exercised.size >= 3, `suspicious domain: only ${exercised.size} settings exercised`);
  const missing = knownKeys().filter((k) => !(k in HORS_CADENCE) && !exercised.has(k));
  assert.deepStrictEqual(
    missing, [],
    `cadence key(s) the exhaustive domain NEVER exercises: ${missing.join(', ')} — this differential therefore measures a cadence that is not ours. Extend the domain, or declare the key in HORS_CADENCE WITH ITS REASON. Shipping a behaviour INCLUDES its judges.`,
  );
  // INVERSE CHECK: a justification that has become false must turn red too — the same
  // discipline as ASYMETRIES_JUSTIFIEES. An excluded key that the domain DOES exercise
  // means the reason is stale, and a stale reason is how a gate starts lying.
  const stale = Object.keys(HORS_CADENCE).filter((k) => exercised.has(k));
  assert.deepStrictEqual(stale, [], `STALE justification(s): ${stale.join(', ')} are declared out of the cadence yet the domain exercises them.`);
});

// ── ① THE CASCADE, EXHAUSTIVELY, SETTING BY SETTING ─────────────────────
const RESOLVERS = {
  mode: gate.modeForDoc,
  threshold: gate.thresholdForDoc,
  driftUnit: gate.driftUnitForDoc,
  enforce: gate.enforceForDoc,
};

test('CADENCE ⟷ ENGINE ①: the 4-stage cascade, EXHAUSTIVE on every setting', { timeout: EXHAUSTIVE_BOUND_MS }, () => {
  const divergences = [];
  let cas = 0;
  for (const setting of Object.keys(RESOLVERS)) {
    for (const entree of VALUES[setting]) {
      for (const categorie of VALUES[setting]) {
        for (const globale of VALUES[setting]) {
          for (const source of SOURCES) {
            const config = { [GLOBAL_KEY[setting]]: globale };
            if (source) config.defaults = { [source]: { [setting]: categorie } };
            const decl = { [setting]: entree };
            const engine = RESOLVERS[setting](config, decl, source);
            const model = spec.resolve(setting, config, decl, source);
            cas++;
            if (engine !== model) {
              divergences.push(`${setting} entry=${JSON.stringify(entree)} defaults=${JSON.stringify(categorie)} global=${JSON.stringify(globale)} source=${source} engine=${JSON.stringify(engine)} spec=${JSON.stringify(model)}`);
            }
          }
        }
      }
    }
  }
  // ⚠️ ANTI-DORMANCY: an empty domain would go green while proving NOTHING — a
  //    defect this repo has paid for three times (deps-purity, deadline-gate,
  //    layers-gate). The count is DISPLAYED so it can be quoted, never guessed.
  assert.ok(cas >= 1000, `suspicious domain: ${cas} cases`);
  console.log(`  → cascade: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [],
    `${divergences.length} cascade divergence(s). DECIDE which side is right, never align the spec on the engine.`);
});

// ── ①bis THE `category` CASCADE, EXHAUSTIVE — compared BY VALUE ─────────
// ⚠️ `category` has ONLY 2 stages (entry > defaults.{source}), same asymmetry
//    as `enforce` (no global: a global restriction would silence the fleet's
//    very first gesture) — so this domain has NO `globale` dimension at all,
//    unlike the generic loop above.
// The SESSION side of `category`: nothing declared, an empty list, one shared name, one
// foreign name, several (partly shared), and a bare STRING (not a list: never read as one).
const SESSIONS = [undefined, [], ['x'], ['y'], ['x', 'y'], ['z'], 'x', ['', 'y']];

test('CADENCE ⟷ ENGINE ①bis: `category` cascade, EXHAUSTIVE', () => {
  const divergences = [];
  let cas = 0;
  let exclusions = 0;
  for (const entryValue of VALUES.category) {
    for (const defaultsValue of VALUES.category) {
      for (const source of SOURCES) {
        const config = source ? { defaults: { [source]: { category: defaultsValue } } } : {};
        const decl = { category: entryValue };
        const engine = gate.categoryForDoc(config, decl, source);
        const model = spec.categoryOf(config, decl, source);
        cas++;
        if (JSON.stringify(engine) !== JSON.stringify(model)) {
          divergences.push(`entry=${JSON.stringify(entryValue)} defaults=${JSON.stringify(defaultsValue)} source=${source} engine=${JSON.stringify(engine)} spec=${JSON.stringify(model)}`);
        }
        // 🔴 23/09/2026 — THE EXCLUSION ITSELF WAS NEVER CONFRONTED. This cell compared only
        //    the REQUIRED list; the verdict against a SESSION lived in two hand-picked cases,
        //    so turning the engine's "one shared category is enough" into "all are required"
        //    stayed GREEN here (measured by sabotage). Every session shape is now crossed.
        for (const session of SESSIONS) {
          const engineOut = gate.categoryExcluded(config, decl, source, session);
          const modelOut = spec.categoryExcludedSpec(config, decl, source, session);
          exclusions++;
          if (engineOut !== modelOut) {
            divergences.push(`EXCLUSION entry=${JSON.stringify(entryValue)} defaults=${JSON.stringify(defaultsValue)} source=${source} session=${JSON.stringify(session)} engine=${engineOut} spec=${modelOut}`);
          }
        }
      }
    }
  }
  assert.ok(cas >= 200, `suspicious domain: ${cas} cases`);
  // ANTI-DORMANCY for the exclusion half: a session list emptied by mistake would pass by vacuity.
  assert.ok(exclusions >= cas * 5, `suspicious exclusion domain: ${exclusions} cases for ${cas} cascades`);
  console.log(`  → category exclusion: ${exclusions} cases`);
  console.log(`  → category cascade: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [],
    `${divergences.length} category-cascade divergence(s). DECIDE which side is right, never align the spec on the engine.`);
});

// ── ①ter THE `response` CASCADE, EXHAUSTIVE — compared BY VALUE ─────────
// ⚠️ Two stages like `category` (entry > defaults.{source}), then the framework's `null`: no
//    global stage, and the domain proves it by never reading one.
// 🛑 A CARTESIAN PRODUCT AS ONE FLAT LIST, never one `for` per axis: the quadratic ratchet of
//    this file only goes down, and a new axis of a domain owes it nothing. Row `i` is decoded
//    from its index (mixed radix), so no traversal ever sits inside another.
const pickRow = (axes, i) => {
  let rest = i;
  return axes.map((axis) => {
    const value = axis[rest % axis.length];
    rest = Math.floor(rest / axis.length);
    return value;
  });
};
const product = (axes) => Array.from({ length: axes.reduce((n, axis) => n * axis.length, 1) }, (_, i) => pickRow(axes, i));

test('CADENCE ⟷ ENGINE ①ter: `response` cascade and form, EXHAUSTIVE', () => {
  const divergences = [];
  let cas = 0;
  for (const [entryValue, defaultsValue, source] of product([VALUES.response, VALUES.response, SOURCES])) {
    const config = source ? { defaults: { [source]: { response: defaultsValue } } } : {};
    const decl = { response: entryValue };
    const engine = gate.responseForDoc(config, decl, source);
    const model = spec.answerFilterOf(config, decl, source);
    cas++;
    if (JSON.stringify(engine) !== JSON.stringify(model)) {
      divergences.push(`entry=${JSON.stringify(entryValue)} defaults=${JSON.stringify(defaultsValue)} source=${source} engine=${JSON.stringify(engine)} spec=${JSON.stringify(model)}`);
    }
  }
  assert.ok(cas >= 500, `suspicious domain: ${cas} cases`);
  console.log(`  → response cascade: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 5), [],
    `${divergences.length} response-cascade divergence(s). DECIDE which side is right, never align the spec on the engine.`);
});

// ── ②③ DELIVERY AND DRIFT, THROUGH THE REAL `decide` ────────────────────
test('CADENCE ⟷ ENGINE ②③: delivery and drift, EXHAUSTIVE (both units)', { timeout: EXHAUSTIVE_BOUND_MS }, () => {
  const divergences = [];
  let cas = 0;
  for (const mode of spec.MODES) {
    for (const unite of spec.DRIFT_UNITS) {
      // ⚠️ FOUR thresholds, not three: the anti-dormancy floor below demands 300 cases and
      //    three gave 288. 🛑 The floor is NOT lowered to fit — a floor that yields to the
      //    domain stops being a floor. The DOMAIN widens.
      for (const threshold of [1, 2, 3, 4]) {
        for (const vu of [false, true]) {
          for (const derive of [0, 1, 2, 3]) {
            for (const turnCount of [0, 5]) {
              // The memory is built so the DRIFT is exactly `derive` in the doc's
              // own unit — that is what makes the two units comparable.
              const state = vu
                ? { a: { seen: true, sinceLastCall: unite === 'tool' ? derive : 0, turn: turnCount - (unite === 'turn' ? derive : 0) } }
                : {};
              const decls = { a: { mode, threshold: threshold, driftUnit: unite } };
              const args = [{}, decls, ['a'], state, turnCount, { a: 'file' }, 'Bash'];
              const m = gate.decide(...args);
              const s = spec.decide(...args);
              cas++;
              if (JSON.stringify(m) !== JSON.stringify(s)) {
                divergences.push(`mode=${mode} unit=${unite} seuil=${threshold} vu=${vu} derive=${derive} turn=${turnCount}\n    engine=${JSON.stringify(m)}\n    spec  =${JSON.stringify(s)}`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(cas >= 300, `suspicious domain: ${cas} cases`);
  console.log(`  → delivery/drift: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 3), [],
    `${divergences.length} delivery divergence(s). DECIDE which side is right.`);
});

// ── ④⑤ THE WHOLE DECISION: memory, alternation, filter ──────────────────
// ⚠️ TWO docs are REQUIRED: `b` lives in the memory WITHOUT being selected, and
//    that is the only way to reach the "a gesture that ignored me makes me
//    drift" rule. With a single doc the whole clause is unreachable and the
//    differential would pass by vacuity.
const MEMORIES = () => [
  {},
  { a: { seen: true, sinceLastCall: 0, turn: 0 } },
  { a: { seen: true, sinceLastCall: 2, turn: 0 } },
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: true } },
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: false } },
  { b: { seen: true, sinceLastCall: 1, turn: 0 } },
  { a: { seen: true, sinceLastCall: 1, turn: 0 }, b: { seen: true, sinceLastCall: 3, turn: 0 } },
  // 🔴 THE ANTIPHASE — added 2026-08-24 after a PRODUCTION defect this domain could
  //    not express. Two enforcing documents whose refusal flags are OPPOSITE block on
  //    alternating actions, and since an action is refused as soon as ONE of them
  //    blocks, the gesture is refused FOR EVER while each document, read alone, obeys
  //    "never twice in a row". Measured live: three consecutive refusals of the same
  //    gesture. 🛑 Without BOTH of these memories AND an enforcing `b`, the case is
  //    unreachable and this differential stays green on a permanent denial of service —
  //    it did, for the whole life of the file.
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: true }, b: { seen: true, sinceLastCall: 0, turn: 0, denied: false } },
  { a: { seen: true, sinceLastCall: 0, turn: 0, denied: false }, b: { seen: true, sinceLastCall: 0, turn: 0, denied: true } },
];
// ⚠️ matched × « can `b` refuse too? », FLATTENED INTO ONE DIMENSION on purpose
//    (2026-08-24). The domain owed a case with TWO enforcing docs — without it the
//    alternation could only ever be exercised as a property of a DOCUMENT, never of
//    the ACTION, which is exactly how a permanent denial of service stayed green.
//    🛑 Written as a product rather than a second `for`: the quadratic ratchet only
//    goes DOWN, and a new axis of a domain owes no new nesting level.
const MATCHED_X_ENFORCE_B = [['a'], ['a', 'b'], []].flatMap((m) => [[m, false], [m, true]]);
const FILTERS = () => [
  {},
  { filterMode: 'blacklist', filterList: ['Bash'] },
  { filterMode: 'whitelist', filterList: ['Autre'] },
  { filterMode: 'blacklist', filterList: ['*'] },
  { filterMode: 'blacklist', filterList: ['stripe'] },
  { filterMode: 'bogus', filterList: ['Bash'] },
];

test('CADENCE ⟷ ENGINE ④⑤: memory, alternation and filter, EXHAUSTIVE', { timeout: EXHAUSTIVE_BOUND_MS }, () => {
  const divergences = [];
  let cas = 0;
  for (const mode of spec.MODES) {
    for (const enforce of [undefined, true, false]) {
      for (const unite of spec.DRIFT_UNITS) {
        for (const memoire of MEMORIES()) {
          for (const filter of FILTERS()) {
            for (const surCategorie of [false, true]) {
              for (const toolName of ['Bash', 'mcp__stripe__pay']) {
                for (const [matched, enforceB] of MATCHED_X_ENFORCE_B) {
                  // The filter pair is placed at the GLOBAL stage or at the
                  // CATEGORY stage — the two must not be mixable, and the only
                  // way to prove it is to enumerate both.
                  const config = surCategorie ? { defaults: { file: { ...filter } } } : { ...filter };
                  const decls = {
                    a: { mode, threshold: 2, driftUnit: unite, enforce },
                    b: { mode: 'smart', threshold: 2, driftUnit: 'tool', enforce: enforceB },
                  };
                  const owners = { a: 'file', b: 'file' };
                  const args = [config, decls, matched, memoire, 3, owners, toolName];
                  const m = gate.decide(...args);
                  const s = spec.decide(...args);
                  cas++;
                  if (JSON.stringify(m) !== JSON.stringify(s)) {
                    divergences.push(`mode=${mode} enforce=${enforce} enforceB=${enforceB} unit=${unite} tool=${toolName} matched=${JSON.stringify(matched)} filtre=${JSON.stringify(filter)}@${surCategorie ? 'defaults' : 'global'} memoire=${JSON.stringify(memoire)}\n    engine=${JSON.stringify(m)}\n    spec  =${JSON.stringify(s)}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(cas >= 3000, `suspicious domain: ${cas} cases`);
  console.log(`  → memory/alternation/filter: ${cas} cases`);
  assert.deepStrictEqual(divergences.slice(0, 3), [],
    `${divergences.length} decision divergence(s). DECIDE which side is right.`);
});

// ── ⑥ THE TWO MOMENTS OF ONE ACTION: before it runs, after it answered ──
// ⚠️ THE ANSWERS CARRY EVERY FORM A HARNESS HANDS OVER, measured 2026-09-23: plain text, the
//    MCP structured result SERIALISED as a string (Claude Code 2.1.280), an object with the
//    text nested in `content` (a Read, a Gemini `llmContent`), a key that names the pattern
//    WITHOUT the text saying it (must NOT satisfy), a backslash path, a JSON string of a
//    string, a number, `null`. Without the key-only answer the "keys say nothing" clause is
//    unreachable; without the serialised form, harness independence is.
const ANSWERS = () => [
  'invoice F42 state: posted',
  '{"state":"posted"}',
  '{"posted":1}',
  { content: [{ type: 'text', text: 'Error: port taken' }] },
  { file: { content: 'C:\\Deploy\\POSTED.txt' } },
  '"posted"',
  42,
  null,
];
// ⚠️ `a` waits for an answer, `b` never does — so every case holds one doc of EACH moment, and
//    the "a doc of the other moment is not this decision's business" clause is always reachable.
//    `b` sits in memory too, so the "one action is one tick of drift" clause is reachable.
// 🛑 BUILT AS ONE FLAT LIST OF CASES, never a new nesting level: the quadratic ratchet of this
//    file only goes down, and a new axis of a domain owes it nothing.
const MOMENT_CASES = () => {
  const moments = [undefined].concat(ANSWERS().map((response) => ({ response })));
  const filters = [{ scope: ['posted'] }, { exclude: ['error'] }, { scope: [['posted'], ['state']] }, { scope: ['port'], exclude: ['posted'] }, undefined];
  const memos = [{}, { a: { seen: true, sinceLastCall: 1, turn: 0 }, b: { seen: true, sinceLastCall: 1, turn: 0 } }];
  return product([moments, filters, spec.MODES, [undefined, true], memos])
    .map(([moment, filter, mode, enforce, memo]) => ({ moment, filter, mode, enforce, memo }));
};

test('CADENCE ⟷ ENGINE ⑥: the moment of the action and the answer\'s filter, EXHAUSTIVE', { timeout: EXHAUSTIVE_BOUND_MS }, () => {
  const divergences = [];
  let cas = 0;
  let delivered = 0;
  for (const c of MOMENT_CASES()) {
    const decls = {
      a: { mode: c.mode, threshold: 2, driftUnit: 'tool', enforce: c.enforce, response: c.filter },
      b: { mode: 'smart', threshold: 2, driftUnit: 'tool', enforce: c.enforce },
    };
    const args = [{}, decls, ['a', 'b'], c.memo, 3, { a: 'mcp', b: 'file' }, 'mcp__odoo__call', undefined, c.moment];
    const m = gate.decide(...args);
    const s = spec.decide(...args);
    cas++;
    if (c.moment !== undefined && m.inject.includes('a')) delivered++;
    if (JSON.stringify(m) !== JSON.stringify(s)) {
      divergences.push(`moment=${JSON.stringify(c.moment)} filter=${JSON.stringify(c.filter)} mode=${c.mode} enforce=${c.enforce} memo=${JSON.stringify(c.memo)}\n    engine=${JSON.stringify(m)}\n    spec  =${JSON.stringify(s)}`);
    }
  }
  assert.ok(cas >= 400, `suspicious domain: ${cas} cases`);
  // ⚠️ ANTI-VACUITY: a filter that NEVER lets an answer through would agree with a model that
  //    never does either. The domain must deliver after the answer, and not always.
  assert.ok(delivered > 20 && delivered < cas / 2, `suspicious delivery count after the answer: ${delivered}/${cas}`);
  console.log(`  → moment/answer: ${cas} cases, ${delivered} deliveries after the answer`);
  assert.deepStrictEqual(divergences.slice(0, 3), [],
    `${divergences.length} moment/answer divergence(s). DECIDE which side is right.`);
});

// ── NEGATIVE-CHECKS: a differential never seen turning red proves nothing ──
test('NEGATIVE-CHECK: the differential DETECTS a false cadence semantics', () => {
  // Each sabotage is a REAL defect this repo has lived, or its exact mirror.
  const sabotages = [
    // ── `response` (2026-09-23): the three clauses of the two moments of one action ──
    {
      itemName: 'the action ticks a SECOND time once the tool answered (a `smart` doc returns after half its threshold)',
      decide: (config, decls, matched, state, turn, owners, tool, cats, after) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool, cats, after);
        return { ...r, state: { ...r.state, b: { ...state.b, sinceLastCall: state.b.sinceLastCall + 1 } } };
      },
      config: {},
      decls: { a: { mode: 'dumb', response: { scope: ['posted'] } }, b: { mode: 'smart', threshold: 4 } },
      state: { b: { seen: true, sinceLastCall: 1, turn: 0 } },
      after: { response: 'state: posted' },
    },
    {
      itemName: 'a doc is REFUSED after the tool answered (the refusal lands on an unrelated action)',
      decide: (config, decls, matched, state, turn, owners, tool, cats, after) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool, cats, after);
        return { ...r, decision: r.inject.length ? 'deny' : r.decision };
      },
      config: {},
      decls: { a: { mode: 'dumb', enforce: true, response: { scope: ['posted'] } } },
      after: { response: 'state: posted' },
    },
    {
      itemName: 'a doc waiting for the answer is delivered BEFORE the action (the filter is never consulted)',
      decide: (config, decls, matched, state, turn, owners, tool, cats) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool, cats, { response: 'posted' });
        return r;
      },
      config: {},
      decls: { a: { mode: 'dumb', response: { scope: ['posted'] } } },
    },
    {
      itemName: 'the cascade skips the `defaults.{source}` stage (defect ㊳: an INERT stage)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const withoutCategory = { ...config, defaults: undefined };
        return spec.decide(withoutCategory, decls, matched, state, turn, owners, tool);
      },
      config: { defaults: { file: { mode: 'dumb' } } },
      decls: { a: {} },
    },
    {
      itemName: 'the refusal no longer alternates (an infinite loop, the reason ⑤ exists)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        // it re-blocks even when the previous gesture was already refused
        return { ...r, decision: r.inject.length ? 'deny' : r.decision };
      },
      config: {},
      decls: { a: { mode: 'dumb', enforce: true } },
      state: { a: { seen: true, sinceLastCall: 0, turn: 0, denied: true } },
    },
    {
      itemName: 'a filtered doc is RECALLED anyway (its drift would be erased in silence)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        return { ...r, filteredOut: [] };
      },
      config: { filterMode: 'blacklist', filterList: ['Bash'] },
      decls: { a: { mode: 'smart', threshold: 1 } },
      state: { a: { seen: true, sinceLastCall: 5, turn: 0 } },
    },
    {
      itemName: 'an invalid value is TAKEN instead of ignored (the total fallback dies)',
      decide: (config, decls, matched, state, turn, owners, tool) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool);
        return { ...r, decision: 'none', inject: [] };
      },
      config: { mode: 'bogus' },
      decls: { a: {} },
    },
    {
      itemName: 'a categorized doc is shown to a session that never declared that category',
      decide: (config, decls, matched, state, turn, owners, tool, sessionCategories) => {
        const r = spec.decide(config, decls, matched, state, turn, owners, tool, sessionCategories);
        // it ignores the session's declared categories entirely — the doc
        // would be delivered to EVERY session, exactly like `category` never
        // existed on it.
        return { ...r, categoryOut: [], inject: [...new Set([...r.inject, 'a'])] };
      },
      config: {},
      decls: { a: { mode: 'dumb', category: ['infra'] } },
      sessionCategories: ['seo'],
    },
  ];

  for (const s of sabotages) {
    const args = [s.config, s.decls, s.matched || ['a'], s.state || {}, 3, { a: 'file', b: 'file' }, 'Bash', s.sessionCategories, s.after];
    const trueOne = gate.decide(...args);
    const faux = s.decide(...args);
    assert.notStrictEqual(
      JSON.stringify(faux), JSON.stringify(trueOne),
      `SABOTAGE UNDETECTED — "${s.itemName}": the differential would have let this defect through, so it proves nothing about it.`,
    );
  }
});

// ── THE SCENARIO THIS FEATURE EXISTS FOR (operator, 2026-09-22) ─────────
// A skill declares its OWN project category and matches normally on a PATH
// (`match`/`keys`, the trigger). A session belonging to a DIFFERENT project
// must NOT receive it, even though the trigger fires — that is the whole
// point: `category` NARROWS what a trigger already selected, it never lets
// a trigger through on its own. Run on the REAL engine (`gate.decide`), not
// the spec — this is the behavioural proof the mandate asked for, and it is
// the case the whole file exists to protect.
test('CATEGORY: a trigger-positive doc is still EXCLUDED when the session category does not match', () => {
  const decls = { a: { mode: 'dumb', category: ['projet-a'] } };
  const owners = { a: 'file' };

  const wrongSession = gate.decide({}, decls, ['a'], {}, 0, owners, 'Bash', ['projet-b']);
  assert.deepStrictEqual(wrongSession.inject, [], 'wrong category: must NOT inject despite the trigger firing');
  assert.deepStrictEqual(wrongSession.categoryOut, ['a'], 'the exclusion must be OBSERVABLE, never silent');

  const rightSession = gate.decide({}, decls, ['a'], {}, 0, owners, 'Bash', ['projet-a']);
  assert.deepStrictEqual(rightSession.inject, ['a'], 'matching category: must inject');
  assert.deepStrictEqual(rightSession.categoryOut, []);

  const noSessionCategory = gate.decide({}, decls, ['a'], {}, 0, owners, 'Bash', []);
  assert.deepStrictEqual(noSessionCategory.inject, [], 'no category declared for the session: a categorized doc stays hidden');

  const uncategorizedDoc = gate.decide({}, { a: { mode: 'dumb' } }, ['a'], {}, 0, owners, 'Bash', ['projet-b']);
  assert.deepStrictEqual(uncategorizedDoc.inject, ['a'], 'PARITY: a doc without `category` is universal, whatever the session carries');
});

test('NEGATIVE-CHECK: the model is NOT a copy — it decides on its own', () => {
  // 🛑 If the model merely delegated to the engine, every divergence would be
  //    impossible BY CONSTRUCTION and the three parts above would be theatre.
  //    We check that the model answers with the engine ABSENT from the equation:
  //    a pure resolution, computed here, on a case whose answer is known by hand.
  assert.strictEqual(spec.resolve('mode', {}, {}, 'skill'), 'once',
    'a skill defaults to `once` — project knowledge, not a guardrail');
  assert.strictEqual(spec.resolve('mode', { mode: 'dumb' }, {}, 'skill'), 'once',
    'a skill SKIPS the global stage — unifying would flip every skill at the first global mode');
  assert.strictEqual(spec.resolve('mode', { mode: 'dumb' }, {}, 'file'), 'dumb',
    'a doc DOES read the global stage');
  assert.strictEqual(spec.resolve('enforce', { enforce: true }, {}, 'file'), false,
    '`enforce` has NO global stage — a global refusal would reject the first action of every session');
  assert.strictEqual(spec.resolve('enforce', { defaults: { file: { enforce: true } } }, { enforce: false }, 'file'), false,
    'an explicit `false` is a VALUE: it is the only way to opt out of a category');
  assert.strictEqual(spec.resolve('threshold', {}, {}, 'file'), 4, 'framework threshold');
  assert.strictEqual(spec.livre('once', true, 99, 1), false, '`once` already seen: never again');
  assert.strictEqual(spec.livre('dumb', true, 0, 99), true, '`dumb` never consults memory');
  assert.strictEqual(spec.livre('smart', false, 0, 99), true, 'a first time is a first time, in every mode');
});
