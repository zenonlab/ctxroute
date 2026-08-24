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
function engine() {
  for (const k of Object.keys(require.cache)) {
    if (/pretool-core|emission-core|paths|session-store|collect-core|corpus|lock/.test(k)) delete require.cache[k];
  }
  return { run: require('../src/pretool-core.js').run, lib: require('../src/lib-pure.js') };
}

function doc(itemName, corps) {
  fs.writeFileSync(path.join(DOCS, itemName + '.md'), corps);
}

/** One tool ACTION. Returns the text really emitted, or null (silence). */
function action(run, session, opts = {}) {
  let text = null;
  run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: session },
    (_d, f) => { text = f; },
    opts
  );
  return text;
}

/** Holds the session's lock the way a DEAD process would: the directory stays. */
function holdTheLock(lib, session) {
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
  const { run } = engine();
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
  const { run, lib } = engine();
  doc('dumb', '---\nmatch: server.js\nmode: dumb\n---\nDUMB BODY\n');
  const s = 'nolock-' + sid;
  const release = holdTheLock(lib, s);
  const text = action(run, s);
  release();
  assert.match(String(text), /DUMB BODY/, 'never silent on contention — silence would be a regression');
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
  const { run, lib } = engine();
  doc('once', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'dup-' + sid;

  const release = holdTheLock(lib, s);
  const a1 = action(run, s); // lock held by a "dead" process -> fallback
  release();

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
  const { run } = engine();
  // Budget deliberately tiny: each action can only carry a fraction of the corpus.
  for (const n of ['d1', 'd2', 'd3', 'd4']) {
    doc(n, `---\nmatch: server.js\nmode: dumb\n---\n${n.toUpperCase()} ${'x'.repeat(400)}\n`);
  }
  doc('uniq', '---\nmatch: server.js\nmode: once\n---\nUNIQUE BODY\n');
  const s = 'rot-' + sid;

  let vuUnique = 0;
  const empty = [];
  const dumbVus = [];
  // 30 actions: MEASURED as enough for the `once` document to reach the head of
  // a queue that never empties (it came out on action 24 of the run that sized
  // this cell). A tighter number would make the test flaky the day a doc grows.
  for (let i = 0; i < 30; i += 1) {
    const t = action(run, s, { budget: 500 });
    if (t === null) empty.push(i);
    else {
      if (t.includes('UNIQUE BODY')) vuUnique += 1;
      const d = t.match(/D[1-4]/);
      if (d) dumbVus.push(d[0]);
    }
  }

  assert.equal(empty.length, 0, 'ROTATION: no action goes silent — a `dumb` corpus is re-decided every time');
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

// ═══════════════════════════════════════════════════════════════════════
// ⑤ THE THIRD DEFECT OF THE SAME FAMILY — A REFUSAL THAT CANNOT REMEMBER
//    ITSELF (2026-08-20). Found while killing the last mutation survivor of
//    `gate.js`: `blocked.every(...)` survived as `blocked.some(...)`, i.e. the
//    engine had a branch whose semantics NO test could tell apart. Asking
//    "which of the two is right?" turned out to be the wrong question.
//
// 🔑 THE ANTI-LOOP IS AN ANCHOR IN THE STATE, AND THE FALLBACK WRITES NOTHING.
//    "A block is NEVER followed by a block" — the guarantee that makes `enforce`
//    usable at all — is carried by the `denied` flag written by `gate.decide`
//    into the session state. The lock-less path may not write (invariant (2),
//    `NoWriteWithoutLock`), so a `deny` it emits leaves NO trace: the redone
//    action is re-decided from the same state and refused AGAIN. While the
//    contention lasts, the agent is walled in with no way out — exactly the
//    infinite block the alternation exists to forbid.
// 🛑 SO THE DEGRADED PATH NEVER REFUSES. Not "refuses less often": never. The
//    document is still DELIVERED (informative), and the refusal lands on the
//    next action, under the lock, WITH its memory. That is what "a degraded
//    path fails OPEN" means when taken to its end — the comment claimed it, the
//    code stopped one step short.
// ⇒ The `every` survivor is gone BY CONSTRUCTION rather than by a test written
//    for it: the branch it lived in should not exist. Doctrine, verbatim:
//    "a survivor gets KILLED or ELIMINATED, never a lowered threshold" —
//    and writing a test for useless code freezes it for ever.
// ⚠️ ANTI-VACUITY: the control below proves the SAME document really does refuse
//    when the lock is available. Without it, "never refuses" would also pass on
//    an engine where `enforce` had simply stopped working.
// ═══════════════════════════════════════════════════════════════════════
function actionDecision(run, session) {
  let d = null;
  run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: session },
    (decision) => { d = decision; },
    {}
  );
  return d;
}

test('SPEC (2bis): the lock-less path NEVER refuses — a refusal it cannot record would repeat for ever', () => {
  const { run, lib } = engine();
  doc('stop', '---\nmatch: server.js\nmode: dumb\nenforce: true\n---\nSTOP BODY\n');
  const s = 'noloop-' + sid;

  // CONTROL — with the lock, this very document DOES refuse, and the alternation
  // then lets the redone action through. Anti-vacuity for the assertion below.
  assert.equal(actionDecision(run, s), 'deny', 'control: with the lock, an `enforce` doc refuses');
  assert.equal(actionDecision(run, s), 'allow', 'control: alternation — a block is never followed by a block');

  // THE PROPERTY — under contention, twice in a row, never a refusal.
  const s2 = 'noloop2-' + sid;
  const release = holdTheLock(lib, s2);
  const d1 = actionDecision(run, s2);
  const d2 = actionDecision(run, s2);
  release();

  assert.notEqual(d1, 'deny',
    'the lock-less path refused, and it wrote no `denied` flag: the redone action is re-decided '
    + 'from the same state and refused again — the infinite block the alternation forbids.');
  assert.notEqual(d2, 'deny', 'and the second one proves the repetition, not a one-off');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑥ THE WITHHOLDING IS SAID OUT LOUD (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT WAS SILENT UNTIL TODAY, AND IT WAS SILENT IN PRODUCTION. Cell ②
//    proves the lock-less path delivers `injectLockless` — everything EXCEPT
//    `once` — and that is correct: delivering without recording duplicates.
//    But the agent was told NOTHING, so it acted once without knowledge it was
//    supposed to have, and no error, no red, no badge existed anywhere. The
//    doctrine of this repository is not "zero bugs", it is **zero SILENT bugs**.
// 🛑 THE NOTICE ANNOUNCES A COUNT, NEVER A CAUSE. "N documents withheld" is
//    what this layer OBSERVES; "the lock was busy" or "the daemon is down" are
//    guesses about WHY. That is also what makes it universal — same true
//    sentence on every harness, on the spawn lane and the daemon lane alike,
//    with no probe of any kind.
// ═══════════════════════════════════════════════════════════════════════

/** One action, returning what the shell was really handed. */
function emission(run, session) {
  let vu = null;
  run(
    { tool_name: 'Read', tool_input: { file_path: 'C:/p/server.js' }, session_id: session },
    (d, f, m) => { vu = { decision: d, doc: f, message: m }; },
    {}
  );
  return vu;
}

function verboseConfig() {
  fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, showNotification: true }));
}

test('CONTROL: nothing is withheld when the lock is available — and nothing is announced', () => {
  verboseConfig();
  const { run } = engine();
  doc('un', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const vu = emission(run, 'quiet-' + sid);

  assert.ok(vu, 'control: the document must be delivered');
  assert.ok(vu.doc.includes('ONCE BODY'), 'control: it is the `once` document that goes out');
  assert.ok(!/WITHHELD/.test(vu.message || ''),
    'a notice fired while NOTHING was withheld: an alarm that cries on a healthy system is an '
    + 'alarm people stop reading, and this one would fire on every single action');
});

test('a withheld `once` is ANNOUNCED, with an exact count, alongside what did go out', () => {
  verboseConfig();
  const { run, lib } = engine();
  doc('retenu', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  doc('livre', '---\nmatch: server.js\nmode: dumb\n---\nDUMB BODY\n');
  const s = 'avis-' + sid;

  const release = holdTheLock(lib, s);
  const vu = emission(run, s);
  release();

  assert.ok(vu, 'the action must still deliver what stays correct without a record');
  assert.ok(vu.doc.includes('DUMB BODY'), 'the `dumb` document goes out — the notice never replaces delivery');
  assert.ok(!vu.doc.includes('ONCE BODY'), 'control: the `once` is indeed the one withheld (cell ② property)');
  assert.match(vu.message || '', /1 doc\(s\) WITHHELD/,
    'the framework delivered less than it decided and said nothing: that is the silent degradation, '
    + 'and it is exactly what happened on every lock contention in production');
});

test('EVERYTHING withheld ⇒ the frame speaks WITHOUT deciding, instead of staying mute', () => {
  verboseConfig();
  const { run, lib } = engine();
  doc('seul', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'muet-' + sid;

  const release = holdTheLock(lib, s);
  const vu = emission(run, s);
  release();

  // 🔴 THIS IS THE CASE THAT WAS TOTALLY SILENT: nothing left to deliver, so the
  //    old code returned before reaching any message at all — precisely when the
  //    most had been withheld.
  assert.ok(vu, 'the action emitted NOTHING while withholding everything it had decided');
  assert.equal(vu.doc, '', 'there is no context to deliver — the notice must never fabricate one');
  assert.match(vu.message || '', /1 doc\(s\) WITHHELD/, 'and the human is told');

  // 🛑 THE WIRE FORM MATTERS AS MUCH AS THE MESSAGE. Official doc (2026-08-21):
  //    `permissionDecision` is optional and its ABSENCE leaves the normal
  //    permission flow alone. Emitting the usual envelope would carry
  //    `permissionDecision: "allow"` — a warning that AUTHORISES a tool call as
  //    a side effect. A notice must never change a decision.
  const { output } = require('../src/hooks/doc-inject.js');
  const json = output(vu.decision, vu.doc, vu.message);
  assert.deepEqual(Object.keys(json), ['systemMessage'],
    'the notice must travel ALONE: any other key here means the framework is deciding '
    + 'something it was never asked to decide');
});

test('`showNotification: false` stays a TOTAL silence, notice included', () => {
  const { run, lib } = engine();   // beforeEach already writes showNotification:false
  doc('seul', '---\nmatch: server.js\nmode: once\n---\nONCE BODY\n');
  const s = 'silence-' + sid;

  const release = holdTheLock(lib, s);
  const vu = emission(run, s);
  release();

  assert.equal(vu, null,
    'that setting is a TOTAL silence by the maintainer decision, never a partial one — '
    + 'a notice leaking through it would be the same defect as an orphan chunk suffix');
});
