// ═══════════════════════════════════════════════════════════════════════
// NEGATIVE-CHECK of the doctor — proves it SCREAMS when things are broken
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ RAISON D'ÊTRE: a dead-man switch that NEVER fires is worse than an
// absent one — it manufactures false confidence. Checking that it goes green
// on a healthy repo proves NOTHING (an unconditional `exit(0)` would do the
// same). The ONLY valid proof is the negative-check: really BREAK the
// framework and require doctor.js to exit ≠ 0, screaming.
//
// ⚠️ Sabotage is ALWAYS done on a COPY in a tmpdir, NEVER on the repo
// (a test mutilating the shipped files = the 15/07/2026 bug, but worse).
//
// NEVER delete these cases: without them, doctor.js can rot into a
// `console.log("all is well")` without anybody noticing.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DOCTOR = path.join(import.meta.dirname, '..', 'tools', 'doctor.js');

// Each ok(name, cond) = EXACTLY ONE vitest test (same name, same cond).
// The state (spawns, tmpdir sabotage) is built sequentially at module level —
// the original harness ordering is preserved.
function ok(name, cond) {
  test(name, () => { assert.ok(cond, name); });
}

function runDoctor(cwdDoctor, args = []) {
  const r = spawnSync(process.execPath, [cwdDoctor, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Copy of the framework into a throwaway tmpdir → safe sabotage ground.
function cloneFramework() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-sabotage-'));
  const REPO = path.join(import.meta.dirname, '..');
  for (const d of ['src', 'src/hooks', 'tools']) {
    fs.mkdirSync(path.join(tmp, d), { recursive: true });
    for (const f of fs.readdirSync(path.join(REPO, d))) {
      if (f.endsWith('.js') && !f.endsWith('.test.js')) {
        const abs = path.join(REPO, d, f);
        if (fs.statSync(abs).isFile()) fs.copyFileSync(abs, path.join(tmp, d, f));
      }
    }
  }
  return tmp;
}

// Like cloneFramework BUT also copies sources/*.js → the gate really LOADS
// (probes 1-4 pass); we can then sabotage ONE precise source and check that
// the doctor isolates ITS death, not just "the gate crashes". Required for the
// skill path (sources/skill.js lives in a subfolder, absent from a root-only clone).
function cloneFrameworkWithSources() {
  const tmp = cloneFramework();
  const REPO = path.join(import.meta.dirname, '..');
  const srcDir = path.join(tmp, 'src', 'sources');
  fs.mkdirSync(srcDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'src', 'sources'))) {
    if (f.endsWith('.js')) fs.copyFileSync(path.join(REPO, 'src', 'sources', f), path.join(srcDir, f));
  }
  return tmp;
}

// ── Case 1 — HEALTHY repo: doctor passes and stays silent under --quiet ──
{
  const r = runDoctor(DOCTOR);
  ok('healthy repo → doctor exit 0', r.status === 0);
  ok('healthy repo → doctor confirms the doc is really injected', r.stdout.includes('framework alive'));

  const q = runDoctor(DOCTOR, ['--quiet']);
  ok('healthy repo + --quiet → TOTAL SILENCE on stdout (otherwise SessionStart becomes noise)', q.stdout.trim() === '');
  ok('healthy repo + --quiet → exit 0', q.status === 0);
}

// ── Case 2 — NEGATIVE: the hook crashes at load ──
{
  const tmp = cloneFramework();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'legacy-mcp-inject.js'), 'throw new Error("sabotage");\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('CRASHING hook → doctor exit ≠ 0', r.status !== 0);
    ok('CRASHING hook → doctor screams on stderr', r.stderr.includes('BROKEN'));
    const q = runDoctor(path.join(tmp, 'tools', 'doctor.js'), ['--quiet']);
    ok('CRASHING hook + --quiet → screams ANYWAY (silence only applies to success)', q.status !== 0 && q.stderr.includes('BROKEN'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3 — NEGATIVE: the hook runs but INJECTS NOTHING ──
// THE 15/07/2026 bug: clean exit(0), zero error, zero injection. The case
// that ALL the other tests let through.
{
  const tmp = cloneFramework();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'legacy-mcp-inject.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('SILENT hook (exit 0, no injection) → doctor exit ≠ 0', r.status !== 0);
    ok('SILENT hook → doctor names the silent death', r.stderr.includes('INJECTS NOTHING') || r.stderr.includes('stdout unreadable or empty'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3b — NEGATIVE: the SESSION gate runs but INJECTS NOTHING ──
// Same class of silent death as case 3, on the SessionStart path.
{
  const tmp = cloneFramework();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'session-inject.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('silent SESSION gate (exit 0, no injection) → doctor exit ≠ 0', r.status !== 0);
    ok('silent SESSION gate → doctor names the session path', r.stderr.includes('session path'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3c — NEGATIVE: the WRITE GUARD swallows invalid docs ──
{
  const tmp = cloneFramework();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'doc-write-guard.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('write guard mute on an invalid doc → doctor exit ≠ 0', r.status !== 0);
    ok('mute write guard → doctor names it', r.stderr.includes('doc-write-guard'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3d — NEGATIVE: the SKILL source no longer injects any pointer ──
// Clone WITH sources → the gate loads and probes 1-4 pass; we break ONLY
// sources/skill.js → only the skill path falls. Proves the dead-man switch ISOLATES.
{
  // Self-validation of the setup: a clone WITH sources, NOT sabotaged, MUST
  // pass — otherwise the sabotage below would prove the death of the clone,
  // not that of the source.
  const sane = cloneFrameworkWithSources();
  try {
    ok('clone WITH sources, not sabotaged → doctor exit 0 (healthy setup, self-validation)',
      runDoctor(path.join(sane, 'tools', 'doctor.js')).status === 0);
  } finally { fs.rmSync(sane, { recursive: true, force: true }); }

  const tmp = cloneFrameworkWithSources();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'sources', 'skill.js'),
      'module.exports = { matchingSkills: () => [], skillNameFromDoc: (d) => d, pointerBody: () => "", ' +
      'declFor: () => ({ mode: "dumb" }), serverMatches: () => [], skillRules: () => [], DOC_PREFIX: "skill/", MODES: [] };\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('mute SKILL source (no pointer) → doctor exit ≠ 0', r.status !== 0);
    ok('mute SKILL source → doctor names the skill path', r.stderr.includes('skill path'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3f — NEGATIVE: the reset exits 0 WITHOUT erasing anything ──
// The nastiest stub: plausible, silent, exit 0 — indistinguishable from a
// live reset without the proof by the STORE (doctor hole closed 19/07/2026).
{
  const tmp = cloneFrameworkWithSources();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'ctxroute-reset.js'), 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0)); process.stdin.on("data", () => {});\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('mute reset (exit 0 without erasing) → doctor exit ≠ 0', r.status !== 0);
    ok('mute reset → doctor names the surviving stores', r.stderr.includes('SURVIVE'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3e — NEGATIVE: the TURN gate no longer counts (driftUnit turn dead) ──
// A frozen counter = docs with driftUnit 'turn' NEVER re-injected, in silence —
// exactly the class of death the doctor exists to catch.
{
  const tmp = cloneFrameworkWithSources();
  try {
    // PLAUSIBLE stub: exit 0, mute — but counts NOTHING. Indistinguishable
    // from a live hook without probe 6 (the proof of life is the STORE, not
    // the output).
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'turn-count.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('mute TURN gate (does not count) → doctor exit ≠ 0', r.status !== 0);
    ok('mute TURN gate → doctor names the turn counter', r.stderr.includes('turn-count'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3i — NEGATIVE: the CANARY no longer returns any verdict ──────
// ⚠️ The canary is the ONLY witness looking at the OTHER end of the pipe. It
//    ran for TWO DAYS in production without any probe (hole created on
//    03/08/2026, closed on 05/08). A dead-man switch nobody watches is WORSE
//    than no switch: it manufactures confidence while guaranteeing nothing.
{
  const tmp = cloneFrameworkWithSources();
  try {
    // PLAUSIBLE stub: exit 0, mute — exactly what a HEALTHY canary must do on
    // the output side (it is mute by contract). Only the verdict FILE tells it
    // apart from a dead one. That is why the probe reads the file.
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'canary-check.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('mute canary (writes no verdict) → doctor exit ≠ 0', r.status !== 0);
    ok('mute canary → doctor names the canary', r.stderr.includes('canary-check.js'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3j — NEGATIVE: the CANARY is FROZEN on a constant verdict ────
// ⚠️ THE NASTIEST SABOTAGE, and the one a SINGLE-CASE probe would have let
//    through: a canary always writing `alive` produces a valid file, a
//    plausible verdict, and will NEVER detect the failure it exists to see.
//    That is the EXACT lesson of the inert purity gates of 03/08/2026 — a
//    gate that cannot go red is decoration.
{
  const tmp = cloneFrameworkWithSources();
  try {
    const fige = `
const fs = require('fs'); const path = require('path'); const paths = require('../src/paths');
let d = ''; process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  const dir = paths.stateDir(); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'canary.json'), JSON.stringify({ verdict: 'alive', appels: 0, injections: 0 }));
  process.exit(0);
});
`;
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'canary-check.js'), fige);
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('canary FROZEN on `alive` → doctor exit ≠ 0', r.status !== 0);
    ok('FROZEN canary → doctor says it no longer detects a DEAD channel',
      r.stderr.includes('DEAD') || r.stderr.includes('dead'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3g — NEGATIVE: the CODEX shell runs but INJECTS NOTHING ──
// Same class of silent death as case 3, on the Codex dialect.
{
  const tmp = cloneFrameworkWithSources();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'codex-doc-inject.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('silent CODEX shell (exit 0, no injection) → doctor exit ≠ 0', r.status !== 0);
    ok('silent CODEX shell → doctor names the Codex path', r.stderr.includes('codex-doc-inject'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 3h — NEGATIVE: the CODEX guard swallows invalid docs from a patch ──
{
  const tmp = cloneFrameworkWithSources();
  try {
    fs.writeFileSync(path.join(tmp, 'src', 'hooks', 'codex-doc-write-guard.js'), 'process.exit(0);\n');
    const r = runDoctor(path.join(tmp, 'tools', 'doctor.js'));
    ok('mute CODEX guard on an invalid patch → doctor exit ≠ 0', r.status !== 0);
    ok('mute CODEX guard → doctor names it', r.stderr.includes('codex-doc-write-guard'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 7 — NEGATIVE: incomplete CODEX wiring / double injection ──
// The Codex wiring lives outside the repo (~/.codex): the only coverage is --codex-hooks.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-codex-wiring-'));
  try {
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks');
    // 7a — Codex hooks.json wiring the OLD protect-files IN ADDITION to the
    //      shell + forgetting the TURN gate: the doctor must name the double
    //      AND the missing one.
    const hooksPath = path.join(tmp, 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'codex-doc-inject.js')}` },
      { command: `node ${path.join(tmp, 'protect-files.js')}` },
      { command: `node ${path.join(repo, 'codex-doc-write-guard.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
      { command: `node ${path.join(repo, 'session-inject.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--codex-hooks', hooksPath]);
    ok('CODEX wiring with protect-files (double injection) → doctor exit ≠ 0', r.status !== 0);
    ok('double CODEX wiring → doctor names the double injection', r.stderr.includes('TWICE'));
    ok('CODEX wiring without turn-count → doctor names it', r.stderr.includes('turn-count.js missing'));

    // 7b — COMPLETE and clean wiring → no problem on the Codex side.
    // ⚠️ "clean" INCLUDES additionalContextLimit = 0 on both EMITTERS
    //    (04/08/2026): without it, Codex truncates in silence — a wiring that
    //    delivers previews is not a clean wiring. Also proves the check works
    //    in JSON, not only in TOML.
    fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'codex-doc-inject.js')}`, additionalContextLimit: 0 },
      { command: `node ${path.join(repo, 'codex-doc-write-guard.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
      { command: `node ${path.join(repo, 'session-inject.js')}`, additionalContextLimit: 0 },
      { command: `node ${path.join(repo, 'turn-count.js')}` },
      // ⚠️ 6th path since 07/08/2026: without the canary, a Codex wiring is
      //    NOT "complete" — it is blind to its own death. This fixture went
      //    red on the first run after the check was added, which proves the
      //    check really bites (the opposite should have worried us).
      { command: `node ${path.join(repo, 'canary-check.js')}` },
    ] }] } }));
    const r2 = runDoctor(DOCTOR, ['--codex-hooks', hooksPath]);
    ok('complete and clean CODEX wiring → doctor exit 0', r2.status === 0);

    // 7c — the wired shell points at ANOTHER copy of the framework → red.
    fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(tmp, 'src', 'hooks', 'codex-doc-inject.js')}` },
      { command: `node ${path.join(repo, 'codex-doc-write-guard.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
      { command: `node ${path.join(repo, 'session-inject.js')}` },
      { command: `node ${path.join(repo, 'turn-count.js')}` },
    ] }] } }));
    const r3 = runDoctor(DOCTOR, ['--codex-hooks', hooksPath]);
    ok('CODEX shell wired from a COPY → doctor exit ≠ 0', r3.status !== 0);
    ok('CODEX shell as a copy → doctor names the file', r3.stderr.includes('codex-doc-inject.js'));

    // ── 7d — NEGATIVE: the CODEX CONTEXT CEILING (04/08/2026) ──────────
    // ⚠️ Without `additionalContextLimit = 0`, Codex spills beyond 2500 tokens
    //    and only sends a preview WITHOUT saying so: a SILENT failure. This
    //    block proves the gate really goes red — a gate never seen red is a
    //    gate you believe is in place (error class measured on 03/08 on the
    //    purity rules, all inert for months).
    // ⚠️ TOML format: that is the REAL terrain (hooks.json is IGNORED by
    //    Codex 0.144, measured on 19/07/2026).
    const toml = path.join(tmp, 'requirements.toml');
    const block = (file, limite) => [
      '[[hooks.PreToolUse.hooks]]',
      'type = "command"',
      `command = 'node ${path.join(repo, file)}'`,
      'timeout = 10',
      ...(limite === null ? [] : [`additionalContextLimit = ${limite}`]),
      '',
    ].join('\n');
    // ⚠️ `canary-check.js` is part of the HEALTHY wiring since 07/08/2026
    //    (6th Codex path). Omitting it here would make ALL the 7d parts red
    //    for a reason foreign to what they test — and we would then "fix" the
    //    wrong end. Its own negative-check is part 7f.
    // 🛑 DO NOT give it an `additionalContextLimit`: it emits no context.
    const cablage = (limInject, limSession) => block('codex-doc-inject.js', limInject)
      + block('codex-doc-write-guard.js', null)
      + block('ctxroute-reset.js', null)
      + block('session-inject.js', limSession)
      + block('turn-count.js', null)
      + block('canary-check.js', null);

    // 7d-1 — BOTH emitters declare 0 → green.
    fs.writeFileSync(toml, cablage(0, 0));
    ok('CODEX TOML wiring with additionalContextLimit = 0 everywhere → doctor exit 0',
      runDoctor(DOCTOR, ['--codex-hooks', toml]).status === 0);

    // 7d-2 — setting ABSENT everywhere → red, and the doctor names BOTH.
    fs.writeFileSync(toml, cablage(null, null));
    const rNu = runDoctor(DOCTOR, ['--codex-hooks', toml]);
    ok('CODEX wiring without additionalContextLimit → doctor exit ≠ 0', rNu.status !== 0);
    // ⚠️ Look for the REASON (`problems`), not the check label: only the
    //    reasons go to stderr. Expecting the label made the assertion always
    //    false — hence a negative-check proving NOTHING.
    ok('without additionalContextLimit → doctor names the PreToolUse shell',
      /codex-doc-inject\.js is wired WITHOUT additionalContextLimit/.test(rNu.stderr));
    ok('without additionalContextLimit → doctor ALSO names the SESSION gate',
      /session-inject\.js is wired WITHOUT additionalContextLimit/.test(rNu.stderr));
    ok('without additionalContextLimit → the reason states the SILENT failure',
      rNu.stderr.includes('2500 tokens') && rNu.stderr.includes('SILENCE'));

    // 7d-3 — ⚠️ THE TRAP: setting present on ONE SINGLE emitter. A GLOBAL
    //        match on the file would go green here — exactly the false green
    //        the per-block split exists to prevent.
    fs.writeFileSync(toml, cablage(0, null));
    const rMoitie = runDoctor(DOCTOR, ['--codex-hooks', toml]);
    ok('additionalContextLimit on ONE SINGLE emitter → doctor exit ≠ 0 (no global match)',
      rMoitie.status !== 0);
    ok('a single emitter configured → only the SESSION gate is named',
      /session-inject\.js is wired WITHOUT additionalContextLimit/.test(rMoitie.stderr)
      && !/codex-doc-inject\.js is wired WITHOUT additionalContextLimit/.test(rMoitie.stderr));

    // 7d-4 — a NON-ZERO value is not 0: it leaves a ceiling.
    //        Also guards against a `0` read inside `2500`/`10`.
    fs.writeFileSync(toml, cablage(5000, 0));
    ok('additionalContextLimit = 5000 (residual ceiling) → doctor exit ≠ 0',
      runDoctor(DOCTOR, ['--codex-hooks', toml]).status !== 0);

    // ── 7f — NEGATIVE: the CODEX CANARY is not wired (07/08/2026) ────────
    // ⚠️ THIS PART IS THE CHECK'S CONDITION OF EXISTENCE. Without it we would
    //    have added a line to the doctor without ever verifying it can go red —
    //    exactly the INERT purity rules of 03/08/2026, decorative for months
    //    while being quoted everywhere as THE guarantee.
    // ⚠️ WHAT IS AT STAKE: the canary is the only witness able to see Codex
    //    stop consuming our injections, and it is also the ONLY workable
    //    anti-deprecation gate (the 3 other leads were measured and closed on
    //    05/08). Unwired, it is not a convenience that goes missing: it makes
    //    the Codex harness entirely blind, in silence.
    const sansCanari = block('codex-doc-inject.js', 0)
      + block('codex-doc-write-guard.js', null)
      + block('ctxroute-reset.js', null)
      + block('session-inject.js', 0)
      + block('turn-count.js', null);
    fs.writeFileSync(toml, sansCanari);
    const rSansCanari = runDoctor(DOCTOR, ['--codex-hooks', toml]);
    ok('CODEX wiring WITHOUT canary-check.js → doctor exit ≠ 0', rSansCanari.status !== 0);
    ok('…and it NAMES the canary (a diagnostic mute on the cause is useless)',
      /canary-check\.js/.test(rSansCanari.stderr));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 7e — NEGATIVE: the Codex FEATURE FLAG (05/08/2026) ───────────
// ⚠️ The most perfect wiring is DEAD if Codex does not enable hooks, and the
//    flag lives in ANOTHER file than the wiring, OUTSIDE the repo: no other
//    test can see it. Hole paid for on 05/08/2026 (deprecated `codex_hooks`
//    still set). The 4 parts below exist because a gate never seen red is a
//    gate you BELIEVE is in place.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-codex-features-'));
  try {
    const cfg = path.join(tmp, 'config.toml');
    const run = () => runDoctor(DOCTOR, ['--codex-config', cfg]);

    // 7e-1 — HEALTHY config: the new flag, and nothing else → green.
    fs.writeFileSync(cfg, '[features]\nhooks = true\n');
    ok('CODEX config with `hooks = true` alone → doctor exit 0', run().status === 0);

    // 7e-2 — the DEPRECATED flag is still declared (the REAL 05/08 case).
    fs.writeFileSync(cfg, '[features]\nhooks = true\ncodex_hooks = true\n');
    const rDep = run();
    ok('CODEX config with `codex_hooks` declared → doctor exit ≠ 0', rDep.status !== 0);
    ok('deprecated flag → the reason states the SILENT death',
      rDep.stderr.includes('deprecated') && rDep.stderr.includes('SILENCE'));

    // 7e-3 — ⚠️ THE TRAP: a COMMENT has the RIGHT to name `codex_hooks` to
    //        explain why it must no longer be written — that is the case in
    //        the reference config.toml. An unanchored match would go red
    //        here, and a gate that goes red on healthy state ends up
    //        unplugged (rush lesson).
    fs.writeFileSync(cfg, '[features]\n# `hooks` and NOT `codex_hooks` since 0.146\nhooks = true\n');
    ok('`codex_hooks` mentioned in a COMMENT only → doctor exit 0 (no false positive)',
      run().status === 0);

    // 7e-4 — flag ABSENT: no Codex hook runs, hence zero injection.
    fs.writeFileSync(cfg, '[features]\nweb_search = true\n');
    const rAbs = run();
    ok('CODEX config WITHOUT `hooks = true` → doctor exit ≠ 0', rAbs.status !== 0);
    ok('flag absent → the reason states that hooks are DISABLED',
      rAbs.stderr.includes('DISABLED'));

    // 7e-5 — file not found: "I could not measure" ≠ "it is healthy".
    ok('CODEX config not found → doctor exit ≠ 0',
      runDoctor(DOCTOR, ['--codex-config', path.join(tmp, 'absent.toml')]).status !== 0);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 4 — NEGATIVE: settings.json points at a non-existent file ──
// The most likely silent death: the wiring lives outside the repo.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    fs.writeFileSync(settings, JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ command: `node ${path.join(tmp, 'disparu', 'legacy-mcp-inject.js')}` }] }],
               PreCompact: [{ hooks: [{ command: `node ${path.join(tmp, 'disparu', 'ctxroute-reset.js')}` }] }] },
    }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('wiring to a NON-EXISTENT file → doctor exit ≠ 0', r.status !== 0);
    ok('wiring to a NON-EXISTENT file → doctor names it', r.stderr.includes('NON-EXISTENT'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5 — NEGATIVE: settings.json does not wire the framework at all ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring2-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'node other-hook.js' }] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('framework NOT wired → doctor exit ≠ 0', r.status !== 0);
    // Since the merge (17/07/2026): it must name BOTH missing wirings
    // (gate = unique injector, reset = post-compaction re-injection).
    ok('framework NOT wired → doctor names the missing gate', r.stderr.includes('doc-inject.js missing'));
    ok('framework NOT wired → doctor names the missing reset', r.stderr.includes('ctxroute-reset.js missing'));
    ok('framework NOT wired → doctor names the missing session gate', r.stderr.includes('session-inject.js missing'));
    ok('framework NOT wired → doctor names the missing write guard', r.stderr.includes('doc-write-guard.js missing'));
    ok('framework NOT wired → doctor names the missing TURN gate', r.stderr.includes('turn-count.js missing'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5b — NEGATIVE: the MCP engine is wired but NOT the gate (doc-inject) ──
// Since the switchover (17/07/2026), doc-inject.js injects the FILE docs. Wiring
// the rest without the gate = no file doc any more, in silence. The doctor MUST scream.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring3-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks'); // legacy-mcp-inject/reset EXIST and are THIS repo → only the gate check falls.
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'legacy-mcp-inject.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('GATE not wired → doctor exit ≠ 0', r.status !== 0);
    ok('GATE not wired → doctor names the gate', r.stderr.includes('doc-inject.js'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5c — NEGATIVE: legacy-mcp-inject.js STILL wired next to the gate ──
// Since the merge (17/07/2026), the gate also covers MCP: leaving the legacy
// wired = MCP docs injected TWICE (tokens burned). The doctor MUST scream.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring4-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks'); // gate + reset wired and valid → only the anti-double check falls.
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'doc-inject.js')}` },
      { command: `node ${path.join(repo, 'legacy-mcp-inject.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('legacy still wired → doctor exit ≠ 0', r.status !== 0);
    ok('legacy still wired → doctor names the double injection', r.stderr.includes('TWICE'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5d — NEGATIVE: everything wired EXCEPT the SESSION gate ──
// Since 17/07/2026, docs/session/ is injected by session-inject.js on
// SessionStart: forgetting it = no more session knowledge, in silence.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring5-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks'); // gate + reset wired and valid → only the session check falls.
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'doc-inject.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('SESSION gate not wired → doctor exit ≠ 0', r.status !== 0);
    ok('SESSION gate not wired → doctor names it', r.stderr.includes('session-inject.js missing'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5e — NEGATIVE: everything wired EXCEPT the TURN gate (turn-count.js) ──
// driftUnit 'turn' without its sensor = frozen counter = docs never
// re-injected, in silence. The doctor MUST name the missing wiring precisely.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring6-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks'); // gate + reset + session + guard wired → only the turn check falls.
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'doc-inject.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
      { command: `node ${path.join(repo, 'session-inject.js')}` },
      { command: `node ${path.join(repo, 'doc-write-guard.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('TURN gate not wired → doctor exit ≠ 0', r.status !== 0);
    ok('TURN gate not wired → doctor names it', r.stderr.includes('turn-count.js missing'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 5f — NEGATIVE: everything wired EXCEPT the CANARY ───────────
// Unwiring the canary degrades NOTHING visible — which is exactly what makes
// it dangerous: we lose the only witness able to see the harness stop
// consuming our injections, and we lose it without any symptom.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-wiring7-'));
  try {
    const settings = path.join(tmp, 'settings.json');
    const repo = path.join(import.meta.dirname, '..', 'src', 'hooks'); // everything else wired → only the canary check falls.
    fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { command: `node ${path.join(repo, 'doc-inject.js')}` },
      { command: `node ${path.join(repo, 'ctxroute-reset.js')}` },
      { command: `node ${path.join(repo, 'session-inject.js')}` },
      { command: `node ${path.join(repo, 'doc-write-guard.js')}` },
      { command: `node ${path.join(repo, 'turn-count.js')}` },
    ] }] } }));
    const r = runDoctor(DOCTOR, ['--settings', settings]);
    ok('canary not wired → doctor exit ≠ 0', r.status !== 0);
    ok('canary not wired → doctor names it', r.stderr.includes('canary-check.js missing'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── Case 6 — the probe must NEVER touch the shipped files of the repo ──
// Gitignored user config (19/07/2026): the real one if present (installed
// machine), otherwise the shipped .example (fresh clone/CI) — same invariant.
{
  const real = path.join(import.meta.dirname, '..', 'ctxroute-config.json');
  const cfg = fs.existsSync(real) ? real : path.join(import.meta.dirname, '..', 'ctxroute-config.json.example');
  const before = fs.readFileSync(cfg, 'utf8');
  runDoctor(DOCTOR);
  const after = fs.readFileSync(cfg, 'utf8');
  ok('the probe does NOT modify the shipped config (total tmpdir isolation)', before === after);
}
