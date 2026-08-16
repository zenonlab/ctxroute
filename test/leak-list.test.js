// Tests for leak-list.js — the SINGLE SOURCE of "which terms to protect?".
// ⚠️ Fake list file via CTXROUTE_LEAK_LIST (tmpdir) — we NEVER touch the real
//    private list (~/.claude/secrets), which serves the live fleet.
// ⚠️ BORN FROM A REAL HOLE (16/08/2026): `exceptions` shipped proven BY HAND
//    only. The dangerous direction is SILENT: an exception that removes TOO
//    MUCH makes protections disappear without any red — hence the case "removes
//    ONLY what is listed", the only one that really matters.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fuite-list-'));

// ⚠️ ONE SPAWN PER CASE: the module reads the env at call time, but we isolate
//    each case in its own process so that a mutated env never leaks into
//    neighbouring suites (the class of accident that brought down 38 tests on
//    03/08).
function termes(declOuAbsent) {
  const fichier = path.join(TMP, `list-${Math.random().toString(36).slice(2)}.json`);
  if (declOuAbsent !== undefined) fs.writeFileSync(fichier, JSON.stringify(declOuAbsent));
  const out = execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(require("../src/leak-list.js").privateTerms()))'], {
    cwd: __dirname,
    encoding: 'utf8',
    env: { ...process.env, CTXROUTE_LEAK_LIST: fichier },
  });
  return JSON.parse(out.trim());
}

test('exceptions: removes ONLY what is listed — never one protection more', () => {
  // The DANGEROUS direction: a filter that is too broad would make protected
  // terms disappear WITH NO RED AT ALL (the gate would let real leaks through).
  assert.deepEqual(termes({ termes: ['prenom-x', 'client-y', 'marque-z'], exceptions: ['marque-z'] }), ['prenom-x', 'client-y']);
});

test('exceptions: case-insensitive (derivation returns the FOLDER case, not the decision case)', () => {
  assert.deepEqual(termes({ termes: ['Marque-Z', 'client-y'], exceptions: ['marque-z'] }), ['client-y']);
});

test('exceptions absent or empty: the list comes out INTACT (previous behaviour, identical)', () => {
  assert.deepEqual(termes({ termes: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(termes({ termes: ['a', 'b'], exceptions: [] }), ['a', 'b']);
});

test('file missing/unreadable: [] — generic mode, never a failure', () => {
  assert.deepEqual(termes(undefined), []);
});

test('marker-based derivation works, and an exception filters it TOO', () => {
  const racine = path.join(TMP, 'clients');
  fs.mkdirSync(path.join(racine, 'client-a'), { recursive: true });
  fs.mkdirSync(path.join(racine, 'marque-b'), { recursive: true });
  fs.mkdirSync(path.join(racine, 'outillage'), { recursive: true }); // NO marker: never derived
  fs.writeFileSync(path.join(racine, 'client-a', 'brief.md'), 'x');
  fs.writeFileSync(path.join(racine, 'marque-b', 'brief.md'), 'x');
  const r = termes({ termes: [], derivedFolders: [{ racine, marker: 'brief.md' }], exceptions: ['marque-b'] });
  assert.deepEqual(r, ['client-a']);
});
