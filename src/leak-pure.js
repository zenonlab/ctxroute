// ═══════════════════════════════════════════════════════════════════════
// LEAK-PURE — decides whether a text contains PERSONAL data.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REASON FOR EXISTING: this repo is PUBLIC. Personal data once pushed can
//    no longer be removed — it stays in history, readable with `git log -p`,
//    even after fixing the tree. It HAPPENED here (the maintainer's first name
//    in 2 commits already published on 04/08/2026).
//
// ⚠️ THIS FILE CONTAINS NO PERSONAL DATA, BY CONSTRUCTION. A gate that
//    hard-coded the first name / email to forbid WOULD ITSELF BE THE LEAK. The
//    values therefore come from OUTSIDE: the environment (user name, home
//    folder) and a local GITIGNORED list. NEVER write a string to protect here.
//
// ⚠️ PURE: zero I/O (dependency-cruiser gate `fuite-pure-must-stay-pure`).
//    Reading files lives in the suite that calls it.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// Escapes a literal meant for a regex. ⚠️ MANDATORY: a home folder contains
// `\` and `.` — unescaped, they would turn the value into a WILDCARD matching
// almost everything (a gate screaming wrongly, hence a gate one ends up
// unplugging).
function escapeLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// From the home folder we keep ONLY the last segment (the user folder name).
// ⚠️ NEVER take all segments: `C:/Users/x` would yield "Users", a generic word
// present in ALL the repo's example paths (`C:/Users/dev/...`, the documented
// convention) — the gate would be red permanently, hence unplugged. Measured on
// 04/08/2026: 6 false positives.
function lastSegment(chemin) {
  const parts = String(chemin).split(/[\\/]+/).filter(Boolean);
  return parts.length === 0 ? '' : parts[parts.length - 1];
}

// ⚠️ DOCUMENTATION ranges (RFC 5737) + loopback: LEGITIMATE in a public repo,
//    they are precisely the ones the doctrine requires writing.
const IP_AUTORISEES = /^(203\.0\.113\.|192\.0\.2\.|198\.51\.100\.|127\.|0\.0\.0\.0)/;

// ⚠️ CGNAT block 100.64/10 (Tailscale range): an IP from this block is a REAL
//    machine of the fleet. Never in a public repo.
const IP_CGNAT = /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/;

// ⚠️ `example.` / `test.` are the domains RESERVED for documentation
//    (RFC 2606) — the only admissible emails.
const EMAIL_REEL = /[a-z0-9._%+-]+@(?!example\.|test\.)[a-z0-9.-]+\.[a-z]{2,}/i;

// ⚠️ SYSTEM / CI ACCOUNTS — NEVER an identity, ALWAYS a generic word.
//    On GitHub Actions the account is called `runner`: derived as-is, it
//    matched "test runner", "tap-runner", "commandRunner"… → 13 false
//    positives and a RED CI (measured on 04/08/2026, at the gate's first push).
//    A gate red on healthy code ends up unplugged: these names are therefore
//    RULED OUT. The reverse risk is nil — nobody is called "root" or "runner".
const COMPTES_GENERIQUES = new Set([
  'runner', 'root', 'user', 'users', 'admin', 'administrator', 'build',
  'builder', 'ubuntu', 'vagrant', 'docker', 'jenkins', 'github', 'home',
]);

/**
 * Builds the forbidden patterns FROM THE OUTSIDE.
 * @param {string} utilisateur - OS account name (never hard-coded)
 * @param {string} dossierPerso - the user's home folder
 * @param {string[]} [supplementaires] - terms from a LOCAL gitignored list
 */
function forbiddenPatterns(utilisateur, dossierPerso, supplementaires) {
  const patterns = [
    { name: 'real email', re: EMAIL_REEL },
    { name: 'real machine IP (CGNAT/Tailscale)', re: IP_CGNAT },
  ];
  const litteraux = [];
  if (typeof utilisateur === 'string' && utilisateur.length >= 3) litteraux.push(utilisateur);
  if (typeof dossierPerso === 'string') {
    const d = lastSegment(dossierPerso);
    if (d.length >= 3) litteraux.push(d);
  }
  if (Array.isArray(supplementaires)) {
    for (const t of supplementaires) {
      if (typeof t === 'string' && t.length >= 3) litteraux.push(t);
    }
  }
  // Dedup: the OS account is usually ALSO the home folder name.
  // ⚠️ The generic-account filter applies to literals DERIVED FROM THE
  //    ENVIRONMENT **AND** to declared terms: whatever its origin, "runner"
  //    remains a word, not an identity.
  for (const l of [...new Set(litteraux)].filter((x) => !COMPTES_GENERIQUES.has(x.toLowerCase()))) {
    // ⚠️ WORD BOUNDARIES, NEVER a substring: a short first name is a sub-word
    //    of common words (a short first name ⊂ a common word, measured on
    //    04/08/2026 on 2 files). A gate that screams on healthy code stops
    //    being read — and the day it is right, nobody believes it.
    //    `\b` relies on [A-Za-z0-9_]: an accent counts as a separator, which is
    //    exactly the behaviour wanted here.
    patterns.push({ name: 'personal data: ' + l, re: new RegExp('\\b' + escapeLiteral(l) + '\\b', 'i') });
  }
  return patterns;
}

/**
 * Looks for the patterns in a text. TOTAL: never fails.
 * @returns {{name:string, excerpt:string}[]}
 */
function scan(texte, patterns) {
  if (typeof texte !== 'string') return [];
  if (!Array.isArray(patterns)) return [];
  const hits = [];
  for (const m of patterns) {
    const found = texte.match(m.re);
    // ⚠️ A documentation IP contains "203.0.113.": we do NOT report it.
    //    Without this door, the doctrine ("use 203.0.113.x") would be forbidden
    //    by its own gate.
    if (found && !IP_AUTORISEES.test(found[0])) {
      hits.push({ name: m.name, excerpt: found[0] });
    }
  }
  return hits;
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT COVERAGE — "which client roots exist, and which ones does this gate
// really look at?" (10/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 BORN FROM A REAL LEAK: the list derived ONLY from SEO clients, so a SOCIAL
//    client existed for nobody — their name and email slept in a TRACKED file
//    for ~12 h, gate GREEN.
//
// 🛑 THE DEFECT WAS NOT THE MISSING ROOT, IT WAS THAT IT COULD GO MISSING IN
//    SILENCE. Adding the 2nd root by hand closes nothing: the 3rd would be
//    forgotten just the same. So we DISCOVER the roots, and every discovered
//    root must be DECIDED — derived, or ignored WITH ITS REASON. Closed list +
//    named refusal, never a tolerant heuristic.
//
// ⚠️ PURE: discovery (readdir) belongs to the caller, who passes what it SAW.
//    Here we only confront three sets.
//
// ⚠️ NORMALISED COMPARISON (separators + case): on Windows the same root is
//    written `C:/x/clients` or `C:\x\clients` depending on who writes it — two
//    forms for one folder would make an incomprehensible RED, and an
//    incomprehensible gate ends up unplugged.
function normalizePath(chemin) {
  return String(chemin).replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Roots SEEN on disk that nobody has decided on.
 * @param {string[]} vues - candidate roots discovered by the caller
 * @param {string[]} derivees - roots declared in `derivedFolders`
 * @param {string[]} ignorees - roots KNOWINGLY ruled out (`ignoredRoots`)
 * @returns {string[]} the forgotten ones, in discovery order, deduplicated
 */
function forgottenRoots(vues, derivees, ignorees) {
  if (!Array.isArray(vues)) return [];
  const decided = new Set();
  // ⚠️ EQUIVALENT MUTANTS, disarmed IN A TARGETED WAY (never a broad disable):
  //    Stryker replaces the `[]` fallback with an array holding one string of
  //    its own. But adding an ARBITRARY element to the set of decided roots can
  //    only mask a root if it is EXACTLY equal to it — so no test can tell the
  //    difference, and writing one would freeze an internal Stryker string (it
  //    breaks on version upgrade).
  //    The fallback itself REMAINS tested: "lists absent ⇒ everything comes out".
  // Stryker disable next-line ArrayDeclaration
  for (const r of Array.isArray(derivees) ? derivees : []) decided.add(normalizePath(r));
  // Stryker disable next-line ArrayDeclaration
  for (const r of Array.isArray(ignorees) ? ignorees : []) decided.add(normalizePath(r));
  const out = [];
  const dejaDites = new Set();
  for (const v of vues) {
    const n = normalizePath(v);
    if (decided.has(n) || dejaDites.has(n)) continue;
    dejaDites.add(n);
    out.push(v);
  }
  return out;
}

module.exports = {
  forbiddenPatterns, scan, escapeLiteral, lastSegment, COMPTES_GENERIQUES,
  normalizePath, forgottenRoots,
};
