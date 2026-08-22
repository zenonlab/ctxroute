// ═══════════════════════════════════════════════════════════════════════
// MCP DIFFERENTIAL — old engine (legacy-mcp-inject.js) vs the single gateway
// (doc-inject.js, source sources/mcp.js), by REAL SPAWN on a tmpdir corpus.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ Parity gate for the REMOVAL of legacy-mcp-inject.js (merge 17/07/2026):
//    for each sequence of calls, BOTH engines must inject at the
//    SAME moments, with the SAME additionalContext (byte-wise) and the SAME
//    systemMessage. Red here = the merge changed the MCP behavior.
//
// ⚠️ The "foreign" calls of the smart sequences are OTHER MCP servers
//    (never native tools): both engines see them whatever their
//    matcher — the differential does not test the wiring, it tests the engine.
//
// ⚠️ Each engine has ITS OWN state dir (same session_id); GC disabled (probability 0).
//
// ✅ FRAME PARITY WITH ITS TWIN (2026-08-22). Until today this net spawned the
//    gate ONCE, passed no `--frame`, and compared that single output. Its twin
//    `pretool-differential` had been taught on 2026-08-21 to DRIVE the frames an
//    action declares and REASSEMBLE them; this one had not. **Two nets built on
//    ONE normalization module must not read the transport two different ways** —
//    that asymmetry is the exact shape of every "accepted and inert" defect this
//    repo has paid for (`enforce` never transported to the MCP channel,
//    `defaults.mcp` short-circuited, `scope`/`exclude` missing on `servers`).
// 📐 MEASURED BEFORE FIXING, so the direction is on record: the asymmetry was
//    HARMLESS but not benign. The fixtures below are tmpdir docs authored inside
//    the tests; the heaviest emission weighed **233 characters** against a frame
//    capacity of **7,681** (`budget.frameCapacity(8000, 16)`), so nothing was
//    ever chunked and the single spawn happened to see the whole document. The
//    net was correct BY LUCK OF SIZE — the same countdown its twin was on.
// 🛑 A NET THAT REASSEMBLES ONE FRAME EVERY TIME HAS CHANGED NOTHING. That is
//    why the multi-frame case below is not optional decoration: it is what makes
//    the driving non-vacuous, and it carries a FLOOR on the number of frames so
//    the day a wider frame swallows the fixture the cell goes RED instead of
//    quietly becoming a single-frame cell again.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test as base, expect } from 'vitest';

// ⚠️ 7 spawns × 2 engines per sequence: under the full suite (loaded
//    machine), the vitest default (5 s) expires — 60 s = real signal only.
const test = (name, fn) => base(name, { timeout: 60000 }, fn);
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
// ⚠️ SINGLE SOURCE shared with `pretool-differential` — never a copy: two
//    normalizations diverge, and two nets that no longer filter the same thing
//    no longer prove anything together. `reassemble` arrived here on 2026-08-22,
//    the day this net stopped reading the transport differently from its twin.
import { withoutOrdinal, reassemble } from '../src/differential-normalize.js';
import os from 'node:os';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const OLD = path.join(REPO, 'src', 'hooks', 'legacy-mcp-inject.js');
const NEW = path.join(REPO, 'src', 'hooks', 'doc-inject.js');

// ⚠️ N FRAMES = the bandwidth of ONE action, mirroring the LIVE wiring
//    (`frames` in ctxroute-config.json) exactly as `pretool-differential` does.
//    It is a CEILING, not a cost: we stop at the first frame with no content, so
//    an emission that fits in one frame still costs the historical single spawn
//    (+1 to PROVE it is over, which is the price of comparing the WHOLE document
//    instead of its head).
const FRAMES = 16;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-diff-'));
}

// Spawns an engine on a payload, returns the RAW hook JSON (null if silence).
// ⚠️ It returns the envelope, never a comparison-ready shape: the two sides no
//    longer read the transport the same way (the oracle answers whole, the gate
//    answers frame by frame), so normalizing here would hide that asymmetry
//    inside a helper instead of stating it.
function run(engine, payload, env, args = [], extra = {}) {
  const r = spawnSync(process.execPath, [engine, ...args], {
    input: JSON.stringify({ ...payload, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, ...env, CTXROUTE_GC_PROBABILITY: '0' },
    timeout: 30000,
  });
  expect(r.status).toBe(0); // fail-open ALWAYS exit 0
  const out = r.stdout.trim();
  if (!out) return null;
  return JSON.parse(out);
}

// ⚠️ ORDINAL REMOVED BEFORE COMPARISON — the oracle has been FROZEN since July
//    and ignores everything born after it (ordinal, seal, frames, chunks). We
//    compare the CONTENT, not the envelope. TOTAL on the oracle's own output:
//    it never emits an ordinal, so this is a no-op there — applying it to BOTH
//    sides keeps ONE filter over the comparison instead of two half-filters.
function oldSide(payload, env) {
  const json = run(OLD, payload, env);
  if (json === null) return null;
  return {
    context: json.hookSpecificOutput ? withoutOrdinal(json.hookSpecificOutput.additionalContext) : undefined,
    systemMessage: json.systemMessage,
  };
}

// ⚠️ ONE `tool_use_id` PER ACTION, SHARED BY ITS N FRAMES — and never between
//    two actions. The plan is MEMOIZED per invocation (`plan-` store): the same
//    id makes the N processes see the SAME split and consume the cadence ONCE
//    (without it each frame would re-decide and eat the `once` docs), a
//    different id makes two actions two independent splits.
let actions = 0;

// Drives the frames of ONE action and returns the raw frame texts, in order.
// ⚠️ We stop at the first frame with NO content: `planFrames` fills frames in
//    order, so the non-empty ones are contiguous. A hole after that point cannot
//    produce a false GREEN — a missing chunk is refused by the reassembly and a
//    missing document breaks the final equality.
function driveFrames(payload, env) {
  const invocationId = `mcp-diff-${++actions}`;
  const texts = [];
  let first = null;
  for (let k = 1; k <= FRAMES; k++) {
    const out = run(NEW, payload, env, ['--frame', String(k), '--frames', String(FRAMES)],
      { tool_use_id: invocationId });
    if (k === 1) first = out;
    const ctx = out && out.hookSpecificOutput ? out.hookSpecificOutput.additionalContext : undefined;
    if (typeof ctx !== 'string' || ctx === '') break;
    texts.push(ctx);
  }
  return { first, texts };
}

// The gate's side of one action, reassembled into the single document the frozen
// oracle returns.
// 🛑 A REFUSAL IS A RED, never a downgrade to a weaker comparison: a delivery we
//    cannot place is exactly when a hollow net would be most dangerous.
function newSide(payload, env) {
  const { first, texts } = driveFrames(payload, env);
  if (first === null) return { out: null, frames: 0 };
  // An envelope with no `hookSpecificOutput` carries no context at all (the
  // withholding notice speaks to the human alone) — nothing to reassemble.
  if (!first.hookSpecificOutput) {
    return { out: { context: undefined, systemMessage: first.systemMessage }, frames: 0 };
  }
  const res = reassemble(texts);
  expect(res.ok, `REASSEMBLY REFUSED — ${res.reason}`).toBe(true);
  return { out: { context: withoutOrdinal(res.text), systemMessage: first.systemMessage }, frames: texts.length };
}

// Demands the two engines said the SAME thing on one action.
// 🛑 THE CONTENT IS COMPARED BYTE FOR BYTE, ALWAYS, WITH NO REGIME AND NO
//    EXCEPTION. Only the BADGE carries a declared gap, below.
function sameOutput(fresh, old, frames, i, payload) {
  const where = `call #${i} (${payload.tool_name})`;
  expect(fresh === null, `${where}: one engine speaks, the other keeps silent`).toBe(old === null);
  if (old === null) return;
  expect(fresh.context, `${where}: divergent injected content`).toEqual(old.context);
  if (fresh.systemMessage === old.systemMessage) return;

  // ⚠️ DECLARED DIFFERENCE ON THE BADGE — THE POSITION SUFFIX (2026-08-06),
  //    SURFACED HERE BY THE FRAME DRIVING ON 2026-08-22.
  //
  // 🔴 It is a REAL fix the oracle predates, not a cosmetic drift. A skill
  //    delivered in 7 chunks used to display SEVEN IDENTICAL badges, read as the
  //    framework running away while the delivery was normal and unique — a
  //    correct but unreadable transport gets mistaken for an outage, and a
  //    system believed broken ends up unplugged. `pretool-core` therefore
  //    appends `(chunk j/m)` ONCE. `legacy-mcp-inject.js` has been frozen since
  //    July and knows nothing of chunks, so requiring strict badge equality in
  //    the chunked regime would forbid that fix for ever.
  //
  // 🛑 WHAT STAYS VERIFIED, AND IT IS EVERYTHING THAT MATTERS: the gap is
  //    admitted ONLY when the delivery really was chunked, the old badge must be
  //    an EXACT PREFIX of ours, and the supplement must be EXACTLY a position —
  //    nothing else gets through. A badge that lost the historical name, changed
  //    its shape or invented any other suffix stays RED, in every regime.
  //    ⚠️ NEVER relax this into an `includes` nor drop the `frames` condition:
  //    we would stop verifying the shape, that is to say stop verifying at all.
  expect(frames, `${where}: the badge diverged OUTSIDE the chunked regime`).toBeGreaterThan(1);
  expect(typeof old.systemMessage, `${where}: the oracle emitted no badge to extend`).toBe('string');
  expect(fresh.systemMessage.startsWith(old.systemMessage),
    `${where}: the badge LOST or DEFORMED the historical name.\n  old : ${old.systemMessage}\n  new : ${fresh.systemMessage}`).toBe(true);
  expect(fresh.systemMessage.slice(old.systemMessage.length)).toMatch(/^ \(chunk \d+\/\d+\)$/);
}

// Replays the SAME sequence on both engines (separate state dirs) and demands
// IDENTICAL outputs call by call. Returns the outputs AND how many frames each
// action really needed — the frame count is what lets a cell prove it is not
// reassembling a single frame every time (anti-vacuity).
function differential(t, config, docs, sequence) {
  const base = mkTmp();
  try {
    const docsDir = path.join(base, 'docs-mcp');
    const emptyFileDocs = path.join(base, 'filedocs'); // empty FILE corpus → the gateway only has the MCP source
    fs.mkdirSync(emptyFileDocs, { recursive: true });
    for (const [rel, content] of Object.entries(docs)) {
      const full = path.join(docsDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const configPath = path.join(base, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const mkEnv = (stateDir) => ({
      CTXROUTE_CONFIG_PATH: configPath,
      CTXROUTE_DOCS_DIR: docsDir,
      CTXROUTE_STATE_DIR: stateDir,
      CTXROUTE_FILEDOCS_DIR: emptyFileDocs,
    });
    const envOld = mkEnv(path.join(base, 'state-old'));
    const envNew = mkEnv(path.join(base, 'state-new'));
    fs.mkdirSync(envOld.CTXROUTE_STATE_DIR);
    fs.mkdirSync(envNew.CTXROUTE_STATE_DIR);

    const outs = [];
    const framesDriven = [];
    sequence.forEach((payload, i) => {
      const a = oldSide(payload, envOld);
      const { out: b, frames } = newSide(payload, envNew);
      sameOutput(b, a, frames, i, payload);
      outs.push(a);
      framesDriven.push(frames);
    });
    return { outs, framesDriven };
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

const SID = 'diff-session';
const call = (toolName, toolInput = {}) => ({ tool_name: toolName, tool_input: toolInput, session_id: SID });

const STRIPE_DOC = '⚠️ Never click a real payment button.\n';
const ODOO_DOC = '⚠️ No payment.token stored here.\n';

test('dumb: re-injection on EVERY call, identical content and badge', () => {
  const { outs } = differential(test, { mode: 'dumb' }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__complete_authentication'),
  ]);
  for (const o of outs) {
    expect(o).not.toBeNull();
    expect(o.context).toContain('[source: docs/mcp/stripe.md]');
  }
});

test('once: the 1st call injects, subsequent calls are silent', () => {
  const { outs } = differential(test, { mode: 'once' }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__authenticate'),
  ]);
  expect(outs[0]).not.toBeNull();
  expect(outs[1]).toBeNull();
  expect(outs[2]).toBeNull();
});

test('smart threshold 2: re-injection after 2 foreign MCP calls, not before', () => {
  const { outs } = differential(
    test,
    { mode: 'smart', defaultThreshold: 2 },
    { 'stripe.md': STRIPE_DOC, 'odoo.md': ODOO_DOC },
    [
      call('mcp__stripe__authenticate'), // stripe injected (1st)
      call('mcp__stripe__authenticate'), // silence (counter 0)
      call('mcp__odoo__odoo_call'),      // odoo injected (1st) · stripe counter 1
      call('mcp__stripe__authenticate'), // silence (1 < 2)
      call('mcp__odoo__odoo_call'),      // odoo silence · stripe counter 1 (reset to 0 at call 4)
      call('mcp__odoo__odoo_call'),      // odoo silence · stripe counter 2
      call('mcp__stripe__authenticate'), // stripe RE-INJECTED (2 ≥ 2)
    ]
  );
  expect(outs.map((o) => (o ? 1 : 0))).toEqual([1, 0, 1, 0, 0, 0, 1]);
});

// 🛑 CASE FLIPPED ON 09/08/2026 — it demanded PARITY on `servers.{name}.mode`,
//    a key that the SCHEMA REFUSES (`servers.{name}` only allows `subToolParam`,
//    `additionalProperties: false`): NO valid config can carry it, and
//    the shipped config has `servers: {}`. This case therefore froze parity on an
//    UNREACHABLE feature — and the reading of this key by the source
//    had a very real side effect: it ALWAYS supplied a value in the
//    decl, which SHORT-CIRCUITED the `defaults.mcp` stage (inert, cf ㊳).
// ⚠️ A FROZEN oracle can therefore demand the preservation of a defect. When
//    the old engine and the schema contradict each other, **it is the schema that states the
//    contract** — the oracle predates it.
// ⚠️ We keep the case, FLIPPED: it now proves that the key is ignored on
//    BOTH sides from the contract's point of view, and it documents why.
test('UNREACHABLE server override: `servers.{name}.mode` is out of schema, the engine no longer reads it', () => {
  const schema = JSON.parse(
    require('fs').readFileSync(require('path').join(__dirname, '..', 'ctxroute-config.schema.json'), 'utf8')
  );
  const srv = schema.properties.servers.additionalProperties;
  // ① the contract REFUSES the key — that is what authorizes the engine to ignore it.
  expect(srv.additionalProperties).toBe(false);
  expect(Object.keys(srv.properties)).toEqual(['subToolParam']);

  // ② an MCP doc without a frontmatter leaves the decl EMPTY, so the cascade speaks.
  const { declFor } = require('../src/sources/mcp.js');
  expect(declFor({})).toEqual({});
});

test('granularity: server + tool + subTool concatenated, identical order and separator', () => {
  const { outs } = differential(
    test,
    { mode: 'dumb', servers: { odoo: { subToolParam: 'args.tool' } } },
    {
      'odoo.md': ODOO_DOC,
      'odoo/odoo_call.md': 'odoo_call tool doc.\n',
      'odoo/delete_record.md': '⚠️ delete_record is IRREVERSIBLE.\n',
    },
    [call('mcp__odoo__odoo_call', { args: { tool: 'delete_record' } })]
  );
  const ctx = outs[0].context;
  expect(ctx).toContain('[source: docs/mcp/odoo.md]');
  expect(ctx).toContain('[source: docs/mcp/odoo/odoo_call.md]');
  expect(ctx).toContain('[source: docs/mcp/odoo/delete_record.md]');
});

test('whitelist filter: excluded server = silence from BOTH engines', () => {
  const { outs } = differential(
    test,
    { mode: 'dumb', filterMode: 'whitelist', filterList: ['odoo'] },
    { 'stripe.md': STRIPE_DOC },
    [call('mcp__stripe__authenticate')]
  );
  expect(outs[0]).toBeNull();
});

test('server without a doc: silence from both engines', () => {
  const { outs } = differential(test, { mode: 'dumb' }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__umami__umami_call'),
  ]);
  expect(outs[0]).toBeNull();
});

test('showNotification: false → real injection, badge absent, on both sides', () => {
  const { outs } = differential(
    test,
    { mode: 'dumb', showNotification: false },
    { 'stripe.md': STRIPE_DOC },
    [call('mcp__stripe__authenticate')]
  );
  expect(outs[0].context).toContain('payment');
  expect(outs[0].systemMessage).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════
// ANTI-VACUITY — the cell that makes the frame driving mean something.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 EVERY OTHER CELL OF THIS FILE FITS IN ONE FRAME (233 c against 7,681), so
//    on its own the driving added a spawn and PROVED NOTHING: reassembling a
//    lone frame is the old single-spawn comparison wearing a new name. This cell
//    is the one that exercises the chunked regime the MCP channel could always
//    reach and this net had never seen — `FRAME k/N` envelopes, `CHUNK j/m`
//    continuations, a shared end marker — and demands the glued document equal
//    the frozen oracle's whole answer, BYTE FOR BYTE.
// ⚠️ THE FLOOR IS THE GUARD, not the fixture size. A capacity that grew past
//    this doc would make the cell single-frame again, silently, and we would be
//    back to the state this work item closed. `framesDriven` is asserted, so
//    that day is a RED with a number in it, not a quiet downgrade.
// 🛑 IF THIS CELL EVER REDDENS, DO NOT SHRINK THE FIXTURE. Shrinking it is the
//    forbidden move in its purest form: it would disarm the only cell proving
//    the net sees past chunk 1, to make a red go away.
// ⚠️ LINE LENGTH IS DELIBERATE (well under a frame): `fragment` cuts on line
//    boundaries except on a line longer than a frame, which it chops mid-line —
//    the DECLARED false red of `differential-normalize`. A monster line here
//    would make this cell fail for the reader's known limit, not for a
//    divergence, and a cell that reddens for the wrong reason gets silenced.
test('MULTI-FRAME: a chunked MCP doc reassembles to the oracle byte for byte', () => {
  // perTest: the fixture is built INSIDE the callback — a module-level literal
  // is a static mutant and reads as a false survivor.
  const lines = [];
  for (let i = 0; i < 400; i++) lines.push('line ' + i + ' ' + 'x'.repeat(50));
  const BIG_DOC = lines.join('\n') + '\n';

  const { outs, framesDriven } = differential(test, { mode: 'dumb' }, { 'stripe.md': BIG_DOC }, [
    call('mcp__stripe__authenticate'),
  ]);
  // ① The regime is really the chunked one — the whole point of the cell.
  expect(framesDriven[0]).toBeGreaterThan(1);
  // ② And the document that comes back is the WHOLE one, not its head: both the
  //    first and the LAST line must be there, and no envelope may survive the
  //    reassembly (a leftover chunk header would mean we compared the wrapping).
  expect(outs[0].context).toContain('line 0 ');
  expect(outs[0].context).toContain('line 399 ');
  expect(outs[0].context).not.toContain('CHUNK ');
  expect(outs[0].context).toContain('[source: docs/mcp/stripe.md]');
});

test('enabled: false → total silence from both engines', () => {
  const { outs } = differential(test, { mode: 'dumb', enabled: false }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__stripe__authenticate'),
  ]);
  expect(outs[0]).toBeNull();
});
