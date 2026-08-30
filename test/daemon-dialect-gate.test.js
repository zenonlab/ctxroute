// ═══════════════════════════════════════════════════════════════════════
// GATE — THE DAEMON NEVER WRITES A FIELD OF THE DIALECT
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES (2026-08-30). `src/hooks/http-server.js` used to
//    know `systemMessage` as a PASS-THROUGH parameter only (`const capture =
//    (decision, fullDoc, systemMessage) => { answer = outputFn(...) }`), never
//    a key it composed itself. A later change taught it the field's NAME, its
//    TYPE and how to CONCATENATE it (`{ ...answer, systemMessage: existing ?
//    existing + ' · ' + noticeText : noticeText }`) — a second, independent
//    composition of the same dialect `doc-inject.output()` already owns. That
//    is exactly the twin-that-drifts class this repository exists to fight
//    (see `http-lane.md`: "the response JSON is produced by
//    `doc-inject.output()` … a second copy would be a twin that drifts").
//
// ⚠️ `sources-must-not-know-the-harness` (dependency-cruiser) covers
//    `src/sources/` and ONLY imports — it never looks at a literal, and it
//    never reaches `src/hooks/` at all. This gate closes the hole one layer
//    up: the SHELL that must speak the dialect only through the ONE function
//    designated to compose it.
//
// 🛑 STRICT SEPARATION, same doctrine as `state-entry-rebuild-gate.test.js`:
//    DETECTION here is an AST rule with NO exemption baked into its pattern;
//    the EXEMPTION LIST below is POLICY, written, justified, and checked for
//    staleness by its own inverse test.
//
// ⚠️ AST, NEVER REGEX (§0septies condition ②: PROBED BY BEHAVIOUR / by
//    structure, never by reading text). The word `systemMessage` inside a
//    comment or a string literal is a FALSE POSITIVE this repo has already
//    paid for elsewhere (canary ㉘: a doc merely TALKING about a marker was
//    counted as EMITTING it) — proven not to happen here by a dedicated cell
//    below.
//
// ⚠️ THE FIELD LIST IS DERIVED BY EXECUTING THE REAL DIALECT FUNCTION
//    (`doc-inject.output()`), across its three decision branches
//    (`deny`/`none`/`allow`), never copied by hand: a field added to the
//    dialect tomorrow enters this gate's vocabulary the day `output()` is
//    taught it, with zero edit here (§0septies condition ①). This is also
//    "probed by behaviour" in the strongest sense: we do not read the
//    function's source, we RUN it and inspect what it returns.
//
// ⚠️ THE PERIMETER IS THE TRANSITIVE `require()` CLOSURE FROM
//    `src/hooks/http-server.js`, computed on `git ls-files` content (never
//    `fs.readdirSync`, which would see uncommitted scratch files), so a
//    future import lands in scope automatically. Two files are EXEMPTED, in
//    writing, with an inverse check that reddens the day either stops being
//    reachable:
//      · `src/hooks/doc-inject.js` — the ONE designated composer
//        (`output()`), reused BY http-server.js itself (`outputFn`). Flagging
//        it would forbid the very function this gate exists to protect.
//      · `src/pretool-core.js` — `denyOutput()`/`noticeOutput()` are the
//        SHARED, pre-existing composition `doc-inject.output()` delegates
//        to for the `deny`/`none` branches (skill §0sexies-ter: "shared by
//        both shells like `denyOutput`"). It is the exact form this task's
//        fix REUSES (`lib.joinSystemMessage`, called from `pretool-core.js`
//        and from the http shell) — a module already off-limits to editing
//        outside that reuse, and the very form the current fix followed.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const SEP = String.fromCharCode(92);
const ENTRY = 'src/hooks/http-server.js';

/**
 * DECLARED EXEMPTIONS — same doctrine as `emission-core-gate.test.js`'s
 * `EXEMPTIONS`: a derogation carries its WHY in writing, and the inverse
 * check below makes it lethal the day it becomes stale (file renamed, no
 * longer reachable, no longer imported).
 */
const EXEMPTIONS = {
  'src/hooks/doc-inject.js':
    'THE designated single composer. `output(decision, fullDoc, systemMessage)` '
    + 'is the ONE function allowed to build the dialect envelope — that is the '
    + 'invariant this gate exists to protect, not violate.',
  'src/pretool-core.js':
    '`denyOutput()`/`noticeOutput()` are the SHARED composition '
    + '`doc-inject.output()` delegates to for `deny`/`none`; explicitly '
    + 'off-limits to this task except to REUSE its form '
    + '(`lib.joinSystemMessage`), which is exactly what the 2026-08-30 fix did.',
};

function astGrepBinary() {
  const name = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(repo, 'node_modules', '@ast-grep', 'cli', name);
  if (!fs.existsSync(bin)) {
    throw new Error('ast-grep NOT FOUND (' + bin + ') — the daemon-dialect gate cannot judge. `npm ci`.');
  }
  return bin;
}

/** Every `.js` file tracked by git — never `fs.readdirSync`, which would see
 *  uncommitted scratch files a fresh clone never has. */
function tracked() {
  const envWithoutGit = { ...process.env };
  for (const k of Object.keys(envWithoutGit)) if (k.startsWith('GIT_')) delete envWithoutGit[k];
  const out = execFileSync('git', ['ls-files'], { cwd: repo, env: envWithoutGit, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim()).filter((f) => f !== '');
}

// LOCAL requires of a file (`require('./x')` / `require('../x')`), resolved
// to a repo-relative path — same regex as `emission-core-gate.test.js`
// (single form already proven against this codebase).
function localRequires(rel, source) {
  const dir = path.dirname(rel);
  const out = [];
  for (const m of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    let target = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, m[1]));
    if (!target.endsWith('.js')) target += '.js';
    out.push(target);
  }
  return out;
}

/**
 * The transitive closure of `require()` reached from `entry`, EXCLUDING
 * every file listed in `exemptions` (traversal stops there: an exempted
 * composer's own internals are its business, not this gate's).
 * @param {string} entry
 * @param {Record<string,string>} exemptions
 * @param {(rel: string) => string|null} read
 * @returns {string[]}
 */
function perimeterFrom(entry, exemptions, read) {
  const visited = new Set();
  const scope = new Set();
  const pile = [entry];
  while (pile.length > 0) {
    const cur = pile.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (exemptions[cur] && cur !== entry) continue;
    scope.add(cur);
    const src = read(cur);
    if (src === null) continue;
    for (const dep of localRequires(cur, src)) pile.push(dep);
  }
  return [...scope];
}

const lireReel = (rel) => {
  const abs = path.join(repo, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

function perimeter() {
  const files = new Set(tracked());
  return perimeterFrom(ENTRY, EXEMPTIONS, (rel) => (files.has(rel) ? lireReel(rel) : null));
}

// ═══════════════════════════════════════════════════════════════════════
// FIELD VOCABULARY — DERIVED BY RUNNING `output()`, NEVER COPIED.
// ═══════════════════════════════════════════════════════════════════════
function collectKeys(o, set) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    set.add(k);
    collectKeys(o[k], set);
  }
}

function dialectFields() {
  const { output } = require_('../src/hooks/doc-inject.js');
  const set = new Set();
  collectKeys(output('deny', 'a document', 'a message'), set);
  collectKeys(output('none', '', 'a message'), set);
  collectKeys(output('allow_shape_probe', 'a document', 'a message'), set);
  return [...set];
}

function writeRule(dir, fields) {
  const regex = '^(' + fields.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$';
  const file = path.join(dir, 'daemon-dialect.json');
  fs.writeFileSync(file, JSON.stringify({
    id: 'daemon-dialect-field-write',
    language: 'JavaScript',
    severity: 'error',
    message: 'DIALECT FIELD COMPOSED OUTSIDE doc-inject.output() — pass the text as a PARAMETER instead.',
    rule: {
      any: [
        // an object-literal property: `{ systemMessage: x }`
        { kind: 'pair', has: { field: 'key', regex } },
        // a shorthand property: `{ systemMessage }`
        { kind: 'shorthand_property_identifier', regex },
        // a property ASSIGNMENT: `answer.systemMessage = x`
        { kind: 'assignment_expression', has: { field: 'left', kind: 'member_expression', has: { field: 'property', regex } } },
      ],
    },
  }, null, 2));
  return file;
}

/**
 * @param {string[]} files
 * @param {string[]} fields
 * @returns {{file: string, line: number, text: string}[]}
 */
function scan(files, fields) {
  if (files.length === 0) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-daemon-dialect-'));
  let out = '';
  try {
    const rule = writeRule(dir, fields);
    try {
      out = execFileSync(astGrepBinary(), ['scan', '-r', rule, '--json=compact'].concat(files), {
        cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        // stderr CAPTURED: `ast-grep` writes "N error(s) found" on stderr on
        // every scan that finds something, which would pour a fake ERROR
        // into a GREEN run's terminal output.
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      // `ast-grep scan` exits non-zero as soon as it finds an `error`-level
      // match — a RESULT, not a tool crash. The findings are on stdout.
      out = (e && e.stdout) || '';
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  let r = [];
  try { r = JSON.parse(out || '[]'); } catch { r = []; }
  return r.map((m) => ({
    file: String(m.file).split(SEP).join('/').replace(repo.split(SEP).join('/') + '/', ''),
    line: m.range.start.line + 1,
    text: String(m.text).replace(/\s+/g, ' ').slice(0, 80),
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

test('ANTI-VACUITY: the dialect vocabulary is non-empty and includes the field that broke', () => {
  const fields = dialectFields();
  assert.ok(fields.length >= 3, `suspicious derivation: only ${fields.length} field(s) found — is doc-inject.output() reachable?`);
  assert.ok(fields.includes('systemMessage'), 'the derivation must find systemMessage — the field the 2026-08-30 defect actually wrote');
  assert.ok(fields.includes('additionalContext'), 'the derivation must find additionalContext — the agent-facing half of the same envelope');
});

test('ANTI-VACUITY: the perimeter is non-empty and really contains the daemon shell', () => {
  const files = perimeter();
  assert.ok(files.length >= 5, `suspicious perimeter: only ${files.length} file(s) — is git ls-files / the require graph resolving?`);
  assert.ok(files.includes(ENTRY), 'the entry point itself must be in its own perimeter');
});

test('GATE: no file the daemon reaches (outside the two designated composers) writes a dialect field', () => {
  const fields = dialectFields();
  const files = perimeter();
  const hits = scan(files, fields);
  assert.deepStrictEqual(
    hits,
    [],
    'These sites compose a dialect field OUTSIDE doc-inject.output():\n  '
      + hits.map((h) => `${h.file}:${h.line} — ${h.text}`).join('\n  ')
      + '\n⇒ pass the text as a PARAMETER to outputFn/capture instead — a second '
      + 'composition of the same field is the twin-that-drifts class this repo exists to fight.',
  );
});

test('GATE (inverse part): a stale exemption turns red', () => {
  const files = new Set(tracked());
  const stale = Object.keys(EXEMPTIONS).filter((f) => !files.has(f));
  assert.deepStrictEqual(
    stale,
    [],
    'Exemption(s) declared for a file that no longer exists / is no longer tracked: remove it.\n  '
      + stale.join('\n  '),
  );
  // The exemption is only meaningful if the file is actually REACHED from the
  // entry point when the exclusion itself is lifted — otherwise it exempts
  // nothing and the written justification is decorative.
  const reachedWithoutExemptions = new Set(perimeterFrom(ENTRY, {}, (rel) => (files.has(rel) ? lireReel(rel) : null)));
  const decorative = Object.keys(EXEMPTIONS).filter((f) => !reachedWithoutExemptions.has(f));
  assert.deepStrictEqual(
    decorative,
    [],
    'Exemption(s) for a file the daemon never actually reaches: remove it, it exempts nothing.\n  '
      + decorative.join('\n  '),
  );
});

test('NEGATIVE (false-positive check): the word alone in a comment or a string is NOT flagged (AST, not regex)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-daemon-dialect-decoy-'));
  try {
    const decoy = path.join(dir, 'decoy.js');
    fs.writeFileSync(decoy, [
      "// this comment merely TALKS about systemMessage, it writes nothing",
      "const note = 'systemMessage is mentioned here as a plain string';",
      "function capture(decision, fullDoc, systemMessage) { return outputFn(decision, fullDoc, systemMessage); }",
    ].join('\n'));
    const hits = scan([decoy], dialectFields());
    assert.deepStrictEqual(hits, [], 'a comment/string mention, and a pass-through PARAMETER, must never be flagged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SEEN RED — the mandatory negative-check (§0septies condition ④). The
// exact fautive line reintroduced IN MEMORY (never on disk: a real-file
// sabotage brought down 38 parallel tests once in this repo), scanned as a
// standalone decoy file so a red run of THIS suite is never left behind.
// ═══════════════════════════════════════════════════════════════════════
test('SEEN RED: the exact 2026-08-30 defect is caught and NAMES the file and the field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-daemon-dialect-red-'));
  try {
    const sabotaged = path.join(dir, 'http-server.js');
    fs.writeFileSync(sabotaged, [
      "const notice = deliveryNotice.observe(deliveryNoticeState, invocationId, frame, frames.nbFrames);",
      "const noticeText = deliveryNotice.messageFor(notice);",
      "if (noticeText && lib.shouldShowNotification(collectCore.loadConfig())) {",
      "  const existing = answer && typeof answer.systemMessage === 'string' ? answer.systemMessage : '';",
      "  answer = { ...answer, systemMessage: existing ? existing + ' · ' + noticeText : noticeText };",
      "}",
    ].join('\n'));
    const hits = scan([sabotaged], dialectFields());
    assert.ok(hits.length >= 1, 'the gate FAILED TO CATCH the exact regression it was written to prevent');
    assert.ok(hits.every((h) => h.file.endsWith('http-server.js')), 'the hit must name the offending FILE');
    assert.ok(hits.some((h) => h.text.includes('systemMessage')), 'the hit must name the offending FIELD');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
