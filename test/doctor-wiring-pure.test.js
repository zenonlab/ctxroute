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
  declaredHostPresence, normalizeAddress,
  deployedDriftVerdict, deployedArgument,
  readSettingsThrough,
  hookEventsOf, codexAfterFinding,
} from '../src/doctor-wiring-pure.js';

// ── readSettingsThrough — the dead-man switch's OWN read must survive the exact transient it
//    exists to be trusted through. Fixtures are THUNKS (an injected reader/signal/give-up
//    predicate with internal state), built fresh inside each test(), never at module scope.
// 🔴 TWO FIXES, TWO CAUSES. ① 2026-09-13: `checkWiring()` used a single bare `readFileSync` in an
//    empty `catch` — see 'a REAL transient error...' below, red on that old shape. ② 2026-09-14
//    FIRST attempt: a retry loop with a FIXED delay sized to ONE measured stall on ONE machine —
//    the operator rejected it directly (a slower/busier machine could need far more). This module
//    now owns NEITHER a duration NOR a retry count: the SHELL decides both, through `nextSignal`
//    (resolves on a real signal) and `giveUp` (says when to give up), and this module only
//    reacts. Fixtures below never sleep for real — they resolve/give-up on a call COUNT, proving
//    the LOGIC without paying (or guessing) a real duration.

test('a clean read succeeds on the FIRST attempt (the common case stays cheap)', async () => {
  let calls = 0;
  const lire = () => { calls += 1; return '{"ok":true}'; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', async () => {}, () => true);
  assert.deepStrictEqual(result, { raw: '{"ok":true}' });
  assert.equal(calls, 1, 'a successful read must not retry, and must never even ask whether to give up');
});

test('ENOENT is retried across real awaits and a later success is returned — the rename-window class', async () => {
  let calls = 0;
  let signals = 0;
  const lire = () => {
    calls += 1;
    if (calls < 3) { const e = new Error('vanished'); e.code = 'ENOENT'; throw e; }
    return '{"recovered":true}';
  };
  const nextSignal = async () => { signals += 1; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', nextSignal, () => false);
  assert.deepStrictEqual(result, { raw: '{"recovered":true}' });
  assert.equal(calls, 3, 'must have retried exactly twice before succeeding on the third attempt');
  assert.equal(signals, 2, 'must wait for a signal exactly once per failed attempt, never after the final success');
});

test('when the shell decides to give up, a persisting ENOENT is reported as a genuine absence', async () => {
  let calls = 0;
  let abandonAsked = 0;
  const lire = () => { calls += 1; const e = new Error('gone'); e.code = 'ENOENT'; throw e; };
  const giveUp = () => { abandonAsked += 1; return abandonAsked >= 5; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', async () => {}, giveUp);
  assert.equal(result.raw, null);
  assert.ok(result.detail.includes('gave up waiting for a real filesystem signal'));
  assert.ok(result.detail.includes('C:/x/settings.json'));
  assert.equal(calls, 5, 'reads exactly once per attempt, giving up the moment the SHELL says so — never a count this module owns');
});

test('a REAL transient error must not be swallowed into "not found" — it is reported WITH ITS CODE', async () => {
  const lire = () => { const e = new Error('the process that just wrote it still holds it'); e.code = 'EPERM'; throw e; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', async () => {}, () => false);
  assert.equal(result.raw, null);
  // 🛑 THIS is the assertion the old bare readFileSync could never satisfy: it swallowed EVERY
  //    error into one blind "not found" message, indistinguishable from a genuinely absent file.
  assert.ok(result.detail.includes('EPERM'),
    'a diagnostic that cannot tell EPERM from ENOENT sends the operator looking in the wrong place');
  assert.ok(!result.detail.includes('not found'),
    'EPERM is a REAL problem (a lock), never a disguised "not found"');
});

test('a thrown value with NEITHER `.code` NOR `.name` still names something ("error"), never crashes', async () => {
  const lire = () => { throw { message: 'not a real Error instance' }; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', async () => {}, () => false);
  assert.equal(result.raw, null);
  assert.ok(result.detail.includes('error'), 'the final fallback name must appear, even with no code and no name');
  assert.ok(result.detail.includes('not a real Error instance'));
});

test('a NON-ENOENT error is never retried, and never even asks whether to give up (retrying would hide a real problem)', async () => {
  let calls = 0;
  let abandonAsked = 0;
  const lire = () => { calls += 1; const e = new Error('denied'); e.code = 'EACCES'; throw e; };
  await readSettingsThrough(lire, 'C:/x/settings.json', async () => {}, () => { abandonAsked += 1; return true; });
  assert.equal(calls, 1, 'EACCES must fail on the FIRST attempt, never be retried like ENOENT');
  assert.equal(abandonAsked, 0, 'a real error is reported immediately — the give-up question is only for ENOENT');
});

test('`giveUp` is checked BEFORE waiting, every attempt: it never sleeps once for nothing', async () => {
  let calls = 0;
  let signals = 0;
  const lire = () => { calls += 1; const e = new Error('gone'); e.code = 'ENOENT'; throw e; };
  const giveUp = () => calls >= 3;
  const nextSignal = async () => { signals += 1; };
  const result = await readSettingsThrough(lire, 'C:/x/settings.json', nextSignal, giveUp);
  assert.equal(result.raw, null);
  assert.equal(calls, 3);
  assert.equal(signals, 2, 'exactly one fewer signal than attempts — the 3rd failure gives up instead of waiting once more');
});

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

test('the PreCompact reset notWired is RED, and the verdict says injection stops after a compaction', () => {
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
  assert.deepEqual(OPTIONAL_GROUPS.map((g) => g.flag), ['--settings', '--codex-hooks', '--codex-config', '--deployed']);
  assert.equal(Object.isFrozen(OPTIONAL_GROUPS), true);
  assert.equal(Object.isFrozen(OPTIONAL_GROUPS[0]), true);
  assert.deepEqual(OPTIONAL_GROUPS.map((g) => g.missing), [
    'the installation (is any MCP server documented?) and the ENTIRE harness wiring: gate, '
      + 'PreCompact reset, session gate, write guard, turn counter, canary, frame coordinates, '
      + 'declared bandwidth, lane coherence',
    'the Codex wiring: its six channels, the anti-double-injection rule and the context ceiling',
    'the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)',
    'whether the code actually SERVING PRODUCTION matches this repository, file for file, '
      + 'under `src/`',
  ]);
});

test('a COMPLETE run says nothing: there is no gap to declare', () => {
  assert.deepEqual(reducedNotice({
    flagsGiven: ['--settings', '--codex-hooks', '--codex-config', '--deployed'],
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
    '   • `--deployed` not given ⇒ NOT MEASURED: whether the code actually SERVING PRODUCTION matches this repository, file for file, '
      + 'under `src/`',
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
  assert.equal(lines[5], '   ℹ no settings.json at /home/dev/.claude/settings.json — a clean clone and CI legitimately have none.');
  assert.equal(lines[6], '   🛑 "I could not measure" is never "it is healthy".');
  assert.equal(lines.length, 7);
});

test('an unknown conventional address is not guessed: the notice simply says nothing about it', () => {
  const lines = reducedNotice({ flagsGiven: [], ranCount: 14, settingsPath: null, settingsExists: false });
  assert.equal(lines.length, 6);
  assert.equal(lines[5], '   🛑 "I could not measure" is never "it is healthy".');
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
    '   • `--deployed` not given ⇒ NOT MEASURED: whether the code actually SERVING PRODUCTION matches this repository, file for file, '
      + 'under `src/`',
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
  assert.equal(lines[3], '   • `--deployed` not given ⇒ NOT MEASURED: whether the code actually SERVING PRODUCTION matches this repository, file for file, '
    + 'under `src/`');
  assert.equal(lines.length, 5);
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

// ═══════════════════════════════════════════════════════════════════════
// THE DECLARED ADDRESS MUST STILL EXIST ON THIS MACHINE — 2026-09-02
// ═══════════════════════════════════════════════════════════════════════
// 🔑 THE FAILURE THIS COVERS IS THE ONE THAT WILL ACTUALLY HAPPEN: the Windows
//    profile binds a DEDICATED adapter to leave `127.0.0.0/8`; the day that
//    adapter is removed — or its address reverts to an auto-assigned one — the
//    daemon cannot bind, the whole fleet loses its injection, and nothing says
//    WHY. ⚠️ The guard originally asked for ("redden if libuv changes its mind")
//    is NOT measurable here and was deliberately NOT written: no bench in this
//    repository reproduces the loss, so it would certify instead of protect.

test('the declared address PRESENT among this machine addresses is the healthy case', () => {
  const r = declaredHostPresence({
    host: '10.87.87.1',
    localAddresses: ['127.0.0.1', '10.87.87.1', '192.168.1.185'],
  });
  assert.equal(r.state, 'present');
  assert.equal(r.host, '10.87.87.1');
});

test('the declared address ABSENT is RED, and it NAMES what the machine does have', () => {
  // 🔑 The remediation is the point: a verdict that only says "wrong" sends the
  //    reader hunting for a list the judge already held.
  const r = declaredHostPresence({
    host: '10.87.87.1',
    localAddresses: ['127.0.0.1', '169.254.29.100'],
  });
  assert.equal(r.state, 'absent');
  assert.deepEqual(r.available, ['127.0.0.1', '169.254.29.100'],
    'The reader must see what IS there, or the refusal is a dead end.');
});

test('an EMPTY interface list is UNMEASURED, never absent — the anti-vacuity half', () => {
  // 🛑 An empty list is the shape a FAILED OBSERVATION takes. Answering `absent`
  //    there would accuse a perfectly healthy machine of a defect the shell
  //    simply could not see — and this repository's worst defect has never been
  //    a red judge, it is a judge that reports on nothing.
  for (const localAddresses of [[], undefined, null, 'not-a-list', 42]) {
    const r = declaredHostPresence({ host: '10.87.87.1', localAddresses });
    assert.equal(r.state, 'unmeasured',
      'No observation ⇒ no verdict. "I could not measure" is never "it is healthy".');
    assert.match(String(r.reason), /\S/, 'An unmeasured verdict MUST carry its reason.');
  }
});

test('a NAME is UNMEASURED: resolution is the resolver\'s business, never ours', () => {
  for (const host of ['localhost', 'my-host.local', 'ctxroute-box']) {
    const r = declaredHostPresence({ host, localAddresses: ['127.0.0.1'] });
    assert.equal(r.state, 'unmeasured');
    assert.match(String(r.reason), /NAME/i);
  }
});

test('an ABSENT declaration is UNMEASURED — there is nothing to compare', () => {
  for (const host of [undefined, null, '']) {
    assert.equal(declaredHostPresence({ host, localAddresses: ['127.0.0.1'] }).state,
      'unmeasured');
  }
  assert.equal(declaredHostPresence({}).state, 'unmeasured');
  assert.equal(declaredHostPresence().state, 'unmeasured');
});

test('an IPv6 ZONE INDEX is one address in two spellings, never a divergence', () => {
  // ⚠️ Same class as the 8.3 short name that made `steering-single-copy` accuse
  //    a healthy machine: comparing raw strings reports a difference that the
  //    operating system does not have.
  assert.equal(
    declaredHostPresence({ host: 'fe80::1', localAddresses: ['fe80::1%eth0'] }).state,
    'present');
  assert.equal(
    declaredHostPresence({ host: 'FE80::1', localAddresses: ['fe80::1'] }).state,
    'present', 'The comparison is case-insensitive.');
  assert.equal(normalizeAddress('FE80::1%Ethernet 3'), 'fe80::1');
});

test('the loopback default is PRESENT on any machine — no false red on a fresh install', () => {
  assert.equal(
    declaredHostPresence({ host: '127.0.0.1', localAddresses: ['127.0.0.1'] }).state,
    'present');
});

// ═══════════════════════════════════════════════════════════════════════
// DEPLOYED DRIFT — does the code SERVING PRODUCTION match this repository?
// ═══════════════════════════════════════════════════════════════════════

test('an EMPTY comparison is unmeasured, never "it matches" — anti-vacuity floor', () => {
  assert.deepEqual(deployedDriftVerdict([]), { state: 'unmeasured' });
});

test('a non-array is unmeasured too: a caller handing over garbage never reads as healthy', () => {
  assert.deepEqual(deployedDriftVerdict(undefined), { state: 'unmeasured' });
  assert.deepEqual(deployedDriftVerdict(null), { state: 'unmeasured' });
});

test('every hash equal ⇒ match, and the count is the number of files actually compared', () => {
  const entries = [
    { relPath: 'src/budget.js', repoHash: 'aaa', deployedHash: 'aaa' },
    { relPath: 'src/carryover-pure.js', repoHash: 'bbb', deployedHash: 'bbb' },
  ];
  assert.deepEqual(deployedDriftVerdict(entries), { state: 'match', count: 2 });
});

test('one mismatched hash ⇒ drift, and the drifted path is NAMED, never just counted', () => {
  const entries = [
    { relPath: 'src/budget.js', repoHash: 'aaa', deployedHash: 'aaa' },
    { relPath: 'src/gate.js', repoHash: 'ccc', deployedHash: 'DIFFERENT' },
  ];
  assert.deepEqual(deployedDriftVerdict(entries), { state: 'drift', count: 2, paths: ['src/gate.js'] });
});

test('a MISSING deployed file (deployedHash: null) is drift, never silence', () => {
  // 🛑 `null` can never equal a real hex hash, so absence on the deployed side is compared like
  //    any other mismatch — never given a free pass because there was "nothing to compare".
  const entries = [{ relPath: 'src/lock.js', repoHash: 'aaa', deployedHash: null }];
  assert.deepEqual(deployedDriftVerdict(entries), { state: 'drift', count: 1, paths: ['src/lock.js'] });
});

test('several drifted paths are ALL named, in the order they were compared', () => {
  const entries = [
    { relPath: 'a.js', repoHash: '1', deployedHash: '1' },
    { relPath: 'b.js', repoHash: '2', deployedHash: 'X' },
    { relPath: 'c.js', repoHash: '3', deployedHash: 'X' },
  ];
  assert.deepEqual(deployedDriftVerdict(entries), { state: 'drift', count: 3, paths: ['b.js', 'c.js'] });
});

// ── `--deployed` argument parsing — same shape as `configPathArgument`, own flag, own message.

test('no --deployed on the command line ⇒ undefined, never a refusal (the flag is OPTIONAL)', () => {
  assert.equal(deployedArgument({ argv: ['node', 'doctor.js'], isAbsolute: () => true }), undefined);
});

test('a non-array argv ⇒ undefined: the shell owns argv, this module never assumes its shape', () => {
  assert.equal(deployedArgument({ argv: undefined, isAbsolute: () => true }), undefined);
});

test('a well-formed --deployed with an absolute path is accepted verbatim', () => {
  assert.equal(
    deployedArgument({ argv: ['--deployed', 'C:/deploy/ctxroute-release'], isAbsolute: (p) => p.startsWith('C:/') }),
    'C:/deploy/ctxroute-release');
});

test('a RELATIVE path is a NAMED REFUSAL, never a silent skip', () => {
  assert.throws(
    () => deployedArgument({ argv: ['--deployed', 'some/relative/path'], isAbsolute: () => false }),
    /ctxroute REFUSED: the launch argument "--deployed" is a RELATIVE path — received "some\/relative\/path"/);
});

test('--deployed with NO value at all is a NAMED REFUSAL, never today\'s default silently kept', () => {
  assert.throws(
    () => deployedArgument({ argv: ['--deployed'], isAbsolute: () => true }),
    /ctxroute REFUSED: the launch argument "--deployed" is followed by no address at all — received undefined/);
});

test('--deployed followed by another FLAG is a NAMED REFUSAL, never a false address', () => {
  assert.throws(
    () => deployedArgument({ argv: ['--deployed', '--quiet'], isAbsolute: () => true }),
    /followed by another FLAG instead of an address/);
});

test('--deployed declared MORE THAN ONCE is a NAMED REFUSAL: two spellings, two truths', () => {
  assert.throws(
    () => deployedArgument({
      argv: ['--deployed', '/a', '--deployed', '/b'],
      isAbsolute: () => true,
    }),
    /declared MORE THAN ONCE/);
});

test('an empty-string address is refused exactly like a missing one', () => {
  assert.throws(
    () => deployedArgument({ argv: ['--deployed', ''], isAbsolute: () => true }),
    /followed by no address at all/);
});

// ── THE MOMENT AFTER THE TOOL ANSWERED (2026-09-23): the same gate on PostToolUse, ITS bandwidth ──
// ⚠️ Shape copied from what `tools/wiring-generate.js` writes: the action's frames on PreToolUse, the
//    after frames on PostToolUse beside the write guard, each with its own `--frames` total.
function afterSettings(afterCommands, extraAction) {
  const settings = commandSettings(healthyCommands().concat(extraAction || []));
  settings.hooks.PostToolUse = [{ hooks: afterCommands.map((c) => ({ type: 'command', command: c })) }];
  return settings;
}
const AFTER_SUFFIX = ' (after the tool answered)';
const after2 = () => [
  'node /r/src/hooks/doc-inject.js --client --frame 1 --frames 2',
  'node /r/src/hooks/doc-inject.js --client --frame 2 --frames 2',
];

test('AFTER: a wiring with both moments is judged moment by moment — no false "divergent --frames"', () => {
  const settings = afterSettings([
    'node /r/src/hooks/doc-inject.js --client --frame 1 --frames 1',
  ]);
  const findings = wiringFindings({ settings, wantedFrames: 2, wantedAfterFrames: 1, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools' });
  assert.equal(checkNamed(findings, 'every gate declaration announces the SAME number of frames').ok, true, 'the action alone is judged under its historical name');
  assert.equal(checkNamed(findings, 'the wiring honours the declared bandwidth (frames: 2)').ok, true);
  assert.equal(checkNamed(findings, 'every gate declaration announces the SAME number of frames' + AFTER_SUFFIX).ok, true);
  assert.equal(checkNamed(findings, 'the wiring honours the declared bandwidth (afterFrames: 1)').ok, true);
  assert.equal(checkNamed(findings, 'the frame indices cover 1..N, with no gap and no duplicate' + AFTER_SUFFIX).ok, true);
});

test('AFTER: a missing after frame, a divergent total and an undeclared-but-wired bandwidth are each RED', () => {
  const judge = (afterCommands, wantedAfterFrames) => wiringFindings({
    settings: afterSettings(afterCommands), wantedFrames: 2, wantedAfterFrames, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools',
  });
  // One of the two declared after frames is missing: its content never leaves this moment.
  assert.equal(checkNamed(judge([after2()[0]], 2), 'there are exactly as many declarations as announced frames' + AFTER_SUFFIX).ok, false);
  // Two totals on one moment: the frames would not re-assemble.
  assert.equal(checkNamed(judge([after2()[0], 'node /r/src/hooks/doc-inject.js --client --frame 2 --frames 3'], 2),
    'every gate declaration announces the SAME number of frames' + AFTER_SUFFIX).ok, false);
  // The config declares a bandwidth the wiring does not honour.
  assert.equal(checkNamed(judge(after2(), 3), 'the wiring honours the declared bandwidth (afterFrames: 3)').ok, false);
  // Declared and not wired at all is judged too — the capacity is ZERO, not what the config says —
  // and it is said as THAT fact, never as a "divergent --frames" nobody wired.
  const notWired = judge([], 2);
  const zero = checkNamed(notWired, 'the wiring honours the declared bandwidth (afterFrames: 2)');
  assert.equal(zero.ok, false);
  assert.match(zero.detail, /wires NONE/);
  assert.match(zero.detail, /wiring-generate/);
  assert.equal(notWired.some((f) => f.kind === 'check' && f.name.endsWith(AFTER_SUFFIX)), false, 'no coherence check runs on an empty set');
});

test('AFTER: wired but with NO declared bandwidth, the after frames are STILL judged for coherence', () => {
  const findings = wiringFindings({
    settings: afterSettings([after2()[0]]), wantedFrames: 2, wantedAfterFrames: null, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools',
  });
  // One of two declared after frames is missing: that silence must be named even with no config key.
  assert.equal(checkNamed(findings, 'there are exactly as many declarations as announced frames' + AFTER_SUFFIX).ok, false);
  assert.equal(findings.some((f) => f.kind === 'check' && /afterFrames/.test(f.name)), false, 'no bandwidth declared, no bandwidth check');
});

// ── Pre-existing survivors of the address check and of the deployed refusal (killed 2026-09-23) ──
test('normalizeAddress: an absent address is EMPTY, never the word "undefined" or "null"', () => {
  assert.equal(normalizeAddress(undefined), '');
  assert.equal(normalizeAddress(null), '');
  assert.equal(normalizeAddress('FE80::1%eth0'), 'fe80::1');
});
test('declaredHostPresence: nothing declared and nothing readable are named for what they are', () => {
  assert.deepEqual(declaredHostPresence({}), { state: 'unmeasured', host: '', reason: 'no address was declared to compare' });
  // Unreadable entries are dropped: an interface list of blanks is a FAILED observation, never "absent".
  const blanks = declaredHostPresence({ host: '10.0.0.1', localAddresses: [null, undefined, ''] });
  assert.equal(blanks.state, 'unmeasured');
  assert.equal(blanks.reason, 'no local address could be read from this machine');
  // Blanks beside a real address never appear among what the machine "has".
  assert.deepEqual(declaredHostPresence({ host: '10.0.0.1', localAddresses: [null, '127.0.0.1', ''] }).available, ['127.0.0.1']);
});
test('deployedArgument: the refusal says WHAT is wrong, WHY it matters, and HOW to get out', () => {
  let message = '';
  try { deployedArgument({ argv: ['--deployed', 'rel/path'], isAbsolute: () => false }); } catch (e) { message = e.message; }
  assert.match(message, /ONE ABSOLUTE path to the directory serving production/);
  assert.match(message, /working directory this doctor does not control/);
  assert.match(message, /silently compare against two different copies/);
  assert.match(message, /looking measured/);
  assert.match(message, /unmeasured drift is NAMED/);
});

test('AFTER: a machine that never wired nor declared the moment after the answer is not accused of it', () => {
  const findings = findingsOf(healthyCommands());
  assert.equal(findings.some((f) => f.kind === 'check' && f.name.endsWith(AFTER_SUFFIX)), false);
  assert.equal(findings.some((f) => f.kind === 'check' && /afterFrames/.test(f.name)), false);
});

test('AFTER: the after frames are file-checked like the action frames (a copy of ANOTHER repo is named)', () => {
  const findings = wiringFindings({
    settings: afterSettings(['node /elsewhere/src/hooks/doc-inject.js --client --frame 1 --frames 1']),
    wantedFrames: 2, wantedAfterFrames: 1, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools',
  });
  assert.ok(fileEntries(findings).some((f) => f.file === '/elsewhere/src/hooks/doc-inject.js'));
});

// ── The Codex wiring is ALSO judged for the moment after the tool answered (2026-09-23) ──
// 🔴 The Codex check asked "is codex-doc-inject.js wired?" ANYWHERE. Once the same script also serves
//    PostToolUse, dropping ONLY that block left the answer "yes" and every `response` doc stopped
//    reaching Codex in silence. The fixtures COPY the shape of the real managed `requirements.toml`
//    (array-of-tables per event, `command = '…'`) and of `hooks.json`, with generic paths.
const TOML_BOTH = [
  '[[hooks.PreToolUse]]', 'matcher = "*"', '[[hooks.PreToolUse.hooks]]', 'type = "command"',
  "command = 'node /repo/src/hooks/codex-doc-inject.js --budget 0'",
  '[[hooks.PostToolUse]]', 'matcher = "*"', '[[hooks.PostToolUse.hooks]]', 'type = "command"',
  "command = 'node /repo/src/hooks/codex-doc-write-guard.js'",
  '[[hooks.PostToolUse.hooks]]', 'type = "command"',
  "command = 'node /repo/src/hooks/codex-doc-inject.js --budget 0'",
  '[[hooks.SessionStart]]', '[[hooks.SessionStart.hooks]]', 'type = "command"',
  "command = 'node /repo/src/hooks/session-inject.js --budget 0'",
].join('\n');
// The same file with ONLY the after-answer block dropped: the exact regression this judge exists for.
const TOML_BEFORE_ONLY = TOML_BOTH.replace(
  "[[hooks.PostToolUse.hooks]]\ntype = \"command\"\ncommand = 'node /repo/src/hooks/codex-doc-inject.js --budget 0'\n", '');

test('hookEventsOf: each event section is read apart, in the TOML the managed file uses', () => {
  assert.notEqual(TOML_BEFORE_ONLY, TOML_BOTH, 'anti-vacuity: the fixture edit must have taken');
  assert.deepEqual(hookEventsOf(TOML_BOTH, 'codex-doc-inject.js'), ['PostToolUse', 'PreToolUse']);
  assert.deepEqual(hookEventsOf(TOML_BEFORE_ONLY, 'codex-doc-inject.js'), ['PreToolUse']);
  assert.deepEqual(hookEventsOf(TOML_BOTH, 'codex-doc-write-guard.js'), ['PostToolUse']);
  assert.deepEqual(hookEventsOf(TOML_BOTH, 'session-inject.js'), ['SessionStart']);
  assert.deepEqual(hookEventsOf(TOML_BOTH, 'absent.js'), []);
  assert.deepEqual(hookEventsOf('', 'codex-doc-inject.js'), []);
});

test('hookEventsOf: the JSON form (hooks.json) is read the same way, and a lowercase key is never a section', () => {
  const json = JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /r/codex-doc-inject.js' }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /r/codex-doc-write-guard.js' }] }],
  } }, null, 2);
  assert.deepEqual(hookEventsOf(json, 'codex-doc-inject.js'), ['PreToolUse']);
  assert.deepEqual(hookEventsOf(json, 'codex-doc-write-guard.js'), ['PostToolUse']);
});

test('hookEventsOf: an event nobody listed still opens its own section (shape, never a list)', () => {
  const raw = "[[hooks.PreToolUse.hooks]]\ncommand = 'a.js'\n[[hooks.SomeFutureEvent.hooks]]\ncommand = 'b.js'\n";
  assert.deepEqual(hookEventsOf(raw, 'b.js'), ['SomeFutureEvent'], 'b.js must NOT be filed under PreToolUse');
  assert.deepEqual(hookEventsOf(raw, 'a.js'), ['PreToolUse']);
});

test('codexAfterFinding: declared and wired ⇒ ok · declared, only the before block ⇒ NAMED red · undeclared ⇒ no opinion', () => {
  const ok = codexAfterFinding(TOML_BOTH, 'codex-doc-inject.js', 2);
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, 'check');
  assert.equal(ok.name, 'the CODEX shell (codex-doc-inject.js) is ALSO wired after the tool answered (PostToolUse)');

  const red = codexAfterFinding(TOML_BEFORE_ONLY, 'codex-doc-inject.js', 2);
  assert.equal(red.ok, false, 'the dropped after-answer block must be seen RED');
  assert.equal(red.detail, 'ctxroute-config.json asks for afterFrames: 2, the Codex wiring names codex-doc-inject.js '
    + 'under no PostToolUse section: every doc waiting for an answer (`response`) never reaches Codex.');

  assert.equal(codexAfterFinding(TOML_BEFORE_ONLY, 'codex-doc-inject.js', null), null,
    'a config that never asked for the moment is never blamed for its absence');
});

// ── SWITCHED OFF BUT STILL WIRED (2026-09-23): `afterFrames` absent or 0 means OFF ─────────────
test('AFTER: switched off (no afterFrames) yet still wired ⇒ NAMED red, and the frames are still judged', () => {
  const findings = wiringFindings({
    settings: afterSettings(after2()), wantedFrames: 2, wantedAfterFrames: null, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools',
  });
  const off = checkNamed(findings, 'the moment after the tool answered is wired only when switched on');
  assert.equal(off.ok, false);
  assert.equal(off.detail, 'settings.json wires 2 declaration(s) after the tool answered while ctxroute-config.json '
    + 'switches that moment OFF (afterFrames absent or 0): every tool call still pays them. Regenerate the wiring '
    + '(tools/wiring-generate.js).');
  assert.equal(checkNamed(findings, 'there are exactly as many declarations as announced frames' + AFTER_SUFFIX).ok, true,
    'the coherence rules still run on what is wired');
});

test('AFTER: switched off and NOT wired ⇒ no finding about that moment at all', () => {
  const findings = findingsOf(healthyCommands());
  assert.equal(findings.some((f) => f.kind === 'check' && f.name === 'the moment after the tool answered is wired only when switched on'), false);
});

test('AFTER: switched on and wired ⇒ the off-check never fires', () => {
  const findings = wiringFindings({
    settings: afterSettings(after2()), wantedFrames: 2, wantedAfterFrames: 2, laneFlag: '--client', consumers: ['doc-inject.js'], repoDir: '/r/tools',
  });
  assert.equal(findings.some((f) => f.kind === 'check' && f.name === 'the moment after the tool answered is wired only when switched on'), false);
});
