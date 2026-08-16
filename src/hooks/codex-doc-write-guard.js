#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CODEX SHELL — PostToolUse: write guard for the docs of the fleet.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ALL the body lives in guard-core.js (single source, shared with
//    doc-write-guard.js/Claude Code). This file = ONLY the extraction
//    of the paths in the Codex dialect.
//
// ⚠️ CODEX DIALECT (official documentation re-read on 19/07/2026): the write goes
//    through `apply_patch`, paths INSIDE the text of the patch (tool_input.command).
//    The extraction is DELEGATED to sources/file.js#extractFilePaths — the SAME
//    parser (pure, mutated by Stryker) as the injection match: a patch that
//    matches on the way in is guaranteed to be guarded on the way out, by construction.
//    A multi-file patch = all the paths validated (guard-core).
//
// ⚠️ The `decision: "block"` output = common measured dialect (cf guard-core).
// ⚠️ Full FAIL-OPEN; deadline armed BEFORE any I/O.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

require('../deadline').arm();

const { run } = require('../guard-core');
const { extractFilePaths } = require('../sources/file');
const { readStdinJson } = require('../stdin-json');

readStdinJson(
  (data) => {
    // ⚠️ THE OUTPUT BELONGS TO THE SHELL (06/08/2026, cf guard-core): the
    //    core RETURNS a verdict (`null` = nothing to report). The JSON is composed
    //    by the core (`blockOutput`) because the `decision: block` dialect is
    //    MEASURED identical on both harnesses — but it is EMITTED here.
    const verdict = run(extractFilePaths(data.tool_name || '', data.tool_input || {}));
    if (verdict) console.log(JSON.stringify(verdict));
    process.exit(0);
  },
  () => process.exit(0)
);
