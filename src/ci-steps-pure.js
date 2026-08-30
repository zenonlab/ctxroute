// ═══════════════════════════════════════════════════════════════════════
// CI STEPS — PURE DECISIONS (ZERO I/O, mutated) — "the CI is ONE local command"
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 CLAUDE.md §Tests&CI (2026-08-29): "the CI is ONE local command; the
//    workflow carries NO logic." `CI_STEPS` below is the SINGLE source of
//    what each group actually runs — `tools/ci.mjs` executes it for real,
//    `test/ci-steps-gate.test.js` verifies that the three workflows call
//    NOTHING but these groups, and that every group is really invoked.
//
// ⚠️ THE COMMANDS ARE COPIED VERBATIM FROM THE EXISTING WORKFLOWS — this
//    module does not improve them, does not reorder them, does not change
//    a single flag. Its only job is to be the ONE place both the workflow
//    text and the local runner agree on.
//
// ⚠️ SCOPE = exactly 3 workflows: `test.yml` (unit + coupling jobs),
//    `mutation.yml` (mutation job), `spec-tlc.yml` (tlc job).
//    `service-units.yml` is OUT OF SCOPE, DELIBERATELY: it installs real
//    systemd/launchd services on Linux and macOS runners — a Windows
//    station cannot prove it, and routing it through the local command
//    would fabricate a false green. NEVER touch it here.
//
// ⚠️ ZERO I/O HERE — the caller reads the disk and hands over text/JSON.
//    That is what makes this module mutable by Stryker.

/**
 * @typedef {{group: string, command: string, localBinary?: string}} CiStep
 */

/**
 * CANONICAL TABLE — what `npm run ci` (or `npm run ci:<group>`) actually runs.
 * Neither the workflows nor an operator have another place to read "what
 * runs in the mutation job?" — it is HERE, nowhere else.
 * ⚠️ `group` = the corresponding GitHub Actions job name.
 * ⚠️ `command` is the LOGICAL command compared against the workflow text —
 *    it MUST stay byte-identical to the workflow's `run:` line.
 * ⚠️ `localBinary`, when present, is what the LOCAL runner actually spawns
 *    instead of `command` (never `npx`: it can reach the network when a
 *    package is not installed locally — measured, paid for). The compared
 *    TEXT never changes; only the local EXECUTION path does.
 * ⚠️ ORDER MATTERS for local execution (fast → slow): unit, coupling,
 *    mutation, spec.
 */
export const CI_STEPS = [
  { group: 'unit', command: 'npm run test:all' },
  { group: 'coupling', command: 'npm run check:types' },
  { group: 'coupling', command: 'npm run check:coupling' },
  { group: 'mutation', command: 'npm run test:mutation' },
  {
    group: 'mutation',
    command: 'npx vitest run mutation-floor-gate.test.js',
    // ⚠️ NEVER npx locally: point at the local binary directly. The LOGICAL
    //    command (compared against mutation.yml) stays `npx vitest run …`.
    localBinary: './node_modules/.bin/vitest run mutation-floor-gate.test.js',
  },
  { group: 'spec', command: 'npm run spec:tlc' },
];

/** All known groups (jobs), in the order they first appear in `CI_STEPS`. */
export function knownGroups() {
  return [...new Set(CI_STEPS.map((s) => s.group))];
}

/** Normalizes a command for stable comparison (trims edges + collapses spaces). */
export function normalizeCommand(text) {
  return String(text).trim().replace(/\s+/g, ' ');
}

/**
 * Extracts the value of a `run:` block from a YAML step (single-line form,
 * the only one used in these workflows). Returns `null` for a step WITHOUT
 * `run:` (a `uses:` step) — it is not a command and can never diverge from one.
 */
export function runCommand(block) {
  const m = /^[ \t]*-?[ \t]*run:[ \t]*(.+)$/m.exec(String(block));
  if (!m) return null;
  return normalizeCommand(m[1].replace(/^["']/, '').replace(/["']$/, ''));
}

/**
 * Splits a workflow's text into YAML step blocks (naive: one block per `- `
 * bullet at step-list indentation). DELIBERATELY DUMB PARSING, same
 * doctrine as `mutation-workflow-gate.test.js`: a real YAML parser would add
 * a dependency to read a handful of known lines.
 */
export function stepBlocks(text) {
  const lines = String(text).split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    // A step bullet starts at the fixed `jobs.<id>.steps` indentation (6
    // spaces, this repo's uniform convention: jobs:0 → <id>:2 → steps:4 →
    // -:6). A continuation line (e.g. `with:`, `node-version: 22`) is
    // deeper and simply folds into the CURRENT block.
    if (/^ {6}-\s/.test(line)) {
      if (current !== null) blocks.push(current.join('\n'));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) blocks.push(current.join('\n'));
  return blocks;
}

/** Extracts {command} for every RUN step of a workflow text, `uses:` steps discarded. */
export function runStepsOf(text) {
  const steps = [];
  for (const block of stepBlocks(text)) {
    const command = runCommand(block);
    if (command === null) continue;
    steps.push({ command });
  }
  return steps;
}

/** Setup steps admitted WITHOUT figuring in the local command (install, never a job). */
const ADMITTED_SETUP = new Set(['npm ci']);

/**
 * Is a workflow `run:` a CALL TO THE LOCAL COMMAND (`npm run ci` or
 * `npm run ci:<known group>`)? Returns the targeted group (`null` for
 * `npm run ci` — all groups) or `undefined` if the command has no such shape
 * at all.
 * ⚠️ STRICT SHAPE: `npm run ci:<word>` where `<word>` is not in
 *    `knownGroups()` IS a call to the command (right shape) but to an
 *    UNKNOWN group — distinguished from "not a call at all" so the refusal
 *    is always NAMED, never a plain silence.
 */
export function calledGroup(command) {
  const m = /^npm run ci(?::(\S+))?$/.exec(String(command));
  if (!m) return undefined;
  return m[1] ?? null;
}

/**
 * DIVERGENCE AUDIT, DIRECTION ① — CLAUDE.md: "the workflow calls nothing
 * else". Every RUN step must be EITHER an admitted setup (`npm ci`) OR a
 * call to `npm run ci` / `npm run ci:<KNOWN group>`. Any other shape (a
 * plain `npm test`, a third-party command, an invented group) is a NAMED
 * divergence.
 */
export function auditDivergence(workflowText) {
  const known = new Set(knownGroups());
  const unknown = [];
  for (const step of runStepsOf(workflowText)) {
    if (ADMITTED_SETUP.has(step.command)) continue;
    const group = calledGroup(step.command);
    if (group === undefined) {
      unknown.push({ ...step, reason: 'outside the local command' });
      continue;
    }
    if (group !== null && !known.has(group)) {
      unknown.push({ ...step, reason: 'unknown group' });
    }
  }
  return unknown;
}

/**
 * DIVERGENCE AUDIT, DIRECTION ② — CLAUDE.md: the command EXISTING is not
 * enough, it must also be REALLY INVOKED: a job removed from a workflow (or
 * never added) would leave a `CI_STEPS` group with NO caller — CI would stop
 * running it, in silence, while `npm run ci` would keep replaying it locally.
 */
export function unCalledGroups(workflowTexts) {
  const called = new Set();
  // ⚠️ FLATTENED ON PURPOSE (2026-08-30): the two `for` loops over
  //    workflowTexts × its steps were a NESTED traversal (quadratic-budget
  //    gate). `runStepsOf` is a function call, never inlined here, so
  //    flattening first removes the syntactic nesting without changing the
  //    scan order: text 1's steps still precede text 2's, so the early
  //    `return []` below still fires at the SAME step as before.
  const allSteps = workflowTexts.flatMap((text) => runStepsOf(text));
  for (const step of allSteps) {
    const group = calledGroup(step.command);
    if (group === null) return []; // a lone `npm run ci` covers EVERY group.
    // ⚠️ NO guard on `group === undefined` here, DELIBERATELY: adding
    //    `undefined` to `called` (a non-shaped step, e.g. `npm ci`) is
    //    harmless — no real group name is ever `undefined`, so the final
    //    `.has(g)` filter below can never see it. A guard here would be an
    //    EQUIVALENT MUTANT waiting to happen (kill by construction, not by
    //    a test for nothing — cf. Stryker doctrine).
    called.add(group);
  }
  return knownGroups().filter((g) => !called.has(g));
}

/**
 * `npm run ci` and EACH `npm run ci:<group>` EXIST in the given root
 * `package.json` scripts?
 * @param {Record<string, unknown> | null | undefined} rootScripts
 */
export function missingCiAliases(rootScripts) {
  const missing = [];
  const scripts = rootScripts && typeof rootScripts === 'object' ? rootScripts : {};
  if (!('ci' in scripts)) missing.push('ci');
  for (const g of knownGroups()) {
    if (!(`ci:${g}` in scripts)) missing.push(`ci:${g}`);
  }
  return missing;
}

/**
 * ANTI-MUTE-PROBE — a reading that sees NOTHING looks EXACTLY like a perfect
 * wiring. Zero step read across the workflows, or an empty canonical table,
 * is RED, never green by vacuity.
 */
export function ciPreconditions({ workflowSteps, canon }) {
  const issues = [];
  if (!Array.isArray(workflowSteps) || workflowSteps.length === 0) {
    issues.push('PRECONDITION: no RUN step read across the workflows — files unreadable or scope mis-resolved.');
  }
  if (!Array.isArray(canon) || canon.length === 0) {
    issues.push('PRECONDITION: canonical table EMPTY — the judge would be green by vacuity.');
  }
  return issues;
}

/** The NAMED refusal — a workflow step no call to the local command covers. */
export function divergenceMessage(step) {
  return (
    `⛔ CI step outside the local command (${step.reason}): \`${step.command}\`.\n` +
    '   Only these forms are admitted: `npm ci`, `npm run ci`, `npm run ci:<group>`.\n' +
    '   Replace it with the matching `npm run ci:<group>` call, or extend CI_STEPS.'
  );
}

/** The NAMED refusal — a canonical group no workflow job invokes anymore. */
export function unCalledGroupMessage(group) {
  return `⛔ group \`${group}\` (CI_STEPS) is called by NO workflow job — its steps no longer run in CI.`;
}

/** The NAMED refusal — a `ci`/`ci:<group>` alias missing from the root package.json. */
export function missingAliasMessage(name) {
  return `⛔ script \`npm run ${name}\` is absent from the root package.json — the workflows call it, it MUST exist.`;
}
