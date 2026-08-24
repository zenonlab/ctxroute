// ═══════════════════════════════════════════════════════════════════════
// frontmatter.js — DETERMINISTIC tests (Stryker target)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ CREATED ON 15/07/2026 AFTER A DOCTRINE AUDIT: this module had ONLY
//    property-tests. But Stryker does NOT run the properties (unit only) →
//    100% of its mutants would have survived, a mute score on the parser that decides
//    whether 292 docs are alive or dead.
//    The property test looks for the UNKNOWN; the deterministic case locks the KNOWN.
//    Both, never one instead of the other.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { parse, validate, validateMcp, isMatchDecl, toolList, MODES, DRIFT_UNITS, KNOWN, TRIGGERS, WILDCARD } from '../src/frontmatter.js';

// ── parse: detection of the block ──
test('parse: frontmatter at the head → data + body separated', () => {
  const r = parse('---\nmatch: a.js\n---\nbody');
  assert.deepStrictEqual(r.data, { match: 'a.js' });
  assert.strictEqual(r.body, 'body');
  assert.strictEqual(r.hasFrontmatter, true);
});
test('parse: without frontmatter → FULL body, never truncated', () => {
  const r = parse('# doc\ntext');
  assert.strictEqual(r.body, '# doc\ntext');
  assert.strictEqual(r.hasFrontmatter, false);
  assert.deepStrictEqual(r.data, {});
});
test('55 parse: the GROUPED form of `scope` (JSON) returns NESTED LISTS, never flat literals', () => {
  // 🔴 REAL DEFECT (15/08/2026, 1st doc of the fleet to write the grouped form):
  //    parseList cut on the INTERNAL commas → flat strings `'["a"]'`,
  //    VALID to the validator (flat form) → a rule mute IN SILENCE.
  const r = parse('---\ntool: ["*"]\nscope: [["ctxroute"], ["gate.js", "pretool-core.js"]]\n---\nc');
  assert.deepStrictEqual(r.data.scope, [['ctxroute'], ['gate.js', 'pretool-core.js']]);
  assert.deepStrictEqual(validate(r.data), []);
});
test('55 parse: the FLAT form of `scope` is UNTOUCHED (JSON-quoted or bare historical)', () => {
  assert.deepStrictEqual(parse('---\nmatch: a.js\nscope: ["x", "y"]\n---\nc').data.scope, ['x', 'y']);
  assert.deepStrictEqual(parse('---\nmatch: a.js\nscope: [x, y]\n---\nc').data.scope, ['x', 'y']);
});
test('55 parse: a BADLY WRITTEN grouped form (unquoted) stays RAW — validate RED, never silent flat garbage', () => {
  const r = parse('---\nmatch: a.js\nscope: [[a], [b]]\n---\nc');
  assert.strictEqual(typeof r.data.scope, 'string');
  assert.ok(validate(r.data).length > 0);
});
test('55 parse: a FLAT list one of whose elements is valid JSON keeps its historical reading', () => {
  // Counter-example found by the round-trip property on 15/08/2026: with
  // unconditional JSON-first, `[{}]` became [object] instead of ['{}'].
  assert.deepStrictEqual(parse('---\nmatch: a.js\nscope: [{}]\n---\nc').data.scope, ['{}']);
});
test('55 parse: `exclude: [["a"]]` returns the NESTED LIST — so that validate can REFUSE it loudly', () => {
  // Through parseList, the grouped form became the STRING `'["a"]'`: flat, VALID,
  // a rule almost dead IN SILENCE. The refusal is only possible if the parse sees it.
  const r = parse('---\nmatch: a.js\nexclude: [["a"]]\n---\nc');
  assert.deepStrictEqual(r.data.exclude, [['a']]);
  assert.ok(validate(r.data).length > 0, 'grouped form on exclude = RED, never silent');
});
test('55 parse: ONLY scope/exclude go through the JSON — `note` stays raw text', () => {
  assert.strictEqual(typeof parse('---\nmatch: a.js\nnote: {"x":1}\n---\nc').data.note, 'string');
  // `match: [[a]]` keeps its historical reading (a list of one pattern `[a]`) — the
  // JSON path NEVER concerns the triggers, even on a value starting with `[[`.
  assert.deepStrictEqual(parse('---\nmatch: [[a]]\n---\nc').data.match, ['[a]']);
});
test('parse: parseList discards the EMPTY elements of a historical list', () => {
  assert.deepStrictEqual(parse('---\nmatch: [a.js, , b.js]\n---\nc').data.match, ['a.js', 'b.js']);
});
test('parse: CRLF (Windows) supported', () => {
  // ⚠️ Without this, 100% of the docs edited under Windows would have no frontmatter.
  assert.strictEqual(parse('---\r\nmatch: a.js\r\n---\r\nbody').data.match, 'a.js');
});
test('parse: UTF-8 BOM supported', () => {
  assert.strictEqual(parse('﻿---\nmatch: a.js\n---\nc').data.match, 'a.js');
});
test('parse: `---` NOT at the head → not a frontmatter', () => {
  const r = parse('text\n---\nmatch: a.js\n---\n');
  assert.strictEqual(r.hasFrontmatter, false);
});
test('parse: non-string → totality (never a throw)', () => {
  for (const v of [null, undefined, 42, {}, []]) {
    const r = parse(v);
    assert.strictEqual(r.hasFrontmatter, false);
    assert.strictEqual(r.body, '');
  }
});

// ── parse: scalars ──
test('parse: booleans', () => {
  // ⚠️ This used to cover `confirm` until 05/08/2026 (removed). `enforce` is the
  //    boolean of the vocabulary — the parser MUST return a real boolean, not the
  //    string "true": a non-boolean value is REFUSED by validate().
  assert.strictEqual(parse('---\nenforce: true\n---\n').data.enforce, true);
  assert.strictEqual(parse('---\nenforce: false\n---\n').data.enforce, false);
});
test('parse: numbers — ONLY if the whole string is a number', () => {
  // ⚠️ Number() alone would accept too much: "12-factor" would become 12.
  assert.strictEqual(parse('---\nrank: 42\n---\n').data.rank, 42);
  assert.strictEqual(parse('---\nrank: -3\n---\n').data.rank, -3);
  assert.strictEqual(parse('---\nrank: 1.5\n---\n').data.rank, 1.5);
  assert.strictEqual(parse('---\nmatch: 12-factor\n---\n').data.match, '12-factor');
});
test('parse: quotes removed only if they wrap EVERYTHING', () => {
  assert.strictEqual(parse('---\nmatch: "a.js"\n---\n').data.match, 'a.js');
  assert.strictEqual(parse("---\nmatch: 'a.js'\n---\n").data.match, 'a.js');
});
test('parse: inline lists [a, b]', () => {
  assert.deepStrictEqual(parse('---\nscope: [a, b]\n---\n').data.scope, ['a', 'b']);
  assert.deepStrictEqual(parse('---\nscope: []\n---\n').data.scope, []);
});
test('parse: comments and empty lines ignored', () => {
  assert.deepStrictEqual(parse('---\n# note\n\nmatch: a.js\n---\n').data, { match: 'a.js' });
});
test('parse: a non-conforming line is IGNORED, never a throw (totality)', () => {
  assert.deepStrictEqual(parse('---\nanything at all\nmatch: a.js\n---\n').data, { match: 'a.js' });
});

// ── validate: THE gate ──
test('validate: minimal valid declaration', () => {
  assert.deepStrictEqual(validate({ match: 'a.js' }), []);
});
test('validate: `match` missing/empty/badly typed → ERROR (never a mute doc)', () => {
  for (const bad of [undefined, '', '   ', 42, [], [42], ['']]) {
    assert.ok(validate({ match: bad }).length > 0, `invalid match accepted: ${JSON.stringify(bad)}`);
  }
});
test('validate: `match` accepts a string OR a list (98 of the 292 docs are multi-pattern)', () => {
  assert.deepStrictEqual(validate({ match: 'a.js' }), []);
  assert.deepStrictEqual(validate({ match: ['a.js', 'b.js'] }), []);
});
test('validate: scope/exclude must be lists', () => {
  assert.ok(validate({ match: 'a', scope: 'x' }).length > 0);
  assert.ok(validate({ match: 'a', exclude: 'x' }).length > 0);
  assert.deepStrictEqual(validate({ match: 'a', scope: ['x'], exclude: ['y'] }), []);
});
test('validate: mode limited to dumb|once|smart', () => {
  // ⚠️ Values HARD-CODED, never `for (const m of MODES)`: a test that derives its
  //    expectation from the value it checks MUTATES WITH IT → a surviving mutant
  //    (lived on 15/07/2026: mutating 'once' → "" went unnoticed).
  //    `mode` is a public CONTRACT (the docs' frontmatter), not an internal detail.
  assert.deepStrictEqual(validate({ match: 'a', mode: 'dumb' }), []);
  assert.deepStrictEqual(validate({ match: 'a', mode: 'once' }), []);
  assert.deepStrictEqual(validate({ match: 'a', mode: 'smart' }), []);
  assert.ok(validate({ match: 'a', mode: 'turbo' }).length > 0);
  assert.ok(validate({ match: 'a', mode: '' }).length > 0);
  assert.deepStrictEqual(MODES, ['dumb', 'once', 'smart'], 'the contract of the modes has changed');
});
test('validate: numeric rank', () => {
  assert.ok(validate({ match: 'a', rank: '3' }).length > 0);
  assert.deepStrictEqual(validate({ match: 'a', rank: 0 }), []);
});
test('validate: UNKNOWN key rejected (typo `mach:` = a doc dead in silence)', () => {
  assert.ok(validate({ match: 'a', mach: 'b' }).length > 0);
  assert.ok(validate({ match: 'a', Match: 'b' }).length > 0);
});
// ⚠️ NO "all the known keys together" test: that has become IMPOSSIBLE
//    by design — `inject: never` EXCLUDES any trigger. Such a test
//    would require accepting a contradiction. The 2 families are tested separately.
test('validate: all the COMPATIBLE keys accepted together', () => {
  // ⚠️ `mcp` REMOVED from this case on 31/07/2026: it is no longer a trigger of the
  //    file corpus (§A) — leaving it in would amount to re-certifying the false green.
  assert.deepStrictEqual(validate({ match: 'a', scope: ['s'], exclude: ['e'], mode: 'dumb', rank: 1, threshold: 3 }), []);
  // ⚠️ Contract written HARD-CODED — NEVER derive it from KNOWN (it would mutate with the code).
  // ⚠️ `note` ADDED on 04/08/2026 — an author's comment, NEVER read by the engine.
  // ⚠️ DELIBERATE UPDATE (05/08/2026): `enforce` added. This test turned red
  //    first — that is its role: the vocabulary never extends itself by
  //    accident. Adding a key MUST cost an explicit decision here.
  // ⚠️ DELIBERATE UPDATE (19/08/2026): `keys` added — the operator that says WHERE the
  //    others look (which parameter keys an entry may see). Whitelist `["file_path"]`
  //    REPLACES the universe, blacklist `["-command"]` removes from it; per axis via
  //    `{match, scope, exclude}`. This test turned red first, which is its job.
  assert.deepStrictEqual(KNOWN, ['match', 'mcp', 'rules', 'tool', 'inject', 'scope', 'exclude', 'keys', 'mode', 'rank', 'threshold', 'driftUnit', 'note', 'enforce']);
  // The operator composes with everything, on both shapes.
  assert.deepStrictEqual(validate({ match: 'a', keys: ['-command'] }), []);
  assert.deepStrictEqual(validate({ match: 'a', scope: ['s'], keys: { match: ['file_path'], scope: ['-content'] } }), []);
  // ⚠️ HARD-CODED contract for DRIFT_UNITS too (single source of the unit vocabulary).
  assert.deepStrictEqual(DRIFT_UNITS, ['tool', 'turn']);
  // ⚠️ HARD-CODED contract of the TRIGGERS (4 since 19/07/2026: + `tool`).
  assert.deepStrictEqual(TRIGGERS, ['match', 'rules', 'tool']);
});

test('validate: `tool` ALONE = a sufficient trigger; empty/badly typed = RED', () => {
  assert.deepStrictEqual(validate({ tool: 'WebFetch', mode: 'dumb' }), []);
  assert.deepStrictEqual(validate({ tool: ['WebFetch', 'WebSearch'], mode: 'dumb' }), []);
  assert.ok(validate({ tool: '', mode: 'dumb' }).length > 0);
  assert.ok(validate({ tool: [], mode: 'dumb' }).length > 0);
});

// ── `rules:` — per-entry JSON (31/103 docs with divergent scopes, measured 16/07) ──
test('parse: `rules:` inline JSON → objects read back as they are', () => {
  const d = parse('---\nrules: [{"pattern":"a.js","scope":["s"]},{"pattern":"b.js"}]\n---\nc').data;
  assert.deepStrictEqual(d.rules, [{ pattern: 'a.js', scope: ['s'] }, { pattern: 'b.js' }]);
});
test('parse: BROKEN `rules:` JSON → raw value, never a throw (totality)', () => {
  const d = parse('---\nrules: [{oops\n---\nc').data;
  assert.strictEqual(typeof d.rules, 'string');
  assert.ok(validate(d).length > 0, 'an unreadable rules MUST be red, not silent');
});
test('validate: a valid `rules` ALONE = a sufficient trigger (0 error)', () => {
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'a.js' }] }), []);
});
test('validate: `rules` + `match`/`scope`/`exclude` = CONTRADICTION', () => {
  for (const extra of [{ match: 'a.js' }, { scope: ['s'] }, { exclude: ['e'] }]) {
    assert.ok(validate({ rules: [{ pattern: 'a.js' }], ...extra }).length > 0, JSON.stringify(extra));
  }
});
test('validate: a `rules` entry without a pattern, with an unknown key, or with a non-list scope = RED', () => {
  assert.ok(validate({ rules: [{}] }).length > 0, 'missing pattern');
  assert.ok(validate({ rules: [{ pattern: '  ' }] }).length > 0, 'empty pattern');
  assert.ok(validate({ rules: [{ pattern: 'a.js', banana: 'b' }] }).length > 0, 'unknown key');
  assert.ok(validate({ rules: [{ pattern: 'a.js', scope: 'oops' }] }).length > 0, 'non-list scope');
  assert.ok(validate({ rules: [{ pattern: 'a.js', exclude: [''] }] }).length > 0, 'exclude with an empty string');
  assert.ok(validate({ rules: ['a.js'] }).length > 0, 'non-object entry');
  assert.ok(validate({ rules: [] }).length > 0, 'empty list = a dead doc');
});
test('validate: `rules` with VALID scope/exclude = 0 error (never a false red)', () => {
  // ⚠️ Kills the mutants that would make the validation always-red: 31 real
  //    docs go out with `rules:` — a false red would block them ALL at the gate.
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'a.js', scope: ['s'], exclude: ['e'] }] }), []);
});
// ── Trap #1 (lived 19/07): `rules:` written as a YAML BLOCK instead of inline JSON ──
// ⚠️ The error message MUST be SELF-REPAIRING: it gives the exact snippet to paste.
//    This test seals that (a) the YAML block is red, (b) the snippet SHOWN is valid —
//    otherwise we would return a false example, worse than no example.
test('validate: `rules:` as a YAML block = RED + the message gives the canonical format', () => {
  // parse() returns an array of objects for the YAML block `- pattern:` → the shape {pattern} without the other keys.
  // The real trap = the user writes a STRING or a non-conforming form; here we test the non-list form.
  const errs = validate({ rules: 'foo' }); // a string instead of a list (result of a broken JSON, cf total parse)
  assert.ok(errs.length > 0, 'a non-list rules MUST be red');
  assert.ok(errs.some((e) => /rules: \[\{/.test(e)), 'the message MUST contain the canonical snippet ready to paste');
  // The snippet shown in the message is ITSELF valid (never a false example):
  const canonical = [{ pattern: 'foo.js' }, { pattern: 'bar.js', scope: ['project'] }];
  assert.deepStrictEqual(validate({ rules: canonical }), []);
});
test('validate: a MIXED list (one valid + one invalid) = RED (every, never some)', () => {
  assert.ok(validate({ rules: [{ pattern: 'a.js', scope: ['ok', ''] }] }).length > 0, 'scope [ok, ""]');
  assert.ok(validate({ rules: [{ pattern: 'a.js', scope: ['ok', 42] }] }).length > 0, 'scope [ok, 42]');
  assert.ok(validate({ rules: [{ pattern: 'a.js', exclude: ['ok', '  '] }] }).length > 0, 'exclude [ok, blank]');
});
test('validate: `rules[].rank` a number = valid, a non-number = RED', () => {
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'a.js', rank: 5 }] }), []);
  assert.ok(validate({ rules: [{ pattern: 'a.js', rank: '5' }] }).length > 0);
});
test('validate: `inject: never` + `rules` = CONTRADICTION', () => {
  assert.ok(validate({ inject: 'never', rules: [{ pattern: 'a.js' }] }).length > 0);
});

// ── `inject: never` — declared silence (14 mute docs measured on 15/07) ──
test('validate: `inject: never` ALONE = valid (reference doc, on-demand)', () => {
  assert.deepStrictEqual(validate({ inject: 'never' }), []);
  assert.deepStrictEqual(validate({ inject: 'never', mode: 'dumb' }), []);
});
test('validate: `inject: never` + a trigger = CONTRADICTION (never a guessed precedence)', () => {
  assert.ok(validate({ inject: 'never', match: 'a.js' }).length > 0);
  assert.ok(validate({ inject: 'never', mcp: 'stripe' }).length > 0);
});
// ⚠️ WEAK TEST FIXED (surviving mutant in CI, 15/07/2026): the 1st version
//    did `validate({ inject: v })` WITHOUT a trigger — it passed thanks to
//    the "no trigger" error, NEVER thanks to the `inject` check, which
//    was therefore never exercised. A valid `match` IS needed to isolate the check.
//    Lesson: a green test that passes for the wrong reason tests nothing.
test('validate: `inject` accepts ONLY "never" (no 2nd way of saying match:)', () => {
  for (const v of ['always', 'auto', 'Never', true, 1, '', 0]) {
    const errs = validate({ match: 'a.js', inject: v });
    assert.ok(errs.length > 0, `inject: ${JSON.stringify(v)} should be rejected`);
    assert.ok(errs.some((e) => e.includes('inject')), `the error must target \`inject\`, not something else: ${errs}`);
  }
});

// ── Triggers of the FILE corpus: `match` / `rules` / `tool` ──
// ⚠️ REWRITTEN on 31/07/2026 (§A). These tests certified that a FILE doc
//    carrying `mcp:` is VALID — that was the FALSE GREEN itself, carved into the
//    suite: validate() returned 0 errors and the doc was MUTE (no source
//    consumes that key for this corpus; the MCP channel is triggered by the
//    PATH docs/mcp/{server}.md and is validated by validateMcp).
//    ⚠️ A test that certifies dead code is WORSE than an absent test: it
//    turns the bug into a contract, and the next agent defends it.
test('§A: `mcp:` in a FILE doc = RED (before: 0 error, a mute doc)', () => {
  assert.ok(validate({ mcp: 'stripe' }).length > 0);
  assert.ok(validate({ mcp: ['stripe', 'odoo'] }).length > 0);
  // Even with a VALID trigger alongside: the inert key stays an error —
  // the author would otherwise believe they had wired two channels, they only have one.
  assert.ok(validate({ match: 'ssh-helper.js', mcp: ['ssh'] }).length > 0);
});
test('§A: the message says WHERE the doc should have gone (paved road, not just a refusal)', () => {
  const text = validate({ mcp: 'stripe' }).join(' | ');
  assert.ok(/PATH/.test(text));
  assert.ok(/docs\/mcp\//.test(text));
});
test('validate: a FILE doc on its own stays valid', () => {
  assert.deepStrictEqual(validate({ match: 'lock.js' }), []);
});
test('validate: ZERO trigger = RED (a doc dead in silence = the bug we kill)', () => {
  assert.ok(validate({}).length > 0);
  assert.ok(validate({ mode: 'dumb' }).length > 0);
});
test('validate: a trigger PRESENT but empty/badly typed = RED', () => {
  assert.ok(validate({ match: '' }).length > 0);
  assert.ok(validate({ match: [] }).length > 0);
  assert.ok(validate({ match: 42 }).length > 0);
  assert.ok(validate({ match: [''] }).length > 0);
  assert.ok(validate({ tool: '' }).length > 0);
  assert.ok(validate({ match: 'a', tool: [''] }).length > 0);
});

// ── isMatchDecl ──
test('isMatchDecl: exact contract', () => {
  assert.strictEqual(isMatchDecl('a.js'), true);
  assert.strictEqual(isMatchDecl(['a.js']), true);
  assert.strictEqual(isMatchDecl(''), false);
  assert.strictEqual(isMatchDecl('  '), false);
  assert.strictEqual(isMatchDecl([]), false);
  assert.strictEqual(isMatchDecl(['a', '']), false);
  assert.strictEqual(isMatchDecl([42]), false);
  assert.strictEqual(isMatchDecl(null), false);
});

// ═══════════════════════════════════════════════════════════════════════
// MUTANT KILLERS (Stryker, 15/07/2026 — 91.30%, 12 survivors)
// ⚠️ The remaining survivors are the LABELS of the error messages: mutating the
//    text changes NO behaviour (`validate` returns a non-empty list in
//    both cases). Coupling a test to the exact label would be pure fragility
//    — EQUIVALENT mutants accepted, cf `_survivor_connu` in stryker.conf.json.
// ═══════════════════════════════════════════════════════════════════════

test('MUTANT L68 — an EMPTY line is ignored (not treated as a key)', () => {
  assert.deepStrictEqual(parse('---\n\nmatch: a.js\n\n---\n').data, { match: 'a.js' });
});

test('MUTANT L68 — a COMMENT is ignored, even if it looks like a key', () => {
  // ⚠️ `||` → `&&`: a comment `# match: trap` would then be PARSED as a key.
  assert.deepStrictEqual(parse('---\n# match: trap\nmatch: real.js\n---\n').data, { match: 'real.js' });
});

test('MUTANT L68 — a line of spaces alone is ignored (trim, not the raw line)', () => {
  assert.deepStrictEqual(parse('---\n   \nmatch: a.js\n---\n').data, { match: 'a.js' });
});

test('MUTANT L96 — match list: ALL the elements must be non-empty strings', () => {
  // ⚠️ `.every` → `.some`: ['a.js', 42] would pass → an invisible numeric pattern.
  assert.strictEqual(isMatchDecl(['a.js', 42]), false);
  assert.strictEqual(isMatchDecl(['a.js', '']), false);
  assert.strictEqual(isMatchDecl(['a.js', '   ']), false);
  assert.strictEqual(isMatchDecl(['a.js', 'b.js']), true);
});

// ── `threshold` (17/07/2026): the smart threshold PER DOC, an integer >= 1 ──
test('threshold an integer >= 1 = valid (a KNOWN key, never "unknown"), bound 1 INCLUDED', () => {
  assert.deepStrictEqual(validate({ match: 'x.js', threshold: 2 }), []);
  assert.deepStrictEqual(validate({ match: 'x.js', threshold: 1 }), []);
});

// ── `driftUnit` (18/07/2026): the unit of the smart counter, tool|turn ──
test('driftUnit tool/turn = valid (a KNOWN key); any other value = RED', () => {
  assert.deepStrictEqual(validate({ match: 'x.js', driftUnit: 'tool' }), []);
  assert.deepStrictEqual(validate({ match: 'x.js', driftUnit: 'turn' }), []);
  assert.ok(validate({ match: 'x.js', driftUnit: 'message' }).length > 0);
  assert.ok(validate({ match: 'x.js', driftUnit: 42 }).length > 0);
});

test('invalid threshold = RED: 0, float, string', () => {
  assert.ok(validate({ match: 'x.js', threshold: 0 }).length > 0);
  assert.ok(validate({ match: 'x.js', threshold: 2.5 }).length > 0);
  assert.ok(validate({ match: 'x.js', threshold: '3' }).length > 0);
});

// ── validateMcp — THE ONLY authority on "a healthy MCP doc?" (keys mode/threshold) ──
test('validateMcp: an empty frontmatter or valid mode/threshold = 0 error (bound 1 included)', () => {
  assert.deepStrictEqual(validateMcp({}), []);
  assert.deepStrictEqual(validateMcp({ mode: 'dumb' }), []);
  assert.deepStrictEqual(validateMcp({ mode: 'smart', threshold: 1 }), []);
});

test('validateMcp: a key outside mode/threshold = RED (match/mach/rules forbidden on an MCP doc)', () => {
  assert.ok(validateMcp({ match: 'x.js' }).length > 0);
  assert.ok(validateMcp({ mod: 'dumb' }).length > 0);
});

test('validateMcp: driftUnit tool/turn admitted, any other value = RED', () => {
  assert.deepStrictEqual(validateMcp({ mode: 'smart', driftUnit: 'turn' }), []);
  assert.deepStrictEqual(validateMcp({ driftUnit: 'tool' }), []);
  assert.ok(validateMcp({ driftUnit: 'message' }).length > 0);
});

test('validateMcp: an unknown mode and a threshold of 0/float/string = RED', () => {
  assert.ok(validateMcp({ mode: 'weekly' }).length > 0);
  assert.ok(validateMcp({ threshold: 0 }).length > 0);
  assert.ok(validateMcp({ threshold: 2.5 }).length > 0);
  assert.ok(validateMcp({ threshold: '3' }).length > 0);
});

// ── The `*` WILDCARD of the tool axis (31/07/2026, §B) ──
test('§B: `tool: ["*"]` with a filter = VALID (the gesture becomes expressible)', () => {
  assert.deepStrictEqual(validate({ tool: ['*'], scope: ['docker run'], mode: 'dumb' }), []);
  assert.deepStrictEqual(validate({ tool: ['*'], exclude: ['Read'] }), []);
});

test('§B: a BARE `tool: ["*"]` = RED (it would inject on EVERY tool call)', () => {
  // ⚠️ BEFORE 31/07: accepted AND inert — the only unacceptable state. From now on
  //    the wildcard is either alive (with a filter), or refused, never tolerated mute.
  const errs = validate({ tool: ['*'], mode: 'dumb' });
  assert.ok(errs.length > 0);
  assert.ok(/scope/.test(errs.join(' ')), 'the message must say how to repair it');
  // ⚠️ An EMPTY or badly typed scope/exclude does NOT count as a filter — otherwise
  //    `exclude: []` would reopen the door to the bare wildcard, silently.
  assert.ok(validate({ tool: ['*'], scope: [] }).length > 0);
  assert.ok(validate({ tool: ['*'], exclude: [] }).length > 0);
  assert.ok(validate({ tool: '*' }).length > 0, 'the string form is covered too');
});

test('§B: the wildcard does NOT contaminate declarations without `*`', () => {
  assert.deepStrictEqual(validate({ tool: ['Bash'], mode: 'dumb' }), [],
    'an enumeration without a wildcard has never needed a filter');
});

test('§B: WILDCARD is a CONTRACT (a hard-coded value, never derived from the code)', () => {
  assert.strictEqual(WILDCARD, '*');
});

test('toolList: reading of `tool:` — string, list, absent, badly typed', () => {
  // ⚠️ DIRECT IMPORT from frontmatter.js, NEVER via the re-export of
  //    sources/tool.js: Stryker's perTest coverage mapping MISSES the tests
  //    that go through a re-export (a trap documented in this repo, relived here — the
  //    mutant `[] -> ["Stryker was here"]` survived as long as this test only existed
  //    downstream). A mutated module is tested directly, full stop.
  assert.deepStrictEqual(toolList({ tool: 'WebFetch' }), ['WebFetch']);
  assert.deepStrictEqual(toolList({ tool: ['A', 'B'] }), ['A', 'B']);
  assert.deepStrictEqual(toolList({}), []);
  assert.deepStrictEqual(toolList({ tool: 42 }), []);
  assert.deepStrictEqual(toolList({ tool: null }), []);
});

// ═══════════════════════════════════════════════════════════════════════
// `note` — an author's comment, INVISIBLE to the agent that acts (04/08/2026)
// ═══════════════════════════════════════════════════════════════════════
test('note: admitted in a FILE doc, text or list of texts', () => {
  assert.deepStrictEqual(validate({ match: 'x.js', note: 'dumb because it is a guardrail' }), []);
  assert.deepStrictEqual(validate({ match: 'x.js', note: ['a', 'b'] }), []);
});

test('note: admitted in an MCP doc (vocabulary parity)', () => {
  assert.deepStrictEqual(validateMcp({ mode: 'dumb', note: 'real payment' }), []);
});

test('note: the FORM is validated, never the content (validating the meaning would make it config)', () => {
  assert.strictEqual(validate({ match: 'x.js', note: 42 }).length, 1);
  assert.strictEqual(validate({ match: 'x.js', note: ['ok', 7] }).length, 1);
  assert.strictEqual(validateMcp({ note: {} }).length, 1);
});

// ⚠️ THE CASE THAT CARRIES THE WHOLE FEATURE. If the note reached the injected body,
//    it would become noise re-injected on every gesture — the exact opposite of the goal.
//    It is invisible BY CONSTRUCTION (parse() removes the whole frontmatter),
//    but "by construction" without a test is a promise. Here, it is a contract.
test('note: NEVER reaches the injected body', () => {
  const r = parse('---\nmatch: x.js\nnote: SETTING_SECRET\n---\nvisible body\n');
  assert.strictEqual(r.data.note, 'SETTING_SECRET');
  assert.strictEqual(r.body.includes('SETTING_SECRET'), false);
  assert.strictEqual(r.body.includes('note'), false);
  assert.strictEqual(r.body.trim(), 'visible body');
});

// ⚠️ KNOWN TRAP, FROZEN BY THIS TEST — not yet sealed (04/08/2026).
//    A YAML block `|` returns the value "|" and LOSES the following lines
//    silently. Found by adversarial simulation.
// 🛑 A GUARD WAS ATTEMPTED IN `validate()` THEN REMOVED THE SAME DAY — do not
//    do it again as is. The CI (ROUND-TRIP property-test of `migrate`)
//    turned it RED within minutes: it rejected `match: "|"`, a
//    LEGITIMATE pattern. At this layer, `key: |` (block) and `key: "|"` (literal pipe) are
//    INDISTINGUISHABLE — both are worth the string "|". A guard unable to
//    distinguish forbids the healthy, and a guard that forbids the healthy ends up
//    unplugged. The correct fix lives in `parse()`, the only place that sees the
//    TEXT (a `|` value AND a following indented line). Recorded in the REFACTOR-PLAN.
// ✅ TRAP CLOSED ON 06/08/2026 — this test used to freeze the LOSS as known
//    behaviour; from now on it will freeze the PRESERVATION. It is not deleted: it is
//    the witness of the regression, and it must turn red if someone goes
//    back. The fix was placed in `parse()` (the layer that sees the following
//    line), exactly where the comment above had predicted it.
test('YAML block `|`: the indented lines are PRESERVED (former trap, closed)', () => {
  const { data } = parse('---\nmatch: x.js\nnote: |\n  lost one\n  lost two\n---\nbody\n');
  assert.strictEqual(data.note, 'lost one\nlost two');
  assert.strictEqual(JSON.stringify(data).includes('lost'), true, 'NO line lost any more');
  assert.deepStrictEqual(validate(data), []);
  // ⚠️ `match: "|"` MUST stay valid: that is what the removed guard broke.
  assert.deepStrictEqual(validate({ match: '|' }), []);
  assert.deepStrictEqual(validateMcp({ mode: 'dumb', note: '|' }), []);
  // The SAFE form, always to be preferred:
  assert.deepStrictEqual(validate({ match: 'x.js', note: ['line one', 'line two'] }), []);
});

test('a non-boolean `enforce` = REJECTED (never interpreted as a yes)', () => {
  const errs = validate({ match: 'x', enforce: 'yes' });
  assert.ok(errs.some((e) => e.includes('`enforce` must be true or false')), JSON.stringify(errs));
  assert.deepStrictEqual(validate({ match: 'x', enforce: true, mode: 'once' }), []);
  assert.deepStrictEqual(validate({ match: 'x', enforce: false }), []);
});

test('`enforce` is admitted in an MCP doc TOO (the same vocabulary everywhere)', () => {
  assert.deepStrictEqual(validateMcp({ mode: 'once', enforce: true }), []);
  assert.ok(validateMcp({ enforce: 3 }).some((e) => e.includes('`enforce`')));
});

// ═══════════════════════════════════════════════════════════════════════
// VOCABULARY PER CORPUS — SYMMETRY gate (05/08/2026).
// ⚠️ Freezes WHICH key lives in WHICH corpus. Any future divergence becomes an
//    explicit DECISION (this test turns red) instead of a gap that settles in.
//    Born of a real question: "is everything symmetrical?" — the answer was
//    NO for `confirm`, and nobody had written it anywhere. Since its
//    removal, the answer is YES, and this gate is what keeps it true.
// ═══════════════════════════════════════════════════════════════════════
test('SYMMETRY: the cadence is IDENTICAL in both doc corpora', () => {
  // These 5 keys have the SAME meaning everywhere ⇒ they MUST be everywhere.
  for (const k of ['mode', 'threshold', 'driftUnit', 'note', 'enforce']) {
    assert.ok(KNOWN.includes(k), `\`${k}\` absent from the file docs`);
  }
  assert.deepStrictEqual(validateMcp({ mode: 'once', threshold: 2, driftUnit: 'turn', note: 'x', enforce: true }), [],
    'an MCP doc must accept the WHOLE cadence, enforce included');
});

test('ANTI-RETURN: `confirm` is no longer vocabulary, in NO corpus', () => {
  // 🛑 REMOVED on 05/08/2026, after measurement — NEVER reintroduce it:
  //    · 390 frontmatters carried it (a convention copied from
  //      protect-files.js for the parity of the 17/07/2026 switchover);
  //    · the GLOBAL switch was at `false` ⇒ they triggered NOTHING,
  //      and nobody had noticed — the definition of a dead key;
  //    · Codex does not support `ask`: it was degraded there into a simple injection,
  //      so one same word had TWO meanings depending on the harness;
  //    · `ask` puts a HUMAN back in the loop = contrary to 0-human, which is
  //      the load-bearing wall of the framework.
  // ⚠️ The need "stop a gesture" is covered by `enforce`: automatic,
  //    identical on both harnesses, and it DELIVERS the knowledge with the refusal.
  //    Two words for one need = the anti-synonym law violated.
  assert.ok(!KNOWN.includes('confirm'), 'confirm must no longer be an admitted key');
  assert.ok(validate({ match: 'a.js', confirm: true }).length > 0, 'confirm must be REFUSED in a file doc');
  assert.ok(validateMcp({ confirm: true }).length > 0, 'confirm must be REFUSED in an MCP doc');
});

// ═══════════════════════════════════════════════════════════════════════
// VOCABULARY SYMMETRY GATE (05/08/2026) — PERMANENT anti-drift.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY: the framework has 4 corpora (file doc · MCP doc · skill entry ·
//    defaults.{source}). A BEHAVIOUR key that only lands in one
//    of them creates a gap that NOBODY sees — that happened to `confirm`,
//    which stayed file-only from the 1st commit without it being a decision,
//    until its removal on 05/08/2026. This gate exists so that it does not
//    happen again: the next asymmetric key will turn red the same day.
//
// ⚠️ PRINCIPLE: **symmetry by DEFAULT, exception DECLARED.** No hard-coded list
//    of keys here: the behaviour keys are DERIVED (the vocabulary
//    minus the matching operators, which are specific to each corpus by
//    nature). An undeclared asymmetry = RED. A declaration that has become
//    false = RED too (otherwise obsolete justifications pile up).
//
// ⚠️ The corpora are PROBED, never read from a constant: we call the real
//    validator and read the real schema. A gate that reads a list instead of
//    testing the behaviour can stay green on a broken engine.

// MATCHING operators — specific to the corpus by nature (a skill has no
// `rank`, an MCP doc is triggered by its PATH). Contract written hard-coded:
// deriving them from the code under test would make them mutate with it.
// ⚠️ `keys` is a MATCHING operator, not a behaviour: it says WHERE the others look.
//    Like `scope`/`exclude` it lives PER ENTRY (doc + skill) and has no cadence to
//    inherit — a global `keys` would narrow every rule of the fleet indistinctly,
//    which is the opposite of an operator. Its 4-corpus symmetry is therefore the
//    doc↔skill MIRROR (gate ③ below), never the behaviour cascade.
const MATCHING = ['match', 'mcp', 'rules', 'tool', 'inject', 'scope', 'exclude', 'keys', 'rank'];

// A VALID sample per behaviour key. Any key without a sample = RED
// (part ⓪): impossible to add a key by making it invisible to the gate.
const SAMPLE = { mode: 'once', threshold: 2, driftUnit: 'turn', note: 'x', enforce: true };

// 🛑 THE ONLY ADMITTED ASYMMETRIES — each with its MEASURED REASON.
//    Adding an entry here is a DECISION, never a workaround.
const JUSTIFIED_ASYMMETRIES = {
  // ⚠️ EMPTY, and that is the point: the behaviour vocabulary is ENTIRELY
  //    symmetrical since the removal of `confirm` (05/08/2026). An entry here
  //    is a written DECISION, never a workaround to make the gate pass.
};

// ── `keys` — the operator that says WHERE to look (19/08/2026) ──
// ⚠️ These cases live HERE, in the module's Stryker suite: written only in
//    keys-operator.test.js they left the refusal branches at NoCoverage — a validator
//    whose refusals are never exercised is a validator that will one day accept anything.
test('validate `keys`: both forms accepted, on the flat entry and per axis', () => {
  assert.deepStrictEqual(validate({ match: 'a', keys: ['file_path'] }), []);
  assert.deepStrictEqual(validate({ match: 'a', keys: ['-command'] }), []);
  assert.deepStrictEqual(validate({ match: 'a', scope: ['s'], keys: { match: ['a'], scope: ['-b'], exclude: ['c'] } }), []);
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'p', keys: ['-command'] }] }), []);
});
test('validate `keys`: the MIXED form is ADMITTED — it ADJUSTS the default universe', () => {
  // 🔴 REFUSED UNTIL 20/08/2026, AND THE REFUSAL WAS THE HOLE. It left "the default, plus
  //    this key" writable only as a hand-made enumeration of the whole universe — a list
  //    born stale that silently stops following the profile (class ㊽). The reading rule is
  //    decidable by looking: a `-` present ⇒ ADJUST · no `-` ⇒ REPLACE.
  assert.deepStrictEqual(validate({ match: 'a', keys: ['file_path', '-command'] }), []);
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'p', keys: ['a', '-b'] }] }), [], 'same admission per entry');
  // 🔴 THE MUTANT THIS KILLS: the whole `if ('keys' in r)` block of the `rules` loop deleted.
  //    It survived the moment the mixed form became legal, because the only per-entry case left
  //    was one that now returns []. **A validation proven only by an ACCEPTANCE is not proven**:
  //    what must be checked is that the entry is still LOOKED AT — so the per-entry check needs
  //    a form that is still refused.
  assert.ok(validate({ rules: [{ pattern: 'p', keys: ['-'] }] }).length > 0,
    'a `keys` naming NOTHING is still refused INSIDE a rules entry, not only at the flat level');
});
test('validate `keys`: `-` alone names no key, and an empty list is not a whitelist of nothing', () => {
  assert.ok(/alone names no key/.test(validate({ match: 'a', keys: ['-'] })[0]));
  assert.ok(/alone names no key/.test(validate({ match: 'a', keys: ['-', '-x'] })[0]));
  assert.ok(validate({ match: 'a', keys: [] }).length > 0);
  assert.ok(validate({ match: 'a', keys: [''] }).length > 0);
  // ⚠️ `every` and not `some`: ONE bad entry among valid ones must still refuse. With
  //    `some` the list would be accepted as soon as a SINGLE entry is usable — the
  //    empty name would then reach the engine and match every key.
  assert.ok(validate({ match: 'a', keys: ['file_path', ''] }).length > 0);
  // ⚠️ `some` and not `every` on the removals: ONE bare `-` is enough to refuse, even
  //    surrounded by valid ones — it names no key and would silently ban nothing.
  assert.ok(/alone names no key/.test(validate({ match: 'a', keys: ['-x', '-', '-y'] })[0]));
  // ⚠️ `.trim()`: `"- "` names no key either — a blank is not a name. Without the trim the
  //    entry would be accepted and would ban a key called " ", i.e. nothing, silently.
  assert.ok(/alone names no key/.test(validate({ match: 'a', keys: ['- '] })[0]));
  // 🛑 TOTALITY: `null` must REFUSE, never THROW. A throw here kills the parser, hence the
  //    whole fleet's injection — one malformed .md would silence every doc everywhere.
  assert.doesNotThrow(() => validate({ match: 'a', keys: null }));
  assert.ok(validate({ match: 'a', keys: null }).length > 0);
});
test('validate `keys`: the object form refuses an unknown axis and an empty object', () => {
  assert.ok(/unknown axis/.test(validate({ match: 'a', keys: { dummy: ['x'] } })[0]));
  assert.ok(/name at least one axis/.test(validate({ match: 'a', keys: {} })[0]));
  assert.ok(validate({ match: 'a', keys: 'x' }).length > 0, 'a scalar is neither a list nor an object');
  assert.ok(validate({ match: 'a', keys: { match: [] } }).length > 0, 'an empty axis is refused too');
});
test('validate `keys`: declared ALONE it is refused — an inert key looks like a working one', () => {
  assert.ok(/changes NOTHING/.test(validate({ mode: 'once', keys: ['-command'] }).find((x) => /changes NOTHING/.test(x)) || ''));
});

test('SYMMETRY GATE ⓪: every behaviour key has a sample (nothing can hide)', () => {
  const behavior = KNOWN.filter((k) => !MATCHING.includes(k));
  for (const k of behavior) {
    assert.ok(k in SAMPLE,
      `\`${k}\` is a BEHAVIOUR key without a sample: add it to ECHANTILLON, otherwise the symmetry gate does not see it.`);
  }
  assert.ok(behavior.length >= 5, 'suspicious behaviour vocabulary');
});

test('SYMMETRY GATE ①: a key present in one corpus and absent from another MUST be justified', async () => {
  const sch = (await import('../ctxroute-config.schema.json', { with: { type: 'json' } })).default;
  const skillProps = sch.properties.skills.additionalProperties.properties;
  const cadenceProps = sch.definitions.cadence.properties;

  for (const [k, v] of Object.entries(SAMPLE)) {
    // The 4 corpora, PROBED (real validator + real schema).
    const presence = {
      'file doc': validate({ match: 'x', [k]: v }).length === 0,
      'MCP doc': validateMcp({ [k]: v }).length === 0,
      'skill entry': Object.prototype.hasOwnProperty.call(skillProps, k),
      'defaults.{source}': Object.prototype.hasOwnProperty.call(cadenceProps, k),
    };
    const absents = Object.keys(presence).filter((c) => !presence[c]);
    const justification = JUSTIFIED_ASYMMETRIES[k];

    if (absents.length === 0) {
      // ⚠️ INVERSE part: a justification that no longer corresponds to anything must
      //    disappear, otherwise we keep excuses for solved problems.
      assert.ok(!justification,
        `\`${k}\` is SYMMETRICAL everywhere: remove its entry from ASYMETRIES_JUSTIFIEES (obsolete justification).`);
    } else {
      assert.ok(typeof justification === 'string' && justification.trim().length > 40,
        `UNJUSTIFIED GAP — \`${k}\` is missing in: ${absents.join(', ')}.\n`
        + `   Either you add it to those corpora (symmetry = the default), or you write WHY in `
        + `ASYMETRIES_JUSTIFIEES with a MEASURED reason. Silence is not an option.`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SYMMETRY GATE ② — THE MATCHING OPERATORS TOO (12/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS PART EXISTS: part ① exempts the 8 matching operators
//    "specific to the corpus by nature". **That hypothesis was FALSE, and it
//    cost two jobs (㊴, 11-12/08/2026)**: a skill COULD NOT react
//    to a parameter (`tool` refused by the schema, `scope`/`exclude` ignored on
//    the `servers` dimension), and nobody saw it for 3 weeks because
//    HALF the vocabulary had no guardian. Real cost: a customer email
//    written without the customer's folder, ~10 versions.
//
// 🛑 A PERIMETER THAT IS TOO NARROW IS INVISIBLE — that is WHAT makes this gate
//    necessary. A missing operator breaks nothing: it produces SILENCE, and
//    a silence is indistinguishable from correct operation. No test, no
//    mutation, no doctor can see that: they prove what is DELIVERED.
//
// ⚠️ THREE corpora here, not four: `defaults.{source}` is a CADENCE corpus
//    by construction (it settles WHEN, never ON WHAT). Including it would fabricate
//    8 purely formal justifications — noise, hence a gate one stops reading.
const DECLARATIVE_CORPORA = ['file doc', 'MCP doc', 'skill entry'];

// A VALID sample per operator (a form accepted by the 3 corpora: a list).
const MATCHING_SAMPLE = {
  match: ['x'], rules: [{ pattern: 'x' }], tool: ['T'], scope: ['s'], exclude: ['e'],
  // ⚠️ `keys` is PROBED like the others — an operator without a sample is invisible to the
  //    gate, which would then CERTIFY instead of protecting. The sample uses the blacklist
  //    form because it is the one that composes with a bare `match` (a whitelist would need
  //    to name the very key the trigger reads, which is a different test, made below).
  keys: ['-command'],
};

// 🛑 ADMITTED OPERATOR ASYMMETRIES — each with its REASON. Adding an
//    entry here is a written DECISION, never a way to silence the gate.
const MATCHING_ASYMMETRIES = {
  keys:
    "An MCP doc is triggered by its PATH and carries NO matching operator (no match, no "
    + "scope, no exclude): there is nothing there whose universe could be narrowed. Admitting "
    + "`keys` in it would create an accepted AND INERT key — exactly the defect that had `mcp:` "
    + "removed from the file corpus on 31/07/2026. A validator that approves dead things points "
    + "at the WRONG cause.",
  match:
    "An MCP doc is triggered by its PATH (docs/mcp/{server}.md), never by a pattern: "
    + "a single matching key would be AMBIGUOUS (`match: stripe` = the file stripe-config.js OR "
    + "the stripe server?) and the MCP doc would go out while editing a file. Decision 7 of the plan.",
  rules:
    "Same reason as `match` (of which `rules` is the per-entry form): the trigger of an MCP doc "
    + "is its PATH. A `rules` there would be accepted and INERT — a validator that approves dead code "
    + "points at the wrong cause, a defect already paid for with `mcp:` on 31/07/2026.",
  tool:
    "An MCP doc is already tied to ONE server by its path; the `tool` axis is the DISJOINT axis of the "
    + "native tools WITHOUT the mcp__ prefix (WebFetch, WebSearch). The two do not overlap: "
    + "a `tool:` in an MCP doc could only designate what it already designates.",
  // 🛑 MAINTAINER'S DECISION, 12/08/2026 — I HAD IMPLEMENTED IT, THEN CANCELLED IT.
  //    I added `scope`/`exclude` to the MCP docs because gate ②
  //    flagged them as absent. The maintainer asked the right question: "what would that
  //    be for?" — and the KNOB TEST answers NO.
  //    The need "react to an MCP call filtered by a PARAMETER" is ALREADY
  //    entirely expressible in the FILE corpus: `tool: ["mcp__srv__tool"]`
  //    + `scope: [...]`. That is EXACTLY how the customer sheets are written,
  //    and they work (verified by spawn on 12/08/2026).
  //    Adding them to the MCP channel would create TWO ways of expressing ONE thing —
  //    the opposite of the anti-synonym law, and an operator with no real false positive
  //    to reject is NOISE (rule: the minimum that suffices, never one more).
  // ⚠️ WHAT WOULD REOPEN THE QUESTION: a real case where the filtering must follow the
  //    path HIERARCHY specific to the MCP channel (global → tool → sub-tool),
  //    inexpressible by a flat `tool:` doc. Not encountered to this day.
  scope:
    "The MCP channel is triggered by its PATH and its granularity IS that path "
    + "(server → tool → sub-tool). Filtering an MCP call on a PARAMETER is already "
    + "expressible in the FILE corpus (`tool:` + `scope:`), like the customer sheets: "
    + "adding it here would make TWO ways of expressing ONE thing. Maintainer decision 12/08/2026.",
  exclude:
    "Same reason as `scope`: the exclusion axis of the MCP channel is already carried by the "
    + "granularity of the PATH (a tool-level doc concerns ONLY that tool) and by "
    + "`filterMode`/`filterList` to discard a whole server. Maintainer decision 12/08/2026.",
};

test('SYMMETRY GATE ②: an OPERATOR absent from a declarative corpus MUST be justified', async () => {
  const sch = (await import('../ctxroute-config.schema.json', { with: { type: 'json' } })).default;
  const skillProps = sch.properties.skills.additionalProperties.properties;

  for (const [k, v] of Object.entries(MATCHING_SAMPLE)) {
    // ⚠️ PROBED by the REAL validator and the REAL schema — never a list written
    //    by hand, which would stay green on a broken engine.
    //    `scope`/`exclude` NEVER trigger on their own: we probe them accompanied
    //    by a trigger, otherwise we would be measuring "no trigger", not the key.
    // ⚠️ `keys` joins them: it NARROWS where the operators look, it triggers nothing.
    //    Probing it bare would measure "no trigger", not the key.
    const withTrigger = k === 'scope' || k === 'exclude' || k === 'keys' ? { match: 'x' } : {};
    const presence = {
      'file doc': validate({ ...withTrigger, [k]: v }).length === 0,
      'MCP doc': validateMcp({ [k]: v }).length === 0,
      'skill entry': Object.prototype.hasOwnProperty.call(skillProps, k),
    };
    const absents = DECLARATIVE_CORPORA.filter((c) => !presence[c]);
    const justification = MATCHING_ASYMMETRIES[k];

    if (absents.length === 0) {
      // INVERSE part: an obsolete justification must disappear.
      assert.ok(!justification,
        `\`${k}\` is SYMMETRICAL across the 3 corpora: remove its entry from ASYMETRIES_MATCHING.`);
    } else {
      assert.ok(typeof justification === 'string' && justification.trim().length > 40,
        `UNJUSTIFIED OPERATOR ASYMMETRY — \`${k}\` is missing in: ${absents.join(', ')}.\n`
        + `   This is EXACTLY the class of ㊴: an absent operator breaks nothing, it makes things MUTE.\n`
        + `   Either you add it to those corpora (symmetry = the default), or you write WHY in `
        + `ASYMETRIES_MATCHING. Silence is not an option.`);
    }
  }
});

test('SYMMETRY GATE ② bis: every operator of the vocabulary is PROBED (nothing can hide)', () => {
  // ⚠️ ANTI-DORMANCY: without this part, adding an operator WITHOUT a sample would
  //    make it invisible to the gate — the gate would certify instead of protecting.
  //    `mcp` and `inject`/`rank` are out of perimeter and they SAY so (cf below).
  const OUT_OF_PERIMETER = {
    mcp: 'REMOVED from the vocabulary of the triggers on 31/07/2026 (accepted AND inert).',
    inject: 'A DELIBERATE silence switch, not a matching operator.',
    rank: 'Injection order (z-index), not a triggering condition.',
  };
  for (const k of MATCHING) {
    assert.ok(k in MATCHING_SAMPLE || k in OUT_OF_PERIMETER,
      `\`${k}\` is an operator without a sample NOR a reason for exclusion: the gate does not see it.`);
  }
  assert.ok(Object.keys(MATCHING_SAMPLE).length >= 5, 'suspicious operator sample');
});

// ═══════════════════════════════════════════════════════════════════════════
// YAML BLOCKS — the silent loss is CLOSED (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 REAL DEFECT: `note: |` returned `"|"` and SWALLOWED the indented lines. Since
//    the frontmatter is removed from the body, they disappeared from BOTH sides,
//    with `validate` GREEN. `note` is the field that invites writing at length.
// 🛑 NO EXCEPTION PER KEY: the rule is "`|`/`>` FOLLOWED by an INDENTED
//    line", valid everywhere. An exception on `note` alone would have left
//    the trap armed on every other key — and the next key would fall
//    into it without anyone understanding why.

test('BLOCK | : the indented lines are PRESERVED, not swallowed', () => {
  const { data } = parse('---\nmatch: a.js\nnote: |\n  line one\n  line two\n---\nbody\n');
  assert.strictEqual(data.note, 'line one\nline two');
  assert.strictEqual(data.match, 'a.js', 'the block does not eat the neighbouring keys');
});

test('BLOCK > : the lines are FOLDED with a space (YAML semantics)', () => {
  const { data } = parse('---\nnote: >\n  line one\n  line two\n---\nbody\n');
  assert.strictEqual(data.note, 'line one line two');
});

test('BLOCK: an internal EMPTY line is kept, the final one is cut', () => {
  // Without the "empty + next indented" guard, a paragraph separated by a
  // blank would be truncated at its first half — a silent loss again.
  const { data } = parse('---\nnote: |\n  para one\n\n  para two\n---\nbody\n');
  assert.strictEqual(data.note, 'para one\n\npara two');
});

test('BLOCK: de-indentation on the SMALLEST indentation, not a fixed number', () => {
  const { data } = parse('---\nnote: |\n    deep\n    also\n---\nbody\n');
  assert.strictEqual(data.note, 'deep\nalso', 'a hard-coded slice(2) would eat a character');
});

test('FOUNDING CASE: `match: |` WITHOUT an indented line stays the STRING "|"', () => {
  // 🛑 NEVER DELETE THIS TEST. It is the one that killed the guard of 05/08/2026,
  //    placed in `validate()`: it rejected any `|` value, whereas
  //    `match: "|"` is a LEGITIMATE pattern (the CI turned it red within minutes
  //    via the migrator's round-trip property). The right layer is `parse`,
  //    because it ALONE sees the following line and lifts the ambiguity.
  const { data } = parse('---\nmatch: |\nmode: dumb\n---\nbody\n');
  assert.strictEqual(data.match, '|');
  assert.strictEqual(data.mode, 'dumb', 'the next key is intact');
});

test('BLOCK on the LAST line of the frontmatter → no crash (totality)', () => {
  // `lines[i + 2]` is then `undefined`: without the type guard in
  // `isIndented`, the parser would throw — hence NO MORE doc injected
  // anywhere, for the whole fleet. The totality of `parse` is not negotiable.
  assert.doesNotThrow(() => parse('---\nnote: |\n  alone\n---\nbody\n'));
  assert.strictEqual(parse('---\nnote: |\n  alone\n---\nbody\n').data.note, 'alone');
});

test('BLOCK: the doc body stays INTACT (the block does not overflow the frontmatter)', () => {
  const { body } = parse('---\nnote: |\n  internal\n---\n# Title\ntext\n');
  assert.strictEqual(body, '# Title\ntext\n');
});

test('BLOCK: UNEQUAL indentations → de-indents on the SMALLEST, never the largest', () => {
  // ⚠️ Kills the mutant `Math.min` → `Math.max`: with max, the least
  //    indented line would be TRUNCATED in its text. The relative indentation of a
  //    sub-level (list, code) must be PRESERVED, that is YAML.
  const { data } = parse('---\nnote: |\n  base\n      deep\n---\nbody\n');
  assert.strictEqual(data.note, 'base\n    deep');
});

test('BLOCK: a line of SPACES ALONE does not distort the reference indentation', () => {
  // ⚠️ Kills the mutant `l.trim() !== ''` → `l !== ''`: a line of 2 spaces
  //    would be counted as indentation 2 and would crush the real minimum (4),
  //    leaving the whole block shifted.
  const { data } = parse('---\nnote: |\n    one\n  \n    two\n---\nbody\n');
  assert.strictEqual(data.note, 'one\n\ntwo');
});

test('BLOCK > : each line is TRIMMED before the fold (no spurious spaces)', () => {
  // ⚠️ Kills the mutant `nues.map(l => l.trim())` → `nues.map(l => l)`: without the trim,
  //    a relative indentation would leave spaces in the middle of the folded text.
  const { data } = parse('---\nnote: >\n  one\n      two\n---\nbody\n');
  assert.strictEqual(data.note, 'one two');
});

test('BLOCK: the FINAL empty line is cut (YAML "clip" chomping)', () => {
  // ⚠️ Kills the mutant that removes `.trimEnd()`: without it, the line break that
  //    precedes the closing `---` would enter the value.
  const { data } = parse('---\nnote: |\n  alone\n\nmode: dumb\n---\nbody\n');
  assert.strictEqual(data.note, 'alone', 'no residual \n at the end of the value');
});

test('BLOCK: the spaces at the END of the value are cut', () => {
  // ⚠️ Kills the mutant that removes `.trimEnd()`. A real case, invisible to the eye:
  //    an editor leaves trailing spaces on a line, the value would take them along.
  const { data } = parse('---\nnote: |\n  text   \n---\nbody\n');
  assert.strictEqual(data.note, 'text');
});

test('BLOCK: `|` followed by SPACES stays a block (the marker is trimmed)', () => {
  // ⚠️ Kills the mutant `raw.trim()` → `raw`: without the trim, an invisible space
  //    after the `|` would make the doc fall back into the original TRAP (value "|",
  //    lines swallowed) — a regression undetectable on re-reading.
  const { data } = parse('---\nnote: |   \n  content\n---\nbody\n');
  assert.strictEqual(data.note, 'content');
});

// ═══════════════════════════════════════════════════════════════════════
// ㊺① — THE SHAPE OF `scope` (14/08/2026). A gate on the SHAPE, not on presence.
// 🛑 REASON FOR EXISTING: `frontmatter.validate` (docs) and `ctxroute-config.schema.json`
//    (skills) are TWO declarations of the same shape. A shape admitted on one side
//    and refused on the other = class ㊴, and it goes UNNOTICED because the
//    symmetry gates probe the PRESENCE of a key, never its SHAPE.
// ═══════════════════════════════════════════════════════════════════════
test('㊺① scope: the FLAT form (OR) stays valid — parity of the whole fleet', () => {
  assert.deepStrictEqual(validate({ match: 'a.js', scope: ['project-a', 'project-b'] }), []);
});
test('㊺① scope: the GROUPED form (AND of ORs) is valid', () => {
  assert.deepStrictEqual(validate({ match: 'a.js', scope: [['a', 'b'], ['c']] }), []);
  assert.deepStrictEqual(validate({ match: 'a.js', scope: [['a']] }), [], 'a single group = valid');
});
test('㊺① scope: MIXED form REFUSED — the ambiguity is the real danger, not the limit', () => {
  // ⚠️ Accepting `["a", ["b"]]` would make it UNDECIDABLE what the author wanted, and
  //    the engine would decide in their place. The message must SHOW THE 3 FORMS.
  const errs = validate({ match: 'a.js', scope: ['a', ['b']] });
  assert.strictEqual(errs.length, 1);
  assert.ok(errs[0].includes('MIXED'), errs[0]);
  assert.ok(errs[0].includes('a AND b') && errs[0].includes('a OR b'), 'the message must show the forms');
});
test('㊺① scope: an EMPTY GROUP is REFUSED (a rule mute FOREVER, in silence)', () => {
  assert.ok(validate({ match: 'a.js', scope: [['a'], []] }).length > 0);
  assert.ok(validate({ match: 'a.js', scope: [['a'], ['']] }).length > 0, 'empty string = a pattern always present');
});
test('㊺① scope: an EMPTY string in the flat form is REFUSED (it would match EVERYTHING)', () => {
  assert.ok(validate({ match: 'a.js', scope: [''] }).length > 0);
});
test('㊺① `exclude` DOES NOT ADMIT the grouped form — it is ∀¬ over a SINGLE universe (㊼)', () => {
  // 🛑 An "AND of ORs" makes no sense to express on a universal negation:
  //    offering it would create a form WITHOUT semantics, hence a trap.
  assert.ok(validate({ match: 'a.js', exclude: [['a']] }).length > 0, 'grouped form REFUSED on exclude, at the doc level');
  assert.ok(validate({ match: 'a.js', rules: [{ pattern: 'x', exclude: [['a']] }] }).length > 0);
});
test('㊺① the grouped form also holds in a `rules` entry (per-entry parity)', () => {
  assert.deepStrictEqual(validate({ rules: [{ pattern: 'x', scope: [['a'], ['b']] }] }), []);
  assert.ok(validate({ rules: [{ pattern: 'x', scope: ['a', ['b']] }] }).length > 0, 'mixed refused per-entry too');
});
test('㊺① MUTANTS — ONE invalid entry is enough to refuse (every, never some)', () => {
  // ⚠️ Without a MIXED list (a good one + a bad one), `every`→`some` survives and
  //    the validator would accept `["ok", ""]`: an empty pattern matches EVERYTHING, hence
  //    a silently UNIVERSAL rule. Measured by Stryker on 14/08/2026.
  assert.ok(validate({ match: 'a.js', scope: [['ok', '']] }).length > 0, 'group [ok, ""] accepted');
  assert.ok(validate({ match: 'a.js', exclude: ['ok', ''] }).length > 0, 'exclude [ok, ""] accepted');
  assert.ok(validate({ match: 'a.js', scope: ['ok', ''] }).length > 0, 'flat [ok, ""] accepted');
});
