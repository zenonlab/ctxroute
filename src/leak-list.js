// ═══════════════════════════════════════════════════════════════════════
// PRIVATE ANTI-LEAK LIST — SINGLE SOURCE of "which terms to protect?".
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ASSUMED I/O SHELL (fs), never mutated: the MATCHING logic lives in
//    leak-pure.js. This module only BUILDS the list of terms.
// ⚠️ BORN FROM A REAL TWIN (16/08/2026): `privateTerms()` lived in
//    leak-gate.test.js, then was COPIED into the pre-commit launchers of
//    discord-mcp and publer-mcp — three copies the same day.
//    An external consumer MUST require THIS file, never copy it.
// ⚠️ NO PERSONAL DATA HERE, BY CONSTRUCTION: everything comes from
//    `~/.claude/secrets/ctxroute-fuite.json` (outside the repo) + the real
//    folders.
// ⚠️ `exceptions` (16/08/2026, maintainer decision ㊸): terms that DERIVATION
//    produces but which are NOT personal data — real case: the agency's BRAND
//    has a client folder (its own site), so it was derived and the gate went
//    red on healthy content in the public repos that legitimately mention it.
//    Case-insensitive comparison.
//    🛑 An exception removes a protection: NEVER put a client in it.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function privateListPath() {
  return process.env.CTXROUTE_LEAK_LIST || path.join(os.homedir(), '.claude', 'secrets', 'ctxroute-fuite.json');
}

/**
 * Private terms = DECLARED + DERIVED from the real folders, MINUS the exceptions.
 * File missing/unreadable ⇒ [] (generic mode, never a failure).
 */
function privateTerms() {
  let decl;
  try {
    decl = JSON.parse(fs.readFileSync(privateListPath(), 'utf8'));
  } catch {
    return [];
  }
  const termes = Array.isArray(decl.termes) ? [...decl.termes] : [];
  for (const src of Array.isArray(decl.derivedFolders) ? decl.derivedFolders : []) {
    try {
      for (const e of fs.readdirSync(src.racine, { withFileTypes: true })) {
        if (e.isDirectory() && fs.existsSync(path.join(src.racine, e.name, src.marker))) {
          termes.push(e.name);
        }
      }
    } catch { /* source absent on this machine: we invent nothing */ }
  }
  const exceptions = (Array.isArray(decl.exceptions) ? decl.exceptions : []).map((t) => String(t).toLowerCase());
  return termes.filter((t) => !exceptions.includes(String(t).toLowerCase()));
}

module.exports = { privateListPath, privateTerms };
