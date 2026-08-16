// ═══════════════════════════════════════════════════════════════════════
// STATIC GATE — every hook that reads stdin MUST arm a deadline
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS GATE EXISTS (and not just a rule written somewhere):
//    On 15/07/2026, 875 `statusline.js` zombies, one of them 20 HOURS old.
//    7 hooks of ~/.claude/hooks/ read stdin. ZERO had a deadline.
//    100% of the vulnerable family, 0% protected — because the rule existed
//    nowhere in MECHANICAL form. An instruction in prose reviews nobody.
//
// ⚠️ THIS GATE IS THE ONLY THING preventing the 10th hook from forgetting. `deadline.js`
//    makes the right thing EASY; this gate makes forgetting IMPOSSIBLE. Both,
//    never one instead of the other (defense-in-depth).
//
// ⚠️ STATIC ANALYSIS, never a spawn: one cannot "test" the absence of a
//    zombie under real conditions (that would require reproducing Anthropic's bug,
//    which is non-deterministic). So we check the CAUSE in the source code,
//    not the symptom at runtime.
//
// ⚠️ NEVER loosen it by adding an exception "that hook does not need it".
//    The hook "that does not need it" is exactly the one that will zombify.
//    Either a hook does not read stdin OR it carries a deadline. No 3rd case.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Files of the repo that are HOOKS (spawned by a harness, read stdin, die).
// ⚠️ Derived from the CONTENT, never from a hand-written list: a manual list forgets
//    the next file added — the exact hole this gate is supposed to close.
//
// ⚠️ TWO WAYS OF READING STDIN, BOTH COUNT — trap experienced on 15/07/2026:
//    the 1st version of this gate only looked for `process.stdin` and turned GREEN
//    while analyzing NO real hook (they all read via `stdin-json.js`). A blind gate
//    is worse than none: it certifies. Any evolution of this detection
//    MUST be verified by a negative-check (sabotage a hook → the gate must turn red).
function hookFiles() {
  return ['src', 'src/sources', 'src/hooks', 'tools']
    .flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => d + '/' + f))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => ({ name: f, src: fs.readFileSync(path.join(ROOT, f), 'utf8') }))
    .filter((f) => /process\.stdin/.test(f.src) || /require\(['"][./]*\.\/stdin-json['"]\)/.test(f.src));
}

test('every file that reads stdin arms a deadline (deadline.arm)', () => {
  const hooks = hookFiles();

  // ⚠️ Zero hooks detected = the gate tests NOTHING and would stay green forever.
  //    An empty gate is worse than no gate: it LIES ("green" = "protected").
  assert.ok(hooks.length > 0, 'no file reading stdin detected — the gate is blind, check hookFiles()');

  const nus = hooks
    .filter((h) => !h.name.endsWith('/deadline.js'))
    // Exempt: the shared I/O utility, which MUST stay standalone
    // (rule `stdin-json-stays-standalone` of .dependency-cruiser.json — it is
    // copyable as is into another project, so it can import NOTHING from here).
    // ⚠️ The deadline is therefore the responsibility of its CALLERS, never its own.
    .filter((h) => !h.name.endsWith('/stdin-json.js'))
    .filter((h) => !/require\(['"](?:\.\.?\/)+deadline['"]\)/.test(h.src) || !/\barm\s*\(/.test(h.src))
    .map((h) => h.name);

  assert.deepStrictEqual(
    nus,
    [],
    `Hook(s) WITHOUT a deadline → zombie guaranteed if the harness does not close stdin ` +
      `(Claude Code Windows bug #68626). Add: const deadline = require('../src/deadline'); deadline.arm();`
  );
});

test('deadline.js: the .unref() is present (otherwise latency on EVERY call)', () => {
  // ⚠️ NEGATIVE-CHECK of the safeguard itself. Without unref(), the timer holds the
  //    event loop → every tool call would wait the FULL delay.
  //    The remedy would become worse than the disease, silently (just "it is slow").
  const src = fs.readFileSync(path.join(ROOT, 'src', 'deadline.js'), 'utf8');
  assert.match(src, /\.unref\(\)/, 'deadline.js without unref() = latency added to every tool call');
  assert.match(src, /process\.exit\(0\)/, 'deadline.js must exit with 0 (fail-open, never block a tool)');
});
