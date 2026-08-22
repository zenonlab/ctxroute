// ═══════════════════════════════════════════════════════════════════════
// doctor-wiring-pure — the DECISION half of the fleet's dead-man switch.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS SUITE EXISTS: `checkWiring()` used to live inside `tools/doctor.js`, an I/O tool that
//    is deliberately OUTSIDE Stryker's `mutate`. So the judgement that decides whether the whole
//    framework is alive — split brain, frame coordinates 1..N, lane coherence, divergent `--frames`
//    — had NEVER been mutated. A false dead-man switch is worse than none: it REASSURES.
// ⚠️ IMPORTED DIRECTLY, never through a re-export: a CJS edge behind a re-export is invisible to
//    vitest's module graph, and Stryker then runs NO test at all against this file while the score
//    reads perfectly (measured here on the `keys` operator: 62 phantom survivors).
// ⚠️ perTest coverage: EVERY fixture is built INSIDE its `test()` callback. A module-level const
//    calling the mutated code is a STATIC mutant covered by no test — 42 false survivors were
//    measured on that exact mistake in this repository.
// ⚠️ Expected values are written out LITERALLY, COPIED from the source. Never
//    `toBe(MODULE.CONSTANT)`: that proves `x === x` and leaves the contract unasserted (43
//    survivors, measured 2026-08-21). The DETAIL of a refusal is contract, not decoration — it is
//    what a human reads at 3am when the injection has silently stopped.
// ⚠️ NO NESTED TRAVERSAL in this file either (complexity declares itself, test files included).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  GATE_FILE, GATE, HOOKS, OPTIONAL_GROUPS,
  declarations, coord, filePath, wiringFindings, reducedNotice,
} from '../src/doctor-wiring-pure.js';

// ── Fixture builders. They only SHAPE data; nothing here calls the mutated decision at load time.
function commandSettings(commands) {
  return { hooks: { PreToolUse: [{ hooks: commands.map((c) => ({ type: 'command', command: c })) }] } };
}
function urlSettings(urls) {
  return { hooks: { PreToolUse: [{ hooks: urls.map((u) => ({ type: 'http', url: u })) }] } };
}
// A wiring that satisfies EVERY check, so a negative case differs from it by ONE fact only.
function healthyCommands() {
  return [
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 2',
    'node /r/src/hooks/session-inject.js',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js',
    'node /r/src/hooks/canary-check.js',
  ];
}
function findingsOf(commands, extra) {
  return wiringFindings(Object.assign({
    settings: commandSettings(commands),
    wantedFrames: null,
    laneFlag: '--client',
    consumers: ['doc-inject.js', 'ctxroute-reset.js', 'session-inject.js', 'turn-count.js'],
    repoDir: '/r/tools',
  }, extra || {}));
}
function checkNamed(findings, name) {
  return findings.find((f) => f.kind === 'check' && f.name === name);
}
function fileEntries(findings) {
  return findings.filter((f) => f.kind === 'file');
}

// ═══════════════════════════════════════════════════════════════════════
// THE DECLARATION READER — BOTH TRANSPORTS, ALWAYS.
// ═══════════════════════════════════════════════════════════════════════

test('a declaration is read on the command lane AND on the http lane', () => {
  const mixed = {
    hooks: {
      PreToolUse: [{ hooks: [{ command: 'node a.js' }, { url: 'http://127.0.0.1:7/pretool?frame=1' }] }],
    },
  };
  assert.deepEqual(declarations(mixed), ['"command":"node a.js"', '"url":"http://127.0.0.1:7/pretool?frame=1"']);
});

test('a settings object with no declaration at all yields an EMPTY list, never null', () => {
  // 🛑 The `|| []` is load-bearing: `String.match` answers null, and null would crash every
  //    downstream traversal — i.e. the dead-man switch would die on the emptiest possible wiring.
  assert.deepEqual(declarations({}), []);
  assert.deepEqual(declarations({ hooks: {} }), []);
});

test('a key that merely LOOKS like a declaration is not one (only `command` and `url` are read)', () => {
  assert.deepEqual(declarations({ hooks: { X: [{ hooks: [{ comment: 'node doc-inject.js' }] }] } }), []);
});

// ═══════════════════════════════════════════════════════════════════════
// ONE READER FOR THE TWO DIALECTS — the total and the index, same code.
// ═══════════════════════════════════════════════════════════════════════

test('the coordinates are read from the spawn lane (`--frame k --frames N`)', () => {
  assert.equal(coord('node doc-inject.js --frame 3 --frames 16', 'frame'), 3);
  assert.equal(coord('node doc-inject.js --frame 3 --frames 16', 'frames'), 16);
});

test('the coordinates are read from the http lane (`?frame=k&frames=N`)', () => {
  assert.equal(coord('"url":"http://127.0.0.1:7/pretool?frame=4&frames=16"', 'frame'), 4);
  assert.equal(coord('"url":"http://127.0.0.1:7/pretool?frame=4&frames=16"', 'frames'), 16);
});

test('a declaration carrying no coordinate answers null, never a fabricated number', () => {
  assert.equal(coord('node doc-inject.js', 'frame'), null);
  assert.equal(coord('node doc-inject.js', 'frames'), null);
});

test('the spawn form WINS when both are present (one reader, deterministic)', () => {
  assert.equal(coord('node x.js --frames 8 ?frames=2', 'frames'), 8);
});

// ═══════════════════════════════════════════════════════════════════════
// THE WIRED PATH IS EXTRACTED, NEVER GUESSED.
// ═══════════════════════════════════════════════════════════════════════

test('an absolute Windows path is extracted whole', () => {
  assert.equal(
    filePath('"command":"node C:\\\\Users\\\\dev\\\\ctxroute\\\\src\\\\hooks\\\\doc-inject.js --frame 1"', 'doc-inject.js'),
    'C:\\\\Users\\\\dev\\\\ctxroute\\\\src\\\\hooks\\\\doc-inject.js',
  );
});

test('an absolute POSIX path is extracted whole', () => {
  assert.equal(filePath('"command":"node /home/dev/ctxroute/src/hooks/canary-check.js"', 'canary-check.js'),
    '/home/dev/ctxroute/src/hooks/canary-check.js');
});

test('a declaration with NO path answers null — the http lane carries no file name and is not accused', () => {
  assert.equal(filePath('"url":"http://127.0.0.1:7/pretool?frame=1&frames=2"', 'doc-inject.js'), null);
});

test('the file name is matched LITERALLY: its dots are not wildcards', () => {
  // Without the escaping, `doc-inject.js` would match `doc-injectXjs` and the doctor would certify
  // a file that does not exist under a name nobody wired.
  assert.equal(filePath('"command":"node /a/docXinjectXjs"', 'doc-inject.js'), null);
});

// ═══════════════════════════════════════════════════════════════════════
// THE HOOK REGISTRY — every word of it is contract.
// ═══════════════════════════════════════════════════════════════════════

test('the registry holds exactly the five hooks the wiring must carry, in wiring order', () => {
  assert.deepEqual(HOOKS.map((h) => h.base), [
    'ctxroute-reset.js',
    'session-inject.js',
    'doc-write-guard.js',
    'turn-count.js',
    'canary-check.js',
  ]);
  assert.equal(Object.isFrozen(HOOKS), true);
  assert.equal(Object.isFrozen(HOOKS[0]), true);
});

test('only the hooks whose PATH is resolved ask for a file check (an inert check is a lie)', () => {
  assert.deepEqual(HOOKS.map((h) => h.file), [true, true, false, false, true]);
});

test('every hook NAMES ITS OWN ORGAN — a switch naming the wrong one wastes the time it exists to save', () => {
  assert.deepEqual(HOOKS.map((h) => h.name), [
    'the PreCompact reset is wired (ctxroute-reset.js)',
    'the SESSION gate (session-inject.js) is wired on SessionStart',
    'the write guard (doc-write-guard.js) is wired on PostToolUse',
    'the TURN gate (turn-count.js) is wired on UserPromptSubmit',
    'the CANARY (canary-check.js) is wired on UserPromptSubmit',
  ]);
  assert.deepEqual(HOOKS.map((h) => h.label), ['file', 'SESSION gate', 'file', 'file', 'file']);
});

test('every hook says WHAT DIES with it, and every one of those consequences is SILENT', () => {
  assert.deepEqual(HOOKS.map((h) => h.detail), [
    'ctxroute-reset.js missing from settings.json: no more re-injection after compaction, in silence.',
    'session-inject.js missing from settings.json: no docs/session/ doc injected any more, in silence.',
    'doc-write-guard.js missing from settings.json: no more real-time feedback on an invalid doc.',
    'turn-count.js missing from settings.json: driftUnit turn dead — docs never re-injected, in silence.',
    'canary-check.js missing from settings.json: NO witness checks any more that the harness still consumes '
      + 'our injections. The day it stops, everything stays green and nothing reaches the agent any more.',
  ]);
});

test('the CANARY is recognised under BOTH spellings (a not-yet-migrated wiring still says `canari`)', () => {
  const migrated = findingsOf(healthyCommands());
  const legacySpelling = findingsOf([
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1',
    'node /r/src/hooks/session-inject.js',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js',
    'node /r/src/hooks/canari-check.js',
  ]);
  assert.equal(checkNamed(migrated, 'the CANARY (canary-check.js) is wired on UserPromptSubmit').ok, true);
  assert.equal(checkNamed(legacySpelling, 'the CANARY (canary-check.js) is wired on UserPromptSubmit').ok, true);
});

test('the file verdicts are worded PER HOOK, and the GATE has its own descriptor', () => {
  assert.equal(GATE.base, 'doc-inject.js');
  assert.equal(GATE.label, 'GATE');
  assert.equal(GATE.absent('/a/doc-inject.js'),
    'settings.json points at a NON-EXISTENT GATE: /a/doc-inject.js — hook dead in silence.');
  assert.equal(GATE.copy('/a/doc-inject.js', '/r/tools'),
    'settings.json points at ANOTHER copy of the gate: /a/doc-inject.js (this repo: /r/tools).');
  assert.equal(HOOKS[0].absent('/a/ctxroute-reset.js'),
    'settings.json points at a NON-EXISTENT file: /a/ctxroute-reset.js — hook dead in silence.');
  assert.equal(HOOKS[0].copy('/a/ctxroute-reset.js', '/r/tools'),
    'settings.json points at ANOTHER copy of the framework: /a/ctxroute-reset.js (this repo: /r/tools) — your changes here do not apply.');
  assert.equal(HOOKS[1].absent('/a/session-inject.js'),
    'settings.json points at a non-existent session gate: /a/session-inject.js — hook dead in silence.');
  assert.equal(HOOKS[1].copy('/a/session-inject.js', '/r/tools'),
    'settings.json points at ANOTHER copy of the session gate: /a/session-inject.js (this repo: /r/tools).');
  assert.equal(HOOKS[4].absent('/a/canary-check.js'),
    'settings.json points at a NON-EXISTENT file: /a/canary-check.js — the witness died before serving.');
  assert.equal(HOOKS[4].copy('/a/canary-check.js', '/r/tools'),
    'settings.json points at ANOTHER copy of the framework: /a/canary-check.js (this repo: /r/tools).');
  assert.equal(GATE_FILE, 'doc-inject.js');
});

// ═══════════════════════════════════════════════════════════════════════
// THE HEALTHY WIRING — the reference every negative case differs from by ONE fact.
// ═══════════════════════════════════════════════════════════════════════

test('a complete wiring passes EVERY check, and the order of the verdicts is the contract', () => {
  const findings = findingsOf(healthyCommands());
  // One traversal per statement: a chained `.filter().map()` is a nested traversal to the
  // quadratic gate (the receiver is a descendant), and this repository declares those.
  const checks = findings.filter((f) => f.kind === 'check');
  assert.deepEqual(checks.map((f) => [f.name, f.ok]), [
    ['the PreCompact reset is wired (ctxroute-reset.js)', true],
    ['legacy-mcp-inject.js is NO LONGER wired (the gate covers MCP — otherwise double injection)', true],
    ['the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all', true],
    ['every gate declaration announces the SAME number of frames', true],
    ['there are exactly as many declarations as announced frames', true],
    ['the frame indices cover 1..N, with no gap and no duplicate', true],
    ['the SESSION gate (session-inject.js) is wired on SessionStart', true],
    ['the write guard (doc-write-guard.js) is wired on PostToolUse', true],
    ['the TURN gate (turn-count.js) is wired on UserPromptSubmit', true],
    ['the CANARY (canary-check.js) is wired on UserPromptSubmit', true],
    ['the lane-coherence check has something to judge (flag read, consumers derived, gate declared)', true],
    ['every consumer of the injection state reaches the SAME authority (no split brain)', true],
  ]);
});

test('the file entries are handed back in wiring order, one per DECLARATION that carries a path', () => {
  const entries = fileEntries(findingsOf(healthyCommands()));
  assert.deepEqual(entries.map((e) => e.base), [
    'ctxroute-reset.js', 'doc-inject.js', 'doc-inject.js', 'session-inject.js', 'canary-check.js',
  ]);
  assert.deepEqual(entries.map((e) => e.file), [
    '/r/src/hooks/ctxroute-reset.js',
    '/r/src/hooks/doc-inject.js',
    '/r/src/hooks/doc-inject.js',
    '/r/src/hooks/session-inject.js',
    '/r/src/hooks/canary-check.js',
  ]);
  assert.equal(entries[1].existsName, 'the wired file exists: doc-inject.js');
  assert.equal(entries[1].copyName, 'the wired GATE really is THIS repo: doc-inject.js');
  assert.equal(entries[1].absentDetail,
    'settings.json points at a NON-EXISTENT GATE: /r/src/hooks/doc-inject.js — hook dead in silence.');
  assert.equal(entries[1].copyDetail,
    'settings.json points at ANOTHER copy of the gate: /r/src/hooks/doc-inject.js (this repo: /r/tools).');
  assert.equal(entries[3].copyName, 'the wired SESSION gate really is THIS repo: session-inject.js');
  assert.equal(entries[0].copyName, 'the wired file really is THIS repo: ctxroute-reset.js');
});

test('an http gate declaration asks for NO file check — it carries no file name at all', () => {
  const findings = wiringFindings({
    settings: urlSettings(['http://127.0.0.1:7777/pretool?frame=1&frames=1']),
    wantedFrames: null,
    laneFlag: '--client',
    consumers: ['doc-inject.js', 'turn-count.js'],
    repoDir: '/r/tools',
  });
  assert.deepEqual(fileEntries(findings), []);
  assert.equal(checkNamed(findings, 'the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all').ok, true);
  assert.equal(checkNamed(findings, 'the frame indices cover 1..N, with no gap and no duplicate').ok, true);
});

// ═══════════════════════════════════════════════════════════════════════
// THE NEGATIVES — each one is a SILENT death in production.
// ═══════════════════════════════════════════════════════════════════════

test('the PreCompact reset unwired is RED, and the verdict says injection stops after a compaction', () => {
  const findings = findingsOf(['node /r/src/hooks/doc-inject.js --frame 1 --frames 1']);
  const c = checkNamed(findings, 'the PreCompact reset is wired (ctxroute-reset.js)');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'ctxroute-reset.js missing from settings.json: no more re-injection after compaction, in silence.');
});

test('legacy-mcp-inject.js still wired is RED — every MCP doc would be injected TWICE', () => {
  const commands = healthyCommands().concat(['node /r/src/hooks/legacy-mcp-inject.js']);
  const c = checkNamed(findingsOf(commands),
    'legacy-mcp-inject.js is NO LONGER wired (the gate covers MCP — otherwise double injection)');
  assert.equal(c.ok, false);
  assert.equal(c.detail, 'legacy-mcp-inject.js still wired in settings.json: MCP docs injected TWICE (gate + legacy).');
});

test('a legacy declaration is NEVER counted as a gate declaration', () => {
  const findings = findingsOf(['node /r/src/hooks/legacy-mcp-inject.js --frame 1 --frames 1']);
  const c = checkNamed(findings, 'the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'doc-inject.js missing from settings.json: since the merge, IT is what injects ALL docs. Silent death.');
});

test('a gate declared ONCE is enough for the presence check — it is a floor, not an equality', () => {
  const one = findingsOf(['node /r/src/hooks/doc-inject.js --frame 1 --frames 1']);
  assert.equal(checkNamed(one, 'the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all').ok, true);
  const none = findingsOf(['node /r/src/hooks/turn-count.js']);
  assert.equal(checkNamed(none, 'the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all').ok, false);
});

test('divergent `--frames` is RED: the processes would split the content differently', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 3',
  ]), 'every gate declaration announces the SAME number of frames');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Divergent --frames values in settings.json: 2, 3. The processes would split the content differently: the frames would no longer re-assemble.');
});

test('a gate declaration with NO `--frames` counts as ONE frame (silence is not zero)', () => {
  const findings = findingsOf(['node /r/src/hooks/doc-inject.js --frame 1']);
  assert.equal(checkNamed(findings, 'every gate declaration announces the SAME number of frames').ok, true);
  assert.equal(checkNamed(findings, 'there are exactly as many declarations as announced frames').ok, true);
});

test('fewer declarations than announced frames is RED, and the verdict COUNTS the missing ones', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 3',
  ]), 'there are exactly as many declarations as announced frames');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    '1 declaration(s) of doc-inject.js for --frames 3. Each frame is carried by ONE process: 2 are missing, so that content will NEVER leave this gesture.');
});

test('the declared BANDWIDTH is confronted with the wiring — two places for one number always diverge', () => {
  const c = checkNamed(findingsOf(healthyCommands(), { wantedFrames: 16 }),
    'the wiring honours the declared bandwidth (frames: 16)');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'ctxroute-config.json asks for 16 frame(s), settings.json wires 2 (--frames 2). The harness obeys settings.json: the REAL capacity is 2, not 16. Realign the two — this is exactly the silent divergence of 2026-08-05.');
  assert.equal(checkNamed(findingsOf(healthyCommands(), { wantedFrames: 2 }),
    'the wiring honours the declared bandwidth (frames: 2)').ok, true);
});

test('a config that declares NO bandwidth is not reproached — the check is absent, not green', () => {
  // 🛑 Nobody is forced to declare their bandwidth. An absent key must produce NO verdict at all:
  //    a silently-passing check would be indistinguishable from a measured agreement.
  const names = findingsOf(healthyCommands()).map((f) => f.name);
  assert.equal(names.some((n) => typeof n === 'string' && n.startsWith('the wiring honours the declared bandwidth')), false);
  const declared = findingsOf(healthyCommands(), { wantedFrames: 2 }).map((f) => f.name);
  assert.equal(declared.includes('the wiring honours the declared bandwidth (frames: 2)'), true);
});

test('a GAP in the frame indices is RED: that frame is never emitted, in silence', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 3',
    'node /r/src/hooks/doc-inject.js --frame 3 --frames 3',
    'node /r/src/hooks/doc-inject.js --frame 4 --frames 3',
  ]), 'the frame indices cover 1..N, with no gap and no duplicate');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Declared --frame indices: [1, 3, 4] instead of [1, 2, 3]. A missing index = a frame never emitted; a duplicated index = content delivered twice. Both are SILENT.');
});

test('a DUPLICATED index is RED too: that content is delivered twice', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2',
  ]), 'the frame indices cover 1..N, with no gap and no duplicate');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Declared --frame indices: [1, 1] instead of [1, 2]. A missing index = a frame never emitted; a duplicated index = content delivered twice. Both are SILENT.');
});

test('the indices are sorted ASCENDING before comparison — declaration order is the operator\'s business', () => {
  const findings = findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 3 --frames 3',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 3',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 3',
  ]);
  assert.equal(checkNamed(findings, 'the frame indices cover 1..N, with no gap and no duplicate').ok, true);
});

test('a gate declaration with no INDEX at all is RED — index 0 exists on no transport', () => {
  const c = checkNamed(findingsOf(['node /r/src/hooks/doc-inject.js --frames 1']),
    'the frame indices cover 1..N, with no gap and no duplicate');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Declared --frame indices: [0] instead of [1]. A missing index = a frame never emitted; a duplicated index = content delivered twice. Both are SILENT.');
});

test('the session gate, the write guard, the turn counter and the canary each go RED on their own', () => {
  const findings = findingsOf([
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1',
  ]);
  assert.equal(checkNamed(findings, 'the SESSION gate (session-inject.js) is wired on SessionStart').ok, false);
  assert.equal(checkNamed(findings, 'the write guard (doc-write-guard.js) is wired on PostToolUse').ok, false);
  assert.equal(checkNamed(findings, 'the TURN gate (turn-count.js) is wired on UserPromptSubmit').ok, false);
  assert.equal(checkNamed(findings, 'the CANARY (canary-check.js) is wired on UserPromptSubmit').ok, false);
  assert.deepEqual(fileEntries(findings).map((e) => e.base), ['ctxroute-reset.js', 'doc-inject.js']);
});

// ═══════════════════════════════════════════════════════════════════════
// LANE COHERENCE — ALL THE CONSUMERS, OR NONE.
// ═══════════════════════════════════════════════════════════════════════

test('SPLIT BRAIN: the gate on the daemon while a peer stays on the disk is RED, both sides NAMED', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js',
    'node /r/src/hooks/canary-check.js',
  ]), 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js, session-inject.js. '
    + 'On the DISK (no --client): ctxroute-reset.js, turn-count.js. '
    + 'The gate records its deliveries in the daemon\'s RAM while those peers read and erase the state FILES: TWO MEMORIES. '
    + 'MEASURED COST: after a compaction the reset wipes a disk the daemon never reads, so skills and `once` documents NEVER '
    + 'come back — no error, no badge, no red anywhere. '
    + 'FIX: add `--client` to the declaration of each consumer listed on the disk side, or take the gate '
    + 'back off the daemon lane. All the consumers, or none — a shared state migrates for ALL of them or for NONE.');
});

test('an http gate declaration puts the gate on the daemon — no `--client` is written anywhere', () => {
  const findings = wiringFindings({
    settings: {
      hooks: {
        A: [{ hooks: [
          { type: 'http', url: 'http://127.0.0.1:7777/pretool?frame=1&frames=1' },
          { command: 'node /r/src/hooks/turn-count.js' },
        ] }],
      },
    },
    wantedFrames: null,
    laneFlag: '--client',
    consumers: ['doc-inject.js', 'turn-count.js'],
    repoDir: '/r/tools',
  });
  const c = checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.startsWith('SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js. On the DISK (no --client): turn-count.js. '), true);
});

test('the gate on the DISK is never a split brain, however the peers are wired', () => {
  const findings = findingsOf(healthyCommands());
  assert.equal(checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)').ok, true);
});

test('a whole wiring on the daemon is coherent — one authority, so no complaint', () => {
  const findings = findingsOf([
    'node /r/src/hooks/ctxroute-reset.js --client',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js --client',
    'node /r/src/hooks/canary-check.js',
  ]);
  assert.equal(checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)').ok, true);
});

test('a peer declared TWICE reaches the daemon only if EVERY declaration does', () => {
  // One disk-bound process is enough to make a second memory — hence AND, never OR.
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/ctxroute-reset.js --client',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/session-inject.js',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js --client',
    'node /r/src/hooks/canary-check.js',
  ]), 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.startsWith(
    'SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js, ctxroute-reset.js, turn-count.js. On the DISK (no --client): session-inject.js. '), true);
});

test('a peer with NO declaration at all is not judged here — one fault must not produce two reds', () => {
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
  ]), 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, true);
});

test('ANTI-VACUITY: an unreadable LANE_FLAG is RED — "we could not measure" is never "it is coherent"', () => {
  const c = checkNamed(findingsOf(healthyCommands(), { laneFlag: null }),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Lane coherence UNMEASURABLE: LANE_FLAG unreadable from src/client-core.js, '
    + '4 consumer(s) derived from src/hooks/ (gate found), '
    + '2 gate declaration(s) in settings.json. A check that examines nothing is not a check that passes.');
});

test('ANTI-VACUITY: an EMPTY LANE_FLAG is unreadable too (it would match every declaration)', () => {
  assert.equal(checkNamed(findingsOf(healthyCommands(), { laneFlag: '' }),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)').ok, false);
});

test('ANTI-VACUITY: no consumer derived from src/hooks/ is RED, and the verdict says the gate is MISSING', () => {
  const c = checkNamed(findingsOf(healthyCommands(), { consumers: [] }),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)');
  assert.equal(c.ok, false);
  assert.equal(c.detail,
    'Lane coherence UNMEASURABLE: LANE_FLAG = --client, '
    + '0 consumer(s) derived from src/hooks/ (gate MISSING), '
    + '2 gate declaration(s) in settings.json. A check that examines nothing is not a check that passes.');
});

test('ANTI-VACUITY: the gate alone, with no PEER, is RED — there would be nothing to be coherent with', () => {
  assert.equal(checkNamed(findingsOf(healthyCommands(), { consumers: ['doc-inject.js'] }),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)').ok, false);
});

test('ANTI-VACUITY: no gate declaration at all is RED', () => {
  assert.equal(checkNamed(findingsOf(['node /r/src/hooks/turn-count.js']),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)').ok, false);
  assert.equal(checkNamed(findingsOf(healthyCommands()),
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)').ok, true);
});

test('the lane flag is matched LITERALLY — its regex characters never become operators', () => {
  const findings = findingsOf([
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 -.client',
  ], { laneFlag: '-.client' });
  // `-.client` escaped matches only itself; the reset carries no flag, so this IS a split brain.
  const c = checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.startsWith('SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js. On the DISK (no -.client): ctxroute-reset.js. '), true);
});

// ═══════════════════════════════════════════════════════════════════════
// A REDUCED MEASUREMENT MUST DECLARE ITSELF REDUCED.
// ═══════════════════════════════════════════════════════════════════════

test('the optional check groups are a REGISTRY, frozen, and each names what it alone covers', () => {
  assert.deepEqual(OPTIONAL_GROUPS.map((g) => g.flag), ['--settings', '--codex-hooks', '--codex-config']);
  assert.equal(Object.isFrozen(OPTIONAL_GROUPS), true);
  assert.equal(Object.isFrozen(OPTIONAL_GROUPS[0]), true);
  assert.deepEqual(OPTIONAL_GROUPS.map((g) => g.missing), [
    'the installation (is any MCP server documented?) and the ENTIRE harness wiring: gate, '
      + 'PreCompact reset, session gate, write guard, turn counter, canary, frame coordinates, '
      + 'declared bandwidth, lane coherence',
    'the Codex wiring: its six channels, the anti-double-injection rule and the context ceiling',
    'the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)',
  ]);
});

test('a COMPLETE run says nothing: there is no gap to declare', () => {
  assert.deepEqual(reducedNotice({
    flagsGiven: ['--settings', '--codex-hooks', '--codex-config'],
    ranCount: 91,
    settingsPath: '/home/dev/.claude/settings.json',
    settingsExists: true,
  }), []);
});

test('a bare run names EVERY group it did not measure, and points at the settings.json it walked past', () => {
  assert.deepEqual(reducedNotice({
    flagsGiven: [],
    ranCount: 14,
    settingsPath: '/home/dev/.claude/settings.json',
    settingsExists: true,
  }), [
    '⚠️ REDUCED MEASUREMENT — 14 check(s) ran, and that is NOT the whole framework.',
    '   • `--settings` not given ⇒ NOT MEASURED: the installation (is any MCP server documented?) and the ENTIRE harness wiring: gate, '
      + 'PreCompact reset, session gate, write guard, turn counter, canary, frame coordinates, declared bandwidth, lane coherence',
    '   • `--codex-hooks` not given ⇒ NOT MEASURED: the Codex wiring: its six channels, the anti-double-injection rule and the context ceiling',
    '   • `--codex-config` not given ⇒ NOT MEASURED: the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)',
    '   🔴 /home/dev/.claude/settings.json EXISTS and was NOT read. The wiring lives outside this repository: nothing in it can see a dead hook.',
    '      Measure it: node tools/doctor.js --settings "/home/dev/.claude/settings.json"',
    '   🛑 "I could not measure" is never "it is healthy".',
  ]);
});

test('no settings.json at the conventional address is stated as a FACT, never as a reproach', () => {
  // 🛑 A clean clone and CI legitimately have none: the flag stays optional, the SILENCE does not.
  const lines = reducedNotice({
    flagsGiven: [], ranCount: 14, settingsPath: '/home/dev/.claude/settings.json', settingsExists: false,
  });
  assert.equal(lines[4], '   ℹ no settings.json at /home/dev/.claude/settings.json — a clean clone and CI legitimately have none.');
  assert.equal(lines[5], '   🛑 "I could not measure" is never "it is healthy".');
  assert.equal(lines.length, 6);
});

test('an unknown conventional address is not guessed: the notice simply says nothing about it', () => {
  const lines = reducedNotice({ flagsGiven: [], ranCount: 14, settingsPath: null, settingsExists: false });
  assert.equal(lines.length, 5);
  assert.equal(lines[4], '   🛑 "I could not measure" is never "it is healthy".');
});

test('when the WIRING was measured, the settings.json paragraph disappears — it is not a gap any more', () => {
  assert.deepEqual(reducedNotice({
    flagsGiven: ['--settings'],
    ranCount: 67,
    settingsPath: '/home/dev/.claude/settings.json',
    settingsExists: true,
  }), [
    '⚠️ REDUCED MEASUREMENT — 67 check(s) ran, and that is NOT the whole framework.',
    '   • `--codex-hooks` not given ⇒ NOT MEASURED: the Codex wiring: its six channels, the anti-double-injection rule and the context ceiling',
    '   • `--codex-config` not given ⇒ NOT MEASURED: the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)',
    '   🛑 "I could not measure" is never "it is healthy".',
  ]);
});

test('a flag given for another group never silences a different one', () => {
  const lines = reducedNotice({
    flagsGiven: ['--codex-hooks'], ranCount: 20, settingsPath: null, settingsExists: false,
  });
  assert.equal(lines[1], '   • `--settings` not given ⇒ NOT MEASURED: the installation (is any MCP server documented?) and the ENTIRE harness wiring: gate, '
    + 'PreCompact reset, session gate, write guard, turn counter, canary, frame coordinates, declared bandwidth, lane coherence');
  assert.equal(lines[2], '   • `--codex-config` not given ⇒ NOT MEASURED: the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)');
  assert.equal(lines.length, 4);
});

// ═══════════════════════════════════════════════════════════════════════
// CELLS ADDED AFTER READING THE SURVIVORS — each one names the mutant it kills.
// A survivor is KILLED or ELIMINATED at the source; here all twelve were real
// holes in the contract, not equivalent mutants.
// ═══════════════════════════════════════════════════════════════════════

test('the findings list starts EMPTY and its first verdict is the PreCompact reset', () => {
  // Kills the "seeded first entry" mutant: every other cell filters by name or by kind, so an
  // extra element at the head of the list would be invisible to all of them.
  const findings = findingsOf(healthyCommands());
  assert.equal(findings.length, 17);
  assert.equal(findings[0].kind, 'check');
  assert.equal(findings[0].name, 'the PreCompact reset is wired (ctxroute-reset.js)');
});

test('when the declarations DISAGREE on the total, the count is judged against the DECLARATIONS', () => {
  // A divergent wiring has no trustworthy announced total, so the only honest reference left is
  // how many processes are actually declared. Taking the first announced number instead would
  // invent a second red on top of the divergence.
  const findings = findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 2',
    'node /r/src/hooks/doc-inject.js --frame 3 --frames 3',
  ]);
  assert.equal(checkNamed(findings, 'every gate declaration announces the SAME number of frames').ok, false);
  assert.equal(checkNamed(findings, 'there are exactly as many declarations as announced frames').ok, true);
});

test('the bandwidth check demands BOTH halves: the announced total AND the number of processes', () => {
  // The harness obeys settings.json, so a correct `--frames` with too few processes is exactly
  // the 2026-08-05 degradation: capacity silently divided, nothing broken, everything degraded.
  const tooFewProcesses = checkNamed(
    findingsOf(['node /r/src/hooks/doc-inject.js --frame 1 --frames 3'], { wantedFrames: 3 }),
    'the wiring honours the declared bandwidth (frames: 3)',
  );
  assert.equal(tooFewProcesses.ok, false);
  assert.equal(tooFewProcesses.detail,
    'ctxroute-config.json asks for 3 frame(s), settings.json wires 1 (--frames 3). The harness obeys settings.json: the REAL capacity is 1, not 3. Realign the two — this is exactly the silent divergence of 2026-08-05.');

  const rightProcessesWrongTotal = checkNamed(findingsOf([
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 3',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 3',
  ], { wantedFrames: 2 }), 'the wiring honours the declared bandwidth (frames: 2)');
  assert.equal(rightProcessesWrongTotal.ok, false);
  assert.equal(rightProcessesWrongTotal.detail,
    'ctxroute-config.json asks for 2 frame(s), settings.json wires 2 (--frames 3). The harness obeys settings.json: the REAL capacity is 2, not 2. Realign the two — this is exactly the silent divergence of 2026-08-05.');
});

test('a peer whose FIRST declaration is disk-bound stays on the disk, whatever the later ones say', () => {
  // Kills "the last declaration wins": one disk-bound process is enough to make a second memory,
  // so the verdict is an AND over every declaration of that consumer, in any order.
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/ctxroute-reset.js --client',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
    'node /r/src/hooks/session-inject.js',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js --client',
    'node /r/src/hooks/canary-check.js',
  ]), 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.startsWith(
    'SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js, ctxroute-reset.js, turn-count.js. On the DISK (no --client): session-inject.js. '), true);
});

test('ONE peer and ONE gate declaration are enough to judge — the floors are >= 1, not > 1', () => {
  const findings = wiringFindings({
    settings: commandSettings([
      'node /r/src/hooks/doc-inject.js --frame 1 --frames 1',
      'node /r/src/hooks/turn-count.js',
    ]),
    wantedFrames: null,
    laneFlag: '--client',
    consumers: ['doc-inject.js', 'turn-count.js'],
    repoDir: '/r/tools',
  });
  assert.equal(checkNamed(findings,
    'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)').ok, true);
});

test('ONE frame on the daemon is enough to split the brain — never "all of them or nothing"', () => {
  // The deliveries of that single frame are recorded in a memory the disk-bound peers will never
  // read and never erase. Requiring EVERY gate declaration to be on the daemon would let the worst
  // case — a half-migrated gate — pass green.
  const c = checkNamed(findingsOf([
    'node /r/src/hooks/ctxroute-reset.js',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 2 --client',
    'node /r/src/hooks/doc-inject.js --frame 2 --frames 2',
    'node /r/src/hooks/session-inject.js',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js',
    'node /r/src/hooks/canary-check.js',
  ]), 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.startsWith('SPLIT BRAIN in settings.json. On the DAEMON: doc-inject.js. On the DISK (no --client): '), true);
});

test('an UNREADABLE lane flag still names a flag in the split-brain verdict, never `null` and never nothing', () => {
  // Reachable for real: with no flag readable, an http gate declaration still puts the gate on the
  // daemon. A remediation sentence reading "add `` to the declaration" teaches nobody anything.
  const findings = wiringFindings({
    settings: {
      hooks: {
        A: [{ hooks: [
          { type: 'http', url: 'http://127.0.0.1:7777/pretool?frame=1&frames=1' },
          { command: 'node /r/src/hooks/turn-count.js' },
        ] }],
      },
    },
    wantedFrames: null,
    laneFlag: null,
    consumers: ['doc-inject.js', 'turn-count.js'],
    repoDir: '/r/tools',
  });
  const c = checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)');
  assert.equal(c.ok, false);
  assert.equal(c.detail.includes('On the DISK (no --client): turn-count.js. '), true);
  assert.equal(c.detail.includes('FIX: add `--client` to the declaration of each consumer listed on the disk side'), true);
});

test('a peer declared TWICE, both times on the daemon, IS on the daemon — no phantom split brain', () => {
  // The complement of the AND: `true && true` must stay TRUE. Without this cell, collapsing the
  // conjunction to `false` is indistinguishable from the real rule on every one-sided case, and the
  // doctor would cry SPLIT BRAIN over a perfectly coherent migration — a false red on a dead-man
  // switch is how a dead-man switch gets unplugged.
  const findings = findingsOf([
    'node /r/src/hooks/ctxroute-reset.js --client',
    'node /r/src/hooks/doc-inject.js --frame 1 --frames 1 --client',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/session-inject.js --client',
    'node /r/src/hooks/doc-write-guard.js',
    'node /r/src/hooks/turn-count.js --client',
    'node /r/src/hooks/canary-check.js',
  ]);
  assert.equal(checkNamed(findings, 'every consumer of the injection state reaches the SAME authority (no split brain)').ok, true);
});
