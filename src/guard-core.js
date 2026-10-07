// ═══════════════════════════════════════════════════════════════════════
// WRITE GUARD CORE — COMMON PostToolUse body (single source).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ EXTRACTED from doc-write-guard.js on 19/07/2026 (Codex port): classifying
//    the written file (which corpus of the fleet?) + validating it is IDENTICAL
//    on all harnesses. ONLY the extraction of the paths from tool_input varies
//    (Claude: file_path directly · Codex: paths INSIDE the apply_patch patch) —
//    it stays in the shells.
//
// ⚠️ The VALIDATION is DELEGATED to frontmatter.js (validate / validateMcp) —
//    the only authority, never re-judged here (2 pieces of code for 1 judgement
//    = drift). Session docs: nothing to validate by construction (every .md is
//    injected).
//
// ⚠️ The `decision: "block"` output + reason = COMMON dialect MEASURED (Claude
//    Code + Codex CLI ≥ 0.144, official documentation re-read on 19/07/2026) —
//    if a future harness diverges, its emit will become a parameter, never an
//    if here.
//
// ⚠️ Full FAIL-OPEN: file unreadable/deleted/outside the fleet → silence.
//    A hook NEVER blocks the work because of its own breakdown.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const { parse, validate, validateMcp, validateSession } = require('./frontmatter');
const paths = require('./paths');
// ⚠️ The journal writer: a failure this module survives is SAID there (fail-open).
const log = require('./log');

const norm = (s) => String(s).replace(/\\/g, '/').toLowerCase();

// Classifies the written file: which corpus of the fleet? (null = not a managed doc)
function docKind(filePath) {
  const p = norm(filePath);
  if (!p.endsWith('.md')) return null;
  if (p.startsWith(norm(paths.docsDir()) + '/')) return 'mcp';
  if (p.startsWith(norm(paths.sessionDocsDir()) + '/')) return 'session';
  if (p.startsWith(norm(paths.fileDocsDir()) + '/')) return 'file';
  return null;
}

// Validates each candidate path and RETURNS A VERDICT at the FIRST broken one.
// Nothing broken (or nothing of the fleet touched) → returns `null`, the shell
// keeps silent.
//
// ⚠️ THE CORE WRITES NEITHER TO STDOUT NOR TO THE PROCESS (06/08/2026). It
//    used to call `console.log` + `process.exit`: two layer leaks of the
//    SAME family as ⑯ — writing the output and deciding to die belong
//    to the SHELL, the only one that knows the harness dialect. Found by the
//    capability scan (ast-grep), not by eye: it was the 3rd instance.
// ⚠️ The `decision: block` JSON remains a COMMON dialect measured on both
//    harnesses: it is composed here (`blockOutput`) but EMITTED by the shell.
//    The day a harness diverges, it composes its own — never a harness `if` here.
function blockOutput(errs, filePath) {
  return {
    decision: 'block',
    reason: '[ctxroute] The doc you have just written is INVALID — it would be dead/false in silence. Fix it NOW:\n- '
      + errs.join('\n- ') + '\nFile: ' + filePath,
  };
}

function run(filePaths) {
  try {
    for (const filePath of filePaths) {
      const kind = docKind(filePath);
      if (kind === null) continue;

      let errs;
      try {
        const { data: fm } = parse(fs.readFileSync(filePath, 'utf8'));
        // ⚠️ ONE VALIDATOR PER CORPUS, chosen by the folder (the folder IS the trigger). A
        //    session doc was skipped here until 2026-10-07: it had no key worth checking. It
        //    now carries `category`, and an unchecked restriction is a doc muted in silence.
        const judge = { mcp: validateMcp, session: validateSession, file: validate }[kind];
        errs = judge(fm);
      } catch {
        continue; // unreadable/deleted file = fail-open on THIS path
      }
      if (errs.length === 0) continue;

      // ⚠️ We RETURN at the first broken one — `return` and not `break`: one
      //    single verdict per hook, the following paths are not examined.
      return blockOutput(errs, filePath);
    }
  } catch (err) {
    log.hookError('guard-core', err); /* fail-open */
  }
  // ⚠️ `null` = nothing to report. Do NOT put back `console.log` nor
  //    `process.exit(0)` here: writing the output and deciding to die are
  //    SHELL decisions, never those of a shared core (sealed by
  //    `emission-core-gate.test.js`). This core had the same defect as
  //    porte-core — found by the DERIVED gate, not by eye.
}

module.exports = { run, docKind, blockOutput };
