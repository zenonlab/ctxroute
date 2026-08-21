// ═══════════════════════════════════════════════════════════════════════
// SCALE BENCH — how the daemon's cost GROWS with the number of agent scopes.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE GAP THIS CLOSES, AND IT IS THE MOST HONEST ONE ON THE LIST. This
//    project is sized for HUNDREDS of parallel agents, and until this file
//    existed **nobody had ever exercised it at that sizing**. The ceiling
//    arithmetic in `memory-store-pure.js` (3 durable keys per agent, 4096
//    durable keys ≈ 1300 simultaneous agents) was a REASONING, never a
//    measurement. These are the project's first real numbers at scale.
//
// 🛑 WHAT IT PROVES — and read the next block before quoting any of it:
//    that on ONE machine, ONE OS, ONE synthetic load, the daemon's per-request
//    cost and its retained memory grow NO FASTER THAN LINEARLY in the number of
//    distinct agent scopes it holds, from 128 to 1024 of them.
// 🛑 WHAT IT DOES **NOT** PROVE, stated so nobody oversells it later:
//    ① it is a FLOOR, never a certificate — one machine, one OS, one Node
//      version, a synthetic corpus, and no other tenant on the CPU;
//    ② it never runs hundreds of REAL agents: a scope here is a session id, not
//      a Claude Code process with its own corpus, its own transcript and its own
//      timing. Concurrency of real clients is proven elsewhere
//      (`state-daemon.test.js`, 16 real processes), never here;
//    ③ it stops at 1024 scopes, deliberately UNDER the 4096 durable ceiling, so
//      it says nothing about behaviour AT or ABOVE eviction;
//    ④ it measures the handler and the store, i.e. the part whose cost can
//      depend on how much state is held. The socket adds a constant (measured
//      elsewhere at 0.17 ms/request) and constants do not change a slope;
//    ⑤ a superlinear path SMALL ENOUGH to hide under the constant cost of one
//      request would pass. The `/turn` track exists precisely to shrink that
//      constant — it is where this bench has teeth. Cell ② is what says how
//      much, and it is the ONLY reason the margin below can be called measured.
//
// 🛑 THE SLOPE, NEVER AN ABSOLUTE TIME. A duration in milliseconds is a property
//    of THIS machine and travels nowhere; the RATIO when the load quadruples is
//    a property of the ALGORITHM and travels everywhere. Nothing below asserts
//    on a millisecond, a byte total, or a rate — only on how those grow.
// 🛑 EVERY CELL PRINTS ITS READINGS AND ITS RATIO, ON SUCCESS AS WELL AS ON
//    FAILURE, and the print happens BEFORE the assertions so a red cell still
//    shows its numbers. A passing gate that tells nobody what it measured is how
//    a threshold becomes FOLKLORE: the next reader cannot re-derive it, so the
//    next reader either trusts it blindly or deletes it.
// 🛑 NO TIMER IS EVER USED AS A VERDICT. Readiness comes from the socket's own
//    `listening` event; the driver's completion comes from its EXIT. There is no
//    `sleep` in this file, and if a cell here ever needs one it has stopped
//    asking the kernel and started guessing.
// ⚠️ HEAVY LANE by content (it spawns a process): the GLOBAL 30 s timeout
//    applies and no per-test timeout is declared. The request counts below are
//    sized to keep the whole file a few seconds, because it runs on every push.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-scale-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');
fs.mkdirSync(DOCS, { recursive: true });
fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, showNotification: false }));

// ⚠️ A REAL corpus, not an empty directory — same reason as the leak cell: with
//    nothing to read the engine barely works, the readings collapse into
//    allocator noise and the comparison becomes a coin toss. Six documents, two
//    of which MATCH: one `dumb` (so every single request does full work and
//    produces output — that is what makes "the daemon is not mute" observable)
//    and one `once` (so each new scope really RECORDS a delivery, which is what
//    puts a durable key in the store).
fs.writeFileSync(path.join(DOCS, 'always.md'),
  `---\nmatch: server.js\nmode: dumb\n---\n# ALWAYS\nCORPS-BENCH\n${'invariant line to carry\n'.repeat(30)}`);
fs.writeFileSync(path.join(DOCS, 'first-time.md'),
  `---\nmatch: server.js\nmode: once\n---\n# FIRST\n${'invariant line to carry\n'.repeat(30)}`);
for (let i = 0; i < 4; i += 1) {
  fs.writeFileSync(path.join(DOCS, `other-${i}.md`),
    `---\nmatch: nothing-${i}.js\nmode: dumb\n---\n# Other ${i}\n${'invariant line to carry\n'.repeat(30)}`);
}

const src = (...bits) => JSON.stringify(path.join(__dirname, '..', 'src', ...bits).replace(/\\/g, '/'));

// ═══════════════════════════════════════════════════════════════════════
// THE DRIVER — it IS the daemon, and it is also its own client.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 IT RUNS IN A DEDICATED PROCESS WITH `--expose-gc`, for the same reason the
//    leak cell does: measuring a heap inside the test runner proves nothing,
//    vitest allocates around us. Here the collector runs before every reading,
//    so what is left is genuinely RETAINED.
// 🛑 THE COST IS MEASURED ON `handle()`, THE DAEMON'S OWN WORK, and that choice
//    is what gives this bench any sensitivity at all. A local round trip costs
//    hundreds of microseconds and is CONSTANT in the number of scopes; a store
//    operation costs a few. Timing the round trip would bury the very quantity
//    being measured under a constant that has nothing to do with it. The socket
//    is not skipped, it is measured SEPARATELY (the HTTP track below), where its
//    job is to prove that the thing benchmarked is the thing served.
// ⚠️ TWO TRACKS, DELIBERATELY:
//    · `/turn` — the store, almost alone (read-modify-write of one counter).
//      This is the SENSITIVE track: the constant is tiny, so a cost that grows
//      with the held state shows up. Cell ② proves it does.
//    · `/pretool` — the whole gate, end to end. Realistic, and much less
//      sensitive (the corpus read is a large constant). Reported and asserted
//      too, because "the real path does not degrade" is the claim that matters
//      to an operator, even when the criterion is blunter there.
// ⚠️ `--sabotage` wires a store whose every WRITE serialises the entire state —
//    the exact shape of the defect this repo already carries a note about
//    ("the snapshot is rewritten IN FULL on every state write"). Cell ② requires
//    the criterion to REJECT it. A gate never seen failing is a gate ASSUMED to
//    work, and this repo's worst defect has always been a GREEN THAT SEES
//    NOTHING.
// ═══════════════════════════════════════════════════════════════════════
const DRIVER = path.join(TMP, 'scale-driver.js');
fs.writeFileSync(DRIVER, `
'use strict';
const http = require('http');
const hs = require(${src('hooks', 'http-server.js')});
const { createMemoryStore } = require(${src('memory-store.js')});
const { run } = require(${src('pretool-core.js')});
const { output } = require(${src('hooks', 'doc-inject.js')});
const { parseFrameArgs } = require(${src('lib-pure.js')});

// 2^7 … 2^10 scopes. It stops UNDER the 4096 durable ceiling on purpose: past it
// the LRU starts evicting, and a bench that measures eviction is measuring a
// different property while looking like it measures this one.
// 🔴 IT WAS 64…512 FOR ONE RUN, AND THAT RANGE COULD NOT SEE THE DEFECT. Cell ②
//    measured 2.85x where the shape predicts 4x: at those sizes the per-request
//    CONSTANT is a real fraction of the cost, and a constant compresses a ratio
//    towards 1. Doubling the range halves that fraction. The criterion was NOT
//    touched to fix it — moving the margin to fit a measurement is how a gate
//    stops measuring anything.
const LEVELS = [128, 256, 512, 1024];
const SOUS_LOTS = 5;        // sub-batches per reading (see \`mediane\`)
const TURN_PAR_LOT = 160;   // ⇒ 800 timed \`/turn\` calls per level
const PRETOOL_PAR_LOT = 8;  // ⇒ 40 timed \`/pretool\` calls per level (they cost ~ms)
const HTTP_REQS = 100;
const WARMUP_TURN = 400;    // JIT, inline caches, lazy requires: paid ONCE, untimed
const WARMUP_PRETOOL = 40;

const sabotage = process.argv[2] === '--sabotage';
const vrai = createMemoryStore({ snapshotPath: null });
// The whole state serialised on every write: O(total state) per mutation, the
// textbook shape of a cost that grows with the fleet instead of with the work.
const miroir = new Map();
let puits = 0;
const store = !sabotage ? vrai : {
  loadState: (p, s) => vrai.loadState(p, s),
  saveState: (p, s, v) => { miroir.set(p + s, v); puits += JSON.stringify([...miroir]).length; return vrai.saveState(p, s, v); },
  purge: (k) => vrai.purge(k),
  size: () => vrai.size(),
  scopes: () => vrai.scopes(),
};

// ⚠️ The collaborators are exactly \`createServer\`'s defaults. They are named
//    here because \`handle\` takes them as an argument — the shell injects them so
//    the core can be driven; that is the seam, used as intended.
const deps = { runFn: run, outputFn: output, parseFrames: parseFrameArgs, store, onAddressInUse: null };

let calls = 0;
let delivered = 0;
let turnsMax = 0;

function turnCall(i) {
  calls += 1;
  const r = hs.handle(JSON.stringify({ prefix: 'turn-count-', scope: 'agent-' + i }), '/turn', deps);
  if (r && typeof r.turns === 'number' && r.turns > turnsMax) turnsMax = r.turns;
}

function pretoolCall(i, n) {
  calls += 1;
  const r = hs.handle(JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'cat /proj/server.js' },
    session_id: 'agent-' + i,
    tool_use_id: 'inv-' + n,
  }), '/pretool?frame=1&frames=1', deps);
  if (JSON.stringify(r || null).includes('CORPS-BENCH')) delivered += 1;
}

// 🛑 ONE READING = THE MEDIAN OF FIVE EQUAL SUB-BATCHES, NEVER ONE TIMING, and
//    this is a FIX, not a refinement. The first version timed each level once:
//    a single collector pause landing inside one batch inflated the reading at
//    128 scopes by ~35 %, which sat in the HEAD of the ratio and pulled a
//    genuine 4x defect down to 2.85x — the gate certified a store that walks its
//    whole state on every write. A mean carries that pause into the result; a
//    median DISCARDS it, because a GC pause hits one sub-batch, never three.
// ⚠️ The collector is run BEFORE each sub-batch, outside the timed region: every
//    sub-batch therefore starts from the same state instead of inheriting the
//    garbage of the previous one. That is a fact obtained from the runtime, not
//    a delay waited out.
function mediane(appel, parLot) {
  const lots = [];
  for (let s = 0; s < SOUS_LOTS; s += 1) {
    global.gc();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < parLot; i += 1) appel(s * parLot + i);
    lots.push(Number(process.hrtime.bigint() - t0) / parLot);
  }
  lots.sort((a, b) => a - b);
  return lots[(SOUS_LOTS - 1) / 2];
}

// Warm-up on its own scopes, so the first LEVEL is measured on a hot runtime.
// Without it the head reading carries the JIT and the bench flatters itself.
for (let i = 0; i < WARMUP_TURN; i += 1) turnCall('warmup-' + (i % 8));
for (let i = 0; i < WARMUP_PRETOOL; i += 1) pretoolCall('warmup-' + (i % 8), i);

const readings = [];
let created = 0;
global.gc(); global.gc();
let heapAvant = process.memoryUsage().heapUsed;

for (const cible of LEVELS) {
  // POPULATE: one call per NEW scope, so the store really holds \`cible\` of them.
  while (created < cible) { turnCall(created); created += 1; }

  const turnNs = mediane((i) => turnCall(i % created), TURN_PAR_LOT);
  const pretoolNs = mediane((i) => pretoolCall(i % created, i), PRETOOL_PAR_LOT);

  global.gc(); global.gc();
  const heap = process.memoryUsage().heapUsed;
  readings.push({ scopes: created, turnNs, pretoolNs, retenu: heap - heapAvant });
  heapAvant = heap;
}

// ── THE REALITY TRACK: a REAL server, a REAL socket, real round trips ──
// Its job is NOT to time anything. It is to prove that what was benchmarked
// above is what a client actually gets served, on the same store, over the
// kernel. Readiness is the socket's own event; nothing waits on a delay.
const srv = hs.createServer({ store });
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const corps = JSON.stringify({
    tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' },
    session_id: 'agent-7', tool_use_id: 'http',
  });
  const une = () => new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool?frame=1&frames=1',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) } },
    (r) => { let t = ''; r.setEncoding('utf8'); r.on('data', (c) => { t += c; }); r.on('end', () => res(t)); });
    req.on('error', rej);
    req.end(corps);
  });
  let servis = 0;
  let livres = 0;
  for (let i = 0; i < HTTP_REQS; i += 1) {
    const t = await une();
    if (typeof t === 'string' && t.length > 0) servis += 1;
    if (t.includes('CORPS-BENCH')) livres += 1;
  }
  const durables = store.scopes().filter((k) => !k.startsWith('plan-')).length;
  console.log(JSON.stringify({ readings, calls, delivered, servis, livres, durables, taille: store.size(), puits }));
  srv.close();
  process.exit(0);
});
`);

/**
 * Runs the driver to completion. The child is killed in a `finally` on EVERY
 * path — a bench that leaves an orphan behind is a bench that poisons the next
 * run of the suite.
 */
function runDriver(args) {
  let child = null;
  const done = new Promise((resolve, reject) => {
    child = execFile(process.execPath, ['--expose-gc', DRIVER, ...args], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: DOCS,
        CTXROUTE_STATE_DIR: STATE,
        CTXROUTE_CONFIG_PATH: CONFIG,
      },
    }, (err, stdout, stderr) => {
      // 🛑 A DRIVER THAT DIES MUST SAY WHY, NOT TIME OUT. stderr is captured and
      //    reported: an unobservable failure costs one CI round trip PER
      //    HYPOTHESIS, and this repo has paid that twice already.
      if (err) { reject(new Error(`${err.message}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`)); return; }
      try { resolve(JSON.parse(String(stdout).trim().split('\n').pop())); } catch {
        reject(new Error(`the driver printed no verdict.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
      }
    });
  });
  return done.finally(() => { try { if (child) child.kill(); } catch { /* already gone: the desired end state */ } });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ═══════════════════════════════════════════════════════════════════════
// THE MARGIN — and it is written so the next reader can RE-DERIVE it.
// ═══════════════════════════════════════════════════════════════════════
// Between the HEAD (levels 128 and 256, mean 192 scopes) and the TAIL (512 and
// 1024, mean 768) the held state grows FOUR times. A per-request path that is
// O(1) in the number of scopes gives a ratio of ~1: flat. A path LINEAR in the
// held state gives ~4.
//
// 📐 MEASURED, 2026-08-21, ONE Windows machine — the only numbers that exist:
//    · SABOTAGED store (serialises the whole state on every write), at the OLD
//      range 64…512 with SINGLE timings per level: readings 16651 → 43303 →
//      63614 → 107371 ns, ratio **2.85x**. The shape predicts 4x; the gap was
//      the per-request constant plus ONE collector pause sitting in the head.
//    · HEALTHY store: PASSED under 3.0, exact ratio NOT CAPTURED — the cell
//      printed nothing on success. That single fact is why every cell now prints
//      its numbers before asserting.
// 🛑 THE MARGIN IS THEREFORE PROVISIONAL AT 3.0, AND IT IS NOT ALLOWED TO STAY
//    THAT WAY. Two changes were made instead of moving it — the range was
//    doubled (halving the weight of the constant) and each reading became a
//    MEDIAN of five sub-batches (a pause can no longer inflate a level) — so the
//    two ratios are expected to separate to roughly 1.0-1.3 (healthy) against
//    3.4-3.9 (sabotaged). ⚠️ THOSE TWO ARE EXPECTATIONS, NOT MEASUREMENTS: they
//    were computed from the readings above, not observed.
// 🔑 WHAT THE NEXT RUN MUST DO, and it is one edit: take the two ratios the two
//    cells now PRINT, write them here as measured facts, and set MARGE to their
//    GEOMETRIC MEAN — the point that is equally far from both in ratio terms,
//    which is the only sense in which a multiplicative threshold can be
//    "centred". Never pick it to make one cell pass.
// 🛑 AND NEVER TIGHTEN IT TO CHASE SENSITIVITY. A gate that reddens on a busy
//    runner is a gate people disarm, then delete — that has already happened in
//    this repo, four kilobytes wide. Sensitivity is bought by shrinking the
//    constant and the noise, never by moving the line.
// 📐 DERIVED FROM THE MEASURED PAIR, 2026-08-21 — no longer provisional, and the
//    two numbers below are printed by the cells themselves on every run, so the
//    next reader can re-derive this line instead of inheriting it.
//      HEALTHY   turnRatio = 0.89  (flat: the head still carries a little warm-up)
//      SABOTAGED turnRatio = 3.13  (a store that serialises the whole state per write)
//    √(0.89 × 3.13) = 1.67 — the geometric mean, the only sense in which a
//    MULTIPLICATIVE threshold sits equally far from both: healthy has 1.88x of
//    headroom below, sabotaged 1.87x above.
// 🔴 WHY IT MOVED DOWN FROM 3: at 3 the sabotaged store cleared the bar by 4 %,
//    and at the previous range it scored 2.85 and the gate CERTIFIED the defect.
//    Sensitivity was bought back by shrinking the constant (range doubled) and the
//    noise (median of five sub-batches) — never by moving this number to fit.
// ⚠️ ONE MACHINE, ONE OS. A ratio is portable in a way a millisecond is not, but
//    this pair was measured HERE. CI is the confrontation: if a runner prints a
//    healthy ratio near this bar, re-derive from the new pair and say so — do not
//    widen it to buy silence.
const MARGE = 1.67;

// ⚠️ THE MEMORY TRACK KEEPS ITS OWN MARGIN, AND THE SPLIT IS DELIBERATE. Bytes
//    retained after a collection are far noisier than a median of five timed
//    batches, and NOTHING pins this one: there is no sabotaged pair for memory,
//    so it has never been seen red. Sharing one constant would let a future
//    tightening of the COST margin (re-derived from two measurements) redden the
//    memory track on noise alone — a threshold moved by an argument that never
//    applied to it.
const MARGE_MEM = 3;

const ratio = (xs) => mean(xs.slice(-2)) / mean(xs.slice(0, 2));
const round = (x) => Math.round(x);

// ── ① THE MEASUREMENT ────────────────────────────────────────────────────
test('SCALE: the daemon\'s cost per request does not grow superlinearly with the number of agent scopes', async () => {
  const out = await runDriver([]);
  const scopes = out.readings.map((r) => r.scopes);
  const turn = out.readings.map((r) => r.turnNs);
  const pretool = out.readings.map((r) => r.pretoolNs);
  const perScope = out.readings.map((r, i) => r.retenu / (i === 0 ? r.scopes : r.scopes / 2));
  const rTurn = ratio(turn);
  const rGate = ratio(pretool);
  const rMem = ratio(perScope);
  const total = out.readings.reduce((a, r) => a + r.retenu, 0);

  // 🛑 PRINTED BEFORE THE ASSERTIONS, ON EVERY PATH. A cell that only speaks when
  //    it fails leaves its threshold unre-derivable, which is how a margin turns
  //    into folklore — and it is exactly what made the first sabotage run
  //    unexplainable. The numbers belong to this machine; the RATIOS are the
  //    verdict, and both are shown so the margin can be recomputed at will.
  console.log(`[scale-bench HEALTHY] ${JSON.stringify({
    levels: scopes,
    turnNs: turn.map(round),
    turnRatio: Number(rTurn.toFixed(2)),
    pretoolUs: pretool.map((p) => round(p / 1000)),
    pretoolRatio: Number(rGate.toFixed(2)),
    bytesPerScope: perScope.map(round),
    memRatio: Number(rMem.toFixed(2)),
    marge: MARGE,
    // The extrapolation an operator actually wants, and it is arithmetic, not a
    // promise: what the declared 4096-key ceiling would cost in RAM.
    mbAtCeiling: Math.round(((total / 1024) * 4096) / (1024 * 1024)),
  })}`);

  // 🛑 ANTI-VACUITY FIRST, AND IT IS NOT A FORMALITY. This repo has been bitten
  //    THREE times by a gate that was green because it analysed zero files. A
  //    bench that measured nothing would satisfy every ratio above — flat is
  //    exactly what "no work at all" looks like.
  assert.equal(out.readings.length, 4, `four levels must have been measured, got ${out.readings.length}`);
  assert.deepEqual(scopes, [128, 256, 512, 1024],
    `the scope levels really reached must be 128/256/512/1024, got ${scopes.join(',')}`);
  assert.ok(out.durables >= 1024,
    `the store holds only ${out.durables} durable scopes — the load this bench claims to apply does not exist`);
  assert.ok(out.calls >= 4000, `only ${out.calls} requests were served; this bench is not exercising anything`);
  assert.ok(out.delivered >= 1,
    'not one request produced a document: a MUTE engine measures the cost of doing nothing, and it is flat by definition');
  assert.equal(out.servis, 100, `the real socket served ${out.servis}/100 round trips — the benched handler is not the served one`);
  assert.ok(out.livres >= 1, 'the real socket delivered nothing: what was benchmarked is not what a client gets');

  const shown = out.readings.map((r) => `${r.scopes}:${round(r.turnNs)}ns/${round(r.pretoolNs / 1000)}us`).join(' → ');

  // THE VERDICT — ratios only. Never a millisecond, never a byte total.
  assert.ok(rTurn < MARGE,
    `the STORE path degrades with the fleet: 4x the scopes cost ${rTurn.toFixed(2)}x per request (${shown}). `
    + 'A cost that grows with how many agents exist, rather than with the work asked, is a DATED outage at this sizing.');
  assert.ok(rGate < MARGE,
    `the GATE path degrades with the fleet: 4x the scopes cost ${rGate.toFixed(2)}x per request (${shown}).`);

  // ── MEMORY, BECAUSE THE MEMORY WALL ARRIVES BEFORE THE CPU ONE ──
  // Marginal bytes RETAINED per scope added at each level. Linear memory (a
  // constant per scope) is the expected and acceptable shape; what this rejects
  // is a per-scope cost that itself grows with the fleet.
  assert.ok(total > 32 * 1024,
    `${round(total / 1024)} KB retained for 1024 scopes — that is too little to be real state, so this reading proves nothing`);
  assert.ok(rMem < MARGE_MEM,
    `memory per scope GROWS with the number of scopes (${perScope.map(round).join(' → ')} B, ratio ${rMem.toFixed(2)}x) — `
    + 'that is a quadratic footprint, and it caps the fleet long before the CPU does');
});

// ── ② SEEN RED — the criterion must REJECT a cost that grows with the fleet ──
// 🛑 A gate never seen failing is a gate ASSUMED to work. The sabotage is not a
//    strawman: it serialises the whole state on every write, which is exactly
//    what this store did until 2026-08-21 and what its own header still lists as
//    an open item on the DISK side. If the criterion cannot see that, it is
//    proving nothing about the healthy daemon either.
// 🔴 AND IT ALREADY CERTIFIED ONCE — 2.85x against a margin of 3.0, on the first
//    run. That miss is the whole reason the range doubled and the readings
//    became medians. Read the MARGE block above before touching either.
test('SEEN RED: the same criterion rejects a store that walks the whole state on every write', async () => {
  const out = await runDriver(['--sabotage']);
  const turn = out.readings.map((r) => r.turnNs);
  const rTurn = ratio(turn);

  // Printed BEFORE the assertions, like cell ①: this pair of ratios is the ONLY
  // thing from which the margin can be re-derived.
  console.log(`[scale-bench SABOTAGED] ${JSON.stringify({
    levels: out.readings.map((r) => r.scopes),
    turnNs: turn.map(round),
    turnRatio: Number(rTurn.toFixed(2)),
    marge: MARGE,
  })}`);

  assert.equal(out.readings.length, 4, 'the sabotaged driver must have produced four readings too');
  assert.ok(out.puits > 0, 'the sabotage did no work at all — this cell would then prove nothing');
  assert.ok(out.calls >= 4000, `only ${out.calls} requests were served by the sabotaged driver`);

  // ⚠️ EXACTLY the assertion of cell ①, inverted, and sharing the same MARGE
  //    literally: weakening the margin up there turns THIS cell red in the same
  //    move. That is what makes the pair a proof instead of two opinions.
  assert.ok(!(rTurn < MARGE),
    `the criterion FAILED TO SEE a cost proportional to the held state (ratio ${rTurn.toFixed(2)}x over 4x the scopes, `
    + `readings ${turn.map(round).join(' → ')} ns) — it is therefore certifying, not measuring`);
});
