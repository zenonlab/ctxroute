// ═══════════════════════════════════════════════════════════════════════
// GATE — NO file under state/ is tracked by git.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ Born of a REAL incident (16/07/2026): `state/*.json` did not cover
//    `.jsonl` → the SHADOW journal (real payloads: paths, commands from the
//    maintainer's sessions) went to GitHub in a commit. `state/` = runtime,
//    PRIVATE, never committable — whatever format a future hook writes there.
//    A per-extension pattern will break again at the next format; this gate
//    will not.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY BEFORE SPAWNING `git`. Git EXPORTS
//    `GIT_DIR`/`GIT_INDEX_FILE` to every hook it runs, a child INHERITS them,
//    and they BEAT `cwd` — measured 2026-08-21: a `git` aimed elsewhere acted
//    on the REAL repository. Under a poisoned env this gate would judge
//    somebody else's index and answer GREEN about a repo it never read.
//    Never "unset the right one": nobody can enumerate what a future git
//    version exports. Sealed repo-wide by `git-env-door-gate.test.js`.
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

test('GATE: git tracks NO file under state/', () => {
  const out = execFileSync('git', ['ls-files', 'state/'], { cwd: path.join(__dirname, '..'), env: ENV_WITHOUT_GIT, encoding: 'utf8' }).trim();
  assert.strictEqual(out, '', `state/ files TRACKED (private runtime data → GitHub):\n${out}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL DOCS — the 3 MCP LEVELS are ignored, not only the first
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 REAL LEAK HOLE (06/08/2026, PUBLIC repo): `docs/mcp/*.md` only covered
//    level 1 (server). Levels 2 and 3 — `docs/mcp/{server}/{tool}.md` and
//    `{subTool}.md` — were NOT ignored, although they are the most SPECIFIC
//    docs, hence the most likely to name a client, an amount, an identifier.
//    Found while creating the first level-2 docs: `git status` was offering
//    them for commit.
// ⚠️ The hole had existed ever since the 3-level granularity existed — nobody
//    had seen it because nobody had yet written a level-2 doc. A dormant
//    error class is not an absent error class.
// ⚠️ TESTS THE RULE, NOT THE FILES: `git check-ignore` judges FICTIONAL
//    paths, so this gate holds on a FRESH CLONE (where no personal doc
//    exists). Requiring a file to be present would be green at its author's
//    and false everywhere else — the mistake already made on 15/07/2026 by
//    config-gate.

function estIgnore(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: path.join(__dirname, '..'), env: ENV_WITHOUT_GIT });
    return true;
  } catch {
    return false; // exit 1 = not ignored
  }
}

test('GATE: the 3 LEVELS of personal MCP docs are ignored', () => {
  const doivent = [
    'docs/mcp/stripe.md',                       // level 1 — server
    'docs/mcp/stripe/create_refund.md',         // level 2 — tool
    'docs/mcp/odoo/delete_record.md',           // level 3 — sub-tool
    'docs/session/outils.md',                   // session knowledge, personal too
  ];
  const fuites = doivent.filter((r) => !estIgnore(r));
  assert.deepStrictEqual(fuites, [],
    'PATHS NOT IGNORED on a PUBLIC repository:\n  ' + fuites.join('\n  ')
    + '\nThese docs carry client names, amounts, identifiers.'
    + '\nFix .gitignore (`**` covers the subfolders), never work around it.');
});

test('GATE: the GENERIC `.md.example` files stay pushable (all 3 levels)', () => {
  // ⚠️ MANDATORY COUNTERPART: a `.gitignore` that is too broad would kill the
  //    public examples, hence the project's installation documentation.
  //    Without this part, "ignore everything" would pass as a valid fix.
  const doiventPasser = [
    'docs/mcp/stripe.md.example',
    'docs/mcp/stripe/create_refund.md.example',
    'docs/session/outils.md.example',
  ];
  const perdus = doiventPasser.filter(estIgnore);
  assert.deepStrictEqual(perdus, [],
    'PUBLIC examples turned invisible: ' + perdus.join(', '));
});
