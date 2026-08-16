// ═══════════════════════════════════════════════════════════════════════
// sources/file.js — DETERMINISTIC tests (Stryker target)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ CREATED ON 15/07/2026 AFTER A DOCTRINE AUDIT: this module — the CORE of the refactor —
//    had NO unit test at all. Its only coverage was `file-differential.test.js`
//    (75 min, 2081 spawns): impossible to run with Stryker, hence ZERO proof of
//    test quality on the matching logic of the 546 rules.
//    A green differential proves EQUIVALENCE to the old engine; it proves
//    NOTHING about the robustness of the tests. Both, never one instead of the other.
//
// ⚠️ Each case here locks down a SEMANTIC of protect-files.js. Modifying it
//    without re-running the differential = silent regression on 546 rules.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { matchingDocs, norm, extractFilePaths, shouldSkip, scopeGroups, bashCandidates, textValues, MAX_DEPTH, MAX_SIZE } from '../src/sources/file.js';

const R = (pattern, doc, extra) => Object.assign({ pattern, doc }, extra || {});
const docs = (rules, toolName, toolInput) => matchingDocs(rules, { toolName, toolInput }).map((d) => d.doc);

// ── norm(): the cross-platform trap ──
test('norm: Windows backslash → POSIX slash', () => {
  assert.strictEqual(norm('C:\\a\\b'), 'c:/a/b');
});
test('norm: lowercase (scope "api-site" must match "API-SITE")', () => {
  assert.strictEqual(norm('API-Site'), 'api-site');
});
test('norm: null/undefined → empty string, never a throw', () => {
  assert.strictEqual(norm(null), '');
  assert.strictEqual(norm(undefined), '');
  assert.strictEqual(norm(42), '42');
});

// ── Path extraction ──
test('extractFilePaths: file_path, remotePath, path', () => {
  assert.deepStrictEqual(extractFilePaths('Read', { file_path: 'a', remotePath: 'b', path: 'c' }), ['a', 'b', 'c']);
});
test('extractFilePaths: ignores non-string params', () => {
  assert.deepStrictEqual(extractFilePaths('Read', { file_path: 42, path: null }), []);
});
test('extractFilePaths: apply_patch (Codex) — paths INSIDE the patch text', () => {
  // ⚠️ Dead on the Claude side, ALIVE on the Codex side: it is half of the port.
  const patch = '*** Update File: a.js\n*** Add File: b.js\n*** Delete File: c.js';
  assert.deepStrictEqual(extractFilePaths('apply_patch', { input: patch }), ['a.js', 'b.js', 'c.js']);
});
test('extractFilePaths: apply_patch accepts `patch` like `input`', () => {
  assert.deepStrictEqual(extractFilePaths('apply_patch', { patch: '*** Update File: x.js' }), ['x.js']);
});
test('extractFilePaths: apply_patch accepts `command` — REAL shape Codex ≥ 0.144 (doc 19/07/2026)', () => {
  // ⚠️ MEASURED CONTRACT: "Bash and apply_patch use tool_input.command". Without this
  //    fallback, EVERY Codex write would slip under the corpus radar, silently.
  assert.deepStrictEqual(extractFilePaths('apply_patch', { command: '*** Update File: y.js' }), ['y.js']);
  // Precedence: input (historical) wins over command if they coexist.
  assert.deepStrictEqual(extractFilePaths('apply_patch', { input: '*** Update File: a.js', command: '*** Update File: b.js' }), ['a.js']);
});
test('extractFilePaths: apply_patch ignored for the other tools', () => {
  assert.deepStrictEqual(extractFilePaths('Read', { input: '*** Update File: a.js' }), []);
});

// ── scope / exclude: TWO DUAL OPERATORS, SAME UNIVERSE (㊼, 14/08/2026) ──
// 🛑 THIS SECTION WAS CALLED "the INTENTIONAL asymmetry" — that was bug ㊼ dressed up
//    as a design choice. `exclude` = ∀¬ over (all the params ∪ the context).
test('shouldSkip: exclude matches the CURRENT context', () => {
  assert.strictEqual(shouldSkip(R('x', 'd', { exclude: ['umami'] }), '/srv/umami/x', {}), true);
  assert.strictEqual(shouldSkip(R('x', 'd', { exclude: ['umami'] }), '/srv/other/x', {}), false);
});
test('㊼ shouldSkip: exclude ALSO sees the params, not only the context', () => {
  // 🔴 FOUNDING CASE, MEASURED IN REAL USE ON 14/08/2026: the context is a
  //    pseudo-path INVENTED by bashCandidates (`ctxroute/node`, from the single
  //    word `node`); the excluded pattern (`explain.js`) is not in it, but it is in the
  //    COMMAND. Before the fix, that fragment authorized on its own ⇒ 53 KB of
  //    skill got in. NEVER go back to a candidate-by-candidate evaluation.
  const r = R('ctxroute', 'skill/ctxroute', { exclude: ['explain.js'] });
  const cmd = { command: 'cd ~/Desktop/ctxroute && node explain.js' };
  assert.strictEqual(shouldSkip(r, '~/desktop/ctxroute/node', cmd), true, 'the invented fragment must NO LONGER authorize');
  assert.strictEqual(shouldSkip(r, '~/desktop/ctxroute/explain.js', cmd), true);
  // NEGATIVE control: real work in the repo stays injected.
  assert.strictEqual(shouldSkip(r, '~/desktop/ctxroute/ls', { command: 'cd ~/Desktop/ctxroute && ls' }), false);
});
test('㊼ matchingDocs: the whole gesture is excluded, whatever its WRITING', () => {
  // LAW ② — independence from writing: two gestures with the same textual content
  //    decide the SAME. The 3 forms below all carry `explain.js`.
  const rules = [R('ctxroute', 'skill/ctxroute', { exclude: ['explain.js'] })];
  for (const command of [
    'cd ~/Desktop/ctxroute && node explain.js',
    'cd ~/Desktop/ctxroute && explain.js',
    'node ~/Desktop/ctxroute/explain.js --doc x',
  ]) {
    assert.deepStrictEqual(docs(rules, 'Bash', { command }), [], `not excluded: ${command}`);
  }
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cd ~/Desktop/ctxroute && npm test' }), ['skill/ctxroute']);
});
test('㊼ MUTANT — the params↔context SEPARATOR must not FABRICATE a pattern', () => {
  // ⚠️ Without the joining ' ', `…ex` (end of the params) + `plain.js` (start of the
  //    context) form "explain.js": a PHANTOM exclusion on a gesture that
  //    contains this word NOWHERE. A `''` mutant would survive without this test.
  const r = R('x', 'd', { exclude: ['explain.js'] });
  assert.strictEqual(shouldSkip(r, 'plain.js/x', { command: 'ex' }), false);
  assert.strictEqual(shouldSkip(r, 'explain.js/x', { command: 'ex' }), true);
});
test('㊼ shouldSkip: exclude stays evaluated even WITHOUT a scope (the 2 operators are independent)', () => {
  // ⚠️ The fix computes the values ONCE for both: a mutant that would
  //    condition the exclude on the presence of a scope would pass without this test.
  assert.strictEqual(shouldSkip(R('x', 'd', { exclude: ['secret'] }), '/a/x', { command: 'echo secret' }), true);
});
// ── ㊺① GROUPED `scope`: AND of OR (14/08/2026) ──
test('㊺① PARITY — a FLAT list stays an OR (all the rules of the corpus depend on it)', () => {
  // 🛑 THE MOST IMPORTANT TEST OF THIS SECTION. Mapping element by element
  //    would turn the historical OR into an AND and would FLIP the meaning of the 852
  //    rules of the corpus, silently. A mistake actually made on 14/08: caught
  //    in one minute by this case + `MUTANT L66`.
  const r = R('x', 'd', { scope: ['a', 'b'] });
  assert.strictEqual(shouldSkip(r, '/x', { command: 'a' }), false, 'ONE of the two suffices: it is an OR');
  assert.strictEqual(shouldSkip(r, '/x', { command: 'b' }), false);
  assert.strictEqual(shouldSkip(r, '/x', { command: 'z' }), true);
});
test('㊺① the GROUPED form is an AND between groups, an OR inside', () => {
  const r = R('x', 'd', { scope: [['a', 'b'], ['c']] }); // (a OR b) AND c
  assert.strictEqual(shouldSkip(r, '/x', { command: 'a c' }), false);
  assert.strictEqual(shouldSkip(r, '/x', { command: 'b c' }), false);
  assert.strictEqual(shouldSkip(r, '/x', { command: 'a b' }), true, 'the `c` group is not satisfied');
  assert.strictEqual(shouldSkip(r, '/x', { command: 'c' }), true, 'the 1st group is not satisfied');
});
test('㊺① CONJUNCTION ≥ 3 — the language limit written on 12/08 is LIFTED', () => {
  const r = R('x', 'd', { scope: [['ce-file'], ['ce-projet'], ['--prod']] });
  assert.strictEqual(shouldSkip(r, '/x', { a: 'ce-file', b: 'ce-projet', c: '--prod' }), false);
  assert.strictEqual(shouldSkip(r, '/x', { a: 'ce-file', b: 'ce-projet' }), true, 'ONE is missing ⇒ no injection');
});
test('㊺① scopeGroups: total, and the MIXED form reads the most RESTRICTIVE', () => {
  // ⚠️ The mixed form is REFUSED by the validators. If it reaches the engine (unvalidated
  //    config), we never GUESS in the direction that injects MORE.
  assert.strictEqual(scopeGroups(undefined), null);
  assert.strictEqual(scopeGroups([]), null);
  assert.deepStrictEqual(scopeGroups(['a', 'b']), [['a', 'b']], 'flat = ONE group');
  assert.deepStrictEqual(scopeGroups([['a'], ['b']]), [['a'], ['b']]);
  assert.deepStrictEqual(scopeGroups(['a', ['b']]), [['a'], ['b']], 'mixed = AND (the most restrictive)');
});
test('shouldSkip: scope matches ALL the concatenated params, not just the path', () => {
  // ⚠️ Same universe as `exclude` since ㊼ — only the QUANTIFIER differs.
  const r = R('x', 'd', { scope: ['vps-prod'] });
  assert.strictEqual(shouldSkip(r, '/etc/x', { connectionId: 'vps-prod', file_path: '/etc/x' }), false);
  assert.strictEqual(shouldSkip(r, '/etc/x', { connectionId: 'vps-dev', file_path: '/etc/x' }), true);
});
test('shouldSkip: scope ABSENT or EMPTY = no filter (never a silent skip)', () => {
  // ⚠️ Without the length check, `[].some()` = false → the rule would be SKIPPED.
  assert.strictEqual(shouldSkip(R('x', 'd'), '/a/x', {}), false);
  assert.strictEqual(shouldSkip(R('x', 'd', { scope: [] }), '/a/x', {}), false);
});
test('shouldSkip: scope ignores non-string params', () => {
  assert.strictEqual(shouldSkip(R('x', 'd', { scope: ['abc'] }), '/x', { n: 42, s: 'abc' }), false);
});

// ── ㊵ DEPTH: scope sees the WHOLE payload, not only the 1st level ──
// ⚠️ REAL DEFECT (11/08/2026): `Object.values(...).filter(typeof === 'string')` only
//    read the 1st level. Yet EVERY MCP server puts its arguments in a nested
//    object (`args`) ⇒ `scope` was BLIND to the 16 MCP servers of the corpus, while
//    the framework doc promises everywhere "scope sees ALL the params".
test('㊵ shouldSkip: scope sees a NESTED param (REAL shape of every MCP)', () => {
  const r = R('x', 'd', { scope: ['client-a'] });
  const payload = { tool: 'send_gmail_message', args: { to: 'client-a@example.com' } };
  assert.strictEqual(shouldSkip(r, 'mcp__gworkspace__gworkspace_call', payload), false);
});
test('㊵ shouldSkip: scope also traverses ARRAYS', () => {
  const r = R('x', 'd', { scope: ['client-b'] });
  assert.strictEqual(shouldSkip(r, 'T', { q: [{ v: ['client-b sarl'] }] }), false);
});
test('㊵ shouldSkip: NEGATIVE — a nested payload WITHOUT the term stays skipped', () => {
  // ⚠️ The part that proves the filter still FILTERS: without it, "it always
  //    matches" would pass for a fix.
  const r = R('x', 'd', { scope: ['client-a'] });
  assert.strictEqual(shouldSkip(r, 'T', { tool: 'send', args: { to: 'client-b@example.com' } }), true);
});

// ── ㊵.a THE TWO BOUNDS: present, and above all OBSERVABLE ──
// 🛑 A MUTE bound recreates defect ㊵ through the back door: a scope that
//    fails without a visible reason is indistinguishable from an absent scope.
const enfouir = (n, leaf) => {
  let v = leaf;
  for (let i = 0; i < n; i++) v = { a: v };
  return v;
};
test('㊵.a textValues: the corpus REAL depth (11) is well within the bound', () => {
  // ⚠️ MEASUREMENT 12/08/2026: 25,898 real calls, max depth = 11 (gworkspace).
  assert.deepStrictEqual(textValues(enfouir(11, 'found')).chunks, ['found']);
  assert.strictEqual(textValues(enfouir(11, 'found')).truncated, null);
});
test('㊵.a textValues: beyond MAX_DEPTH it truncates, AND it SAYS so', () => {
  const r = textValues(enfouir(MAX_DEPTH + 1, 'perdu'));
  assert.deepStrictEqual(r.chunks, []);
  assert.strictEqual(r.truncated, 'depth');
});
test('㊵.a textValues: beyond MAX_SIZE it truncates, AND it SAYS so', () => {
  const r = textValues({ a: 'x'.repeat(MAX_SIZE), b: 'debordement' });
  assert.strictEqual(r.truncated, 'size');
  assert.strictEqual(r.chunks.some((m) => m.includes('debordement')), false);
});
test('㊵.a textValues: the FIRST truncation reason is kept', () => {
  // ⚠️ `acc.truncated || …`: without it, a later size overflow would overwrite
  //    the "depth" reason and the user would read the wrong cause.
  const r = textValues({ p: enfouir(MAX_DEPTH + 1, 'x'), t: 'y'.repeat(MAX_SIZE + 1) });
  assert.strictEqual(r.truncated, 'depth');
});
test('㊵.a textValues: flat payload intact (protect-files parity)', () => {
  assert.deepStrictEqual(textValues({ file_path: '/a/b', n: 42, z: null }).chunks, ['/a/b']);
});

// ── Bash reconstruction ──
test('bashCandidates: `cd /srv && node a.js` → /srv/a.js', () => {
  assert.ok(bashCandidates('cd /srv && node a.js').includes('/srv/node'));
  assert.ok(bashCandidates('cd /srv && node a.js').includes('/srv/a.js'));
});
test('bashCandidates: the raw command is always a candidate', () => {
  assert.strictEqual(bashCandidates('cat a.js')[0], 'cat a.js');
});
test('bashCandidates: without a `cd`, no reconstruction', () => {
  assert.deepStrictEqual(bashCandidates('ls -la'), ['ls -la']);
});

// ── matchingDocs: the central contract ──
test('matchingDocs: simple substring match', () => {
  assert.deepStrictEqual(docs([R('a.js', 'docs/a.md')], 'Read', { file_path: '/x/a.js' }), ['docs/a.md']);
});
test('matchingDocs: case-insensitive AND backslash-insensitive', () => {
  assert.deepStrictEqual(docs([R('a.js', 'docs/a.md')], 'Read', { file_path: 'C:\\X\\A.JS' }), ['docs/a.md']);
});
test('rule-major ORDER: the order of the RULES wins, never that of the paths', () => {
  // ⚠️ This is the parent→child order of the concatenation. Inverting it breaks the MEANING.
  const rules = [R('parent/', 'docs/parent.md'), R('enfant.js', 'docs/enfant.md')];
  assert.deepStrictEqual(docs(rules, 'Read', { file_path: '/parent/enfant.js' }), ['docs/parent.md', 'docs/enfant.md']);
});
test('DEDUP: the FIRST rule pointing at a doc wins', () => {
  const rules = [R('a.js', 'docs/x.md'), R('/dir/', 'docs/x.md')];
  assert.deepStrictEqual(docs(rules, 'Read', { file_path: '/dir/a.js' }), ['docs/x.md']);
});
test('matchingDocs: git commands are IGNORED (commit message false positive)', () => {
  assert.deepStrictEqual(docs([R('a.js', 'docs/a.md')], 'Bash', { command: 'git commit -m "fix a.js"' }), []);
});
test('matchingDocs: git ignored ONLY for Bash', () => {
  assert.deepStrictEqual(docs([R('a.js', 'docs/a.md')], 'Read', { file_path: 'git/a.js' }), ['docs/a.md']);
});
test('matchingDocs: Bash + cd reconstruction', () => {
  assert.deepStrictEqual(docs([R('srv/a.js', 'docs/a.md')], 'Bash', { command: 'cd /srv && node a.js' }), ['docs/a.md']);
});
test('TOTALITY: non-array rules → [], never a throw', () => {
  assert.deepStrictEqual(docs(null, 'Read', { file_path: 'a' }), []);
  assert.deepStrictEqual(docs('x', 'Read', { file_path: 'a' }), []);
});
test('TOTALITY: empty/absent payload → [], never a throw', () => {
  assert.deepStrictEqual(matchingDocs([R('a', 'd')], undefined), []);
  assert.deepStrictEqual(matchingDocs([R('a', 'd')], {}), []);
});
test('TOTALITY: malformed rules ignored', () => {
  assert.deepStrictEqual(docs([null, {}, { pattern: 42 }, { doc: 'd' }], 'Read', { file_path: 'a.js' }), []);
});
test('matchingDocs: a rule without a string `doc` is never added', () => {
  assert.deepStrictEqual(docs([R('a.js', 42)], 'Read', { file_path: 'a.js' }), []);
});
test('matchingDocs: exclude removes the rule', () => {
  const rules = [R('compose.yml', 'docs/c.md', { exclude: ['umami'] })];
  assert.deepStrictEqual(docs(rules, 'Read', { file_path: '/srv/umami/compose.yml' }), []);
  assert.deepStrictEqual(docs(rules, 'Read', { file_path: '/srv/blog/compose.yml' }), ['docs/c.md']);
});

// ═══════════════════════════════════════════════════════════════════════
// MUTANT KILLERS — added on 15/07/2026 after the 1st Stryker run on this
// module (85.93%: 19 survivors). Each test below kills a PRECISE mutant,
// i.e. locks down an edge case that no test covered.
// ⚠️ DO NOT delete them believing they are redundant: without them, the code can
//    be broken on these cases WITHOUT any test turning red.
// ═══════════════════════════════════════════════════════════════════════

test('MUTANT L59 — exclude: ONE matching value is enough (some, never every)', () => {
  // ⚠️ `.some` → `.every`: with 2 excludes of which only 1 matches, `every` would NOT
  //    skip → the doc would be injected on an explicitly excluded path.
  const r = R('compose.yml', 'docs/c.md', { exclude: ['umami', 'grafana'] });
  assert.strictEqual(shouldSkip(r, '/srv/umami/compose.yml', {}), true);
});

test('MUTANT L66 — scope: ONE matching value is enough (some, never every)', () => {
  // ⚠️ `.some` → `.every`: the rule would only activate if ALL the scopes match
  //    → hundreds of scoped docs would go mute.
  const r = R('.env', 'docs/e.md', { scope: ['vps-prod', '203.0.113.5'] });
  assert.strictEqual(shouldSkip(r, '/etc/.env', { connectionId: 'vps-prod', file_path: '/etc/.env' }), false);
});

test('MUTANT L63 — scope only looks at string params (a number satisfies nothing)', () => {
  // ⚠️ Without the `typeof === 'string'` filter, a NUMERIC param would be stringified
  //    and could satisfy a scope by accident.
  const r = R('.env', 'docs/e.md', { scope: ['42'] });
  assert.strictEqual(shouldSkip(r, '/etc/.env', { port: 42, file_path: '/etc/.env' }), true);
});

test('MUTANT L64 — the params are joined by a SPACE (never glued)', () => {
  // ⚠️ `join(' ')` → `join('')`: "ab"+"cd" would form "abcd" and would satisfy a
  //    scope "bc" that exists in NO param. Silent false positive.
  const r = R('x', 'docs/x.md', { scope: ['bc'] });
  assert.strictEqual(shouldSkip(r, '/x', { a: 'ab', b: 'cd', file_path: '/x' }), true);
});

test('MUTANT L44 — apply_patch without `input` nor `patch` → no path, never a throw', () => {
  assert.deepStrictEqual(extractFilePaths('apply_patch', {}), []);
});

test('MUTANT L47 — the path extracted from the patch is TRIMMED', () => {
  // ⚠️ Without `.trim()`, "a.js  " would not match the pattern "a.js" on the Codex side.
  assert.deepStrictEqual(extractFilePaths('apply_patch', { input: '*** Update File:   a.js   ' }), ['a.js']);
});

test('MUTANT L78 — `cd X && cmd`: the SEGMENT AFTER the && is reconstructed (slice(1))', () => {
  // ⚠️ `.slice(1)` → `.slice()` would include "cd /srv" itself in the candidates.
  const c = bashCandidates('cd /srv && node app.js');
  assert.ok(c.includes('/srv/app.js'), 'the file after && must be reconstructed');
  assert.ok(!c.includes('/srv/cd'), 'the `cd` itself must not become a candidate');
});

test('MUTANT L78 — the words after && are separated by a SPACE before reconstruction', () => {
  const c = bashCandidates('cd /srv && node a.js b.js');
  assert.ok(c.includes('/srv/a.js') && c.includes('/srv/b.js'), 'each word must become a distinct candidate');
});

test('MUTANT — `;` also separates (not only &&)', () => {
  assert.ok(bashCandidates('cd /srv ; cat a.js').includes('/srv/a.js'));
});

test('MUTANT L78 — TWO separators: the segments are joined by a SPACE', () => {
  // ⚠️ `join(' ')` → `join('')`: with ONE single segment the bug is invisible.
  //    2+ segments are needed for "a.js"+"ls" to glue into "a.jsls".
  const c = bashCandidates('cd /srv && node a.js && ls b.js');
  assert.ok(c.includes('/srv/a.js'), 'a.js must remain a distinct candidate');
  assert.ok(c.includes('/srv/b.js'), 'b.js must remain a distinct candidate');
  assert.ok(!c.some((x) => x.includes('a.jsls')), 'glued segments → phantom candidate');
});

test('MUTANT L79 — afterCd is TRIMMED (no empty candidate "/srv/")', () => {
  // ⚠️ Without `.trim()`, split(/\s+/) yields a leading '' → candidate '/srv/' which
  //    would match a directory pattern and would wrongly inject a doc.
  assert.ok(!bashCandidates('cd /srv && node a.js').includes('/srv/'), 'empty candidate → false positive');
});

test('㊽ INVERTED VERDICT — a shell gesture is recognized by its SHAPE, never by its NAME', () => {
  // 🔴 THIS CASE REQUIRED `toolName === "Bash"` until 14/08/2026. **It is not
  //    deleted, it is INVERTED** — repo protocol: a founding case stays,
  //    only its verdict changes when the behavior changes INTENTIONALLY.
  // 📐 MEASURED on 7,553 real calls: 4 tools carry a `command`, all 4 are
  //    shells ⇒ the test by NAME made 809 commands (18%) INVISIBLE —
  //    all PowerShell, all SSH. What this test protected was a HOLE.
  // ⚠️ What stays locked down: WITHOUT a `command`, no shell logic (the original
  //    `&&` held TWO conditions, only one was the dialect).
  const rules = [R('srv/a.js', 'docs/a.md')];
  assert.deepStrictEqual(docs(rules, 'Bash', {}), [], 'no command ⇒ no reconstruction');
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cd /srv && node a.js' }), ['docs/a.md']);
  assert.deepStrictEqual(docs(rules, 'PowerShell', { command: 'cd /srv && node a.js' }), ['docs/a.md'], 'PowerShell was BLIND');
  assert.deepStrictEqual(docs(rules, 'mcp__ssh__ssh_exec', { command: 'cd /srv && node a.js' }), ['docs/a.md'], 'SSH was BLIND');
});

test('MUTANT L78 — GLUED separators: the join(" ") is indispensable', () => {
  // ⚠️ My 1st test had spaces around the `&&` → the segments were ALREADY
  //    spaced → the `join('')` mutant stayed invisible. The `&&` must be glued so
  //    that "a.js"+"ls" merge into "a.jsls". Lesson: a test must exercise the case
  //    where the mutated line CHANGES something, not just miss it.
  const c = bashCandidates('cd /srv&&node a.js&&ls b.js');
  assert.ok(c.includes('/srv/a.js'), 'a.js must remain distinct');
  assert.ok(c.includes('/srv/b.js'), 'b.js must remain distinct');
  assert.ok(!c.some((x) => x.includes('a.jsls')), 'glued segments → phantom candidate');
});

test('MUTANT L127 — the BASH branch also applies exclude/scope', () => {
  // ⚠️ All my exclude tests went through `Read`: the Bash branch was not
  //    covered → `&&` → `||` survived there, so an exclude could have been IGNORED
  //    on a Bash command without any test turning red.
  const rules = [R('compose.yml', 'docs/c.md', { exclude: ['umami'] })];
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cat /srv/umami/compose.yml' }), [], 'exclude ignored in Bash');
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cat /srv/blog/compose.yml' }), ['docs/c.md']);
});

test('MUTANT L127 — the BASH branch requires the pattern to REALLY match', () => {
  // ⚠️ `&&` → `true`: any command would inject any doc.
  assert.deepStrictEqual(docs([R('zzz-absent.js', 'docs/z.md')], 'Bash', { command: 'ls -la' }), []);
});

test('MUTANT L127 — the BASH branch also applies scope', () => {
  const rules = [R('.env', 'docs/e.md', { scope: ['vps-prod'] })];
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cat /etc/.env' }), [], 'scope ignored in Bash');
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'cat /srv/vps-prod/.env' }), ['docs/e.md']);
});

test('MUTANT L102 — a NON-STRING `command` must never be treated as a command', () => {
  // ⚠️ `typeof === 'string' ? c : ''` → `true ? c : ''`: a numeric command
  //    would reach bashCandidates → `42.match(...)` → TypeError → dead hook
  //    → NO MORE doc injected at all. Totality mandatory.
  const rules = [R('a.js', 'docs/a.md')];
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 42 }), []);
  assert.deepStrictEqual(docs(rules, 'Bash', { command: null }), []);
  assert.deepStrictEqual(docs(rules, 'Bash', { command: { a: 1 } }), []);
});

test('㊽ INVERTED VERDICT — the `git` skip applies to EVERY shell, no longer only Bash', () => {
  // 🔴 THIS CASE REQUIRED `toolName === "Bash"` until 14/08/2026. **Not deleted,
  //    INVERTED** — repo protocol: a founding case stays, only its verdict
  //    changes when the behavior changes INTENTIONALLY.
  // ⚠️ The REASON for the skip is the CONTENT of a commit message ("fix
  //    validation.ts" would match the pattern `validation.ts`), and that content is
  //    identical whatever the shell. Restricting it to `Bash` therefore let
  //    exactly the same false positives through via PowerShell and SSH.
  const rules = [R('a.js', 'docs/a.md')];
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 'git commit -m "a.js"' }), [], 'Bash + git = skip');
  assert.deepStrictEqual(docs(rules, 'PowerShell', { command: 'git commit -m "a.js"' }), [], 'PowerShell + git = skip TOO');
  assert.deepStrictEqual(docs(rules, 'mcp__ssh__ssh_exec', { command: 'git log a.js' }), [], 'SSH + git = skip TOO');
  // ⚠️ Still locked down: WITHOUT a `command`, the skip never applies.
  assert.deepStrictEqual(docs(rules, 'Read', { file_path: '/x/a.js' }), ['docs/a.md']);
});

test('MUTANT L102 — the command fallback is EMPTY, never a literal', () => {
  // ⚠️ `: ''` mutated into `: "Stryker was here!"` (real survivor 16/07/2026):
  //    a non-string `command` would become a MATCHABLE string — any rule whose
  //    pattern is contained in the mutant's literal would inject its doc on a
  //    payload WITHOUT a command. The test's pattern targets Stryker's literal on purpose.
  const rules = [R('was here', 'docs/piege.md')];
  assert.deepStrictEqual(docs(rules, 'Bash', { command: 42 }), []);
});

// ── cwd (18/07/2026): candidate path — supplied by the skill source ONLY ──
test('extractFilePaths: toolInput.cwd = candidate path IF a string, ignored otherwise', () => {
  const rules = [{ pattern: 'mon-projet', doc: 'docs/p.md' }];
  // string cwd containing the pattern → matches.
  assert.deepStrictEqual(
    matchingDocs(rules, { toolName: 'Bash', toolInput: { command: 'npm test', cwd: 'C:/dev/mon-projet' } }),
    [{ doc: 'docs/p.md' }]
  );
  // NON-string cwd → never pushed (the typeof of extractFilePaths is the only authority).
  assert.deepStrictEqual(
    matchingDocs(rules, { toolName: 'Bash', toolInput: { command: 'npm test', cwd: 42 } }),
    []
  );
});

// ⚠️ MUTANT `typeof value === 'object'` → `true`: an `undefined` value would then
//    go into `Object.values(undefined)`, which THROWS. The function must stay TOTAL —
//    a throw here would kill the hook, hence EVERY injection of the corpus.
test('㊵.a textValues: TOTAL — undefined/boolean never throw', () => {
  assert.deepStrictEqual(textValues({ a: undefined, b: true, c: 'ok' }).chunks, ['ok']);
  assert.deepStrictEqual(textValues(undefined).chunks, []);
});

// ═══════════════════════════════════════════════════════════════════════
// 51 + ㊿ (15/08/2026) — THE TRIGGER GOES DOWN, THE FILTERS IGNORE THE PAYLOAD CONTENT
// ═══════════════════════════════════════════════════════════════════════
test('51 the trigger finds a NESTED path under a declared key', () => {
  // 🔴 The trigger only read the 1st level: a path in `{args:{…}}`
  //    was INVISIBLE even if its key was declared. This is ㊵ never applied to the
  //    trigger — the filters, for their part, already went down since 12/08.
  assert.deepStrictEqual(docs([R('lint.js', 'd.md')], 'mcp__x__y', { args: { deep: { file_path: '/a/lint.js' } } }), ['d.md']);
});
test('51 the trigger reads ARRAYS (the element inherits the PARENT key)', () => {
  // ⚠️ Without the inheritance, the keys would be `0`/`1` and nothing would match — 56
  //    real paths went through there (measured on 7,553 calls).
  assert.deepStrictEqual(docs([R('gate.js', 'd.md')], 'X', { path: ['/x/gate.js', '/y/other.js'] }), ['d.md']);
});
test('51 a NON-declared key triggers NOTHING (no guessing)', () => {
  // 🛑 We NEVER guess that a param carries a path from its name: the
  //    `path`/`file`/`dir` convention is ENGLISH-SPEAKING, hence blind to `dateipfad`.
  //    An exotic key is ADDED to the profile; it is not guessed.
  assert.deepStrictEqual(docs([R('gate.js', 'd.md')], 'X', { zzz: '/x/gate.js' }), []);
});
test('51 a nested COMMAND triggers (remote MCPs put theirs in args)', () => {
  assert.deepStrictEqual(docs([R('lint.js', 'd.md')], 'mcp__ssh__ssh_exec', { args: { command: 'cd /w && node lint.js' } }), ['d.md']);
});
test('㊿ the PAYLOAD CONTENT is out of the filters universe — BOTH of them', () => {
  // 🔴 55 exclusions were decided ONLY by content: one writes a
  //    file whose text mentions `node_modules` and the doc DISAPPEARS.
  const geste = { file_path: '/a/x.test.js', new_string: 'rm -rf node_modules && dist' };
  assert.strictEqual(shouldSkip(R('x.test.js', 'd', { exclude: ['node_modules'] }), '/a/x.test.js', geste), false, 'exclusion decided by CONTENT');
  assert.strictEqual(shouldSkip(R('x.test.js', 'd', { scope: ['dist'] }), '/a/x.test.js', geste), true, 'scope satisfied by CONTENT');
  // ⚠️ The context and the other params, however, are still read.
  assert.strictEqual(shouldSkip(R('x.test.js', 'd', { exclude: ['node_modules'] }), '/a/node_modules/x.test.js', geste), true);
});
test('51 MUTANT — the trigger DEPTH BOUND really bites', () => {
  // ⚠️ Same bound as the filters: two different bounds for the same payload
  //    would be one operator seeing further than another for no reason.
  const creuser = (n, leaf) => (n === 0 ? leaf : { a: creuser(n - 1, leaf) });
  assert.deepStrictEqual(extractFilePaths('X', creuser(3, { file_path: '/a/vu.js' })), ['/a/vu.js']);
  assert.deepStrictEqual(extractFilePaths('X', creuser(MAX_DEPTH + 2, { file_path: '/a/trop-loin.js' })), [],
    'the bound does not bite: an arbitrarily deep payload would become a point of failure');
});
test('51 MUTANT — the BOUND is EXACT (the last admitted level, and the first refused)', () => {
  // ⚠️ `> 0` mutated into `>= 0` is only visible AT the limit level: a "very
  //    deep" test is not enough, BOTH edges are needed. Same thing for
  //    `depth - 1` mutated into `+ 1`.
  const creuser = (n, leaf) => (n === 0 ? leaf : { a: creuser(n - 1, leaf) });
  const found = (n) => extractFilePaths('X', creuser(n, { path: '/x.js' })).length > 0;
  assert.strictEqual(found(MAX_DEPTH - 1), true, 'the last ADMITTED level must be seen');
  assert.strictEqual(found(MAX_DEPTH), false, 'the first REFUSED level must be invisible');
});

// ═══ 53bis (15/08/2026) — A PATTERN LIVES IN A VALUE, NEVER STRADDLING ═══
// The universe of the filters was a CONCATENATION (`join(' ')`): a pattern with a
// space matched straddling two adjacent params — a text that exists
// in NO param of the gesture. Reproduced on the engine, in BOTH directions.
// Price measured before the switch: 0 change over 7,355 real gestures.
import { test as t53 } from 'vitest';
t53('53bis: an exclude with a SPACE does NOT match straddling two params', () => {
  const rule = { pattern: 'srv', exclude: ['node build'], doc: 'd.md' };
  const geste = { toolName: 'X', toolInput: { file_path: '/x/srv', a: 'run node', b: 'build x' } };
  assert.strictEqual(matchingDocs([rule], geste).length, 1, 'the text "node build" exists in no param — excluding would be a PHANTOM exclusion');
});
t53('53bis: an exclude with a SPACE matches WITHIN a single value (capability intact)', () => {
  const rule = { pattern: 'srv', exclude: ['node build'], doc: 'd.md' };
  const geste = { toolName: 'X', toolInput: { file_path: '/x/srv', a: 'run node build x' } };
  assert.strictEqual(matchingDocs([rule], geste).length, 0);
});
t53('53bis: a scope with a SPACE is NOT satisfied straddling, but it is WITHIN a value', () => {
  const rule = { pattern: 'srv', scope: ['node build'], doc: 'd.md' };
  assert.strictEqual(matchingDocs([rule], { toolName: 'X', toolInput: { file_path: '/x/srv', a: 'run node', b: 'build x' } }).length, 0);
  assert.strictEqual(matchingDocs([rule], { toolName: 'X', toolInput: { file_path: '/x/srv', a: 'go node build' } }).length, 1);
});
t53('53bis: the CONTEXT stays a SEPARATE value — a pattern never glues params+context', () => {
  // end of param `…ex` + context `plain.js`: "explain.js" exists nowhere.
  const rule = { pattern: 'plain.js', exclude: ['ex plain.js'], doc: 'd.md' };
  const geste = { toolName: 'X', toolInput: { file_path: '/x/plain.js', a: 'suffix ex' } };
  assert.strictEqual(matchingDocs([rule], geste).length, 1);
});
