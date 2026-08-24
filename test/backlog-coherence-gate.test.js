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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import paths from '../src/paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The environment with the WHOLE `GIT_*` family scrubbed.
 * 🛑 git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE` to every hook it runs, a child
 *    INHERITS them, and they BEAT `-C`/`cwd` alike — measured 2026-08-21, a
 *    `git` aimed elsewhere acted on the REAL repository. Here it would read
 *    ANOTHER repository's history and answer about commits nobody wrote.
 *    Sealed by `git-env-door-gate.test.js`. SINGLE definition: two copies of
 *    this scrub would let one of them silently stop scrubbing.
 * ⚠️ A CONST BINDING, NOT A `function` DECLARATION: `git-env-door-gate` proves the
 *    scrub by looking for a BINDING whose initialiser deletes `GIT_*` keys. Declared
 *    as a function it scrubbed correctly and the judge could not SEE it — fail-closed,
 *    so it accused instead of letting it through, which is the right direction.
 */
const sansGit = () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
};

// ⚠️ Deliberately BROAD markers: the backlog is written by hand, in French,
//    by successive agents. A narrow vocabulary would make the gate inert at
//    the first synonym — the trap of the 03/08 purity gates.
// 🛑 THESE TWO REGEXES ARE DATA MATCHED AGAINST THE FRENCH BACKLOG FILE:
//    never translate their alternatives, they would stop matching. Same for
//    the French fixtures of the negative-checks below.
const OPEN = /🔴|🟠|🟡|OUVERT|BACKLOG/;
const CLOSED = /✅|FERMÉ|FERME|RÉSOLU|RESOLU|LIVRÉ|LIVRE|TRAITÉ|TRAITE|EXÉCUTÉ|EXECUTE/;

/** Splits the backlog into `## …` sections carrying their `### …` subtitles. */
function sections(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let courante = null;
  for (const l of lines) {
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
function lying(text) {
  return sections(text)
    .filter((s) => s.sous.length > 0)
    .filter((s) => OPEN.test(s.titre) && !CLOSED.test(s.titre))
    .filter((s) => s.sous.every((t) => CLOSED.test(t)))
    .map((s) => s.titre.slice(0, 100));
}

// ⚠️ The work journal is PRIVATE (untracked since 2026-08-16): a public clone
//    does not have it. Clean skip — the gate only guards the maintainer's copy.
// 🛑 IT IS RESOLVED THROUGH `paths.js`, NEVER FROM THIS FILE'S OWN `__dirname`
//    (2026-08-22). Being untracked, the journal follows no branch, no merge and
//    no checkout: read at `<worktree>/REFACTOR-PLAN.md` it was a DIFFERENT
//    PHYSICAL FILE per worktree, and the copies diverged by 75 lines on the
//    same commit — this very gate then accused rows already rewritten in the
//    other tree. One copy, in the repository's COMMON directory, for everyone.
// ⚠️ A resolution FAILURE is not a fallback: `planPath()` throws a named
//    refusal, and a repository so broken that git cannot answer is treated
//    exactly like the public clone above — out of scope, never "all is well".
const PLAN = (() => { try { return paths.planPath(); } catch { return null; } })();
const planPresent = PLAN !== null && fs.existsSync(PLAN);

test.skipIf(!planPresent)('no REFACTOR-PLAN heading announces as open what is entirely closed', () => {
  const text = fs.readFileSync(PLAN, 'utf8');
  const faux = lying(text);
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
function sectionCommits(text) {
  const lines = text.split(/\r?\n/);
  const debut = lines.findIndex((l) => /^##\s+Les\s+\d+\s+commits/.test(l));
  if (debut === -1) return null;
  const rest = lines.slice(debut + 1);
  const fin = rest.findIndex((l) => /^##\s/.test(l));
  return { titre: lines[debut], body: (fin === -1 ? rest : rest.slice(0, fin)).join('\n') };
}

/** `null` if everything is fine, otherwise the incoherence message. */
function wrongCount(text) {
  const s = sectionCommits(text);
  if (s === null) return null; // section absent = out of scope (never noise)
  const announcement = Number(s.titre.match(/Les\s+(\d+)\s+commits/)[1]);
  // ⚠️ 7 to 40 hex chars between backticks: the shape under which the backlog
  //    cites a fingerprint. A `Set` because the same one may serve as proof
  //    further down.
  const citedHashes = new Set((s.body.match(/`[0-9a-f]{7,40}`/g) || []));
  if (citedHashes.size !== announcement) {
    return `the header announces ${announcement} commits but cites ${citedHashes.size}: ` +
      [...citedHashes].join(' ');
  }
  return null;
}

test.skipIf(!planPresent)('㉚ — the commit count in the backlog header is coherent', () => {
  const text = fs.readFileSync(PLAN, 'utf8');
  const faux = wrongCount(text);
  assert.strictEqual(faux, null,
    'Incoherent header — recount BEFORE committing:\n  ' + faux);
});

test('㉚ NEGATIVE — the count really goes red (IN-MEMORY sabotage)', () => {
  // The REAL case of 07/08/2026: title says 10, list has 9.
  const faux = ['## Les 10 commits du jour', '`aaaaaaa` un · `bbbbbbb` deux'].join('\n');
  assert.ok(wrongCount(faux) !== null, 'the gate does not see a false count: it is INERT');

  // Counter-check ①: correct count ⇒ silence, including a fingerprint repeated as proof.
  const healthy = ['## Les 2 commits du jour', '`aaaaaaa` un · `bbbbbbb` deux', 'CI verte sur `bbbbbbb`.'].join('\n');
  assert.strictEqual(wrongCount(healthy), null, 'false positive: a fingerprint cited twice inflates the count');

  // Counter-check ②: no census section ⇒ out of scope.
  assert.strictEqual(wrongCount('## Autre chose'), null, 'a header without a census must trigger nothing');
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
// 🔴 AND FOR SIX DAYS IT WAS A GREEN JUDGE THAT SAW NOTHING — this
//    repository's worst defect class, in the file that exists to forbid it.
//    It armed itself on `git status --porcelain -- REFACTOR-PLAN.md`, and the
//    journal has been GITIGNORED since 2026-08-16. **git answers ZERO lines
//    for an ignored path, always**, so the part returned `null` — "out of
//    scope" — on EVERY run since, through complete green suites.
//    MEASURED 2026-08-22: `status --porcelain` = 0 lines · `check-ignore -v`
//    naming `.gitignore:36:REFACTOR-PLAN.md` · `ls-files` = 0 · and
//    `git log -1 -- REFACTOR-PLAN.md` = EMPTY, so the ANCHOR was dead too.
//    Two dead signals, one silence. Since 2026-08-22 the file does not even
//    live in a work tree: no command on a tracked path will ever see it.
//
// ✅ WHAT REPLACES BOTH SIGNALS — FACTS OF THE FILE AND OF THE HISTORY, WITH
//    **NO STORED STATE AT ALL**, and that absence is the design, not a saving:
//    ① THE GESTURE = the journal is FRESHER THAN HEAD (`mtime` > HEAD's commit
//      date). That is the very predicate `git status` used to express — "written
//      since the last commit" — read off the FILE instead of off an index that
//      refuses to look at it. 🛑 Nothing remembers a previous digest: a file
//      made to carry a conversation between runs is a class this project has
//      already paid for, and one run here would need two.
//    ② THE ANCHOR = the NEWEST commit the header CITES. "The previous edition
//      of the header" died with the file's tracking; what the header names is
//      the only fact left that dates it, and it is written by the same hand
//      this part judges.
//    ⇒ every commit newer than that anchor must be cited.
//
// 🛑 HONEST SCOPE, NARROWER THAN THE 08/08 VERSION — DO NOT SELL IT WIDER.
//    It proves the header is STALE: it names nothing newer than commit X while
//    N commits exist after X. It NO LONGER catches an omission in the MIDDLE
//    of a cited range, which the tracked-file anchor could. That capability
//    died with the tracking, and claiming it would be the lying doc this
//    repository refuses (same honesty as parts ①-② and `doc-drift-gate`).
//
// ⚠️ ANTI-VACUITY, AND IT IS THE WHOLE REPAIR: every `null` below is spent on
//    a question that genuinely does not arise, NEVER on "I could not measure".
//    In particular a header citing NONE of the reachable commits is **RED**,
//    never silent — a dead anchor used to look EXACTLY like that case, and
//    answering `null` there is how this part slept for six days.
//
// 🛑 IT ONLY FIRES WHILE THE JOURNAL IS FRESHER THAN HEAD, and that guardrail
//    is NOT a detail: without it, the first code commit following a header
//    update would go RED, which would force rewriting the header at EVERY
//    commit. The gate would then target normal work instead of the oversight —
//    a noisy gate is a gate people stop reading, then work around. It also
//    re-arms and disarms ON ITS OWN: commit, and HEAD's date passes the
//    journal's mtime, so the part goes quiet until the journal is written
//    again. That is exactly when the oversight happens.
//
// 🛑 MUTE ON A SHALLOW CLONE (CI) — `actions/checkout@v5` clones with
//    `fetch-depth: 1`: the history does NOT exist there. Identical precedent
//    in this repo (`alarme-capacite` SKIPs on a fresh clone). This part is
//    therefore LOCAL, and that is the right place: the header is written
//    locally, never in CI.

/**
 * Returns the short fingerprints newer than the newest one the header cites,
 * or `null` when the question does not arise (no git, shallow clone, journal
 * not written since the last commit, no history at all).
 * ⚠️ `null` = OUT OF SCOPE, never "all is well" — this part slept for six days
 *    behind a `null` that meant "I cannot measure".
 * @param {Function} execFile injected so the decision can be driven without a repository
 * @param {string} racine the repository to interrogate
 * @param {string} tete the journal's header text
 * @param {number} journalMtimeSec the journal's mtime, in SECONDS since the epoch
 */
function forgottenCommits(execFile, racine, head, journalMtimeSec) {
  const git = (...a) => execFile('git', ['-C', racine, ...a], { env: sansGit(), encoding: 'utf8' });
  let headDate, lines;
  try {
    // A shallow clone has no history: any range would be wrong there.
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') return null;
    headDate = Number(git('log', '-1', '--format=%ct', 'HEAD').trim());
    const brut = git('log', '--format=%h %s', 'HEAD').trim();
    lines = brut === '' ? [] : brut.split('\n');
  } catch {
    return null; // no git, no blame (the framework installs without it)
  }
  // No history to describe, or a date git did not give us: nothing to judge.
  if (!Number.isFinite(headDate) || lines.length === 0) return null;
  // THE GESTURE WE WATCH: the journal has been written since the last commit.
  if (!(journalMtimeSec > headDate)) return null;
  // `lignes` is newest-first. The anchor is the first one the header cites;
  // 🛑 NOT FOUND ⇒ the header names NOTHING of this history, which is the
  //    strongest possible staleness — RED, never the reassuring `null`.
  const anchor = lines.findIndex((l) => head.includes(l.split(' ')[0]));
  const plage = anchor === -1 ? lines : lines.slice(0, anchor);
  return plage.filter((l) => !head.includes(l.split(' ')[0])).map((l) => l.slice(0, 72));
}

test.skipIf(!planPresent)('㉜ — the header, once written since the last commit, cites everything newer than the newest commit it names', () => {
  const text = fs.readFileSync(PLAN, 'utf8');
  const head = text.split('## 📋 CE QUI RESTE')[0];
  const mtimeSec = fs.statSync(PLAN).mtimeMs / 1000;
  const forgottenOnes = forgottenCommits(execFileSync, HERE, head, mtimeSec);
  if (forgottenOnes === null) return; // out of scope — cf the comment above
  assert.deepStrictEqual(forgottenOnes, [],
    `The backlog header is STALE: it was written AFTER the last commit and names `
    + `NONE of these ${forgottenOnes.length} commit(s), which are newer than everything it cites.\n  `
    + forgottenOnes.join('\n  ')
    + '\n  🛑 Cite them in the header (or write the session that produced them) — this is the ㉜ omission.');
});

test('㉜ NEGATIVE — the part really goes red, and really stays silent (SIMULATED git)', () => {
  // ⚠️ git is SIMULATED: we touch neither the real repository nor a real file.
  //    A fake `execFile` makes the part testable without depending on the state
  //    of the repository at run time — otherwise this test would be green or
  //    red according to the mood of the working tree, hence unusable.
  // ⚠️ `log -1 --format=%ct HEAD` answers a date, the bare `log` the history.
  const faux = (responses) => (_bin, args) => {
    if (args.includes('--is-shallow-repository')) return responses.shallow ?? 'false\n';
    if (args.includes('-1')) return responses.headDate ?? '1000\n';
    return responses.log ?? '';
  };
  // The journal was written one second after HEAD ⇒ the gesture is armed.
  const ARMED = 1001;
  const HISTORY = 'c9b3dcf doc(budget): bound re-measured\nabc1234 feat(gate): earlier work';

  // ① THE REAL CASE OF 08/08/2026 (and of 22/08): the journal is fresh, and a
  //    commit newer than everything it names is cited nowhere.
  const missingOne = forgottenCommits(faux({ log: HISTORY }), '.', 'the header names `abc1234`', ARMED);
  assert.deepStrictEqual(missingOne.map((l) => l.split(' ')[0]), ['c9b3dcf'],
    'the part does not see a forgotten commit: it is INERT');

  // ② Counter-check: the same commit CITED ⇒ silence.
  assert.deepStrictEqual(
    forgottenCommits(faux({ log: HISTORY }), '.', 'names `c9b3dcf` and `abc1234`', ARMED),
    [], 'false positive: a commit that is cited is still reported');

  // ③ THE ANTI-NOISE GUARDRAIL: the journal is NOT fresher than HEAD ⇒ out of
  //    scope, even with commits piled up. Without it, every code commit would
  //    require rewriting the header.
  assert.strictEqual(
    forgottenCommits(faux({ log: HISTORY }), '.', 'whatever', 1000),
    null, 'the part speaks while the journal is untouched: it will be worked around');
  assert.strictEqual(
    forgottenCommits(faux({ log: HISTORY }), '.', 'whatever', 999),
    null, 'a journal OLDER than HEAD still arms the part');

  // ④ ANTI-VACUITY — the header names NOTHING of the history ⇒ RED, never a
  //    reassuring silence. 🛑 THIS IS THE CELL THE SIX-DAY SLEEP NEEDED: a
  //    dead anchor is indistinguishable from a healthy header unless this
  //    case is loud.
  const nothing = forgottenCommits(faux({ log: HISTORY }), '.', 'a header naming no commit at all', ARMED);
  assert.deepStrictEqual(nothing.map((l) => l.split(' ')[0]), ['c9b3dcf', 'abc1234'],
    'a header citing NOTHING passes: the part measures nothing and says nothing');

  // ⑤ SHALLOW CLONE (the CI) ⇒ mute, never a red based on emptiness.
  assert.strictEqual(
    forgottenCommits(faux({ shallow: 'true\n', log: HISTORY }), '.', 'whatever', ARMED),
    null, 'the part would go red in CI, where the history DOES NOT EXIST');

  // ⑥ A repository with NO commit yet ⇒ nothing to describe, never a red.
  assert.strictEqual(
    forgottenCommits(faux({ log: '' }), '.', 'whatever', ARMED),
    null, 'a fresh repository without a single commit turns the part red');

  // ⑦ TOTAL: git absent ⇒ silence, never a suite failure.
  assert.strictEqual(
    forgottenCommits(() => { throw new Error('git not found'); }, '.', '', ARMED),
    null, 'a workstation without git would bring the suite down');
});

test('NEGATIVE — the gate really goes red (IN-MEMORY sabotage, never the real file)', () => {
  // ⚠️ IN MEMORY, NOT ON DISK: a sabotage on a real file had brought down 38
  //    tests of other suites reading in parallel (31/07/2026).
  // ⚠️ The fixtures stay FRENCH: they are matched by the OUVERT/FERME regexes,
  //    which are data of the French backlog.
  const sabotage = [
    '## 🔴 CHANTIER SOI-DISANT OUVERT',
    '### ① ✅ RÉSOLU le 01/01',
    '### ② LIVRÉ le 02/01',
  ].join('\n');
  assert.strictEqual(lying(sabotage).length, 1, 'the gate does not see a false heading: it is INERT');

  // Counter-check: a genuinely open section must NOT be reported.
  const healthy = ['## 🔴 VRAI CHANTIER', '### ① ✅ RÉSOLU', '### ② encore à faire'].join('\n');
  assert.deepStrictEqual(lying(healthy), [], 'false positive: a section with remaining work is reported');

  // Counter-check: a section without sub-sections is out of scope.
  assert.deepStrictEqual(lying('## 🔴 SANS SOUS-SECTION'), [], 'a section without a subtitle must trigger nothing');
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
const NUMBER = /[\u3220-\u3229\u3248-\u324F\u32B1-\u32BF\u2460-\u24FF\u3251-\u325F]/u;

/** `## … OUVERT …` sections carrying a number, absent from the table. */
function openOutsideTable(text) {
  const l = text.split('\n');
  const openRows = l.filter((x) => x.startsWith('## ') && x.includes('OUVERT') && NUMBER.test(x));
  const debut = l.findIndex((x) => x.includes('CE QUI RESTE OUVERT'));
  if (debut === -1) return openRows.map((s) => s.slice(0, 80));
  let fin = debut + 1;
  while (fin < l.length && !l[fin].startsWith('## ')) fin++;
  const table = l.slice(debut, fin).filter((x) => x.startsWith('| '));
  return openRows
    .filter((s) => !table.some((t) => t.includes(s.match(NUMBER)[0])))
    .map((s) => s.slice(0, 80));
}

test.skipIf(!planPresent)('④ every numbered OPEN piece of work appears in the "CE QUI RESTE OUVERT" table', () => {
  const text = fs.readFileSync(PLAN, 'utf8');
  assert.deepStrictEqual(
    openOutsideTable(text),
    [],
    'OPEN PIECE OF WORK INVISIBLE FROM THE TABLE — the table declares itself COMPLETE.\n'
    + 'An agent reading the header will NEVER see these (it happened, 11-12/08):\n  ');
});

// ─────────────────────────────────────────────────────────────────────────
// PART ⑤ (21/08/2026) — A ROW OF THE TABLE MAY NOT BE STALE EITHER
// ─────────────────────────────────────────────────────────────────────────
// 🔴 THE SYMMETRIC BLIND SPOT OF PART ④, AND IT HAS THE SAME COST. ④ requires
//    every OPEN piece of work to be IN the table; it NEVER requires everything
//    in the table to be OPEN. Measured 14/08/2026: **25 rows of which 14
//    CLOSED** — a table saying the opposite of its title for more than half of
//    it. Measured AGAIN 21/08/2026 on the rebuilt table: **10 rows, 5 closed
//    the same day** (the corpus cache, the snapshot count, `state/` eviction,
//    the shadow relic, the frame-boundary differential) and 2 delivered by
//    HALF. An agent resuming reads the head and misses the real work — by
//    DROWNING instead of by absence, at the price already paid with ㊴/㊵.
//
// 🛑 WHY THERE WAS NO GATE UNTIL TODAY, AND WHY THAT VERDICT IS REVERSED.
//    `steering.md` wrote that deciding mechanically that a row is closed
//    "is readable today from the emoji of the last cell but fragile; to be
//    measured before writing a gate". **Measured before writing anything**:
//    the active table carries a STATUS COLUMN — the last cell — filled by the
//    author, and its vocabulary is closed (9 `OUVERT…` cells and 1 `FERME`
//    cell at the time of measurement). That is not a guessed emoji, it is a
//    column that already exists. ⇒ DECIDABLE, hence a gate.
//
// ⚠️ SCOPE = THE FIRST `CE QUI RESTE OUVERT` TABLE, i.e. the ACTIVE one. The
//    file carries HISTORICAL tables further down (a former head of 12/08 among
//    them) that legitimately hold closed rows: scanning them would make the
//    gate accuse the archive, and a noisy gate ends up unplugged. Same anchor
//    as part ④, deliberately — two anchors for one table would diverge.
//
// 🛑 IT DOES NOT PROVE that a piece of work still lives in the CODE — that is
//    undecidable here, same honesty as parts ①-④ and as `doc-drift-gate`. It
//    proves that **the table does not contradict its own title**.
//
// ⚠️ ANTI-VACUITY, AND IT IS LOAD-BEARING: a MIS-PARSED table looks EXACTLY
//    like a perfectly coherent one — zero rows, zero findings, green. Three
//    floors, all far below the measurement (5 rows on 21/08): the table must
//    be reachable, the separator row must be found, and at least
//    `PLANCHER_LIGNES` rows must be parsed.
// ⚠️ AND AN UNCLASSIFIABLE STATUS IS RED, never ignored: renaming the states
//    would otherwise silence the gate in silence, the one failure this repo
//    refuses outright. An AMBIGUOUS cell (both vocabularies at once) is RED for
//    the same reason — a reader must never have to guess.
const LINE_FLOOR = 3;
// A markdown separator row: pipes, dashes, colons and spaces, nothing else.
const SEPARATOR = /^\|[\s:|-]+\|\s*$/;

/** The cells of one markdown row, outer pipes stripped. */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * `null` when the ACTIVE table is coherent, otherwise the message naming what
 * is wrong. ⚠️ Never `null` for "I could not read it" — that direction is
 * exactly the silent green this part exists to forbid.
 */
function incoherentTable(text) {
  const l = text.split('\n');
  const debut = l.findIndex((x) => x.includes('CE QUI RESTE OUVERT'));
  if (debut === -1) {
    return 'the "CE QUI RESTE OUVERT" table is UNREACHABLE: the backlog no longer '
      + 'declares what is open, and part ④ has nothing to check against either.';
  }
  let fin = debut + 1;
  while (fin < l.length && !l[fin].startsWith('## ')) fin++;
  const brutes = l.slice(debut, fin).filter((x) => x.trim().startsWith('|'));
  const sep = brutes.findIndex((x) => SEPARATOR.test(x));
  if (sep === -1) return 'the table has no separator row: it was not parsed, and a table nobody parsed looks EXACTLY like a coherent one.';
  const lines = brutes.slice(sep + 1);
  if (lines.length < LINE_FLOOR) {
    return `only ${lines.length} row(s) parsed (floor ${LINE_FLOOR}): the scan measured almost nothing, which is indistinguishable from a healthy table.`;
  }
  /** @type {string[]} */
  const offendingLines = [];
  for (const line of lines) {
    const cs = cells(line).filter((c) => c !== '');
    const status = cs.length > 0 ? cs[cs.length - 1] : '';
    const open = OPEN.test(status);
    const closed = CLOSED.test(status);
    if (open && !closed) continue;
    const what = closed && !open ? 'CLOSED — it belongs in REFACTOR-ARCHIVE.md' : 'status UNDECIDABLE';
    offendingLines.push(`${cs.length > 0 ? cs[0] : '?'} → "${status.slice(0, 60)}" (${what})`);
  }
  if (offendingLines.length > 0) {
    return 'ROW(S) THAT CONTRADICT THE TITLE of a table declaring itself COMPLETE:\n  '
      + offendingLines.join('\n  ')
      + '\n  🛑 A closed row MOVES to REFACTOR-ARCHIVE.md WITH its date and its proof — it is never deleted.';
  }
  return null;
}

test.skipIf(!planPresent)('⑤ every row of the "CE QUI RESTE OUVERT" table is really OPEN', () => {
  const text = fs.readFileSync(PLAN, 'utf8');
  assert.strictEqual(incoherentTable(text), null, String(incoherentTable(text)));
});

test('⑤ NEGATIVE — part ⑤ bites (IN-MEMORY sabotage, never the real file)', () => {
  // ⚠️ IN MEMORY: a sabotage on a real file had brought down 38 tests of other
  //    suites reading in parallel (31/07/2026).
  // ⚠️ The fixtures stay FRENCH: the status cells are matched by the
  //    OUVERT/FERME regexes, which are data of the French backlog.
  const header = [
    '## CE QUI RESTE OUVERT (liste COMPLETE)',
    '',
    '| # | Sujet | Etat |',
    '|---|---|---|',
  ].join('\n');
  const healthy = [header,
    '| A | cablage | OUVERT, decision operateur |',
    '| D | http en dernier | OUVERT, apres A |',
    '| E | alarme capacite | OUVERT |',
    '',
    '## Autre section',
  ].join('\n');
  assert.strictEqual(incoherentTable(healthy), null, 'false positive: a table of genuinely open rows is reported');

  // ① THE REAL CASE OF 21/08/2026: a row closed the same day, left in the table.
  const staleRow = healthy.replace('| E | alarme capacite | OUVERT |', '| F | WI-STATE-EVICTION | FERME |');
  assert.ok(incoherentTable(staleRow) !== null, 'the gate does not see a CLOSED row in the table: it is INERT');

  // ②bis The same closed row living in the ARCHIVE stays out of scope: the part
  //      reads the backlog's ACTIVE table, never a historical one further down.
  const archive = [healthy, '', '## Archive', '| F | WI-STATE-EVICTION | FERME |'].join('\n');
  assert.strictEqual(incoherentTable(archive), null, 'the part accuses a table outside its scope: it will be worked around');

  // ② A RENAMED STATUS MUST NOT SILENCE IT — the silent failure this forbids.
  const unclassifiable = healthy.replace('| E | alarme capacite | OUVERT |', '| E | alarme capacite | en cours |');
  assert.ok(incoherentTable(unclassifiable) !== null, 'an unclassifiable status goes through: renaming the states would silence the gate');

  // ③ AMBIGUOUS (both vocabularies at once) ⇒ RED, never a guess.
  const ambiguous = healthy.replace('| E | alarme capacite | OUVERT |', '| E | alarme capacite | OUVERT mais LIVRÉ |');
  assert.ok(incoherentTable(ambiguous) !== null, 'an ambiguous status is read as open: the reader is left guessing');

  // ④ ANTI-VACUITY — a mis-parsed table looks exactly like a coherent one.
  assert.ok(incoherentTable(header) !== null, 'an EMPTY table passes: the gate measures nothing and says nothing');
  assert.ok(incoherentTable('## CE QUI RESTE OUVERT\n| A | x | OUVERT |\n') !== null,
    'a table with no separator row passes: it was never parsed');
  assert.ok(incoherentTable('## Rien du tout') !== null,
    'the table having VANISHED passes: the backlog would stop declaring what is open, silently');
});

test('④ NEGATIVE — part ④ bites (IN-MEMORY sabotage, never the real file)', () => {
  // ⚠️ The fixtures stay FRENCH: the section titles are matched against the
  //    literal markers of the French backlog ("OUVERT", "CE QUI RESTE OUVERT").
  const header = '## 📋 CE QUI RESTE OUVERT — list COMPLÈTE\n| # | Chantier | État |\n|---|---|---|\n';
  // An open piece of work ABSENT from the table = RED.
  const sabotage = header + '| ⑨ | déjà listé | 🟠 |\n\n## ㊴ 🔴 OUVERT — asymétrie\ndu texte\n';
  assert.strictEqual(openOutsideTable(sabotage).length, 1, 'the gate does not see a piece of work outside the table: it is INERT');
  // The same one, LISTED, must no longer trigger anything.
  const healthy = header + '| ㊴ | asymétrie | 🔴 |\n\n## ㊴ 🔴 OUVERT — asymétrie\ndu texte\n';
  assert.deepStrictEqual(openOutsideTable(healthy), [], 'false positive: a listed piece of work is reported');
  // An open section WITHOUT a number stays out of scope (measured: 3 in reality).
  assert.deepStrictEqual(openOutsideTable(header + '\n## 🔴 OUVERT — récit sans numéro\n'), []);
  // Table absent ⇒ we report, never a reassuring silence.
  assert.strictEqual(openOutsideTable('## ㊵ 🔴 OUVERT — sans table').length, 1);
});
