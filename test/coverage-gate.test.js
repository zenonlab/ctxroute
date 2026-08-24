// ═══════════════════════════════════════════════════════════════════════
// COVERAGE GATE — the repo documents ITSELF, or it goes red.
// ═══════════════════════════════════════════════════════════════════════
//
// RAISON D'ÊTRE (31/07/2026): an audit found THREE classes of oversight, and
// each had already struck — two of them BEFORE this piece of work, without
// anybody seeing them:
//   ① 3 suites with no injectable doc (2 from this work + 1 pre-existing);
//   ② 7 TRACKED files missing from the skill's file map (5 of them from an
//      earlier piece of work);
//   ③ `pretool-core.js`/`guard-core.js` missing from dependency-cruiser's
//      `includeOnly` — hence NEVER analysed, a silent false negative.
// They were filled in by hand. ⚠️ That is exactly what the doctrine forbids:
// "an unsealed error class WILL COME BACK". This file seals it — the
// oversight becomes RED instead of waiting for the next audit.
//
// ⚠️ NO COPIED LIST: everything is DERIVED (files = `git ls-files`, rules =
//    the real fleet through the loader). A hand-maintained list would be the
//    4th class of the same bug.
//
// ⚠️ Parts ① and ② depend on the FLEET/SKILL (outside the repo) ⇒ clean skip
//    on a fresh clone, like parc-sync-gate. Part ③ is 100 % repo: it holds
//    everywhere, all the time.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCorpus } from '../src/corpus.js';
import { rulesFromCorpus } from '../src/loader.js';
import fileSource from '../src/sources/file.js';
import { DEFAULT_BUDGET } from '../src/budget.js';

// ⚠️ DERIVED from the engine, never copied: the ceiling of NEW skills is the
//    emission budget itself. A hardcoded number here would diverge from
//    budget.js in silence — the very bug class this whole file fights.
const FRESH_BUDGET = DEFAULT_BUDGET;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Same source as the ENGINE (paths.fileDocsDir honours CTXROUTE_FILEDOCS_DIR):
// the gate judges the fleet the gate really reads, never a copied path.
const FLEET = require('../src/paths.js').fileDocsDir();
const SKILL = path.join(os.homedir(), '.claude', 'commands', 'ctxroute.md');
// File map moved out of the skill on 31/07/2026 (progressive disclosure) — cf part ②.
const FILE_MAP = path.join(HERE, '..', 'FILE-MAP.md');

// ⚠️ ㉟① (16/08/2026): TRACKED **∪ UNTRACKED but not ignored** — never
//    `ls-files` alone. "What a gate draws its list from defines its blind
//    spot": derived from tracked files, this gate stayed GREEN 4/4 on 18
//    files of a whole session never committed (measured 16/08/2026) — a new
//    file was only covered from its commit onward, that is AFTER the review
//    it does not get. `--exclude-standard` honours .gitignore: IGNORED drafts
//    do not go red (the measured noise that had made the idea be dropped on
//    08/08 — the answer was not "give up" but "honour the ignore").
// 🔴 **THE PERIMETER WAS THE `test/` FOLDER, NOT THE REPOSITORY — MEASURED 2026-08-20.**
//    `git ls-files` run with `cwd` inside a subdirectory lists THAT subdirectory,
//    relative to it. So this gate, which announces "every module of the repo",
//    was judging **94 test files and ZERO module**; part ③ was judging **0 files
//    at all**. It had been that way since the src-layout migration moved the
//    engine under `src/` — every file there matched neither `!includes('/')`
//    nor `startsWith('sources/')`.
// 🛑 THE ANTI-VACUITY FLOOR DID NOT SAVE US, AND THAT IS THE REAL LESSON. Part ①
//    counts `targets.length > 20` and there were 94 — the floor was satisfied by
//    the WRONG corpus. **A floor measures a QUANTITY, never an IDENTITY**: it
//    catches a perimeter that collapsed to nothing, never one that aims
//    somewhere else. Do not conclude a gate is alive because its floor passes.
// ✅ The root is now MEASURED by the authority that knows it (`git rev-parse
//    --show-toplevel`), never inferred from where the test file happens to sit —
//    the same repair `leak-gate.test.js` received this morning, in a class that
//    was fixed in ONE file instead of being swept everywhere it lives.
// 🛑 SCRUB THE WHOLE `GIT_*` FAMILY BEFORE SPAWNING `git`. Git EXPORTS
//    `GIT_DIR`/`GIT_INDEX_FILE` to every hook it runs, a child INHERITS them,
//    and they BEAT `cwd` — measured 2026-08-21: a `git` aimed at a sandbox
//    wrote into the REAL index, and `--show-toplevel` under a poisoned env
//    answers about somebody else's repository. Never "unset the right one":
//    nobody can enumerate what a future git version exports. Sealed repo-wide
//    by `git-env-door-gate.test.js`.
const ENV_WITHOUT_GIT = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
  return e;
})();

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: HERE, env: ENV_WITHOUT_GIT, encoding: 'utf8',
}).trim();

const trackedFiles = () => {
  const git = (args) =>
    execFileSync('git', args, { cwd: REPO_ROOT, env: ENV_WITHOUT_GIT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  return [...new Set([...git(['ls-files']), ...git(['ls-files', '--others', '--exclude-standard'])])];
};

// A file is "covered" if a fleet rule REALLY matches it — measured by the
// real source, never by a name heuristic.
function docsPour(rules, relPath) {
  const abs = path.join(HERE, relPath).replace(/\\/g, '/');
  return fileSource.matchingDocs(rules, { toolName: 'Read', toolInput: { file_path: abs } });
}

test('① every module and every suite of the repo gets an injectable doc', () => {
  if (!fs.existsSync(FLEET)) return; // fresh clone: nothing to measure
  const rules = rulesFromCorpus(readCorpus(FLEET, 'docs/'));
  assert.ok(rules.length > 0, 'fleet read but NO rule: the probe would prove nothing');

  // DERIVED perimeter: the .js at the root and in sources/ (the code and its
  // suites). Excludes .example/config — their doc is carried otherwise.
  // ⚠️ MODULES **AND** SUITES, as the title says. Before the root was repaired
  //    this list held ONLY the suites — the modules were never required to have
  //    a doc at all, and `http-server.js` shipped with one purely by goodwill.
  const targets = trackedFiles().filter(
    (f) => f.endsWith('.js')
      && (!f.includes('/') || f.startsWith('src/') || f.startsWith('tools/') || f.startsWith('test/'))
  );
  // 🛑 A FLOOR MEASURES A QUANTITY, NEVER AN IDENTITY — 2026-08-20, paid here.
  //    This very assertion passed on 94 TEST files while judging zero modules.
  //    So the floor is kept AND doubled with a check on the SHAPE of the corpus:
  //    both families must really be present, or the perimeter has drifted again.
  assert.ok(targets.length > 20, 'suspicious perimeter (too few files): blind gate');
  assert.ok(targets.some((f) => f.startsWith('src/')), 'NO module in the perimeter — the gate would judge only its own suites');
  assert.ok(targets.some((f) => f.endsWith('.test.js')), 'NO suite in the perimeter — half the corpus has vanished');

  const nus = targets.filter((f) => docsPour(rules, f).length === 0);
  assert.deepStrictEqual(nus, [],
    'These files have NO injectable doc — an agent touching them receives NOTHING.\n' +
    '      Add their name to the `rules:` of the relevant doc (or create the doc).');
});

test('② every TRACKED file appears in the skill file map (exhaustiveness net)', () => {
  if (!fs.existsSync(SKILL)) return; // fresh clone
  // ⚠️ The file map LIVES IN `FILE-MAP.md` since 31/07/2026 (progressive
  //    disclosure: 48 % of the skill, which therefore went over budget and
  //    got EVICTED whole). The exhaustiveness net covers BOTH files —
  //    searching the skill alone would make this part blind to the whole
  //    repo, hence GREEN while analysing nothing.
  const skill = fs.readFileSync(SKILL, 'utf8') + '\n' +
    (fs.existsSync(FILE_MAP) ? fs.readFileSync(FILE_MAP, 'utf8') : '');
  // Personal docs (gitignored) and .example files do not have to appear there.
  const targets = trackedFiles().filter(
    (f) => !f.startsWith('docs/framework/') && !f.startsWith('docs/mcp/') && !f.endsWith('.md.example')
  );
  const absents = targets.filter((f) => !skill.includes(path.basename(f)));
  assert.deepStrictEqual(absents, [],
    'Files outside the skill file map. The map is the exhaustiveness net:\n' +
    '      a file outside the list is a hole BY DEFINITION, with no judgement of importance.');
});

test('③ every `.js` of the repo is analysed by dependency-cruiser (`includeOnly`)', () => {
  // ⚠️ 100 % repo part: holds on a fresh clone too.
  const conf = JSON.parse(fs.readFileSync(path.join(HERE, '..', '.dependency-cruiser.json'), 'utf8'));
  const re = new RegExp(conf.options.includeOnly);
  const targets = trackedFiles().filter(
    (f) => f.endsWith('.js') && !f.endsWith('.test.js')
      && (!f.includes('/') || f.startsWith('src/') || f.startsWith('tools/'))
  );
  // 🛑 THIS PART HAD NO FLOOR AT ALL, AND IT WAS JUDGING **ZERO** FILES
  //    (measured 2026-08-20). `deepStrictEqual([], [])` is the perfect green:
  //    it passes loudest when it measures nothing. The part whose own doc calls
  //    it "the most treacherous" was itself the inert one.
  assert.ok(targets.length > 20, `only ${targets.length} module(s) in the perimeter — an empty scan passes this part by construction`);
  const invisible = targets.filter((f) => !re.test(f));
  assert.deepStrictEqual(invisible, [],
    'These modules are NOT in `includeOnly`: dependency-cruiser does not see them.\n' +
    '      The coupling gate is then GREEN while analysing nothing — a silent false negative\n' +
    '      (lived through: pretool-core.js and guard-core.js, invisible since their creation).');
});

test('NEGATIVE-CHECK: the 3 parts really DETECT an oversight', () => {
  // ⚠️ Without this, this gate could certify instead of protecting — the
  //    exact mistake already made by a 1st version of `deadline-gate` (green
  //    while analysing NO real hook).
  const conf = JSON.parse(fs.readFileSync(path.join(HERE, '..', '.dependency-cruiser.json'), 'utf8'));
  const re = new RegExp(conf.options.includeOnly);
  assert.equal(re.test('module-never-declared.js'), false, 'part ③ would not detect a missing module');

  if (fs.existsSync(SKILL)) {
    const skill = fs.readFileSync(SKILL, 'utf8');
    assert.equal(skill.includes('file-ghost-xyz.js'), false, 'part ② would not detect a missing entry');
  }
  if (fs.existsSync(FLEET)) {
    const rules = rulesFromCorpus(readCorpus(FLEET, 'docs/'));
    assert.equal(docsPour(rules, 'file-sans-aucune-doc-xyz.js').length, 0,
      'part ① would not detect a file without a doc');
  }
});

// ⚠️ PART ④ DELETED on 03/08/2026 (maintainer decision) — DO NOT reintroduce it.
//    It capped the LENGTH of docs (ratchet in lines), on the grounds that a
//    doc too big would be truncated or evicted. That ground is DEAD: since
//    the multi-frame transport, an over-heavy doc is SPLIT and delivered —
//    undeliverability is impossible by construction (cf `budget.fragment`).
//    ⚠️ The framework DELIVERS, it NEVER judges the size of what it is given.
//    A length cap would make the AUTHOR of a doc pay for a TRANSPORT defect,
//    and would impose on all users a style convention that only concerns the
//    maintainer's fleet. If one day pieces do not come out, it is not "too
//    big": it is `--frames N` too small, and the runtime message says so
//    along with its solution.
//
// ⚠️ PART ⑤ DELETED TOO (03/08/2026) — and for a DIFFERENT reason from the
//    one that had paused it. It capped the WEIGHT OF SKILLS. It had been
//    suspended on 02/08 on the grounds "automatic skill injection is not
//    ready", with a reactivation condition: "injection proven by real spawn".
//    ⚠️ THAT CONDITION IS NOW MET (the doctor proves the injection of the
//    skill body, and the 28 KB skill arrives in NUMBERED pieces) — reading it
//    as-is would lead to RESURRECTING a size ratchet. That is exactly the
//    opposite of what must be done: the condition is OBSOLETE, not met. A
//    heavy skill IS DELIVERED, so its weight is no longer a defect to
//    sanction. NEVER reintroduce it, and NEVER advise splitting a skill: it
//    is injected IN FULL.

