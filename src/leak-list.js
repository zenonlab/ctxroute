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
const path = require('path');
const paths = require('./paths');

// The private list's FILE NAME, and nothing above it: the harness SECRET ROOT
// belongs to `paths.js` (`secretsDir`/`secretsLabel`), like every other
// home-anchored root.
// ⚠️ UNTIL 22/08/2026 THIS MODULE REBUILT `~/.claude/secrets` ITSELF from
//    `os.homedir()` — the very defect `fleet-hooks-path.test.js` judges, on a
//    different second segment, and it was KNOWN: a note beside the registry
//    declared the omission deliberate. It was a SECOND DEFINITION either way,
//    and the copy that rots is never the one you are looking at.
const LIST_FILE = 'ctxroute-fuite.json';

// ABSOLUTE — the address used to REACH the disk. Env var RESERVED for tests.
// ⚠️ IT OVERRIDES THE WHOLE FILE PATH, not the root: a test corpus lives in a
//    tmpdir with a name of its own choosing. `CTXROUTE_SECRETS_DIR` (paths.js)
//    moves the ROOT and leaves the file name alone — two different questions,
//    both answerable, neither one guessing at the other.
function privateListPath() {
  return process.env.CTXROUTE_LEAK_LIST || path.join(paths.secretsDir(), LIST_FILE);
}

// PUBLISHED — relative, POSIX, home-free, override-proof. This is the ONLY form
// that may reach a reader: a failure message, a doc, anything tracked.
// 🛑 NEVER print `privateListPath()` into an artefact that survives the command
//    (a tracked file, a doc, an injected context, a CI log people keep): it
//    carries the maintainer's real home AND names their secret store, and this
//    repository is PUBLIC and treats itself as already public. Whoever needs to
//    SAY where the list goes says it with THIS.
function privateListLabel() {
  return paths.secretsLabel() + '/' + LIST_FILE;
}

/**
 * Private terms = DECLARED + DERIVED from the real folders, MINUS the exceptions.
 * File missing/unreadable ⇒ [] (generic mode, never a failure).
 * ⚠️ THE SILENCE HERE IS THE ONE DELIBERATE EXCEPTION TO "AN UNREACHABLE TARGET
 *    IS A NAMED REFUSAL", and it is not a fallback: the gate MUST stay green on
 *    a clean clone and in CI, where private terms cannot travel by
 *    construction. Nothing is guessed — ONE address is resolved and, absent,
 *    yields an EMPTY universe, never a plausible substitute. The NAMING lives
 *    where a human can act on it: the cells that DEMAND the file print
 *    `privateListLabel()` and say what resolved it.
 * @returns {string[]}
 */
function privateTerms() {
  let decl;
  try {
    decl = JSON.parse(fs.readFileSync(privateListPath(), 'utf8'));
  } catch {
    return [];
  }
  const terms = Array.isArray(decl.terms) ? [...decl.terms] : [];
  for (const src of Array.isArray(decl.derivedFolders) ? decl.derivedFolders : []) {
    try {
      for (const e of fs.readdirSync(src.root, { withFileTypes: true })) {
        if (e.isDirectory() && fs.existsSync(path.join(src.root, e.name, src.marker))) {
          terms.push(e.name);
        }
      }
    } catch { /* source absent on this machine: we invent nothing */ }
  }
  const exceptions = (Array.isArray(decl.exceptions) ? decl.exceptions : []).map((t) => String(t).toLowerCase());
  return terms.filter((t) => !exceptions.includes(String(t).toLowerCase()));
}

module.exports = { privateListPath, privateListLabel, privateTerms };
