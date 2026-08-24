// ═══════════════════════════════════════════════════════════════════════
// THE CASCADE RESOLVES WITH ITS SOURCE — OTHERWISE LEVEL ② IS MUTE (09/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 A REAL BUG, FOUND BY READING AND NOT BY A MACHINE. `gate.js` exposes
//    cascade resolvers with THREE parameters — `(config, decl, source)`. Two
//    callers forgot the third:
//      • `pretool-core.js:143` — decides whether to READ the turn counter.
//        Without `source`, level ② (`defaults.{source}.driftUnit`) is invisible
//        ⇒ the gate concludes "unit = tool", does not read the counter and passes
//        `turnCount: 0` to `gate.decide`… which, for ITS part, resolves WITH the source and
//        therefore measures the drift IN TURNS. Result: `since = 0 - entry.turn`,
//        never ≥ threshold ⇒ **a `smart` doc degenerates into `once`, in SILENCE.**
//      • `explain.js:202` — DISPLAYS the cadence of a doc. Without `source`, the
//        introspection tool announces a cadence the engine does not apply: very
//        exactly the defect its own doc forbids it to commit.
//
// ⚠️ WHY 1117 TESTS AND 100 % MUTATION DID NOT SEE IT:
//    `gate.js` is mutated and tests the cascade PERFECTLY — with the right argument.
//    `pretool-core.js`/`explain.js` are I/O shells, hence NEVER mutated, and
//    no integration test posed `defaults.{source}`. The hole was not
//    in the logic: it was in the CALL to the logic.
//
// ⚠️ MEASURED BEFORE BEING WRITTEN (the repo's rule): outside `gate.js` and outside the tests,
//    there are EXACTLY 2 calls to a cascade resolver — the 2 faulty ones
//    above. Part ② therefore cannot produce ANY false positive: after
//    the fix, the list of violations is empty, without a single exemption.
//
// 🛑 THE TWO PARTS ARE INTERDEPENDENT. Part ① proves the BEHAVIOUR (the doc really
//    comes back); part ② seals the CLASS (no future caller will be able to reopen the
//    hole). Part ① alone would leave `explain.js` and future callers outside;
//    part ② alone would prove a call form without proving that it produces the right
//    result. NEVER remove one of them "since the other covers it".

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────
// PART ① — BEHAVIOUR: a `smart` doc set to TURNS by `defaults`
//          MUST come back. Before the fix, this test is RED.
// ─────────────────────────────────────────────────────────────────────────
test('① the TURN cadence set by defaults.{source} is HONOURED by the gate', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-cascade-'));
  const DOCS = path.join(tmp, 'docs');
  const STATE = path.join(tmp, 'state');
  const CONFIG = path.join(tmp, 'config.json');
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(STATE, { recursive: true });

  // The doc declares NO driftUnit: the unit therefore comes from level ②.
  fs.writeFileSync(path.join(DOCS, 'd.md'),
    '---\nmatch: target.txt\nmode: smart\nthreshold: 2\n---\n\nCORPS-TEMOIN\n');
  // ⚠️ Level ② ONLY — neither `driftUnit` in the doc, nor a global `defaultDriftUnit`.
  //    It is the only path that was broken; the other two already worked.
  fs.writeFileSync(CONFIG, JSON.stringify({ defaults: { file: { driftUnit: 'turn' } } }));

  process.env.CTXROUTE_FILEDOCS_DIR = DOCS;
  process.env.CTXROUTE_STATE_DIR = STATE;
  process.env.CTXROUTE_CONFIG_PATH = CONFIG;
  // ⚠️ Modules loaded AFTER the env vars: `paths.js` resolves lazily,
  //    but the `require` cache would freeze a module already loaded by another
  //    suite. So we purge whatever reads those paths.
  for (const m of ['../src/pretool-core.js', '../src/session-store.js', '../src/paths.js', '../src/collect-core.js']) {
    delete require.cache[require.resolve(m)];
  }
  const porte = require('../src/pretool-core.js');
  const store = require('../src/session-store.js');

  const sid = 'sess-cascade';
  const payload = { session_id: sid, tool_name: 'Read', tool_input: { file_path: 'target.txt' } };
  const geste = () => {
    let receivedText = null;
    porte.run(payload, (_d, fullDoc) => { receivedText = fullDoc; });
    return receivedText;
  };

  try {
    // Turn 1: first contact — the doc is delivered and memorises its turn.
    store.saveState('turn-count-', sid, { turns: 1 });
    const first = geste();
    assert.ok(first !== null, 'witness: the doc MUST be delivered on the first gesture');

    // 4 turns pass WITHOUT the doc being recalled: the drift is 4,
    // the threshold is 2 ⇒ it MUST come back.
    store.saveState('turn-count-', sid, { turns: 5 });
    const second = geste();

    assert.ok(second !== null,
      'REGRESSION: the `smart` doc in TURN unit (set by defaults.file) NEVER came back.\n'
      + '  The gate resolved the cascade WITHOUT its source ⇒ it believes the unit is "tool", does not read the\n'
      + '  turn counter and passes 0 ⇒ the drift is nil forever ⇒ `smart` becomes `once`.');
    assert.ok(second.includes('CORPS-TEMOIN'), 'the returned doc must carry its body');
  } finally {
    delete process.env.CTXROUTE_FILEDOCS_DIR;
    delete process.env.CTXROUTE_STATE_DIR;
    delete process.env.CTXROUTE_CONFIG_PATH;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// PART ② — THE CLASS: every caller of a resolver passes the 3 arguments.
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ SCOPE: outside `gate.js` (which DEFINES the cascade and calls itself) and
//    outside the tests (`gate.test.js` DELIBERATELY calls with 2 arguments to prove
//    the fallback — forbidding it there would break the proof of the cascade itself).
const RESOLVERS = ['modeForDoc', 'thresholdForDoc', 'driftUnitForDoc', 'enforceForDoc'];

/**
 * Returns the calls with 2 arguments (or fewer) found in `text`.
 * ⚠️ Split by PARENTHESIS DEPTH, never by `split(',')`: an
 *    argument can itself contain a comma (`f(a, g(b, c))`) — a
 *    naive split would count 3 arguments where there are 2, and the gate
 *    would become a generator of false greens.
 */
function appelsSansSource(text) {
  const offending = [];
  for (const name of RESOLVERS) {
    let i = 0;
    for (;;) {
      const k = text.indexOf(name + '(', i);
      if (k === -1) break;
      i = k + name.length + 1;
      let prof = 1;
      let args = 1;
      let j = i;
      for (; j < text.length && prof > 0; j++) {
        const c = text[j];
        if (c === '(' || c === '[' || c === '{') prof++;
        else if (c === ')' || c === ']' || c === '}') prof--;
        else if (c === ',' && prof === 1) args++;
      }
      const brut = text.slice(k, j).replace(/\s+/g, ' ');
      // An empty call `f()` = 0 argument, not 1.
      if (text.slice(i, j - 1).trim() === '') args = 0;
      if (args < 3) offending.push(`${name} called with ${args} argument(s): ${brut.slice(0, 90)}`);
    }
  }
  return offending;
}

test('② no caller resolves the cascade WITHOUT its source', () => {
  const cp = require('node:child_process');
  const files = cp.execSync('git ls-files "*.js"', { cwd: HERE, encoding: 'utf8' })
    .trim().split('\n')
    .filter((f) => !f.endsWith('.test.js') && f !== 'gate.js');

  const violations = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(HERE, f), 'utf8');
    for (const v of appelsSansSource(t)) violations.push(`${f} — ${v}`);
  }

  assert.deepStrictEqual(violations, [],
    'The cascade has FOUR levels; level ② (defaults.{source}) only exists if the SOURCE is\n'
    + 'passed. A call with 2 arguments therefore resolves an AMPUTATED cascade, silently\n'
    + 'different from the one gate.decide applies:\n  ' + violations.join('\n  ')
    + '\n  ⇒ pass the source (`acc.owner[doc]`), never "simplify" this call.');
});

test('② NEGATIVE — the gate really bites, and counts correctly', () => {
  // ⚠️ IN MEMORY: we NEVER sabotage a real file (an earlier version
  //    of a check of this type brought down 38 tests of other suites).
  assert.strictEqual(appelsSansSource('gate.driftUnitForDoc(config, decls[d])').length, 1,
    'the gate does not see the faulty call: it is INERT');
  assert.deepStrictEqual(appelsSansSource('gate.driftUnitForDoc(config, decls[d], owner[d])'), [],
    'a CORRECT call must never be accused');

  // 🛑 THE TRAP THAT MAKES SUCH A GATE WRONG: a NESTED comma. Without counting
  //    by depth, `f(a, g(b, c))` would be read as 3 arguments — hence GREEN
  //    on a faulty call. It is the most likely failure mode here.
  assert.strictEqual(appelsSansSource('modeForDoc(cfg, decls[d] || fallback(a, b))').length, 1,
    'a nested comma must not be counted as an argument separator');
  assert.deepStrictEqual(appelsSansSource('modeForDoc(cfg, pick(a, b), owner)'), [],
    '3 arguments including a nested call: legitimate');

  // Degenerate forms: never a crash, never a false green.
  assert.strictEqual(appelsSansSource('enforceForDoc()').length, 1, 'an empty call = 0 argument');
  assert.deepStrictEqual(appelsSansSource('nothing at all here'), []);
});
