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
// ═══════════════════════════════════════════════════════════════════════

'use strict';

import { test as base, expect } from 'vitest';

// ⚠️ 7 spawns × 2 engines per sequence: under the full suite (loaded
//    machine), the vitest default (5 s) expires — 60 s = real signal only.
const test = (name, fn) => base(name, { timeout: 60000 }, fn);
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { withoutOrdinal } from '../src/differential-normalize.js';
import os from 'node:os';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const OLD = path.join(REPO, 'src', 'hooks', 'legacy-mcp-inject.js');
const NEW = path.join(REPO, 'src', 'hooks', 'doc-inject.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-diff-'));
}

// Spawns an engine on a payload, returns { context, systemMessage } (null if silence).
function run(engine, payload, env) {
  const r = spawnSync(process.execPath, [engine], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env, CTXROUTE_GC_PROBABILITY: '0' },
    timeout: 30000,
  });
  expect(r.status).toBe(0); // fail-open ALWAYS exit 0
  const out = r.stdout.trim();
  if (!out) return null;
  const json = JSON.parse(out);
  return {
    // ⚠️ ORDINAL REMOVED BEFORE COMPARISON — the oracle has been FROZEN since July
    //    and ignores everything born after it. Same doctrine as the
    //    unsealing on the file side: we compare the CONTENT, not the envelope.
    //    SINGLE SOURCE: `differential-normalize.js`, never a copy here.
    context: json.hookSpecificOutput ? withoutOrdinal(json.hookSpecificOutput.additionalContext) : undefined,
    systemMessage: json.systemMessage,
  };
}

// Replays the SAME sequence on both engines (separate state dirs) and demands
// IDENTICAL outputs call by call. Returns the outputs (asserts included).
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
    sequence.forEach((payload, i) => {
      const a = run(OLD, payload, envOld);
      const b = run(NEW, payload, envNew);
      expect(b, `call #${i} (${payload.tool_name}): divergent outputs`).toEqual(a);
      outs.push(a);
    });
    return outs;
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

const SID = 'diff-session';
const call = (toolName, toolInput = {}) => ({ tool_name: toolName, tool_input: toolInput, session_id: SID });

const STRIPE_DOC = '⚠️ Never click a real payment button.\n';
const ODOO_DOC = '⚠️ No payment.token stored here.\n';

test('dumb: re-injection on EVERY call, identical content and badge', () => {
  const outs = differential(test, { mode: 'dumb' }, { 'stripe.md': STRIPE_DOC }, [
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
  const outs = differential(test, { mode: 'once' }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__authenticate'),
    call('mcp__stripe__authenticate'),
  ]);
  expect(outs[0]).not.toBeNull();
  expect(outs[1]).toBeNull();
  expect(outs[2]).toBeNull();
});

test('smart threshold 2: re-injection after 2 foreign MCP calls, not before', () => {
  const outs = differential(
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
  const outs = differential(
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
  const outs = differential(
    test,
    { mode: 'dumb', filterMode: 'whitelist', filterList: ['odoo'] },
    { 'stripe.md': STRIPE_DOC },
    [call('mcp__stripe__authenticate')]
  );
  expect(outs[0]).toBeNull();
});

test('server without a doc: silence from both engines', () => {
  const outs = differential(test, { mode: 'dumb' }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__umami__umami_call'),
  ]);
  expect(outs[0]).toBeNull();
});

test('showNotification: false → real injection, badge absent, on both sides', () => {
  const outs = differential(
    test,
    { mode: 'dumb', showNotification: false },
    { 'stripe.md': STRIPE_DOC },
    [call('mcp__stripe__authenticate')]
  );
  expect(outs[0].context).toContain('payment');
  expect(outs[0].systemMessage).toBeUndefined();
});

test('enabled: false → total silence from both engines', () => {
  const outs = differential(test, { mode: 'dumb', enabled: false }, { 'stripe.md': STRIPE_DOC }, [
    call('mcp__stripe__authenticate'),
  ]);
  expect(outs[0]).toBeNull();
});
