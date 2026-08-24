// ═══════════════════════════════════════════════════════════════════════
// ORACLE — spawns the REAL protect-files.js and extracts the injected docs.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ SINGLE READER of the oracle's output — extracted on 16/07/2026 so that only
//    ONE reading of it exists. Two parsers = two ways of lying (experienced 3×
//    on 15/07/2026: every improvised oracle wrongly accused the engine).
//    ⚠️ ONE consumer left since 21/08/2026 (`file-differential.test.js`): the
//    second consumer went with the shadow relic, deleted on 21/08/2026. A single
//    consumer is NOT a reason to inline this back — the rule guarded here is
//    "one parser", and it is violated the moment a SECOND caller improvises one.
//
// ⚠️ PARSE THE FORMAT, NEVER IMPROVISE ON TEXT — the 2 traps sealed here:
//    1. some docs contain a HARDCODED `[source: ...]` in their CONTENT (61
//       measured) → we only read the LAST marker of each block;
//    2. the output is JSON (escaped newlines) → we parse the JSON
//       first, we split the `\n\n---\n\n` blocks AFTERWARDS.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { execFile } = require('child_process');

/**
 * @param {string} legacyPath - path of protect-files.js (the REAL prod script)
 * @param {{toolName: string, toolInput: object}} payload
 * @returns {Promise<string[]>} injected docs, IN THE real order of injection
 */
function legacyDocs(legacyPath, payload) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [legacyPath], { encoding: 'utf8' }, (_err, stdout) => {
      let context = '';
      try {
        // Fail-open: no JSON = the hook injected nothing (legitimate case).
        const j = JSON.parse(stdout || '{}');
        context = (j.hookSpecificOutput && j.hookSpecificOutput.additionalContext) || '';
      } catch (e) {
        context = '';
      }
      const docs = [];
      for (const block of context.split('\n\n---\n\n')) {
        const markers = [...block.matchAll(/\[source: \.claude\/hooks\/([^\]]+)\]/g)];
        if (markers.length) docs.push(markers[markers.length - 1][1]);
      }
      resolve(docs);
    });
    child.stdin.end(JSON.stringify({ tool_name: payload.toolName, tool_input: payload.toolInput }));
  });
}

module.exports = { legacyDocs };
