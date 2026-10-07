// ═══════════════════════════════════════════════════════════════════════
// category-pure — WHO is acting (derived identity) and what a declaration requires
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  namespaceOf, groupsOf, declarationError, takeDeclaration, startError, contextFacts, admits, namesIdentity,
} from '../src/category-pure.js';
import { IDENTITY } from '../src/harness-profile.js';

// The identity profile is the one the Claude Code shells pass (copied from the caller).
const CC = IDENTITY.claudeCode;
const UNKNOWN_HARNESS = { ...CC, sendsAgentId: false };

// The payloads are COPIED from a real Claude Code capture (2026-10-07,
// `claude -p --settings` with a recording hook): a sub-agent's PreToolUse
// carries `agent_id` + `agent_type`, the main agent's carries neither.
const MAIN = { session_id: 's', tool_name: 'Glob', tool_input: {} };
const EXPLORE = { session_id: 's', tool_name: 'Glob', tool_input: {}, agent_id: 'a0a292643f11bc7f6', agent_type: 'Explore' };
const SUB_NO_TYPE = { session_id: 's', tool_name: 'Glob', tool_input: {}, agent_id: 'a1' };

const allow = (decl, facts) => admits(takeDeclaration(decl), facts);

// ── namespaces ──────────────────────────────────────────────────────────
test('namespaceOf names the three reserved namespaces and nothing else', () => {
  assert.strictEqual(namespaceOf('role:main'), 'role');
  assert.strictEqual(namespaceOf('type:plugin:foo'), 'type');
  assert.strictEqual(namespaceOf('depth:2'), 'depth');
  assert.strictEqual(namespaceOf('ops'), null);
  assert.strictEqual(namespaceOf('team:ops'), null);
  assert.strictEqual(namespaceOf(':role'), null);
  assert.strictEqual(namespaceOf('typeA:x'), null);
  assert.strictEqual(namespaceOf('xrole:main'), null);
});

// ── forms ───────────────────────────────────────────────────────────────
test('groupsOf: a string and a flat list are ONE group, a list of lists is AND of groups', () => {
  assert.deepStrictEqual(groupsOf('a'), [['a']]);
  assert.deepStrictEqual(groupsOf(['a', 'b']), [['a', 'b']]);
  assert.deepStrictEqual(groupsOf([['a', 'b'], ['c']]), [['a', 'b'], ['c']]);
});

test('groupsOf reads TOLERANTLY like the 22/09 flat form: blanks and non-strings are dropped', () => {
  assert.deepStrictEqual(groupsOf(['  ', 'ops', 7]), [['ops']]);
  assert.deepStrictEqual(groupsOf([['a', 2, ''], ['b']]), [['a'], ['b']]);
});

test('groupsOf answers null on the mixed form, on nothing usable, and on non-lists', () => {
  for (const bad of [['a', ['b']], [], [[]], [['a'], []], [['a'], ['  ']], [1], ['', 7], '   ', 42, null, undefined, {}]) {
    assert.strictEqual(groupsOf(bad), null, JSON.stringify(bad));
  }
});

test('declarationError accepts every legitimate form', () => {
  for (const ok of ['ops', ['ops', 'qa'], ['role:main'], ['role:subagent', '-type:Explore'], [['role:subagent'], ['-type:Explore']], ['-role:subagent'], ['type:plugin:foo']]) {
    assert.strictEqual(declarationError(ok), null, JSON.stringify(ok));
  }
});

test('declarationError refuses every form that would mute a doc forever', () => {
  const unsatisfiable = {
    'bare dash': ['-'],
    'double dash': ['--ops'],
    'depth fact': ['depth:2'],
    'negative depth': ['-depth:1'],
    'unknown role': ['role:boss'],
    'empty type': ['type:'],
    'one bad literal among good ones': [['ops'], ['depth:1']],
  };
  for (const [label, bad] of Object.entries(unsatisfiable)) {
    assert.notStrictEqual(declarationError(bad), null, label);
    assert.strictEqual(takeDeclaration(bad), undefined, label);
  }
  // A BLANK is a typo the AUTHOR must see, but the engine reads past it (22/09 parity).
  for (const typo of [['', 'ops'], [['ops', '  ']]]) {
    assert.match(declarationError(typo), /empty or badly typed/, JSON.stringify(typo));
    assert.notStrictEqual(takeDeclaration(typo), undefined, JSON.stringify(typo));
  }
  for (const bad of [['a', ['b']], [], [[]], 7]) assert.match(declarationError(bad), /empty or badly typed/, JSON.stringify(bad));
  for (const bad of [['a', ['b']], undefined, ['ops', 'depth:1']]) assert.strictEqual(takeDeclaration(bad), undefined, JSON.stringify(bad));
  assert.deepStrictEqual(takeDeclaration('ops'), [['ops']]);
});

// ── startError: at a context START only identity can be known (session docs, 2026-10-07) ──
test('startError: identity words (positive or negative) are fine at a start', () => {
  for (const ok of [['role:main'], ['-role:subagent'], [['role:subagent'], ['-type:Explore']], 'type:deploy']) {
    assert.strictEqual(startError(ok), null, JSON.stringify(ok));
  }
});

test('startError NAMES the first declared word, positive or negative — nothing is declared yet at a start', () => {
  assert.match(startError(['ops']), /^"ops": nothing is declared yet when a context starts/);
  assert.match(startError(['role:main', '-ops']), /^"-ops":/);
  assert.match(startError([['role:subagent'], ['qa']]), /^"qa":/);
});

test('startError says nothing about a FORM error (that is declarationError\'s job)', () => {
  for (const bad of [undefined, 7, [], ['a', ['b']]]) assert.strictEqual(startError(bad), null, JSON.stringify(bad));
});

test('declarationError SAYS what is wrong with each unsatisfiable literal', () => {
  assert.match(declarationError(['-']), /needs a category after "-"/);
  assert.match(declarationError(['--x']), /ONE leading "-"/);
  assert.match(declarationError(['depth:1']), /no depth fact ever exists/);
  assert.match(declarationError(['role:boss']), /a role is role:main or role:subagent/);
  assert.match(declarationError(['type:']), /a type needs a name/);
});

// ── facts ───────────────────────────────────────────────────────────────
test('contextFacts derives role:main for the main agent when the harness sends agent_id', () => {
  assert.deepStrictEqual(contextFacts([], MAIN, CC), { categories: ['role:main'], measured: ['role', 'type'] });
});

test('contextFacts derives role:subagent + type for a sub-agent gesture', () => {
  assert.deepStrictEqual(contextFacts([], EXPLORE, CC), { categories: ['role:subagent', 'type:Explore'], measured: ['role', 'type'] });
});

test('contextFacts: a sub-agent without a type leaves `type` UNMEASURED', () => {
  assert.deepStrictEqual(contextFacts([], SUB_NO_TYPE, CC), { categories: ['role:subagent'], measured: ['role'] });
});

test('contextFacts: on a harness NOT known to send agent_id, an absence proves nothing (no role at all)', () => {
  assert.deepStrictEqual(contextFacts([], MAIN, UNKNOWN_HARNESS), { categories: [], measured: [] });
  assert.deepStrictEqual(contextFacts([], MAIN, undefined), { categories: [], measured: [] });
});

test('contextFacts keeps declared categories, drops any that forge an identity, dedups', () => {
  const f = contextFacts(['ops', 'role:main', '-x', 'type:Explore', 'ops', '', 7], EXPLORE, CC);
  assert.deepStrictEqual(f.categories, ['ops', 'role:subagent', 'type:Explore']);
});

test('contextFacts is total on garbage', () => {
  assert.deepStrictEqual(contextFacts(undefined, undefined, CC), { categories: ['role:main'], measured: ['role', 'type'] });
  assert.deepStrictEqual(contextFacts('ops', { agent_id: 7 }, CC), { categories: ['role:main'], measured: ['role', 'type'] });
});

// ── the verdict ─────────────────────────────────────────────────────────
// ⚠️ THUNKS, never module-level values: a fixture computed at import runs OUTSIDE every test,
//    so a mutant that breaks it crashes the FILE and Stryker scores it as survived.
const main = () => contextFacts([], MAIN, CC);
const explore = () => contextFacts([], EXPLORE, CC);
const deploy = () => contextFacts([], { ...EXPLORE, agent_type: 'deploy' }, CC);
const unknown = () => contextFacts([], MAIN, UNKNOWN_HARNESS);
const declaredOps = () => contextFacts(['ops'], MAIN, CC);

test('main only / sub-agents only / one type only', () => {
  assert.deepStrictEqual([allow(['role:main'], main()), allow(['role:main'], explore())], [true, false]);
  assert.deepStrictEqual([allow(['role:subagent'], main()), allow(['role:subagent'], explore())], [false, true]);
  assert.deepStrictEqual([allow(['type:deploy'], deploy()), allow(['type:deploy'], explore()), allow(['type:deploy'], main())], [true, false, false]);
});

test('🛑 a negative SUBTRACTS: "sub-agents except Explore" never lets the MAIN agent in', () => {
  const decl = ['role:subagent', '-type:Explore'];
  assert.strictEqual(allow(decl, main()), false);
  assert.strictEqual(allow(decl, explore()), false);
  assert.strictEqual(allow(decl, deploy()), true);
});

test('a list of negatives alone means "everyone except"', () => {
  assert.deepStrictEqual([allow(['-role:subagent'], main()), allow(['-role:subagent'], explore())], [true, false]);
  assert.deepStrictEqual([allow(['-type:Explore'], main()), allow(['-type:Explore'], explore()), allow(['-type:Explore'], deploy())], [true, false, true]);
});

test('grouped form = AND of groups', () => {
  const decl = [['ops', 'qa'], ['role:subagent']];
  assert.strictEqual(allow(decl, contextFacts(['ops'], EXPLORE, CC)), true);
  assert.strictEqual(allow(decl, contextFacts(['ops'], MAIN, CC)), false);
  assert.strictEqual(allow(decl, explore()), false);
});

test('fail-closed: a negative on an UNMEASURED fact excludes — it never leaks', () => {
  assert.strictEqual(allow(['-role:subagent'], unknown()), false);
  assert.strictEqual(allow(['-type:Explore'], contextFacts([], SUB_NO_TYPE, CC)), false);
  assert.strictEqual(allow(['role:main'], unknown()), false);
});

test('parity with the 22/09 semantics on DECLARED names: OR, fail-closed when nothing is declared', () => {
  assert.strictEqual(allow(['ops'], main()), false);
  assert.strictEqual(allow(['ops', 'qa'], declaredOps()), true);
  assert.strictEqual(allow(['qa'], declaredOps()), false);
  assert.strictEqual(allow(['-ops'], declaredOps()), false);
  assert.strictEqual(allow(['-ops'], main()), true);
});

test('namesIdentity tells identity restrictions from declared ones', () => {
  assert.strictEqual(namesIdentity([['ops']]), false);
  assert.strictEqual(namesIdentity([['ops'], ['-role:subagent']]), true);
  assert.strictEqual(namesIdentity([['type:deploy']]), true);
  assert.strictEqual(namesIdentity([['ops', 'type:deploy']]), true, 'ONE identity word in a group is enough');
});
