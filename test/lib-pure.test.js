// ═══════════════════════════════════════════════════════════════════════
// PURE UNIT tests of lib-pure.js — zero I/O, zero spawn, zero process.
// Stryker target (stryker.conf.json → mutate: ["lib-pure.js"]): every
// branch/operator of lib-pure.js MUST be covered here for the
// mutation testing to make sense (a surviving mutant = an uncovered case).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import lib from '../src/lib-pure.js';

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same cond).
// cond is evaluated sequentially at module level (original order preserved).
// ⚠️ cond is a THUNK evaluated INSIDE the test callback — NEVER at module
// level: under Stryker perTest, an expression evaluated when the file is
// loaded is covered by NO individual test (a "static" mutant) and
// its mutants SURVIVE (measured 16/07/2026: 42 survivors, score 76.67%).
function ok(name, cond) {
  test(name, () => { assert.ok(cond(), name); });
}

// ── sanitizeSessionId ──
ok('sanitizeSessionId: safe characters kept', () => lib.sanitizeSessionId('abc-123_XYZ') === 'abc-123_XYZ');
ok('sanitizeSessionId: dangerous characters removed', () => lib.sanitizeSessionId('../../etc/passwd') === 'etcpasswd');
ok('sanitizeSessionId: empty → "unknown"', () => lib.sanitizeSessionId('') === 'unknown');
ok('sanitizeSessionId: undefined → "unknown"', () => lib.sanitizeSessionId(undefined) === 'unknown');
ok('sanitizeSessionId: null → "unknown"', () => lib.sanitizeSessionId(null) === 'unknown');
ok('sanitizeSessionId: only dangerous characters → "unknown"', () => lib.sanitizeSessionId('///') === 'unknown');

// ── scopeId (per-agent state, 19/07/2026) ──
// ⚠️ Without an agent_id, the key MUST be byte-identical to sanitizeSessionId:
// that is the backwards compatibility that keeps the differential parity + Codex intact.
ok('scopeId: without an agent_id = the historical key unchanged', () => lib.scopeId('s1') === lib.sanitizeSessionId('s1'));
ok('scopeId: null/empty agent_id = the historical key (never "--agent-unknown")', () => lib.scopeId('s1', null) === 's1' && lib.scopeId('s1', '') === 's1');
ok('scopeId: agent_id present → --agent- suffix', () => lib.scopeId('s1', 'a2') === 's1--agent-a2');
ok('scopeId: two distinct agents → distinct keys', () => lib.scopeId('s1', 'aaa') !== lib.scopeId('s1', 'bbb'));
ok('scopeId: agent ≠ master (never a collision)', () => lib.scopeId('s1', 'a2') !== lib.scopeId('s1'));
ok('scopeId: a dirty agent_id is sanitised (no traversal)', () => lib.scopeId('s1', '../x') === 's1--agent-x');

// ── serverName ──
ok('serverName: extracts the simple server', () => lib.serverName('mcp__stripe__authenticate') === 'stripe');
ok('serverName: handles servers with multiple underscores', () => lib.serverName('mcp__plugin_discord_discord__reply') === 'plugin_discord_discord');
ok('serverName: native tool (no mcp__ prefix) → null', () => lib.serverName('Bash') === null);
ok('serverName: empty string → null', () => lib.serverName('') === null);
ok('serverName: undefined → null', () => lib.serverName(undefined) === null);
ok('serverName: mcp__ prefix but an empty server → null', () => lib.serverName('mcp____tool') === null);

// ── toolSuffix ──
ok('toolSuffix: extracts the correct suffix', () => lib.toolSuffix('mcp__stripe__authenticate', 'stripe') === 'authenticate');
ok('toolSuffix: server null → null', () => lib.toolSuffix('mcp__stripe__authenticate', null) === null);
ok('toolSuffix: tool_name does not match the expected prefix → null', () => lib.toolSuffix('mcp__odoo__x', 'stripe') === null);
ok('toolSuffix: empty tool_name → null', () => lib.toolSuffix('', 'stripe') === null);
ok('toolSuffix: the suffix itself with underscores', () => lib.toolSuffix('mcp__odoo__odoo_call', 'odoo') === 'odoo_call');
ok('toolSuffix: the explicit server=null guard prevents an accidental match on a literal tool_name "mcp__null__..."', () => lib.toolSuffix('mcp__null__foo', null) === null);

// ── getByPath ──
ok('getByPath: simple path', () => lib.getByPath({ a: 'x' }, 'a') === 'x');
ok('getByPath: nested path', () => lib.getByPath({ args: { tool: 'delete_record' } }, 'args.tool') === 'delete_record');
ok('getByPath: absent path → null', () => lib.getByPath({ args: {} }, 'args.tool') === null);
ok('getByPath: null root object → null', () => lib.getByPath(null, 'a.b') === null);
ok('getByPath: non-string dottedPath → null', () => lib.getByPath({ a: 1 }, null) === null);
ok('getByPath: a number value converted into a string', () => lib.getByPath({ args: { id: 42 } }, 'args.id') === '42');
ok('getByPath: an object value (not a scalar) → null', () => lib.getByPath({ args: { tool: {} } }, 'args.tool') === null);
ok('getByPath: an array value (not a scalar) → null', () => lib.getByPath({ args: { tool: [] } }, 'args.tool') === null);
ok('getByPath: the path crosses an intermediate null → null (no crash)', () => lib.getByPath({ args: null }, 'args.tool') === null);

// ── thresholdFor ──
ok('thresholdFor: no config → default 4', () => lib.thresholdFor({}, 'stripe') === 4);
ok('thresholdFor: custom defaultThreshold', () => lib.thresholdFor({ defaultThreshold: 10 }, 'stripe') === 10);
ok('thresholdFor: the server override prevails over defaultThreshold', () => lib.thresholdFor({ defaultThreshold: 10, servers: { stripe: { threshold: 1 } } }, 'stripe') === 1);
ok('thresholdFor: a non-integer override is ignored → fallback', () => lib.thresholdFor({ defaultThreshold: 10, servers: { stripe: { threshold: 'oops' } } }, 'stripe') === 10);
ok('thresholdFor: a non-integer defaultThreshold → hard fallback 4', () => lib.thresholdFor({ defaultThreshold: 'oops' }, 'stripe') === 4);
ok('thresholdFor: an explicit threshold=0 is honoured (falsy but valid)', () => lib.thresholdFor({ servers: { stripe: { threshold: 0 } } }, 'stripe') === 0);

// ── modeFor ──
ok('modeFor: no config → "smart"', () => lib.modeFor({}, 'stripe') === 'smart');
ok('modeFor: the global mode is honoured', () => lib.modeFor({ mode: 'once' }, 'stripe') === 'once');
ok('modeFor: the server override prevails over the global mode', () => lib.modeFor({ mode: 'once', servers: { stripe: { mode: 'dumb' } } }, 'stripe') === 'dumb');
ok('modeFor: a server without an override stays on the global mode', () => lib.modeFor({ mode: 'once', servers: { odoo: { mode: 'dumb' } } }, 'stripe') === 'once');

// ── isServerActive ──
ok('isServerActive: filterMode "none" (default) → everything active', () => lib.isServerActive({}, 'stripe') === true);
ok('isServerActive: the whitelist contains the server → active', () => lib.isServerActive({ filterMode: 'whitelist', filterList: ['stripe'] }, 'stripe') === true);
ok('isServerActive: the whitelist does not contain the server → inactive', () => lib.isServerActive({ filterMode: 'whitelist', filterList: ['odoo'] }, 'stripe') === false);
ok('isServerActive: the blacklist contains the server → inactive', () => lib.isServerActive({ filterMode: 'blacklist', filterList: ['stripe'] }, 'stripe') === false);
ok('isServerActive: the blacklist does not contain the server → active', () => lib.isServerActive({ filterMode: 'blacklist', filterList: ['odoo'] }, 'stripe') === true);
ok('isServerActive: filterList absent (whitelist) → everything inactive (empty list)', () => lib.isServerActive({ filterMode: 'whitelist' }, 'stripe') === false);
ok('isServerActive: a non-array filterList → treated as empty', () => lib.isServerActive({ filterMode: 'whitelist', filterList: 'stripe' }, 'stripe') === false);
ok('isServerActive: an unknown filterMode → fail-open (active)', () => lib.isServerActive({ filterMode: 'anything-at-all' }, 'stripe') === true);
ok('isServerActive: filterMode "none" WITH a non-empty filterList → still ignores the list (not an implicit blacklist)', () => lib.isServerActive({ filterMode: 'none', filterList: ['stripe'] }, 'stripe') === true);
ok('isServerActive: filterMode absent WITH a non-empty filterList → the same behaviour as an explicit "none"', () => lib.isServerActive({ filterList: ['stripe'] }, 'stripe') === true);

// ── isFrameworkEnabled (GLOBAL switch — cuts injection AND tracking) ──
ok('isFrameworkEnabled: no "enabled" field → ON by default', () => lib.isFrameworkEnabled({}) === true);
ok('isFrameworkEnabled: explicit enabled=true → ON', () => lib.isFrameworkEnabled({ enabled: true }) === true);
ok('isFrameworkEnabled: explicit enabled=false → OFF', () => lib.isFrameworkEnabled({ enabled: false }) === false);
ok('isFrameworkEnabled: unexpected value (neither true nor false) → fail-open ON (not the literal false)', () => lib.isFrameworkEnabled({ enabled: 'oops' }) === true);
ok('isFrameworkEnabled: enabled=0 (falsy but not false) → ON (only the literal `false` disables)', () => lib.isFrameworkEnabled({ enabled: 0 }) === true);
ok('isFrameworkEnabled: enabled=null → ON (fail-open)', () => lib.isFrameworkEnabled({ enabled: null }) === true);

// ── shouldShowNotification (controls ONLY the visible systemMessage, never the injection) ──
ok('shouldShowNotification: no "showNotification" field → ON by default', () => lib.shouldShowNotification({}) === true);
ok('shouldShowNotification: explicit showNotification=true → ON', () => lib.shouldShowNotification({ showNotification: true }) === true);
ok('shouldShowNotification: explicit showNotification=false → OFF', () => lib.shouldShowNotification({ showNotification: false }) === false);
ok('shouldShowNotification: unexpected value (neither true nor false) → fail-open ON (not the literal false)', () => lib.shouldShowNotification({ showNotification: 'oops' }) === true);
ok('shouldShowNotification: showNotification=0 (falsy but not false) → ON (only the literal `false` disables)', () => lib.shouldShowNotification({ showNotification: 0 }) === true);
ok('shouldShowNotification: showNotification=null → ON (fail-open)', () => lib.shouldShowNotification({ showNotification: null }) === true);

// ── formatSystemMessage ──
ok('formatSystemMessage: an explicit [ctxroute] prefix to distinguish it from the other sources', () => lib.formatSystemMessage('stripe', ['server']) === '📄 [ctxroute] stripe');
ok('formatSystemMessage: a single level (server) → no suffix', () => lib.formatSystemMessage('stripe', ['server']).includes('(') === false);
ok('formatSystemMessage: 2 levels (server+tool) → a suffix with the additional level', () => lib.formatSystemMessage('stripe', ['server', 'tool']) === '📄 [ctxroute] stripe (tool)');
ok('formatSystemMessage: 3 levels (server+tool+subTool) → the 2 additional levels listed', () => lib.formatSystemMessage('odoo', ['server', 'tool', 'subTool']) === '📄 [ctxroute] odoo (tool+subTool)');
ok('formatSystemMessage: levels absent/empty → no crash, no suffix', () => lib.formatSystemMessage('stripe', []) === '📄 [ctxroute] stripe');
ok('formatSystemMessage: non-array levels → no crash, no suffix', () => lib.formatSystemMessage('stripe', undefined) === '📄 [ctxroute] stripe');

// ── shouldInjectFor ──
ok('shouldInjectFor: dumb mode → always true', () => lib.shouldInjectFor('dumb', true, 999, 1) === true);
ok('shouldInjectFor: 1st call (entrySeen=false) → true, all modes', () => lib.shouldInjectFor('once', false, 0, 4) === true);
ok('shouldInjectFor: once mode, already seen → false', () => lib.shouldInjectFor('once', true, 999, 4) === false);
ok('shouldInjectFor: smart mode, below the threshold → false', () => lib.shouldInjectFor('smart', true, 2, 4) === false);
ok('shouldInjectFor: smart mode, threshold reached (equality) → true', () => lib.shouldInjectFor('smart', true, 4, 4) === true);
ok('shouldInjectFor: smart mode, above the threshold → true', () => lib.shouldInjectFor('smart', true, 5, 4) === true);
ok('shouldInjectFor: unknown mode, already seen → false ("once" behaviour by default)', () => lib.shouldInjectFor('anything-at-all', true, 999, 4) === false);

// ── docCandidatePaths ──
// ⚠️ The fixtures are THUNKS (recomputed INSIDE each test) — a module-level
//    `const` would be evaluated at load time = a surviving static mutant.
{
  const c1 = () => lib.docCandidatePaths({}, 'stripe', 'mcp__stripe__authenticate', {});
  const lvl1 = () => c1().find((c) => c.relPath === 'stripe.md');
  const lvl2 = () => c1().find((c) => c.relPath === 'stripe/authenticate.md');
  ok('docCandidatePaths: level 1 (server) always present', () => !!lvl1());
  ok('docCandidatePaths: level 1 correct sourceLabel', () => lvl1() && lvl1().sourceLabel === 'docs/mcp/stripe.md');
  ok('docCandidatePaths: level 1 label "server"', () => lvl1() && lvl1().level === 'server');
  ok('docCandidatePaths: level 2 (tool) present if a suffix is extracted', () => !!lvl2());
  ok('docCandidatePaths: level 2 correct sourceLabel', () => lvl2() && lvl2().sourceLabel === 'docs/mcp/stripe/authenticate.md');
  ok('docCandidatePaths: level 2 label "tool"', () => lvl2() && lvl2().level === 'tool');
  ok('docCandidatePaths: no level 3 without a configured subToolParam', () => c1().length === 2);
}
{
  const c2 = () => lib.docCandidatePaths(
    { servers: { odoo: { subToolParam: 'args.tool' } } },
    'odoo', 'mcp__odoo__odoo_call', { args: { tool: 'delete_record' } }
  );
  const lvl3 = () => c2().find((c) => c.relPath === 'odoo/delete_record.md');
  ok('docCandidatePaths: level 3 (sub-tool) added if subToolParam is configured and resolved', () => !!lvl3());
  ok('docCandidatePaths: level 3 correct sourceLabel', () => lvl3() && lvl3().sourceLabel === 'docs/mcp/odoo/delete_record.md');
  ok('docCandidatePaths: level 3 label "subTool"', () => lvl3() && lvl3().level === 'subTool');
  ok('docCandidatePaths: level 2 also present (odoo_call) in addition to level 3', () => c2().some((c) => c.relPath === 'odoo/odoo_call.md'));
  ok('docCandidatePaths: 3 distinct levels when tool !== subTool', () => c2().length === 3);
}
{
  // ⚠️ De-duplication case: the "tool" AND the "subTool" point to the same name.
  const c3 = () => lib.docCandidatePaths(
    { servers: { same: { subToolParam: 'args.tool' } } },
    'same', 'mcp__same__foo', { args: { tool: 'foo' } }
  );
  ok('docCandidatePaths: de-duplicates if subTool === suffix (no duplicate)', () => c3().filter((c) => c.relPath === 'same/foo.md').length === 1);
  ok('docCandidatePaths: 2 candidates in total (server + tool, no duplicated 3rd)', () => c3().length === 2);
}
{
  const c4 = () => lib.docCandidatePaths({}, 'bash-like', 'Bash', {});
  ok('docCandidatePaths: a tool_name not matching the expected prefix → no level 2', () => c4().length === 1);
}

// ── isSafePathSegment — SECURITY (traversal). ⚠️ NEVER DELETE ──
// `subTool` comes out of tool_input, hence from a value potentially derived from
// EXTERNAL data. Without a filter, "../../.." makes path.join() escape
// docs/mcp/ and injects an arbitrary .md from the disk into the agent's
// context AS AN AUTHORITATIVE INSTRUCTION (prompt injection).
ok('isSafePathSegment: a simple name → safe', () => lib.isSafePathSegment('delete_record') === true);
ok('isSafePathSegment: ".." → rejected', () => lib.isSafePathSegment('..') === false);
ok('isSafePathSegment: "." → rejected', () => lib.isSafePathSegment('.') === false);
ok('isSafePathSegment: POSIX slash → rejected', () => lib.isSafePathSegment('../../etc/passwd') === false);
ok('isSafePathSegment: Windows backslash → rejected', () => lib.isSafePathSegment('..\\..\\secrets') === false);
ok('isSafePathSegment: NUL byte → rejected', () => lib.isSafePathSegment('foo\0bar') === false);
ok('isSafePathSegment: empty string → rejected', () => lib.isSafePathSegment('') === false);
ok('isSafePathSegment: non-string → rejected', () => lib.isSafePathSegment(null) === false);
ok('isSafePathSegment: absolute path → rejected', () => lib.isSafePathSegment('/etc/passwd') === false);

// ── TOTALITY: an object with a broken toString. ⚠️ NEVER DELETE ──
// `{"toString": 0}` is VALID JSON, hence reachable from a hook
// payload. String(x)/exec(x) THROW on it ("Cannot convert object to primitive
// value") — JS coercion does NOT protect, contrary to what the
// code comment asserted before 15/07/2026 (found by property-based testing).
// A throw here = the hook fails open = total silence.
{
  const evil = JSON.parse('{"toString": 0}');
  ok('serverName: an object with a broken toString → null, does not throw', () => lib.serverName(evil) === null);
  ok('toolSuffix: an object with a broken toString → null, does not throw', () => lib.toolSuffix(evil, 'stripe') === null);
  ok('sanitizeSessionId: an object with a broken toString → "unknown", does not throw', () => lib.sanitizeSessionId(evil) === 'unknown');
  ok('docCandidatePaths: a broken object tool_name → does not throw', () => lib.docCandidatePaths({}, 'stripe', evil, {}).length === 1);
  ok('sanitizeSessionId: a number is accepted (numeric session_id)', () => lib.sanitizeSessionId(42) === '42');
  ok('sanitizeSessionId: an ordinary object → "unknown" (not "objectObject")', () => lib.sanitizeSessionId({}) === 'unknown');
  ok('sanitizeSessionId: an array → "unknown"', () => lib.sanitizeSessionId([1, 2]) === 'unknown');
}

// ── SECURITY: a hostile SERVER name. ⚠️ NEVER DELETE ──
// A REAL hole found by property-based testing (not by re-reading) on 15/07/2026:
// serverName() used `[^_]+`, which matches `/` and `.` → `mcp__../../etc__x`
// gave server="../../etc". These cases are the DETERMINISTIC version of the property
// test (Stryker only runs lib-pure.test.js: without them, the guard would survive
// the mutants and the hole could come back without anything turning red).
ok('serverName: a server name with traversal → null (restrictive regex)', () => lib.serverName('mcp__../../etc__x') === null);
ok('serverName: a server name with a slash → null', () => lib.serverName('mcp__a/b__x') === null);
ok('serverName: a server name with a backslash → null', () => lib.serverName('mcp__a\\b__x') === null);
ok('serverName: a server name with a dot → null', () => lib.serverName('mcp__a.b__x') === null);
ok('serverName: a legitimate name with dashes is kept', () => lib.serverName('mcp__qa-tools__do') === 'qa-tools');
ok('serverName: a legitimate name with underscores is kept', () => lib.serverName('mcp__plugin_discord_discord__do') === 'plugin_discord_discord');
ok('docCandidatePaths: an unsafe server → ZERO candidate', () => lib.docCandidatePaths({}, '../../etc', 'mcp__x__y', {}).length === 0);
ok('docCandidatePaths: a server with a slash → ZERO candidate', () => lib.docCandidatePaths({}, 'a/b', 'mcp__x__y', {}).length === 0);
ok('docCandidatePaths: an empty server → ZERO candidate', () => lib.docCandidatePaths({}, '', 'mcp__x__y', {}).length === 0);
ok('docCandidatePaths: a null server → ZERO candidate', () => lib.docCandidatePaths({}, null, 'mcp__x__y', {}).length === 0);
ok('docCandidatePaths: a safe server → the server candidate is present', () => lib.docCandidatePaths({}, 'stripe', 'mcp__stripe__pay', {})[0].relPath === 'stripe.md');

{
  // The traversal must disappear from the CANDIDATES themselves (defence at the source,
  // never an I/O-side filter that a future caller could forget).
  const evil = () => lib.docCandidatePaths(
    { servers: { odoo: { subToolParam: 'args.tool' } } },
    'odoo', 'mcp__odoo__odoo_call', { args: { tool: '../../../../secrets' } }
  );
  ok('docCandidatePaths: a subTool with traversal → NO level 3 candidate', () => evil().every((c) => !c.relPath.includes('..')));
  ok('docCandidatePaths: a malicious subTool → only the server+tool levels remain', () => evil().length === 2);

  const evilSuffix = () => lib.docCandidatePaths({}, 'srv', 'mcp__srv__../../etc/passwd', {});
  ok('docCandidatePaths: a tool suffix with traversal → NO level 2 candidate', () => evilSuffix().length === 1 && evilSuffix()[0].level === 'server');
}

// ── MUTANT lib-pure L147: the filterList fallback is EMPTY, never populated ──
// ⚠️ `: []` mutated into `["Stryker was here"]` (a real survivor 16/07/2026): in
//    whitelist mode with an invalid filterList, a server bearing THE name of the literal
//    would become active. Contract: an invalid filterList + whitelist = NO server
//    active, whatever its name — including the one Stryker fabricates.
ok('isServerActive: whitelist + an invalid filterList → inactive even for "Stryker was here"', () => lib.isServerActive({ filterMode: 'whitelist', filterList: 'not-an-array' }, 'Stryker was here') === false);

// ═══════════════════════════════════════════════════════════════════════
// parseFrameArgs — declaration of the multi-frame transport (config, not code)
// ═══════════════════════════════════════════════════════════════════════

test('parseFrameArgs: reads --frame / --frames', () => {
  assert.deepStrictEqual(lib.parseFrameArgs(['node', 'h.js', '--frame', '2', '--frames', '4']), { frame: 2, nbFrames: 4 });
  assert.deepStrictEqual(lib.parseFrameArgs(['node', 'h.js', '--frames', '3', '--frame', '3']), { frame: 3, nbFrames: 3 });
});

test('parseFrameArgs: nothing declared → a single frame (today\'s behaviour)', () => {
  assert.deepStrictEqual(lib.parseFrameArgs(['node', 'h.js']), { frame: 1, nbFrames: 1 });
  assert.deepStrictEqual(lib.parseFrameArgs([]), { frame: 1, nbFrames: 1 });
});

test('parseFrameArgs: an absurd input → a single frame, NEVER a throw', () => {
  // ⚠️ A badly written declaration DEGRADES, it never breaks the injection.
  for (const wrong of [undefined, null, 'text', 42, {}]) {
    assert.deepStrictEqual(lib.parseFrameArgs(wrong), { frame: 1, nbFrames: 1 });
  }
  for (const v of ['0', '-2', '2.5', 'x', '', undefined]) {
    assert.deepStrictEqual(lib.parseFrameArgs(['--frame', v, '--frames', v]), { frame: 1, nbFrames: 1 });
  }
});

test('parseFrameArgs: a missing value after the flag → a single frame', () => {
  assert.deepStrictEqual(lib.parseFrameArgs(['node', 'h.js', '--frames']), { frame: 1, nbFrames: 1 });
});

test('parseFrameArgs: a BARE NUMBER in the command line is NOT a declaration', () => {
  // ⚠️ Found by mutation on 03/08/2026: without the "flag absent" output,
  //    `argv[i + 1]` with i = -1 reads `argv[0]` — any numeric
  //    argument would then be taken for a packet count, and the gate
  //    would split an injection nobody asked to fragment.
  assert.deepStrictEqual(lib.parseFrameArgs(['3', '5']), { frame: 1, nbFrames: 1 });
  assert.deepStrictEqual(lib.parseFrameArgs(['2']), { frame: 1, nbFrames: 1 });
});

test('parseFrameArgs: FLOOR value — 0 and negatives are brought back to 1, never below', () => {
  assert.deepStrictEqual(lib.parseFrameArgs(['--frames', '0']), { frame: 1, nbFrames: 1 });
  assert.deepStrictEqual(lib.parseFrameArgs(['--frames', '-7']), { frame: 1, nbFrames: 1 });
  assert.deepStrictEqual(lib.parseFrameArgs(['--frame', '2', '--frames', '6']), { frame: 2, nbFrames: 6 });
});

test('parseFrameArgs: an OUT-OF-BOUNDS index → a safe fallback, never somebody else\'s packet', () => {
  // ⚠️ Emitting packet 1 when the 9th of 3 is requested would lie about the content.
  assert.deepStrictEqual(lib.parseFrameArgs(['--frame', '9', '--frames', '3']), { frame: 1, nbFrames: 1 });
  assert.deepStrictEqual(lib.parseFrameArgs(['--frame', '4', '--frames', '4']), { frame: 4, nbFrames: 4 });
});

// ═══════════════════════════════════════════════════════════════════════
// declaredBudget — the budget the WIRING passes to the engine (05/08/2026)
// ⚠️ Closes a GREEN THAT LIES: the Codex wiring declared "no limit"
//    since 04/08, the engine assumed 8000, and a 76,000 c skill
//    went out in 11 gestures instead of 1. No test, no gate saw it.
// ⚠️ Semantics taken WORD FOR WORD from Codex (0.146.0 binary: "`0`
//    disables spilling") — never a home-made convention in parallel.
// ═══════════════════════════════════════════════════════════════════════

test('declaredBudget: 0 = NO limit (Codex\'s convention, not ours)', () => {
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget', '0']), Infinity);
});

test('declaredBudget: a positive integer is the budget, as is', () => {
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget', '5000']), 5000);
});

test('declaredBudget: absent = the framework floor (an old wiring is NEVER broken)', () => {
  assert.strictEqual(lib.declaredBudget(['node', 'x.js']), undefined);
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget']), undefined, 'flag without a value');
});

test('declaredBudget: an unreadable value = the floor, NEVER an invented bound', () => {
  // ⚠️ A guessed budget is worse than a floor: it would be WRONG silently.
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget', 'abc']), undefined);
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget', '-1']), undefined);
  assert.strictEqual(lib.declaredBudget(['node', 'x.js', '--budget', '1.5']), undefined);
});

test('declaredBudget: coexists with the other flags (--frame/--frames)', () => {
  assert.strictEqual(
    lib.declaredBudget(['node', 'x.js', '--frame', '3', '--budget', '0', '--frames', '12']),
    Infinity
  );
});

test('declaredBudget: without --budget, a NUMERIC 1st argument is NOT taken for a budget', () => {
  // ⚠️ FOUNDING CASE — without it, 7 mutants survived on the `i === -1` guard.
  //    With a real argv (argv[0] = node's path) the defect is UNOBSERVABLE:
  //    `Number('C:/.../node.exe')` is NaN, so the bug hides. Here argv[0]
  //    is numeric: removing the guard would make `argv[0]` be read as a budget.
  //    NEVER delete this case on the grounds that it is "unrealistic".
  assert.strictEqual(lib.declaredBudget(['5000', 'x.js']), undefined);
  assert.strictEqual(lib.declaredBudget(['0', 'x.js']), undefined, 'nor a false Infinity');
});

// ── resolvedTarget / targetExcluded (52, 15/08/2026) — global filter by TARGET ──
// ⚠️ The cascade (defaults.{source} > global) lives in gate.js: here we test the
//    pure PREDICATE on an already resolved pair, case by case (Stryker target).
ok('resolvedTarget: an EXACT tool name in the list → targeted', () => lib.resolvedTarget(['Bash'], 'Bash') === true);
ok('resolvedTarget: a full MCP tool in the list → targeted', () => lib.resolvedTarget(['mcp__stripe__pay'], 'mcp__stripe__pay') === true);
ok('resolvedTarget: a SERVER name in the list (historical semantics) → targeted', () => lib.resolvedTarget(['stripe'], 'mcp__stripe__pay') === true);
ok('resolvedTarget: the wildcard * → everything targeted', () => lib.resolvedTarget(['*'], 'Read') === true);
ok('resolvedTarget: a substring does NOT target (exact name only)', () => lib.resolvedTarget(['Bash'], 'BashPlus') === false);
ok('resolvedTarget: an empty list → nothing targeted', () => lib.resolvedTarget([], 'Bash') === false);
ok('resolvedTarget: a non-array list → treated as empty', () => lib.resolvedTarget('Bash', 'Bash') === false);
ok('resolvedTarget: an EMPTY tool name → never targeted, not even by an empty entry', () => lib.resolvedTarget([''], '') === false);
ok('resolvedTarget: a non-MCP tool absent from the list → not targeted', () => lib.resolvedTarget(['stripe'], 'Read') === false);
ok('targetExcluded: whitelist + a targeted target → kept', () => lib.targetExcluded('whitelist', ['Bash'], 'Bash') === false);
ok('targetExcluded: whitelist + a NON-targeted target → discarded', () => lib.targetExcluded('whitelist', ['Bash'], 'Read') === true);
ok('targetExcluded: blacklist + a targeted target → discarded', () => lib.targetExcluded('blacklist', ['Bash'], 'Bash') === true);
ok('targetExcluded: blacklist + a targeted server → discarded', () => lib.targetExcluded('blacklist', ['stripe'], 'mcp__stripe__pay') === true);
ok('targetExcluded: blacklist + a non-targeted target → kept', () => lib.targetExcluded('blacklist', ['stripe'], 'Read') === false);
ok('targetExcluded: mode "none" → never discarded, the list is ignored', () => lib.targetExcluded('none', ['Bash'], 'Bash') === false);
ok('targetExcluded: an unknown mode → fail-open (kept)', () => lib.targetExcluded('anything-at-all', ['*'], 'Bash') === false);
ok('targetExcluded: an undefined mode → kept', () => lib.targetExcluded(undefined, ['*'], 'Bash') === false);
ok('resolvedTarget: the list fallback is EMPTY, never an invented content (anti "Stryker was here")', () => lib.resolvedTarget('not-an-array', 'Stryker was here') === false);
ok('resolvedTarget: a null entry in the list + a non-MCP gesture → never targeted (a null server ≠ a null entry)', () => lib.resolvedTarget([null], 'Read') === false);
ok('resolvedTarget: a non-string toolName + an identical non-string entry → never targeted', () => lib.resolvedTarget([undefined], undefined) === false);

// ── refusalNotice — a REFUSED connection is said out loud, ONCE per session ──
// ⚠️ THE SENTENCE IS WRITTEN OUT IN FULL HERE, COPIED FROM THE SOURCE, never
//    read back from `lib.REFUSAL_NOTICE`: an expectation that reads the module
//    under test proves `x === x` and lets every string mutant survive (measured
//    in this repo: 43 survivors at once on exactly that shape).
const REFUSAL = '⚠️ ctxroute: the kernel REFUSED the connection to this '
  + 'framework\'s state address. That is all this hook observed — no cause is claimed. '
  + 'Said once per session.';

ok('refusalNotice: ECONNREFUSED on a fresh scope → it SPEAKS, with the exact sentence',
  () => lib.refusalNotice('ECONNREFUSED', {}).say === true
    && lib.refusalNotice('ECONNREFUSED', {}).message === REFUSAL);
ok('refusalNotice: ENOENT (a named pipe nobody owns) is a refusal TOO',
  () => lib.refusalNotice('ENOENT', {}).say === true
    && lib.refusalNotice('ENOENT', {}).message === REFUSAL);
ok('refusalNotice: already said in this scope → TOTAL silence (a permanent alarm is wallpaper)',
  () => lib.refusalNotice('ECONNREFUSED', { refused: true }).say === false
    && lib.refusalNotice('ECONNREFUSED', { refused: true }).message === '');
ok('refusalNotice: a state saying refused:false has NOT said it yet → it speaks',
  () => lib.refusalNotice('ECONNREFUSED', { refused: false }).say === true);
ok('refusalNotice: a truthy-but-not-true flag does not count as said (=== true, never coercion)',
  () => lib.refusalNotice('ECONNREFUSED', { refused: 'yes' }).say === true);
ok('refusalNotice: EACCES is NOT a refusal → silence (a witness that cries wrong gets unplugged)',
  () => lib.refusalNotice('EACCES', {}).say === false
    && lib.refusalNotice('EACCES', {}).message === '');
ok('refusalNotice: no error at all (an unintelligible answer) → silence, never a guessed cause',
  () => lib.refusalNotice(undefined, {}).say === false);
ok('refusalNotice: a null state (nothing readable) → it speaks, and does not throw',
  () => lib.refusalNotice('ECONNREFUSED', null).say === true);
