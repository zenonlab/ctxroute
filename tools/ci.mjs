#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `npm run ci` — THE CI IS ONE LOCAL COMMAND (CLAUDE.md §Tests&CI, posed 2026-08-29)
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔑 SINGLE SOURCE OF THE STEPS: `src/ci-steps-pure.js` (CI_STEPS). This shell runs NOTHING
//    that is not in that table — that is what guarantees, BY CONSTRUCTION, that the local
//    command and the workflows cannot diverge: `test/ci-steps-gate.test.js` compares the
//    workflows' TEXT against that same table.
//
// ⚠️ NEVER goes into the pre-push hook: mutation and the TLC job are HEAVY (minutes), and a
//    blocking pre-push is the "40 years" mistake this project bans. This command runs ON
//    DEMAND — `npm run ci` (everything) or `npm run ci:<group>` (one job).
// ⚠️ GOES TO THE END, never stops at the first red — a judge that shows one defect at a time
//    forces N round trips. Final verdict = ONE exit code + a summary of EVERY step.
// ⚠️ ZERO pipe before reading an exit code (inherited stdio, SYNCHRONOUS execution) — no
//    output ever transits through a shell pipe here, by construction.
// ⚠️ Binaries are called by their LOCAL path when the canonical form goes through `npx`
//    (network reachable if the package is absent) — ONLY exception: `localBinary` of the
//    `mutation-floor-gate` step. The TEXT compared to the workflow (`command`) never changes;
//    only the LOCAL execution path does.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CI_STEPS, knownGroups } from '../src/ci-steps-pure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const KNOWN_GROUPS = knownGroups();
// ⚠️ Set dedicated to membership tests: an `.includes()` on an array INSIDE a loop is an
//    avoidable nested traversal (quadratic gate). KNOWN_GROUPS stays an array for the display
//    ORDER (usage() / summary), KNOWN_GROUPS_SET serves the O(1) lookup exclusively.
const KNOWN_GROUPS_SET = new Set(KNOWN_GROUPS);

function usage() {
  process.stderr.write(
    `Usage: npm run ci            (everything, in CI order: ${KNOWN_GROUPS.join(', ')})\n` +
      `       npm run ci -- <group> (one job only: ${KNOWN_GROUPS.join(' | ')})\n`,
  );
}

const requested = process.argv.slice(2);
for (const g of requested) {
  if (!KNOWN_GROUPS_SET.has(g)) {
    usage();
    process.stderr.write(`⛔ unknown group: \`${g}\`\n`);
    process.exit(2);
  }
}
const activeGroups = requested.length > 0 ? requested : KNOWN_GROUPS;
const activeGroupsSet = new Set(activeGroups);
const steps = CI_STEPS.filter((s) => activeGroupsSet.has(s.group));

if (steps.length === 0) {
  process.stderr.write('⛔ PRECONDITION: no step to run — canonical table empty or filter empty.\n');
  process.exit(2);
}

process.stdout.write(`▶ local CI — ${steps.length} step(s), group(s): ${activeGroups.join(', ')}\n\n`);

const results = [];
for (const step of steps) {
  const realCommand = step.localBinary || step.command;
  process.stdout.write(`▶ [${step.group}] $ ${realCommand}\n`);
  const start = Date.now();
  // ⚠️ `shell: true`: the commands are strings ("npm run test:all", "npm run check:types", …),
  //    resolved via PATH the way GitHub Actions would — nothing here is PIPED, `stdio:"inherit"`
  //    transits straight to the operator's terminal, so there is NO risk of the "npm test | tail
  //    && git commit" trap (the exit code comes from the process, never from a pipe).
  const res = spawnSync(realCommand, { cwd: ROOT, shell: true, stdio: 'inherit' });
  const durationMs = Date.now() - start;
  results.push({ step, code: res.status, durationMs, error: res.error ? String(res.error.message) : null });
  process.stdout.write(`${res.status === 0 ? '✅' : '❌'} [${step.group}] ${realCommand} — ${durationMs}ms (code ${res.status})\n\n`);
}

const failures = results.filter((r) => r.code !== 0);
const totalMs = results.reduce((n, r) => n + r.durationMs, 0);

process.stdout.write('──────────────────────────────────────────────────────────────────────\n');
process.stdout.write('LOCAL CI SUMMARY\n');
for (const r of results) {
  const state = r.code === 0 ? '✅ OK  ' : '❌ FAIL';
  process.stdout.write(`  ${state}  [${r.step.group}] ${r.step.command} (${r.durationMs}ms)\n`);
}
process.stdout.write(`Total duration: ${(totalMs / 1000).toFixed(1)}s\n`);
process.stdout.write(
  failures.length === 0
    ? '✅ ALL GREEN — this command replays exactly the targeted CI jobs.\n'
    : `❌ ${failures.length} step(s) failed — see the detail above.\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
