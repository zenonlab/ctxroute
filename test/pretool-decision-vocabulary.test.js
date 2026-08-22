// ═══════════════════════════════════════════════════════════════════════
// THE PreToolUse DECISION VOCABULARY IS CLOSED — `none` · `allow` · `deny`
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT THIS CLOSES, MEASURED 2026-08-22 AND REPRODUCED THREE TIMES: a
//    PreToolUse hook answering `permissionDecision: "defer"` on its PASSING path
//    KILLS THE SUBAGENT that made the call. Not an error, not a refusal — the
//    agent stops. The word is accepted by the harness, so nothing upstream of
//    the agent's death says anything at all: it is the exact failure this
//    repository refuses outright, a SILENT one.
//
// 🛑 THE THREE DECISIONS ARE THREE, AND THEY HAVE BEEN SINCE `ask` WAS REMOVED
//    ON 2026-08-05: `none` (the field ABSENT — the normal permission flow is
//    left untouched, which is what a notice must do) · `allow` · `deny`. A
//    fourth word is not a feature with a bug, it is a fourth decision — and the
//    skill says three, never four. This suite is what makes that a MACHINE
//    rather than a sentence, because the sentence already existed.
//
// 📐 WHY A GATE AND NOT A COMMENT, in this repo's own terms: a rule only prose
//    guards is not a rule. `permissionDecision` is written in THREE places in
//    `src/` (two `allow`, one `deny`) and a fourth is one line away in any
//    future shell — a port to a new harness is exactly the gesture where a
//    dialect gains a word nobody else knows.
//
// ⚠️ TWO NETS, NEITHER SUFFICIENT ALONE, and that is deliberate:
//    ① BEHAVIOUR — each LIVE dialect's own `output()` is CALLED on every path
//      it has and the JSON it RETURNS is read. A grep is satisfied by a
//      comment; a returned object cannot lie about what the harness will see.
//      It covers the HTTP lane for free: `http-server.js` answers with
//      `doc-inject.output()`, the very function probed here.
//    ② STATIC over the whole of `src/` — it reaches what ① cannot require: the
//      frozen oracle `legacy-mcp-inject.js` (no export, no `require.main`
//      guard), and any emitter written tomorrow before it has a suite.
//
// ⚠️ THE PROBE SET IS DERIVED, NEVER TYPED: every `src/hooks/*.js` declaring
//    `hookEventName: 'PreToolUse'`. A shell added tomorrow enters this net by
//    itself, and one that cannot be probed is a NAMED REFUSAL here — never a
//    quiet omission, which is how a derived list rots back into a hand list.
//
// ⚠️ perTest: every fixture is built INSIDE its `test()` callback.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..');
const HOOKS = path.join(ROOT, 'src', 'hooks');

// 🛑 THE CONTRACT, WRITTEN OUT LITERALLY AND COPIED FROM THE SOURCE — never
//    read back from the module under test. An expectation derived from the code
//    it judges proves `x === x`: measured here, 43 survivors in one go.
const ALLOWED = ['allow', 'deny'];

// The ONE file that emits a PreToolUse decision and cannot be probed by calling
// it: the FROZEN differential oracle. It is unwired (the doctor requires its
// ABSENCE from the wiring), it exports nothing and it has no `require.main`
// guard, so requiring it would read stdin inside the runner. It is covered by
// the STATIC net below instead — declared, with its reason, never skipped.
const UNPROBEABLE = ['legacy-mcp-inject.js'];

/**
 * Every `permissionDecision` VALUE a file assigns, as text.
 *
 * ⚠️ IT ERRS TOWARDS ACCUSING, NEVER TOWARDS EXCUSING. Whole-line comments are
 *    dropped (the dialects DOCUMENT the words they refuse — `"ask"` sits in two
 *    of them), but a mention sharing a line with code is still reported: a
 *    false red costs one reading, a false green costs a subagent.
 * ⚠️ A NON-LITERAL assignment is reported as `<computed>` rather than ignored:
 *    a value this scan cannot decide is a value it must not clear.
 * @param {string} text
 * @returns {string[]}
 */
function decisionsIn(text) {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
  const out = [];
  // `permissionDecisionReason` carries the DOC, not a decision: the negative
  // lookahead is what keeps it out, and removing it would flood this gate with
  // its own payload.
  const re = /permissionDecision(?!Reason)\s*:\s*([^,\n}]+)/g;
  for (const m of code.matchAll(re)) {
    const raw = m[1].trim();
    const lit = /^(['"])(.*)\1$/.exec(raw);
    out.push(lit ? lit[2] : '<computed>');
  }
  return out;
}

/** Every `.js` under `src/`, recursively. */
function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** The LIVE PreToolUse dialects, derived from the source. */
function dialects() {
  const found = [];
  for (const name of fs.readdirSync(HOOKS).filter((f) => f.endsWith('.js')).sort()) {
    const file = path.join(HOOKS, name);
    const src = fs.readFileSync(file, 'utf8');
    if (!/hookEventName:\s*'PreToolUse'/.test(src)) continue;
    if (UNPROBEABLE.includes(name)) continue;
    const mod = require(file);
    assert.strictEqual(typeof mod.output, 'function',
      `\`${name}\` emits a PreToolUse decision but exports no \`output()\`:\n`
      + '      it cannot be probed by behaviour, so nothing checks the word it answers.\n'
      + '      Export the dialect (as doc-inject.js does) or declare it in UNPROBEABLE with its reason.');
    found.push({ name, output: mod.output });
  }
  return found;
}

/** Asserts one emitted envelope against the closed vocabulary. */
function assertClosed(where, json) {
  const hso = json && json.hookSpecificOutput;
  const decision = hso ? hso.permissionDecision : undefined;
  if (decision === undefined) return;
  assert.ok(ALLOWED.includes(decision),
    `${where}: \`permissionDecision: ${JSON.stringify(decision)}\` is OUTSIDE the closed set`
    + ` ${JSON.stringify(ALLOWED)} (absent = the third decision).\n`
    + '      🛑 `defer` KILLS THE SUBAGENT that made the call — measured 2026-08-22, reproduced 3×.');
}

// ═══════════════════════════════════════════════════════════════════════
// ① BEHAVIOUR — every path of every live dialect
// ═══════════════════════════════════════════════════════════════════════
test('① EVERY PATH OF EVERY LIVE PreToolUse DIALECT ANSWERS INSIDE THE CLOSED SET', () => {
  const shells = dialects();
  // 🛑 ANTI-VACUITY: a derivation that finds nothing looks EXACTLY like a
  //    repository where every dialect behaves. The two live shells are named
  //    literally — a port that deletes one must say so here.
  assert.ok(shells.length >= 2, `only ${shells.length} PreToolUse dialect(s) found — the probe is measuring nothing`);
  const names = shells.map((s) => s.name);
  assert.ok(names.includes('doc-inject.js'), 'the Claude Code dialect is no longer probed');
  assert.ok(names.includes('codex-doc-inject.js'), 'the Codex dialect is no longer probed');

  const doc = '# a documented invariant\n[source: docs/framework/x.md]';
  // The three decisions `gate.js` can hand a shell, plus the notice (no doc at
  // all) — i.e. every path `output()` has.
  const paths = [
    ['none + doc', 'none', doc, '📄 doc: x'],
    ['allow + doc', 'allow', doc, '📄 doc: x'],
    ['deny + doc', 'deny', doc, '📄 doc: x'],
    ['notice (nothing for the agent)', 'none', '', '1 doc(s) WITHHELD'],
    ['silence', 'none', '', ''],
  ];
  for (const { name, output } of shells) {
    for (const [label, decision, fullDoc, message] of paths) {
      assertClosed(`${name} on ${label}`, output(decision, fullDoc, message));
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ② THE PASSING PATH — the one `defer` was measured to kill
// ═══════════════════════════════════════════════════════════════════════
test('② THE PASSING PATH IS `allow` OR SILENT — never a third word', () => {
  const doc = '# knowledge\n[source: docs/framework/x.md]';
  const { output: claude } = require(path.join(HOOKS, 'doc-inject.js'));
  const { output: codex } = require(path.join(HOOKS, 'codex-doc-inject.js'));

  // Claude Code GRANTS, because its envelope must carry one for the context to
  // travel. Written out literally, copied from `doc-inject.js`.
  const c = claude('none', doc, '📄 doc: x');
  assert.strictEqual(c.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(c.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(c.hookSpecificOutput.additionalContext, doc);

  // 🛑 CODEX OMITS IT — DELIBERATELY, and that asymmetry is the proof the field
  //    is OPTIONAL on this event. We never grant a permission in place of the
  //    harness; we inform.
  const x = codex('none', doc, '📄 doc: x');
  assert.strictEqual(x.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.ok(!('permissionDecision' in x.hookSpecificOutput),
    'the Codex dialect started deciding for the harness — it only informs');
  assert.strictEqual(x.hookSpecificOutput.additionalContext, doc);
});

// ═══════════════════════════════════════════════════════════════════════
// ③ A NOTICE MUST NEVER CHANGE A DECISION
// ═══════════════════════════════════════════════════════════════════════
test('③ THE WITHHOLDING NOTICE SPEAKS WITHOUT DECIDING — no envelope at all', () => {
  const message = '1 doc(s) WITHHELD';
  for (const shell of ['doc-inject.js', 'codex-doc-inject.js']) {
    const { output } = require(path.join(HOOKS, shell));
    const json = output('none', '', message);
    // The usual envelope would carry `permissionDecision: "allow"` beside an
    // EMPTY `additionalContext`: a warning that AUTHORISES the tool call as a
    // side effect. `permissionDecision` is OPTIONAL on PreToolUse and its
    // absence leaves the normal permission flow untouched.
    assert.ok(!('hookSpecificOutput' in json),
      `${shell}: the notice grew an envelope — it now decides as a side effect`);
    assert.strictEqual(json.systemMessage, message);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ④ THE ONLY REFUSAL IS `deny`, AND IT CARRIES THE DOC WHERE IT IS READ
// ═══════════════════════════════════════════════════════════════════════
test('④ THE REFUSAL IS `deny`, IDENTICAL ON BOTH HARNESSES, DOC IN THE REASON', () => {
  const doc = '# why this action is refused';
  for (const shell of ['doc-inject.js', 'codex-doc-inject.js']) {
    const { output } = require(path.join(HOOKS, shell));
    const hso = output('deny', doc, '📄 doc: x').hookSpecificOutput;
    assert.strictEqual(hso.permissionDecision, 'deny', `${shell}: the refusal changed word`);
    // Literal, copied from `pretool-core.denyOutput` — the knowledge goes out in
    // the REASON, never in `additionalContext` (that one only arrives NEXT TO
    // THE RESULT, i.e. after the call it was meant to prevent).
    assert.strictEqual(hso.permissionDecisionReason,
      '[ACTION REFUSED — read this, then start over]\n\n' + doc);
    assert.ok(!('additionalContext' in hso),
      `${shell}: the refused action would also receive the doc too late`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ STATIC — what the behaviour probe cannot require
// ═══════════════════════════════════════════════════════════════════════
test('⑤ NO FILE OF `src/` ASSIGNS A DECISION OUTSIDE THE CLOSED SET', () => {
  const files = jsFiles(path.join(ROOT, 'src'));
  assert.ok(files.length > 10, `only ${files.length} runtime file(s) scanned — the scan lost its corpus`);
  const seen = [];
  for (const f of files) {
    for (const d of decisionsIn(fs.readFileSync(f, 'utf8'))) {
      seen.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), value: d });
    }
  }
  // 🛑 ANTI-VACUITY: measured 2026-08-22 — THREE assignments (`doc-inject.js`
  //    and the frozen `legacy-mcp-inject.js` grant, `pretool-core.js` refuses).
  //    A scan that finds fewer has stopped reading, and an empty scan is
  //    indistinguishable from a repository where every decision is legal.
  assert.ok(seen.length >= 3,
    `only ${seen.length} \`permissionDecision\` assignment(s) found in src/ — the scan sees nothing`);
  for (const { file, value } of seen) {
    assert.ok(ALLOWED.includes(value),
      `${file}: \`permissionDecision: ${JSON.stringify(value)}\` is outside ${JSON.stringify(ALLOWED)}.\n`
      + '      🛑 `defer` KILLS THE SUBAGENT that made the call — measured 2026-08-22, reproduced 3×.\n'
      + '      A computed value is refused too: a decision this gate cannot read is one it must not clear.');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ⑥ ANTI-INERTNESS — the scan must ACCUSE a fabricated offender
// ═══════════════════════════════════════════════════════════════════════
test('⑥ ANTI-INERT: the scan really accuses `defer`, and really ignores a comment', () => {
  // 🛑 A FABRICATED OFFENDER, RIDING INSIDE THE JUDGING FUNCTION — never a real
  //    file. Sabotaging `src/hooks/doc-inject.js` on disk would break every
  //    parallel suite that imports it (38 tests were brought down that way on
  //    2026-07-31), and a green obtained from an unmodified file proves nothing.
  const offender = [
    'const out = {',
    '  hookSpecificOutput: {',
    "    hookEventName: 'PreToolUse',",
    "    permissionDecision: 'defer',",
    '  },',
    '};',
  ].join('\n');
  assert.deepStrictEqual(decisionsIn(offender), ['defer'],
    'the scan no longer sees a decision written in plain code — it is inert');
  assert.ok(!ALLOWED.includes(decisionsIn(offender)[0]), '`defer` is being tolerated by the contract itself');

  // A dialect DOCUMENTING the words it refuses must not be accused for saying so.
  const mention = '// ⚠️ `permissionDecision: "ask"` = parsed but not supported yet.\n';
  assert.deepStrictEqual(decisionsIn(mention), [], 'a whole-line comment is being read as code');

  // A value the scan cannot decide is REPORTED, never cleared.
  assert.deepStrictEqual(decisionsIn('permissionDecision: verdict,'), ['<computed>'],
    'a computed decision slips through — the gate would clear what it cannot read');

  // And `permissionDecisionReason` is the payload, never a decision.
  assert.deepStrictEqual(decisionsIn("permissionDecisionReason: 'defer this',"), [],
    'the refusal payload is being read as a decision — this gate would drown in its own doc');
});
