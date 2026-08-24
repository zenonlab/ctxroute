// ═══════════════════════════════════════════════════════════════════════
// EXPLAIN SUITE — by REAL SPAWN on a throwaway corpus (tmpdir).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SPAWN, never an in-process call: the tool must be proven AS A HUMAN
//    USES IT (CLI + argv + exit code). An in-process test would validate
//    functions, not the tool.
//
// ⚠️ THROWAWAY CORPUS MANDATORY (CTXROUTE_FILEDOCS_DIR): writing a test doc
//    into the real corpus would inject it INTO EVERY AGENT running in
//    parallel. The real corpus is PRODUCTION.
//
// ⚠️ THE 2 FOUNDING CASES (a) and (b) REPLAY the false greens that cost the
//    session of 31/07/2026. They are not illustrative: they are the tool's
//    RAISON D'ÊTRE. NEVER delete them — if one day the wildcard is
//    implemented (§B), case (a) must be UPDATED (verdict inverted), never
//    removed: it becomes the proof that the wildcard works.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPLAIN = path.join(HERE, '..', 'tools', 'explain.js');

// Throwaway corpus + doc(s) written by the test itself (thunk: nothing at
// module level, cf perTest doctrine).
function fleetWith(docs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-parc-'));
  for (const [name, content] of Object.entries(docs)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

function launch(args, fleetRoot) {
  return execFileSync(process.execPath, [EXPLAIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CTXROUTE_FILEDOCS_DIR: fleetRoot },
  });
}
const json = (args, fleetRoot) => JSON.parse(launch([...args, '--json'], fleetRoot));

test('VERDICT: a doc matching through the path is reported as INJECTED', () => {
  const fleetRoot = fleetWith({ 'target.md': '---\nmatch: gate.js\nmode: dumb\n---\nCorps.\n' });
  const r = json(['--file', 'C:/projet/gate.js'], fleetRoot);
  assert.ok(r.inject.includes('docs/target.md'), 'the doc should be injected');
  assert.equal(r.decision, 'allow');
});

test('FOUNDING CASE (a) — `tool: ["*"]`: the wildcard INJECTS (verdict inverted on 31/07)', () => {
  // ⚠️ THIS TEST CHANGED VERDICT, it was NOT deleted (cf header): it proved
  //    the false green (`*` accepted AND inert), it now proves the wildcard
  //    LIVES. Same founding case, turned into proof of the feature.
  const fleetRoot = fleetWith({ 'joker.md': '---\ntool: ["*"]\nscope: ["docker run"]\nmode: dumb\n---\nCorps.\n' });
  const r = json(['--doc', 'joker', '--tool', 'Bash', '--input', '{"command":"docker run -d nginx"}'], fleetRoot);
  assert.equal(r.diagnostic.injects, true, 'the wildcard must now match any tool');
  assert.ok(r.inject.includes('docs/joker.md'));
});

test('FOUNDING CASE (a bis) — wildcard + ABSENT gesture: reason = `scope`, never "tool not listed"', () => {
  // ⚠️ REGRESSION WATCHED FOR: with an `includes` rewritten inside explain,
  //    this case returned "the tool is not in it" (FALSE REASON) instead of
  //    the scope. A diagnostic that gets the cause wrong is worse than no
  //    diagnostic.
  const fleetRoot = fleetWith({ 'joker.md': '---\ntool: ["*"]\nscope: ["docker run"]\nmode: dumb\n---\nCorps.\n' });
  const r = json(['--doc', 'joker', '--tool', 'Bash', '--input', '{"command":"ls -la"}'], fleetRoot);
  assert.equal(r.diagnostic.injects, false);
  assert.ok(/scope/.test(r.diagnostic.motif), 'expected reason: scope, received: ' + r.diagnostic.motif);
});

test('FOUNDING CASE (b) — `mcp:` in the file corpus: mute, and we say WHERE to go', () => {
  // ⚠️ Since the 31/07 hardening (§A), this case is caught EARLIER: by
  //    `validate()`, hence also by the write guard (the author is blocked the
  //    second they write it, they no longer discover the silence days
  //    later). explain confirms it and RELAYS the message that repairs. The
  //    test follows the reality of the engine — it does not freeze one
  //    particular code path.
  const fleetRoot = fleetWith({ 'mauvais.md': '---\nmcp: stripe\n---\nCorps.\n' });
  const r = json(['--doc', 'mauvais', '--tool', 'mcp__stripe__foo', '--input', '{}'], fleetRoot);
  assert.equal(r.diagnostic.injects, false);
  const tout = [r.diagnostic.motif, r.diagnostic.trap, JSON.stringify(r.diagnostic.detail)].join(' | ');
  assert.ok(/PATH/.test(tout), 'the diagnostic MUST say where the doc should have gone, received: ' + tout);
  assert.ok(/docs\/mcp\//.test(tout), 'the exact path must be given (paved road)');
});

test('REASON `scope` not satisfied — distinguished from "pattern absent"', () => {
  const fleetRoot = fleetWith({ 's.md': '---\nmatch: gate.js\nscope: [projet-x]\nmode: dumb\n---\nCorps.\n' });
  const r = json(['--file', 'C:/other/gate.js'], fleetRoot);
  assert.equal(r.diagnostic, null, 'without --doc, no targeted diagnostic');
  const d = json(['--doc', 's.md', '--file', 'C:/other/gate.js'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/scope/.test(d.motif), 'expected reason: scope not satisfied, received: ' + d.motif);
});

test('REASON `keys` — distinguished from `scope`, `exclude` AND "pattern absent"', () => {
  // 🔴 WITHOUT THIS PROBE, THE TOOL LIES BY OMISSION. `keys` chooses the UNIVERSE the three
  //    operators read, so a rule it silences fails THROUGH one of them — and the tool would
  //    calmly blame `scope`. A true-but-wrong reason is worse than none: it sends the author
  //    to fix an operator that is doing its job (the mistake of 31/07, one session lost).
  const fleetRoot = fleetWith({ 'k.md': '---\nmatch: demo-projet\nkeys: ["-command"]\nscope: [demo-projet]\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'k.md', '--tool', 'Bash', '--input', JSON.stringify({ command: 'echo demo-projet >> memo.md' })], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/keys/.test(d.motif), 'expected reason: keys, received: ' + d.motif);
});

test('`keys` is NOT blamed when the rule is silent for another reason', () => {
  // The symmetric half: a probe that always accuses `keys` would be just as useless.
  const fleetRoot = fleetWith({ 'k2.md': '---\nmatch: demo-projet\nkeys: ["-cwd"]\nscope: [absent-partout]\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'k2.md', '--tool', 'Bash', '--input', JSON.stringify({ command: 'echo demo-projet' })], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/scope/.test(d.motif), 'expected reason: scope, received: ' + d.motif);
});

test('REASON `exclude` — distinguished from `scope`', () => {
  const fleetRoot = fleetWith({ 'e.md': '---\nmatch: gate.js\nexclude: [node_modules]\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'e.md', '--file', 'C:/p/node_modules/gate.js'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/exclude/.test(d.motif), 'expected reason: exclude, received: ' + d.motif);
});

test('REASON "no pattern matches" lists the CONTEXTS really tested', () => {
  const fleetRoot = fleetWith({ 'p.md': '---\nmatch: introuvable.js\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'p.md', '--file', 'C:/projet/gate.js'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(d.detail.testedContexts.some((c) => /gate\.js/.test(c)),
    'the diagnostic MUST show what was confronted with the patterns');
});

test('REASON git command — the silence BY CONSTRUCTION is named', () => {
  // ⚠️ sources/file.js ignores every git command (false positives from commit
  //    messages). Without this reason, an author testing with `git ...` sees
  //    an inexplicable silence and blames their rule.
  const fleetRoot = fleetWith({ 'g.md': '---\nmatch: gate.js\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'g.md', '--tool', 'Bash', '--input', '{"command":"git add gate.js"}'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/GIT/.test(d.motif), 'expected reason: git command ignored, received: ' + d.motif);
});

test('REASON INVALID frontmatter — the doc is dead for ALL payloads', () => {
  const fleetRoot = fleetWith({ 'bad.md': '---\nmach: gate.js\nmode: dumb\n---\nCorps.\n' });
  const d = json(['--doc', 'bad', '--file', 'C:/projet/gate.js'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/INVALID/.test(d.motif));
  assert.ok(d.detail.some((e) => /mach/.test(e)), 'the validate errors must be returned');
});

test('REASON `inject: never` — INTENTIONAL silence, never mistaken for an oversight', () => {
  const fleetRoot = fleetWith({ 'ref.md': '---\ninject: never\n---\nCorps.\n' });
  const d = json(['--doc', 'ref', '--file', 'C:/projet/gate.js'], fleetRoot).diagnostic;
  assert.equal(d.injects, false);
  assert.ok(/INTENTIONAL/.test(d.motif));
});

test('READ-ONLY: explain NEVER writes into the session store', () => {
  // ⚠️ A `once` doc consumed by a mere diagnostic would deprive the real
  //    session of its injection. The tool must be side-effect free.
  const fleetRoot = fleetWith({ 'o.md': '---\nmatch: gate.js\nmode: once\n---\nCorps.\n' });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-state-'));
  execFileSync(process.execPath, [EXPLAIN, '--file', 'C:/projet/gate.js', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, CTXROUTE_FILEDOCS_DIR: fleetRoot, CTXROUTE_STATE_DIR: stateDir },
  });
  assert.deepEqual(fs.readdirSync(stateDir), [], 'no state file must be created');
});

test('FAIL-LOUD: corpus not found → exit 2 + a message saying it is THE TOOL', () => {
  // ⚠️ The opposite of the hooks (mute fail-open): a diagnostic silent about
  //    its own failure reads as "nothing gets injected" = a false engine verdict.
  let output = null;
  try {
    launch(['--file', 'C:/projet/gate.js'], path.join(os.tmpdir(), 'parc-qui-n-existe-pas-' + Date.now()));
    assert.fail('explain should have exited with an error');
  } catch (e) {
    output = e;
  }
  assert.equal(output.status, 2, 'exit code 2 expected');
  assert.ok(/TOOL FAILURE/.test(String(output.stderr)),
    'the message must state explicitly that this is NOT a verdict on the engine');
});

test('NEGATIVE-CHECK: the test harness can really FAIL (otherwise it certifies emptiness)', () => {
  // ⚠️ Without this test, a suite calling nothing would stay green forever —
  //    exactly the "blind gate that certifies instead of protecting".
  const fleetRoot = fleetWith({ 'x.md': '---\nmatch: never-this-name.js\nmode: dumb\n---\nCorps.\n' });
  const r = json(['--file', 'C:/projet/gate.js'], fleetRoot);
  assert.equal(r.inject.includes('docs/x.md'), false,
    'a doc whose pattern does not match MUST NOT be reported as injected');
});

// ═══════════════════════════════════════════════════════════════════════
// ㊵.a — THE BOUND MUST SPEAK (12/08/2026), by REAL SPAWN
// ═══════════════════════════════════════════════════════════════════════
// 🛑 A MUTE bound recreates defect ㊵ through the back door: a `scope` failing
//    on text NEVER READ is indistinguishable from an absent term, and the
//    author looks for their mistake in the wrong doc. BOTH parts are
//    mandatory — without the negative one, a message displayed ALWAYS would pass.
const nested = (n, leaf) => {
  let v = leaf;
  for (let i = 0; i < n; i++) v = { a: v };
  return v;
};

test('㊵.a explain SAYS that a payload was TRUNCATED at the depth bound', () => {
  const fleetRoot = fleetWith({ 'target.md': '---\ntool: ["T"]\nscope: ["cherche"]\nmode: dumb\n---\nCorps.\n' });
  const input = JSON.stringify({ args: nested(25, 'cherche') });
  const output = launch(['--doc', 'target', '--tool', 'T', '--input', input], fleetRoot);
  assert.match(output, /scope. NOT SATISFIED/, 'the scope must fail (beyond the bound)');
  assert.match(output, /TRUNCAT/, 'the truncation reason MUST be announced');
  assert.match(output, /depth/, 'it must name WHICH of the two bounds');
});

test('㊵.a NEGATIVE — payload within the bounds: NO mention of truncation', () => {
  const fleetRoot = fleetWith({ 'target.md': '---\ntool: ["T"]\nscope: ["cherche"]\nmode: dumb\n---\nCorps.\n' });
  const input = JSON.stringify({ args: { to: 'absent' } });
  const output = launch(['--doc', 'target', '--tool', 'T', '--input', input], fleetRoot);
  assert.match(output, /scope. NOT SATISFIED/);
  assert.doesNotMatch(output, /TRUNCAT/, 'a message displayed even without truncation would be permanent noise');
});
