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
// Skipped on a fresh clone (no real fleet). Real spawns, and they are COUNTED:
// one action costs (number of NON-EMPTY frames + 1) spawns of the gate, plus one
// of the oracle. A corpus that fits in a single frame therefore costs 2 gate
// spawns instead of 1 — the price of comparing the WHOLE document instead of its
// head. It grows only with what the fleet actually chunks, never with `FRAMES`.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
// ⚠️ SINGLE SOURCE shared with `mcp-differential` — never a copy:
//    two normalizations diverge, and two nets that no longer filter the
//    same thing no longer prove anything together.
import { withoutOrdinal, reassemble } from '../src/differential-normalize.js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LEGACY = process.env.CTXROUTE_LEGACY_PATH || path.join(os.homedir(), '.claude', 'hooks', 'protect-files.js');
const PORTE = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const fleetPresent = fs.existsSync(LEGACY);

const RUSH = fleetPresent && fs.existsSync(path.join(path.dirname(LEGACY), '.rush'));
// ⚠️ FRENCH STRING KEPT AS IS ON PURPOSE: it is the literal output of the FROZEN
//    oracle (`protect-files.js`, which lives outside this repo). Translating it
//    would break the comparison — this is the oracle's text, not ours.
const RUSH_PREFIX = '⚡ RUSH MODE — ask désactivé. Doc injectée :\n\n';

// Gate config MIRRORING the real rush + isolated state (never the real state/).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'porte-diff-'));
const CONFIG = path.join(TMP, 'config.json');
if (fleetPresent) fs.writeFileSync(CONFIG, JSON.stringify(RUSH ? { confirm: false } : {}));

// ⚠️ ENVELOPES — READ BEFORE TOUCHING (05/08/2026, false red PAID FOR).
//    This differential compares the gate to `protect-files.js`, a FROZEN oracle
//    (its own doc forbids it from evolving). The SEAL was born on 03/08/2026 and
//    the CHUNKING after it: the oracle will NEVER know either. As soon as the
//    injection exceeds 50 % of the budget the gate seals, and as soon as a doc
//    outgrows one frame it is cut — so the raw byte differs for a reason that is
//    not an engine divergence but a TRANSPORT layer missing on one side.
// ⚠️ The test only survived until 21/08/2026 by LUCK: the tested payloads
//    weighed ~3 400 chars, just under the threshold. Two lines added to fleet
//    docs made it tip over — a gate that depends on the size of the fleet
//    is not a gate, it is a countdown.
// 🛑 NEVER "fix" a red here by shortening a doc: that would degrade a
//    deliverable to fit a limit of OUR plumbing, exactly what the framework
//    forbids ("it DELIVERS EVERYTHING"). The doc is healthy; the oracle is dated.
// ✅ WHAT WE DO INSTEAD (21/08/2026): we DRIVE the frames the action declares
//    and REASSEMBLE them by the protocol's own numbers (`differential-normalize`,
//    single source + negative-check), then compare the whole document to the
//    oracle for EQUALITY. An earlier version compared the first chunk as a
//    PREFIX — weaker, and blind to any divergence past chunk 1. That gap is
//    CLOSED, not declared.
function sameContent(res, old, prefix = '') {
  // 🛑 A refusal is a RED, never a downgrade to a weaker comparison: a delivery
  //    we cannot place is exactly when a hollow net would be most dangerous.
  assert.ok(res.ok, `REASSEMBLY REFUSED — ${res.reason}`);
  assert.strictEqual(prefix + withoutOrdinal(res.text), old);
}

// ⚠️ N FRAMES = the bandwidth of ONE action, mirroring the LIVE wiring
//    (`frames` in ctxroute-config.json). It is a CEILING here, not a cost: we
//    stop at the first frame with no content, so a corpus that fits in one
//    frame still costs the historical single spawn (+1 to prove it is over).
const FRAMES = 16;

// ⚠️ Tear-down on EVERY path: a hook that never answers must not leave a node
//    behind for the rest of the suite. Never `stdio: 'ignore'` — a hook that
//    fails to emit JSON must say so LOUDLY, not silently look like a silence.
function runHook(script, payload, env, args = [], extra = {}) {
  let child;
  const done = new Promise((resolve, reject) => {
    child = execFile(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }, (_err, stdout) => {
      const out = stdout.trim();
      if (out === '') { resolve(null); return; }
      try { resolve(JSON.parse(out)); }
      catch (e) { reject(new Error(`${path.basename(script)} did not emit JSON (${e.message}):\n${out}`)); }
    });
    child.stdin.end(JSON.stringify({
      tool_name: payload.toolName, tool_input: payload.toolInput, session_id: 'porte-diff', ...extra,
    }));
  });
  return done.finally(() => { child.kill(); });
}

const GATE_ENV = { CTXROUTE_CONFIG_PATH: CONFIG, CTXROUTE_STATE_DIR: path.join(TMP, 'state') };

// ⚠️ ONE `tool_use_id` PER ACTION, SHARED BY ITS N FRAMES — and never between
//    two actions. The plan is MEMOIZED per invocation (`plan-` store): the same
//    id makes the N processes see the SAME split (without it each would consume
//    the `once` docs and recompute its own), a different id makes two actions
//    two independent splits.
let actions = 0;

// Drives the frames of ONE action and returns the raw frame texts, in order.
// ⚠️ We stop at the first frame with NO content: `planFrames` fills frames in
//    order, so the non-empty ones are contiguous. A hole after that point cannot
//    produce a false GREEN — a missing chunk is refused by the reassembly and a
//    missing document breaks the final equality.
async function driveFrames(payload) {
  const invocationId = `porte-diff-${++actions}`;
  const texts = [];
  let first = null;
  for (let k = 1; k <= FRAMES; k++) {
    const out = await runHook(PORTE, payload, GATE_ENV,
      ['--frame', String(k), '--frames', String(FRAMES)], { tool_use_id: invocationId });
    if (k === 1) first = out;
    const ctx = out && out.hookSpecificOutput ? out.hookSpecificOutput.additionalContext : undefined;
    if (typeof ctx !== 'string' || ctx === '') break;
    texts.push(ctx);
  }
  return { first, texts };
}

async function both(payload) {
  const [old, driven] = await Promise.all([
    runHook(LEGACY, payload, {}),
    driveFrames(payload),
  ]);
  return { old, fresh: driven.first, frames: driven.texts };
}

// REAL payloads (known rules of the fleet) — read, write, Bash, non-match.
const HOOK_DIR = path.join(os.homedir(), '.claude', 'hooks');
const READ_MATCH = { toolName: 'Read', toolInput: { file_path: 'C:/Users/dev/Desktop/ctxroute/lib-pure.js' } };

test.skipIf(!fleetPresent)('READ: injected content IDENTICAL to the byte (ctx + systemMessage)', { timeout: 60000 }, async () => {
  const { old, fresh, frames } = await both(READ_MATCH);
  assert.ok(old && fresh, 'both engines must inject on this known payload');
  assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'allow');
  sameContent(reassemble(frames), old.hookSpecificOutput.additionalContext);
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

test.skipIf(!fleetPresent)('WRITE: decision mirroring the real rush, same docs', { timeout: 60000 }, async () => {
  const payload = { toolName: 'Edit', toolInput: { file_path: 'C:/Users/dev/Desktop/ctxroute/lib-pure.js' } };
  // ⚠️ `enforce` GUARD OF THE FLEET (live-production.md, 15/08/2026): a user doc
  //    may REFUSE this action ONCE — a capability born AFTER the frozen oracle, which
  //    will never read `enforce`. The alternation (contract: a blockage is NEVER
  //    followed by a blockage) guarantees that the redone action passes ⇒ PARITY is
  //    proven on the action that PASSES (the file docs are 100 % dumb, the
  //    content of the 2nd action is identical). 🛑 NEVER "fix" this deny by
  //    removing the doc from the fleet nor by requiring `allow` on the 1st action.
  let { old, fresh, frames } = await both(payload);
  if (fresh && fresh.hookSpecificOutput && fresh.hookSpecificOutput.permissionDecision === 'deny') {
    ({ fresh, frames } = await both(payload));
  }
  assert.ok(old && fresh, 'both engines must react on a documented write');
  if (RUSH) {
    assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'allow');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'allow');
    sameContent(reassemble(frames), old.hookSpecificOutput.additionalContext, RUSH_PREFIX);
  } else {
    assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'ask');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'ask');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecisionReason, old.hookSpecificOutput.permissionDecisionReason);
  }
});

test.skipIf(!fleetPresent)('BASH: cd && reconstruction — same docs injected', { timeout: 60000 }, async () => {
  const { old, fresh, frames } = await both({ toolName: 'Bash', toolInput: { command: 'cd C:/Users/dev/Desktop/ctxroute && node doctor.js' } });
  // Both silent OR identical injection — never one without the other.
  assert.strictEqual(fresh === null, old === null, 'one engine speaks, the other keeps silent');
  if (old) sameContent(reassemble(frames), old.hookSpecificOutput.additionalContext);
});

test.skipIf(!fleetPresent)('GIT + NON-MATCH: silence on both sides', { timeout: 60000 }, async () => {
  const git = await both({ toolName: 'Bash', toolInput: { command: 'git commit -m "fix lib-pure.js"' } });
  assert.strictEqual(git.old, null);
  assert.strictEqual(git.fresh, null);
  const nothing = await both({ toolName: 'Read', toolInput: { file_path: 'C:/tmp/file-unknownOne-xyz.txt' } });
  assert.strictEqual(nothing.old, null);
  assert.strictEqual(nothing.fresh, null);
});

test.skipIf(!fleetPresent)('HOOK_DIR sanity: the real fleet does exist where we think it does', () => {
  assert.ok(fs.existsSync(HOOK_DIR));
});

// ⚠️ THE NEGATIVE-CHECK OF THE ENVELOPE HANDLING LIVES WITH THE CODE, in
//    `differential-normalize.test.js` — it moved there on 21/08/2026 with the
//    unsealing itself. The local `unseal()` was a SECOND reader of the same
//    envelope; two readers of one format diverge, and this one could not learn
//    the FRAME envelope without becoming a copy of the module. 🛑 Never bring an
//    envelope reader back into a suite: the module is the single source, and it
//    is the module that must prove it only relaxes what it claims to.
