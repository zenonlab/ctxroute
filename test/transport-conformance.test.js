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
// ⚠️ `dumb` SINCE 2026-08-20, AND THE CHOICE IS THE POINT. This cell proves the
//    lock-less path still DELIVERS (silence on contention would be a regression)
//    and still WRITES NOTHING. It used a `once` document, which the fallback no
//    longer delivers — because an unrecorded `once` comes back twice (cell ③).
//    A `dumb` document exercises the SAME two invariants and is re-decided at
//    every action, so no record is needed for it to stay correct.
// 🛑 Do not switch it back to `once` to "cover more": that would assert the
//    defect this engine has just removed.
test('SPEC (2): the lock-less path DELIVERS and writes NOTHING', () => {
  const { run, lib } = moteur();
  doc('dumb', '---\nmatch: server.js\nmode: dumb\n---\nDUMB BODY\n');
  const s = 'nolock-' + sid;
  const relacher = tenirLeVerrou(lib, s);
  const texte = action(run, s);
  relacher();
  assert.match(String(texte), /DUMB BODY/, 'never silent on contention — silence would be a regression');
  assert.deepEqual(seenFiles(), [], 'NO state write escapes the lock');
});

// ═══════════════════════════════════════════════════════════════════════
// ③ THE COUNTER-EXAMPLE OF `TransportKnownDefect.cfg`, ON THE REAL ENGINE.
//
// ✅ THE DEBT IS PAID (2026-08-20). This cell WAS the witness of a defect; it is
//    now an ordinary anti-regression assertion, exactly as its previous version
//    instructed. History, kept because it is the reason the rule exists:
//    TLC found, in the design AS SHIPPED, that the lock-less fallback DELIVERED a
//    fresh `once` document and RECORDED NOTHING (invariant (2) forbids it to
//    write), so the next action's leader re-decided it as fresh and delivered it
//    a SECOND time. Rare, contention-only, unreproducible on demand — a flaky
//    PROGRAM, the kind that bites once every few months.
//
// ✅ THE FIX, proved sufficient by `TransportCandidateFix.cfg` BEFORE being
//    written: the lock-less path delivers only what stays correct WITHOUT a
//    record (`gate.injectLockless`). A `once` is therefore DELAYED by one
//    action, never duplicated and never lost — the fallback writes nothing, so
//    the document stays unseen and the leader delivers it next.
// 🛑 THE PRICE IS DECLARED, NOT HIDDEN: the 2026-08-07 rule said "under
//    contention, never keep silent". For a `once` we now do stay silent, for one
//    action. The trade was FORCED — the fallback may not write, so the only
//    alternatives were "delivered twice, at random" or "delivered later, always".
//    Determinism wins: a duplicate is a flaky bug, a delay is a known behaviour.
// 🛑 NEVER go back to delivering `once` here, and NEVER "fix" it by letting the
//    fallback write: that breaks `NoWriteWithoutLock`, the reason the lock exists.
// ═══════════════════════════════════════════════════════════════════════
test('SPEC: a `once` is delivered EXACTLY ONCE even when the lock is unavailable', () => {
  const { run, lib } = moteur();
  doc('once', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'dup-' + sid;

  const relacher = tenirLeVerrou(lib, s);
  const a1 = action(run, s); // lock held by a "dead" process -> fallback
  relacher();

  const a2 = action(run, s); // lock free -> leader, state still empty
  const a3 = action(run, s);

  assert.equal(a1, null,
    'action 1: the lock-less path must NOT deliver a `once` — it cannot record it, and an '
    + 'unrecorded delivery is re-decided as fresh next action (the duplicate).');
  assert.match(String(a2), /ONCE BODY/,
    'action 2: DELIVERED, and recorded — nothing is lost, it was only delayed by one action.');
  assert.equal(a3, null, 'action 3: silent — recorded, so never again.');
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
