// ═══════════════════════════════════════════════════════════════════════
// THE HARNESS DIALECT OF A WIRING — the pure decision, in process
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHAT THIS MODULE DECIDES, AND WHY EVERY REFUSAL BELOW IS CONTRACT.
//    `wiring-dialect.js` turns the neutral declaration list into the DOCUMENT
//    a harness reads. Everything it gets wrong is silent by nature: a document
//    in the wrong syntax parses as nothing, a field with no key name is simply
//    absent, a matcher dropped widens a hook from one tool to every tool call.
//    None of those produce an error anywhere. So the refusals are asserted
//    LITERALLY — a diagnostic that fails without naming its cause sends the
//    reader hunting in the wrong file, and the wording is the whole value.
//
// ⚠️ EXPECTATIONS ARE WRITTEN OUT BY HAND, never read back from the module.
//    An assertion quoting the module under test is mutated WITH it and stops
//    seeing the mutant — that is `x === x`, and it has already cost this
//    repository 43 survivors in one measurement.
//
// ⚠️ FIXTURES ARE THUNKS, evaluated INSIDE the test. Under Stryker's perTest
//    coverage a module-level constant is a STATIC mutant: the runner keeps its
//    workers alive with modules cached, so the literal is never re-evaluated
//    and survives every test that could kill it.
//
// ⚠️ REACHED BY A STATIC ESM IMPORT, NEVER `createRequire` — MEASURED
//    2026-08-22 on this module's neighbour: Stryker resolves the covering
//    tests through the ESM module graph, and a `createRequire` edge is
//    INVISIBLE to it (601 mutants, zero test executed, on a file believed
//    covered).

import { test, expect } from 'vitest';
import assert from 'node:assert';
import {
  dialect, render, serialize, spliceObstacle,
  declarationFields, knownFormats, knownWriteModes, knownGroupings, knownMatcherPlaces,
  EVENT_PLACEHOLDER,
} from '../src/wiring-dialect.js';

/** A minimal, VALID harness in the shape this framework was born wiring. */
const NESTED = () => ({
  harness: {
    name: 'nested-harness',
    format: 'json',
    write: { mode: 'splice' },
    events: { PreToolUse: 'PreToolUse', PreCompact: 'PreCompact' },
    layout: {
      container: ['hooks', '{event}'],
      grouping: 'blocks',
      matcherIn: 'block',
      matcherKey: 'matcher',
      entriesKey: 'hooks',
      fields: {
        type: 'type', command: 'command', url: 'url', timeout: 'timeout', statusMessage: 'statusMessage',
      },
    },
  },
});

/** A VALID harness as far from the first as the vocabulary allows. */
const FLAT = () => ({
  harness: {
    name: 'flat-harness',
    format: 'toml',
    write: { mode: 'fragment', reason: 'invented, nothing on this machine to splice' },
    events: { PreToolUse: 'before_tool', UserPromptSubmit: 'on_prompt' },
    layout: {
      container: ['automation', 'triggers'],
      grouping: 'flat',
      matcherIn: 'entry',
      matcherKey: 'only_for',
      eventKey: 'when',
      fields: {
        type: 'kind', command: 'exec', url: 'endpoint', timeout: 'deadline_seconds', statusMessage: 'note',
      },
    },
  },
});

const DECLS = () => ([
  {
    event: 'PreToolUse', matcher: '*', type: 'command', command: 'node /r/gate.js --frame 1 --frames 2', timeout: 10,
  },
  {
    event: 'PreToolUse', matcher: '*', type: 'command', command: 'node /r/gate.js --frame 2 --frames 2', timeout: 10,
  },
  {
    event: 'PreCompact', matcher: null, type: 'command', command: 'node /r/reset.js --client', timeout: 5,
  },
]);

// ── ① THE CLOSED VOCABULARIES ────────────────────────────────────────
// Written out by hand: these lists are a CONTRACT, and deriving the expectation
// from the module would prove only that the module equals itself.
test('the vocabularies are closed and exactly what the manifest may declare', () => {
  assert.deepStrictEqual(declarationFields(), ['type', 'command', 'url', 'timeout', 'statusMessage']);
  assert.deepStrictEqual(knownFormats(), ['json', 'toml']);
  assert.deepStrictEqual(knownWriteModes(), ['splice', 'fragment']);
  assert.deepStrictEqual(knownGroupings(), ['blocks', 'flat']);
  assert.deepStrictEqual(knownMatcherPlaces(), ['block', 'entry', 'none']);
  assert.strictEqual(EVENT_PLACEHOLDER, '{event}');
});

// ── ② THE BLOCK IS REQUIRED, WITH NO DEFAULT ─────────────────────────
test('a manifest with no `harness` block is a NAMED REFUSAL, never one product assumed for another', () => {
  expect(() => dialect({ consumers: [] })).toThrow(/`harness` is missing/);
  expect(() => dialect({ harness: [] })).toThrow(/`harness` is missing/);
  expect(() => dialect(null)).toThrow(/unreadable manifest/);
  expect(() => dialect('a string')).toThrow(/unreadable manifest/);
});

test('an unknown FORMAT is refused, never written in the one we happen to know', () => {
  const m = NESTED();
  m.harness.format = 'yaml';
  expect(() => dialect(m)).toThrow(/`harness\.format` must be one of json \| toml, got "yaml"/);
  // CONTROL: the same manifest with a known format is accepted — otherwise the
  // red above would prove only that this cell reds on everything.
  assert.strictEqual(dialect(NESTED()).format, 'json');
});

test('the WRITE mode is declared, and a `fragment` must carry its reason', () => {
  const m = NESTED();
  m.harness.write = { mode: 'paste' };
  expect(() => dialect(m)).toThrow(/`harness\.write\.mode` must be one of splice \| fragment/);
  m.harness.write = 'splice';
  expect(() => dialect(m)).toThrow(/`harness\.write` is an object declaring at least `mode`/);
  m.harness.write = { mode: 'fragment' };
  expect(() => dialect(m)).toThrow(/`harness\.write\.reason` is a non-empty string when the mode is `fragment`/);
  m.harness.write = { mode: 'fragment', reason: '' };
  expect(() => dialect(m)).toThrow(/`harness\.write\.reason` is a non-empty string when the mode is `fragment`/);
  m.harness.write = { mode: 'fragment', reason: 'measured: cannot be rewritten losslessly' };
  assert.strictEqual(dialect(m).write.reason, 'measured: cannot be rewritten losslessly');
});

test('the harness NAME is required: a refusal that cannot name the harness sends the reader to the wrong file', () => {
  const m = NESTED();
  delete m.harness.name;
  expect(() => dialect(m)).toThrow(/`harness\.name` is a non-empty string/);
});

test('an EMPTY event map is refused — every consumer would be skipped and the document empty', () => {
  const m = NESTED();
  m.harness.events = {};
  expect(() => dialect(m)).toThrow(/`harness\.events` is empty/);
  m.harness.events = ['PreToolUse'];
  expect(() => dialect(m)).toThrow(/`harness\.events` maps this framework/);
  m.harness.events = { PreToolUse: 42 };
  expect(() => dialect(m)).toThrow(/`harness\.events\.PreToolUse` is a non-empty string/);
});

// ── ③ THE LAYOUT ─────────────────────────────────────────────────────
test('the LAYOUT is required and its container is a real path', () => {
  const m = NESTED();
  delete m.harness.layout;
  expect(() => dialect(m)).toThrow(/`harness\.layout` is missing for "nested-harness"/);

  const c = NESTED();
  c.harness.layout.container = [];
  expect(() => dialect(c)).toThrow(/`harness\.layout\.container` is a non-empty list of non-empty strings/);
  c.harness.layout.container = ['hooks', ''];
  expect(() => dialect(c)).toThrow(/`harness\.layout\.container` is a non-empty list of non-empty strings/);
  c.harness.layout.container = ['{event}', 'x', '{event}'];
  expect(() => dialect(c)).toThrow(/carries 2 `\{event\}` segments/);
});

test('grouping and matcher placement are a closed pair: a nesting level that carries nothing is refused', () => {
  const m = NESTED();
  m.harness.layout.grouping = 'tree';
  expect(() => dialect(m)).toThrow(/`harness\.layout\.grouping` must be one of blocks \| flat, got "tree"/);

  const b = NESTED();
  b.harness.layout.matcherIn = 'entry';
  expect(() => dialect(b)).toThrow(/requires `matcherIn: "block"`/);

  const f = FLAT();
  f.harness.layout.matcherIn = 'block';
  expect(() => dialect(f)).toThrow(/has no block to write a matcher into/);

  const x = NESTED();
  x.harness.layout.matcherIn = 'somewhere';
  expect(() => dialect(x)).toThrow(/`harness\.layout\.matcherIn` must be one of block \| entry \| none/);
});

test('the EVENT is written in exactly one place — container branch OR entry key, never both, never neither', () => {
  const both = NESTED();
  both.harness.layout.eventKey = 'when';
  expect(() => dialect(both)).toThrow(/`harness\.layout\.eventKey` may not be declared when `container` already branches/);

  const neither = FLAT();
  delete neither.harness.layout.eventKey;
  expect(() => dialect(neither)).toThrow(/`harness\.layout\.eventKey` is required for this layout/);

  const noEntries = NESTED();
  delete noEntries.harness.layout.entriesKey;
  expect(() => dialect(noEntries)).toThrow(/`harness\.layout\.entriesKey` is required for this layout/);

  const noMatcher = NESTED();
  delete noMatcher.harness.layout.matcherKey;
  expect(() => dialect(noMatcher)).toThrow(/`harness\.layout\.matcherKey` is required for this layout/);
});

test('a field mapping that names nothing this framework generates is a typo, refused', () => {
  const m = NESTED();
  m.harness.layout.fields.deadline = 'deadline';
  expect(() => dialect(m)).toThrow(/`harness\.layout\.fields\.deadline` names no field this framework generates/);
  const bad = NESTED();
  bad.harness.layout.fields.timeout = 7;
  expect(() => dialect(bad)).toThrow(/`harness\.layout\.fields\.timeout` is a non-empty string/);
  const gone = NESTED();
  delete gone.harness.layout.fields;
  expect(() => dialect(gone)).toThrow(/`harness\.layout\.fields` maps this framework/);
});

// ── ④ THE SPLICE IS A PROPERTY OF THE LAYOUT, NEVER OF A PRODUCT ─────
test('spliceObstacle names WHY a wiring cannot be edited in place, and stays silent when it can', () => {
  assert.strictEqual(spliceObstacle(dialect(NESTED())), null);

  const toml = NESTED();
  toml.harness.format = 'toml';
  assert.match(String(spliceObstacle(dialect(toml))), /destroys the operator's comments/);

  const flat = FLAT();
  flat.harness.format = 'json';
  assert.match(String(spliceObstacle(dialect(flat))), /its declarations are `flat`/);

  const deep = NESTED();
  deep.harness.layout.container = ['config', 'hooks', '{event}'];
  assert.match(String(spliceObstacle(dialect(deep))), /branches on the event at its second segment/);
});

// ── ⑤ RENDERING: NOTHING IS EVER SILENTLY DROPPED ────────────────────
test('the nested layout produces the document the harness reads, grouped per (event, matcher)', () => {
  const { document, skipped } = render(DECLS(), dialect(NESTED()));
  assert.deepStrictEqual(skipped, []);
  assert.deepStrictEqual(document, {
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: [
          { type: 'command', command: 'node /r/gate.js --frame 1 --frames 2', timeout: 10 },
          { type: 'command', command: 'node /r/gate.js --frame 2 --frames 2', timeout: 10 },
        ],
      }],
      PreCompact: [{ hooks: [{ type: 'command', command: 'node /r/reset.js --client', timeout: 5 }] }],
    },
  });
});

test('the flat layout writes the SAME declarations under other names, at another address', () => {
  const decls = DECLS().filter((d) => d.event === 'PreToolUse');
  const { document } = render(decls, dialect(FLAT()));
  assert.deepStrictEqual(document, {
    automation: {
      triggers: [
        {
          when: 'before_tool', only_for: '*', kind: 'command', exec: 'node /r/gate.js --frame 1 --frames 2', deadline_seconds: 10,
        },
        {
          when: 'before_tool', only_for: '*', kind: 'command', exec: 'node /r/gate.js --frame 2 --frames 2', deadline_seconds: 10,
        },
      ],
    },
  });
});

test('an event the harness does not have is SKIPPED and NAMED, never bodged onto a neighbour', () => {
  const { document, skipped, skippedEvents } = render(DECLS(), dialect(FLAT()));
  assert.deepStrictEqual(skippedEvents, ['PreCompact']);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].command, 'node /r/reset.js --client');
  // ANTI-VACUITY: the surviving declarations really were written. A renderer
  // that skipped everything would satisfy the two assertions above.
  assert.strictEqual(document.automation.triggers.length, 2);
});

test('a document in which EVERY path is skipped is a refusal, not an empty document', () => {
  const orphan = [{
    event: 'Stop', matcher: null, type: 'command', command: 'node /r/x.js', timeout: 3,
  }];
  expect(() => render(orphan, dialect(NESTED()))).toThrow(/declares none of the events this manifest's consumers use \(Stop\)/);
  expect(() => render([], dialect(NESTED()))).toThrow(/nothing to render/);
  expect(() => render(DECLS(), null)).toThrow(/render was given no validated dialect/);
});

test('a field the layout names NO key for is refused, never dropped', () => {
  const m = NESTED();
  delete m.harness.layout.fields.timeout;
  expect(() => render(DECLS(), dialect(m))).toThrow(/a declaration carries `timeout` and "nested-harness" names no key for it/);

  const u = NESTED();
  delete u.harness.layout.fields.url;
  const withUrl = [{
    event: 'PreToolUse', matcher: '*', type: 'http', url: 'http://127.0.0.1:8787/p?frame=1&frames=1', timeout: 10,
  }];
  expect(() => render(withUrl, dialect(u))).toThrow(/a declaration carries `url` and "nested-harness" names no key for it/);
});

test('a matcher on a harness that has none is refused: dropping it widens the hook to every tool call', () => {
  const m = FLAT();
  m.harness.layout.matcherIn = 'none';
  delete m.harness.layout.matcherKey;
  const d = dialect(m);
  expect(() => render(DECLS(), d)).toThrow(/2 declaration\(s\) carry a matcher and "flat-harness" declares `matcherIn: "none"`/);
  // CONTROL: the same harness renders fine for declarations that carry none.
  const plain = [{
    event: 'UserPromptSubmit', matcher: null, type: 'command', command: 'node /r/turn.js', timeout: 5,
  }];
  assert.strictEqual(render(plain, d).document.automation.triggers.length, 1);
});

test('two events spoken with ONE name are refused at the declaration, never merged into one branch', () => {
  const m = NESTED();
  m.harness.events = { PreToolUse: 'both', PreCompact: 'both' };
  expect(() => dialect(m)).toThrow(/`harness\.events` speaks both "PreToolUse" and "PreCompact" as "both"/);
  // CONTROL: distinct spellings of the same two events are accepted — the
  // refusal must bite on the collision and on nothing else.
  const ok = NESTED();
  ok.harness.events = { PreToolUse: 'before', PreCompact: 'compact' };
  assert.deepStrictEqual(dialect(ok).events, { PreToolUse: 'before', PreCompact: 'compact' });
});

// ── ⑥ THE WRITERS ────────────────────────────────────────────────────
test('the json writer produces a parseable document ending in a newline', () => {
  const text = serialize({ hooks: { a: [1] } }, 'json');
  assert.strictEqual(text.endsWith('\n'), true);
  assert.deepStrictEqual(JSON.parse(text), { hooks: { a: [1] } });
});

test('the toml writer emits array-of-table headers, scalars first, and no empty parent header', () => {
  const { document } = render(DECLS().filter((d) => d.event === 'PreToolUse'), dialect(FLAT()));
  const text = serialize(document, 'toml');
  assert.strictEqual(text.includes('[automation]\n'), false,
    'An empty `[automation]` header was written: TOML implies the parents of a dotted header, so that line says nothing in a document a human is meant to read.');
  assert.strictEqual(text.split('[[automation.triggers]]').length - 1, 2);
  assert.match(text, /when = "before_tool"/);
  assert.match(text, /deadline_seconds = 10/);
  assert.strictEqual(text.endsWith('\n'), true);
});

test('the toml writer emits a NESTED array of tables the way the format requires', () => {
  const text = serialize({ hooks: { SessionStart: [{ hooks: [{ type: 'command', timeout: 3 }] }] } }, 'toml');
  assert.match(text, /\[\[hooks\.SessionStart\]\]/);
  assert.match(text, /\[\[hooks\.SessionStart\.hooks\]\]/);
  assert.match(text, /type = "command"/);
  assert.match(text, /timeout = 3/);
});

test('the toml writer REFUSES what it will not escape, rather than guessing', () => {
  // Spec v1.0.0: a basic string must escape the quotation mark, the backslash
  // and control characters. This framework generates none of them, so a value
  // carrying one means the input stopped being what we think it is.
  expect(() => serialize({ a: 'C:\\Users\\x' }, 'toml')).toThrow(/holds a string this writer refuses to escape/);
  expect(() => serialize({ a: 'say "hi"' }, 'toml')).toThrow(/holds a string this writer refuses to escape/);
  expect(() => serialize({ a: 'one\ntwo' }, 'toml')).toThrow(/holds a string this writer refuses to escape/);
  expect(() => serialize({ 'not a bare key': 1 }, 'toml')).toThrow(/cannot be written as a TOML bare key/);
  expect(() => serialize({ a: null }, 'toml')).toThrow(/holds a value of type null/);
  expect(() => serialize({ a: 1 / 0 }, 'toml')).toThrow(/holds a non-finite number/);
  expect(() => serialize({ a: [1, 2] }, 'toml')).toThrow(/holds a list of values this writer does not produce/);
  // CONTROL: the forms this framework really produces go through.
  assert.match(serialize({ a: 'node C:/r/x.js --frame 1', b: 7, c: true }, 'toml'), /a = "node C:\/r\/x\.js --frame 1"/);
});

test('a format with no writer is a NAMED REFUSAL, never an accepted-and-inert capability', () => {
  expect(() => serialize({ a: 1 }, 'yaml')).toThrow(/no writer for format "yaml"/);
});
