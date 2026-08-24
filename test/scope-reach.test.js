// ═══════════════════════════════════════════════════════════════════════
// scope-reach.js — contract of the instrument that settled work item 59
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THIS SUITE EXISTS BECAUSE THE FIRST TWO VERSIONS OF THE MEASUREMENT WERE BOTH
//    WRONG, IN OPPOSITE DIRECTIONS (2026-08-20):
//    ① a HAND-WRITTEN list of tool names — the enumeration-born-stale defect (㊽)
//      committed inside the very tool meant to expose it. It happened to give the
//      right answer, WHICH IS WORSE: a lucky probe teaches nothing.
//    ② a derivation matching every `"name":` field — 121 "tool names" and **343**
//      collisions, because SKILL and AGENT names live under the same key. It would
//      have condemned 343 innocent rules.
//    ⇒ The anchor `"type":"tool_use"` is the load-bearing part, and these tests are
//      what keeps it anchored.
// ⚠️ TRI-STATE IS THE OTHER HALF: "no corpus" and "corpus whose shape changed" must
//    both answer NOT MEASURED. A `0` there would read as "nothing collides".
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observedToolNames } from '../tools/scope-reach.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-reach-'));

// ⚠️ The `patterns` / `norm` / `collides` cases MOVED to `scope-reach-pure.test.js` when the
//    decision was extracted from this shell (2026-08-20). They are NOT deleted — a suite that
//    tests a shell must test the SHELL: disk walk and tri-state. Keeping a copy here would be
//    a twin, and a twin only proves that a copy agrees with itself.

test('NOT MEASURED — absent corpus answers null, never an empty set', () => {
  assert.strictEqual(observedToolNames(path.join(tmp(), 'nowhere')), null);
});

test('NOT MEASURED — files read but SHAPE changed answers null, never 0', () => {
  // 🛑 The failure this guards: the harness renames its transcript fields, the
  //    derivation silently finds nothing, and the tool reports "0 collisions" —
  //    read by a human as "the widening is free".
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.jsonl'), '{"type":"text","name":"Bash"}\n');
  assert.strictEqual(observedToolNames(d), null);
});

test('ANCHORED — a tool call is counted, a skill or agent name is NOT', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.jsonl'),
    '{"type":"tool_use","id":"x","name":"Bash","input":{}}\n'
    + '{"type":"tool_use","id":"y","name":"mcp__ssh__ssh_exec","input":{}}\n'
    // The exact shapes that produced the 343 false collisions: a skill and an
    // agent, both carrying a `name` OUTSIDE a tool_use entry.
    + '{"type":"skill","name":"ctxroute"}\n'
    + '{"type":"agent","name":"design-engine"}\n');
  const r = observedToolNames(d);
  assert.deepStrictEqual([...r.itemNames].sort(), ['Bash', 'mcp__ssh__ssh_exec']);
  assert.strictEqual(r.files, 1);
});

test('the scan really walks sub-directories (the corpus is one folder per project)', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'projet'));
  fs.writeFileSync(path.join(d, 'projet', 'a.jsonl'),
    '{"type":"tool_use","id":"x","name":"Read","input":{}}\n');
  assert.deepStrictEqual([...observedToolNames(d).itemNames], ['Read']);
});
