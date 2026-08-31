// ═══════════════════════════════════════════════════════════════════════
// WORKFLOW ENCODING GATE — a byte-order mark makes GitHub REFUSE a workflow
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 REASON FOR EXISTING, MEASURED 2026-08-31: `.github/workflows/mutation.yml`
//    began with `EF BB BF` (a UTF-8 BOM). GitHub answered *"This run likely
//    failed because of a workflow file issue"*, the run lasted 0 s, and it was
//    listed under its FILE PATH instead of its `name:` — because the parser
//    never reached the `name:` key. **The mutation workflow therefore did not
//    run at all**, and nothing said so: the repository's own per-file mutation
//    floor was enforced by NOBODY in CI while every local report still looked
//    normal. That is this repository's worst defect class — not a red gate, a
//    gate that is not there at all.
//
// ⚠️ WHY A BOM APPEARS BY ACCIDENT AND WILL APPEAR AGAIN: on Windows,
//    PowerShell 5.1's `Out-File`/`>` and several editors write UTF-8 WITH a BOM
//    by default. The character is INVISIBLE in every diff and every editor, so
//    review cannot catch it — only a machine reading the bytes can.
//    🛑 Do NOT "solve" this with a convention or a note: it was already
//    invisible to a careful reader, which is exactly why it shipped.
//
// ⚠️ SCOPE, DERIVED FROM DISK, NEVER A LIST: every `.yml`/`.yaml` under the
//    ROOT `.github/workflows/` — a workflow added tomorrow enters this net by
//    itself. GitHub reads only that directory, so nothing else is in scope.
//
// ⚠️ NOT A STYLE RULE. It asserts one fact with one consequence: a BOM here
//    means the workflow DOES NOT RUN. It says nothing about encoding elsewhere
//    — a `.ps1` under `service/` legitimately REQUIRES a BOM for PowerShell 5.1
//    to parse it at all, the exact opposite rule, and widening this gate would
//    break that.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = path.resolve(HERE, '..', '.github', 'workflows');

/** @returns {string[]} absolute paths of every workflow file GitHub will read */
function workflowFiles() {
  if (!fs.existsSync(WORKFLOWS)) return [];
  // ⚠️ ONE TRAVERSAL PER STATEMENT, never a chain. A chained
  //    `a.filter(f).map(g)` reads as a NESTED traversal to
  //    `rules/no-undeclared-quadratic.yml` — the receiver is a descendant of
  //    the outer call — and a file absent from `quadratic-budget.json` is held
  //    at ZERO by design. Each step below walks the SAME bounded collection
  //    (this repository's workflow directory), so the cost is linear and there
  //    is nothing to declare.
  const entries = fs.readdirSync(WORKFLOWS);
  const named = [];
  for (const f of entries) {
    if (f.endsWith('.yml') || f.endsWith('.yaml')) named.push(f);
  }
  named.sort();
  const out = [];
  for (const f of named) out.push(path.join(WORKFLOWS, f));
  return out;
}

test('no workflow starts with a byte-order mark — GitHub refuses the file', () => {
  const files = workflowFiles();

  // ⚠️ ANTI-VACUITY, LOAD-BEARING: a directory that stopped resolving looks
  //    EXACTLY like a repository whose workflows are all clean. This gate must
  //    fail loudly rather than certify nothing — the same floor every other
  //    derived gate here carries.
  assert.ok(files.length > 0,
    `anti-vacuity: no workflow found under ${WORKFLOWS} — the gate measured NOTHING, `
    + 'which is not the same as "every workflow is clean"');

  const withBom = [];
  for (const file of files) {
    const head = Buffer.alloc(3);
    const fd = fs.openSync(file, 'r');
    let read = 0;
    try {
      read = fs.readSync(fd, head, 0, 3, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (read === 3 && head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF) {
      withBom.push(path.basename(file));
    }
  }

  assert.deepStrictEqual(withBom, [],
    'these workflow files start with a UTF-8 BOM (EF BB BF), so GitHub refuses to parse them '
    + 'and the workflow NEVER RUNS — the run fails in 0 s and is listed under its file path '
    + `instead of its name:\n  ${withBom.join('\n  ')}\n`
    + '⇒ strip the first three bytes. Measured 2026-08-31 on mutation.yml, where it had '
    + 'silently disabled the entire mutation job in CI.');
});
