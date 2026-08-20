// ═══════════════════════════════════════════════════════════════════════
// TRACE VALIDATION of the TLA+ transport spec — the REAL engine, replayed.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 A SPEC PROVES A MODEL, NEVER A PROGRAM. What ties the two together is
//    this file: each counter-example TLC produced is REPLAYED on the real
//    `pretool-core.js` / `emission-core.js` / `session-store.js` / `lock.js`,
//    and the engine must be observed doing exactly what the model said.
//    Without that, `specs/tla/` is a beautiful object next to the code.
//
// ⚠️ WHY THE ANCHOR IS BEHAVIOURAL AND NOT A STATE-BY-STATE REPLAY. The
//    dispatcher of the fleet writes every micro-step to disk, so its states are
//    OBSERVABLE and TLC can re-check a recorded trace. Here they are NOT: the
//    frame processes are short-lived and only the three store writes survive
//    them. Fabricating the missing states in order to "replay" them would be
//    checking the spec against a transcript we wrote ourselves — proving
//    x === x. So the anchor is: the model's PREDICTIONS, observed on the
//    engine. Said plainly rather than dressed up.
//
// ⚠️ ISOLATION: corpus, config and state in a tmpdir (env vars). A test NEVER
//    writes into the shipped stores.
// ⚠️ `CTXROUTE_LOCK_TIMEOUT_MS` is the env var RESERVED FOR TESTS: it makes the
//    lock unavailable INSTANTLY instead of after 2 s of real waiting. It is
//    what makes the degraded path testable at all — before it existed, "no
//    suite ever made the lock FAIL" and 1,096 tests were blind to it.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-transport-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');

let sid = 0;

beforeEach(() => {
  fs.rmSync(DOCS, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, showNotification: false }));
  process.env.CTXROUTE_FILEDOCS_DIR = DOCS;
  process.env.CTXROUTE_STATE_DIR = STATE;
  process.env.CTXROUTE_CONFIG_PATH = CONFIG;
  process.env.CTXROUTE_LOCK_TIMEOUT_MS = '30';
  sid += 1;
});

afterAll(() => {
  delete process.env.CTXROUTE_FILEDOCS_DIR;
  delete process.env.CTXROUTE_STATE_DIR;
  delete process.env.CTXROUTE_CONFIG_PATH;
  delete process.env.CTXROUTE_LOCK_TIMEOUT_MS;
  fs.rmSync(TMP, { recursive: true, force: true });
});

/** ⚠️ FRESH import: `paths.js` is lazy but the module cache is not. */
function moteur() {
  for (const k of Object.keys(require.cache)) {
    if (/pretool-core|emission-core|paths|session-store|collect-core|corpus|lock/.test(k)) delete require.cache[k];
  }
  return { run: require('../src/pretool-core.js').run, lib: require('../src/lib-pure.js') };
}

function doc(nom, corps) {
  fs.writeFileSync(path.join(DOCS, nom + '.md'), corps);
}

/** One tool ACTION. Returns the text really emitted, or null (silence). */
function action(run, session, opts = {}) {
  let texte = null;
  run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: session },
    (_d, f) => { texte = f; },
    opts
  );
  return texte;
}

/** Holds the session's lock the way a DEAD process would: the directory stays. */
function tenirLeVerrou(lib, session) {
  const dir = path.join(STATE, '.lock-doc-' + lib.sanitizeSessionId(session));
  fs.mkdirSync(dir, { recursive: true });
  return () => fs.rmdirSync(dir);
}

const seenFiles = () => fs.readdirSync(STATE).filter((f) => f.startsWith('doc-seen-'));

// ═══════════════════════════════════════════════════════════════════════
// ① POSITIVE CONTROL — without contention, a `once` is delivered ONCE.
//    Without this cell the next one would prove nothing: a doc delivered
//    twice is only news if delivering it once is the normal outcome.
// ═══════════════════════════════════════════════════════════════════════
test('CONTROL: with the lock available, a `once` document is delivered exactly once', () => {
  const { run } = moteur();
  doc('once', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'ctl-' + sid;
  assert.match(String(action(run, s)), /ONCE BODY/, 'first action delivers');
  assert.equal(action(run, s), null, 'second action is silent — the state recorded the delivery');
  assert.equal(action(run, s), null, 'and it stays silent');
  assert.ok(seenFiles().length === 1, 'the state store was written');
});

// ═══════════════════════════════════════════════════════════════════════
// ② `NoWriteWithoutLock` — the model's invariant (2), on the real engine.
// ═══════════════════════════════════════════════════════════════════════
test('SPEC (2): the lock-less path DELIVERS and writes NOTHING', () => {
  const { run, lib } = moteur();
  doc('once', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'nolock-' + sid;
  const relacher = tenirLeVerrou(lib, s);
  const texte = action(run, s);
  relacher();
  assert.match(String(texte), /ONCE BODY/, 'never silent on contention — silence would be a regression');
  assert.deepEqual(seenFiles(), [], 'NO state write escapes the lock');
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE COUNTER-EXAMPLE OF `TransportKnownDefect.cfg`, ON THE REAL ENGINE.
//
// 🔴 THIS TEST ASSERTS A DEFECT, DELIBERATELY, AND IT IS NOT A "TODO".
//    TLC found it on 2026-08-20 in the design AS SHIPPED, and here is the same
//    behaviour observed on the engine: the lock-less fallback DELIVERS a fresh
//    `once` document and RECORDS NOTHING (invariant (2) forbids it to write),
//    so the next action's leader re-decides it as fresh and delivers it a
//    SECOND time. The 2026-08-07 fix closed "already delivered -> re-emitted";
//    this is the same duplicate reached by the opposite door.
//
// 🛑 DO NOT "FIX" THIS TEST. It is the WITNESS of a declared debt, and it is
//    solidary with `specs/tla/runs.json` -> `TransportKnownDefect`. The day the
//    engine stops duplicating, BOTH flip together and BOTH must be updated in
//    the same move: the invariant moves into `Transport.cfg`, this cell becomes
//    an ordinary anti-regression assertion. A witness that survives its defect
//    is a lie; a defect without a witness comes back.
// ═══════════════════════════════════════════════════════════════════════
test('SPEC — KNOWN DEFECT: a `once` delivered by the lock-less path is delivered AGAIN next action', () => {
  const { run, lib } = moteur();
  doc('once', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'dup-' + sid;

  const relacher = tenirLeVerrou(lib, s);
  const a1 = action(run, s); // lock held by a "dead" process -> fallback
  relacher();

  const a2 = action(run, s); // lock free -> leader, state still empty
  const a3 = action(run, s);

  assert.match(String(a1), /ONCE BODY/, 'action 1: delivered by the lock-less path');
  assert.match(
    String(a2),
    /ONCE BODY/,
    'action 2: DELIVERED A SECOND TIME — this is the debt. If this line fails, the engine was ' +
      'fixed: move AtMostOnceDelivery into specs/tla/Transport.cfg and rewrite this cell.'
  );
  assert.equal(a3, null, 'action 3: silent — the leader did record it, so the duplication is bounded to ONE extra delivery');
});

// ═══════════════════════════════════════════════════════════════════════
// ④ ROTATION IS NOT STARVATION — the model's property (7), on the engine.
//    A `dumb` corpus durably above capacity rotates indefinitely: the queue
//    never stays empty, nothing is lost, and that is CORRECT. Meanwhile a
//    `once` document keeps making progress. Anyone tempted to "fix" the
//    non-empty queue has to make this cell red first.
// ═══════════════════════════════════════════════════════════════════════
test('SPEC (7): a `dumb` corpus above capacity ROTATES for ever, and a `once` still gets through', () => {
  const { run } = moteur();
  // Budget deliberately tiny: each action can only carry a fraction of the corpus.
  for (const n of ['d1', 'd2', 'd3', 'd4']) {
    doc(n, `---\nmatch: server.js\nmode: dumb\n---\n${n.toUpperCase()} ${'x'.repeat(400)}\n`);
  }
  doc('uniq', '---\nmatch: server.js\nmode: once\n---\nUNIQUE BODY\n');
  const s = 'rot-' + sid;

  let vuUnique = 0;
  const vides = [];
  const dumbVus = [];
  // 30 actions: MEASURED as enough for the `once` document to reach the head of
  // a queue that never empties (it came out on action 24 of the run that sized
  // this cell). A tighter number would make the test flaky the day a doc grows.
  for (let i = 0; i < 30; i += 1) {
    const t = action(run, s, { budget: 500 });
    if (t === null) vides.push(i);
    else {
      if (t.includes('UNIQUE BODY')) vuUnique += 1;
      const d = t.match(/D[1-4]/);
      if (d) dumbVus.push(d[0]);
    }
  }

  assert.equal(vides.length, 0, 'ROTATION: no action goes silent — a `dumb` corpus is re-decided every time');
  assert.ok(
    dumbVus.length > new Set(dumbVus).size,
    'ROTATION IS REAL: at least one `dumb` document comes back around. If this fails the corpus fits ' +
      'in the budget and the cell proves nothing — lower `budget`, never delete the assertion.'
  );
  assert.equal(
    vuUnique,
    1,
    'NO STARVATION, AND NO DUPLICATE: the `once` document gets through exactly once despite the ' +
      'permanent rotation. 0 = starvation (the model forbids it); 2+ = the rotation re-delivers it.'
  );
});
