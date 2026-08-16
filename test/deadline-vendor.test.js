// ═══════════════════════════════════════════════════════════════════════
// DRIFT-TEST — the vendored copy of deadline.js must NEVER diverge
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY A COPY RATHER THAN A require():
//    The hooks of `~/.claude/hooks/` MUST NOT depend on this repo.
//    A `require('C:/Users/dev/Desktop/ctxroute/deadline.js')` would work
//    today and would die the day the directory moves/disappears — the personal
//    environment would become a HOSTAGE of a public repo. `deadline.js` is standalone
//    (gate `deadline-stays-standalone`) EXACTLY FOR THAT: it is copyable as is.
//
// ⚠️ BUT A COPY DRIFTS — that is enemy #1 (a shared truth duplicated without
//    a link in the code). The copy is only acceptable BECAUSE this test exists.
//    Deleting it turns a controlled vendoring into silent debt:
//    fixing a bug in the original would no longer fix the 7 hooks, and NOTHING
//    would say so. NEVER delete it "because it gets in the way".
//
// ⚠️ SKIP ON A FRESH CLONE — the repo is PUBLIC: it MUST never require
//    the existence of `~/.claude/hooks/`. This test only screams where BOTH
//    copies exist, i.e. at the maintainer's. A repo gate must hold on a
//    fresh clone (lesson of 15/07/2026, cf gitignore.md).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ORIGINAL = path.join(__dirname, '..', 'src', 'deadline.js');
const VENDOR = path.join(os.homedir(), '.claude', 'hooks', 'deadline.js');

const vendored = fs.existsSync(VENDOR);

test(
  'the vendored copy of deadline.js is IDENTICAL to the original',
  { skip: !vendored && 'no vendored copy (fresh clone / other machine)', timeout: 300000 },
  () => {
    // ⚠️ Comparison on the NORMALIZED content (line endings): git can convert
    //    LF↔CRLF at checkout (.gitattributes), which would turn the test red for
    //    a reason that is NOT a drift. We compare the code, not the bytes.
    const norm = (s) => s.replace(/\r\n/g, '\n');
    const a = norm(fs.readFileSync(ORIGINAL, 'utf8'));
    const b = norm(fs.readFileSync(VENDOR, 'utf8'));

    assert.strictEqual(
      b,
      a,
      'DRIFT: ~/.claude/hooks/deadline.js ≠ ctxroute/deadline.js.\n' +
        'The 7 hooks of the fleet therefore run on a different version from the one tested here.\n' +
        'Fix by copying the original again:\n' +
        `  cp "${ORIGINAL}" "${VENDOR}"`
    );
  }
);
