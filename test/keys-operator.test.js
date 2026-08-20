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
import { matchingDocs, shouldSkip, composerKeys, composerKeysParAxe, keyDecision, heriterFiltres } from '../src/sources/file.js';

// ⚠️ Read through the ENGINE's own decision, never a twin: a helper that re-implements
//    ADJUST/REPLACE would prove itself instead of the engine.
const garde = (decl, cle) => keyDecision(decl, null).garde(cle);

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
  // 🔴 THE DERIVED HALF WAS ITSELF TWO FACTS UNTIL 20/08/2026 (evening) — 10th defect of the
  //    family. `commandCwd` named the DIRECTORY *and* the paths RECONSTRUCTED word by word,
  //    so a project merely QUOTED after a `cd` became a plausible path OF that project and
  //    triggered. MEASURED on the real corpus: 13,910 shell actions, **6,336 carrying a
  //    `cd` (46 %), 402,734 fabricated paths, up to 1,740 for a single command** — and one
  //    of them delivered a FOREIGN project's entire 90 KB skill into an unrelated session.
  //    `-command` shut the raw text; the reconstruction reopened the window.
  assert.ok(!injecte(doc({ pattern: 'projet-x/ls', keys: ['-commandPaths'] }), cmd('cd projet-x && ls')),
    'the RECONSTRUCTED paths must be cuttable ALONE — that is what stops a citation from injecting');
  assert.ok(injecte(doc({ pattern: 'projet-x/ls', keys: ['-commandCwd'] }), cmd('cd projet-x && ls')),
    'cutting the DIRECTORY must NOT cut the reconstruction: one name, one fact, and they are separable');
  assert.ok(injecte(doc({ pattern: 'projet-x', keys: ['-command', '-commandPaths'] }), cmd('cd projet-x && ls')),
    'the pair an entry actually writes: WORKING in the project still injects (only the directory is read)');
  assert.ok(!injecte(doc({ pattern: 'projet-x', keys: ['-command', '-commandPaths'] }), cmd('cd ailleurs && echo projet-x')),
    '…and CITING it fabricates nothing any more — the case that fired in production on 20/08');
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

// ═══ THE CATEGORY DEFAULT, AND HOW AN ENTRY COMPOSES WITH IT ═══════════
// 🔴 WHY THIS BLOCK EXISTS. `defaults.{source}` was REFUSED to `keys` on 19/08 with a written
//    reason; the refusal was measured wrong the next day — without that tier, making every doc
//    of a category stop reading ONE observable means writing it on 300+ entries, i.e. an
//    ENUMERATION born stale (class ㊽). And the tier alone is not enough: without COMPOSITION
//    it recreates the same enumeration one level up, since an entry wanting to adjust what its
//    category decided would have to restate the whole universe.
// 🛑 ONE RULE, TWO LEVELS, never two dialects: at least one `-` ⇒ ADJUST · only bare names ⇒
//    REPLACE. Read against the profile, and read against the category, identically.

test('the category default applies when the entry says nothing — that is the whole point of the tier', () => {
  assert.deepStrictEqual(composerKeys(undefined, ['-command']), ['-command']);
});

test('an entry that ADJUSTS composes with its category, it does not replace it', () => {
  // ⚠️ CONCATENATION, and it is the only correct form: a resolved LIST would read as REPLACE,
  //    and the universe of the FILTERS is not the declared keys but EVERY param minus the
  //    payload ones (㊿) — resolving would make `scope`/`exclude` blind to a remote MCP's
  //    `args.foo`, SILENTLY. The form must stay ADJUST so each axis adjusts ITS OWN universe.
  assert.deepStrictEqual(composerKeys(['-commandPaths'], ['-command']), ['-command', '-commandPaths']);
});

test('the ENTRY keeps the last word: its addition beats its category removal', () => {
  // ⚠️ ORDER IS LOAD-BEARING (category first, entry second): `keyDecision` lets `ajouts` win
  //    over `bannies`. Inverting the order would make a category silently override an entry —
  //    the opposite of every other setting of this engine.
  const compose = composerKeys(['-autre', 'commandPaths'], ['-commandPaths']);
  assert.ok(garde(compose, 'commandPaths'), 'the entry re-added the key its category had removed');
  assert.ok(!garde(compose, 'autre'), 'and its own removal still holds');
});

test('an entry that REPLACES wins whole — category included', () => {
  assert.deepStrictEqual(composerKeys(['cwd'], ['-command']), ['cwd']);
});

test('an ADJUST entry under a REPLACE category adjusts THAT list, never the profile', () => {
  // 🛑 The one case that cannot be concatenated: the category already replaced the universe, so
  //    the entry's `-` must bite on ITS list. Concatenating would let it adjust the PROFILE —
  //    a silent gap between what an author writes and what the engine reads.
  assert.deepStrictEqual(composerKeys(['-cwd'], ['file_path', 'cwd']), ['file_path']);
});

test('composition is PER AXIS — a `scope` default never leaks into the TRIGGER', () => {
  // 🔴 That leak has a measured price: 780 divergences on 19/08, "one declaration, two meanings
  //    depending on the axis reading it".
  assert.deepStrictEqual(
    composerKeysParAxe({ match: ['-commandPaths'] }, { match: ['-command'], scope: ['-cwd'] }),
    { match: ['-command', '-commandPaths'], scope: ['-cwd'] },
  );
});

test('PARITY — no category default, no composition: the entry is untouched, byte for byte', () => {
  // ⚠️ The fleet has no `defaults.{source}.keys` today, so this path must cost exactly nothing.
  const entree = { match: ['-command', '-commandPaths'] };
  assert.strictEqual(composerKeysParAxe(entree, undefined), entree, 'the very same object, not a copy');
});

test('an entry naming NOTHING never narrows: the category stands (fail-open on garbage)', () => {
  // ⚠️ A hand-edited config is never validated. An engine that guesses must guess in the
  //    direction that does NOT inject — but "names nothing" is not a restriction, it is an
  //    absence, so the category keeps deciding.
  for (const rien of [[], 'x', 42, null]) {
    assert.deepStrictEqual(composerKeys(rien, ['-command']), ['-command'], `entry ${JSON.stringify(rien)}`);
  }
});

// ── TOTALITY OF THE CASCADE — every guard has its case ─────────────────
// 🛑 These are not "coverage" cases. This function runs inside a hook on EVERY tool call and a
//    config is HAND-EDITABLE, never validated at runtime (`config-gate` is a test, not a runtime
//    guard). A throw here is not an exception: it is the whole fleet losing its docs. Each guard
//    below therefore has a case that FAILS if the guard flips — which is what makes the mutation
//    score mean something instead of decorating it.

test('AXES — the composed object carries exactly the three matching axes, never more', () => {
  // ⚠️ Derived from the same list the engine loops on: a 4th axis appearing here without a
  //    universe of its own would be accepted and INERT, the family of defect this repo names ㊴.
  assert.deepStrictEqual(
    Object.keys(composerKeysParAxe({ match: ['-a'], scope: ['-b'], exclude: ['-c'] },
      { match: ['-d'], scope: ['-e'], exclude: ['-f'] })).sort(),
    ['exclude', 'match', 'scope'],
  );
});

test('TOTALITY — a missing side is returned untouched, on both functions and both sides', () => {
  assert.deepStrictEqual(composerKeys(['-x'], undefined), ['-x'], 'no category: the entry stands');
  assert.deepStrictEqual(composerKeys(undefined, undefined), undefined, 'nothing on either side stays nothing');
  // ⚠️ IDENTITY, not equality, on BOTH sides: an absent side must be handed back UNTOUCHED.
  //    Asserting deep equality would let a rebuilt object pass — and a rebuild silently drops
  //    everything outside the three axes, which is how a shape changes for nothing.
  const seul = { match: ['-a'] };
  assert.strictEqual(composerKeysParAxe(undefined, seul), seul, 'no entry: the category object itself');
  assert.strictEqual(composerKeysParAxe(seul, undefined), seul, 'no category: the entry object itself');
  // ⚠️ FLAT + FLAT stays FLAT: taking the per-axis path here would turn one universe into three,
  //    and `keys: ["-command"]` would stop meaning "the same universe for the three axes".
  assert.deepStrictEqual(composerKeysParAxe(['-a'], ['-b']), ['-b', '-a']);
});

test('MIXED FORMS — a flat side and an object side go through the PER-AXIS path', () => {
  // 🛑 The flat form means "the same universe for the three axes". Composing it with an object
  //    by the flat path would silently apply ONE axis's default to all three — "one declaration,
  //    two meanings", measured at 780 divergences.
  assert.deepStrictEqual(composerKeysParAxe(['-a'], { match: ['-b'], scope: ['-c'] }),
    { match: ['-b', '-a'], scope: ['-c', '-a'], exclude: ['-a'] });
  assert.deepStrictEqual(composerKeysParAxe({ match: ['-a'] }, ['-b']),
    { match: ['-b', '-a'], scope: ['-b'], exclude: ['-b'] });
});

test('a category naming NOTHING lets the entry through — absence is not a restriction', () => {
  assert.deepStrictEqual(composerKeys(['-a'], []), ['-a'], 'an empty category list decides nothing');
  assert.deepStrictEqual(composerKeys(['-a'], 'garbage'), ['-a'], 'a non-list category is inert, never a throw');
});

test('heriterFiltres — the three filters, inherited or overridden, and NEVER a throw', () => {
  assert.deepStrictEqual(heriterFiltres(undefined, undefined), { keys: undefined }, 'nothing in, nothing out');
  assert.deepStrictEqual(heriterFiltres(null, null), { keys: undefined }, 'garbage in, still nothing out');
  assert.deepStrictEqual(heriterFiltres({}, ['not', 'an', 'object']), { keys: undefined },
    'a `defaults` that is a LIST is inert — an engine that guesses must guess towards NOT injecting');
  assert.deepStrictEqual(heriterFiltres({}, { scope: ['x'], exclude: ['y'] }), { keys: undefined, scope: ['x'], exclude: ['y'] },
    'an entry declaring nothing INHERITS its category — that is the whole point of the tier');
  assert.deepStrictEqual(heriterFiltres({ scope: ['mien'], exclude: ['mien'] }, { scope: ['x'], exclude: ['y'] }),
    { keys: undefined, scope: ['mien'], exclude: ['mien'] }, 'the entry wins WHOLE: a filter is a VALUE, never a universe');
  assert.deepStrictEqual(heriterFiltres({ scope: [], exclude: [] }, { scope: ['x'], exclude: ['y'] }),
    { keys: undefined, scope: ['x'], exclude: ['y'] }, 'an EMPTY list is "not declared" — historical loader semantics, kept to the byte');
  assert.deepStrictEqual(heriterFiltres({ scope: ['a'] }, {}), { keys: undefined, scope: ['a'] },
    'no category at all: the entry passes through unchanged, which is the fleet of today');
});

test('heriterFiltres — the shapes a HAND-EDITED config really produces, none of them a throw', () => {
  // 🛑 Each case below pins ONE guard. Not padding: this function runs inside a hook on every
  //    tool call, over a file nothing validates at runtime, so every shape a human can type must
  //    have a DEFINED answer — and "defined" must be proven, never assumed.
  assert.deepStrictEqual(heriterFiltres('chaine', 'chaine'), { keys: undefined },
    'a string on both sides: inert, never a property read on a primitive');
  assert.deepStrictEqual(heriterFiltres(['liste'], ['liste']), { keys: undefined },
    'a LIST where a block is expected: inert — a list is not a category default');
  // ⚠️ TWO EMPTY LISTS separates "not declared" from "declared empty". An empty array is TRUTHY,
  //    so posing it would change the rule SHAPE for nothing — the kind of detail that turns a
  //    differential red for a non-reason.
  assert.deepStrictEqual(heriterFiltres({ scope: [], exclude: [] }, { scope: [], exclude: [] }),
    { keys: undefined }, 'empty on both sides poses NOTHING');
  assert.deepStrictEqual(heriterFiltres({ scope: [] }, { scope: ['x'] }), { keys: undefined, scope: ['x'] },
    'empty entry, non-empty category: the category decides');
  assert.deepStrictEqual(heriterFiltres({ scope: ['a'] }, { scope: [] }), { keys: undefined, scope: ['a'] },
    'non-empty entry, empty category: the entry decides');
});
