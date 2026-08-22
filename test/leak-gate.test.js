// ⚠️ WHAT THIS GATE PROTECTS: this repo is PUBLIC. Personal data once pushed
//    CAN NO LONGER BE REMOVED — it survives in `git log -p`, even after fixing
//    the tree. Observed on 04/08/2026: 5 fresh leaks in tracked files (fixed by
//    hand, WITHOUT a net), and the user config become tracked because a codemod
//    had missed `.gitignore`.
//    ⇒ The net is this file. An unsealed class of error COMES BACK.
//
// ⚠️ NO PERSONAL DATA HERE, BY CONSTRUCTION. A gate hard-coding the first name
//    or the clients to protect WOULD ITSELF BE THE LEAK. Everything comes from
//    OUTSIDE: the environment, and a private file outside the repo. NEVER write
//    a string to protect here.
//
// ⚠️ MUST STAY GREEN ON A FRESH CLONE (rule `gitignore.md`): without the
//    private file, the gate runs in GENERIC mode — it protects less, but it
//    does not lie and it breaks nobody's CI.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { forbiddenPatterns, scan, escapeLiteral, lastSegment, forgottenRoots, normalizePath } from '../src/leak-pure.js';

// 🔴 THE ROOT IS MEASURED, NOT SUPPOSED — and getting it wrong made this gate scan a QUARTER
//    of the repository for weeks. `path.dirname(import.meta.url)` is the `test/` FOLDER, and
//    `git ls-files` run from there lists only what is under it: **86 files instead of 229**.
//    The repo's ONLY blocking gate, born from a real leak, was blind to `src/`, to the root and
//    to `docs/` — and its anti-vacuity floor (">50 tracked files") passed comfortably on the 86,
//    so nothing ever screamed. A gate that measures a subset is indistinguishable from one that
//    measures everything: that is the green-that-sees-nothing this repo calls its worst defect.
// 🛑 MEASURED BY THE AUTHORITY THAT KNOWS (`git rev-parse --show-toplevel`), never by counting
//    `..`: a supposed relative path is already a bug, and this file is proof.
// 🔴 `cwd` DOES NOT ISOLATE A `git` CHILD, AND THIS SUITE RUNS INSIDE A GIT HOOK.
//    Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends to every hook it runs,
//    and `.githooks/pre-commit` runs THIS FILE. Those variables are INHERITED by
//    any child and they WIN over the working directory — so a `git` call aimed at
//    a sandbox reached the REAL repository instead. MEASURED 2026-08-21: the
//    negative-check staged its trap file into this repo's own index, the file
//    reached a commit, and three `--amend` in a row could not remove it (each
//    commit re-ran the hook, which re-ran this test, which re-staged the file).
// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY, never "unset the right one": nobody can
//    enumerate what a future git version will export. It is the same law the
//    state backend already carries — **an environment variable is INHERITED, so
//    it is never a local choice** — and it is what makes `cwd` mean what it says.
// ⚠️ ONE DOOR FOR EVERY `git` OF THIS SUITE. Scrubbing only the sandbox call was
//    tried first and measured INSUFFICIENT: under a poisoned environment two
//    OTHER cells still failed, because `git ls-files` was inheriting it too.
const ENV_SANS_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

function git(args, cwd) {
  return execFileSync('git', args, { cwd, env: ENV_SANS_GIT, encoding: 'utf8' });
}

const ICI = git(['rev-parse', '--show-toplevel'], path.dirname(fileURLToPath(import.meta.url))).trim();

// ⚠️ OUTSIDE THE REPO, by necessity: the private terms (first name, accounts)
//    cannot travel in a public artefact — and BUILDING the list lives in
//    `leak-list.js` (SINGLE SOURCE since 16/08/2026): it was copied into the
//    pre-commit launchers of 2 public repos, three copies of one truth. NEVER
//    re-inline it here.
import { privateTerms, privateListPath, privateListLabel } from '../src/leak-list.js';

function motifs() {
  return forbiddenPatterns(os.userInfo().username, os.homedir(), privateTerms());
}

function trackedFiles(cwd) {
  return git(['ls-files'], cwd).split('\n').filter(Boolean);
}

function scanRepo(racine, m) {
  const violations = [];
  for (const rel of trackedFiles(racine)) {
    let texte;
    try {
      texte = fs.readFileSync(path.join(racine, rel), 'utf8');
    } catch {
      continue; // binary or unreadable: out of scope
    }
    for (const v of scan(texte, m)) violations.push(`${rel} → ${v.name} (${v.excerpt})`);
  }
  return violations;
}

// ⚠️ WE NEVER WRITE A CGNAT-BLOCK IP IN CLEAR HERE: this file is TRACKED, and
//    the gate of this very file forbids it — rightly so (it caught a REAL
//    production IP written here on 04/08/2026). So we assemble it at runtime:
//    the literal exists in no file.
const ip = (...o) => o.join('.');

// ── ASPECT ② — NO CLIENT ROOT IS FORGOTTEN (10/08/2026) ─────────────────
// 🔴 BORN FROM A REAL LEAK: the name and email of a SOCIAL client slept in a
//    TRACKED file, gate GREEN, because only the SEO client root was declared.
//    ⚠️ Adding the missing root closes NOTHING — the next one would be
//    forgotten just the same. This aspect makes the oversight IMPOSSIBLE: every
//    root SEEN on disk must be DECIDED (derived, or ignored with its reason),
//    otherwise RED.
// ⚠️ MUTE WITHOUT THE PRIVATE LIST (fresh clone, CI, another machine): without
//    it we do not know WHERE to look, and a gate that reddens at someone else's
//    place is a gate one unplugs. Same degradation contract as aspect ①.
// ⚠️ WE ONLY LOOK WHERE ROOTS ARE ALREADY DECLARED (their PARENT folders): no
//    personal path therefore enters this PUBLIC repo, and the scan stays
//    bounded. 📏 Measured on 10/08/2026: 3 candidates, 0 noise.
const NOM_RACINE_CLIENTS = /^clients(-.*)?$/i;

function racinesVues(zones) {
  const vues = [];
  for (const zone of zones) {
    let entrees;
    try {
      entrees = fs.readdirSync(zone, { withFileTypes: true });
    } catch {
      continue; // zone absent on this machine: we invent nothing
    }
    for (const e of entrees) {
      if (!e.isDirectory()) continue;
      const chemin = path.join(zone, e.name);
      // A DIRECT root (`.../clients-seo`) or a project carrying its own
      // (`.../agent-social-local/clients`) — the EXACT case that leaked.
      if (NOM_RACINE_CLIENTS.test(e.name)) { vues.push(chemin); continue; }
      try {
        for (const sous of fs.readdirSync(chemin, { withFileTypes: true })) {
          if (sous.isDirectory() && NOM_RACINE_CLIENTS.test(sous.name)) {
            vues.push(path.join(chemin, sous.name));
          }
        }
      } catch { /* unreadable folder: out of scope, never a failure */ }
    }
  }
  return vues;
}

test('② every client root is DECIDED — derived, or ignored with its reason', () => {
  let decl;
  try {
    decl = JSON.parse(fs.readFileSync(privateListPath(), 'utf8'));
  } catch {
    return; // no private list: mute, like aspect ①
  }
  const derivees = (decl.derivedFolders || []).map((s) => s.root);
  const ignorees = (decl.ignoredRoots || []).map((s) => s.root);
  const zones = [...new Set(derivees.map((r) => path.dirname(r)))];
  const oubliees = forgottenRoots(racinesVues(zones), derivees, ignorees);
  assert.deepEqual(
    oubliees,
    [],
    'UNDECIDED CLIENT ROOT — a client living there is INVISIBLE to the gate.\n'
    + 'Declare it in `derivedFolders` (with its marker), or rule it out in\n'
    + '`ignoredRoots` writing WHY:\n  ' + oubliees.join('\n  '));
});

test('② self-validation: aspect ② BITES (an undecided root is named)', () => {
  const vues = ['C:/p/clients-seo', 'C:/p/agent/clients', 'C:/p/clients-vrac'];
  assert.deepEqual(
    forgottenRoots(vues, ['C:/p/clients-seo'], ['C:/p/agent/clients']),
    ['C:/p/clients-vrac'],
    'only the root neither derived nor ignored must come out');
  // Separators and case NEVER create a false red (Windows).
  assert.deepEqual(forgottenRoots(['C:\\P\\Clients-SEO\\'], ['C:/p/clients-seo'], []), []);
  // Degenerate forms: never a crash, never a false green.
  assert.deepEqual(forgottenRoots(null, [], []), []);
  assert.deepEqual(forgottenRoots(['C:/p/x'], null, null), ['C:/p/x']);
  // The same root seen twice is reported only ONCE.
  assert.deepEqual(forgottenRoots(['C:/p/x', 'C:/p/x'], [], []), ['C:/p/x']);
  assert.equal(normalizePath('A\\B/'), 'a/b');
});

// ── ②ter STRICT SCHEMA OF THE PRIVATE LIST (2026-08-16) ─────────────────
// 🔴 PAID THE SAME DAY: the module was renamed to English keys
//    (`derivedFolders`/`root`/`marker`) while the private file still said
//    `dossiersDerives`/`racine`/`marqueur` ⇒ ZERO client derived, gate GREEN.
//    Aspect ② could not see it: its scan zones are DERIVED from
//    `derivedFolders` itself — empty field, empty scan, green by VACUITY.
//    An unknown key silently ignored is indistinguishable from a working one
//    ⇒ the schema is CLOSED: any key outside the vocabulary is RED.
const TOP_KEYS = new Set(['terms', 'derivedFolders', 'ignoredRoots', 'exceptions']);
const ENTRY_KEYS = new Set(['root', 'marker']);
function schemaFaults(decl) {
  if (Object(decl) !== decl) return ['private list is not an object'];
  const faults = [];
  for (const k of Object.keys(decl)) {
    if (k.startsWith('_')) continue; // author comments (_lisez_moi, _role…)
    if (!TOP_KEYS.has(k)) faults.push(`unknown top-level key \`${k}\``);
  }
  for (const listKey of ['derivedFolders', 'ignoredRoots']) {
    for (const e of Array.isArray(decl[listKey]) ? decl[listKey] : []) {
      if (Object(e) !== e) { faults.push(`${listKey}: entry is not an object`); continue; }
      for (const k of Object.keys(e)) {
        if (k.startsWith('_')) continue;
        if (!ENTRY_KEYS.has(k)) faults.push(`${listKey}: unknown entry key \`${k}\``);
      }
      if (typeof e.root !== 'string' || e.root === '') faults.push(`${listKey}: entry without a \`root\` string`);
      if (listKey === 'derivedFolders' && (typeof e.marker !== 'string' || e.marker === '')) {
        faults.push('derivedFolders: entry without a `marker` string');
      }
    }
  }
  return faults;
}

test('②ter the REAL private list matches the CLOSED schema (unknown key = RED)', () => {
  let decl;
  try {
    decl = JSON.parse(fs.readFileSync(privateListPath(), 'utf8'));
  } catch {
    return; // no private list on this machine: mute, like aspects ① and ②
  }
  assert.deepEqual(
    schemaFaults(decl),
    [],
    'PRIVATE LIST OUT OF SCHEMA — an unknown key is SILENTLY IGNORED by the\n'
    + 'engine, so the protection it carries does not exist (paid 16/08/2026:\n'
    + '`dossiersDerives` left over from a rename ⇒ zero client derived, green\n'
    // 🛑 THE ADDRESS IS NAMED, AND IT IS NAMED BY THE PROJECTION — never a
    //    hand-written copy (it was one until 22/08/2026, a second definition of
    //    the address `paths.secretsLabel()` now owns), and never
    //    `privateListPath()`: that one carries the maintainer's real home and
    //    names their secret store, and this repository is PUBLIC.
    + `gate). Fix ~/${privateListLabel()} (resolved by paths.secretsDir(); `
    + 'override CTXROUTE_SECRETS_DIR, or CTXROUTE_LEAK_LIST for the whole path):\n  '
    + schemaFaults(decl).join('\n  '));
});

test('②ter self-validation: the schema gate BITES (in-memory sabotage)', () => {
  // The exact defect of 16/08: pre-rename French keys.
  const stale = { terms: [], dossiersDerives: [{ racine: 'C:/x', marqueur: 'brief.md' }] };
  assert.ok(schemaFaults(stale).some((f) => f.includes('dossiersDerives')),
    'SABOTAGE NOT DETECTED: the stale key class would pass again');
  // Entry-level drift alone is caught too.
  const entryDrift = { derivedFolders: [{ racine: 'C:/x', marker: 'brief.md' }] };
  const faults = schemaFaults(entryDrift);
  assert.ok(faults.some((f) => f.includes('racine')) && faults.some((f) => f.includes('root')),
    'SABOTAGE NOT DETECTED: a renamed entry key would pass again');
  // Healthy file: zero noise (a gate with false positives ends up disabled).
  assert.deepEqual(schemaFaults({
    _lisez_moi: 'x',
    terms: ['a'],
    derivedFolders: [{ _role: 'x', root: 'C:/x', marker: 'brief.md' }],
    exceptions: ['b'],
  }), []);
});

// ── THE GATE ────────────────────────────────────────────────────────────
test('NO TRACKED file carries personal data', () => {
  const violations = scanRepo(ICI, motifs());
  assert.deepEqual(
    violations,
    [],
    'PUBLIC REPO — remove this data BEFORE committing:\n' + violations.join('\n')
  );
});

test('the gate only looks at what is TRACKED', () => {
  // ⚠️ `state/`, `docs/mcp/`, `ctxroute-config.json` are gitignored BY DESIGN
  //    and legitimately contain personal data. Scanning them would make the
  //    gate permanently red — hence unreadable, hence dead.
  const trackes = trackedFiles(ICI);
  // ⚠️ FLOOR RAISED TO THE REAL PERIMETER (2026-08-20): at >50 it passed on the 86 files of
  //    `test/` alone while 143 others were never read. A floor calibrated on a subset VALIDATES
  //    the subset. It must sit just under the real count, so shrinking the scan reddens at once.
  assert.ok(trackes.length > 200, `git ls-files answered ${trackes.length} files — the scan is not covering the repository`);
  assert.ok(!trackes.includes('ctxroute-config.json'), 'the user config stays gitignored');
});

// ── NEGATIVE-CHECK ──────────────────────────────────────────────────────
test('NEGATIVE-CHECK: the gate KNOWS how to redden (sabotage on a COPY)', () => {
  // ⚠️ SABOTAGE ON A COPY, NEVER IN PLACE: on 03/08/2026, sabotaging a real
  //    file brought down 38 tests of other suites reading it IN PARALLEL.
  // ⚠️ THE SABOTAGED TERM IS FABRICATED, NEVER TAKEN FROM THE ENVIRONMENT:
  //    the 1st version used the OS account — on CI it is called "runner", hence
  //    ruled out as generic, hence NOTHING was detected and the negative-check
  //    fell over (red CI, 04/08/2026). A net that depends on the environment
  //    can be DISARMED by a change elsewhere.
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-fuite-'));
  const list = path.join(bac, 'list.json');
  const TERME = 'zzfuitetemoin';
  try {
    // 🔴 `cwd` DOES NOT ISOLATE A `git` CHILD — MEASURED 2026-08-21, IN THIS REPO.
    //    Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends to every hook it
    //    runs, and the pre-commit hook runs THIS SUITE. Those variables are
    //    INHERITED by the child, and they WIN over the working directory ⇒ the
    //    `git add` below staged `piege.md` into the REAL repository's index,
    //    from a sandbox living in the OS temp folder. It reached a commit, and
    //    three `--amend` in a row could not remove it: each commit re-ran the
    //    hook, which re-ran this test, which re-staged the file. Exactly the
    //    class already engraved for the state backend — **an environment
    //    variable is inherited, so it is never a local choice**.
    // 🛑 SCRUB, NEVER "SET THE RIGHT ONE": we cannot enumerate what a future git
    //    version will export. Removing the whole `GIT_*` family is the only form
    //    that survives an upgrade — and it is what makes `cwd` mean what it says.

    git(['init', '-q'], bac);
    fs.writeFileSync(path.join(bac, 'piege.md'), 'author: ' + TERME + '\n');
    git(['add', 'piege.md'], bac);

    // ⚠️ THE ISOLATION IS PROVEN, NOT HOPED FOR: the sandbox must know the file
    //    (so the sabotage is real) and the ambient index must be untouched. A
    //    negative-check that dirties the repository it protects is worse than
    //    none — this one used to.
    assert.match(git(['ls-files'], bac), /piege\.md/,
      'the sandbox did not even register the trap: the sabotage would prove nothing');
    fs.writeFileSync(list, JSON.stringify({ terms: [TERME], derivedFolders: [] }));

    const avant = process.env.CTXROUTE_LEAK_LIST;
    process.env.CTXROUTE_LEAK_LIST = list;
    try {
      const violations = scanRepo(bac, motifs());
      assert.ok(violations.length > 0, 'a sabotaged repo MUST be detected');
      assert.match(violations[0], /piege\.md/);
    } finally {
      if (avant === undefined) delete process.env.CTXROUTE_LEAK_LIST;
      else process.env.CTXROUTE_LEAK_LIST = avant;
    }
  } finally {
    fs.rmSync(bac, { recursive: true, force: true });
  }
});

test('NEGATIVE-CHECK: the DOCUMENTATION ranges remain allowed', () => {
  // ⚠️ The doctrine REQUIRES writing 203.0.113.x in examples. A gate forbidding
  //    them would make the rule inapplicable — hence would be unplugged.
  const m = motifs();
  assert.deepEqual(scan('demo server: 203.0.113.7', m), []);
  assert.deepEqual(scan('local: 127.0.0.1:8080', m), []);
  assert.deepEqual(scan('write to dev@example.com', m), []);
});

test('a REAL MACHINE IP (CGNAT/Tailscale block) is refused', () => {
  const m = motifs();
  assert.equal(scan('vps: ' + ip(100, 88, 41, 95), m).length, 1);
  // Edges of the 100.64/10 block — beyond that it is public space, not us.
  assert.equal(scan(ip(100, 63, 0, 1), m).length, 0);
  assert.equal(scan(ip(100, 128, 0, 1), m).length, 0);
});

// ── THE DERIVATION (the core: no list to maintain) ──────────────────────
test('DERIVATION: clients come from the FOLDERS, never from a written list', () => {
  // ⚠️ A hand-kept list would be out of date at the next client: the gate would
  //    protect less IN SILENCE. Here we check that derivation works AND that it
  //    rules out tooling (`.git`, `node_modules`) — without that filter, a term
  //    like "scripts" would make the gate red everywhere (measured on
  //    04/08/2026: 4 collisions, 3 of them false).
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-derive-'));
  const list = path.join(bac, 'list.json');
  try {
    fs.mkdirSync(path.join(bac, 'clients', 'boulangerie-durand'), { recursive: true });
    fs.writeFileSync(path.join(bac, 'clients', 'boulangerie-durand', 'brief.md'), '# brief');
    fs.mkdirSync(path.join(bac, 'clients', 'node_modules'), { recursive: true }); // NOT a client
    fs.writeFileSync(list, JSON.stringify({
      terms: [],
      derivedFolders: [{ root: path.join(bac, 'clients'), marker: 'brief.md' }],
    }));

    const avant = process.env.CTXROUTE_LEAK_LIST;
    process.env.CTXROUTE_LEAK_LIST = list;
    try {
      const m = motifs();
      assert.equal(scan('client: boulangerie-durand', m).length, 1, 'the client MUST be derived');
      assert.equal(scan('cf node_modules/x', m).length, 0, 'a folder without a marker is NOT a client');
    } finally {
      if (avant === undefined) delete process.env.CTXROUTE_LEAK_LIST;
      else process.env.CTXROUTE_LEAK_LIST = avant;
    }
  } finally {
    fs.rmSync(bac, { recursive: true, force: true });
  }
});

test('FRESH CLONE: private list missing ⇒ generic mode, never a failure', () => {
  // ⚠️ "A repo gate must hold on a FRESH clone" (gitignore.md). Requiring the
  //    private file would make CI red for everyone.
  const avant = process.env.CTXROUTE_LEAK_LIST;
  process.env.CTXROUTE_LEAK_LIST = path.join(os.tmpdir(), 'ctxroute-list-absente-xyz.json');
  try {
    const m = motifs();
    assert.ok(m.length >= 2, 'email + IP stay covered without the private file');
    assert.equal(scan('vps: ' + ip(100, 88, 41, 95), m).length, 1, 'the generic mode still protects');
  } finally {
    if (avant === undefined) delete process.env.CTXROUTE_LEAK_LIST;
    else process.env.CTXROUTE_LEAK_LIST = avant;
  }
});

// ── THE PURE MODULE ─────────────────────────────────────────────────────
test('escapeLiteral: a Windows path becomes a literal, never a wildcard', () => {
  // ⚠️ Without escaping, `C:\Users\x` contains `\U` and `.`: the regex would
  //    match almost everything and the gate would scream at the whole repo.
  const re = new RegExp(escapeLiteral('C:\\Users\\dev'));
  assert.ok(re.test('C:\\Users\\dev'));
  assert.ok(!re.test('CxUsersxdev'));
});

test('lastSegment: the USER folder, never the generic root', () => {
  // ⚠️ Taking all the segments would give "Users", present in every example
  //    path of the repo — 6 false positives measured on 04/08/2026.
  assert.equal(lastSegment('C:/Users/dev'), 'dev');
  assert.equal(lastSegment('C:\\Users\\dev\\'), 'dev');
  assert.equal(lastSegment(''), '');
});

test('WORD BOUNDARIES: a first name does not match the word containing it', () => {
  // ⚠️ REAL case of 04/08/2026: "un prénom" ⊂ "théorique" made frontmatter.js
  //    and the skill go red. A gate that screams on healthy code dies.
  const m = forbiddenPatterns(undefined, undefined, ['un prénom']);
  assert.deepEqual(scan('un piege reel, pas theorique', m), []);
  assert.deepEqual(scan('probleme théorique', m), []);
  assert.equal(scan('ecrit par un prénom', m).length, 1);
  assert.equal(scan('(un prénom)', m).length, 1);
});

test('scan: TOTAL — absurd inputs, never a throw', () => {
  const m = motifs();
  for (const mauvais of [undefined, null, 42, {}, []]) {
    assert.deepEqual(scan(mauvais, m), []);
    assert.deepEqual(scan('texte', mauvais), []);
  }
});

test('forbiddenPatterns: an absent or too short input invents no pattern', () => {
  // ⚠️ A 1-2 character term would match half the repo: the gate would be red
  //    permanently, hence dead.
  assert.equal(forbiddenPatterns(undefined, undefined, undefined).length, 2);
  assert.equal(forbiddenPatterns('ab', '', ['x']).length, 2);
  assert.equal(forbiddenPatterns('abc', '', []).length, 3);
});

test('forbiddenPatterns: a term present twice creates only ONE pattern', () => {
  const m = forbiddenPatterns('dupont', 'C:/Users/dupont', ['dupont']);
  assert.equal(m.filter((x) => x.name.includes('dupont')).length, 1);
});
