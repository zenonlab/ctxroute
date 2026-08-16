// ═══════════════════════════════════════════════════════════════════════
// FLEET↔REPO GATE — the repo is SELF-SUFFICIENT for a fork (19/07/2026).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ RAISON D'ÊTRE (maintainer decision): a fork/external maintainer must
//    find EVERYTHING IN the repo — the framework skill + the framework's own
//    injectable docs. Now those files LIVE wired in the maintainer's fleet
//    (~/.claude/commands/ctxroute.md + ~/.claude/hooks/docs/ctxroute/)
//    → two copies. This gate makes drift IMPOSSIBLE: any gap = RED.
//
// ⚠️ DIRECTION OF TRUTH: the FLEET is the WIRED copy (what agents receive),
//    docs/framework/ is the VERSIONED MIRROR. Editing the fleet → copy it
//    here (cp) IN THE SAME GESTURE. A fork without a fleet edits the repo.
//
// ⚠️ CLEAN SKIP if the fleet does not exist (CI, fresh checkout, fork
//    machine): equality only makes sense where both copies exist. On the
//    maintainer's machine, this gate runs at EVERY npm test.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_DIR = path.join(import.meta.dirname, '..', 'docs', 'framework');
const PARC_SKILL = path.join(os.homedir(), '.claude', 'commands', 'ctxroute.md');
const PARC_DOCS = path.join(os.homedir(), '.claude', 'hooks', 'docs', 'ctxroute');

const parcExists = fs.existsSync(PARC_DOCS) && fs.existsSync(PARC_SKILL);
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

test('docs/framework/ exists and is not empty (everything a fork needs)', () => {
  const files = fs.readdirSync(REPO_DIR).filter((f) => f.endsWith('.md'));
  assert.ok(files.includes('SKILL.md'), 'SKILL.md missing from docs/framework/ — a fork does not have the skill.');
  assert.ok(files.length >= 20, `docs/framework/ only contains ${files.length} files — injectable docs are missing.`);
});

test.skipIf(!parcExists)('the repo SKILL.md == the wired fleet skill (drift = RED, copy it over)', () => {
  assert.strictEqual(read(path.join(REPO_DIR, 'SKILL.md')), read(PARC_SKILL),
    'docs/framework/SKILL.md diverges from ~/.claude/commands/ctxroute.md — copy the fleet over to the repo (or the other way round on a fork).');
});

test.skipIf(!parcExists)('every injectable fleet doc has its IDENTICAL mirror in the repo (none forgotten)', () => {
  for (const f of fs.readdirSync(PARC_DOCS).filter((x) => x.endsWith('.md'))) {
    const mirror = path.join(REPO_DIR, f);
    assert.ok(fs.existsSync(mirror), `fleet doc WITHOUT a repo mirror: ${f} — a fork will not have it.`);
    assert.strictEqual(read(mirror), read(path.join(PARC_DOCS, f)),
      `fleet↔repo drift on ${f} — copy it over in the same gesture as the edit.`);
  }
});

test.skipIf(!parcExists)('no orphan repo file (doc deleted from the fleet but left in the repo)', () => {
  const parcFiles = new Set(fs.readdirSync(PARC_DOCS).filter((x) => x.endsWith('.md')));
  for (const f of fs.readdirSync(REPO_DIR).filter((x) => x.endsWith('.md') && x !== 'SKILL.md')) {
    assert.ok(parcFiles.has(f), `orphan repo file: docs/framework/${f} (absent from the fleet) — delete it or re-wire it.`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PART ④ — THE CANARY ⟷ DISPLAY CONTRACT (07/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 IT HAS ALREADY BEEN PAID FOR, DEARLY. `statusline.js` was reading
//    `Desktop/mcp-doc-hooks/state/canary.json` — the repo name BEFORE its
//    rename to `ctxroute` (04/08/2026). Non-existent folder ⇒ the display's
//    fail-open `catch` swallowed everything ⇒ for THREE DAYS the canary wrote
//    its verdict FOR NOBODY. A dead-man switch whose display is dead reports
//    nothing while giving the impression of monitoring: the worst kind of
//    failure, since it manufactures confidence.
//
// ⚠️ THIS PART CREATES NO DEPENDENCY, and that is the condition for it to
//    exist. The framework still SHIPS no display (that is what keeps it
//    installable by anyone) and the alarm still does not go through the pipe
//    it tests. We only check, WHEN a display exists on the machine, that what
//    it asks of the repo still exists.
//
// ⚠️ THREE LINKS, EACH BREAKING IN SILENCE: ① the repo PATH · ② the EXPORT
//    called · ③ the verdict KEY. The rename only broke ①, but renaming
//    `sourceTag` or the `verdict` key would produce exactly the same mute
//    failure — and both ② and ③ are coupling through STORAGE/INTERFACE,
//    invisible to imports (dependency-cruiser) as to globals (couches-gate).
//
// ⚠️ TWO SKIPS, both deliberate: no fleet (fresh clone, fork) AND no display
//    citing the canary — displaying nothing is a legitimate choice. The gate
//    does not DEMAND a display, it protects the one that exists.

const PARC_HOOKS = path.join(os.homedir(), '.claude', 'hooks');
// 🛑 THE PATTERN DOES NOT FILTER ON `ctxroute`, AND THAT IS THE WHOLE POINT.
//    My 1st version only kept paths CITING `ctxroute` — it would therefore
//    NOT have seen the bug that motivated it: the stale path cited
//    `mcp-doc-hooks`, the OLD name. A gate that misses precisely its founding
//    case is worse than absent, it reassures. ⇒ EVERY absolute path of a
//    display must exist.
// ⚠️ MEASURED BEFORE WIDENING (07/08/2026): 5 absolute paths in the fleet's
//    displays, **0 dead** ⇒ no exemption to plan for. Without that
//    measurement, the wide version could have been a false-red generator.
const CHEMIN_ABSOLU = /['"]([A-Za-z]:[\\/][^'"]+)['"]/g;

function afficheursDuCanari() {
  if (!fs.existsSync(PARC_HOOKS)) return [];
  return fs
    .readdirSync(PARC_HOOKS)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: f, src: read(path.join(PARC_HOOKS, f)) }))
    .filter((h) => /canari/i.test(h.src));
}

/** The names exported by a CommonJS module (`module.exports = { a, b }`). */
function exportsDe(src) {
  const m = src.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (m === null) return new Set();
  return new Set(m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean));
}

/** The contract breaches, DERIVED from both sides. `[]` = contract honoured. */
function contratRompu(afficheurs, canariSrc, checkSrc) {
  const brokenOnes = [];
  for (const a of afficheurs) {
    // ① PATHS — the REAL failure of 04→07/08.
    for (const m of a.src.matchAll(CHEMIN_ABSOLU)) {
      // ⚠️ `state/canary.json` only exists after a 1st verdict: the parent
      //    FOLDER is enough — otherwise RED from the very first installation,
      //    a false positive that would discredit the gate before its first
      //    service.
      if (!fs.existsSync(m[1]) && !fs.existsSync(path.dirname(m[1]))) {
        brokenOnes.push(`${a.name}: dead path → ${m[1]}`);
      }
    }
    // ② EXPORT — every name destructured from canary.js must be exported.
    // ⚠️ SET COMPARISON, NEVER A BUILT REGEX: the 1st version interpolated
    //    the name into a template literal, where `\b` is NOT a word boundary
    //    but the BACKSPACE character — the check therefore accused
    //    `sourceTag`, which was very much exported. A false positive that
    //    would have discredited the whole gate.
    for (const m of a.src.matchAll(/const\s*\{([^}]*)\}\s*=\s*require\([^)]*canary\.js[^)]*\)/g)) {
      for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!exportsDe(canariSrc).has(name)) {
          brokenOnes.push(`${a.name}: canary.js does not export \`${name}\``);
        }
      }
    }
  }
  // ③ VERDICT KEY — the display reads `.verdict`, the shell writes it.
  if (afficheurs.some((a) => /\.verdict\b/.test(a.src)) && !/verdict:/.test(checkSrc)) {
    brokenOnes.push('canary-check.js no longer writes the `verdict` key the display reads');
  }
  return brokenOnes;
}

const CANARI_SRC = read(path.join(import.meta.dirname, '..', 'src', 'canary.js'));
const CHECK_SRC = read(path.join(import.meta.dirname, '..', 'src', 'hooks', 'canary-check.js'));

test.skipIf(!parcExists)('④ canary ⟷ display contract: paths, export and verdict key hold', () => {
  const afficheurs = afficheursDuCanari();
  if (afficheurs.length === 0) return; // no display = a legitimate choice
  const brokenOnes = contratRompu(afficheurs, CANARI_SRC, CHECK_SRC);
  assert.deepStrictEqual(brokenOnes, [],
    'canary ⟷ display contract BROKEN — the alarm would write for NOBODY, in silence:\n  ' +
    brokenOnes.join('\n  '));
});

test('④ NEGATIVE: the part really goes red on the 3 breaches (IN-MEMORY sabotage)', () => {
  // ⚠️ IN MEMORY, never a real file: `statusline.js` is IN PRODUCTION, other
  //    agents execute it on every render.
  // ① THE EXACT 04/08 CASE: the OLD repo name, which does not contain
  //    "ctxroute" — precisely what the 1st version of the pattern missed.
  const perime = [{ name: 'fakeOnes.js', src: "require('C:/Users/dev/Desktop/mcp-doc-hooks/canary.js')" }];
  assert.strictEqual(contratRompu(perime, CANARI_SRC, CHECK_SRC).length, 1,
    'the part does not see the STALE path of 04/08: it misses its founding case');

  // …and a very much alive path triggers nothing (otherwise 5 false reds on the fleet).
  // ⚠️ DERIVED AT RUNTIME, never hardcoded: this repository is PUBLIC and the
  //    anti-leak gate refuses any real user path — it bit right here, on the
  //    1st version of this fixture.
  const ici = import.meta.dirname.replace(/\\/g, '/');
  const alive = [{ name: 'ok.js', src: `require('${ici}/canary.js')` }];
  assert.deepStrictEqual(contratRompu(alive, CANARI_SRC, CHECK_SRC), [],
    'false positive on a path that does exist');

  // ② An export that does not exist.
  const exportFantome = [{ name: 'fakeOnes.js', src: "const { marqueurFantome } = require('../src/canary.js');" }];
  assert.match(contratRompu(exportFantome, CANARI_SRC, CHECK_SRC)[0] || '', /does not export/,
    'the part does not see a vanished export');

  // ③ The verdict key renamed on the shell side.
  const lecteur = [{ name: 'fakeOnes.js', src: 'const v = JSON.parse(x); v.verdict;' }];
  assert.strictEqual(contratRompu(lecteur, CANARI_SRC, 'fs.writeFileSync(t, JSON.stringify({ etat: v }))').length, 1,
    'the part does not see the `verdict` key vanished from the shell');

  // …and it stays SILENT on a healthy display (otherwise it would end up unplugged).
  const healthy = [{ name: 'ok.js', src: "const { sourceTag } = require('../src/canary.js');\nconst v = j.verdict;" }];
  assert.deepStrictEqual(contratRompu(healthy, CANARI_SRC, CHECK_SRC), [],
    'false positive on a display that is in fact compliant');
});
