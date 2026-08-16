// ═══════════════════════════════════════════════════════════════════════
// GATE — every skill of the config.skills registry EXISTS in the harness.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ The `config.skills` registry names skills BY NAME (key). Renaming or
//    deleting a skill without updating the registry = a pointer firing "load
//    skill X" while X no longer exists = a phantom pointer, discovered in
//    production. This gate makes it RED at pre-push (the sealed "sync word").
//
// ⚠️ Skill location = HARNESS-SPECIFIC (Claude Code:
//    ~/.claude/commands/{name}.md). This is the only line that "knows the
//    harness" — the rest of the engine stays agnostic. A Codex port = a
//    variant of THIS gate pointing at Codex's skill store.
//
// ⚠️ Skipped on a fresh clone / CI (skills dir absent), like
//    source-drift-gate, porte-differential, loader-differential: the harness
//    fleet is not there.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Gitignored user config (19/07/2026): the real one if present, otherwise .example.
const REAL_CONFIG = path.join(REPO_DIR, 'ctxroute-config.json');
const CONFIG_PATH = fs.existsSync(REAL_CONFIG) ? REAL_CONFIG : path.join(REPO_DIR, 'ctxroute-config.json.example');
// ⚠️ UNIQUE SOURCE of the path = paths.skillsDir() (shared with the skill
//    adapter that READS the skill bodies — two definitions would diverge in silence).
const { skillsDir } = await import('../src/paths.js').then((m) => m.default || m);
const SKILLS_DIR = skillsDir();

// PURE: which names have no file? (injectable existsFn = negative-check).
const findMissing = (names, existsFn) => names.filter((n) => !existsFn(n));

test('findMissing detects the missing ones (self-validation: the gate BITES)', () => {
  assert.deepStrictEqual(findMissing(['a', 'b', 'c'], (n) => n === 'a' || n === 'c'), ['b']);
  assert.deepStrictEqual(findMissing(['x'], () => true), []);
  assert.deepStrictEqual(findMissing([], () => false), []);
});

test('every skill of config.skills exists in the harness (or skip if the dir is absent)', () => {
  if (!fs.existsSync(SKILLS_DIR)) return; // fresh clone / CI — harness fleet absent
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const names = Object.keys(config.skills || {});
  const missing = findMissing(names, (n) => fs.existsSync(path.join(SKILLS_DIR, n + '.md')));
  assert.deepStrictEqual(
    missing,
    [],
    `Registry skills WITHOUT a .md file in ${SKILLS_DIR}: [${missing.join(', ')}]. ` +
      'Renamed/deleted? Fix config.skills OR restore the skill — a phantom pointer is forbidden.'
  );
});

// PURE: which harness skills are declared NOWHERE? (negative-checkable)
const findUndeclared = (allSkills, registered, withoutPerimeter) =>
  allSkills.filter((n) => !registered.includes(n) && !withoutPerimeter.includes(n));

test('findUndeclared detects the undeclared ones (self-validation: the REVERSE gate bites)', () => {
  assert.deepStrictEqual(findUndeclared(['a', 'b', 'c'], ['a'], ['c']), ['b']);
  assert.deepStrictEqual(findUndeclared(['a'], [], ['a']), []);
  assert.deepStrictEqual(findUndeclared([], ['x'], []), []);
});

// ── REVERSE DIRECTION (19/07/2026): every HARNESS skill must be declared ──
// ⚠️ The gate above is DIRECTIONAL (registry → file): it is structurally
//    BLIND to a skill created and never registered — the same hole as "MCP
//    server without a doc" and "doc without a rule" (classes already sealed).
//    A FORGOTTEN perimeter and a skill deliberately without a perimeter are
//    INDISTINGUISHABLE without an explicit declaration:
//    `skillsWithoutPerimeter` makes silence impossible. The "new project"
//    reflex MECHANISED: creating a skill without declaring it = RED at the
//    next test/push.
test('every harness skill is EITHER registered (perimeter) OR declared without a perimeter', () => {
  if (!fs.existsSync(SKILLS_DIR)) return; // fresh clone / CI
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  // ⚠️ EXPLICIT OPT-IN (FREE framework — a language never imposes a POLICY):
  //    using the skills feature ≠ adopting exhaustiveness. Registering 2
  //    skills without wanting to sort out the other 40 is a LEGITIMATE use.
  //    The "zero silence" discipline only switches on if the user declares
  //    the `skillsWithoutPerimeter` key (even empty []) — THAT is the
  //    adoption switch. The engine ships the tool, not the regulation.
  if (!('skillsWithoutPerimeter' in config)) return;
  const all = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  const undeclared = findUndeclared(all, Object.keys(config.skills || {}), config.skillsWithoutPerimeter || []);
  assert.deepStrictEqual(
    undeclared,
    [],
    `Harness skills declared NOWHERE: [${undeclared.join(', ')}]. ` +
      'For each one: add a perimeter in config.skills (auto-injection) OR list it in ' +
      'skillsWithoutPerimeter (deliberately on-demand). Silence is not an option.'
  );
});
