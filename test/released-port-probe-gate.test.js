// ═══════════════════════════════════════════════════════════════════════
// NO SUITE PROBES A PORT AND RELEASES IT FOR A CHILD — ONE ALLOCATOR, BELOW
// THE EPHEMERAL RANGE. POLICY. The DETECTION lives in
// `rules/no-released-port-probe.yml`.
//
// 🔴 WHY (measured 2026-09-23): `stale-code-guard ⑥bis` asserted exit 90 and
//    read exit 1 under the full run, 8/8 green alone. The daemon's journal said
//    `bind-refused lane=port`: its port, taken with `listen(0)` and released by
//    the test, had been handed by the kernel to a neighbour's outgoing
//    connection — the ephemeral range serves both. Seven suites carried their
//    own copy of that probe. They now ask `test/support/free-port.js`, which
//    allocates from a band no `connect()` is ever given.
//
// 🛑 ZERO TOLERANCE, NO BUDGET FILE: a released probe handed to a child is
//    never right — the allocator covers every such need, including N
//    consecutive ports for a multi-listener daemon.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort, nextBlock, BAND_START, BAND_SIZE } from './support/free-port.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = path.join(ROOT, 'rules', 'no-released-port-probe.yml');

// 🛑 THE NATIVE BINARY, NEVER THE `.bin` SHIM (a `.cmd` on Windows, `EINVAL`
//    under `execFileSync`). A MISSING BINARY IS A NAMED REFUSAL, never a skip:
//    `ast-grep` answers EMPTY JSON with EXIT 0 on a path it cannot resolve.
function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(ROOT, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. Run `npm ci`.');
  }
  return bin;
}

function scan(targets) {
  let out = '';
  try {
    out = execFileSync(astGrepBinary(), ['scan', '--rule', RULE, ...targets, '--json=compact'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // ⚠️ A non-zero exit is a RESULT (an `error` severity match), the findings are on stdout.
    out = (e && e.stdout) || '';
  }
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

test('GATE: no suite probes a port with listen(0) and releases it for somebody else', () => {
  const hits = scan(['src', 'test', 'tools']);
  const where = hits.map((h) => `${h.file}:${h.range.start.line + 1}  ${h.lines.trim().slice(0, 90)}`);
  assert.deepStrictEqual(where, [],
    'A PORT PROBED THEN RELEASED:\n  ' + where.join('\n  ')
    + '\n\n🛑 Between the probe\'s close and the child\'s bind, the kernel may give that\n'
    + '   ephemeral port to any outgoing connection of a parallel suite; the daemon\n'
    + '   then dies with `bind-refused` and the cell reads a regression that is not one.\n'
    + '→ WAY OUT: `import { freePort } from \'./support/free-port.js\'` (span = listeners).');
});

// ⚠️ ANTI-VACUITY: the scanner must really READ the perimeter — a rule matching
//    nothing is indistinguishable from a path that never resolved.
test('ANTI-VACUITY: the scanner sees the listen calls of this very perimeter', () => {
  const raw = execFileSync(astGrepBinary(), ['run', '--pattern', '$S.listen($$$)', 'src', 'test', '--json=compact'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const calls = raw.trim() === '' ? [] : JSON.parse(raw);
  assert.ok(calls.length >= 20, `expected the scanner to SEE real listen calls, found ${calls.length}`);
});

// 🛑 NEGATIVE CHECK, in a TMPDIR (an on-disk sabotage in `test/` would redden
//    parallel suites): the defect verbatim is caught, the legitimate shapes are not.
test('NEGATIVE: the released probe IS detected, a kept server and an inherited descriptor are NOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'port-probe-'));
  const file = path.join(tmp, 'offender.js');
  fs.writeFileSync(file, [
    // 1 — the defect verbatim, as seven suites wrote it
    "new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });",
    // kept server — MUST pass: nothing is released, nothing can be taken
    "srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; ask(port); });",
    // inherited descriptor — MUST pass: the child holds a dup, the socket stays bound
    "probe.listen(0, HOST, () => { child.on('spawn', () => probe.close()); });",
    // a STRING — MUST pass
    "const prose = \"s.listen(0, h, () => s.close(() => resolve(p)))\";",
  ].join('\n'), 'utf8');
  try {
    const hits = scan([file]);
    assert.strictEqual(hits.length, 1, 'expected exactly the released probe, got ' + hits.length
      + ': ' + hits.map((h) => h.text).join(' · '));
    assert.ok(hits[0].lines.includes('resolve(p)'), 'the hit must be the released probe itself');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// 🛑 THE RULE CARRIES NO EXEMPTION — a `files:`/`ignores:` would hide an occurrence for ever.
test('the rule exempts nothing', () => {
  const text = fs.readFileSync(RULE, 'utf8');
  assert.ok(!/^\s*(files|ignores)\s*:/m.test(text), 'the detection rule must not carry files/ignores');
});

// ═══ THE ALLOCATOR ITSELF — the cure must hold what the gate promises ═══
test('ALLOCATOR: every port is below the lowest default ephemeral floor, and N consecutive are bindable', async () => {
  // 32768 = Linux's default `ip_local_port_range` floor, the lowest of the three
  // vendor defaults (Windows and macOS start at 49152).
  assert.ok(BAND_START + BAND_SIZE <= 32768, 'the band must end below 32768');
  const blocks = [];
  for (const span of [1, 1, 4, 3]) {
    const base = await freePort({ span });
    assert.ok(base >= BAND_START && base + span - 1 < BAND_START + BAND_SIZE, `port ${base} (span ${span}) left the band`);
    blocks.push({ base, span });
  }
  // No two blocks handed out by one process may overlap: sorted, each ends before the next begins.
  blocks.sort((a, b) => a.base - b.base);
  blocks.slice(1).forEach((b, i) => assert.ok(blocks[i].base + blocks[i].span <= b.base,
    `blocks ${JSON.stringify(blocks[i])} and ${JSON.stringify(b)} overlap — a port handed out twice`));
});

// ═══ THE OVERLAP WAS DETERMINISTIC, NOT FLAKY — PROVEN FOR EVERY STARTING CURSOR (2026-10-01) ═══
// 🔴 The cell above reddened on the Linux runner only, by pid: the start of the
//    cursor is `pid * 31 + threadId * 997`, so the defect depended on WHICH process
//    ran it. Iterating EVERY cursor of the band removes the luck: the property is
//    checked where the runner happened to land, and everywhere else.
const SEQUENCE = [1, 1, 4, 3]; // the exact spans the cell above requests

/** Walks `SEQUENCE` from `start` with `next`; returns the first overlap, or null. */
function overlapFrom(start, next) {
  let cur = start;
  const blocks = SEQUENCE.map((span) => {
    const b = next(cur, span);
    cur = b.next;
    return { base: b.base, span };
  });
  blocks.sort((a, b) => a.base - b.base);
  const bad = blocks.slice(1).find((b, i) => blocks[i].base + blocks[i].span > b.base
    || b.base + b.span > BAND_START + BAND_SIZE);
  return bad === undefined ? null : JSON.stringify(blocks);
}

test('ALLOCATOR: no starting cursor of the band can make two blocks overlap', () => {
  const faults = [];
  for (let start = 0; start < BAND_SIZE; start += 1) {
    const f = overlapFrom(start, nextBlock);
    if (f !== null) faults.push(`cursor ${start}: ${f}`);
  }
  assert.deepEqual(faults.slice(0, 3), [], `${faults.length} starting cursor(s) hand a port out twice`);
});

test('NEGATIVE: the former span-dependent modulus DOES overlap — the cell above can see it', () => {
  // The defect verbatim, kept IN MEMORY only, so the property cell is proven able to fail.
  const formerNext = (cur, span) => ({ base: BAND_START + (cur % (BAND_SIZE - span)), next: cur + span });
  let seen = 0;
  for (let start = 0; start < BAND_SIZE; start += 1) if (overlapFrom(start, formerNext) !== null) seen += 1;
  assert.ok(seen > 0, 'the former formula overlapped on the runner: a property that never sees it is blind');
});

test('ALLOCATOR: a port somebody HOLDS is skipped, never handed out', async () => {
  const net = await import('node:net');
  const first = await freePort();
  // Hold the NEXT candidates the cursor will reach, then ask: none may come back.
  const held = [];
  for (let k = 1; k <= 3; k += 1) {
    const s = net.createServer();
    await new Promise((resolve) => { s.once('error', resolve); s.listen(first + k, '127.0.0.1', resolve); });
    held.push(s);
  }
  // ⚠️ ONE traversal (`flatMap`), never `filter().map()`: a chain is a traversal fed by a traversal,
  //    which the complexity gate counts as nested — this file is held at zero.
  const holding = new Set(held.flatMap((s) => (s.listening ? [s.address().port] : [])));
  // ⚠️ ANTI-VACUITY: if this test could hold nothing, the cell would prove nothing.
  assert.ok(holding.size >= 1, 'this test could not hold a single port of the band — the cell measures nothing');
  try {
    const next = await freePort();
    assert.ok(!holding.has(next), `the allocator handed out ${next}, a port this test holds`);
  } finally {
    await Promise.all(held.map((s) => new Promise((resolve) => (s.listening ? s.close(resolve) : resolve()))));
  }
});
