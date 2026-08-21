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
import {
  key, evict, touch, adopt, purge, isEphemeral,
  createState, set as poser, keys as clefs, size as taille, MAX_SCOPES,
} from '../src/memory-store-pure.js';

// ⚠️ A HELPER, NOT A TWIN: the pure state is TWO maps (one LRU per lifetime)
//    since 2026-08-21, so a cell can no longer hand it a bare `Map`. Building it
//    through `createState`/`set` means the cells exercise the REAL routing —
//    a literal `{durable, ephemere}` here would let a key land in the wrong
//    class without anything noticing.
const etatDe = (paires) => {
  const e = createState();
  for (const [k, v] of paires) poser(e, k, v);
  return e;
};

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
  // 🛑 NO SNAPSHOT HERE, AND IT IS A MEASUREMENT, NOT A CONVENIENCE. The store
  //    rewrites its WHOLE snapshot on every state write, so filling it to the
  //    ceiling costs O(entries) of disk per write — quadratic, and at 4096 it
  //    times the cell out. The CEILING is a property of the MEMORY; the snapshot
  //    has its own cells right below. ⚠️ That cost is REAL and is written down as
  //    an open point (`kernel-state.md`): it was invisible at the old ceiling and
  //    must be decided before the switch-over, never discovered in production.
  const s = createMemoryStore({ snapshotPath: null });
  for (let i = 0; i < MAX_SCOPES + 50; i += 1) s.saveState('doc-seen-', 'sess-' + i, { i });

  assert.equal(s.size(), MAX_SCOPES,
    `the memory must be capped at ${MAX_SCOPES} scopes, measured ${s.size()} — an unbounded writer is an outage with a date`);
  assert.deepEqual(s.loadState('doc-seen-', 'sess-0'), {}, 'the oldest scope must have been evicted');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-' + (MAX_SCOPES + 49)), { i: MAX_SCOPES + 49 },
    'the newest scope must still be there');
});

test('LRU: READING a scope protects it from the next eviction', () => {
  // 🛑 NO SNAPSHOT, same reason as the ceiling cell above: filling to the ceiling
  //    with a snapshot per write is O(entries) of disk per write. What is under
  //    test here is the LRU, which lives entirely in memory.
  const s = createMemoryStore({ snapshotPath: null });
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
  const m = etatDe([['a', 1], ['b', 2], ['c', 3]]);
  assert.equal(evict(m, 3), 0, 'at the ceiling nothing is dropped');
  assert.equal(evict(m, 2), 1, 'one over the ceiling drops exactly one');
  assert.deepEqual(clefs(m), ['b', 'c'], 'the COLDEST goes — insertion order is the LRU');
  assert.equal(evict(m, 0), 2, 'a ceiling of zero empties it');
});

test('TOUCH: reading is a USE, and an absent key stays absent', () => {
  const m = etatDe([['a', { v: 1 }], ['b', { v: 2 }]]);
  assert.deepEqual(touch(m, 'a'), { v: 1 });
  assert.deepEqual(clefs(m), ['b', 'a'], 'the read entry moves to the young end');
  assert.equal(touch(m, 'absent'), undefined, 'an absent key must not be created by reading it');
  assert.equal(clefs(m).includes('absent'), false);
});

test('ADOPT: only well-formed pairs enter, and the ceiling applies', () => {
  const m = createState();
  assert.equal(adopt('pas un tableau', m, 10), 0);
  assert.equal(adopt({ x: 1 }, m, 10), 0, 'valid JSON of the wrong SHAPE is refused — parsing is not the guardrail');
  assert.equal(adopt([['a', { v: 1 }], ['seule'], [42, {}], ['nul', null], ['tab', []]], m, 10), 1,
    'a malformed pair, a non-string key, a null and an ARRAY value are all dropped');
  assert.deepEqual(clefs(m), ['a']);

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
  const primitives = createState();
  assert.equal(adopt([['chaine', 'seen'], ['nombre', 42], ['bool', true], ['ok', { v: 1 }]], primitives, 10), 1,
    'a non-null PRIMITIVE is not a state: it must be dropped, never stored');
  assert.deepEqual(clefs(primitives), ['ok']);

  const hostile = createState();
  assert.equal(adopt([42, 'texte', null, ['a', { v: 1 }, 'surplus'], ['bon', { v: 2 }]], hostile, 10), 1,
    'a non-array entry must be DROPPED, never destructured (it would throw), and a 3-item entry is not a pair');
  assert.deepEqual(clefs(hostile), ['bon']);

  const grand = createState();
  assert.equal(adopt([['a', {}], ['b', {}], ['c', {}]], grand, 2), 2, 'the ceiling applies to a restore too');
  assert.deepEqual(clefs(grand), ['b', 'c']);
});

test('PURGE: by PREFIX, and it counts what it really removed', () => {
  const m = etatDe([['doc-seen-a', {}], ['doc-seen-ab', {}], ['plan-a', {}], ['doc-seen-b', {}]]);
  assert.equal(purge(m, 'doc-seen-a'), 2, 'the prefix matches `a` and `ab` — and says so');
  assert.deepEqual(clefs(m), ['doc-seen-b', 'plan-a'],
    'a purge sweeps BOTH classes, and the durable map is listed first — forgetting one map is the '
    + 'silent half of a purge');
  assert.equal(purge(m, 'rien-de-tel'), 0, 'a prefix matching nothing removes nothing and reports zero');
});

test('THE CEILING IS A REAL NUMBER, not an idea', () => {
  assert.equal(typeof MAX_SCOPES, 'number');
  assert.ok(MAX_SCOPES > 0, 'a ceiling of zero would evict everything on every write');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑦ TWO CLASSES OF KEY, TWO BUDGETS (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THESE CELLS FORBID IS A SCALING ONE, AND IT IS SILENT. A `plan-`
//    key is born at EVERY tool call and dies with its action; a `doc-seen-` key
//    lives as long as its agent. Under ONE shared ceiling the ephemeral flood
//    evicts the durable — a single busy agent erases every other agent's memory
//    in a few hundred calls, and each eviction re-delivers a `once`. Nothing
//    errors, and it gets WORSE with the number of agents, i.e. exactly where the
//    product is aimed.
// ⚠️ The ceilings are passed as ARGUMENTS here: the cells must exercise the RULE,
//    never the production figures. Asserting on 4096 would make the test a copy
//    of the constant and turn any resizing into a false red.

test('a flood of EPHEMERAL keys can never evict a DURABLE one', () => {
  const etat = createState();
  poser(etat, 'doc-seen-agent-A', { seen: ['doc'] });
  for (let i = 0; i < 50; i += 1) poser(etat, `plan-agent-B--inv-${i}`, { segments: [] });

  evict(etat, 4, 3);

  assert.ok(clefs(etat).includes('doc-seen-agent-A'),
    "an agent's memory was evicted by ANOTHER agent's plans: one busy agent would erase the "
    + 'whole fleet, one re-delivered `once` at a time, in silence');
  assert.equal(clefs(etat).filter((k) => k.startsWith('plan-')).length, 3,
    'the ephemeral budget must be enforced too — otherwise the ceiling is decorative');
});

test('each class evicts its OWN coldest, and the order is the LRU order', () => {
  const etat = createState();
  for (const n of ['A', 'B', 'C']) poser(etat, `doc-seen-${n}`, { seen: [] });
  for (const n of [1, 2, 3]) poser(etat, `plan-x--inv-${n}`, { segments: [] });

  // A is the coldest durable, 1 the coldest plan — until A is READ.
  touch(etat, 'doc-seen-A');
  evict(etat, 2, 2);

  assert.ok(clefs(etat).includes('doc-seen-A'), 'reading is a USE: the entry just read must not be the one dropped');
  assert.ok(!clefs(etat).includes('doc-seen-B'), 'the coldest DURABLE goes, and it is B once A has been touched');
  assert.ok(!clefs(etat).includes('plan-x--inv-1'), 'the coldest PLAN goes, independently of the durable class');
  assert.ok(clefs(etat).includes('plan-x--inv-3'), 'and the youngest plan stays');
});

test('the classes are told apart by the store PREFIX, never by guessing', () => {
  assert.equal(isEphemeral('plan-abc--inv-1'), true);
  assert.equal(isEphemeral('doc-seen-abc'), false);
  assert.equal(isEphemeral('remainder-abc'), false);
  assert.equal(isEphemeral('turn-count-abc'), false,
    'a key wrongly classed as ephemeral would be evicted on the wrong budget — and a turn counter '
    + 'lost silently re-arms every `smart` document');
});

// ⚠️ THE THREE CELLS BELOW EXIST BECAUSE OF MUTATION, NOT BECAUSE OF A BUG.
//    Each kills a mutant the suite TRAVERSED without DISTINGUISHING — the only
//    judge that asks "does this test tell anything apart?".

test('SIZE adds the two classes — a subtraction would report a plausible number', () => {
  const e = createState();
  poser(e, 'doc-seen-a', {});
  poser(e, 'doc-seen-b', {});
  poser(e, 'plan-x--inv-1', {});
  assert.equal(taille(e), 3,
    'size must SUM the two maps: `durable - ephemere` yields 1 here, a number that looks like a '
    + 'state count and is not one');
});

test('EVICT with no ephemeral ceiling given falls back to the DECLARED default', () => {
  const e = createState();
  for (let i = 0; i < 3; i += 1) poser(e, `plan-x--inv-${i}`, {});
  assert.equal(evict(e, 0), 0,
    'called with two arguments the ephemeral budget must be the module default (far above 3): a '
    + 'hardcoded `false` in that ternary would silently apply the DURABLE ceiling to the plans');
  assert.equal(clefs(e).length, 3, 'and nothing may be dropped');
  assert.equal(evict(e, 0, 1), 2, 'given explicitly, the ceiling is the one passed');
});

test('EVICT returns what it removed across BOTH classes, added', () => {
  const e = createState();
  poser(e, 'doc-seen-a', {});
  poser(e, 'doc-seen-b', {});
  poser(e, 'plan-x--inv-1', {});
  poser(e, 'plan-x--inv-2', {});
  assert.equal(evict(e, 1, 1), 2,
    'one durable and one ephemeral were dropped: a SUBTRACTION would report 0, i.e. "nothing was '
    + 'evicted" while the memory just shrank');
});
