// ═══════════════════════════════════════════════════════════════════════
// A BACKLOG HEADING MUST NOT LIE (gate, 06/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 A RECURRING ERROR CLASS, NOT AN INCIDENT: **three** headings of
//    `REFACTOR-PLAN.md` announced an OPEN piece of work while all of their
//    content was CLOSED — found by hand on 05 and 06/08/2026:
//      · "🔴 3 OPEN out of 4 … ①②④ remain" while ① had been closed the day before;
//      · "🔴 INJECTION SILENTLY TRUNCATED (priority)" left red for TWO
//        WEEKS after the multi-frame transport had removed its cause;
//      · "🔴 TWO ENGINE DEFECTS" of which ① was marked ✅ RESOLVED right below.
//
// ⚠️ WHY THIS IS SERIOUS AND NOT COSMETIC: the backlog is the ONLY memory of
//    the project between two sessions. A false heading makes a closed piece
//    of work be reopened, or makes people believe a real one is handled.
//    `steering.md` already writes it — "a REVERSED judgement is rewritten,
//    it does not pile up" — but a PROSE instruction failed three times in a
//    row. Repo doctrine: an instruction that does not hold must become a
//    MECHANICAL TRIGGER.
//
// ⚠️ WHAT THIS GATE PROVES, AND NOTHING MORE: the INTERNAL COHERENCE of a
//    section — "a section announced open whose sub-sections are ALL closed
//    is lying". 🛑 It NEVER proves that an open piece of work still exists
//    in the reality of the code: that is undecidable here. Do not sell it for
//    what it is not (same lesson as `doc-drift-gate`, which proves the
//    EXISTENCE of a cited file, never the TRUTH of the doc).
//
// ⚠️ A SECTION WITHOUT SUB-SECTIONS IS IGNORED: its status derives from
//    nothing, requiring it would produce noise — and a noisy gate ends up
//    worked around.

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ Deliberately BROAD markers: the backlog is written by hand, in French,
//    by successive agents. A narrow vocabulary would make the gate inert at
//    the first synonym — the trap of the 03/08 purity gates.
// 🛑 THESE TWO REGEXES ARE DATA MATCHED AGAINST THE FRENCH BACKLOG FILE:
//    never translate their alternatives, they would stop matching. Same for
//    the French fixtures of the negative-checks below.
const OUVERT = /🔴|🟠|🟡|OUVERT|BACKLOG/;
const FERME = /✅|FERMÉ|FERME|RÉSOLU|RESOLU|LIVRÉ|LIVRE|TRAITÉ|TRAITE|EXÉCUTÉ|EXECUTE/;

/** Splits the backlog into `## …` sections carrying their `### …` subtitles. */
function sections(texte) {
  const lignes = texte.split(/\r?\n/);
  const out = [];
  let courante = null;
  for (const l of lignes) {
    if (/^##\s/.test(l) && !/^###/.test(l)) {
      courante = { titre: l, sous: [] };
      out.push(courante);
    } else if (/^###\s/.test(l) && courante) {
      courante.sous.push(l);
    }
  }
  return out;
}

/** The sections whose heading LIES: announced open, all content closed. */
function menteuses(texte) {
  return sections(texte)
    .filter((s) => s.sous.length > 0)
    .filter((s) => OUVERT.test(s.titre) && !FERME.test(s.titre))
    .filter((s) => s.sous.every((t) => FERME.test(t)))
    .map((s) => s.titre.slice(0, 100));
}

// ⚠️ The work journal is PRIVATE (untracked since 2026-08-16): a public clone
//    does not have it. Clean skip — the gate only guards the maintainer's copy.
const PLAN = path.join(HERE, '..', 'REFACTOR-PLAN.md');
const planPresent = fs.existsSync(PLAN);

test.skipIf(!planPresent)('no REFACTOR-PLAN heading announces as open what is entirely closed', () => {
  const texte = fs.readFileSync(PLAN, 'utf8');
  const faux = menteuses(texte);
  assert.deepStrictEqual(faux, [],
    'Heading(s) that lie — rewrite them (do NOT pile them up):\n  ' + faux.join('\n  '));
});

// ═══════════════════════════════════════════════════════════════════════
// PART ② — THE HEADER COMMIT LIST MUST COUNT CORRECTLY (㉚, 07/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 SECOND CLASS, SAME FILE, SAME CAUSE: the header lied TWICE in two hours
//    on 07/08/2026 (a branch announced alive while it had been deleted and
//    merged · "CI NOT RUN" while it was green · "The 10 commits" under a list
//    of NINE). Part ① sees none of that: it only looks at section titles.
//
// 🛑 WHAT IT IS HONESTLY POSSIBLE TO PROVE HERE, AND NOTHING MORE.
//    I wanted to check that every cited fingerprint EXISTS in the history
//    (`git rev-parse`) and that the announced branch is alive. **MEASURED AND
//    DISCARDED**: `actions/checkout@v5` clones with `fetch-depth: 1` in both
//    workflows of the repo ⇒ NO old commit exists in CI, and neither do the
//    local branches. The gate would be red on a fresh clone — either we
//    switch to `fetch-depth: 0` (a heavy clone on every push, for backlog
//    comfort), or we make it conditional, that is to say INERT exactly where
//    it counts. Both are worse than the reduced scope kept here.
//    ⇒ This part proves the INTERNAL COHERENCE of the count, NEVER the
//    historical truth. Same honesty as part ① and as `doc-drift-gate`.
//
// ⚠️ DERIVED INVARIANT, NOT YET ANOTHER CONVENTION: every fingerprint cited
//    INSIDE the census section must be one of the censused commits.
//    That is what makes the count verifiable — a proof fingerprint
//    ("CI green on X") necessarily cites a commit of the list, otherwise it
//    talks about a state the header does not describe.

/** The body of the `## Les N commits …` section, up to the next `## `. */
function sectionCommits(texte) {
  const lignes = texte.split(/\r?\n/);
  const debut = lignes.findIndex((l) => /^##\s+Les\s+\d+\s+commits/.test(l));
  if (debut === -1) return null;
  const reste = lignes.slice(debut + 1);
  const fin = reste.findIndex((l) => /^##\s/.test(l));
  return { titre: lignes[debut], body: (fin === -1 ? reste : reste.slice(0, fin)).join('\n') };
}

/** `null` if everything is fine, otherwise the incoherence message. */
function decompteFaux(texte) {
  const s = sectionCommits(texte);
  if (s === null) return null; // section absent = out of scope (never noise)
  const announcement = Number(s.titre.match(/Les\s+(\d+)\s+commits/)[1]);
  // ⚠️ 7 to 40 hex chars between backticks: the shape under which the backlog
  //    cites a fingerprint. A `Set` because the same one may serve as proof
  //    further down.
  const citees = new Set((s.body.match(/`[0-9a-f]{7,40}`/g) || []));
  if (citees.size !== announcement) {
    return `the header announces ${announcement} commits but cites ${citees.size}: ` +
      [...citees].join(' ');
  }
  return null;
}

test.skipIf(!planPresent)('㉚ — the commit count in the backlog header is coherent', () => {
  const texte = fs.readFileSync(PLAN, 'utf8');
  const faux = decompteFaux(texte);
  assert.strictEqual(faux, null,
    'Incoherent header — recount BEFORE committing:\n  ' + faux);
});

test('㉚ NEGATIVE — the count really goes red (IN-MEMORY sabotage)', () => {
  // The REAL case of 07/08/2026: title says 10, list has 9.
  const faux = ['## Les 10 commits du jour', '`aaaaaaa` un · `bbbbbbb` deux'].join('\n');
  assert.ok(decompteFaux(faux) !== null, 'the gate does not see a false count: it is INERT');

  // Counter-check ①: correct count ⇒ silence, including a fingerprint repeated as proof.
  const sain = ['## Les 2 commits du jour', '`aaaaaaa` un · `bbbbbbb` deux', 'CI verte sur `bbbbbbb`.'].join('\n');
  assert.strictEqual(decompteFaux(sain), null, 'false positive: a fingerprint cited twice inflates the count');

  // Counter-check ②: no census section ⇒ out of scope.
  assert.strictEqual(decompteFaux('## Autre chose'), null, 'a header without a census must trigger nothing');
});

// ═══════════════════════════════════════════════════════════════════════
// PART ③ — THE HEADER MUST NOT FORGET COMMITS (㉜, 08/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE HOLE PART ② DOES NOT SEE, AND IT IS THE MOST TREACHEROUS: ② compares
//    the ANNOUNCED number to the number of CITED fingerprints — two figures
//    both coming from the header. It is therefore perfectly GREEN on a header
//    that counts correctly and forgets half the work. Measured on 08/08/2026:
//    the header announced 25 commits, cited 25, and NINE commits (the whole
//    `rank` piece of work) were missing. Found because the maintainer asked
//    again "are you 100 % sure?" — never by a machine.
//
// ⚠️ THE CALENDAR RULE WAS MEASURED AND THEN DISCARDED. First attempt: "every
//    commit of the DAY must be cited". Result over 4 real days: 08/08 → 0
//    missing, but 07/08 → 6, 06/08 → 16, 05/08 → 24. Those reds are FALSE:
//    the header describes ONE session, and a NIGHT session crosses midnight —
//    it therefore legitimately groups two dates. A calendar gate would have
//    screamed at every night session, that is to say almost all of them.
//    🛑 "The day" is NOT decidable here. Do not go back to it.
//
// ✅ WHAT HOLDS: a range, without a calendar — from the PREVIOUS edition of
//    the header up to `HEAD`. The header itself dates its freshness, so
//    there is nothing left to guess. Measured on the last 11 real editions:
//    9 green, 2 red — and the 2 reds are REAL omissions (`52ec4c5` forgot the
//    4 commits of `rank`, `f3f8dcd` forgot `c9b3dcf`).
//    **Zero false positive on the real history.**
//
// 🛑 IT ONLY FIRES IF `REFACTOR-PLAN.md` IS MODIFIED IN THE WORKING TREE, and
//    that guardrail is NOT a detail: without it, the first code commit
//    following a header update would go RED, which would force rewriting the
//    header at EVERY commit. The gate would then target normal work instead
//    of the oversight — a noisy gate is a gate people stop reading, then work
//    around. So we only speak when the header is being touched: that is
//    exactly when the oversight happens.
//
// 🛑 MUTE ON A SHALLOW CLONE (CI) — `actions/checkout@v5` clones with
//    `fetch-depth: 1`: the history does NOT exist there. Identical precedent
//    in this repo (`alarme-capacite` SKIPs on a fresh clone). This part is
//    therefore LOCAL, and that is the right place: the header is written
//    locally, never in CI.

/**
 * Returns the list of short fingerprints not cited by the header, or `null`
 * when the question does not arise (no git, shallow clone, header not
 * modified). ⚠️ `null` = OUT OF SCOPE, never "all is well".
 */
function commitsOublies(execFileSync, racine, tete) {
  const git = (...a) => execFileSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  try {
    // A shallow clone has no history: any range would be wrong there.
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') return null;
    // The header is not touched ⇒ this is not the gesture we watch.
    if (git('status', '--porcelain', '--', 'REFACTOR-PLAN.md').trim() === '') return null;
    const ancre = git('log', '-1', '--format=%H', '--', 'REFACTOR-PLAN.md').trim();
    if (!ancre) return null; // file never committed (new repo)
    const plage = git('log', '--format=%h %s', `${ancre}..HEAD`).trim();
    if (plage === '') return [];
    return plage.split('\n')
      .filter((l) => !tete.includes(l.split(' ')[0]))
      .map((l) => l.slice(0, 72));
  } catch {
    return null; // no git, no blame (the framework installs without it)
  }
}

test.skipIf(!planPresent)('㉜ — the header, when modified, cites every commit since its last update', async () => {
  const { execFileSync } = await import('node:child_process');
  const texte = fs.readFileSync(PLAN, 'utf8');
  const tete = texte.split('## 📋 CE QUI RESTE')[0];
  const oublies = commitsOublies(execFileSync, HERE, tete);
  if (oublies === null) return; // out of scope — cf the comment above
  assert.deepStrictEqual(oublies, [],
    'The backlog header is STALE — these commits are cited nowhere:\n  '
    + oublies.join('\n  '));
});

test('㉜ NEGATIVE — the part really goes red, and really stays silent (SIMULATED git)', () => {
  // ⚠️ git is SIMULATED: we touch neither the real repository nor a real file.
  //    A fake `execFileSync` makes the part testable without depending on the
  //    state of the repository at run time — otherwise this test would be
  //    green or red according to the mood of the working tree, hence unusable.
  const faux = (reponses) => (_bin, args) => {
    if (args.includes('--is-shallow-repository')) return reponses.shallow ?? 'false\n';
    if (args.includes('status')) return reponses.status ?? ' M REFACTOR-PLAN.md\n';
    if (args.includes('-1')) return 'abc1234abc\n';
    return reponses.plage ?? '';
  };

  // ① THE REAL CASE OF 08/08/2026: the header is modified, a commit is missing.
  const manquant = commitsOublies(faux({ plage: 'c9b3dcf doc(budget): limite re-verifiee' }), '.', 'header without a fingerprint');
  assert.strictEqual(manquant.length, 1, 'the part does not see a forgotten commit: it is INERT');

  // ② Counter-check: the same commit CITED ⇒ silence.
  assert.deepStrictEqual(
    commitsOublies(faux({ plage: 'c9b3dcf doc(budget): limite re-verifiee' }), '.', 'see `c9b3dcf` here'),
    [], 'false positive: a commit that is cited is still reported');

  // ③ THE ANTI-NOISE GUARDRAIL: header NOT modified ⇒ out of scope, even if
  //    commits have accumulated. Without it, every code commit would require
  //    rewriting the header.
  assert.strictEqual(
    commitsOublies(faux({ status: '', plage: 'c9b3dcf autre chose' }), '.', 'whatever'),
    null, 'the part speaks while the header is not touched: it will be worked around');

  // ④ SHALLOW CLONE (the CI) ⇒ mute, never a red based on emptiness.
  assert.strictEqual(
    commitsOublies(faux({ shallow: 'true\n', plage: 'c9b3dcf autre chose' }), '.', 'whatever'),
    null, 'the part would go red in CI, where the history DOES NOT EXIST');

  // ⑤ TOTAL: git absent ⇒ silence, never a suite failure.
  assert.strictEqual(
    commitsOublies(() => { throw new Error('git introuvable'); }, '.', ''),
    null, 'a workstation without git would bring the suite down');
});

test('NEGATIVE — the gate really goes red (IN-MEMORY sabotage, never the real file)', () => {
  // ⚠️ IN MEMORY, NOT ON DISK: a sabotage on a real file had brought down 38
  //    tests of other suites reading in parallel (31/07/2026).
  // ⚠️ The fixtures stay FRENCH: they are matched by the OUVERT/FERME regexes,
  //    which are data of the French backlog.
  const sabote = [
    '## 🔴 CHANTIER SOI-DISANT OUVERT',
    '### ① ✅ RÉSOLU le 01/01',
    '### ② LIVRÉ le 02/01',
  ].join('\n');
  assert.strictEqual(menteuses(sabote).length, 1, 'the gate does not see a false heading: it is INERT');

  // Counter-check: a genuinely open section must NOT be reported.
  const sain = ['## 🔴 VRAI CHANTIER', '### ① ✅ RÉSOLU', '### ② encore à faire'].join('\n');
  assert.deepStrictEqual(menteuses(sain), [], 'false positive: a section with remaining work is reported');

  // Counter-check: a section without sub-sections is out of scope.
  assert.deepStrictEqual(menteuses('## 🔴 SANS SOUS-SECTION'), [], 'a section without a subtitle must trigger nothing');
});

// ─────────────────────────────────────────────────────────────────────────
// PART ④ (12/08/2026) — THE "WHAT REMAINS OPEN" TABLE CAN NO LONGER LIE
// ─────────────────────────────────────────────────────────────────────────
// 🔴 BORN OF A REAL OVERSIGHT, AND IT COST A WHOLE SESSION: ㊴ and ㊵ — the
//    TWO priority pieces of work, written the day before — were NOT in the
//    table. An agent read the backlog header (hence the table, which declares
//    itself "a COMPLETE list, nothing else lives elsewhere"), concluded "only
//    comfort items remain", and worked on something else all session.
// 🛑 THE DOCTRINE ALREADY SAYS "write the TARGET, never the progress alone"
//    and the table announces itself as COMPLETE. The prose instruction did not
//    hold ⇒ it becomes mechanical, like parts ①-③ before it.
// ⚠️ SCOPE = the OPEN sections that carry a NUMBER. Measured BEFORE writing
//    (12/08/2026): 2 numbered sections, 3 unnumbered, 21 table rows ⇒ the gate
//    targets EXACTLY the identifiable pieces of work and ignores the narrative
//    sections, hence ZERO false positive. An unnumbered piece of work is not
//    referenceable: demanding a table row for it would be noise, and a noisy
//    gate ends up unplugged.
// ⚠️ IT DOES NOT PROVE that a piece of work still exists in the code
//    (undecidable, same limit as parts ①-③): it proves that **what the backlog
//    declares open is REACHABLE from its table**.
const NUMERO = /[\u3220-\u3229\u3248-\u324F\u32B1-\u32BF\u2460-\u24FF\u3251-\u325F]/u;

/** `## … OUVERT …` sections carrying a number, absent from the table. */
function ouvertesHorsTable(texte) {
  const l = texte.split('\n');
  const ouvertes = l.filter((x) => x.startsWith('## ') && x.includes('OUVERT') && NUMERO.test(x));
  const debut = l.findIndex((x) => x.includes('CE QUI RESTE OUVERT'));
  if (debut === -1) return ouvertes.map((s) => s.slice(0, 80));
  let fin = debut + 1;
  while (fin < l.length && !l[fin].startsWith('## ')) fin++;
  const table = l.slice(debut, fin).filter((x) => x.startsWith('| '));
  return ouvertes
    .filter((s) => !table.some((t) => t.includes(s.match(NUMERO)[0])))
    .map((s) => s.slice(0, 80));
}

test.skipIf(!planPresent)('④ every numbered OPEN piece of work appears in the "CE QUI RESTE OUVERT" table', () => {
  const texte = fs.readFileSync(PLAN, 'utf8');
  assert.deepStrictEqual(
    ouvertesHorsTable(texte),
    [],
    'OPEN PIECE OF WORK INVISIBLE FROM THE TABLE — the table declares itself COMPLETE.\n'
    + 'An agent reading the header will NEVER see these (it happened, 11-12/08):\n  ');
});

test('④ NEGATIVE — part ④ bites (IN-MEMORY sabotage, never the real file)', () => {
  // ⚠️ The fixtures stay FRENCH: the section titles are matched against the
  //    literal markers of the French backlog ("OUVERT", "CE QUI RESTE OUVERT").
  const entete = '## 📋 CE QUI RESTE OUVERT — list COMPLÈTE\n| # | Chantier | État |\n|---|---|---|\n';
  // An open piece of work ABSENT from the table = RED.
  const sabote = entete + '| ⑨ | déjà listé | 🟠 |\n\n## ㊴ 🔴 OUVERT — asymétrie\ndu texte\n';
  assert.strictEqual(ouvertesHorsTable(sabote).length, 1, 'the gate does not see a piece of work outside the table: it is INERT');
  // The same one, LISTED, must no longer trigger anything.
  const sain = entete + '| ㊴ | asymétrie | 🔴 |\n\n## ㊴ 🔴 OUVERT — asymétrie\ndu texte\n';
  assert.deepStrictEqual(ouvertesHorsTable(sain), [], 'false positive: a listed piece of work is reported');
  // An open section WITHOUT a number stays out of scope (measured: 3 in reality).
  assert.deepStrictEqual(ouvertesHorsTable(entete + '\n## 🔴 OUVERT — récit sans numéro\n'), []);
  // Table absent ⇒ we report, never a reassuring silence.
  assert.strictEqual(ouvertesHorsTable('## ㊵ 🔴 OUVERT — sans table').length, 1);
});
