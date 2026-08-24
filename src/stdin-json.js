#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// Reads stdin → JSON, Claude Code hooks format. Boilerplate shared by
// ALL the hooks (legacy-mcp-inject.js, ctxroute-reset.js) — extracted here after
// duplication was detected by jscpd (implicit coupling: the same code copied
// into 2 files = the same contract modified in 2 places if the format changes).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Reads stdin in full, parses it as JSON, calls onData(parsed). If the JSON is
// invalid, calls onError() (fail-open: each hook decides its own
// error behavior, typically process.exit(0)).
function readStdinJson(onData, onError) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (input += c));
  process.stdin.on('end', () => {
    try {
      onData(JSON.parse(input));
    } catch (e) {
      if (onError) onError(e);
    }
  });
}

module.exports = { readStdinJson };
