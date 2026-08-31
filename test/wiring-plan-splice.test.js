// ═══════════════════════════════════════════════════════════════════════
// wiring-plan.js — THE SPLICE: what we OWN, and what we must never delete
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS SUITE JUDGES THE ONE DECISION THAT CAN DESTROY THE OPERATOR'S
//    CONFIGURATION. `splice()` decides which declarations of `settings.json`
//    are OURS — and everything it calls ours is REMOVED from a file we do not
//    own. A wrong `true` here does not produce a missing injection: it deletes
//    an operator's hook, and the file it deleted it from is the only copy.
//    So every cell below asserts BOTH sides: ours is gone, theirs is intact,
//    and the shape it comes back in is the shape a harness will execute.
//
// ⚠️ EVERY EXPECTATION IS WRITTEN OUT BY HAND, never read back from the module
//    nor from `plan()`'s output. An assertion that quotes the module under
//    test demonstrates `x === x`: it is mutated together with the code and can
//    no longer see the mutant. The refusal MESSAGES are contract too — when
//    the engine names the faulty key, the assertion demands that name.
//
// 🛑 STATIC ESM IMPORT, DELIBERATE AND LOAD-BEARING. Stryker resolves the
//    tests covering a mutant through the ESM module graph; a `createRequire`
//    edge is INVISIBLE to it. Measured on this very module on 2026-08-22:
//    reached only through `createRequire`, it reported "No tests were found"
//    — 601 mutants, ZERO test executed, on a file listed in `mutate` and
//    therefore believed covered. Never reach this module any other way.
//
// ⚠️ perTest: every fixture is a THUNK, evaluated INSIDE the test callback. A
//    module-level object literal is evaluated once, before instrumentation,
//    and Stryker reports it as a static mutant — i.e. a FALSE survivor.

import { test, expect } from 'vitest';
import assert from 'node:assert';

import { plan, splice } from '../src/wiring-plan.js';

/** The framework's root on the fixture machine. Its last segment is the token. */
const ROOT = () => 'C:/fixture/ctxroute';

/** Machine facts, as the shell measures them. */
const machine = (over = {}) => ({
  root: 'C:/fixture/ctxroute',
  frames: 2,
  laneFlag: '--client',
  stateConsumers: ['ctxroute-reset.js', 'doc-inject.js'],
  settingsPath: 'C:/fixture/settings.json',
  ...over,
});

/**
 * Three groups on purpose: two `(event, matcher)` pairs under ONE event plus a
 * matcher-less one. A splice keyed on the event alone, or on a matcher it
 * normalises differently from `plan()`, agrees with a single-group fixture and
 * scatters this one.
 */
const manifest = (over = {}) => ({
  stateLane: 'client',
  bounds: { gateHookTimeoutSeconds: 7 },
  consumers: [
    { module: 'src/hooks/doc-inject.js', event: 'PreToolUse', matcher: '*', framed: true },
    { module: 'src/hooks/turn-count.js', event: 'PreToolUse', matcher: 'Bash', timeout: 4 },
    { module: 'src/hooks/ctxroute-reset.js', event: 'PreCompact', matcher: null, timeout: 5 },
  ],
  ...over,
});

/** A hook of the OPERATOR's. Nothing here may ever touch one. */
const theirs = (name) => ({ type: 'command', command: `node C:/theirs/${name}.js`, timeout: 9 });

test('ours are re-inserted WHERE they were, inside the operator\'s own block', () => {
  const declarations = plan(manifest(), machine());
  // A previous generation of ours, interleaved with the operator's hooks in
  // ONE block — the real shape of a settings.json, and the only shape that can
  // tell "replaced in place" from "removed then appended at the end".
  const before = {
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: [
          theirs('audit'),
          { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 9', timeout: 600 },
          theirs('notify'),
          { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 9', timeout: 600 },
        ],
      }],
      PreCompact: [{
        hooks: [
          null,
          { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/ctxroute-reset.js', timeout: 600 },
          theirs('backup'),
        ],
      }],
    },
  };

  const out = splice(before, declarations, ROOT());

  assert.strictEqual(out.removed, 3,
    'The count of what we DELETE from a file we do not own is the number this whole module exists to keep exact.');

  // ── THE POSITION IS THE PROOF ────────────────────────────────────────
  // Re-inserted at the index of the FIRST of ours, so the operator's own
  // hooks keep the order they wrote them in. Appending at the end would be a
  // silent reordering of THEIR configuration, and hook order is execution
  // order.
  assert.strictEqual(out.settings.hooks.PreToolUse.length, 2,
    'Our declarations landed in a NEW block instead of the operator\'s: two blocks now match the same gesture, so the wiring runs twice.');
  assert.deepStrictEqual(out.settings.hooks.PreToolUse[0].hooks.map((e) => e.command), [
    'node C:/theirs/audit.js',
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 2',
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 2',
    'node C:/theirs/notify.js',
  ], 'The generated set was not spliced back where ours used to be: the operator\'s hooks changed order, or the frames were reordered among them.');

  // A matcher-less block is keyed by the SAME normalisation `plan()` writes:
  // absent ⇔ null. Miss that and this group appends beside the block it
  // belongs to. The `null` entry is here because a settings.json can hold one,
  // and a splice that reads it as "ours" would DELETE it.
  assert.deepStrictEqual(out.settings.hooks.PreCompact, [{
    hooks: [
      null,
      { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/ctxroute-reset.js --client', timeout: 5 },
      { type: 'command', command: 'node C:/theirs/backup.js', timeout: 9 },
    ],
  }], 'A matcher-less block was not recognised as the one holding ours — or a null entry was claimed as ours and deleted.');

  // ── THE WRITTEN ENTRY IS THE CONTRACT ───────────────────────────────
  // Field by field, and ONLY the fields this declaration carries: a
  // `url: undefined` or a `statusMessage: undefined` on a command entry is a
  // key the harness reads as present-and-empty.
  assert.deepStrictEqual(out.settings.hooks.PreToolUse[1], {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/turn-count.js', timeout: 4 }],
  }, 'The appended block is not what a harness executes: a lost `type`, a dropped bound, or a key written empty.');

  assert.deepStrictEqual(out.suspects, [],
    'A hook belonging to the operator alone was flagged. A tool that refuses on the healthy gets disarmed.');
});

test('an emptied block is dropped and comes back; a foreign event is never touched', () => {
  const declarations = plan(manifest(), machine());
  const before = {
    hooks: {
      PreToolUse: [
        { matcher: '*', hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 9', timeout: 600 }] },
        { matcher: 'Bash', hooks: [theirs('audit')] },
      ],
      // An event we no longer declare anything for: what is left of ours goes,
      // and the empty key goes with it — debris accumulates one entry per
      // replay, which is the opposite of idempotent.
      SessionEnd: [{ hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/session-inject.js --client', timeout: 20 }] }],
      // An event that is ENTIRELY the operator's. Nothing here may reach it.
      Stop: [{ matcher: 'x', hooks: [theirs('notify')] }],
    },
  };

  const out = splice(before, declarations, ROOT());

  assert.strictEqual(out.removed, 2);
  assert.deepStrictEqual(out.settings.hooks.PreToolUse.map((b) => b.matcher), ['Bash', '*', 'Bash'],
    'A block emptied of ours must be dropped and re-appended once refilled: keeping it in place leaves debris, and losing it loses the wiring.');
  assert.deepStrictEqual(out.settings.hooks.PreToolUse[1].hooks, [
    { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 2', timeout: 7 },
    { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 2', timeout: 7 },
  ], 'The block that held only ours never got its declarations back: the framework is now UNWIRED for that gesture, silently.');

  assert.ok(!('SessionEnd' in out.settings.hooks),
    'An event left with no block at all keeps an empty key: replaying stacks debris in a file that is not ours.');

  assert.deepStrictEqual(out.settings.hooks.Stop, [{ matcher: 'x', hooks: [{ type: 'command', command: 'node C:/theirs/notify.js', timeout: 9 }] }],
    'An event made ENTIRELY of the operator\'s hooks was altered or deleted. That is destroying configuration we do not own.');
});

test('a malformed wiring is stepped over, never crashed on and never rewritten', () => {
  const declarations = plan(manifest(), machine());
  // Everything a hand-edited settings.json can really contain. None of it is
  // ours, so none of it may change — and none of it may throw either: a splice
  // that dies here leaves the operator with the file it had, and a tool that
  // dies on a shape it did not expect is a tool nobody runs twice.
  const before = {
    hooks: {
      PreToolUse: 'this is not a list of blocks',
      Stop: [
        null,
        { matcher: 'x' },
        { hooks: 'not a list either' },
        { matcher: 'y', hooks: [theirs('notify')] },
      ],
    },
  };

  const out = splice(before, declarations, ROOT());

  assert.strictEqual(out.removed, 0, 'Nothing in this fixture is ours; anything removed was the operator\'s.');
  assert.deepStrictEqual(out.settings.hooks.Stop, [
    null,
    { matcher: 'x' },
    { hooks: 'not a list either' },
    { matcher: 'y', hooks: [{ type: 'command', command: 'node C:/theirs/notify.js', timeout: 9 }] },
  ], 'A block the splice did not understand was rewritten or dropped. What we cannot read, we leave exactly as it was.');

  assert.deepStrictEqual(out.settings.hooks.PreToolUse, [
    {
      matcher: '*',
      hooks: [
        { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 2', timeout: 7 },
        { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 2', timeout: 7 },
      ],
    },
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/turn-count.js', timeout: 4 }] },
  ], 'An event whose value is not a list of blocks must be replaced by exactly what we generate — not by our blocks beside a survivor of it.');
});

test('ownership on the http lane is decided by the COORDINATES, never by a name', () => {
  // 🛑 THE DECLARED LIMIT, RESPECTED AS WRITTEN: two copies of the framework
  //    pointed at the SAME endpoint are indistinguishable here — what
  //    separates them is the port, and the port is the operator's. So the
  //    owned entry below sits on ANOTHER port and is still ours: the test
  //    exercises the limit, it does not pretend to close it.
  const declarations = plan(manifest({ transport: { kind: 'http' } }), machine({ host: '127.0.0.1', port: 8787, routePath: '/pretool' }));
  const before = {
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: [
          { type: 'http', url: 'http://127.0.0.1:9999/pretool?frame=1&frames=9', timeout: 600, statusMessage: 'ctxroute' },
          // A URL of ours in shape but with no coordinates: not a frame, not
          // ours, and deleting it would delete an operator's endpoint.
          { type: 'http', url: 'http://127.0.0.1:8787/health', timeout: 5 },
          // A SECOND COPY of this framework, under another root, carrying real
          // coordinates. Not ours by root, so it survives the splice and would
          // run BESIDE what we just wrote — two wirings of one framework. It is
          // reported, never deleted: the caller refuses.
          { type: 'command', command: 'node C:/old-copy/ctxroute/src/hooks/doc-inject.js --frame 1 --frames 9', timeout: 600 },
        ],
      }],
    },
  };

  const out = splice(before, declarations, ROOT());

  assert.strictEqual(out.removed, 1,
    'Ownership on this lane is the coordinates plus the transport, nothing else: one entry too many is a deletion, one too few is a second wiring.');
  assert.deepStrictEqual(out.suspects, [
    { type: 'command', command: 'node C:/old-copy/ctxroute/src/hooks/doc-inject.js --frame 1 --frames 9', timeout: 600 },
  ], 'A copy of this framework under another root passed as a foreign hook, or was silently deleted. It is HANDED BACK; the caller decides.');

  assert.deepStrictEqual(out.settings.hooks.PreToolUse[0].hooks, [
    { type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=1&frames=2', timeout: 7, statusMessage: 'ctxroute' },
    { type: 'http', url: 'http://127.0.0.1:8787/pretool?frame=2&frames=2', timeout: 7, statusMessage: 'ctxroute' },
    { type: 'http', url: 'http://127.0.0.1:8787/health', timeout: 5 },
    { type: 'command', command: 'node C:/old-copy/ctxroute/src/hooks/doc-inject.js --frame 1 --frames 9', timeout: 600 },
  ], 'An http declaration is written url + bound + status and NOTHING else: a `command` key written empty is a key the harness reads as present.');
});

test('a wiring with none of ours gets exactly what the manifest declares, and nothing more', () => {
  const declarations = plan(manifest(), machine());
  const out = splice({ hooks: {} }, declarations, ROOT());

  assert.strictEqual(out.removed, 0);
  assert.strictEqual(out.written, 4, 'Every generated declaration is written, or the wiring is short by one hook nobody will notice.');
  assert.deepStrictEqual(out.settings.hooks, {
    PreToolUse: [
      {
        matcher: '*',
        hooks: [
          { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 2', timeout: 7 },
          { type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 2', timeout: 7 },
        ],
      },
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/turn-count.js', timeout: 4 }] },
    ],
    // 🛑 NO `matcher` KEY AT ALL, and it is not cosmetic: a block created with
    //    `matcher: ""` is a block whose matcher is the empty pattern, which is
    //    not the same gesture as a block that declares none.
    PreCompact: [{ hooks: [{ type: 'command', command: 'node C:/fixture/ctxroute/src/hooks/ctxroute-reset.js --client', timeout: 5 }] }],
  }, 'A fresh wiring is exactly the manifest: a fabricated matcher, a missing one, or anything else in the file we just created.');
});

test('every unusable input is a NAMED refusal, never a wiring written half-way', () => {
  const declarations = plan(manifest(), machine());

  // An array IS an object to `typeof`. Refused as what it is, so the operator
  // reads the real fault instead of "no hooks section" one line further down.
  expect(() => splice([], declarations, ROOT())).toThrow(/the target settings is not a JSON object/);
  expect(() => splice('{"hooks":{}}', declarations, ROOT())).toThrow(/the target settings is not a JSON object/);
  expect(() => splice(null, declarations, ROOT())).toThrow(/the target settings is not a JSON object/);

  // Without a root, ownership has no authority at all — and a splice that
  // guessed one would delete by resemblance.
  expect(() => splice({ hooks: {} }, declarations, null)).toThrow(/no framework root supplied to the splice/);
  expect(() => splice({ hooks: {} }, declarations, 42)).toThrow(/no framework root supplied to the splice/);
  // An EMPTY root is the dangerous one: `node /` prefixes every command ever
  // written, so a splice that accepted it would call the operator's whole
  // wiring ours and delete it. Refused with the same name, never by luck.
  expect(() => splice({ hooks: {} }, declarations, '')).toThrow(/no framework root supplied to the splice/);

  // Fail-closed on the likeliest mistake: a path that points at a file which is
  // not the wiring at all. A wiring is never created out of nothing here.
  expect(() => splice({}, declarations, ROOT())).toThrow(/the target declares no `hooks` section/);
  expect(() => splice({ hooks: [] }, declarations, ROOT())).toThrow(/the target declares no `hooks` section/);
  expect(() => splice({ hooks: 'not a section' }, declarations, ROOT())).toThrow(/the target declares no `hooks` section/);
});

test('a NEIGHBOURING project whose name merely STARTS with ours is not a suspect', () => {
  // 🔴 MEASURED IN PRODUCTION 2026-08-31, and it made the generator unusable.
  //    The suspect test read `text.includes(root) || text.includes(token)`, so
  //    `…/Desktop/ctxroute-policies/bin/check.js` — a SEPARATE project sitting
  //    beside this repository — contained both as PREFIXES and was accused.
  //    `--write` then refused, on a machine whose wiring was perfectly sound:
  //    the operator could no longer change `frames` at all.
  // 🛑 THE BOUNDARY IS THE POINT. Ownership already demanded `node ${root}/`
  //    (trailing slash); the MENTION compared raw text. Two questions about the
  //    same boundary answered by two different rules is the whole defect.
  // ⚠️ The cell asserts BOTH directions in one gesture: the sibling survives
  //    UNACCUSED, while a REAL second copy under a genuine `…/ctxroute/…` path
  //    is still reported. A fix that simply stopped suspecting would pass the
  //    first half and hand back the split brain this test exists to prevent.
  const declarations = plan(manifest(), machine());
  const before = {
    hooks: {
      SessionStart: [{
        hooks: [
          { type: 'command', command: 'node C:/elsewhere/ctxroute-policies/bin/check.js', timeout: 20 },
          { type: 'command', command: 'node C:/elsewhere/ctxroute_old/src/hooks/session-inject.js', timeout: 20 },
          { type: 'command', command: 'node C:/other/ctxroute/src/hooks/session-inject.js', timeout: 20 },
        ],
      }],
    },
  };

  const out = splice(before, declarations, ROOT());

  assert.deepStrictEqual(out.suspects, [
    { type: 'command', command: 'node C:/other/ctxroute/src/hooks/session-inject.js', timeout: 20 },
  ], 'A sibling directory (`-policies`, `_old`) was accused of being this framework, or a REAL second copy stopped being reported. The mention must end on a segment boundary — and it must still catch a genuine copy.');
});

// ═══════════════════════════════════════════════════════════════════════
// THE SHAPE — no caller in this fleet ever passes one, but the parameter
// is a documented part of the contract (porting to a harness that nests
// its own wiring under different key names). It must actually be USED.
// ═══════════════════════════════════════════════════════════════════════
test('a harness whose wiring nests differently is spliced from ITS OWN shape, not the default', () => {
  const declarations = plan(manifest(), machine());
  const shape = { rootKey: 'automation', entriesKey: 'triggers', matcherKey: 'when' };
  const before = {
    automation: {
      PreToolUse: [{ when: '*', triggers: [theirs('audit')] }],
    },
  };

  // 🛑 IF THE CUSTOM SHAPE WERE IGNORED, `splice` WOULD FALL BACK TO THE
  //    DEFAULT `hooks` ROOT KEY — which this fixture does not carry at all —
  //    and REFUSE with "no `hooks` section". A successful splice below is
  //    therefore proof the declared shape actually reached the engine.
  const out = splice(before, declarations, ROOT(), shape);

  assert.strictEqual(out.removed, 0, 'Nothing under the custom shape was ours yet.');
  assert.deepStrictEqual(out.settings.automation.PreToolUse[0].triggers, [theirs('audit')],
    'The operator\'s own trigger, read through the custom shape, was altered.');
  const ourBlock = out.settings.automation.PreToolUse.find((b) => b.when === '*' && b !== out.settings.automation.PreToolUse[0]);
  assert.ok(ourBlock, 'Our own declarations were never written under the custom shape\'s root/entries/matcher keys.');
  assert.deepStrictEqual(ourBlock.triggers.map((e) => e.command), [
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 1 --frames 2',
    'node C:/fixture/ctxroute/src/hooks/doc-inject.js --client --frame 2 --frames 2',
  ]);
});

test('a malformed custom shape is a NAMED refusal, key by key, with the key quoted', () => {
  const declarations = plan(manifest(), machine());
  const at = (shape) => () => splice({ hooks: {} }, declarations, ROOT(), shape);

  expect(at({ rootKey: '', entriesKey: 'hooks', matcherKey: 'matcher' }))
    .toThrow('the splice was given no `rootKey` — it decides which entries of a file we do not own are DELETED, and a wrong name there empties the wrong branch');
  expect(at({ rootKey: 'hooks', entriesKey: 7, matcherKey: 'matcher' }))
    .toThrow('the splice was given no `entriesKey` — it decides which entries of a file we do not own are DELETED, and a wrong name there empties the wrong branch');
  expect(at({ rootKey: 'hooks', entriesKey: 'hooks', matcherKey: undefined }))
    .toThrow('the splice was given no `matcherKey` — it decides which entries of a file we do not own are DELETED, and a wrong name there empties the wrong branch');
});
