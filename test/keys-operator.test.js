// ═══════════════════════════════════════════════════════════════════════════
// `keys` — THE OPERATOR THAT SAYS **WHERE** TO LOOK (2026-08-19)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS — the defect it closes, measured the day it was written.
//    Naming a project inside a SHELL COMMAND (a commit message, a heredoc, a path
//    passed to a script) injected its whole skill, exactly like working in it:
//    `match` reads the command's TEXT, and the text cannot tell "I work here" from
//    "I mention this". The universe of each operator was a GLOBAL constant
//    (`harness-profile.js`), identical for the fleet's 852 rules — no entry could say
//    "for me, ignore this parameter". `contentKeys` had proved the need at the global
//    scale (55 exclusions decided by CONTENT alone); this is the same need, per entry.
//
// ⚠️ WHAT IS REFUSED IS THE AMBIGUOUS, NEVER THE UNUSUAL. Splitting `scope` and
//    `exclude` is allowed even though it weakens ㊼ — it is the author's decision, and
//    it is VISIBLE in their entry. What the engine used to do SILENTLY is the defect;
//    what an author writes deliberately is the language doing its job.
import { test } from 'vitest';
import assert from 'node:assert';
import { validate } from '../src/frontmatter.js';
import { matchingDocs, shouldSkip } from '../src/sources/file.js';

const doc = (extra) => ({ doc: 'd', pattern: 'projet-x', ...extra });
const cmd = (command) => ({ toolName: 'Bash', toolInput: { command } });
const injecte = (rule, payload) => matchingDocs([rule], payload).length === 1;

// ── THE REAL CASE, both ways ────────────────────────────────────────────────
test('keys.match: CITING a project in a command no longer injects it…', () => {
  // ⚠️ NOT a `git ` command: those are ignored by the engine by design (a file name in a
  //    commit message is a known false positive). Using one here would make the PRECONDITION
  //    green for the WRONG reason — the exact shape of a test that proves nothing.
  const citation = cmd('echo "note: projet-x reste a corriger" >> memo.md');
  assert.ok(injecte(doc({}), citation), 'PRECONDITION: without `keys` the citation injects (that is the defect)');
  assert.ok(!injecte(doc({ keys: { match: ['-command'] } }), citation), 'blacklist: the command is out of the universe');
  assert.ok(!injecte(doc({ keys: { match: ['file_path'] } }), citation), 'whitelist: only file_path remains, so no command');
});

test('…but WORKING in it still does — the half that matters', () => {
  // 🛑 CONTROL WITHOUT WHICH THE OTHER TEST PROVES NOTHING: an operator that silences
  //    everything would pass the test above and destroy the framework's whole purpose.
  const travail = { toolName: 'Write', toolInput: { file_path: '/home/dev/projet-x/src/a.js', content: 'x' } };
  for (const k of [undefined, { match: ['-command'] }, { match: ['file_path'] }]) {
    assert.ok(injecte(doc(k ? { keys: k } : {}), travail), `real work must stay injected (keys=${JSON.stringify(k)})`);
  }
});

// ── THE TWO FORMS ───────────────────────────────────────────────────────────
test('flat form = the SAME universe for the three axes (the shortcut)', () => {
  // 🔴 THIS CASE ASSERTED THE OPPOSITE UNTIL 20/08/2026, AND IT WAS THE DEFECT ITSELF.
  //    It demanded that `-command` silence `cd projet-x && ls` — a gesture that WORKS in
  //    projet-x. MEASURED on 28,703 real actions: honouring that reading destroyed 2,281
  //    injections of which **1,087 (47.7 %) were real work**, i.e. the operator was
  //    unusable in the one situation it was written for. The raw TEXT and the DESIGNATED
  //    directory are two observables; `-command` drops the first, never the second.
  assert.ok(injecte(doc({ keys: ['-command'] }), cmd('cd projet-x && ls')),
    'working IN the project must still inject: the designated directory is its own observable');
  assert.ok(!injecte(doc({ keys: ['-command'] }), cmd('grep projet-x notes.md')),
    'QUOTING the project must no longer inject: that is the whole purpose of the operator');
  // ⚠️ THE REVERSE DIRECTION NEEDS A PATTERN ONLY THE RECONSTRUCTION CAN PRODUCE.
  //    `cd projet-x && ls` CONTAINS the string "projet-x" in its raw text, so a naive
  //    assertion here measures the raw half and proves nothing about the derived one —
  //    a mistake made and caught by this very test, one minute after writing it.
  assert.ok(injecte(doc({ pattern: 'projet-x/ls' }), cmd('cd projet-x && ls')),
    'PRECONDITION: only the reconstruction can produce this candidate');
  assert.ok(!injecte(doc({ pattern: 'projet-x/ls', keys: ['-commandCwd'] }), cmd('cd projet-x && ls')),
    'the halves are separable in BOTH directions — otherwise the split is one-way and unproven');
  assert.ok(injecte(doc({ keys: ['-content'] }), cmd('cd projet-x && ls')), 'removing an unrelated key changes nothing');
});

test('a WHITELIST REPLACES the universe — it can WIDEN, not only shrink', () => {
  // 🔑 "Zero blocking": intersecting with the default would make `keys` able only to
  //    narrow, and half the combinations would be unreachable. Here `description` is
  //    NOT a path key of any profile, yet the entry makes the trigger read it.
  const payload = { toolName: 'X', toolInput: { description: 'refonte projet-x' } };
  assert.ok(!injecte(doc({}), payload), 'PRECONDITION: unread by default');
  assert.ok(injecte(doc({ keys: { match: ['description'] } }), payload), 'the entry widens its own universe');
});

// ── PER-AXIS INDEPENDENCE ───────────────────────────────────────────────────
test('the axes are INDEPENDENT: narrowing `match` leaves the filters untouched', () => {
  const input = { file_path: '/p/projet-x/a.js', command: 'echo secret' };
  // `scope` still sees the command (its axis was not narrowed) → the rule applies.
  assert.ok(!shouldSkip({ scope: ['secret'], keys: { match: ['-command'] } }, '/p/projet-x/a.js', input));
  // …and narrowing the `scope` axis DOES hide it → the rule is skipped.
  assert.ok(shouldSkip({ scope: ['secret'], keys: { scope: ['-command'] } }, '/p/projet-x/a.js', input));
});

test('`scope` and `exclude` may be given DIFFERENT universes (allowed, and visible)', () => {
  const input = { file_path: '/p/a.js', command: 'deploy prod' };
  // exclude blind to the command (its axis excludes it) → nothing to exclude;
  // scope still sees it → the rule holds. Deliberate, written in the entry.
  assert.ok(!shouldSkip(
    { scope: ['deploy'], exclude: ['prod'], keys: { exclude: ['-command'] } },
    '/p/a.js', input,
  ));
});

// ── ANTI-INERTNESS + POSITIVE CONTROL ───────────────────────────────────────
test('⚠️ ANTI-INERTNESS: a rule WITHOUT `keys` is strictly unchanged', () => {
  // Without this, an operator that did nothing at all would pass every test above
  // by accident, and the 852 rules of the fleet would silently keep the old behaviour.
  const input = { file_path: '/p/projet-x/a.js', command: 'echo projet-x' };
  assert.ok(injecte(doc({}), { toolName: 'X', toolInput: input }));
  assert.ok(!shouldSkip({ scope: ['echo'] }, '/p/projet-x/a.js', input));
});

test('an EMPTY or absent declaration never restricts (omission ≠ restriction)', () => {
  const payload = cmd('cd projet-x && ls');
  assert.ok(injecte(doc({ keys: [] }), payload), 'an empty list is not a whitelist of nothing');
  assert.ok(injecte(doc({ keys: { scope: ['-x'] } }), payload), 'an axis left out keeps its default universe');
});

// ── THE VALIDATOR REFUSES WHAT THE ENGINE CANNOT READ ───────────────────────
test('the validator refuses the AMBIGUOUS, and only that', () => {
  assert.deepStrictEqual(validate({ match: 'a', keys: ['file_path'] }), []);
  assert.deepStrictEqual(validate({ match: 'a', keys: ['-command'] }), []);
  assert.deepStrictEqual(validate({ match: 'a', scope: ['s'], keys: { match: ['a'], scope: ['-b'] } }), []);
  // ✅ THE MIXED FORM IS LEGAL SINCE 20/08/2026 — "the default, minus this, plus that".
  //    It used to be refused, and that refusal forced whoever wanted to ADD one key to
  //    re-enumerate the whole universe by hand: an enumeration born stale (class ㊽).
  assert.deepStrictEqual(validate({ match: 'a', keys: ['-command', 'content'] }), []);
  for (const bad of [[], ['-'], [''], 'x', { bidon: ['a'] }, {}, { match: [] }]) {
    assert.ok(validate({ match: 'a', keys: bad }).length > 0, `accepted an unreadable form: ${JSON.stringify(bad)}`);
  }
});

test('`keys` declared ALONE is refused — an inert key looks exactly like a working one', () => {
  assert.ok(validate({ mode: 'once', keys: ['-command'] }).length > 0);
});

// ── RUNTIME ROBUSTNESS: the validator refuses, the engine must still not guess ──
test('the MIXED form ADJUSTS the default universe — minus the removals, plus the names', () => {
  // 🔴 THIS CASE ASSERTED A REFUSAL UNTIL 20/08/2026, AND THE REFUSAL WAS THE HOLE.
  //    "Everything the profile declares, PLUS this one key" was expressible only as a
  //    hand-written enumeration of the whole universe — which stops following the profile
  //    the day it gains a key, SILENTLY. That is class ㊽ (a list born stale), reintroduced
  //    by a validator. The reading rule is one line and decidable by looking: a `-` present
  //    ⇒ you ADJUST · no `-` ⇒ you REPLACE.
  const payload = { toolName: 'Bash', toolInput: { command: 'grep projet-x notes.md', description: 'refonte projet-x' } };
  assert.ok(injecte(doc({}), payload), 'PRECONDITION: the raw command carries the pattern');
  assert.ok(!injecte(doc({ keys: { match: ['-command'] } }), payload), 'the removal applies');
  assert.ok(injecte(doc({ keys: { match: ['-command', 'description'] } }), payload),
    '…and the addition reaches a key the profile never declared, WITHOUT re-enumerating the rest');
  // 🛑 THE ADDITION MUST NOT SMUGGLE THE REST BACK IN: `description` becomes readable, the
  //    removed `command` stays removed. Otherwise "adjust" would silently mean "replace by
  //    everything", i.e. an operator that widens when the author asked it to narrow.
  assert.ok(!injecte(doc({ pattern: 'notes.md', keys: { match: ['-command', 'description'] } }), payload),
    'what was removed stays removed');
});

test('ADJUST keeps the SURVIVING default keys — an addition never replaces the rest', () => {
  // 🔴 THE MUTANT THIS KILLS: `triggerKeys` returning `d.ajouts` alone instead of
  //    "default minus removals PLUS additions". It survived because the first mixed-form case
  //    removed the ONLY default key of its axis — so "the rest" was empty and the two readings
  //    agreed. **A capability is only measured by a case where it can differ**: here the removal
  //    targets a path key that is NOT the one carrying the value, so a surviving default must
  //    still be read. Same lesson as the domain that does not reach a capability.
  const payload = { toolName: 'Edit', toolInput: { file_path: '/p/projet-x/a.js', description: 'note' } };
  assert.ok(injecte(doc({ keys: { match: ['-remotePath', 'description'] } }), payload),
    'file_path survives the removal of another path key, and must still trigger');
});

test('a non-object, non-list `keys` reaching the engine is inert, never a crash', () => {
  // Totality: the engine must never throw on a malformed config — a dead hook injects
  // NOTHING anywhere, which is worse than the misconfiguration it would report.
  for (const bad of ['x', 42, true, null]) {
    assert.doesNotThrow(() => matchingDocs([doc({ keys: bad })], cmd('cd projet-x && ls')));
  }
});

test('a WHITELIST on a FILTER axis keeps the named key — and only it', () => {
  // ⚠️ The blacklist tests above only prove what DISAPPEARS. Without this positive case, a
  //    whitelist that kept NOTHING would pass them all: the rule would simply stop matching,
  //    which looks like "the filter did its job". Two survivors measured before it existed.
  const input = { file_path: '/p/a.js', command: 'deploy prod' };
  // `scope` restricted to `command`: the word lives there → the rule holds.
  assert.ok(!shouldSkip({ scope: ['deploy'], keys: { scope: ['command'] } }, '/p/a.js', input));
  // …the same scope restricted to `file_path`: the word is NOT there → the rule is skipped.
  assert.ok(shouldSkip({ scope: ['deploy'], keys: { scope: ['file_path'] } }, '/p/a.js', input));
});
