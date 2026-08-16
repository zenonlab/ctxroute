// ═══════════════════════════════════════════════════════════════════════
// NEGATIVE-CHECK of lint-corpus.js — proves it SCREAMS when the fleet is broken
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ REASON FOR EXISTING: `lint.js` (pure) is mutated at 99 %+ — its DECISION is
//    proven. What was NOT proven: the I/O shell. A `collectDocs()` returning an
//    empty state makes a perfect core say "✅ healthy fleet". That is EXACTLY
//    the bug of 15/07/2026, committed TWICE in the same day (an audit script
//    filtering on `scope`, then `Array.isArray` on an object root): a hollow
//    harness triumphantly announces 0 problems.
//    A lint green on a healthy fleet proves NOTHING — `process.exit(0)` would do
//    the same. Only sabotage proves.
//
// ⚠️ Sabotage is ALWAYS done on a FAKE fleet in tmpdir (via CTXROUTE_HOOKS_DIR /
//    CTXROUTE_HOME), NEVER on the real `~/.claude/hooks` (307 real docs, 556
//    live rules serving other agents RIGHT NOW). A test writing into a delivered
//    artefact = the bug of 15/07.
//
// ⚠️ NEVER remove a case from here, and ESPECIALLY NOT the "liveness probe"
//    case: it is the only one proving the lint knows it has read nothing.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LINT = path.join(import.meta.dirname, '..', 'tools', 'lint-corpus.js');

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same condition).
// The fake fleets/spawns are built sequentially at module level.
function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

function runLint(parc, args = []) {
  const r = spawnSync(process.execPath, [LINT, ...args], {
    encoding: 'utf8',
    // ⚠️ TOTAL isolation: the lint must never see the real fleet nor the real home.
    env: { ...process.env, CTXROUTE_HOOKS_DIR: parc.hooks, CTXROUTE_HOME: parc.home },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Derives the frontmatter that a case's `regles` describe for the doc `rel`.
 * ⚠️ MECHANICAL translation, never a judgement: the cases keep expressing their
 *    intent in "rules", the fleet materialises them where the engine now reads
 *    them — inside the doc itself.
 * A doc targeted by NO rule → no frontmatter: that is the "dead doc" case, and
 * it must stay detectable.
 */
function avecFrontmatter(rel, contenu, regles) {
  const miennes = regles.filter((r) => r.doc === rel);
  if (!miennes.length) return contenu;
  const patterns = miennes.map((r) => r.pattern).filter((p) => typeof p === 'string');
  if (!patterns.length) return contenu;
  const decl = { match: patterns.length === 1 ? patterns[0] : patterns };
  const p0 = miennes[0];
  if (Array.isArray(p0.scope) && p0.scope.length) decl.scope = p0.scope;
  if (Array.isArray(p0.exclude) && p0.exclude.length) decl.exclude = p0.exclude;
  const lignes = Object.entries(decl).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lignes.join('\n')}\n---\n${contenu}`;
}

/**
 * Builds a minimal but REALISTIC fake fleet (same shapes as the real one:
 * object root `{rules:[…]}`, docs under `docs/`, `mcpServers` in the home).
 */
function faireParc({ regles = [], docs = {}, mcpServers = null } = {}) {
  const hooks = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-parc-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-home-'));
  fs.mkdirSync(path.join(hooks, 'docs'), { recursive: true });
  // ⚠️ The JSON is still written: some cases target it BY NAME (isolation, object root).
  //    It is NO LONGER the lint's rule source (27/07/2026) — the triggers live in EACH
  //    doc's frontmatter. The JSON served the OLD engine (protect-files.js), replaced on
  //    17/07; nothing to do with Codex.
  fs.writeFileSync(path.join(hooks, 'protected-paths.json'), JSON.stringify({ rules: regles }));
  for (const [rel, contenu] of Object.entries(docs)) {
    const p = path.join(hooks, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // A case already supplying its frontmatter (`---` at the top) is authoritative:
    // that is what it wants to exercise. Otherwise we derive the one its rules describe.
    fs.writeFileSync(p, contenu.startsWith('---') ? contenu : avecFrontmatter(rel, contenu, regles));
  }
  if (mcpServers) fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers }));
  return { hooks, home, nettoyer: () => { for (const d of [hooks, home]) fs.rmSync(d, { recursive: true, force: true }); } };
}

// A reference HEALTHY fleet: 1 doc, 1 rule targeting it.
const SAIN = {
  regles: [{ doc: 'docs/lock.md', pattern: 'lock.js' }],
  docs: { 'docs/lock.md': '# lock\n\nNever reimplement mkdirSync ad hoc.\n' },
};

// ── Case 1 — HEALTHY fleet: the lint keeps quiet and exits 0 ──────────
// ⚠️ This case proves NOTHING on its own (see header). It is only there to
//    guarantee that the NEGATIVE cases below redden for the RIGHT reason.
{
  const parc = faireParc(SAIN);
  try {
    const r = runLint(parc);
    ok('healthy fleet → exit 0', r.status === 0);
    ok('healthy fleet → says so', r.stdout.includes('healthy fleet'));

    const q = runLint(parc, ['--quiet']);
    ok('healthy fleet + --quiet → TOTAL SILENCE (otherwise SessionStart becomes noise)', q.stdout.trim() === '');
    ok('healthy fleet + --quiet → exit 0', q.status === 0);
  } finally { parc.nettoyer(); }
}

// ── Case 2 — LIVENESS PROBE: 0 rules loaded ──────────────────────────
// ⚠️ THE central case. Without it, a lint reading NOTHING announces "✅ healthy
//    fleet". Mistake made twice on 15/07/2026. Exit 2 = distinct from 1: "I
//    could not measure" is NOT "I measured and it is healthy".
{
  const parc = faireParc({ regles: [], docs: SAIN.docs });
  try {
    const r = runLint(parc);
    ok('NO rule loaded → exit 2 (hollow harness ≠ healthy fleet)', r.status === 2);
    ok('NO rule loaded → screams that it cannot prove anything', r.stderr.includes('NO rule loaded'));
    ok('NO rule loaded → NEVER says "healthy fleet"', !r.stdout.includes('healthy fleet'));

    const q = runLint(parc, ['--quiet']);
    ok('hollow harness + --quiet → screams ANYWAY (silence only applies to success)', q.status === 2);
  } finally { parc.nettoyer(); }
}

// ── Case 3 — REVERSED on 09/08/2026: the JSON CAN NO LONGER save a doc ──
// 🛑 THIS CASE WAS INERT, and that is the worst defect it could have.
//    It was titled "protected-paths.json with an OBJECT root REALLY read" and
//    claimed to cover `extraireRegles()` — the function tolerating both JSON
//    roots, born from the trap of 15/07. But it asserted `'1 règles'` on the
//    HEALTHY fleet, whose doc receives a frontmatter derived by
//    `avecFrontmatter`: the counted rule came from the FRONTMATTER, never from
//    the JSON. MEASUREMENT (09/08): `extraireRegles` deleted → this suite stays
//    GREEN. A green test that does not protect what its title announces is worse
//    than an absent test: it makes the area look covered. (Cf `layers.json`:
//    "the worst defect of the repo is not a red gate, it is a GREEN gate that
//    sees nothing.")
// ✅ WHAT IT PROVES NOW — the INVERSE aspect of case 6, never covered: a doc
//    WITHOUT a trigger in ITS frontmatter is DEAD, even if the JSON carries a
//    rule targeting it. That is the "single source" guarantee seen from the I/O
//    shell: rewiring an external source would make this case go red.
//    ⚠️ Frontmatter deliberately PRESENT but with no trigger (`mode:` alone):
//    without it, `avecFrontmatter` would derive one FROM the rule and the case
//    would sabotage itself — exactly the mechanism that made the old case inert.
{
  const parc = faireParc({
    regles: [...SAIN.regles, { doc: 'docs/ignoree.md', pattern: 'ignoree.js' }],
    docs: { ...SAIN.docs, 'docs/ignoree.md': '---\nmode: dumb\n---\n\n# ignored\n\nNo trigger.\n' },
  });
  try {
    const r = runLint(parc);
    ok('JSON rule + doc without a trigger → the doc is DEAD (the JSON is no longer a source)', r.status === 1);
    ok('JSON rule + doc without a trigger → the lint NAMES the dead doc', r.stderr.includes('docs/ignoree.md'));
  } finally { parc.nettoyer(); }
}

// ── Case 4 — NEGATIVE: DEAD doc (no trigger) ─────────────────────────
// The bug the whole refactor exists to kill: a complete, carefully written .md
// that NOTHING targets — never injected, and nobody sees it.
{
  const parc = faireParc({
    regles: SAIN.regles,
    docs: { ...SAIN.docs, 'docs/orpheline.md': '# dead doc\n\nNever injected.\n' },
  });
  try {
    const r = runLint(parc);
    ok('DEAD doc → exit 1', r.status === 1);
    ok('DEAD doc → NAMES it', r.stderr.includes('docs/orpheline.md'));
    ok('DEAD doc → says it will never be injected', r.stderr.includes('DEAD doc'));

    const q = runLint(parc, ['--quiet']);
    ok('DEAD doc + --quiet → screams ANYWAY', q.status === 1 && q.stderr.includes('docs/orpheline.md'));
  } finally { parc.nettoyer(); }
}

// ── Case 5 — the PHANTOM rule is EXTINGUISHED BY CONSTRUCTION (27/07/2026) ──
// ⚠️ The case is NOT deleted, it is REVERSED: it now proves that the class of
//    error can no longer exist. A phantom rule = a rule targeting a missing .md.
//    That was possible as long as the rules lived in a SEPARATE file
//    (`protected-paths.json`): the .md could be deleted without its rule. Since
//    the trigger lives INSIDE the doc (frontmatter, single source), a rule
//    without a doc is INEXPRESSIBLE — deleting the doc deletes the rule, in one
//    gesture. Closed at the CAUSE, not at detection.
// ⚠️ Restoring an external rule source would RESURRECT this bug: this test would
//    then go red, and that is exactly its role.
{
  const parc = faireParc({
    regles: [...SAIN.regles, { doc: 'docs/disparue.md', pattern: 'disparu.js' }],
    docs: SAIN.docs, // `docs/disparue.md` does NOT exist: the rule cannot be born
  });
  try {
    const r = runLint(parc);
    ok('PHANTOM rule now IMPOSSIBLE: healthy fleet despite the orphan rule', r.status === 0);
    ok('PHANTOM rule: no missing doc named', !r.stderr.includes('docs/disparue.md'));
  } finally { parc.nettoyer(); }
}

// ── Case 6 — NORMALISATION: the frontmatter is AUTHORITATIVE ─────────
// ⚠️ The heart of maintainability: a doc declaring its trigger IN its
//    frontmatter is alive EVEN without any rule in protected-paths.json.
//    That is the world AFTER the migration, proven BEFORE switching over.
{
  const parc = faireParc({
    regles: SAIN.regles, // rule on lock.md only — nothing targets moderne.md
    docs: {
      ...SAIN.docs,
      'docs/moderne.md': '---\nmatch: moderne.js\n---\n\n# modern\n\nInvariant.\n',
    },
  });
  try {
    const r = runLint(parc);
    ok('doc with a `match:` frontmatter and NO JSON rule → ALIVE (exit 0)', r.status === 0);
  } finally { parc.nettoyer(); }
}

// ── Case 7 — NEGATIVE: frontmatter present but MUTE ──────────────────
// ⚠️ The migration trap: `hasFrontmatter` is authoritative, so a frontmatter
//    without a trigger does NOT fall back on the JSON. A half-migrated doc must
//    go red, never be quietly saved by an old rule.
{
  // ⚠️ A HEALTHY doc accompanies the half-migrated one: without it the fleet has
  //    NO trigger at all, and the liveness probe (exit 2) would answer — we would
  //    no longer prove anything about the mute doc. The real fleet has 300 live docs.
  const parc = faireParc({
    regles: [
      { doc: 'docs/moitie.md', pattern: 'moitie.js' },
      { doc: 'docs/saine.md', pattern: 'saine.js' },
    ],
    docs: {
      'docs/moitie.md': '---\ntitle: nice title\n---\n\n# half migrated\n',
      'docs/saine.md': '# healthy\n\nA properly declared doc.\n',
    },
  });
  try {
    const r = runLint(parc);
    ok('frontmatter WITHOUT a trigger → exit 1 (never rescued by the old rule)', r.status === 1);
    ok('frontmatter WITHOUT a trigger → names the doc', r.stderr.includes('docs/moitie.md'));
  } finally { parc.nettoyer(); }
}

// ── Case 8 — WARN: MCP server without a doc, read from the REAL home ──
// ⚠️ Proves that `mcpServers()` really reads `.claude.json` — if it silently
//    returned [], MCP coverage would be blind and nobody would know.
{
  const parc = faireParc({ ...SAIN, mcpServers: { 'serveur-fictif-xyz': { command: 'x' } } });
  try {
    const r = runLint(parc);
    ok('MCP server wired without a doc → WARN, never blocking (exit 0)', r.status === 0);
    ok('MCP server without a doc → NAMES it (proof that .claude.json is read)', r.stdout.includes('serveur-fictif-xyz'));

    const e = runLint(parc, ['--level', 'error']);
    ok('--level error → the warn disappears', !e.stdout.includes('serveur-fictif-xyz'));
    ok('--level error → exit 0 despite the filtered warn', e.status === 0);

    const off = runLint(parc, ['--level', 'off']);
    ok('--level off → everything switched off (a declared choice), exit 0', off.status === 0 && !off.stdout.includes('serveur-fictif-xyz'));
  } finally { parc.nettoyer(); }
}

// ── Case 9 — `--level` must NEVER silently smother an error ──────────
// ⚠️ `off` switches everything off, that is a DECLARED choice (see lint.js). But
//    a typo (`--level erreur`) must fall back on the default, NEVER on off.
{
  const parc = faireParc({
    regles: SAIN.regles,
    docs: { ...SAIN.docs, 'docs/orpheline.md': '# dead\n' },
  });
  try {
    const r = runLint(parc, ['--level', 'erreur-typo']);
    ok('--level with a TYPO → default, the error screams anyway (exit 1)', r.status === 1);
  } finally { parc.nettoyer(); }
}

// ── Case 10 — the lint NEVER touches the real fleet ──────────────────
// ⚠️ The real `~/.claude/hooks` is serving OTHER agents right now.
{
  const reel = path.join(os.homedir(), '.claude', 'hooks', 'protected-paths.json');
  if (fs.existsSync(reel)) {
    const avant = fs.readFileSync(reel, 'utf8');
    const parc = faireParc(SAIN);
    try {
      runLint(parc);
      ok('the lint does NOT modify the real protected-paths.json (total tmpdir isolation)',
        fs.readFileSync(reel, 'utf8') === avant);
    } finally { parc.nettoyer(); }
  } else {
    ok('the real fleet is absent (fresh checkout) → nothing to protect, case N/A', true);
  }
}
