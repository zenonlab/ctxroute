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

// 🛑 STATIC ESM IMPORT, AND IT IS WHAT MAKES THE MUTATION SCORE EXIST AT ALL.
//    Stryker's `vitest.related` resolves the tests covering a mutant through the
//    ESM MODULE GRAPH; a `createRequire` edge is invisible to it. MEASURED
//    2026-08-22: reached only through `createRequire`, this module produced
//    "Vitest failed to find test files related to mutated files" then "No tests
//    were found" — **601 mutants, ZERO test executed**, on a file listed in
//    `mutate` and therefore believed covered. Same defect already paid on
//    `corpus-cache.js`. A suite that runs green in vitest proves nothing about
//    what Stryker can see: the two read the graph differently.
import {
  plan, byBlock, splice, gateBound, gateTransport, gateFrames, framesMissingBound, frameCoordinates,
  boundCeiling, mentionsSegment,
} from '../src/wiring-plan.js';

/** Machine facts, as the shell measures them. A thunk, never a shared object. */
const machine = (over = {}) => ({
  root: 'C:/fixture/ctxroute',
  frames: 3,
  // The daemon's listening ADDRESS is a MACHINE fact since 2026-08-25, read
  // WHOLE from `ctxroute-config.json` by the SAME resolution the daemon binds
  // with — never re-typed in a manifest, where each half agreed with the
  // listener only by luck.
  host: '127.0.0.1',
  port: 8787,
  // The GATE's ROUTE is a MACHINE fact too since 2026-08-25, read from the one
  // module that owns every route of this protocol — never re-typed in a
  // manifest, where a misspelling would not even 404: the daemon serves the
  // gate route for anything it does not recognise.
  routePath: '/pretool',
  laneFlag: '--client',
  stateConsumers: ['ctxroute-reset.js', 'doc-inject.js'],
  settingsPath: 'C:/fixture/settings.json',
  ...over,
});

const manifest = (over = {}) => ({
  stateLane: 'client',
  bounds: { gateHookTimeoutSeconds: 7 },
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

// ═══════════════════════════════════════════════════════════════════════
// THE TRANSPORT — ONE FACT, TWO WRITINGS
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE HOLE THIS CLOSES, MEASURED ON 2026-08-22: the live wiring carried the
//    gate as sixteen `type:"http"` declarations while the manifest could only
//    ever produce `command`. The generator was therefore INCAPABLE of writing
//    the configuration that actually runs — so the whole chain, drift gate
//    included, was inert exactly where it was supposed to serve.
// ⚠️ THE COORDINATES ARE ONE FACT: `--frame k --frames N` and `?frame=k&frames=N`
//    are two WRITINGS of it, never two facts. The cells below assert both
//    forms LITERALLY, so a module that recomputed the pair per branch shows up.

test('`kind: "http"` turns each frame into a POST, coordinates in the query, bound from the manifest', () => {
  const out = plan(manifest({
    transport: { kind: 'http' },
  }), machine());
  const gate = out.filter((d) => d.type === 'http');
  assert.deepStrictEqual(gate, [
    { event: 'PreToolUse', matcher: '*', type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=1&frames=3', timeout: 7, statusMessage: 'ctxroute' },
    { event: 'PreToolUse', matcher: '*', type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=2&frames=3', timeout: 7, statusMessage: 'ctxroute' },
    { event: 'PreToolUse', matcher: '*', type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=3&frames=3', timeout: 7, statusMessage: 'ctxroute' },
  ], 'The generated http declarations are not the ones the harness executes. A generator that cannot write the live wiring leaves the whole chain inert exactly where it was meant to serve.');

  // The peers stay on the spawn lane, carrying the lane argument: the daemon is
  // the authority for the gate, and that asymmetry is the coherence the doctor
  // checks. A transport must not silently unwire the other consumers.
  assert.ok(out.some((d) => d.command === 'node C:/fixture/ctxroute/src/hooks/ctxroute-reset.js --client'),
    'Declaring the gate\'s transport changed the PreCompact reset. The transport carries the GATE\'s lane, not the whole wiring.');
  assert.strictEqual(out.length, 5, 'Three frames plus two unframed consumers is five declarations, whatever carries them.');
});

test('the frame coordinates are ONE fact: both writings are read by the SAME reader', () => {
  const spawned = plan(manifest(), machine());
  const posted = plan(manifest({
    transport: { kind: 'http' },
  }), machine());

  assert.deepStrictEqual(gateFrames(spawned).map(frameCoordinates), [
    { index: 1, total: 3 }, { index: 2, total: 3 }, { index: 3, total: 3 },
  ], 'The coordinates written in argv are not read back. A judge that cannot read them cannot see a missing frame either.');
  assert.deepStrictEqual(gateFrames(posted).map(frameCoordinates), [
    { index: 1, total: 3 }, { index: 2, total: 3 }, { index: 3, total: 3 },
  ], 'The coordinates written in the query are not read back — so on this transport the gate declarations are invisible and every check on them is true of the empty set.');

  // An unframed declaration carries no coordinates, on either transport: the
  // reader must not turn the doctor or the reset into a frame.
  assert.deepStrictEqual(frameCoordinates({ command: 'node C:/fixture/ctxroute/tools/doctor.js --quiet' }), null);
  assert.deepStrictEqual(frameCoordinates({ url: 'http://127.0.0.1:8787/pretool' }), null);
  // Half the pair is not the pair: a total with no index says nothing about WHICH frame this is.
  assert.deepStrictEqual(frameCoordinates({ url: 'http://127.0.0.1:8787/pretool?frames=16' }), null);
  assert.deepStrictEqual(frameCoordinates({ command: 'node x.js --frames 16' }), null);
  assert.deepStrictEqual(frameCoordinates(null), null);
  assert.deepStrictEqual(frameCoordinates({ type: 'http' }), null);
});

test('an unknown transport is a NAMED refusal, and an absent one is `command`, unchanged', () => {
  // 🛑 THE SILENT SHAPE FORBIDDEN HERE: an unknown `kind` quietly wired as a
  //    spawn. On a harness with no handler for what was declared, such a
  //    declaration runs NOTHING — no error, no log, no injection.
  expect(() => plan(manifest({ transport: { kind: 'grpc' } }), machine()))
    .toThrow(/`transport.kind` must be one of command \| http/);
  expect(() => plan(manifest({ transport: { path: '/pretool' } }), machine()))
    .toThrow(/`transport.kind` must be one of/);
  expect(() => plan(manifest({ transport: 'http' }), machine())).toThrow(/`transport` is an object/);
  expect(() => plan(manifest({ transport: [] }), machine())).toThrow(/`transport` is an object/);
  expect(() => gateTransport(null)).toThrow(/unreadable manifest/);

  // An ABSENT transport is the command form, to the character: that is what
  // keeps the differentials green and makes a rollback a deleted key.
  assert.deepStrictEqual(gateTransport({}), { kind: 'command' });
  assert.deepStrictEqual(
    plan(manifest({ transport: { kind: 'command' } }), machine()),
    plan(manifest(), machine()),
    'Declaring `kind: "command"` produced something other than the untouched form. The default and the explicit spelling are the same wiring, or a rollback is a rewrite.',
  );
});

test('the gate ROUTE is a machine fact, and re-declaring an endpoint in the manifest is a NAMED refusal', () => {
  const at = (over) => () => plan(manifest({ transport: { kind: 'http' } }), machine(over));
  expect(at({ routePath: undefined })).toThrow(/the gate's route must start with `\/`, got undefined/);
  expect(at({ routePath: 'pretool' })).toThrow(/must start with `\/`, got "pretool"/);
  expect(at({ routePath: 42 })).toThrow(/must start with `\/`, got 42/);
  // The query is OURS: it carries the coordinates. A route bringing its own
  // would put two `?` in one URL — coordinates nobody can read back.
  expect(at({ routePath: '/pretool?x=1' })).toThrow(/must carry no query and no fragment/);
  expect(at({ routePath: '/pretool#f' })).toThrow(/must carry no query and no fragment/);

  // ⚠️ AND THE COMMAND LANE NAMES NO ROUTE AT ALL: demanding one of it would
  //    refuse a wiring that POSTs nowhere.
  assert.strictEqual(plan(manifest(), machine({ routePath: undefined })).length, 5,
    'A spawn wiring was refused for a route it never uses. The refusal must bite on the http transport and on nothing else.');

  // 🛑 NEITHER THE ADDRESS NOR THE ROUTE IS THE MANIFEST'S TO NAME, and a
  //    re-declared one is REFUSED rather than ignored: a key read by NOBODY is
  //    a truth its author believes they moved while the URL keeps another
  //    value — the divergence this manifest exists to remove, rebuilt inside it.
  for (const dead of [{ path: '/pretool' }, { host: 'elsewhere.invalid' }, { port: 9999 }]) {
    expect(() => gateTransport({ transport: { kind: 'http', ...dead } }))
      .toThrow(/the ADDRESS and the ROUTE are not the wiring's to name/);
  }
  assert.deepStrictEqual(
    gateTransport({ transport: { kind: 'http', statusMessage: 'ctxroute' } }),
    { kind: 'http', statusMessage: 'ctxroute' },
    'The http transport must come back carrying its kind and its declared status line, and nothing else.',
  );
});

// 🛑 THE ADDRESS/ROUTE VALIDATION EARLIER ONLY CHECKS THE FIRST LINE OF EACH
//    REFUSAL. THE KEY NAME AND THE FILE IT LIVES IN ARE PART OF THE MESSAGE
//    TOO — a refusal that stops naming WHERE to write the value sends the
//    operator hunting through `ctxroute-config.json` and `wiring.json` both.
test('the address and route refusals name where each value is DECLARED, literally', () => {
  expect(() => plan(manifest({ transport: { kind: 'http' } }), machine({ host: undefined })))
    .toThrow('it is DECLARED ONCE (`http.host` in ctxroute-config.json) and read by BOTH the daemon that binds it and this generator, so no manifest ever re-types it');
  expect(() => plan(manifest({ transport: { kind: 'http' } }), machine({ port: undefined })))
    .toThrow('it is DECLARED ONCE (`http.port` in ctxroute-config.json) and read by BOTH the daemon that binds it and this generator, so no manifest ever re-types it');
  expect(() => plan(manifest({ transport: { kind: 'http' } }), machine({ routePath: undefined })))
    .toThrow('it is DECLARED ONCE (`src/protocol-routes-pure.js`) and read by BOTH the daemon that serves it and this generator, so no manifest ever re-types it');
});

// 🛑 THE COMMAND TRANSPORT NAMES NO ROUTE AT ALL — the query/fragment refusal
//    a few lines above belongs to the http lane alone. A spawn wiring must not
//    inspect a `routePath` it never sends, however it is spelled.
test('the command transport ignores a routePath it never uses, even a malformed one', () => {
  assert.strictEqual(plan(manifest(), machine({ routePath: '/pretool?x=1#f' })).length, 5,
    'A spawn wiring was refused for a route it never sends: the query/fragment refusal must bite the http transport and nothing else.');
});

// 🛑 `t.kind === 'command'` IS THE ONLY BRANCH THAT SKIPS THE UNKNOWN-KEY
//    REFUSAL BELOW IT — that refusal exists for the http shape (address/route
//    re-declared), never for the command shape, which never had one to begin
//    with. An extra key on a `command` transport must be silently accepted.
test('a `command` transport with an unrelated extra key is accepted, unlike `http`', () => {
  assert.deepStrictEqual(gateTransport({ transport: { kind: 'command', extra: 'x' } }), { kind: 'command' },
    'An unknown key on the command transport was refused: that check belongs to the http shape, which alone re-declares an address or a route.');
});

// ═══════════════════════════════════════════════════════════════════════
// mentionsSegment — the boundary the splice's suspect check is built on
// ═══════════════════════════════════════════════════════════════════════
test('mentionsSegment: an empty needle names nothing and never matches', () => {
  // The needle is `tokenOf(root)`, which is '' only if `root` ends with a
  // slash — a malformed machine fact the splice does not otherwise refuse.
  // Without this guard an empty needle matches at position 0 of ANY text,
  // turning every foreign hook of a settings.json into a suspect.
  assert.strictEqual(mentionsSegment('anything at all', ''), false,
    'An empty needle matched. Every foreign hook in the file becomes a suspect the moment the token cannot be derived.');
});

test('mentionsSegment: a needle occupying the very end of the text still counts as a boundary', () => {
  // The splice's only caller (`JSON.stringify(entry)`) always ends in `}`, so
  // this exact case never reaches the function through it — proven here
  // directly, on the function's own contract, rather than left unreachable.
  assert.strictEqual(mentionsSegment('prefix-ctxroute', 'ctxroute'), true,
    'A needle ending exactly at the text\'s last character was not recognised as a boundary match.');
  assert.strictEqual(mentionsSegment('prefix-ctxroute2', 'ctxroute'), false,
    'A needle immediately followed by another identifier character was wrongly counted as a boundary match.');
});

// ════════════════════════════════════════════════════════════════════════
// THE DAEMON'S ADDRESS — A MACHINE FACT, REFUSED WHEN IT IS NOT ONE
// ════════════════════════════════════════════════════════════════════════
test("the daemon's address reaches the plan as a MACHINE fact, and a bad half is a NAMED refusal", () => {
  const http = { kind: 'http' };
  const at = (over) => () => plan(manifest({ transport: http }), machine(over));
  // 🛑 THE ENGINE NEVER TRUSTS ITS INPUT: `httpEndpoint()` already refuses
  //    nonsense, and this refuses it again — a wiring one number, or one name,
  //    away from the listener loses every frame of every action, in silence.
  expect(at({ port: undefined })).toThrow(/the daemon's port must be an integer in 1\.\.65535, got undefined/);
  expect(at({ port: 0 })).toThrow(/got 0/);
  expect(at({ port: 65536 })).toThrow(/got 65536/);
  expect(at({ port: 87.5 })).toThrow(/got 87\.5/);
  expect(at({ port: '8787' })).toThrow(/got "8787"/);
  // ⚠️ THE HOST IS CHECKED WITH THE SAME RIGOUR, because it was re-typed in the
  //    manifest exactly as the port was, and a host can point nowhere just as well.
  expect(at({ host: undefined })).toThrow(/the daemon's host must be a non-empty string, got undefined/);
  expect(at({ host: '' })).toThrow(/got ""/);
  expect(at({ host: 8787 })).toThrow(/got 8787/);

  // ⚠️ AND THE COMMAND LANE NAMES NO ADDRESS AT ALL: demanding one of it
  //    would refuse a wiring that has no endpoint to point anywhere.
  assert.strictEqual(plan(manifest(), machine({ host: undefined, port: undefined })).length, 5,
    'A spawn wiring was refused for an address it never uses. The refusal must bite on the http transport and on nothing else.');

  // BOTH values REACH the URL — an assertion that would pass on any address is
  // an assertion that cannot see a constant left behind on either side, and
  // NEITHER of these is the historical default.
  // ⚠️ ONE traversal, written as a loop on purpose: a `.filter().map()` chain
  //    is a traversal INSIDE a traversal, which `no-undeclared-quadratic` counts
  //    and this file's ratchet has no room for — and a ratchet only goes DOWN.
  const url = [];
  for (const d of plan(manifest({ transport: http }), machine({ host: 'declared.invalid', port: 41999, routePath: '/elsewhere' }))) {
    if (d.type === 'http') url.push(d.url);
  }
  assert.deepStrictEqual(url, [
    'http://declared.invalid:41999/elsewhere?frame=1&frames=3',
    'http://declared.invalid:41999/elsewhere?frame=2&frames=3',
    'http://declared.invalid:41999/elsewhere?frame=3&frames=3',
  ], 'The declared address, or the declared route, did not reach the URL: the wiring knocks somewhere the daemon does not answer.');
});

test('an http gate declares its bound and cannot carry arguments a URL would drop', () => {
  const http = { kind: 'http' };
  // 🛑 NO BOUND, NO WIRING — on this transport the harness default is 600 s
  //    (ten minutes of an agent waiting), and an absent bound does not read as
  //    a mistake, it reads as a line.
  expect(() => plan(manifest({ transport: http, bounds: undefined }), machine())).toThrow(/`bounds` is missing/);
  expect(() => plan(manifest({ transport: http, bounds: {} }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got undefined/);
  expect(() => plan(manifest({ transport: http, bounds: { gateHookTimeoutSeconds: 0 } }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got 0/);
  assert.deepStrictEqual(framesMissingBound(plan(manifest({ transport: http }), machine()), 7), [],
    'A generated http frame does not carry the declared bound: on this lane the inherited default is TEN MINUTES, and nothing anywhere would say so.');
  assert.strictEqual(framesMissingBound(plan(manifest({ transport: http }), machine()), 8).length, 3,
    'Every http frame was reported compliant against a bound that is not the manifest\'s: the check cannot see a divergence on this transport.');

  // A URL has no argv: dropping declared arguments in silence is exactly the
  // "accepted and inert" failure this framework refuses.
  expect(() => plan(manifest({
    transport: http,
    consumers: [{ module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', args: ['--budget', '7661'], framed: true }],
  }), machine())).toThrow(/cannot carry `args`/);
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

test('the gate takes its bound from the manifest, every other consumer declares its own', () => {
  const out = plan(manifest(), machine());
  const frames = out.filter((d) => d.command.includes('doc-inject.js'));
  const reset = out.find((d) => d.command.includes('ctxroute-reset.js'));
  const doctor = out.find((d) => d.command.includes('doctor.js'));
  assert.deepStrictEqual(frames.map((d) => d.timeout), [7, 7, 7],
    'The frames do not all carry the manifest bound. Fifteen cutting at ten seconds while the sixteenth waits ten minutes is invisible — that is the whole reason the number lives in ONE place.');
  assert.strictEqual(reset.timeout, 5, 'A declared timeout must reach the wiring unchanged.');
  assert.strictEqual(doctor.timeout, 15, 'A declared timeout must reach the wiring unchanged.');
});

test('the bound is READ, never defaulted: an absent or malformed one is a NAMED refusal', () => {
  // 🛑 THE POINT OF THE WHOLE CELL: a plausible default here would emit a
  //    wiring that runs, waits differently from what anyone decided, and says
  //    nothing — the 600 s inherited in silence.
  expect(() => plan(manifest({ bounds: undefined }), machine())).toThrow(/`bounds` is missing/);
  expect(() => plan(manifest({ bounds: {} }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got undefined/);
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 0 } }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got 0/);
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 1.5 } }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got 1.5/);
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: '10' } }), machine())).toThrow(/must be an integer in 1\.\.60 seconds, got "10"/);
  expect(() => plan(manifest({ bounds: [] }), machine())).toThrow(/`bounds` is missing/);
  expect(() => gateBound(null)).toThrow(/unreadable manifest/);
  assert.strictEqual(gateBound({ bounds: { gateHookTimeoutSeconds: 42 } }), 42,
    'A well-formed bound must come back untouched — a refusal on the healthy gets the whole mechanism worked around.');

  // A framed consumer may not hold a SECOND copy of that number.
  expect(() => plan(manifest({
    consumers: [{ module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', framed: true, timeout: 9 }],
  }), machine())).toThrow(/must NOT declare its own `timeout`/);
  // And an unframed consumer with no bound at all is refused, not defaulted.
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart' }],
  }), machine())).toThrow(/`timeout` must be an integer >= 1/);
});

test('the bound check finds the frames, and sees one of them lose or change its bound', () => {
  const out = plan(manifest(), machine());
  assert.strictEqual(gateFrames(out).length, 3,
    'The gate declarations are recognised by the coordinates they carry. Finding none would make "they all carry the bound" true of the empty set.');
  assert.deepStrictEqual(framesMissingBound(out, 7), [],
    'An intact wiring is reported as non-compliant, so every red below would prove nothing.');

  const amnesic = out.map((d, i) => (i === 1 ? { event: d.event, matcher: d.matcher, type: d.type, command: d.command } : d));
  assert.strictEqual(framesMissingBound(amnesic, 7).length, 1,
    'One frame lost its bound entirely and the check saw nothing. It would not see the sixteenth waiting ten minutes either.');
  const divergent = out.map((d, i) => (i === 2 ? { ...d, timeout: 600 } : d));
  assert.strictEqual(framesMissingBound(divergent, 7).length, 1,
    'One frame carries a DIFFERENT bound and the check agreed: a divergent bound is the same finding as an absent one.');

  // An unframed declaration is NOT judged against the gate's bound: the reset
  // legitimately carries 5, and reporting it would make the cell cry wolf.
  assert.deepStrictEqual(gateFrames(out).filter((d) => d.command.includes('reset')), []);
  expect(() => framesMissingBound(out, 0)).toThrow(/a bound to check against must be an integer >= 1/);
  expect(() => gateFrames('not a list')).toThrow(/expects a declaration list/);
});

test('the splice replaces ours, keeps the operator\'s, and converges on replay', () => {
  const declarations = plan(manifest(), machine());
  const foreign = { type: 'command', command: 'node C:/elsewhere/their-hook.js', timeout: 5 };
  const before = {
    permissions: { allow: ['Bash(ls:*)'] },
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [foreign] }],
      SessionStart: [{ hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/tools/gone.js', timeout: 3 }] }],
    },
  };
  const first = splice(before, declarations, 'C:/fixture/ctxroute');
  assert.strictEqual(first.removed, 1, 'A stale declaration under our own root survived: it would keep running beside the generated ones.');
  assert.strictEqual(first.written, 5, 'The splice must write every generated declaration.');
  assert.deepStrictEqual(first.suspects, [], 'A hook belonging to the operator alone was flagged: a refusal on the healthy gets the tool disarmed.');
  assert.deepStrictEqual(before.hooks.PreToolUse[0].hooks, [foreign],
    'The input was mutated in place. The caller still holds what it read, and a backup taken from a mutated object protects nothing.');
  assert.ok(JSON.stringify(first.settings).includes('Bash(ls:*)'), 'The operator\'s permissions did not survive. This file is not ours to rewrite.');
  assert.ok(JSON.stringify(first.settings.hooks.PreToolUse).includes('their-hook.js'), 'The operator\'s own hook was dropped from the block we write into.');

  const second = splice(first.settings, declarations, 'C:/fixture/ctxroute');
  assert.strictEqual(JSON.stringify(second.settings), JSON.stringify(first.settings),
    'Replaying the splice produced a different file: it cannot be replayed after a crash, and it doubles the wiring instead of updating it.');
  assert.strictEqual(second.removed, 5, 'The replay did not recognise its own declarations, so it appended a second set beside the first.');
});

test('the splice REFUSES what it cannot own, and flags a copy of us in another spelling', () => {
  const declarations = plan(manifest(), machine());
  const twin = {
    hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=1', statusMessage: 'ctxroute' }] }] },
  };
  assert.strictEqual(splice(twin, declarations, 'C:/fixture/ctxroute').suspects.length, 1,
    'A declaration of this framework under another transport passed as a foreign hook. It would run BESIDE what we wrote — two wirings of one framework.');

  expect(() => splice({ hooks: {} }, [], 'C:/fixture/ctxroute')).toThrow(/unwire/);
  expect(() => splice({ permissions: {} }, declarations, 'C:/fixture/ctxroute')).toThrow(/no `hooks` section/);
  expect(() => splice(null, declarations, 'C:/fixture/ctxroute')).toThrow(/not a JSON object/);
  expect(() => splice({ hooks: {} }, declarations, '')).toThrow(/no framework root supplied/);
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
      { module: 'tools/doctor.js', event: 'SessionStart', timeout: 15 },
      { module: 'tools/doctor.js', event: 'SessionStart', timeout: 15 },
    ],
  }), machine())).toThrow(/declared twice/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', matcher: '' }],
  }), machine())).toThrow(/`matcher` is a non-empty string or null/);
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', timeout: 0 }],
  }), machine())).toThrow(/`timeout` must be an integer >= 1/);
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

// ═══════════════════════════════════════════════════════════════════════
// THE VOCABULARY OF THE MANIFEST — every word exercised for its VALUE
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ A LIST OF ACCEPTED WORDS THAT NO CELL SPELLS IS A LIST NOBODY CHECKS.
//    `knownEvents()` decides which harness events a consumer may attach to; a
//    typo in one of those eight strings does not read as a mistake, it reads as
//    a line, and its only symptom is a manifest refusing a hook the harness
//    would happily run. The eight names below are written BY HAND, on purpose:
//    reading them back from the module would only prove it equals itself.

test('every harness event the manifest accepts is spelled out, and each one wires', () => {
  const events = [
    'SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit',
    'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop',
  ];
  const out = plan(manifest({
    consumers: events.map((event, i) => ({ module: `tools/e${i + 1}.js`, event, timeout: 1 })),
  }), machine());

  assert.deepStrictEqual(out.map((d) => d.event), events,
    'An event the manifest is supposed to accept was refused, or renamed on the way through. A consumer that cannot name its event is a hook that never runs.');
  assert.deepStrictEqual(out.map((d) => d.type), events.map(() => 'command'),
    'A spawn declaration must be typed `command`: the harness dispatches on that word, and a declaration it cannot dispatch runs NOTHING, with no error and no log.');
  // No lane (none of these is a state consumer) and no arguments: the command
  // is the bare invocation, to the character.
  assert.strictEqual(out[0].command, 'node C:/fixture/ctxroute/tools/e1.js',
    'A consumer with no arguments must produce the bare invocation — one extra character here is a command line the shell parses differently.');
  // One second is the SMALLEST legal bound: refusing it would refuse a healthy
  // manifest, and a mechanism that refuses the healthy gets routed around.
  assert.deepStrictEqual(out.map((d) => d.timeout), events.map(() => 1));
});

test('the bound path is NAMED in every refusal that quotes it', () => {
  // 🛑 A REFUSAL THAT DOES NOT SAY WHERE TO WRITE THE MISSING NUMBER sends the
  //    operator hunting through the manifest. The path is CONTRACT, not
  //    decoration, so it is written here literally.
  expect(() => plan(manifest({ bounds: undefined }), machine()))
    .toThrow('`bounds` is missing — `bounds.gateHookTimeoutSeconds` has NO default here');
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 0 } }), machine()))
    .toThrow('`bounds.gateHookTimeoutSeconds` must be an integer in 1..60 seconds, got 0');
  expect(() => plan(manifest({
    consumers: [{ module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', framed: true, timeout: 9 }],
  }), machine())).toThrow('its bound is `bounds.gateHookTimeoutSeconds`');

  assert.strictEqual(gateBound({ bounds: { gateHookTimeoutSeconds: 1 } }), 1,
    'One second is a LEGAL bound. A refusal on the healthy is how a mechanism gets disarmed.');
  assert.strictEqual(framesMissingBound(plan(manifest(), machine()), 1).length, 3,
    'A bound of 1 was refused as a value to check against, so the smallest legal wiring could never be judged at all.');
});

test('a refusal names the ADMITTED values, not only the rejected one', () => {
  // Reading the list back from the module would prove it equals itself; the
  // separator and both lane names are written by hand.
  expect(() => plan(manifest({ stateLane: 'daemon' }), machine()))
    .toThrow('`stateLane` must be one of client | files, got "daemon"');
});

test('a malformed `bounds` is refused whatever SHAPE it takes', () => {
  // 🔑 THREE SHAPES, THREE MISTAKES: absent, a scalar written where an object
  //    was meant, and a list. A guard that only sees the absent one lets
  //    `bounds: 7` through to a message about an integer nobody wrote.
  expect(() => plan(manifest({ bounds: undefined }), machine())).toThrow('`bounds` is missing');
  expect(() => plan(manifest({ bounds: 7 }), machine())).toThrow('`bounds` is missing');
  expect(() => plan(manifest({ bounds: 'gateHookTimeoutSeconds: 7' }), machine())).toThrow('`bounds` is missing');
  expect(() => plan(manifest({ bounds: [] }), machine())).toThrow('`bounds` is missing');
});

test('a manifest that is not an object is UNREADABLE, whatever kind of value it is', () => {
  // `null` is caught by the truthiness half; a string or a number — a file read
  // but never parsed, a hand-edited fragment — is caught by the SHAPE half.
  // Without it they travel on to a message about `stateLane`, which sends the
  // reader to the wrong line of the wrong file.
  expect(() => gateBound('bounds')).toThrow(/unreadable manifest/);
  expect(() => gateBound(42)).toThrow(/unreadable manifest/);
  expect(() => gateTransport('http')).toThrow(/unreadable manifest/);
  expect(() => gateTransport(42)).toThrow(/unreadable manifest/);
  expect(() => plan('wiring.json', machine())).toThrow(/unreadable manifest/);
  expect(() => plan(42, machine())).toThrow(/unreadable manifest/);
});

test('`kind: "command"` written out is the command transport, and carries nothing else', () => {
  // 🛑 THE RETURNED SHAPE IS THE DECISION: a transport with no `kind` leaves the
  //    http branch unreachable, so every declared transport would silently
  //    generate a spawn — accepted, wired, and not what was declared.
  assert.deepStrictEqual(gateTransport({ transport: { kind: 'command' } }), { kind: 'command' },
    'The command transport must come back NAMED. A transport with no kind is a declaration no branch can recognise.');
});

test('the port range ADMITS its own extremities', () => {
  const at = (port) => plan(manifest({
    transport: { kind: 'http' },
  }), machine({ frames: 1, port }))[0].url;
  assert.strictEqual(at(1), 'http://127.0.0.1:1/pretool?frame=1&frames=1',
    'Port 1 is a legal port. Refusing it refuses a healthy endpoint the operator is entitled to choose.');
  assert.strictEqual(at(65535), 'http://127.0.0.1:65535/pretool?frame=1&frames=1',
    'Port 65535 is the LAST legal port. A range that stops one short refuses a wiring the kernel accepts.');
});

test('coordinates are read from a STRING, never from a value coerced into one', () => {
  // 🛑 settings.json is hand-edited JSON, so a `url` written as a list is a real
  //    typo — and a reader that coerced it would extract coordinates from a
  //    declaration the harness cannot execute: a frame counted as present while
  //    nothing runs, which is the silence this module exists to refuse.
  assert.strictEqual(frameCoordinates({ url: ['http://127.0.0.1:8787/pretool?frame=1&frames=3'] }), null,
    'A non-string `url` was read as if it were a URL. A malformed declaration carries NO coordinates, never coordinates nobody can execute.');
  assert.strictEqual(frameCoordinates({ command: ['node x.js --frame 1 --frames 3'] }), null,
    'A non-string `command` was read as if it were a command line.');
});

test('a consumer with no usable `module` is a NAMED refusal, in each of its shapes', () => {
  // 🔑 THIS BRANCH HAD NO TEST AT ALL. Falling through it emits a declaration
  //    pointing at `node <root>/undefined`: wired, executed once per event, and
  //    failing where nobody looks.
  const without = (over) => () => plan(manifest({
    consumers: [{ event: 'PreCompact', timeout: 1, ...over }],
  }), machine());
  expect(without({})).toThrow('a consumer has no `module`');
  expect(without({ module: '' })).toThrow('a consumer has no `module`');
  expect(without({ module: 5 })).toThrow('a consumer has no `module`');
  expect(without({ module: ['src/hooks/doc-inject.js'] })).toThrow('a consumer has no `module`');
});

test('a machine fact of the wrong TYPE is refused exactly like a missing one', () => {
  // An empty string and a value of another type are the SAME finding: the shell
  // could not measure that fact. Only the emptiness half was exercised, and a
  // guard blind to the type lets `null` through to a TypeError — a crash where
  // a named refusal was owed.
  expect(() => plan(manifest(), machine({ laneFlag: null }))).toThrow(/lane flag could not be read/);
  expect(() => plan(manifest(), machine({ laneFlag: 7 }))).toThrow(/lane flag could not be read/);
  expect(() => plan(manifest(), machine({ settingsPath: null }))).toThrow(/no settings path supplied/);
  expect(() => plan(manifest(), machine({ settingsPath: ['C:/fixture/settings.json'] }))).toThrow(/no settings path supplied/);
});

test('a `matcher` or an `args` entry of the wrong type is refused, never coerced', () => {
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', matcher: 5, timeout: 1 }],
  }), machine())).toThrow('`matcher` is a non-empty string or null');
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', args: ['--quiet', ''], timeout: 1 }],
  }), machine())).toThrow('`args` is a list of non-empty strings');
  expect(() => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', args: '--quiet', timeout: 1 }],
  }), machine())).toThrow('`args` is a list of non-empty strings');
});

test('a placeholder is a PAIR of braces — a single one is an ordinary argument', () => {
  // 🛑 THE REFUSAL MUST NOT WIDEN INTO A BAN ON BRACES. A regex, a JSON fragment
  //    or a shell expansion legitimately carries ONE brace; refusing it would
  //    make the manifest unable to express arguments the harness runs every day,
  //    and a guardrail that refuses the healthy is a guardrail worked around.
  const withArgs = (args) => plan(manifest({
    consumers: [{ module: 'tools/doctor.js', event: 'SessionStart', args, timeout: 1 }],
  }), machine())[0].command;
  assert.strictEqual(withArgs(['--match', 'a}b']), 'node C:/fixture/ctxroute/tools/doctor.js --match a}b',
    'A closing brace alone was taken for a placeholder. Half a placeholder is not a placeholder.');
  assert.strictEqual(withArgs(['--match', 'a{b']), 'node C:/fixture/ctxroute/tools/doctor.js --match a{b',
    'An opening brace alone was taken for a placeholder.');
  expect(() => withArgs(['{home}'])).toThrow('unknown placeholder in argument "{home}"');
});

// ═══════════════════════════════════════════════════════════════════════
// THE TWO CLOSED VOCABULARIES — every word must be REACHABLE, and the key
// path must be QUOTED. Both were survivors of the 2026-08-22 measurement.
// ═══════════════════════════════════════════════════════════════════════

// 🛑 A WHITELIST NOBODY EXERCISES IS A WHITELIST THAT CAN LOSE A WORD IN SILENCE.
//    Five of the eight event names survived mutation: emptying `'PostToolUse'`
//    or `'Stop'` changed no test, because no fixture ever declared a consumer on
//    them. The day someone wires a PostToolUse guard through the manifest, the
//    generator would REFUSE it as an unknown event — a named refusal, but for a
//    perfectly legal wiring. The list is a CONTRACT: every word is legal, so
//    every word is driven here.
// ⚠️ The eight names are written LITERALLY. Reading them from `knownEvents()`
//    would mutate together with the list and prove `x === x`.
test('every declared event is REACHABLE — the whitelist is a contract, not decoration', () => {
  for (const event of [
    'SessionStart', 'PreToolUse', 'PostToolUse',
    'UserPromptSubmit', 'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop',
  ]) {
    const out = plan(manifest({
      consumers: [{ module: 'src/hooks/probe.js', event, matcher: null, timeout: 4 }],
    }), machine());
    assert.deepStrictEqual(out, [{
      event, matcher: null, type: 'command',
      command: 'node C:/fixture/ctxroute/src/hooks/probe.js', timeout: 4,
    }], `the event ${JSON.stringify(event)} is refused although it is declared legal: a word lost from the whitelist turns a valid wiring into a named refusal, and nobody would suspect the list`);
  }

  // ANTI-VACUITY: the loop above proves the ACCEPTED side only. Without this,
  // a whitelist replaced by "accept everything" would pass all eight.
  assert.throws(() => plan(manifest({
    consumers: [{ module: 'src/hooks/probe.js', event: 'OnTuesday', matcher: null, timeout: 4 }],
  }), machine()), /unknown event "OnTuesday"/,
  'an invented event is accepted: the whitelist has stopped discriminating, and a typo now wires a hook onto an event no harness fires');
});

// 🛑 THE KEY PATH IS QUOTED IN EVERY REFUSAL, AND THAT IS THE WHOLE POINT OF IT.
//    Emptying the constant survived: the refusals still fired, they just stopped
//    NAMING what to fix. A refusal that does not say WHERE to write the bound
//    sends the reader hunting through a manifest — which is exactly the time
//    this project exists to stop spending.
test('every refusal about the bound NAMES the key to write, literally', () => {
  const filePath = 'bounds.gateHookTimeoutSeconds';

  assert.throws(() => plan(manifest({ bounds: undefined }), machine()),
    (e) => e.message.includes(filePath), `a manifest with no \`bounds\` is refused without naming ${filePath}`);
  assert.throws(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 0 } }), machine()),
    (e) => e.message.includes(filePath), `a bound of 0 is refused without naming ${filePath}`);
  assert.throws(() => plan(manifest({
    consumers: [{ module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', framed: true, timeout: 3 }],
  }), machine()), (e) => e.message.includes(filePath),
  `a framed consumer declaring its own timeout is refused without naming ${filePath} as the single place that number lives`);
});

// ═══════════════════════════════════════════════════════════════════════
// A BOUND HAS TWO ENDS — the ceiling, DERIVED from the harness defaults
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE HOLE THIS CLOSES: any integer >= 1 was accepted, so `999999` — eleven
//    and a half DAYS — passed as a decision and bounded nothing. Beyond the
//    default the harness applies on its own, a declared bound never fires
//    first: it changes no behaviour while reading like a choice, which is the
//    same silence as an absent bound wearing a number.

test('a bound beyond the harness default is REFUSED, and the ceiling is named', () => {
  // 60 is the Claude Code SPAWN lane default, declared in `HOOK_TIMEOUT_DEFAULTS`
  // (src/harness-profile.js) and copied here BY HAND: an expectation read from
  // the code under test only ever proves that code equals itself.
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 999999 } }), machine()))
    .toThrow('`bounds.gateHookTimeoutSeconds` must be an integer in 1..60 seconds, got 999999');
  expect(() => plan(manifest({ bounds: { gateHookTimeoutSeconds: 61 } }), machine()))
    .toThrow('must be an integer in 1..60 seconds, got 61');

  // ANTI-VACUITY, BOTH EXTREMITIES: refusing a healthy bound is how a
  // mechanism gets routed around, and 60 is legal — on the http lane, whose
  // own default is ten minutes, it still bounds something real.
  assert.strictEqual(gateBound({ bounds: { gateHookTimeoutSeconds: 60 } }), 60,
    'The largest legal bound was refused: the interval excludes its own extremity, so a wiring the harness accepts became a named refusal.');
  assert.strictEqual(gateBound({ bounds: { gateHookTimeoutSeconds: 10 } }), 10,
    'The value this repository runs in production was refused. A guardrail that refuses the healthy is a guardrail worked around.');
});

test('the ceiling is DERIVED from the harness table, and a table it cannot read is a NAMED refusal', () => {
  // The smallest numeric HANDLER default across the table, whichever harness
  // declares it — never a number typed a second time inside the generator.
  assert.strictEqual(boundCeiling({ claudeCode: { command: 60, http: 600 } }), 60,
    'The ceiling is not the smallest declared default: a bound above what the harness applies on its own would pass, and it would bound nothing.');
  assert.strictEqual(boundCeiling({ a: { command: 60, http: 600 }, b: { command: 12, http: 900 } }), 12,
    'A second harness declaring a SHORTER default did not lower the ceiling. The table is the authority, or the derivation is decoration.');
  // A lane may be a WORD (`absent`, `unmeasured`): a fact ABOUT a harness, never
  // a duration to compute with. Coerced, it would poison the minimum.
  assert.strictEqual(boundCeiling({ codex: { command: 'unmeasured', http: 'absent' }, claudeCode: { command: 60, http: 600 } }), 60,
    'A non-numeric lane entered the computation: `absent` is not a duration, and a NaN ceiling refuses every bound, the healthy ones included.');
  assert.strictEqual(boundCeiling({ broken: null, claudeCode: { command: 60, http: 600 } }), 60,
    'A malformed table entry crashed instead of being skipped: this generator owes a NAMED refusal, never a TypeError.');

  // 🛑 ANTI-VACUITY: with nothing numeric to derive from, `Math.min()` answers
  //    Infinity — no ceiling at all, restored in SILENCE. That is refused.
  expect(() => boundCeiling({})).toThrow(/no harness declares a numeric hook timeout default/);
  expect(() => boundCeiling({ codex: { command: 'unmeasured', http: 'absent' } })).toThrow(/no ceiling can be derived/);
  expect(() => boundCeiling(undefined)).toThrow(/no ceiling can be derived/);
});

// ═══════════════════════════════════════════════════════════════════════
// THE STATUS LINE IS DECLARABLE — it used to be DERIVED, and only derived
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 The last segment of the repository root matched the live wiring and
//    nothing in any harness contract obliged it. A fact nobody can declare is
//    a fact that can only be changed by editing the engine — the definition of
//    a tool. Declared, it stays DATA; the derivation remains the default.

test('`transport.statusMessage` is DECLARED, and the derivation is the written default', () => {
  const endpoint = (over = {}) => ({ kind: 'http', ...over });

  const derived = plan(manifest({ transport: endpoint() }), machine({ frames: 1 }));
  assert.strictEqual(derived.find((d) => d.type === 'http').statusMessage, 'ctxroute',
    'The default status line is no longer the root\'s last segment: every live declaration would change on the next generation, for a key the operator never touched.');

  const spoken = plan(manifest({ transport: endpoint({ statusMessage: 'ctxroute (dev)' }) }), machine({ frames: 1 }));
  assert.strictEqual(spoken.find((d) => d.type === 'http').statusMessage, 'ctxroute (dev)',
    'A declared status line was ignored in favour of the derivation: the operator writes it and the generator overrules them, silently.');

  // On the SPAWN lane it is written ONLY when declared. The asymmetry is
  // deliberate: those declarations have never carried one, and deriving a
  // default there would rewrite every generated command wiring.
  const bare = plan(manifest({ transport: { kind: 'command' } }), machine({ frames: 1 }));
  assert.strictEqual('statusMessage' in bare.find((d) => d.command.includes('doc-inject.js')), false,
    'The spawn lane grew a status line nobody declared: every command wiring would diff against itself on the next generation.');
  const bareSpoken = plan(manifest({ transport: { kind: 'command', statusMessage: 'ctxroute (dev)' } }), machine({ frames: 1 }));
  assert.strictEqual(bareSpoken.find((d) => d.command.includes('doc-inject.js')).statusMessage, 'ctxroute (dev)',
    'A status line declared on the spawn transport never reached the wiring: accepted and inert, which is the failure shape this framework refuses.');
  // An unframed consumer is not the gate: the transport does not carry it.
  assert.strictEqual('statusMessage' in bareSpoken.find((d) => d.command.includes('ctxroute-reset.js')), false,
    'The gate\'s status line landed on a peer that transport does not carry.');

  expect(() => plan(manifest({ transport: endpoint({ statusMessage: '' }) }), machine())).toThrow(/`transport.statusMessage` is a non-empty string/);
  expect(() => plan(manifest({ transport: endpoint({ statusMessage: 7 }) }), machine())).toThrow(/`transport.statusMessage` is a non-empty string when declared, got 7/);
  assert.deepStrictEqual(gateTransport({ transport: { kind: 'command' } }), { kind: 'command' },
    'An undeclared status line became an own key holding `undefined`: that is not the same object, and every comparison here is a deep STRICT one.');
});

// ═══════════════════════════════════════════════════════════════════════
// THE PAIR THAT REBUILDS THE 2026-08-22 DEFECT — refused, named
// ═══════════════════════════════════════════════════════════════════════

test('`http` + `stateLane: "files"` is a SPLIT BRAIN, and the generator refuses to write it', () => {
  const endpoint = { kind: 'http' };
  expect(() => plan(manifest({ transport: endpoint, stateLane: 'files' }), machine()))
    .toThrow('`transport.kind: "http"` with `stateLane: "files"` is a SPLIT BRAIN');

  // ANTI-VACUITY, BOTH CONTROLS: the refusal must bite on the PAIR and on
  // nothing else, or it forbids two wirings that are perfectly coherent.
  assert.strictEqual(plan(manifest({ stateLane: 'files' }), machine()).length, 5,
    'The file lane on the spawn transport was refused: that is the wiring every harness without an http handler runs, and it has ONE memory.');
  assert.strictEqual(plan(manifest({ transport: endpoint, stateLane: 'client' }), machine()).length, 5,
    'The live wiring itself was refused — the daemon owns the state and every peer names the same authority.');
});
