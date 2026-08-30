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

// ═══════════════════════════════════════════════════════════════════════
// DENY-SIDE CONTENT — measured 2026-08-30, see `driveActionFrames`/`docMap`
// below and the block above the WRITE test itself for the full diagnosis.
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ `denyOutput()` (pretool-core.js) carries the SAME sealed body as an
//    allow would, just under `permissionDecisionReason`, prefixed by this
//    ONE literal (copied from `pretool-core.js`, never re-derived — a
//    dialect string, not a parsing rule).
const DENY_PREFIX = '[ACTION REFUSED — read this, then start over]\n\n';

// 🛑 MUST BE THE SAME `tool_use_id` FOR EVERY FRAME OF ONE ACTION, ON THE
//    FIRST ATTEMPT — measured 2026-08-30, real bug in an earlier version of
//    this fix. Calling a FRESH invocation just to re-read the deny content is
//    a SECOND action to the alternation (`denied` flag), so it flips straight
//    to `allow` and there is no deny content left to read at all ("no frame
//    was delivered"). `driveActionFrames` therefore drives frames 1..N of
//    ONE invocation and reads WHICHEVER channel that action actually used
//    (`additionalContext` on allow/none, `permissionDecisionReason` on deny)
//    — never guessed, read from `permissionDecision` on frame 1 itself.
// 🛑 SECOND DEFECT OF THE SAME KIND, MEASURED THE SAME DAY: running this file
//    solo passed, running it inside the FULL suite reddened intermittently.
//    Cause — `runHook`'s hardcoded `session_id: 'porte-diff'` is SHARED by
//    EVERY test of this file, and the `integration` project runs a file's
//    tests CONCURRENTLY (`vitest.config.mjs`, "each has its own tmpdir AND
//    its own state — verified: no shared state" is the condition that makes
//    that safe, and this file broke it). READ/BASH/GIT all touch cadence-
//    bearing docs on the SAME shared session, so whichever of them happens to
//    run before or alongside WRITE can consume `pointer.md`'s `smart` cadence
//    (or `live-production.md`'s `once`) before WRITE ever sees it — a SECOND,
//    file-wide instance of the exact class this fix exists to close. ⇒ WRITE
//    drives its OWN two actions on a DEDICATED session id, unreachable by any
//    other test in this file.
const WRITE_SESSION_ID = 'porte-diff-write';

async function driveActionFrames(payload, sessionId) {
  const invocationId = `${sessionId}-${++actions}`;
  const texts = [];
  let first = null;
  let decision = null;
  for (let k = 1; k <= FRAMES; k++) {
    const out = await runHook(PORTE, payload, GATE_ENV,
      ['--frame', String(k), '--frames', String(FRAMES)], { tool_use_id: invocationId, session_id: sessionId });
    if (k === 1) { first = out; decision = out && out.hookSpecificOutput ? out.hookSpecificOutput.permissionDecision : null; }
    if (!out || !out.hookSpecificOutput) break;
    const raw = decision === 'deny' ? out.hookSpecificOutput.permissionDecisionReason : out.hookSpecificOutput.additionalContext;
    if (typeof raw !== 'string' || raw === '') break;
    texts.push(decision === 'deny' && raw.startsWith(DENY_PREFIX) ? raw.slice(DENY_PREFIX.length) : raw);
  }
  return { first, decision, texts };
}

// ⚠️ LOCAL COPY OF `budget.js::SEPARATOR` ('\n\n---\n\n'), DELIBERATE (2026-08-30):
//    unlike `reassemble()`/`withoutOrdinal` (the PARSING safety net, single
//    source with `mcp-differential`), this only re-reads an ALREADY-verified,
//    ALREADY-reassembled document to compare it PER DOC against a stateless
//    oracle — a different job, on already-trusted text, and not shared with
//    any other differential.
const DOC_SEPARATOR = '\n\n---\n\n';
const SOURCE_TAG = /\[source: ([^\]]+)\]\s*$/;

/**
 * Splits an already-reassembled corpus into `Map<sourcePath, body>`, one
 * entry per delivered document, keyed by its `[source: …]` tag.
 *
 * 🛑 WHY THIS EXISTS: `sameContent` compares the WHOLE corpus for byte
 *    equality, which is right when every matched doc is `dumb` (the
 *    assumption this differential's WRITE test carried since 2026-08-15).
 *    MEASURED 2026-08-30 that assumption is FALSE for the real fleet corpus:
 *    a personal fleet doc can be `mode: smart`/`once`, and the frozen
 *    (stateless, cadence-blind) oracle re-delivers it on EVERY call while the
 *    live engine correctly withholds it once already delivered THIS session.
 *    Per-doc comparison is what lets the WRITE test tell "a real content
 *    divergence" from "a doc the engine already delivered a moment ago,
 *    through a channel the oracle cannot see" — DECIDED BY MEASUREMENT
 *    (byte-identical lookup), never assumed.
 * ⚠️ A segment with no recognizable `[source: …]` tag is kept under its own
 *    full text as the key — opaque, but still comparable for equality; it
 *    never silently vanishes from the map.
 */
function docMap(text) {
  const map = new Map();
  for (const part of text.split(DOC_SEPARATOR)) {
    const m = SOURCE_TAG.exec(part);
    map.set(m ? m[1] : part, part);
  }
  return map;
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
  //    proven on the action that PASSES. 🛑 NEVER "fix" this deny by removing the
  //    doc from the fleet nor by requiring `allow` on the 1st action.
  // 🔴 MEASURED 2026-08-30, AND THE COMMENT THIS REPLACES WAS WRONG: it claimed
  //    "the file docs are 100 % dumb, the content of the 2nd action is
  //    identical" — FALSE on the real fleet corpus (`pointer.md` is `mode:
  //    smart`, `live-production.md` itself is `mode: once`). Both get
  //    DELIVERED to the agent on the FIRST (denied) action too — a deny's
  //    `permissionDecisionReason` carries the SAME sealed body an allow would
  //    carry in `additionalContext` (`pretool-core.js::denyOutput`) — so the
  //    live engine CORRECTLY withholds them on the retried action while the
  //    frozen, STATELESS oracle (no cadence concept at all) re-delivers
  //    everything unconditionally on every call. Byte equality against a
  //    SINGLE action is therefore structurally impossible whenever an enforce
  //    doc and a non-dumb doc share one gesture — not a flaky machine, a
  //    permanent property of comparing a stateful engine to a stateless one.
  //    ⇒ compare PER DOC (`docMap`): a doc the oracle delivers must be found,
  //    byte-identical, in THIS action's content OR in the earlier denied
  //    one's — MEASURED, never assumed away.
  const [old, action1] = await Promise.all([
    runHook(LEGACY, payload, {}),
    driveActionFrames(payload, WRITE_SESSION_ID),
  ]);
  let fresh = action1.first;
  let frames = action1.texts;
  let deniedContent = null;
  if (action1.decision === 'deny') {
    const denyRes = reassemble(action1.texts);
    assert.ok(denyRes.ok, `DENY REASSEMBLY REFUSED — ${denyRes.reason}`);
    deniedContent = withoutOrdinal(denyRes.text);
    const action2 = await driveActionFrames(payload, WRITE_SESSION_ID);
    fresh = action2.first;
    frames = action2.texts;
  }
  assert.ok(old && fresh, 'both engines must react on a documented write');
  if (RUSH) {
    assert.strictEqual(old.hookSpecificOutput.permissionDecision, 'allow');
    assert.strictEqual(fresh.hookSpecificOutput.permissionDecision, 'allow');
    const res = reassemble(frames);
    assert.ok(res.ok, `REASSEMBLY REFUSED — ${res.reason}`);
    const oldRaw = old.hookSpecificOutput.additionalContext;
    assert.ok(oldRaw.startsWith(RUSH_PREFIX), `oracle output missing the RUSH prefix: ${JSON.stringify(oldRaw.slice(0, 80))}`);
    const oldDocs = docMap(oldRaw.slice(RUSH_PREFIX.length));
    const freshDocs = docMap(withoutOrdinal(res.text));
    const deniedDocs = deniedContent ? docMap(deniedContent) : new Map();
    // Every doc the OLD (stateless) oracle delivers must be found, byte
    // identical, either in THIS action's content or in the earlier denied
    // one's — a real content divergence stays red on BOTH.
    for (const [src, body] of oldDocs) {
      const seenNow = freshDocs.get(src);
      const seenDenied = deniedDocs.get(src);
      assert.ok(seenNow === body || seenDenied === body,
        `doc "${src}" delivered by the oracle has no byte-identical match in the live engine's output `
        + '(neither this action nor the earlier denied one) — a real content divergence, not a cadence gap.\n'
        + `  oracle : ${JSON.stringify(body.slice(0, 200))}\n`
        + `  this   : ${JSON.stringify((seenNow || '').slice(0, 200))}\n`
        + `  denied : ${JSON.stringify((seenDenied || '').slice(0, 200))}`);
    }
    // And the reverse: the oracle has no cadence to shrink its output, so it
    // is always the SUPERSET — anything the live engine delivers on the
    // PASSING action that the oracle does not know at all is a real
    // divergence too.
    for (const [src, body] of freshDocs) {
      assert.strictEqual(body, oldDocs.get(src),
        `doc "${src}" delivered by the live engine on the passing action has no byte-identical match in the oracle's output`);
    }
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
