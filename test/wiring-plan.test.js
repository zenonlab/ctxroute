// ═══════════════════════════════════════════════════════════════════════
// wiring-plan.js — the DECISION, exercised IN PROCESS
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS SUITE EXISTS BESIDE `wiring-drift-gate.test.js`, WHICH ALREADY
//    COVERS THE SAME MODULE. The gate proves the real thing by SPAWNING the
//    generator — and a spawned child runs UNINSTRUMENTED code, so every
//    Stryker mutant of this module would SURVIVE there while looking covered.
//    Mutation needs the decision called in process. Two suites, two jobs: the
//    gate proves the wiring, this one proves the logic.
//
// ⚠️ EVERY EXPECTATION IS WRITTEN LITERALLY, never derived from the module's
//    own constants — a test that reads the value it checks is mutated together
//    with the code and can no longer see the mutant.
//
// ⚠️ perTest: every fixture is built INSIDE the test callback. A module-level
//    constant is evaluated once, before instrumentation, and yields false
//    survivors (42 of them measured in this repository on 2026-07-16).

import { test, expect } from 'vitest';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { plan, byBlock } = require_('../src/wiring-plan');

/** Machine facts, as the shell measures them. A thunk, never a shared object. */
const machine = (over = {}) => ({
  root: 'C:/fixture/ctxroute',
  frames: 3,
  laneFlag: '--client',
  stateConsumers: ['ctxroute-reset.js', 'doc-inject.js'],
  settingsPath: 'C:/fixture/settings.json',
  ...over,
});

const manifest = (over = {}) => ({
  stateLane: 'client',
  consumers: [
    { module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', framed: true },
    { module: 'src/hooks/ctxroute-reset.js', event: 'PreCompact', matcher: null, timeout: 5 },
    { module: 'tools/doctor.js', event: 'SessionStart', matcher: null, args: ['--quiet', '--settings', '{settings}'], timeout: 15 },
  ],
  ...over,
});

test('a framed consumer is repeated once per frame, each copy carrying its own coordinates', () => {
  const out = plan(manifest(), machine());
  const gate = out.filter((d) => d.command.includes('doc-inject.js'));
  assert.deepStrictEqual(gate.map((d) => d.command), [
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 3',
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 3',
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 3 --frames 3',
  ], 'A missing index is a frame that never leaves the gesture; a duplicated one is content delivered twice. Both are silent.');
  assert.strictEqual(out.length, 5, 'Three frames plus two unframed consumers is five declarations.');
});

test('the lane reaches EVERY derived state consumer, and only those', () => {
  const out = plan(manifest(), machine());
  const withLane = out.filter((d) => d.command.includes(' --client')).map((d) => d.command);
  assert.strictEqual(withLane.length, 4, 'Three gate frames and the reset consume the shared state; the doctor does not.');
  assert.ok(out.some((d) => d.command === 'node C:/fixture/ctxroute/src/hooks/ctxroute-reset.js --client'),
    'The PreCompact reset lost its lane. That is the 2026-08-22 production defect: the gate would record deliveries in one memory while the reset erased another.');
  assert.ok(!out.some((d) => d.command.includes('doctor.js --client')),
    'The lane was applied to a shell that is not a state consumer. The derived set, not a hand-written list, decides.');
});

test('`stateLane: "files"` removes the lane from ALL of them, in one pass', () => {
  const out = plan(manifest({ stateLane: 'files' }), machine());
  assert.deepStrictEqual(out.filter((d) => d.command.includes('--client')), [],
    'The lane survived a manifest that declares the file lane. It must be applied in ONE pass or not at all — that is what makes "written on sixteen, forgotten on three" unbuildable.');
});

test('`{settings}` is substituted, argument order is lane then args then coordinates', () => {
  const out = plan(manifest(), machine());
  assert.ok(out.some((d) => d.command === 'node C:/fixture/ctxroute/tools/doctor.js --quiet --settings C:/fixture/settings.json'),
    'The settings placeholder did not expand: the doctor would audit a file nobody executes.');
  const first = plan(manifest({
    consumers: [{ module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', args: ['--budget', '7661'], framed: true }],
  }), machine({ frames: 1 }));
  assert.strictEqual(first[0].command,
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --budget 7661 --frame 1 --frames 1',
    'Argument order is a CONTRACT: lane, then the manifest arguments, then the frame coordinates. A reordering is a different command line.');
});

test('a timeout is carried only when declared', () => {
  const out = plan(manifest(), machine());
  const gate = out.find((d) => d.command.includes('doc-inject.js'));
  const reset = out.find((d) => d.command.includes('ctxroute-reset.js'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(gate, 'timeout'), false,
    'A timeout appeared on a declaration that declares none: the generated wiring would differ from what the operator wrote.');
  assert.strictEqual(reset.timeout, 5, 'The declared timeout must reach the wiring unchanged.');
});

test('declarations group by (event, matcher) block, order preserved inside a block', () => {
  const groups = byBlock(plan(manifest(), machine()));
  // The separator is NUL — the one character neither an event name nor a
  // matcher regex can contain, so two different pairs cannot collapse into one.
  assert.deepStrictEqual([...groups.keys()].sort(), ['PreCompact\u0000', 'PreToolUse\u0000*', 'SessionStart\u0000'],
    'A block key is the event and its matcher: settings.json interleaves foreign hooks, so the comparison is per block or it is not a comparison.');
  assert.strictEqual(groups.get('PreToolUse\u0000*').length, 3, 'The three frames belong to one block.');
});

test('every malformed manifest is a NAMED refusal, never a silently shorter wiring', () => {
  expect(() => plan(manifest({ consumers: [] }), machine())).toThrow(/`consumers` is empty/);
  expect(() => plan(manifest({ consumers: undefined }), machine())).toThrow(/`consumers` is empty/);
  expect(() => plan(manifest({ stateLane: 'daemon' }), machine())).toThrow(/`stateLane` must be one of/);
  expect(() => plan(null, machine())).toThrow(/unreadable manifest/);
  expect(() => plan(manifest({
    consumers: [{ module: 'C:/elsewhere/hook.js', event: 'PreCompact' }],
  }), machine())).toThrow(/REPO-RELATIVE/);
  expect(() => plan(manifest({
    consumers: [{ module: 'src\\hooks\\doc-inject.js', event: 'PreCompact' }],
  }), machine())).toThrow(/POSIX/);
  expect(() => plan(manifest({
    consumers: [{ module: '../outside/hook.js', event: 'PreCompact' }],
  }), machine())).toThrow(/climbs out of the repository/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'Compaction' }],
  }), machine())).toThrow(/unknown event/);
  expect(() => plan(manifest({
    consumers: [
      { module: 'tools/doctor.js', event: 'SessionStart' },
      { module: 'tools/doctor.js', event: 'SessionStart' },
    ],
  }), machine())).toThrow(/declared twice/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', matcher: '' }],
  }), machine())).toThrow(/`matcher` is a non-empty string or null/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', timeout: 0 }],
  }), machine())).toThrow(/`timeout` is an integer/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', args: ['--quiet', 7] }],
  }), machine())).toThrow(/`args` is a list of non-empty strings/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', framed: 'yes' }],
  }), machine())).toThrow(/`framed` is a boolean/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', args: ['{home}'] }],
  }), machine())).toThrow(/unknown placeholder/);
  expect(() => plan(manifest({ consumers: ['tools/doctor.js'] }), machine())).toThrow(/not an object/);
});

test('every missing machine fact is a NAMED refusal — a guessed one wires the wrong code', () => {
  expect(() => plan(manifest(), machine({ root: '' }))).toThrow(/no repository root supplied/);
  expect(() => plan(manifest(), machine({ frames: 0 }))).toThrow(/`frames` must be an integer >= 1/);
  expect(() => plan(manifest(), machine({ frames: 2.5 }))).toThrow(/`frames` must be an integer >= 1/);
  expect(() => plan(manifest(), machine({ laneFlag: '' }))).toThrow(/lane flag could not be read/);
  expect(() => plan(manifest(), machine({ stateConsumers: null }))).toThrow(/state-consumer set was not derived/);
  expect(() => plan(manifest(), machine({ settingsPath: '' }))).toThrow(/no settings path supplied/);
  expect(() => plan(manifest(), undefined)).toThrow(/no repository root supplied/);
});
