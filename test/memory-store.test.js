// ═══════════════════════════════════════════════════════════════════════
// memory-store.js — the state of a LIVING daemon.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THESE CELLS ARE REALLY PROVING. Not "a Map works". The disk store had
//    to simulate serialisation by hand (lock, tmp+rename, lock-less fallback,
//    bounded retries) and produced three flaky bugs doing it. This module drops
//    all of that because the KERNEL already serialises the daemon's callers. So
//    what has to be proven here is exactly what remains OURS: the API is the
//    same, the ceiling is real, the save survives a crash, and the restore is
//    fail-open.
// ⚠️ CONCURRENCY IS NOT TESTED HERE, and that is deliberate: there is none to
//    test. It is proven where it exists — at the socket, in
//    `state-daemon.test.js`, with real processes.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMemoryStore, MAX_SCOPES } = require('../src/memory-store.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-mem-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const neuf = (nom) => createMemoryStore({ snapshotPath: path.join(TMP, nom, 'snapshot.json') });

// ── ① THE API IS THE SAME, OR NOTHING CAN BE SWAPPED ────────────────────
// ⚠️ The whole migration rests on this: `pretool-core` and `emission-core` call
//    `loadState`/`saveState` and must not know which of the two they hold.
test('SAME CONTRACT as the disk store: absent = {}, written = read back identically', () => {
  const s = neuf('contrat');
  assert.deepEqual(s.loadState('doc-seen-', 'jamais-vu'), {},
    'an absent scope must answer {} — the fail-open the whole engine relies on');
  const etat = { 'docs/a.md': { seen: true, sinceLastCall: 3 } };
  s.saveState('doc-seen-', 'sess', etat);
  assert.deepEqual(s.loadState('doc-seen-', 'sess'), etat);
});

// ⚠️ PREFIXES MUST NOT MIX: three stores share one memory (`doc-seen-`, `plan-`,
//    `remainder-`). If the key were the session alone, a plan would overwrite a
//    cadence state — silently.
test('PREFIXES ARE ISOLATED: the same session id in two stores does not collide', () => {
  const s = neuf('prefixes');
  s.saveState('doc-seen-', 'x', { a: 1 });
  s.saveState('plan-', 'x', { b: 2 });
  assert.deepEqual(s.loadState('doc-seen-', 'x'), { a: 1 });
  assert.deepEqual(s.loadState('plan-', 'x'), { b: 2 });
});

// ⚠️ A session id is ARBITRARY TEXT coming from a harness. On a plain object,
//    `__proto__` is not a key — it is an assignment to the prototype, and the
//    read that follows returns something nobody stored.
test('A HOSTILE KEY IS DATA, never a prototype', () => {
  const s = neuf('proto');
  s.saveState('doc-seen-', '__proto__', { pollue: true });
  assert.deepEqual(s.loadState('doc-seen-', 'autre'), {},
    'another scope must stay empty — a Map cannot be polluted through a prototype');
  assert.deepEqual(s.loadState('doc-seen-', '__proto__'), { pollue: true });
});

// ── ② THE CEILING IS REAL — the space doctrine, applied to RAM ──────────
// 🛑 A daemon runs for weeks and nothing in a payload ever says "this session is
//    over". Without a bound this Map grows monotonically: that is not "a big
//    number", it is a DATED outage.
// ⚠️ The bound is a COUNT, never a deduction about death: we keep the N most
//    recently used and drop the coldest. No clock, no liveness probe.
test('CEILING: the memory is bounded, and it is the COLDEST scope that goes', () => {
  const s = neuf('plafond');
  for (let i = 0; i < MAX_SCOPES + 50; i += 1) s.saveState('doc-seen-', 'sess-' + i, { i });

  assert.equal(s.size(), MAX_SCOPES,
    `the memory must be capped at ${MAX_SCOPES} scopes, measured ${s.size()} — an unbounded writer is an outage with a date`);
  assert.deepEqual(s.loadState('doc-seen-', 'sess-0'), {}, 'the oldest scope must have been evicted');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-' + (MAX_SCOPES + 49)), { i: MAX_SCOPES + 49 },
    'the newest scope must still be there');
});

test('LRU: READING a scope protects it from the next eviction', () => {
  const s = neuf('lru');
  for (let i = 0; i < MAX_SCOPES; i += 1) s.saveState('doc-seen-', 'sess-' + i, { i });
  // `sess-0` is the coldest… until it is read.
  assert.deepEqual(s.loadState('doc-seen-', 'sess-0'), { i: 0 });
  s.saveState('doc-seen-', 'nouveau', { neuf: true });

  assert.deepEqual(s.loadState('doc-seen-', 'sess-0'), { i: 0 },
    'a scope just read must survive: reading IS a use, otherwise the busiest session gets evicted');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-1'), {}, 'the new coldest one is the one that goes');
});

// ── ③ PURGE IS AN ORDER RECEIVED, never a deduction ─────────────────────
// ⚠️ A compaction empties the real context, so what was injected before it no
//    longer describes anything. The harness SAYS it (PreCompact); we never
//    infer it.
test('PURGE BY PREFIX: a compaction empties that session and touches no other', () => {
  const s = neuf('purge');
  s.saveState('doc-seen-', 'sess-a', { a: 1 });
  s.saveState('plan-', 'sess-a', { p: 1 });
  s.saveState('doc-seen-', 'sess-b', { b: 1 });

  assert.equal(s.purge('doc-seen-sess-a'), 1, 'exactly one entry matches that prefix');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-a'), {});
  assert.deepEqual(s.loadState('plan-', 'sess-a'), { p: 1 }, 'another store of the same session is untouched');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-b'), { b: 1 }, 'another session is untouched');
});

// ── ④ THE DISK IS A SAVE, AND IT SURVIVES A CRASH ───────────────────────
// 🛑 THE WRITE STAYS ATOMIC AND ITS REASON CHANGED. It no longer protects a
//    concurrent reader — there is none. It protects against a machine dying
//    mid-write: a corrupt save is worse than no save.
test('SNAPSHOT: what a daemon knew, the next daemon finds again', () => {
  const chemin = path.join(TMP, 'reprise', 'snapshot.json');
  const a = createMemoryStore({ snapshotPath: chemin });
  a.saveState('doc-seen-', 'sess', { 'docs/x.md': { seen: true } });

  const b = createMemoryStore({ snapshotPath: chemin });
  assert.equal(b.restore(), 1, 'the new daemon must restore exactly what the previous one held');
  assert.deepEqual(b.loadState('doc-seen-', 'sess'), { 'docs/x.md': { seen: true } },
    'without this, every daemon restart re-delivers every `once` — the flaky we just closed, through a new door');
});

// ⚠️ ANTI-VACUITY: the temporary file must really disappear, otherwise the
//    state directory fills with orphans nobody watches.
test('SNAPSHOT: no temporary file survives the write', () => {
  const dossier = path.join(TMP, 'restes');
  const s = createMemoryStore({ snapshotPath: path.join(dossier, 'snapshot.json') });
  for (let i = 0; i < 20; i += 1) s.saveState('doc-seen-', 'sess', { i });
  assert.deepEqual(fs.readdirSync(dossier).filter((f) => f.endsWith('.tmp')), [],
    'an abandoned .tmp piles up unseen');
});

// 🛑 FAIL-OPEN, IDENTICAL TO THE DISK STORE: a corrupt save costs ONE extra
//    delivery, never a broken action. A daemon that refuses to start because a
//    scratch file is malformed would take the whole fleet's injection down.
test('FAIL-OPEN: a CORRUPT snapshot yields an empty state, never an exception', () => {
  const chemin = path.join(TMP, 'corrompu', 'snapshot.json');
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, '{ this is not json');
  const s = createMemoryStore({ snapshotPath: chemin });
  assert.equal(s.restore(), 0);
  assert.deepEqual(s.loadState('doc-seen-', 'sess'), {});
});

test('FAIL-OPEN: an ABSENT snapshot is a normal start, not a failure', () => {
  const s = createMemoryStore({ snapshotPath: path.join(TMP, 'jamais', 'snapshot.json') });
  assert.equal(s.restore(), 0);
});

// ⚠️ A snapshot whose SHAPE is wrong (an object where an array is expected, a
//    malformed pair) must not poison the memory either. `JSON.parse` succeeds
//    there — so parsing is not the guardrail, the shape check is.
test('FAIL-OPEN: a snapshot with the wrong SHAPE poisons nothing', () => {
  const chemin = path.join(TMP, 'forme', 'snapshot.json');
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify({ pas: 'un tableau' }));
  assert.equal(createMemoryStore({ snapshotPath: chemin }).restore(), 0);

  fs.writeFileSync(chemin, JSON.stringify([['bonne-cle', { ok: 1 }], ['seule'], [42, {}], ['nul', null]]));
  const s = createMemoryStore({ snapshotPath: chemin });
  assert.equal(s.restore(), 1, 'only the well-formed pair enters');
  assert.deepEqual(s.scopes(), ['bonne-cle']);
});

// ⚠️ WITHOUT a snapshot path the store is PURELY volatile — the shape used by
//    tests and by any caller that does not want a trace on disk. It must not
//    write anything anywhere.
test('NO PATH = no disk at all', () => {
  const s = createMemoryStore({});
  s.saveState('doc-seen-', 'sess', { a: 1 });
  assert.deepEqual(s.loadState('doc-seen-', 'sess'), { a: 1 });
  assert.equal(s.restore(), 0);
});
