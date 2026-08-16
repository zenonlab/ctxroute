// ═══════════════════════════════════════════════════════════════════════
// GATE DIFFERENTIAL — doc-inject.js (new) vs protect-files.js (production).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ The engine differential (file-differential) and the shadow prove the MATCH;
//    THIS test proves the GATE: content injected TO THE BYTE (frontmatter
//    stripped the same way, same [source:], same separators), same ask/allow decision,
//    same systemMessage. It is the parity gate of the SWITCH.
//
// ⚠️ RUSH: the old one reads `.rush`, the gate reads `config.confirm` (#4). The test reads
//    the REAL state of the .rush and gives the gate the equivalent config — if the two
//    mechanisms no longer mirror each other, this test breaks (that is deliberate: the
//    switch session must carry the .rush state over into ctxroute-config.json).
//
// Skipped on a fresh clone (no real fleet). Real spawns but few of them.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
// ⚠️ SINGLE SOURCE shared with `mcp-differential` — never a copy:
//    two normalizations diverge, and two nets that no longer filter the
//    same thing no longer prove anything together.
import { withoutOrdinal } from '../src/differential-normalize.js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LEGACY = process.env.CTXROUTE_LEGACY_PATH || path.join(os.homedir(), '.claude', 'hooks', 'protect-files.js');
const PORTE = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const parcPresent = fs.existsSync(LEGACY);

const RUSH = parcPresent && fs.existsSync(path.join(path.dirname(LEGACY), '.rush'));
// ⚠️ FRENCH STRING KEPT AS IS ON PURPOSE: it is the literal output of the FROZEN
//    oracle (`protect-files.js`, which lives outside this repo). Translating it
//    would break the comparison — this is the oracle's text, not ours.
const RUSH_PREFIX = '⚡ RUSH MODE — ask désactivé. Doc injectée :\n\n';

// Gate config MIRRORING the real rush + isolated state (never the real state/).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'porte-diff-'));
const CONFIG = path.join(TMP, 'config.json');
if (parcPresent) fs.writeFileSync(CONFIG, JSON.stringify(RUSH ? { confirm: false } : {}));

// ⚠️ UNSEALING — READ BEFORE TOUCHING (05/08/2026, false red PAID FOR).
//    This differential compares the gate to `protect-files.js`, a FROZEN oracle
//    (its own doc forbids it from evolving). The multi-frame SEAL was born on
//    03/08/2026, AFTER it: the oracle will NEVER know how to seal. But the gate
//    seals as soon as the injection exceeds 50 % of the budget (4 000 chars) — so from
//    that threshold on, the raw byte ALWAYS differs, for a reason that is not
//    an engine divergence but a TRANSPORT layer missing on one side.
// ⚠️ The test only survived until now by LUCK: the tested payloads
//    weighed ~3 400 chars, just under the threshold. Two lines added to fleet
//    docs made it tip over — a gate that depends on the size of the fleet
//    is not a gate, it is a countdown.
// ⚠️ We therefore compare the CONTENT, envelope removed — parity stays proven
//    TO THE BYTE on what carries the meaning. 🛑 NEVER "fix" this red by
//    shortening a doc: that would degrade a deliverable to fit into
//    a limit of OUR plumbing, exactly what the framework forbids
//    ("it DELIVERS EVERYTHING"). The doc is healthy; it is the oracle that is dated.
// ⚠️ The pattern requires the SAME marker at the top and at the foot (back-reference):
//    a permissive unsealing would mask a real divergence, and this test
//    would become decorative — the class of the inert gates of 03/08.
const SCEAU_RE = /^⚠️ SEALED INJECTION — this block ends with ###END:([0-9a-f]+)###\n[^\n]*\n[^\n]*\n\n([\s\S]*)\n\n###END:\1###$/;
function unseal(ctx) {
  if (typeof ctx !== 'string') return ctx;
  const m = SCEAU_RE.exec(ctx);
  return m ? m[2] : ctx;
}

function runHook(script, payload, env) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, ...env } }, (_err, stdout) => {
      resolve(stdout.trim() === '' ? null : JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify({ tool_name: payload.toolName, tool_input: payload.toolInput, session_id: 'porte-diff' }));
  });
}

async function both(payload) {
  const [old, fresh] = await Promise.all([
    runHook(LEGACY, payload, {}),
    runHook(PORTE, payload, { CTXROUTE_CONFIG_PATH: CONFIG, CTXROUTE_STATE_DIR: path.join(TMP, 'state') }),
  ]);
  return { old, fresh };
}

// REAL payloads (known rules of the fleet) — read, write, Bash, non-match.
const HOOK_DIR = path.join(os.homedir(), '.claude', 'hooks');
const READ_MATCH = { toolName: 'Read', toolInput: { file_path: 'C:/Users/dev/Desktop/ctxroute/lib-pure.js' } };

test.skipIf(!parcPresent)('READ: injected content IDENTICAL to the byte (ctx + systemMessage)', async () => {
  const { old, fresh } = await both(READ_MATCH);
  assert.ok(old && fresh, 'both engines must inject on this known payload');
  assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(withoutOrdinal(unseal(fresh.hookSpecificOutput.additionalContext)), old.hookSpecificOutput.additionalContext);
  // ⚠️ DECLARED DIFFERENCE ON THE BADGE — THE NEW ONE NAMES MORE (07/08/2026).
  //
  // 🔴 REAL defect, measured HERE on the fleet: the old engine (and ours
  //    until that day) only announced the first delivered doc. This test
  //    proves it in black and white — "📄 doc: pointer" while `pointer` AND
  //    `lib-pure` were injected. Experienced consequence: the maintainer saw
  //    "chunk 1/8" then "2/8" then another name, and concluded that the
  //    delivery STOPPED. It was complete. A morning lost
  //    diagnosing a non-existent breakdown, on the faith of a false badge.
  //
  // ⚠️ THE ORACLE IS FROZEN AND DATED (its own doc says so): every capability
  //    added to the gate after 17/07/2026 widens the gap — the seal had
  //    already done so. We therefore can NO LONGER require strict equality of the badge without
  //    forbidding any improvement of the display.
  //
  // 🛑 WHAT REMAINS VERIFIED, AND IT IS THE ESSENTIAL: the old one's badge is an
  //    EXACT PREFIX of ours, and the supplement can ONLY be names of
  //    documents actually delivered. A badge that lost the historical name,
  //    changed its shape or invented a suffix stays RED.
  //    ⚠️ NEVER relax this into an `includes`: we would stop verifying the
  //    shape, that is to say stop verifying anything at all.
  if (fresh.systemMessage !== old.systemMessage) {
    assert.ok(fresh.systemMessage.startsWith(old.systemMessage),
      `the badge LOST or DEFORMED the historical name.\n  old : ${old.systemMessage}\n  new : ${fresh.systemMessage}`);
    const supplement = fresh.systemMessage.slice(old.systemMessage.length);
    assert.match(supplement, /^( · [^·]+)+$/,
      `the badge got enriched with something other than names of delivered docs: ${JSON.stringify(supplement)}`);
  }
});

test.skipIf(!parcPresent)('WRITE: decision mirroring the real rush, same docs', async () => {
  const payload = { toolName: 'Edit', toolInput: { file_path: 'C:/Users/dev/Desktop/ctxroute/lib-pure.js' } };
  // ⚠️ `enforce` GUARD OF THE FLEET (live-production.md, 15/08/2026): a user doc
  //    may REFUSE this action ONCE — a capability born AFTER the frozen oracle, which
  //    will never read `enforce`. The alternation (contract: a blockage is NEVER
  //    followed by a blockage) guarantees that the redone action passes ⇒ PARITY is
  //    proven on the action that PASSES (the file docs are 100 % dumb, the
  //    content of the 2nd action is identical). 🛑 NEVER "fix" this deny by
  //    removing the doc from the fleet nor by requiring `allow` on the 1st action.
  let { old, fresh } = await both(payload);
  if (fresh && fresh.hookSpecificOutput && fresh.hookSpecificOutput.permissionDecision === 'deny') {
    ({ fresh } = await both(payload));
  }
  assert.ok(old && fresh, 'both engines must react on a documented write');
  if (RUSH) {
    assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'allow');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'allow');
    assert.strictEqual(RUSH_PREFIX + withoutOrdinal(unseal(fresh.hookSpecificOutput.additionalContext)), old.hookSpecificOutput.additionalContext);
  } else {
    assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'ask');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'ask');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecisionReason, old.hookSpecificOutput.permissionDecisionReason);
  }
});

test.skipIf(!parcPresent)('BASH: cd && reconstruction — same docs injected', async () => {
  const { old, fresh } = await both({ toolName: 'Bash', toolInput: { command: 'cd C:/Users/dev/Desktop/ctxroute && node doctor.js' } });
  // Both silent OR identical injection — never one without the other.
  assert.strictEqual(fresh === null, old === null, 'one engine speaks, the other keeps silent');
  if (old) assert.strictEqual(withoutOrdinal(unseal(fresh.hookSpecificOutput.additionalContext)), old.hookSpecificOutput.additionalContext);
});

test.skipIf(!parcPresent)('GIT + NON-MATCH: silence on both sides', async () => {
  const git = await both({ toolName: 'Bash', toolInput: { command: 'git commit -m "fix lib-pure.js"' } });
  assert.strictEqual(git.old, null);
  assert.strictEqual(git.fresh, null);
  const rien = await both({ toolName: 'Read', toolInput: { file_path: 'C:/tmp/file-unknownOne-xyz.txt' } });
  assert.strictEqual(rien.old, null);
  assert.strictEqual(rien.fresh, null);
});

test.skipIf(!parcPresent)('HOOK_DIR sanity: the real fleet does exist where we think it does', () => {
  assert.ok(fs.existsSync(HOOK_DIR));
});

// ⚠️ NEGATIVE-CHECK of the unsealing (05/08/2026) — WITHOUT it, `unseal()` is
//    a disguised `return ctx` that would make the 3 comparisons above
//    decorative. A relaxation introduced to make a red pass MUST
//    prove that it only relaxes what it claims to.
test('unseal() removes the envelope AND NOTHING ELSE', () => {
  const body = 'doc A\n\n---\n\ndoc B';
  const sealed = '⚠️ SEALED INJECTION — this block ends with ###END:abcd1234###\n'
    + '   line 2\n   line 3\n\n' + body + '\n\n###END:abcd1234###';
  assert.strictEqual(unseal(sealed), body, 'a well-formed sealed block must return its EXACT body');

  // Not sealed → returned INTACT: the nominal path stays a strict comparison.
  assert.strictEqual(unseal(body), body);

  // ⚠️ THE CASE THAT MATTERS: DIFFERENT markers = inconsistent seal. We do NOT
  //    unseal — otherwise we would swallow a real transport defect.
  const bancal = sealed.replace('###END:abcd1234###\n', '###END:00000000###\n');
  assert.strictEqual(unseal(bancal), bancal);

  // ⚠️ A divergence INSIDE the body stays visible after unsealing.
  const other = sealed.replace('doc B', 'doc C');
  assert.notStrictEqual(unseal(other), body);
});
