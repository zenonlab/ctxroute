// ═══════════════════════════════════════════════════════════════════════
// DIFFERENTIAL spawn lane ↔ HTTP lane — the ONLY thing that makes the HTTP
// shell worth anything. Same payload, same frame, SAME BYTES out.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 WHY A DIFFERENTIAL AND NOT UNIT TESTS. The HTTP shell exists to change the
//    TRANSPORT and NOTHING else. Unit tests would prove it does something
//    reasonable; only a differential proves it does the SAME thing. This repo
//    switched engines twice on exactly this kind of proof, and both times the
//    oracle was the lane already in production — never a hand-written
//    expectation, which would only encode what the author already believed.
//
// ⚠️ THE ORACLE IS `doc-inject.js` SPAWNED FOR REAL, not `run()` called in
//    memory: an in-memory oracle would share every module the HTTP lane
//    shares, so any defect COMMON to both would cancel out and stay invisible.
//
// ⚠️ NEVER touches the real fleet: corpus, config and state are isolated by
//    env vars, and each lane gets a FRESH state directory so that neither can
//    consume the other's `once`.
// ═══════════════════════════════════════════════════════════════════════

import { test, beforeEach, afterAll, expect } from 'vitest';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { withoutDeliveryNotice } from '../src/differential-normalize.js';

const require_ = createRequire(import.meta.url);
const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-http-diff-'));
const DOCS = path.join(TMP, 'docs');
const CONFIG = path.join(TMP, 'config.json');
const STATE_SPAWN = path.join(TMP, 'state-spawn');
const STATE_HTTP = path.join(TMP, 'state-http');

function writeDoc(rel, text) {
  const full = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

// ── LANE A: the production lane, spawned exactly as `settings.json` does ──
function laneSpawn(payload, frame, frames) {
  return new Promise((resolve) => {
    const args = [HOOK];
    if (frame !== undefined) args.push('--frame', String(frame), '--frames', String(frames));
    const child = execFile(process.execPath, args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        CTXROUTE_FILEDOCS_DIR: DOCS,
        CTXROUTE_STATE_DIR: STATE_SPAWN,
        CTXROUTE_CONFIG_PATH: CONFIG,
      },
    }, (_err, stdout) => resolve(stdout.trim() === '' ? null : JSON.parse(stdout)));
    child.stdin.end(JSON.stringify(payload));
  });
}

// ── LANE B: the HTTP shell, driven over a real loopback socket ──
// ⚠️ A REAL socket, not `handle()` called directly: the body read, the URL
//    parsing and the response serialization are part of what is being proven.
let server = null;
let port = 0;

function startServer() {
  const { createServer } = require_('../src/hooks/http-server.js');
  return new Promise((resolve) => {
    server = createServer();
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
}

function laneHttp(payload, frame, frames) {
  const previous = {
    docs: process.env.CTXROUTE_FILEDOCS_DIR,
    state: process.env.CTXROUTE_STATE_DIR,
    config: process.env.CTXROUTE_CONFIG_PATH,
  };
  process.env.CTXROUTE_FILEDOCS_DIR = DOCS;
  process.env.CTXROUTE_STATE_DIR = STATE_HTTP;
  process.env.CTXROUTE_CONFIG_PATH = CONFIG;
  const query = frame !== undefined ? `?frame=${frame}&frames=${frames}` : '';
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port, method: 'POST', path: `/pretool${query}`,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        process.env.CTXROUTE_FILEDOCS_DIR = previous.docs;
        process.env.CTXROUTE_STATE_DIR = previous.state;
        process.env.CTXROUTE_CONFIG_PATH = previous.config;
        try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * ⚠️ THE ONE DECLARED TRANSLATION between the lanes, and the only place the
 *    comparison is allowed to be anything but identity. On the spawn lane
 *    "nothing to say" is an empty stdout, which parses to `null` here; over
 *    HTTP it is `{}`, because the harness contract says the endpoint answers in
 *    the JSON output format and an empty body may not parse at all.
 * 🛑 That equivalence is a GUESS about the harness until it is measured on a
 *    throwaway wiring. It is written HERE, once, so that the day it is measured
 *    there is exactly one line to correct.
 */
function normalize(answer) {
  if (answer === null) return null;
  if (answer && typeof answer === 'object' && Object.keys(answer).length === 0) return null;
  // ⚠️ THE SECOND DECLARED TRANSLATION (2026-08-30), SINGLE SOURCE IN
  //    `differential-normalize.js`, never a copy here. It strips the
  //    completion/deferral notice `delivery-notice-pure.js` appends to the
  //    HTTP lane's `systemMessage` — the spawn lane has no equivalent
  //    observer and can NEVER emit it (see that module's header). A no-op on
  //    the spawn side (nothing to strip) and on any single-frame action.
  if (answer && typeof answer === 'object' && typeof answer.systemMessage === 'string') {
    const cleaned = withoutDeliveryNotice(answer.systemMessage);
    return cleaned === answer.systemMessage ? answer : { ...answer, systemMessage: cleaned };
  }
  return answer;
}

beforeEach(() => {
  for (const d of [DOCS, STATE_SPAWN, STATE_HTTP]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(CONFIG, { force: true });
  fs.mkdirSync(DOCS, { recursive: true });
});

afterAll(() => {
  if (server) server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('SETUP: the HTTP shell listens on loopback', async () => {
  await startServer();
  assert.ok(port > 0, 'the server must have been given a real port');
  assert.strictEqual(server.address().address, '127.0.0.1', 'loopback ONLY — never expose this endpoint');
});

test('IDENTITY: a matching doc goes out byte-for-byte identical on both lanes', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\n# Trap\nDO NOT touch X.\n');
  const payload = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 's1', tool_use_id: 'inv-1' };

  const a = normalize(await laneSpawn(payload));
  const b = normalize(await laneHttp(payload));

  // ⚠️ ANTI-VACUITY: a differential comparing two silences passes forever and
  //    proves nothing. The knowledge must really have travelled.
  assert.ok(a && a.hookSpecificOutput.additionalContext.includes('DO NOT touch X.'),
    'the spawn lane must really have injected — otherwise this test measures nothing');
  expect(b).toEqual(a);
});

test('IDENTITY PER FRAME: a doc too big to fit is split the SAME way on both lanes', async () => {
  // ⚠️ Big enough to force the multi-frame split — that is the whole point of
  //    the N declarations, and the place where a transport port would drift first.
  const body = Array.from({ length: 900 }, (_, i) => `line ${i} — invariant to preserve`).join('\n');
  writeDoc('gros.md', `---\nmatch: server.js\nmode: dumb\n---\n# Big\n${body}\n`);
  const payload = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 's2', tool_use_id: 'inv-2' };

  const FRAMES = 4;
  const seen = [];
  for (let k = 1; k <= FRAMES; k += 1) {
    const a = normalize(await laneSpawn(payload, k, FRAMES));
    const b = normalize(await laneHttp(payload, k, FRAMES));
    expect(b).toEqual(a);
    if (a) seen.push(a.hookSpecificOutput.additionalContext);
  }

  // ⚠️ ANTI-VACUITY, twice over: the content must really have been SPLIT (more
  //    than one frame carried something) and the frames must CARRY DIFFERENT
  //    THINGS. Without this, a shell that answered the same chunk to every
  //    frame — the exact defect that produced an orphan chunk on 07/08/2026 —
  //    would pass this test green.
  assert.ok(seen.length > 1, `the corpus must really span several frames (got ${seen.length})`);
  assert.strictEqual(new Set(seen).size, seen.length, 'each frame must carry a DISTINCT chunk');
});

test('IDENTITY: silence on one lane is silence on the other', async () => {
  writeDoc('piege.md', '---\nmatch: server.js\nmode: dumb\n---\ncontent\n');
  const payload = { tool_name: 'Bash', tool_input: { command: 'ls C:/proj/elsewhere' }, session_id: 's3', tool_use_id: 'inv-3' };
  const a = normalize(await laneSpawn(payload));
  const b = normalize(await laneHttp(payload));
  assert.strictEqual(a, null, 'nothing matches: the spawn lane must stay silent');
  expect(b).toEqual(a);
});

test('IDENTITY: a refusal (`enforce`) crosses the HTTP lane unchanged', async () => {
  // ⚠️ The ONE decision that stops an agent. A transport that dropped or
  //    softened it would disarm every enforce guard of the fleet, silently.
  writeDoc('bloquant.md', '---\nmatch: server.js\nmode: dumb\nenforce: true\n---\n# Refusal\nreason\n');
  const payload = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/server.js' }, session_id: 's4', tool_use_id: 'inv-4' };
  const a = normalize(await laneSpawn(payload));
  const b = normalize(await laneHttp(payload));
  assert.strictEqual(a.hookSpecificOutput.permissionDecision, 'deny', 'the oracle must really refuse');
  expect(b).toEqual(a);
});

test('FAIL-OPEN: a body that is not JSON answers "nothing", it never takes the daemon down', async () => {
  const { handle } = require_('../src/hooks/http-server.js');
  const deps = { runFn: () => { throw new Error('must not be reached'); }, outputFn: () => ({ x: 1 }), parseFrames: () => ({ frame: 1, nbFrames: 1 }) };
  expect(handle('{not json', '/pretool', deps)).toEqual({});
  expect(handle('null', '/pretool', deps)).toEqual({});
  // ⚠️ And a core that throws must not escape either: on the spawn lane a crash
  //    cost one short-lived process, here it would cost every agent at once.
  const boom = { runFn: () => { throw new Error('boom'); }, outputFn: () => ({ x: 1 }), parseFrames: () => ({ frame: 1, nbFrames: 1 }) };
  expect(handle('{"tool_name":"Bash"}', '/pretool', boom)).toEqual({});
});

test('SEEN RED: the differential really detects a lane that answers the wrong CONTENT', async () => {
  // 🛑 A gate never seen failing is a gate ASSUMED to work. This cell used to
  //    lever "ask the HTTP lane for frame 2 while the spawn lane answered
  //    frame 1" — that lever is now DEAD BY DESIGN (2026-08-28): the daemon no
  //    longer attributes content to the URL's own `?frame=` number, it hands
  //    a connecting request the NEXT UNDELIVERED index (see the block above
  //    `/pretool`'s handling in `src/hooks/http-server.js`, and
  //    `frame-sequencer-pure.js`). Asking for frame 2 on a FRESH invocation
  //    now serves index 1 on the HTTP lane too, exactly like frame 1 does —
  //    so the old lever produced two IDENTICAL answers and this cell rotted
  //    silently green-by-luck until it was re-measured on 2026-08-29.
  // ✅ WHAT STILL NEEDS PROVING, unchanged: that `assert.notDeepStrictEqual`
  //    really rejects two DIFFERENT outputs, so the IDENTITY cells above are
  //    load-bearing and not passing by accident (a comparison that always
  //    says "equal" would pass every IDENTITY test too). The new lever keeps
  //    the SAME frame (1) on both lanes and makes them answer on two
  //    DIFFERENT payloads (distinct commands triggering distinct documents,
  //    distinct `tool_use_id`) — the comparison must still tell them apart.
  writeDoc('trap-a.md', '---\nmatch: alpha.js\nmode: dumb\n---\n# Trap A\nDO NOT touch ALPHA.\n');
  writeDoc('trap-b.md', '---\nmatch: beta.js\nmode: dumb\n---\n# Trap B\nDO NOT touch BETA.\n');
  const payloadA = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/alpha.js' }, session_id: 's5', tool_use_id: 'inv-5a' };
  const payloadB = { tool_name: 'Bash', tool_input: { command: 'cat C:/proj/beta.js' }, session_id: 's5', tool_use_id: 'inv-5b' };
  const a = normalize(await laneSpawn(payloadA, 1, 1));
  const wrong = normalize(await laneHttp(payloadB, 1, 1));
  assert.notDeepStrictEqual(wrong, a, 'two different payloads MUST produce two different outputs — otherwise the identity tests prove nothing');
});

test('SEEN RED (delivery notice filter): a DECOY divergence in systemMessage is NOT hidden by normalize()', async () => {
  // 🛑 Mandatory negative-check of the 2026-08-30 addition to `normalize()`
  //    (`withoutDeliveryNotice`, single source in `differential-normalize.js`).
  //    Direction ① (the filter really removes OUR message, restoring green)
  //    is already proven by 'IDENTITY PER FRAME' above, which reddened
  //    without this filter and is green with it. This cell proves direction
  //    ②: a foreign divergence that merely SHARES our `ctxroute: ` prefix but
  //    is NOT one of the two exact wordings must stay VISIBLE to `toEqual` —
  //    otherwise this filter would be wide enough to hide a real regression.
  const clean = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }, systemMessage: '📄 doc: gros (chunk 4/4)' };
  const decoyNotYetKnown = { ...clean, systemMessage: clean.systemMessage + ' · ctxroute: 4 chunk(s) delivered — 4 of 4 declared frames reached the daemon' };
  const decoyModifiedBadge = { ...clean, systemMessage: '📄 doc: AUTRE (chunk 4/4) · ctxroute: all 4 chunk(s) delivered — 4 of 4 declared frames reached the daemon' };
  expect(normalize(decoyNotYetKnown)).not.toEqual(normalize(clean));
  expect(normalize(decoyModifiedBadge)).not.toEqual(normalize({ ...clean, systemMessage: clean.systemMessage + ' · ctxroute: all 4 chunk(s) delivered — 4 of 4 declared frames reached the daemon' }));
});

test('FRAME COORDINATES: the URL says exactly what argv says', async () => {
  const { frameFromUrl } = require_('../src/hooks/http-server.js');
  const parse = require_('../src/lib-pure.js').parseFrameArgs;
  // ⚠️ The SAME pure parser decides on both lanes — so its hard-won rules
  //    (absent ⇒ 1, out-of-bounds ⇒ single frame, non-integer ⇒ 1) hold here
  //    without being restated. These cases prove the URL reaches it intact.
  expect(frameFromUrl('/pretool?frame=3&frames=16', parse)).toEqual({ frame: 3, nbFrames: 16 });
  expect(frameFromUrl('/pretool', parse)).toEqual({ frame: 1, nbFrames: 1 });
  expect(frameFromUrl('/pretool?frame=9&frames=4', parse)).toEqual({ frame: 1, nbFrames: 1 });
  expect(frameFromUrl('/pretool?frame=x&frames=4', parse)).toEqual({ frame: 1, nbFrames: 4 });
});
