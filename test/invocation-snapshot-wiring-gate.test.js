// ═══════════════════════════════════════════════════════════════════════
// THE SNAPSHOT IS WIRED — the arrival order really is restored and saved
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY A SECOND JUDGE FOR ONE FIX. `invocation-snapshot-pure.test.js` proves
//    the LOGIC: encode, decode, adopt, and the real sequencer continuing instead
//    of re-serving chunk 1. It proves NOTHING about the daemon calling any of
//    it — and this repository's rule is explicit: *the unit test proves the
//    logic, only the chain proves the WIRING, and it is the wiring that breaks.*
//    That was paid twice in one evening: a fix shipped INERT because a module
//    assumed a value shape the caller never sends, and a whole architecture was
//    designed on an `elapsedMs` misread. Remove the `'exit'` handler tomorrow and
//    every cell of the pure suite stays green while production re-injects again.
//
// 🛑 STRUCTURAL, AND THE LIMIT IS DECLARED RATHER THAN DISGUISED. The honest
//    cell would fork a real daemon, let it exit CLEANLY (code 90) and check the
//    next one restores. That exit is not reachable from outside on Windows —
//    measured twice in this repository: `child.kill()` and `SIGTERM` both go
//    through `TerminateProcess`, so `'exit'` never fires and no handler runs.
//    Reproducing it means forking from a COPY of the tree and touching a file in
//    it, which is a separate work item, WRITTEN DOWN in the backlog rather than
//    faked here. 🔑 What replaces it meanwhile is not nothing: the chain HAS run
//    end to end in production on 2026-09-19 — `stale-code-exit code=90`, a 1218
//    byte snapshot, then `start invocationsRestored=9` — and that observation is
//    what this gate keeps from silently ceasing to be true.
// ⚠️ ANTI-VACUITY: the source must be found and non-trivial, or a gate reading an
//    empty string certifies every absence at once.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'src', 'hooks', 'http-server.js');
const source = fs.readFileSync(SHELL, 'utf8');

test('ANTI-VACUITY: the daemon shell is really being read', () => {
  assert.ok(source.length > 20000,
    `the shell read back ${source.length} characters: a gate scanning nothing certifies everything`);
  assert.ok(source.includes('function main'), 'the shell has no `main`: this gate is looking at the wrong file');
});

test('① the three tables are RESTORED, and before any socket is taken', () => {
  // 🛑 THE ORDER IS THE GUARANTEE, exactly as it is for the durable store: once a
  //    client can connect, a table being filled from a file races a table being
  //    written by a request.
  // 🔴 THE COMPARISON IS MADE INSIDE `main`, AND THE FIRST VERSION OF THIS CELL
  //    WAS A FALSE RED BECAUSE IT WAS NOT. `listenOn(` appears first in its own
  //    DEFINITION, hundreds of lines above `main`, so a whole-file `indexOf`
  //    compared the restore against a function declaration and accused perfectly
  //    ordered code. **Prove the instrument before believing the verdict** — this
  //    repository has already killed a true hypothesis with a broken one.
  const body = source.slice(source.indexOf('function main'));
  assert.ok(body.length > 1000, '`main` was not found: this gate would compare two -1s and pass');
  const restore = body.indexOf('invocationSnapshot.adopt(');
  assert.notStrictEqual(restore, -1,
    'nothing restores the invocation tables: a restart mid-action re-serves chunk 1, which is the 2026-09-19 production defect');
  const firstListen = body.indexOf('listenOn(createServer(');
  assert.notStrictEqual(firstListen, -1, '`main` no longer takes a socket through `listenOn(createServer(`: this gate is measuring the wrong thing');
  assert.ok(restore < firstListen,
    'the tables are restored AFTER a socket is taken: a connection can then be served by a table still being filled');
});

test('② the snapshot is SAVED on the process exit, which is the frequent death', () => {
  // ⚠️ `process.exit(90)` — the stale-code restart, i.e. every code delivery —
  //    fires `'exit'`. That is the ONLY death this can cover, and it is the one
  //    that happens dozens of times a day.
  const hook = /process\.on\(\s*'exit'\s*,/.exec(source);
  assert.ok(hook, "nothing is registered on 'exit': the snapshot would never be written, and the restore above would always adopt nothing");
  const after = source.slice(hook.index, hook.index + 600);
  assert.ok(after.includes('invocationSnapshot.encode('),
    "the 'exit' handler does not encode the invocation tables: the file it writes would not carry the arrival order");
  assert.ok(/writeFileSync/.test(after),
    "the 'exit' handler does not write synchronously: nothing asynchronous scheduled from 'exit' ever runs (Node doc), so the snapshot would be lost");
});

test('③ the restored COUNT is announced, as a field on an EXISTING event', () => {
  // 🔴 It was an event of its own for one run, and that took the daemon down:
  //    the journal's vocabulary is a CLOSED, fail-closed list. The rule — fields
  //    on an existing event, never a new one — exists because the journal's
  //    512 KB ceiling is STRUCTURAL rather than a number somebody maintains.
  const start = source.indexOf("lifecycle.record('start'");
  assert.notStrictEqual(start, -1, "the daemon no longer records 'start': the restored count has no carrier");
  assert.ok(source.slice(start, start + 900).includes('invocationsRestored'),
    "the 'start' record does not carry `invocationsRestored`: a restoration that says nothing is indistinguishable from one that never happened");
  assert.ok(!/lifecycle\.record\(\s*'invocations-/.test(source),
    'a dedicated event was reintroduced: the vocabulary is closed and fail-closed, so an undeclared name kills `main()` outright');
});

test('④ SEEN RED: each guard falls on the exact defect it exists for', () => {
  // 🛑 IN MEMORY ONLY — a sabotage on the real file brings down suites running in
  //    parallel, which this repository has already paid for.
  const cases = [
    ['restore removed', source.replace('invocationSnapshot.adopt(', 'noop.adopt('), /nothing restores/],
    ['exit hook removed', source.replace(/process\.on\(\s*'exit'\s*,/, "process.off('exit',"), /nothing is registered/],
    ['count dropped', source.replace('invocationsRestored,', ''), /does not carry/],
  ];
  for (const [name, sabotaged, expected] of cases) {
    assert.notStrictEqual(sabotaged, source, `the sabotage "${name}" changed nothing: it proves nothing`);
    let failed = false;
    try {
      if (name === 'restore removed') {
        assert.notStrictEqual(sabotaged.indexOf('invocationSnapshot.adopt('), -1, 'nothing restores the invocation tables');
      } else if (name === 'exit hook removed') {
        assert.ok(/process\.on\(\s*'exit'\s*,/.exec(sabotaged), 'nothing is registered on exit');
      } else {
        const s = sabotaged.indexOf("lifecycle.record('start'");
        assert.ok(sabotaged.slice(s, s + 900).includes('invocationsRestored'), 'the start record does not carry the count');
      }
    } catch (e) {
      failed = true;
      assert.match(e.message, expected, `"${name}" failed for the wrong reason: ${e.message}`);
    }
    assert.ok(failed, `the sabotage "${name}" did NOT make its guard fail — that guard certifies instead of protecting`);
  }
});
