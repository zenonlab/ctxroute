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
// 🛑 STATIC, DIRECT IMPORT OF THE MUTATED MODULE. Stryker's `perTest` coverage
//    maps a mutant to the tests that covered it, and a dynamic `require` breaks
//    that mapping: MEASURED 2026-08-20, `memory-store-pure.js` scored **0.00 %,
//    45 survivors out of 45** — the decisions were covered THROUGH the I/O shell,
//    so Stryker saw no test at all. The rule was already written; it was broken
//    here. Reaching the pure module directly is what makes the score real.
import { key, evict, touch, adopt, purge, MAX_SCOPES } from '../src/memory-store-pure.js';

const require = createRequire(import.meta.url);
// ⚠️ The I/O shell is loaded dynamically (it reads env-driven paths at require
//    time) and is NOT mutated — that is fine.
const { createMemoryStore } = require('../src/memory-store.js');

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

// ═══════════════════════════════════════════════════════════════════════
// THE DECISIONS, REACHED DIRECTLY — this is what Stryker actually measures.
// ⚠️ Going through the I/O shell covers the same lines but maps to NO mutant.
// ═══════════════════════════════════════════════════════════════════════

test('KEY: the prefix is part of the identity, never a suffix nobody reads', () => {
  assert.equal(key('doc-seen-', 'sess'), 'doc-seen-sess');
  assert.notEqual(key('doc-seen-', 'a'), key('plan-', 'a'), 'two stores of one session must not collide');
});

test('EVICT: drops the OLDEST first, and only above the ceiling', () => {
  const m = new Map([['a', 1], ['b', 2], ['c', 3]]);
  assert.equal(evict(m, 3), 0, 'at the ceiling nothing is dropped');
  assert.equal(evict(m, 2), 1, 'one over the ceiling drops exactly one');
  assert.deepEqual([...m.keys()], ['b', 'c'], 'the COLDEST goes — insertion order is the LRU');
  assert.equal(evict(m, 0), 2, 'a ceiling of zero empties it');
});

test('TOUCH: reading is a USE, and an absent key stays absent', () => {
  const m = new Map([['a', { v: 1 }], ['b', { v: 2 }]]);
  assert.deepEqual(touch(m, 'a'), { v: 1 });
  assert.deepEqual([...m.keys()], ['b', 'a'], 'the read entry moves to the young end');
  assert.equal(touch(m, 'absent'), undefined, 'an absent key must not be created by reading it');
  assert.equal(m.has('absent'), false);
});

test('ADOPT: only well-formed pairs enter, and the ceiling applies', () => {
  const m = new Map();
  assert.equal(adopt('pas un tableau', m, 10), 0);
  assert.equal(adopt({ x: 1 }, m, 10), 0, 'valid JSON of the wrong SHAPE is refused — parsing is not the guardrail');
  assert.equal(adopt([['a', { v: 1 }], ['seule'], [42, {}], ['nul', null], ['tab', []]], m, 10), 1,
    'a malformed pair, a non-string key, a null and an ARRAY value are all dropped');
  assert.deepEqual([...m.keys()], ['a']);

  // 🔴 THE TWO CASES THE SHAPE GUARD REALLY EXISTS FOR — and without them FOUR
  //    mutants survived on that single line (measured in CI: `if (false)`,
  //    `&&` for `||`, `|| false`…). They all said the same thing: the cell
  //    exercised the guard without DISTINGUISHING what it does.
  //    · a NON-ARRAY entry: destructuring a number THROWS, so dropping the
  //      `Array.isArray` half turns a corrupt save into a crash at startup —
  //      the daemon would refuse to start over a scratch file.
  //    · an entry of THREE items: without the length half it is silently
  //      accepted, keeping its first two elements. A save we never wrote would
  //      become state we trust.
  // 🔴 ET LA VALEUR PRIMITIVE — dernier survivant du fichier, mesuré en CI.
  //    `!v` écarte null/undefined/0/''/false, `Array.isArray` écarte les tableaux,
  //    mais une CHAÎNE ou un NOMBRE non nuls passeraient sans `typeof v !== 'object'`.
  //    Un scope dont l'état serait la chaîne "seen" entrerait alors en mémoire, et
  //    le premier `Object.keys()` dessus rendrait ses INDICES de caractères — un
  //    état fantôme, silencieux. Ce garde n'est donc PAS redondant, et c'est le
  //    test qui ne le distinguait pas.
  const primitives = new Map();
  assert.equal(adopt([['chaine', 'seen'], ['nombre', 42], ['bool', true], ['ok', { v: 1 }]], primitives, 10), 1,
    'a non-null PRIMITIVE is not a state: it must be dropped, never stored');
  assert.deepEqual([...primitives.keys()], ['ok']);

  const hostile = new Map();
  assert.equal(adopt([42, 'texte', null, ['a', { v: 1 }, 'surplus'], ['bon', { v: 2 }]], hostile, 10), 1,
    'a non-array entry must be DROPPED, never destructured (it would throw), and a 3-item entry is not a pair');
  assert.deepEqual([...hostile.keys()], ['bon']);

  const grand = new Map();
  assert.equal(adopt([['a', {}], ['b', {}], ['c', {}]], grand, 2), 2, 'the ceiling applies to a restore too');
  assert.deepEqual([...grand.keys()], ['b', 'c']);
});

test('PURGE: by PREFIX, and it counts what it really removed', () => {
  const m = new Map([['doc-seen-a', {}], ['doc-seen-ab', {}], ['plan-a', {}], ['doc-seen-b', {}]]);
  assert.equal(purge(m, 'doc-seen-a'), 2, 'the prefix matches `a` and `ab` — and says so');
  assert.deepEqual([...m.keys()], ['plan-a', 'doc-seen-b']);
  assert.equal(purge(m, 'rien-de-tel'), 0, 'a prefix matching nothing removes nothing and reports zero');
});

test('THE CEILING IS A REAL NUMBER, not an idea', () => {
  assert.equal(typeof MAX_SCOPES, 'number');
  assert.ok(MAX_SCOPES > 0, 'a ceiling of zero would evict everything on every write');
});
