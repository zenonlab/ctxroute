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
  key, evict, touch, adopt, purge, isEphemeral, isWriteThrough, persistTick, shouldFlush,
  createState, set as poser, keys as clefs, size as taille,
  MAX_SCOPES, MAX_EPHEMERAL, PERSIST_EVERY,
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

// ⚠️ A STORE WITH A PATH REGISTERS A `process.on('exit')` HOOK — that is the
//    CLEAN-EXIT authority, and it is right. But a suite builds a dozen stores in
//    one process, so every cell that is NOT about the exit path injects a no-op
//    registrar: piling listeners onto a long-lived emitter is the accumulation
//    class this repo audits everywhere else, and it would surface as a warning
//    nobody reads rather than as a red.
const SANS_SORTIE = { onExit: () => () => {} };
const neuf = (nom) => createMemoryStore({ snapshotPath: path.join(TMP, nom, 'snapshot.json'), ...SANS_SORTIE });

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
  // 🛑 NO SNAPSHOT HERE, AND IT IS A MEASUREMENT, NOT A CONVENIENCE. The CEILING
  //    is a property of the MEMORY; the snapshot has its own cells (⑧ below).
  // ⚠️ Until 2026-08-21 the store rewrote its WHOLE snapshot on EVERY state
  //    write, so filling it to the ceiling cost O(entries) of disk per write and
  //    timed this cell out at 4096 — that TIMEOUT is how the defect was found.
  //    It is closed (count + clean exit), and this cell still asks for no
  //    snapshot: what it proves has nothing to do with the disk.
  const s = createMemoryStore({ snapshotPath: null });
  for (let i = 0; i < MAX_SCOPES + 50; i += 1) s.saveState('doc-seen-', 'sess-' + i, { i });

  assert.equal(s.size(), MAX_SCOPES,
    `the memory must be capped at ${MAX_SCOPES} scopes, measured ${s.size()} — an unbounded writer is an outage with a date`);
  assert.deepEqual(s.loadState('doc-seen-', 'sess-0'), {}, 'the oldest scope must have been evicted');
  assert.deepEqual(s.loadState('doc-seen-', 'sess-' + (MAX_SCOPES + 49)), { i: MAX_SCOPES + 49 },
    'the newest scope must still be there');
});

test('LRU: READING a scope protects it from the next eviction', () => {
  // 🛑 NO SNAPSHOT, same reason as the ceiling cell above: what is under test
  //    here is the LRU, which lives entirely in memory.
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
// 🔴 AND THE PROPERTY THIS CELL PROVES WAS RESTATED ON 2026-08-21. It used to be
//    "the state survives a restart", because every mutation wrote the whole
//    snapshot — O(total state) of disk per tool call. It is now "the state
//    survives a CLEAN restart entirely": the daemon's exit flushes what the count
//    had not. Hence the explicit `flush()` below — it is the SECOND authority,
//    fired here by hand exactly as `process.on('exit')` fires it in production.
test('SNAPSHOT: what a daemon knew, the next daemon finds again', () => {
  const chemin = path.join(TMP, 'reprise', 'snapshot.json');
  const a = createMemoryStore({ snapshotPath: chemin, ...SANS_SORTIE });
  a.saveState('doc-seen-', 'sess', { 'docs/x.md': { seen: true } });
  assert.equal(a.flush(), true, 'a clean exit must write what the count had not yet flushed');

  const b = createMemoryStore({ snapshotPath: chemin, ...SANS_SORTIE });
  assert.equal(b.restore(), 1, 'the new daemon must restore exactly what the previous one held');
  assert.deepEqual(b.loadState('doc-seen-', 'sess'), { 'docs/x.md': { seen: true } },
    'without this, every daemon restart re-delivers every `once` — the flaky we just closed, through a new door');
});

// ⚠️ ANTI-VACUITY: the temporary file must really disappear, otherwise the
//    state directory fills with orphans nobody watches.
test('SNAPSHOT: no temporary file survives the write', () => {
  const dossier = path.join(TMP, 'restes');
  const s = createMemoryStore({ snapshotPath: path.join(dossier, 'snapshot.json'), ...SANS_SORTIE });
  // ⚠️ ENOUGH MUTATIONS TO CROSS THE COUNT SEVERAL TIMES, plus a flush: this cell
  //    must exercise REAL writes, and since 2026-08-21 twenty mutations no longer
  //    guarantee a single one. A cell that stopped writing would still be green
  //    on "no .tmp survives" — and green while measuring nothing.
  for (let i = 0; i < PERSIST_EVERY * 3; i += 1) s.saveState('doc-seen-', 'sess', { i });
  s.flush();
  assert.ok(fs.existsSync(path.join(dossier, 'snapshot.json')), 'anti-vacuity: something must really have been written');
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
  const s = createMemoryStore({ snapshotPath: chemin, ...SANS_SORTIE });
  assert.equal(s.restore(), 0);
  assert.deepEqual(s.loadState('doc-seen-', 'sess'), {});
});

test('FAIL-OPEN: an ABSENT snapshot is a normal start, not a failure', () => {
  const s = createMemoryStore({ snapshotPath: path.join(TMP, 'jamais', 'snapshot.json'), ...SANS_SORTIE });
  assert.equal(s.restore(), 0);
});

// ⚠️ A snapshot whose SHAPE is wrong (an object where an array is expected, a
//    malformed pair) must not poison the memory either. `JSON.parse` succeeds
//    there — so parsing is not the guardrail, the shape check is.
test('FAIL-OPEN: a snapshot with the wrong SHAPE poisons nothing', () => {
  const chemin = path.join(TMP, 'forme', 'snapshot.json');
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify({ pas: 'un tableau' }));
  assert.equal(createMemoryStore({ snapshotPath: chemin, ...SANS_SORTIE }).restore(), 0);

  fs.writeFileSync(chemin, JSON.stringify([['bonne-cle', { ok: 1 }], ['seule'], [42, {}], ['nul', null]]));
  const s = createMemoryStore({ snapshotPath: chemin, ...SANS_SORTIE });
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

  // 🔴 AND THE DEFAULT MUST REALLY BITE — the cell above did NOT prove it, and
  //    CI said so: the mutant turning that ternary into `false` survived. With
  //    it, the ceiling becomes `undefined`, every `size > undefined` is false,
  //    and the ephemeral class STOPS BEING BOUNDED AT ALL — the exact unbounded
  //    growth this module exists to forbid, reachable by any caller that omits
  //    one argument. Proving "nothing is dropped below the default" is not
  //    proving the default exists; only crossing it is.
  const plein = createState();
  for (let i = 0; i < MAX_EPHEMERAL + 1; i += 1) poser(plein, `plan-y--inv-${i}`, {});
  assert.equal(evict(plein, 0), 1,
    'one over the DECLARED default must be dropped: without a real fallback the ephemeral class '
    + 'grows for ever, silently, on a daemon that runs for weeks');
  assert.equal(clefs(plein).length, MAX_EPHEMERAL, 'and it lands exactly on the ceiling');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑧ THE SNAPSHOT IS NOT WRITTEN ON EVERY MUTATION (2026-08-21)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT: the shell rewrote the WHOLE snapshot on EVERY state write —
//    O(total state) of disk per tool call. Invisible at the old 512 ceiling; at
//    4096 + 2048 it is megabytes per action, on a machine with an open work item
//    on SSD wear. It surfaced as a TEST TIMEOUT, not as a design review.
// 🛑 THE PROPERTY THIS CELL NOW PROVES, and it is the RESTATED one: a CLEAN
//    restart loses NOTHING, and a `kill -9` loses at most the last N mutations —
//    i.e. at most N documents delivered once more, never a wrong action.
// ⚠️ THE FILE'S EXISTENCE IS THE OBSERVABLE, deliberately: it is a FACT of the
//    filesystem, not a counter we would have to trust. Deleting it between the
//    two halves is what turns "it was written at some point" into "it was
//    written EXACTLY on the Nth mutation and not once in between".
test('COUNT + CLEAN EXIT: one snapshot per N mutations, carrying the CURRENT state', () => {
  const chemin = path.join(TMP, 'cadence', 'snapshot.json');
  // ⚠️ A THUNK-FREE local: everything here is built INSIDE the callback, which is
  //    what makes Stryker's perTest coverage map these mutants to this cell.
  let surSortie = null;
  const s = createMemoryStore({ snapshotPath: chemin, onExit: (fn) => { surSortie = fn; return () => { surSortie = null; }; } });

  // ── ① N−1 mutations write NOTHING. Under the old behaviour the file existed
  //    after the FIRST one, so this half alone forbids the return of "one write
  //    per mutation".
  for (let i = 1; i < PERSIST_EVERY; i += 1) s.saveState('doc-seen-', 'sess', { i });
  assert.equal(fs.existsSync(chemin), false,
    `${PERSIST_EVERY - 1} mutations must not have touched the disk — one snapshot per write is O(total state) per tool call`);

  // ── ② the Nth writes, exactly once, and carries the state as it is NOW.
  s.saveState('doc-seen-', 'sess', { i: PERSIST_EVERY });
  assert.equal(fs.existsSync(chemin), true, 'the Nth mutation must flush');
  const ecrit = new Map(JSON.parse(fs.readFileSync(chemin, 'utf8')));
  assert.deepEqual(ecrit.get('doc-seen-sess'), { i: PERSIST_EVERY },
    'a stale snapshot is worse than a rare one: what is written must be the CURRENT state, not the state at the last write');

  // ── ③ THE PERIOD IS REALLY N, not "once and then whenever". The file is
  //    removed; nothing may recreate it until the count comes round again. This
  //    is the half that kills an off-by-one in the threshold.
  fs.rmSync(chemin);
  for (let i = 1; i < PERSIST_EVERY; i += 1) s.saveState('doc-seen-', 'sess', { tour2: i });
  assert.equal(fs.existsSync(chemin), false, 'the counter must RESET on a write, not drift');
  s.saveState('doc-seen-', 'sess', { tour2: PERSIST_EVERY });
  assert.equal(fs.existsSync(chemin), true, 'and the next full cycle writes again');

  // ── ④ THE CLEAN EXIT PERSISTS WHAT THE COUNT HAD NOT. Without this authority a
  //    stale-code restart (exit 90, the daemon's most frequent death) would lose
  //    up to N−1 mutations EVERY time an agent edits this repository.
  fs.rmSync(chemin);
  s.saveState('doc-seen-', 'sess', { final: true });
  assert.equal(typeof surSortie, 'function', 'a store with a snapshot path must REGISTER its exit hook, or the second authority does not exist');
  surSortie();
  assert.deepEqual(new Map(JSON.parse(fs.readFileSync(chemin, 'utf8'))).get('doc-seen-sess'), { final: true },
    'a clean exit must write the mutations the count was still holding');

  // ── ⑤ AND AN EXIT WITH NOTHING PENDING WRITES NOTHING. Otherwise the flush
  //    puts back one full O(total state) write on a path that runs ten times in
  //    two minutes while an agent edits this repo.
  fs.rmSync(chemin);
  assert.equal(s.flush(), false, 'an empty backlog has nothing to save');
  assert.equal(fs.existsSync(chemin), false, 'and it must not have written anyway');

  s.close();
  assert.equal(surSortie, null, 'close() releases the listener — a store must not pile handlers onto a long-lived emitter');
});

// ⚠️ THE DECISIONS, REACHED DIRECTLY — the rule lives in the pure module PRECISELY
//    because Stryker never mutates the I/O shell, so it must also be JUDGED there.
test('PERSIST TICK: the backlog grows, fires on the Nth, and resets', () => {
  assert.deepEqual(persistTick(0, 3), { pending: 1, persist: false }, 'the first mutation only increments');
  assert.deepEqual(persistTick(1, 3), { pending: 2, persist: false });
  assert.deepEqual(persistTick(2, 3), { pending: 0, persist: true },
    'the Nth writes AND clears the backlog: not clearing it would write on every mutation from then on');
  assert.deepEqual(persistTick(0, 1), { pending: 0, persist: true },
    'N = 1 must degrade to the historical behaviour — one write per mutation, no special case');
  assert.deepEqual(persistTick(5, 3), { pending: 0, persist: true },
    'a backlog already past the threshold still fires: a strict `>` would let it run away for ever');
});

test('SHOULD FLUSH: a clean exit writes only when something is pending', () => {
  assert.equal(shouldFlush(0), false, 'an empty backlog must not trigger a full snapshot write');
  assert.equal(shouldFlush(1), true, 'one unwritten mutation is exactly what the exit authority exists for');
});

test('PERSIST_EVERY IS A REAL NUMBER, and its bounds are the ones written down', () => {
  assert.equal(typeof PERSIST_EVERY, 'number');
  assert.ok(PERSIST_EVERY > 16,
    'below the 16 declared frames a full snapshot is still written once per action: the defect intact, with extra code');
  assert.ok(PERSIST_EVERY < 1024,
    'above that, one kill -9 re-delivers a whole session worth of documents — a flood, no longer "one extra delivery"');
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

// ── WHICH KEYS THE DISK OWNS ────────────────────────────────────────────
// 🛑 REACHED DIRECTLY, AND THAT IS THE WHOLE POINT OF THIS CELL. Exercised only
//    THROUGH the I/O shell, this decision showed **2 mutants with NO COVERAGE**
//    on its first run — Stryker saw no test at all, exactly the defect the
//    header of this file records (45 survivors out of 45 on 2026-08-20). A
//    decision is proven where it is TAKEN, never where it is consumed.
// 🔑 WHAT IT PROTECTS, in one sentence: inverted, the DURABLE class would live
//    in RAM and die with the daemon (every `once` re-delivered to the whole
//    fleet, silently) while the EPHEMERAL class would cost one disk write per
//    frame per action on a machine whose SSD wear is a declared budget.
test('the DURABLE class is written through, the EPHEMERAL one is not', () => {
  // The three durable prefixes, written LITERALLY: they are the contract, and
  // reading them from the module would prove `x === x`.
  for (const p of ['doc-seen-', 'turn-count-', 'remainder-', 'ctxroute-seen-']) {
    assert.equal(isWriteThrough(key(p, 'sess')), true,
      `${p} stopped being written through: its loss re-delivers a document, which is the visible bug`);
  }
  assert.equal(isWriteThrough(key('plan-', 'sess--inv-1')), false,
    'an ephemeral key became write-through: one disk write per frame per action, for a state that dies with the action');

  // ⚠️ ANTI-VACUITY — the two answers must actually DIFFER. A function stuck on
  //    `true` satisfies every durable assertion above, and a cell that cannot
  //    tell a constant from a decision measures nothing.
  assert.notEqual(isWriteThrough(key('doc-seen-', 's')), isWriteThrough(key('plan-', 's')),
    'the classification returns the same answer for both classes: it is a constant, not a decision');

  // The classification is the EXACT complement of `isEphemeral` — a second list
  // of prefixes would be a second truth about the same keys.
  for (const k of ['doc-seen-x', 'plan-y', '', 'plan', 'planX-']) {
    assert.equal(isWriteThrough(k), !isEphemeral(k),
      `the two classifications disagree on ${JSON.stringify(k)}: there is a second enumeration somewhere`);
  }
});
