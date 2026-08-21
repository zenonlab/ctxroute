// ═══════════════════════════════════════════════════════════════════════
// SCALE BENCH — how the daemon's cost GROWS. TWO AXES, and they are NOT the
// same question. Read this block before quoting any number below.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE HONEST ANSWER TO "DOES THIS BENCH MEASURE THE TARGET SIZING?", WRITTEN
//    2026-08-21 BEFORE ANYTHING WAS ADDED. Until that date this file measured
//    ONE axis: the number of agent SCOPES the store HOLDS (cells ① and ②). The
//    work item asks about **hundreds of PARALLEL agents**, which is a different
//    quantity: **a map with 1024 entries is not 1024 concurrent clients.** A
//    daemon can be perfectly flat in the size of its map and still degrade the
//    moment 500 clients are connected at once — a per-request walk of the
//    connection set, a listener registered per socket, a buffer kept per peer.
//    Cells ① and ② could not have seen any of that: they never open a second
//    socket, and the ONE socket they do open is opened after the measurement.
// ⇒ **AXIS A — HELD STATE** (cells ① and ②): scopes 128 → 1024, cost timed on
//    `handle()`. It answers "does holding more agents' memory cost more per
//    request?". It is the answer to a REAL question, and it is NOT work item I.
// ⇒ **AXIS B — CONNECTED AT ONCE** (cells ③ and ④, added 2026-08-21): 64 → 1024
//    ESTABLISHED client connections held by the real server, **with the held
//    state FROZEN** (the same 128 scopes at every level). One variable moves,
//    and it is the one the work item names. It answers "does serving ONE agent
//    cost more because N others are connected?".
// 🛑 NEITHER AXIS SUBSUMES THE OTHER, and quoting one for the other is exactly
//    the fault this file already carries a note about. Say which axis a number
//    comes from, every time.
//
// ⚠️ WHAT LOAD THIS PUTS ON THE MACHINE, AND WHY IT IS BOUNDED — this runs on the
//    operator's workstation, where saturating the CPU has already broken other
//    guardrails (502 zombie processes measured). The bench spawns **ONE node
//    process at a time and never more**: the four cells are `test.sequential`,
//    so they cannot overlap even though this file's lane runs its tests
//    concurrently by default. Axis B's 1024 clients are **SOCKETS, not
//    processes** — both ends live inside that single driver, so the fan-out is
//    kernel objects (cheap, idle) instead of 1024 node startups (~330 ms and a
//    core each, which is what would actually saturate the machine). Peak cost:
//    2 node processes, ~2048 loopback file descriptors, tens of MB.
// ⚠️ AND THE CPU TIME IS BOUNDED **BY CONSTRUCTION**, not by a call count that a
//    future edit could inflate: each timed sub-batch is sized in TIME, so a level
//    costs `SOUS_LOTS × PLANCHER_MS` whatever the per-call price turns out to be.
//    Making the work heavier makes the batches SHORTER, never the run longer.
// 🔴 THE CONNECTIONS ARE OPENED IN WAVES, AND THAT IS A KERNEL FACT, NOT A STYLE
//    CHOICE — measured on this Windows machine, at the loop that does it: a single
//    burst overruns the LISTEN BACKLOG and the kernel REFUSES what it cannot queue
//    (64 → 0 refused, 128 → 0, 256 → 152, 512 → all 512). A bench that dies there
//    measures the accept queue and gets read as if it had measured our cost.
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
//      timing. Axis B below holds 512 REAL connections, which is the part of
//      "parallel agents" a single machine can honestly exercise; the rest —
//      distinct processes, distinct corpora, distinct transcripts — is proven
//      only at 16 (`state-daemon.test.js`) and NOWHERE at 512;
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

// ═══════════════════════════════════════════════════════════════════════
// AXIS B — THE DRIVER FOR "HOW MANY AGENTS ARE CONNECTED AT ONCE".
// ═══════════════════════════════════════════════════════════════════════
// 🛑 ONE VARIABLE MOVES, AND THAT IS THE WHOLE DIFFERENCE WITH AXIS A. The scope
//    pool is FIXED at `SCOPES_FIXES` for every level, the route is the same, the
//    payload is the same, the number of timed calls is the same. The ONLY thing
//    that changes between levels is how many client connections the server is
//    holding. Axis A moved the held state AND nothing else; conflating the two
//    would produce a number that answers neither question.
// 🛑 THE CLIENTS ARE SOCKETS, NOT PROCESSES, AND THAT IS DELIBERATE. 512 node
//    processes would cost ~330 ms and a core each — they would saturate the
//    operator's workstation, which has already broken guardrails here, and the
//    resulting timings would measure the SCHEDULER, not the daemon. An
//    ESTABLISHED, idle TCP connection is exactly what a parallel agent presents
//    to this daemon between its requests, and it costs the kernel a few
//    kilobytes. What is NOT exercised by this substitution is stated in the
//    header: distinct processes, distinct corpora, distinct transcripts.
// 🛑 READINESS IS AN EVENT, NEVER A DELAY. A level is reached when the SERVER's
//    own `connection` handler has seen the Nth socket — the kernel telling us it
//    accepted, not us guessing that it probably did by now. There is no sleep,
//    no poll and no retry anywhere in this driver, and if one ever appears here
//    it has stopped asking the kernel and started hoping.
// ⚠️ THE SERVER-SIDE REGISTRY (`vivantes`) IS ALSO WHAT THE SABOTAGE WALKS. It
//    stands in for the per-connection bookkeeping any real server keeps, and
//    `--sabotage` makes EVERY state write iterate it: cost proportional to the
//    FLEET rather than to the work asked. That is the exact defect axis B exists
//    to reject — one busy agent paying for every idle one — and cell ④ requires
//    the criterion to see it.
// ⚠️ MEMORY IS COUNTED FOR BOTH ENDPOINTS: the client sockets live in this same
//    process, so "bytes per connection" OVERSTATES what a real daemon holds.
//    That is the conservative direction for a ceiling, and it is the reason no
//    absolute byte figure from here may ever be quoted as the daemon's cost.
// ═══════════════════════════════════════════════════════════════════════

// 🛑 DECLARED ONCE, HERE, AND INTERPOLATED INTO THE DRIVER. Two copies of the
//    level list would be two truths, and the bar below is COMPUTED from this
//    array — change the levels and the bar follows, which is what stops it from
//    ever becoming a number somebody typed.
// 🔴 FIVE LEVELS, TOP AT 1024, SINCE 2026-08-21 — AND THIS IS "SHRINK THE
//    CONSTANT", NOT "MOVE THE BAR". At 64…512 the SABOTAGED pair scored 2.95 and
//    2.55 against a bar of 2.00: 27 % of clearance on the thin run, and this file
//    already carries the receipt for what a 4 % clearance costs (axis A CERTIFIED
//    a defect). The measured cost fits `C + a·N`; solving it on those two runs
//    gives a fixed cost C worth **52 to 90 connections' worth of walking**, and a
//    fixed cost is exactly what compresses a ratio towards 1. Widening the range
//    DILUTES it — the bar rises with the levels because it is computed from them,
//    while the sabotaged ratio rises FASTER. The full arithmetic is in the
//    `BAR_CONC` block; the bar itself was never touched.
const CONC_LEVELS = [64, 128, 256, 512, 1024];
const CONC_SCOPES = 128;      // FROZEN across levels: axis A must not leak in
const CONC_WARMUP = 2000;
const CONC_HTTP = 32;         // real round trips, ALL IN FLIGHT AT ONCE

// ═══════════════════════════════════════════════════════════════════════
// THE SUB-BATCH IS SIZED IN **TIME**, NOT IN CALLS — and it is a FIX.
// ═══════════════════════════════════════════════════════════════════════
// 🔴 MEASURED 2026-08-21: with 5 fixed sub-batches of 160 calls, the noise figure
//    read **1.71 on one run and 3.35 on the next**, same code, same machine. That
//    is not a machine changing character between two runs — it is a READING that
//    a single scheduler event can dominate. A batch of 160 `/turn` calls lasts
//    well under a millisecond, while the Windows scheduler quantum is ~15.6 ms:
//    **one preemption did not perturb such a batch, it WAS the batch.** The cell
//    was therefore flipping between "decides" and "cannot decide" on what else the
//    workstation happened to be doing, and a cell that flips is a cell people stop
//    reading and then disarm.
// ✅ THE FIX MAKES THE ARTEFACT IMPOSSIBLE BY CONSTRUCTION, RATHER THAN RARER.
//    ① Every timed sub-batch is sized so it lasts at least `PLANCHER_MS`, which is
//       comfortably longer than one quantum ⇒ a single preemption is a BOUNDED
//       fraction of the reading instead of all of it.
//    ② The size is CALIBRATED AT RUNTIME, never typed: a pilot measures what one
//       call actually costs HERE — on this machine, at this level, with or without
//       the sabotage — and the batch is derived from it. Nothing about the cost of
//       `handle()` is assumed, which is the whole doctrine: ask what KNOWS.
//    ③ The pilot takes the **MINIMUM** of three passes. A preemption can only ADD
//       time, never remove it, so the minimum is the least contaminated estimate.
//       A mean would let the very noise we are sizing against shrink the batch.
// 🔑 AND IT BOUNDS THE BENCH'S WALL COST BY DESIGN. A batch sized in CALLS gets
//    ~20x more expensive at 1024 connections under sabotage; a batch sized in TIME
//    costs `SOUS_LOTS × PLANCHER_MS` per level whatever the per-call price. The
//    whole axis is therefore ~1 s per driver, and it cannot drift into the 30 s
//    lane timeout when someone makes a level heavier.
// ⚠️ `LOT_MAX` is a WALL, never a working value: it exists only so a pathologically
//    cheap call cannot ask for an unbounded batch. If it ever binds, the sub-batch
//    is shorter than the floor and cell ③ SAYS SO by name instead of quietly
//    measuring scheduling again.
const CONC_SOUS_LOTS = 9;
const CONC_PLANCHER_MS = 20;  // > one Windows scheduler quantum (~15.6 ms)
const CONC_LOT_PILOTE = 500;
const CONC_LOT_MIN = 200;
const CONC_LOT_MAX = 100000;

const CONC_DRIVER = path.join(TMP, 'conc-driver.js');
fs.writeFileSync(CONC_DRIVER, `
'use strict';
const net = require('net');
const http = require('http');
const hs = require(${src('hooks', 'http-server.js')});
const { createMemoryStore } = require(${src('memory-store.js')});
const { run } = require(${src('pretool-core.js')});
const { output } = require(${src('hooks', 'doc-inject.js')});
const { parseFrameArgs } = require(${src('lib-pure.js')});

const LEVELS = ${JSON.stringify(CONC_LEVELS)};
const SCOPES_FIXES = ${CONC_SCOPES};
const SOUS_LOTS = ${CONC_SOUS_LOTS};
const PLANCHER_NS = ${CONC_PLANCHER_MS} * 1e6;
const LOT_PILOTE = ${CONC_LOT_PILOTE};
const LOT_MIN = ${CONC_LOT_MIN};
const LOT_MAX = ${CONC_LOT_MAX};
const WARMUP = ${CONC_WARMUP};
const HTTP_REQS = ${CONC_HTTP};

// 🛑 SOUS_LOTS MUST BE 4k+1, AND THIS REFUSES LOUDLY RATHER THAN DEGRADE. The
//    median sits at (n-1)/2 and the quartiles at (n-1)/4; any other count makes
//    those indices FRACTIONAL, \`t[2.5]\` is \`undefined\`, and every ratio silently
//    becomes NaN — which compares false against the bar, i.e. a gate that reddens
//    for a reason nobody can read. 5, 9, 13, 17.
if ((SOUS_LOTS - 1) % 4 !== 0) {
  throw new Error('SOUS_LOTS must be 4k+1 (5, 9, 13, ...); got ' + SOUS_LOTS);
}

const sabotage = process.argv[2] === '--sabotage';
const vrai = createMemoryStore({ snapshotPath: null });

// The connections the SERVER has accepted and not yet lost. Populated by the
// server's own event, so its size is a FACT from the kernel, never a count we
// incremented hopefully on the client side.
const vivantes = new Set();
let puits = 0;

// 🛑 THE SABOTAGE: every state write walks the live connection set. O(open
//    clients) per request — a daemon where each agent pays for all the others.
//    It is not a strawman: keeping a peer registry and touching it per request
//    is what most servers do, and doing it in the REQUEST path instead of at
//    accept time is the entire defect.
const store = !sabotage ? vrai : {
  loadState: (p, s) => vrai.loadState(p, s),
  saveState: (p, s, v) => {
    puits += JSON.stringify([...vivantes].map((k) => k.remotePort)).length;
    return vrai.saveState(p, s, v);
  },
  purge: (k) => vrai.purge(k),
  size: () => vrai.size(),
  scopes: () => vrai.scopes(),
};

const deps = { runFn: run, outputFn: output, parseFrames: parseFrameArgs, store, onAddressInUse: null };

let calls = 0;
function turnCall(i) {
  calls += 1;
  // ⚠️ The scope pool is FIXED. Using \`i\` directly would create one scope per
  //    call and silently turn this back into axis A.
  hs.handle(JSON.stringify({ prefix: 'turn-count-', scope: 'agent-' + (i % SCOPES_FIXES) }), '/turn', deps);
}

// HOW BIG ONE SUB-BATCH MUST BE, ASKED OF THE RUNTIME INSTEAD OF TYPED.
// 🛑 THE MINIMUM OF THREE PILOT PASSES, NEVER THE MEAN. A preemption can only ADD
//    time, never remove it, so the minimum is the least contaminated estimate of
//    what one call really costs. A mean would let the very noise this sizing
//    exists to defeat shrink the batch — the reading would then be short again,
//    and short is exactly how the artefact was born.
// ⚠️ It runs at EVERY level and in EVERY mode: the sabotage makes a call ~20x
//    dearer at 1024 connections, and a batch calibrated once at level 64 would
//    leave the cheap end long and the dear end short. Equal PROTECTION per level
//    is the point, not an equal number of calls.
function calibrer(appel) {
  let parAppel = Infinity;
  for (let k = 0; k < 3; k += 1) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < LOT_PILOTE; i += 1) appel(i);
    const dt = Number(process.hrtime.bigint() - t0) / LOT_PILOTE;
    if (dt < parAppel) parAppel = dt;
  }
  const vise = Math.ceil(PLANCHER_NS / Math.max(parAppel, 1));
  return Math.min(LOT_MAX, Math.max(LOT_MIN, vise));
}

// ONE READING = THE MEDIAN OF NINE EQUAL SUB-BATCHES, each longer than a
// scheduler quantum by construction. A collector pause or a preemption lands in
// one sub-batch, never in five, so the median discards what a mean would carry.
// 🔑 TWO NOISE FIGURES, AND ONLY ONE OF THEM GATES — read this before touching
//    either, because the first version got it wrong and the cell flipped between
//    runs because of it.
//    · \`nu\` = the INTER-QUARTILE ratio (t[6]/t[2]): the spread of the CENTRAL
//      half. It is the noise of the MEDIAN, i.e. of the statistic actually used,
//      and it is what cell ③ gates on.
//    · \`spread\` = max/min over all nine. It is the noise of the OUTLIERS — the
//      very samples the median exists to throw away. Gating on it was a design
//      error: it asked the reading to be free of exactly what it is built to
//      survive. It is still REPORTED, because the gap between the two is what
//      tells an operator "the machine had a hiccup" apart from "the machine is
//      genuinely loaded".
function lots(appel, parLot) {
  const t = [];
  for (let s = 0; s < SOUS_LOTS; s += 1) {
    global.gc();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < parLot; i += 1) appel(s * parLot + i);
    t.push(Number(process.hrtime.bigint() - t0) / parLot);
  }
  t.sort((a, b) => a - b);
  const q = (SOUS_LOTS - 1) / 4;
  return {
    med: t[(SOUS_LOTS - 1) / 2],
    nu: t[SOUS_LOTS - 1 - q] / t[q],
    spread: t[SOUS_LOTS - 1] / t[0],
    lotNs: t[(SOUS_LOTS - 1) / 2] * parLot,
  };
}

const srv = hs.createServer({ store });

// ⚠️ ONE PENDING WAITER AT MOST, and the levels are climbed strictly in order,
//    so there is never a second. The handler RESOLVES; nothing polls a counter.
let attente = null;
srv.on('connection', (s) => {
  vivantes.add(s);
  s.on('close', () => vivantes.delete(s));
  if (attente && vivantes.size >= attente.cible) { const f = attente.resolve; attente = null; f(); }
});
function attendre(cible) {
  if (vivantes.size >= cible) return Promise.resolve();
  return new Promise((r) => { attente = { cible: cible, resolve: r }; });
}

// Wave size: how many connections we open before letting the server drain its
// accept queue. 64 — the largest burst this kernel accepted with ZERO refusals.
const VAGUE = 64;
const clients = [];
function ouvrir(port) {
  return new Promise((res, rej) => {
    const s = net.connect(port, '127.0.0.1');
    // The socket's OWN event, exactly like the server's \`listening\`. An idle
    // established connection is bounded only by node's \`headersTimeout\` — the
    // runtime's number, never restated here, and never reached in a run of
    // seconds.
    s.on('connect', () => res(s));
    s.on('error', rej);
  });
}

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;

  // Warm-up on the SAME fixed pool, so the first level is measured on a hot
  // runtime and on a store that already holds its scopes. Without it the head
  // reading carries the JIT and the bench flatters itself.
  for (let i = 0; i < WARMUP; i += 1) turnCall(i);

  const readings = [];
  let ouvertes = 0;
  global.gc(); global.gc();
  let heapAvant = process.memoryUsage().heapUsed;

  for (const cible of LEVELS) {
    // 🔴 OPEN IN WAVES, AND THE WAVE IS DRAINED BY THE SERVER ITSELF — MEASURED
    //    2026-08-21 ON THIS KERNEL. Opening a level in ONE burst overruns the
    //    ACCEPT QUEUE, and Windows REFUSES what it cannot queue instead of making
    //    the client wait: 64 → 0 refusals, 128 → 0, 256 → 152 refused, 512 →
    //    **512 refused, every single one**. That is a fact about the LISTEN BACKLOG,
    //    never about the daemon — and a bench that dies there measures the kernel's
    //    queue, then gets read as if it had measured our cost.
    // 🛑 THE FIX IS NOT A BIGGER BACKLOG AND IT IS NOT A TIMER. A backlog is one
    //    kernel's number and the three we ship on disagree; a sleep would be a delay
    //    on a LOCAL fact, which the budget refuses outright. We ask the authority
    //    that KNOWS a connection was accepted — the server's own \`connection\` event,
    //    already counted in \`vivantes\` — and only then open the next wave. The pool
    //    reached is IDENTICAL, so the levels and the bar are untouched.
    // ⚠️ VAGUE is bounded well under the smallest measured refusal (152 at 256), so
    //    the margin is a MEASUREMENT, not a hope.
    while (ouvertes < cible) {
      const jusqua = Math.min(ouvertes + VAGUE, cible);
      const neuves = [];
      while (ouvertes < jusqua) { neuves.push(ouvrir(port)); ouvertes += 1; }
      const faites = await Promise.all(neuves);
      for (const s of faites) clients.push(s);
      // The kernel accepted them: the SERVER said so.
      await attendre(jusqua);
    }

    // 🛑 CALIBRATE FIRST, AT THIS LEVEL, IN THIS MODE. The pilot is UNTIMED for
    //    the verdict — it only decides how long a timed sub-batch must be.
    const lot = calibrer(turnCall);
    const r = lots(turnCall, lot);
    global.gc(); global.gc();
    const heap = process.memoryUsage().heapUsed;
    readings.push({
      conns: cible, vues: vivantes.size, turnNs: r.med,
      nu: r.nu, spread: r.spread, lot: lot, lotNs: r.lotNs,
      retenu: heap - heapAvant,
    });
    heapAvant = heap;
  }

  // 🛑 READ **BEFORE** THE REALITY TRACK, AND THAT ORDER IS THE ASSERTION. Cell ③
  //    demands this equals the FROZEN pool exactly, which is what proves axis A
  //    did not leak in. The round trips below are \`/pretool\` calls: they create
  //    their own \`doc-seen-\` scope, so reading this afterwards would report
  //    129 and turn a load-bearing equality into a number nobody could explain.
  const portees = store.scopes().filter((k) => !k.startsWith('plan-')).length;
  // 🔴 READ HERE FOR THE SAME REASON, AND IT WAS MEASURED THE HARD WAY: the
  //    reality track below opens its OWN sockets, so reading this afterwards
  //    reported **544** against a 512 level — the anchor's 32 round trips counted
  //    as level connections, and a load-bearing equality became an accusation
  //    ("sockets died mid-run") about something that never happened. The
  //    question this answers is "did the 512 LEVEL sockets survive", never
  //    "does any other socket exist".
  const tenues = vivantes.size;

  // ── THE REALITY TRACK: real round trips, ALL IN FLIGHT, on a loaded server ──
  // Its job is NOT to time anything: a single point has nothing to be compared
  // with, and the socket constant would compress any ratio taken here into
  // silence. It proves that what was benchmarked above is what a client gets
  // served, WHILE the maximum number of connections is held. Its per-request
  // figure is PRINTED for an operator and asserted on by NOTHING.
  const corps = JSON.stringify({
    tool_name: 'Bash', tool_input: { command: 'cat /proj/server.js' },
    session_id: 'agent-7', tool_use_id: 'conc',
  });
  const une = () => new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/pretool?frame=1&frames=1',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) } },
    (r) => { let t = ''; r.setEncoding('utf8'); r.on('data', (c) => { t += c; }); r.on('end', () => res(t)); });
    req.on('error', rej);
    req.end(corps);
  });
  const t0 = process.hrtime.bigint();
  const attendus = [];
  for (let i = 0; i < HTTP_REQS; i += 1) attendus.push(une());
  const reponses = await Promise.all(attendus);
  const volNs = Number(process.hrtime.bigint() - t0) / HTTP_REQS;

  let servis = 0;
  let livres = 0;
  for (const t of reponses) {
    if (typeof t === 'string' && t.length > 0) servis += 1;
    if (typeof t === 'string' && t.includes('CORPS-BENCH')) livres += 1;
  }

  console.log(JSON.stringify({
    readings, calls, servis, livres, volNs, puits, portees,
    tenues,
  }));
  for (const c of clients) c.destroy();
  srv.close();
  process.exit(0);
});
`);

/**
 * Runs a driver to completion. The child is killed in a `finally` on EVERY
 * path — a bench that leaves an orphan behind is a bench that poisons the next
 * run of the suite.
 * @param {string} file the driver to execute
 * @param {string[]} args its arguments
 */
function runDriver(file, args) {
  let child = null;
  const done = new Promise((resolve, reject) => {
    child = execFile(process.execPath, ['--expose-gc', file, ...args], {
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

// ═══════════════════════════════════════════════════════════════════════
// AXIS B's BAR — COMPUTED FROM THE LEVELS, NOT TYPED, AND NOT MEASURED.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 IT IS DERIVED FROM TWO MODELS AND ONE MEASUREMENT OF NOISE, in that order,
//    and the whole arithmetic is here so the next reader can refute it instead
//    of inheriting it.
//
// 📐 THE LOAD FACTOR K. Head = the first two levels, tail = the last two. With
//    64/128/256/512/1024 that is mean(512, 1024) / mean(64, 128) = 768 / 96 =
//    **8**. The number of clients connected at once grows EIGHTFOLD between head
//    and tail. (The middle level is climbed and measured like the others; it just
//    does not enter the ratio, which compares the two ENDS.)
// 📐 MODEL ① — O(1) IN THE FLEET, which is what this architecture claims: the
//    kernel hands one connection at a time to one single-threaded loop, and no
//    request path iterates the connection set. Predicted ratio: **exactly 1**.
// 📐 MODEL ② — LINEAR IN THE FLEET, i.e. every request pays for every connected
//    peer. Predicted ratio: **exactly the load factor, K**.
// 📐 THE BAR = √(1 × K) = √8 = **2.83**, the geometric mean of the two models —
//    the only point equally distant from both when the quantity is a RATIO
//    (2.83x of headroom below for a flat daemon, 2.83x above for a linear one).
//    🛑 IT IS `Math.sqrt(...)` OF THE LEVELS AND NEVER A LITERAL: move a level
//    and the bar moves with it, which makes "a round number chosen because it
//    passes" impossible by construction rather than forbidden by a comment.
//
// 📐 MEASURED, 2026-08-21, ONE Windows workstation, DELIBERATELY BUSY (mutation
//    runs and suites all evening) — at the FIRST range, 64…512, i.e. K = 4 and a
//    bar of 2.00. These are the numbers that made the range move:
//      run │ HEALTHY turnRatio │ jitter │ SABOTAGED turnRatio
//       1  │       0.81        │  1.71  │        2.95
//       2  │       1.29        │  3.35  │        2.55
//    (Axis A on the same runs, for comparison: healthy 0.93 / 0.83, sabotaged
//    3.00 / 3.18 against its bar of 1.67.) Anti-vacuity was green throughout, and
//    cell ④ REDDENED as it must — the mechanism works. Two facts came out of it:
// 🔴 ① THE SABOTAGED SIDE WAS TOO THIN: 2.55 against 2.00 is **27 % of
//    clearance**. Axis A exists at 1.67 precisely because a 4 % clearance once let
//    this very file CERTIFY a defect, so 27 % on a bench that runs on a shared
//    workstation is not a margin, it is a countdown.
//    📐 WHY, ARITHMETICALLY — and this is what says WHAT to change. Fit the
//    measured cost to `C + a·N` (C = the per-call work that does NOT depend on the
//    fleet, a = the cost of one connection in the walk). Head N = 96, tail N = 384:
//      · run 1, ratio 2.95 ⇒ (C + 384a) = 2.95(C + 96a) ⇒ C = **51.7a**
//      · run 2, ratio 2.55 ⇒ (C + 384a) = 2.55(C + 96a) ⇒ C = **89.8a**
//    So the fixed cost is worth 52 to 90 connections' worth of walking, and it is
//    what drags a shape that should read 4 down to 2.55. **A fixed cost is diluted
//    by a LARGER N, never by a different threshold.**
//    📐 WHAT THE SAME FIT PREDICTS AT THE NEW RANGE (head 96, tail 768, bar 2.83):
//      · C = 51.7a ⇒ ratio (768 + 51.7)/(96 + 51.7) = **5.55**, i.e. 96 % of clearance
//      · C = 89.8a ⇒ ratio (768 + 89.8)/(96 + 89.8) = **4.62**, i.e. 63 % of clearance
//    ⚠️ THOSE TWO ARE A PREDICTION FROM A TWO-POINT FIT, NOT A MEASUREMENT. They
//    are written so the next run can REFUTE them; nothing here may be quoted as an
//    observed number until a run prints it.
//    🛑 AND NOTE WHAT WAS **NOT** DONE: the bar was not lowered, and the sabotage
//    was not made louder. The range was widened, exactly as axis A bought its
//    sensitivity once before. Making the defect heavier would have tuned the
//    STRAWMAN until it cleared — a gate that only sees defects it was shaped for.
// 🔴 ② THE NOISE REFUSAL WAS FIRING ON ITS OWN ARTEFACT: 1.71 then 3.35 on the
//    same machine and the same code. See the sub-batch block above — the reading
//    was shorter than a scheduler quantum, so one preemption WAS the reading. It
//    is now sized in TIME, nine sub-batches deep, and `nu` is the INTER-QUARTILE
//    ratio instead of max/min. 🛑 The bar did not move for this either.
//
// 🛑 THE NOISE IS NEVER ALLOWED TO WIDEN THE BAR. Cell ③ REQUIRES `nu < BAR`: if
//    the machine's own jitter could cross the bar on its own, the run cannot
//    decide and it says so, LOUDLY and BY NAME. A saturated runner therefore
//    produces a NAMED REFUSAL, never a pass — the opposite of widening a
//    threshold to buy silence.
// ⚠️ WHAT THAT REFUSAL NOW MEANS, STATED PRECISELY SO IT IS NOT MISREAD. After the
//    two fixes it should no longer name "a machine with something else running" —
//    a preemption is bounded by the batch length and an outlier is discarded by
//    the quartile. It names a machine so saturated that even the CENTRAL half of
//    nine long batches disagrees by more than the bar. **That expectation is a
//    DESIGN INTENT, not a measurement**: the honest statement today is that the
//    old design could only decide on an idle machine, and the new one is built so
//    it can decide on a working one. The next run either confirms it or does not.
// 🔑 HOW TO READ THE NUMBER THE RUN PRINTS: **~1.0 is healthy** (flat: connected
//    agents cost the daemon nothing per request) · **≥ 8 is linear in the
//    fleet** · anything **≥ 2.83 reddens**, and it means one agent's request has
//    started paying for the agents that merely EXIST alongside it — the defect
//    that closes a contract at the target sizing rather than slowing it down.
// 🛑 WHEN THE NEXT PAIR ARRIVES: write it in, dated, and if the two ratios do not
//    straddle the bar WITH ROOM, re-derive by shrinking the constant or the noise
//    again. Never widen, never lower, never tune the sabotage.
const BAR_CONC = Math.sqrt(mean(CONC_LEVELS.slice(-2)) / mean(CONC_LEVELS.slice(0, 2)));

// ── ① THE MEASUREMENT ────────────────────────────────────────────────────
// 🛑 `test.sequential` ON ALL FOUR CELLS, AND IT IS LOAD-BEARING, NOT TIDINESS.
//    This file lives in the `integration` project, where `sequence.concurrent`
//    is TRUE — so by default these cells would run AT THE SAME TIME, each
//    spawning a driver that times itself while the others compete for the same
//    cores. That does not merely add noise: it makes the head of one cell
//    contend with the tail of another, i.e. it corrupts the very RATIO this file
//    exists to produce, and it multiplies the load on the operator's
//    workstation by four. ⚠️ Vitest still runs FILES in parallel — what remains
//    of that shared-machine effect is exactly what `nu` measures below.
test.sequential('SCALE-A (held state): the daemon\'s cost per request does not grow superlinearly with the number of agent scopes', async () => {
  const out = await runDriver(DRIVER, []);
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
test.sequential('SEEN RED (axis A): the same criterion rejects a store that walks the whole state on every write', async () => {
  const out = await runDriver(DRIVER, ['--sabotage']);
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

// ── ③ AXIS B: THE MEASUREMENT AT THE SIZING THE WORK ITEM NAMES ───────────
// 🔑 THIS IS THE CELL WORK ITEM I ASKS FOR. Cells ① and ② move the number of
//    agent scopes the store HOLDS; this one moves the number of agents CONNECTED
//    AT ONCE and freezes everything else. A daemon flat on axis A can still
//    collapse here, and nothing in this repository looked at it before.
test.sequential('SCALE-B (parallel agents): the daemon\'s cost per request does not grow with the number of clients CONNECTED AT ONCE', async () => {
  const out = await runDriver(CONC_DRIVER, []);
  const conns = out.readings.map((r) => r.conns);
  const turn = out.readings.map((r) => r.turnNs);
  // Marginal bytes RETAINED per connection ADDED at each level. Linear memory (a
  // constant per client) is the expected and acceptable shape; what this rejects
  // is a per-client cost that itself grows with the fleet.
  const perConn = out.readings.map((r, i) => r.retenu / (i === 0 ? r.conns : r.conns / 2));
  const rTurn = ratio(turn);
  const rMem = ratio(perConn);
  // 🛑 THE WORST jitter of the run, not the average one. A bar is crossed by the
  //    worst level, never by the mean of the levels.
  const nu = Math.max(...out.readings.map((r) => r.nu));
  const spread = Math.max(...out.readings.map((r) => r.spread));
  const lotMs = Math.min(...out.readings.map((r) => r.lotNs / 1e6));
  const total = out.readings.reduce((a, r) => a + r.retenu, 0);

  // 🛑 PRINTED BEFORE THE ASSERTIONS, ON EVERY PATH — success included. The bar
  //    below has no measured pair behind it yet; the ONLY way it ever gets one
  //    is if every run leaves its numbers where the next reader can find them.
  console.log(`[scale-bench B HEALTHY] ${JSON.stringify({
    connections: conns,
    turnNs: turn.map(round),
    turnRatio: Number(rTurn.toFixed(2)),
    // `jitter` is what GATES (inter-quartile: the noise of the median itself).
    // `spread` is max/min over all nine and gates NOTHING — the gap between the
    // two is what separates "the machine hiccuped once" from "the machine is
    // loaded", and a reader who only sees one of them cannot tell them apart.
    jitter: Number(nu.toFixed(2)),
    spread: Number(spread.toFixed(2)),
    // The calibration, exposed: how many calls one timed sub-batch ended up
    // holding, and how long the shortest of them lasted. A batch that has drifted
    // under the floor is the artefact of 2026-08-21 coming back, and it must be
    // visible on a GREEN run, not discovered when the cell starts flipping.
    batchCalls: out.readings.map((r) => r.lot),
    batchMsMin: Number(lotMs.toFixed(1)),
    bar: Number(BAR_CONC.toFixed(2)),
    bytesPerConn: perConn.map(round),
    memRatio: Number(rMem.toFixed(2)),
    // REPORTED, NEVER ASSERTED ON: one point has nothing to be compared with,
    // and the socket constant would compress any ratio taken here into silence.
    inFlightUs: round(out.volNs / 1000),
    scopesHeld: out.portees,
  })}`);

  // 🛑 ANTI-VACUITY, AND HERE IT CARRIES MORE WEIGHT THAN ON AXIS A. "Flat" is
  //    exactly what a bench measuring NOTHING looks like — and on this axis
  //    there are two distinct ways to measure nothing: never open the
  //    connections, or open them client-side while the server never accepts.
  assert.deepEqual(conns, CONC_LEVELS,
    `the connection levels really reached must be ${CONC_LEVELS.join('/')}, got ${conns.join(',')}`);
  // The SERVER's own count, from its `connection` event: the kernel accepted
  // them. A client-side count would prove only that we called `connect`.
  assert.deepEqual(out.readings.map((r) => r.vues), CONC_LEVELS,
    `the SERVER accepted ${out.readings.map((r) => r.vues).join(',')} sockets — the parallel load this cell claims to apply does not exist`);
  assert.equal(out.tenues, CONC_LEVELS[CONC_LEVELS.length - 1],
    `only ${out.tenues} connections were still held at the end — sockets died mid-run, so the levels were never really loaded`);
  // 🛑 THE AXIS DID NOT LEAK. If the scope pool had grown with the levels this
  //    would be measuring axis A while claiming to measure axis B — the exact
  //    conflation the header exists to forbid.
  assert.equal(out.portees, CONC_SCOPES,
    `the store holds ${out.portees} durable scopes instead of ${CONC_SCOPES}: the held state MOVED, so this is axis A wearing axis B's name`);
  // ⚠️ THE FLOOR IS DERIVED, NEVER TYPED: the batch size is calibrated at runtime,
  //    so the only number that can be asserted in advance is the SMALLEST the
  //    calibration is allowed to return. Pilot passes count too — they are real
  //    requests through the real handler.
  assert.ok(out.calls >= CONC_WARMUP + CONC_LEVELS.length * (3 * CONC_LOT_PILOTE + CONC_SOUS_LOTS * CONC_LOT_MIN),
    `only ${out.calls} requests were served; this cell is not exercising anything`);
  assert.equal(out.servis, CONC_HTTP,
    `the real socket served ${out.servis}/${CONC_HTTP} in-flight round trips under full load — the benched handler is not the served one`);
  assert.ok(out.livres >= 1,
    'the real socket delivered nothing while loaded: what was benchmarked is not what a client gets');

  const shown = out.readings.map((r) => `${r.conns}:${round(r.turnNs)}ns`).join(' → ');

  // 🛑 THE READING MUST BE LONGER THAN A SCHEDULER QUANTUM — CHECKED, NOT HOPED.
  //    This is the 2026-08-21 artefact wired shut: at 160 calls a sub-batch lasted
  //    well under a millisecond against a ~15.6 ms quantum, so ONE preemption was
  //    the whole reading and the noise figure swung 1.71 → 3.35 between two runs
  //    of the same code. The batch is now calibrated in TIME; if the calibration
  //    ever hits its ceiling and comes back short, that must be a NAMED failure on
  //    the spot, never a cell that quietly starts flipping again months later.
  assert.ok(lotMs >= CONC_PLANCHER_MS / 2,
    `the timed sub-batches came back at ${lotMs.toFixed(1)} ms, under half the ${CONC_PLANCHER_MS} ms floor `
    + `(batches ${out.readings.map((r) => r.lot).join(',')} calls, ceiling ${CONC_LOT_MAX}). `
    + 'A reading shorter than a scheduler quantum measures preemption, not the daemon — raise the ceiling, never the bar.');

  // 🛑 DECIDABILITY BEFORE VERDICT. `nu` is the INTER-QUARTILE ratio of nine
  //    IDENTICAL sub-batches: the jitter of the MEDIAN, which is the statistic the
  //    verdict actually uses. (`spread`, max/min, measures the outliers the median
  //    exists to discard — gating on it was the first version's design error, and
  //    it is why this refusal used to fire on a normally busy workstation.) If the
  //    central half can reach the bar on its own, no conclusion drawn against that
  //    bar means anything — so the run REFUSES, by name, instead of passing.
  assert.ok(nu < BAR_CONC,
    `THIS RUN CANNOT DECIDE: the central half of ${CONC_SOUS_LOTS} identical sub-batches of ${lotMs.toFixed(1)} ms `
    + `spreads by ${nu.toFixed(2)}x (full max/min ${spread.toFixed(2)}x), which reaches the ${BAR_CONC.toFixed(2)}x bar on jitter alone. `
    + 'After the 2026-08-21 sizing fix this no longer names background activity — a preemption is bounded by the batch length and an '
    + 'outlier is discarded by the quartile — so it names a SATURATED machine. Free it and re-run. '
    + '🛑 Do NOT widen the bar to make this pass — the bar is derived from the levels, and noise is never allowed to move it.');

  // THE VERDICT — ratios only. Never a millisecond, never a byte total.
  assert.ok(rTurn < BAR_CONC,
    `the daemon's per-request cost GROWS WITH THE FLEET: 8x the clients connected at once cost ${rTurn.toFixed(2)}x per request (${shown}). `
    + 'One agent is paying for the agents that merely EXIST beside it — at hundreds of parallel agents that is not a slowdown, it is a wall.');

  // ── MEMORY, BECAUSE THE MEMORY WALL ARRIVES BEFORE THE CPU ONE ──
  assert.ok(total > 32 * 1024,
    `${round(total / 1024)} KB retained for ${CONC_LEVELS[CONC_LEVELS.length - 1]} connections — too little to be real state, so this reading proves nothing`);
  assert.ok(rMem < MARGE_MEM,
    `memory per CONNECTION grows with the number of connections (${perConn.map(round).join(' → ')} B, ratio ${rMem.toFixed(2)}x) — `
    + 'that is a quadratic footprint in the fleet, and it caps the number of parallel agents long before the CPU does');
});

// ── ④ SEEN RED (axis B) — the criterion must REJECT a per-request fleet walk ──
// 🛑 A GATE NEVER SEEN FAILING IS A GATE ASSUMED TO WORK, and this repo's worst
//    defect has always been a GREEN THAT SEES NOTHING. The sabotage is not a
//    strawman: keeping a registry of connected peers is what every real server
//    does, and touching it IN THE REQUEST PATH instead of at accept time is the
//    whole defect — cost proportional to the FLEET rather than to the work asked.
// ⚠️ IT SHARES `BAR_CONC` LITERALLY WITH CELL ③: weakening the bar up there turns
//    THIS cell red in the same move. That is what makes the pair a proof instead
//    of two opinions.
// 🔑 EXPECTED SHAPE: the walk costs O(C) while `handle('/turn')` costs a few
//    microseconds, so the ratio climbs towards the load factor 8, held back only
//    by that fixed cost. 📐 MEASURED 2026-08-21 at the FIRST range (K = 4, bar
//    2.00): **2.95 and 2.55** — red both times, but only 27 % clear on the thin
//    run, which is why the range was widened. The fit in the `BAR_CONC` block
//    predicts **4.6 to 5.6** here, against a bar of 2.83. ⚠️ THAT IS A PREDICTION,
//    NOT A READING — the number this cell prints is the only fact.
// 🛑 IF IT EVER LANDS NEAR THE BAR: shrink the constant (a wider range) or the
//    noise (longer sub-batches), which is what this file has now done twice.
//    NEVER move the bar, and NEVER make the sabotage louder — a strawman tuned
//    until it clears is a gate that only catches the defect it was shaped for.
test.sequential('SEEN RED (axis B): the same criterion rejects a daemon that walks its connection set on every request', async () => {
  const out = await runDriver(CONC_DRIVER, ['--sabotage']);
  const turn = out.readings.map((r) => r.turnNs);
  const rTurn = ratio(turn);

  console.log(`[scale-bench B SABOTAGED] ${JSON.stringify({
    connections: out.readings.map((r) => r.conns),
    turnNs: turn.map(round),
    turnRatio: Number(rTurn.toFixed(2)),
    bar: Number(BAR_CONC.toFixed(2)),
  })}`);

  assert.deepEqual(out.readings.map((r) => r.conns), CONC_LEVELS,
    'the sabotaged driver must have reached the same connection levels');
  assert.ok(out.puits > 0, 'the sabotage walked nothing at all — this cell would then prove nothing');
  assert.ok(out.calls >= CONC_WARMUP + CONC_LEVELS.length * (3 * CONC_LOT_PILOTE + CONC_SOUS_LOTS * CONC_LOT_MIN),
    `only ${out.calls} requests were served by the sabotaged driver`);

  assert.ok(!(rTurn < BAR_CONC),
    `the criterion FAILED TO SEE a cost proportional to the number of connected clients (ratio ${rTurn.toFixed(2)}x over 8x the `
    + `connections, readings ${turn.map(round).join(' → ')} ns, bar ${BAR_CONC.toFixed(2)}x) — it is therefore certifying, not measuring`);
});
