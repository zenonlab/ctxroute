#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// DOCTOR — dead-man switch: the framework SCREAMS if it is dead
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ RAISON D'ÊTRE: a dead PreToolUse hook is INDISTINGUISHABLE from an
// absent hook. There is NO visible symptom — no error, no log, just a doc
// that stops reaching the agent's context. Already lived through twice on
// 15/07/2026: (1) a fixture config committed → 0 injection for days;
// (2) broken lock on a fresh checkout → invisible locally. Unit tests see
// NOTHING of that: they build their own config and never exercise the real
// wiring.
//
// WHAT THIS COVERS (what no other gate covers):
//   1. END-TO-END PROBE: spawn the REAL hook, in total isolation (tmpdir),
//      with a synthetic MCP payload → assert that an additionalContext comes
//      out. Catches: broken node, crash at load, missing dependency,
//      changed Claude Code output contract, silent exit(0).
//   2. WIRING (--settings <path>): does the machine's settings.json
//      reference hook files that really EXIST? Catches: renamed/moved file,
//      stale absolute path — THE most likely cause of silent death, since
//      the wiring lives OUTSIDE the repo (so no test in the repo can see it).
//
// ⚠️ LOUD OUTPUT AND EXIT ≠ 0 on failure: that is the whole point.
// NEVER make it fail-open like the hooks — a hook must be silent and
// non-blocking in production, a DIAGNOSTIC must scream. Opposite roles,
// never merged.
//
// Usage:
//   node doctor.js                             → end-to-end probe
//   node doctor.js --settings ~/.claude/settings.json → probe + wiring
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ⚠️ THE WIRING DECISIONS LIVE IN A PURE, STRYKER-MUTATED MODULE. This file is I/O: it is
//    deliberately outside `mutate` (equivalent mutants guaranteed), so anything it DECIDES is
//    measured by nothing. `checkWiring` used to hold ~325 lines of pure judgement — the fleet's
//    dead-man switch judging itself with no mutation at all. 🛑 Never bring a decision back here.
const wiringPure = require('../src/doctor-wiring-pure');

// ⚠️ SINGLE HOOK since the merge (17/07/2026): doc-inject.js (the gate)
//    injects ALL docs — file (frontmatters) AND MCP (docs/mcp/).
//    legacy-mcp-inject.js is REMOVED from the wiring (kept in the repo for
//    the mcp-differential.test.js differential and for rollback).
const PORTE = path.join(__dirname, '..', 'src', 'hooks', 'doc-inject.js');
const RESET_HOOK = path.join(__dirname, '..', 'src', 'hooks', 'ctxroute-reset.js');
// SISTER SessionStart gate (docs/session/ injected at every session start).
const SESSION_PORTE = path.join(__dirname, '..', 'src', 'hooks', 'session-inject.js');
// PostToolUse write guard (real-time feedback on an invalid doc).
const WRITE_GUARD = path.join(__dirname, '..', 'src', 'hooks', 'doc-write-guard.js');
// TURN gate (UserPromptSubmit): turn counter for driftUnit 'turn'.
const TURN_PORTE = path.join(__dirname, '..', 'src', 'hooks', 'turn-count.js');
// CANARY (UserPromptSubmit): the only witness looking at the OTHER end of the pipe.
const CANARI = path.join(__dirname, '..', 'src', 'hooks', 'canary-check.js');
// CODEX shells (19/07/2026): same cores (porte-core/guard-core), Codex CLI
// dialect. reset/turn-count/session-inject are wired AS-IS on the Codex side.
const CODEX_PORTE = path.join(__dirname, '..', 'src', 'hooks', 'codex-doc-inject.js');
const CODEX_GUARD = path.join(__dirname, '..', 'src', 'hooks', 'codex-doc-write-guard.js');

// ⚠️ --quiet: TOTAL SILENCE as long as everything is fine, full scream as
// soon as a check falls. Mode meant for the SessionStart wiring: a diagnostic
// that talks at every session becomes noise, and noise gets ignored — so it
// would no longer be read the day it has something important to say.
// ⚠️ Affects ONLY the success output: failures always scream.
const QUIET = process.argv.includes('--quiet');
const say = (msg) => { if (!QUIET) console.log(msg); };

// ── HARNESS CONFORMANCE (㊾, 15/08/2026) — the DISTRIBUTION link ─────────
// Adopter usage: capture ONE real payload from their harness (a one-line hook
// copying stdin to a file — recipe in HARNESS-CONTRACT.md), then:
//   node doctor.js --harnais payload.json
// Verdict: supported / degraded (each point NAMED with its consequence) /
// incompatible — never a binary yes-no. Decision = harness-conformance.js
// (PURE, mutated); here only reading the file and displaying.
// ⚠️ What the payload CANNOT prove is SAID (context channel consumed by the
//    model = only the canary sees it, in real use) — never promised.
// ⚠️ `--harness` is the public flag; `--harnais` accepted for retro-compat (renamed 2026-08-16).
const idxH = (() => { const i = process.argv.indexOf('--harness'); return i !== -1 ? i : process.argv.indexOf('--harnais'); })();
if (idxH !== -1 && process.argv[idxH + 1]) {
  const { conformance } = require('../src/harness-conformance.js');
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(process.argv[idxH + 1], 'utf8'));
  } catch (e) {
    // FAIL-LOUD, like any diagnostic: a mute report reads as a verdict.
    console.error('🚨 TOOL FAILURE — unreadable payload: ' + e.message);
    process.exit(2);
  }
  const r = conformance(payload);
  console.log('\nHARNESS CONFORMANCE — verdict: ' + r.verdict.toUpperCase());
  for (const c of r.requis) console.log(`  ${c.present ? '✓' : '✗ REQUIRED MISSING'} ${c.capability} — ${c.role}`);
  if (r.degradations.length === 0) console.log('  ✓ every optional capability is present');
  for (const d of r.degradations) console.log(`  ⚠ ${d.capability} ABSENT → ${d.degradation}`);
  if (r.candidateKeys.length > 0) {
    console.log('  📎 path-SHAPED keys unknown to the profile (candidates for `pathKeys` in harness-profile.js — YOURS to decide, never guessed): ' + r.candidateKeys.join(', '));
  }
  console.log('  ℹ this test proves the PRESENCE of the contract fields. That the injected context is CONSUMED by the model is proven in real use (canary).');
  process.exit(r.verdict === 'incompatible' ? 1 : 0);
}

const problems = [];
const checks = [];

function check(name, cond, detail) {
  checks.push({ name, ok: !!cond });
  if (cond) say(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}`); problems.push(detail || name); }
}

// ── 1. END-TO-END PROBE ──────────────────────────────────────────────
// TOTAL isolation via the 3 env vars of paths.js: touches NEITHER the
// shipped config, NOR docs/mcp/, NOR state/. A probe polluting the repo
// would be the exact repetition of the bug we are trying to prevent.
function probe() {
  say('end-to-end probe (spawning the real hook):');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-doctor-'));
  const docsDir = path.join(tmp, 'docs');
  const fileDocsDir = path.join(tmp, 'filedocs');
  const stateDir = path.join(tmp, 'state');
  const configPath = path.join(tmp, 'config.json');
  const SENTINEL = 'DOCTOR_PROBE_SENTINEL';
  const FILE_SENTINEL = 'DOCTOR_PROBE_FILE_SENTINEL';

  try {
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(fileDocsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'doctorprobe.md'), `# probe\n${SENTINEL}\n`);
    fs.writeFileSync(path.join(fileDocsDir, 'doctorprobe-file.md'),
      `---\nmatch: doctor-probe-target.js\nmode: dumb\n---\n${FILE_SENTINEL}\n`);
    fs.writeFileSync(configPath, JSON.stringify({
      mode: 'dumb', filterMode: 'none', servers: {},
      // Synthetic skill for Probe 5 (skill source). dumb = injects on every call.
      skills: { doctorprobeskill: { match: ['doctor-probe-skill-target'], servers: ['doctorprobesrv'], mode: 'dumb' } },
    }));

    const env = {
      ...process.env,
      CTXROUTE_CONFIG_PATH: configPath,
      CTXROUTE_DOCS_DIR: docsDir,
      CTXROUTE_FILEDOCS_DIR: fileDocsDir,
      CTXROUTE_STATE_DIR: stateDir,
      CTXROUTE_GC_PROBABILITY: '0', // purge disabled: the probe must delete nothing
    };

    // Probe 1 — MCP path of the gate (source sources/mcp.js).
    const r = spawnSync(process.execPath, [PORTE], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__doctorprobe__ping',
        session_id: 'doctor-probe',
        tool_input: {},
      }),
      encoding: 'utf8',
      env,
    });

    check('the gate runs without crashing (exit 0)', r.status === 0,
      `doc-inject.js exited with code ${r.status} — stderr: ${(r.stderr || '').trim().slice(0, 300)}`);

    let out = null;
    try { out = JSON.parse((r.stdout || '').trim()); } catch { /* out stays null */ }

    check('the gate emits a valid decision JSON on stdout', out !== null,
      `stdout unreadable or empty: ${(r.stdout || '').trim().slice(0, 200)}`);

    check('the decision honours the Claude Code PreToolUse contract',
      out && out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'allow',
      'hookSpecificOutput.permissionDecision !== "allow" — Claude Code output contract broken.');

    check('the MCP doc is REALLY injected (additionalContext contains the sentinel)',
      out && out.hookSpecificOutput && String(out.hookSpecificOutput.additionalContext || '').includes(SENTINEL),
      'The gate runs but INJECTS NOTHING on the MCP side — silent death, exactly the 15/07/2026 bug.');

    // Probe 2 — FILE path of the gate (source sources/file.js, frontmatters).
    const rf = spawnSync(process.execPath, [PORTE], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        session_id: 'doctor-probe',
        tool_input: { file_path: 'C:/tmp/doctor-probe-target.js' },
      }),
      encoding: 'utf8',
      env,
    });
    let outF = null;
    try { outF = JSON.parse((rf.stdout || '').trim()); } catch { /* outF stays null */ }
    check('the FILE doc is REALLY injected (frontmatter path alive)',
      rf.status === 0 && outF && outF.hookSpecificOutput
        && String(outF.hookSpecificOutput.additionalContext || '').includes(FILE_SENTINEL),
      'The gate runs but INJECTS NOTHING on the FILE side — silent death of the frontmatter path.');

    // The PreCompact reset must REALLY DELETE the 3 stores — "exit 0" alone
    // proves NOTHING (a reset that exits cleanly without erasing anything =
    // docs never re-injected after compaction, IN SILENCE — doctor hole found
    // on 19/07/2026). Proof = drop the 3 files, reset, require their ABSENCE.
    fs.mkdirSync(stateDir, { recursive: true });
    const storeFiles = ['doc-seen-', 'ctxroute-seen-', 'turn-count-'].map((p) => path.join(stateDir, `${p}doctor-probe.json`));
    for (const f of storeFiles) fs.writeFileSync(f, '{}');
    const rr = spawnSync(process.execPath, [RESET_HOOK], {
      input: JSON.stringify({ hook_event_name: 'PreCompact', session_id: 'doctor-probe', trigger: 'auto' }),
      encoding: 'utf8',
      env,
    });
    check('the PreCompact reset really DELETES the 3 stores (not just exit 0)',
      rr.status === 0 && storeFiles.every((f) => !fs.existsSync(f)),
      'ctxroute-reset.js exits with 0 but the stores SURVIVE — docs never re-injected after compaction, in silence.');

    // Probe 3 — SESSION gate (docs/session/ → SessionStart). Same pattern:
    // a gate that runs without injecting = silent death.
    const SESSION_SENTINEL = 'DOCTOR_PROBE_SESSION_SENTINEL';
    const sessionDocsDir = path.join(tmp, 'sessiondocs');
    fs.mkdirSync(sessionDocsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDocsDir, 'doctorprobe-session.md'), `${SESSION_SENTINEL}\n`);
    const rs = spawnSync(process.execPath, [SESSION_PORTE], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'doctor-probe' }),
      encoding: 'utf8',
      env: { ...env, CTXROUTE_SESSIONDOCS_DIR: sessionDocsDir },
    });
    let outS = null;
    try { outS = JSON.parse((rs.stdout || '').trim()); } catch { /* outS stays null */ }
    check('the SESSION doc is REALLY injected (SessionStart gate alive)',
      rs.status === 0 && outS && outS.hookSpecificOutput
        && outS.hookSpecificOutput.hookEventName === 'SessionStart'
        && String(outS.hookSpecificOutput.additionalContext || '').includes(SESSION_SENTINEL),
      'session-inject.js runs but INJECTS NOTHING — silent death of the session path.');

    // Probe 4 — write guard (invalid doc → feedback block). A mute guard lets
    // agents write dead docs without a word.
    const badDoc = path.join(fileDocsDir, 'doctorprobe-invalide.md');
    fs.writeFileSync(badDoc, '---\nmach: typo.js\n---\ncontent\n');
    const rg = spawnSync(process.execPath, [WRITE_GUARD], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: badDoc } }),
      encoding: 'utf8',
      env,
    });
    let outG = null;
    try { outG = JSON.parse((rg.stdout || '').trim()); } catch { /* outG stays null */ }
    check('the WRITE GUARD reports an invalid doc (real-time feedback alive)',
      rg.status === 0 && outG && outG.decision === 'block',
      'doc-write-guard.js does NOT report an invalid doc — agents write dead docs in silence.');

    // Probe 5 — SKILL source (config.skills → skill BODY by perimeter,
    // maintainer decision 18/07/2026). The probe drops a REAL skill file in an
    // isolated store and requires its CONTENT to be injected (not a pointer).
    const SKILL_SENTINEL = 'DOCTOR_PROBE_SKILL_SENTINEL';
    const skillsDirProbe = path.join(tmp, 'skills');
    fs.mkdirSync(skillsDirProbe, { recursive: true });
    fs.writeFileSync(path.join(skillsDirProbe, 'doctorprobeskill.md'), `# doctorprobeskill\n${SKILL_SENTINEL}\n`);
    const rk = spawnSync(process.execPath, [PORTE], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        session_id: 'doctor-probe',
        tool_input: { file_path: 'C:/tmp/doctor-probe-skill-target.js' },
      }),
      encoding: 'utf8',
      env: { ...env, CTXROUTE_SKILLS_DIR: skillsDirProbe },
    });
    let outK = null;
    try { outK = JSON.parse((rk.stdout || '').trim()); } catch { /* outK stays null */ }
    check('the skill BODY is REALLY injected (skill source alive)',
      rk.status === 0 && outK && outK.hookSpecificOutput
        && String(outK.hookSpecificOutput.additionalContext || '').includes(SKILL_SENTINEL),
      'sources/skill.js runs but does NOT INJECT the skill content — silent death of the skill path.');

    // Probe 6 — TURN gate (turn-count.js, UserPromptSubmit). Mute by contract
    // (stdout = injected context!): the proof of life is the INCREMENTED
    // store, never the output. A dead counter = docs with driftUnit 'turn'
    // never re-injected again, in silence.
    const rt = spawnSync(process.execPath, [TURN_PORTE], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'doctor-probe', prompt: 'probe' }),
      encoding: 'utf8',
      env,
    });
    let turns = null;
    try {
      turns = JSON.parse(fs.readFileSync(path.join(stateDir, 'turn-count-doctor-probe.json'), 'utf8')).turns;
    } catch { /* turns stays null */ }
    check('the TURN counter really increments (turn-count gate alive) and stays MUTE',
      rt.status === 0 && (rt.stdout || '').trim() === '' && turns === 1,
      'turn-count.js does not count (or talks on stdout = context pollution) — driftUnit turn dead in silence.');
    // Probe 7 — CODEX PreToolUse shell (codex-doc-inject.js). Payload in the
    // Codex dialect (Bash + command, no agent_id). Proof of REAL EFFECT:
    // sentinel in additionalContext, and NEVER a permissionDecision
    // (shell contract: we inform, we do not decide).
    const rc = spawnSync(process.execPath, [CODEX_PORTE], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        session_id: 'doctor-probe-codex',
        tool_input: { command: 'cat C:/tmp/doctor-probe-target.js' },
      }),
      encoding: 'utf8',
      env,
    });
    let outC = null;
    try { outC = JSON.parse((rc.stdout || '').trim()); } catch { /* outC stays null */ }
    check('the CODEX shell REALLY injects (Codex dialect alive, without permissionDecision)',
      rc.status === 0 && outC && outC.hookSpecificOutput
        && outC.hookSpecificOutput.permissionDecision === undefined
        && String(outC.hookSpecificOutput.additionalContext || '').includes(FILE_SENTINEL),
      'codex-doc-inject.js does not inject (or emits a permissionDecision) — Codex path dead or out of contract.');

    // Probe 8 — CODEX write guard (paths extracted from the apply_patch patch).
    const rgc = spawnSync(process.execPath, [CODEX_GUARD], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: { command: `*** Begin Patch\n*** Update File: ${badDoc}\n*** End Patch` },
      }),
      encoding: 'utf8',
      env,
    });
    let outGC = null;
    try { outGC = JSON.parse((rgc.stdout || '').trim()); } catch { /* outGC stays null */ }
    check('the CODEX guard reports an invalid doc written through apply_patch',
      rgc.status === 0 && outGC && outGC.decision === 'block',
      'codex-doc-write-guard.js does NOT report an invalid doc inside a patch — Codex writes without a net.');

    // ── Probe 9 — THE CANARY (canary-check.js, UserPromptSubmit) ─────────
    // ⚠️ PLACED ON 05/08/2026, AFTER TWO DAYS IN PRODUCTION WITHOUT A PROBE.
    //    The canary is the witness watching the OTHER END of the pipe — but
    //    nothing was watching THE CANARY. A dead-man switch nobody looks at
    //    is worse than nothing: false confidence. It was the framework's most
    //    serious hole, and it was of my own making.
    //
    // ⚠️ WE PROVE BOTH VERDICTS, never just one: a canary stuck on a constant
    //    ('alive' hardcoded, or 'dead' hardcoded) would pass a single-case
    //    test — and would be as useless as an absent canary. Same lesson as
    //    the INERT purity gates of 03/08/2026.
    //
    // ⚠️ The transcript is FABRICATED here: the canary reads a real file, so
    //    we give it one. We NEVER touch the live transcript.
    const trans = (injects) => {
      const f = path.join(tmp, `transcript-${injects ? 'alive' : 'dead'}.jsonl`);
      const lines = [];
      // ⚠️ These lines are no longer COUNTED since 07/08/2026 (a transcript's
      //    format is not a contract on ANY harness — Codex doc: "isn't a
      //    stable interface"): they are only there as realistic NOISE.
      //    The denominator comes from the emission counter set below.
      for (let i = 0; i < 30; i++) lines.push('{"type":"tool_use","id":"t' + i + '"}');
      if (injects) lines.push('{"text":"[source: .claude/hooks/docs/probe.md]"}');
      fs.writeFileSync(f, lines.join('\n') + '\n');
      return f;
    };
    const passeCanari = (injects) => {
      const sante = path.join(stateDir, 'canary.json');
      try { fs.rmSync(sante, { force: true }); } catch { /* first pass */ }
      // ⚠️ WE SET THE DENOMINATOR — without it the canary answers 'undecidable'
      //    and the probe would prove NOTHING. `EMISSIONS_THRESHOLD` = 25, we
      //    write more. Key and prefix IDENTICAL to those written by
      //    `emission-core`: it is precisely that boundary which must stay true
      //    in production.
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, 'remainder-doctor-probe.json'),
        JSON.stringify({ segments: [], emissions: 30 }),
      );
      const r9 = spawnSync(process.execPath, [CANARI], {
        input: JSON.stringify({
          hook_event_name: 'UserPromptSubmit',
          session_id: 'doctor-probe',
          transcript_path: trans(injects),
        }),
        encoding: 'utf8',
        env,
      });
      let verdict = null;
      try { verdict = JSON.parse(fs.readFileSync(sante, 'utf8')).verdict; } catch { /* stays null */ }
      // MUTE BY CONTRACT: on UserPromptSubmit, stdout is injected into the
      // context and an exit ≠ 0 BLOCKS the user's prompt.
      return { verdict, muet: r9.status === 0 && (r9.stdout || '').trim() === '' };
    };
    const cMort = passeCanari(false);
    const cVivant = passeCanari(true);
    check('the CANARY detects a DEAD channel (30 calls, 0 injection landed) and stays MUTE',
      cMort.verdict === 'dead' && cMort.muet,
      'canary-check.js does not write the `dead` (DEAD) verdict into state/canary.json (or it talks on stdout / exits ≠ 0): '
      + 'the only witness able to see the harness stop consuming our injections is BLIND — and it would be so IN SILENCE.');
    check('the CANARY says `alive` (alive) as soon as ONE injection lands (it does not scream at healthy state)',
      cVivant.verdict === 'alive' && cVivant.muet,
      'canary-check.js does not go back to `alive` (alive) although an injection landed: verdict FROZEN. '
      + 'A permanent alarm becomes scenery nobody reads — hence a dead witness, but a green one.');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* OS tmpdir, never blocking */ }
  }
}

// ── 2. settings.json WIRING ──────────────────────────────────────────
// ⚠️ The wiring lives OUTSIDE the repo → NO test in the repo can see it.
// That is precisely where silent death strikes (moved file, stale absolute
// path). Hence the explicit check, opt-in through --settings.
function checkWiring(settingsPath) {
  say(`\nwiring (${settingsPath}):`);
  let raw = null;
  try { raw = fs.readFileSync(settingsPath, 'utf8'); } catch { /* raw stays null */ }
  if (raw === null) { check('settings.json readable', false, `settings.json not found: ${settingsPath}`); return; }

  let settings = null;
  try { settings = JSON.parse(raw); } catch { /* settings stays null */ }
  check('settings.json is valid JSON', settings !== null, `invalid JSON: ${settingsPath}`);
  if (!settings) return;

  // ── WHAT THIS SHELL MEASURES, AND NOTHING MORE ─────────────────────────
  // ⚠️ The DECISIONS live in `src/doctor-wiring-pure.js` — split brain, frame coordinates 1..N,
  //    lane coherence, divergent `--frames`. They used to live HERE, i.e. inside an I/O tool, i.e.
  //    OUTSIDE Stryker's `mutate`: the judgement of the fleet's dead-man switch had NEVER been
  //    mutated, so an inverted comparison would have stayed green for ever. 🛑 NEVER move a decision
  //    back into this file "to keep it together": that would silently un-mutate it again.
  //    This shell reads the disk, resolves paths, prints and exits — that is its whole job.

  // ⚠️ The declared bandwidth: `ctxroute-config.json` carries the user's INTENT, `settings.json`
  //    carries the WIRING the harness executes. Key absent = no opinion, no blame.
  let wantedFrames = null;
  try {
    const cfg = require('../src/collect-core').loadConfig();
    if (cfg && Number.isInteger(cfg.frames) && cfg.frames >= 1) wantedFrames = cfg.frames;
  } catch { /* unreadable config: the config gate says so, not this one */ }

  // ⚠️ `LANE_FLAG` is READ from `client-core.js`, never re-spelled here: four shells and one judge
  //    must not be able to drift apart. Unreadable ⇒ null ⇒ the anti-vacuity check turns RED.
  let LANE_FLAG = null;
  try { ({ LANE_FLAG } = require('../src/client-core')); } catch { /* stays null */ }

  // ⚠️ THE PEER LIST IS DERIVED FROM THE CODE, NEVER WRITTEN: a shell consumes the shared injection
  //    state exactly when it asks `clientLane()` which lane it is on. A hand-written list only knows
  //    the consumers that existed the day it was typed, and the fifth would join a split in silence.
  const hooksDir = path.join(__dirname, '..', 'src', 'hooks');
  let files = [];
  try { files = fs.readdirSync(hooksDir); } catch { /* stays empty — the anti-vacuity check turns red */ }
  const consumers = [];
  for (const f of files) {
    if (!/\.js$/.test(f)) continue;
    let source = '';
    try { source = fs.readFileSync(path.join(hooksDir, f), 'utf8'); } catch { continue; }
    if (/clientLane\s*\(/.test(source)) consumers.push(f);
  }

  const findings = wiringPure.wiringFindings({
    settings, wantedFrames, laneFlag: LANE_FLAG, consumers, repoDir: __dirname,
  });
  for (const f of findings) {
    if (f.kind === 'check') { check(f.name, f.ok, f.detail); continue; }
    // ⚠️ THE TWO QUESTIONS ONLY THE DISK CAN ANSWER — and they are the most likely cause of a silent
    //    death: a renamed or moved file, and a stale absolute path aiming at ANOTHER copy of the
    //    framework (where your changes here simply do not apply). The WORDING is contract and comes
    //    from the pure module, per hook: a dead-man switch naming the wrong organ wastes the very
    //    time it exists to save.
    check(f.existsName, fs.existsSync(f.file), f.absentDetail);
    check(f.copyName,
      path.resolve(f.file) === path.resolve(path.join(__dirname, '..', 'src', 'hooks', f.base)),
      f.copyDetail);
  }
}

// ── 2bis. CODEX WIRING (~/.codex/hooks.json or config.toml) ──────────
// ⚠️ Same raison d'être as checkWiring: the Codex wiring lives OUTSIDE the repo.
// Opt-in through --codex-hooks <path>. Checks the SIX paths (2 Codex shells +
// 4 gates REUSED as-is: reset, session, turn, CANARY) + the ANTI-DOUBLE
// INJECTION
// ⚠️ It used to say "the 5 paths" (fixed on 09/08/2026): the canary was added
//    as the 6th path on 07/08 — the list checked just below does count six.
//    A comment under-counting the paths of a dead-man switch suggests a path
//    is out of scope when it is in fact guarded.
// rule: the old mechanism (protect-files.js copy in ~/.codex) must NO LONGER
// be wired at the same time as codex-doc-inject — otherwise each doc arrives
// TWICE on every tool call (tokens burned in silence).
function checkCodexWiring(hooksPath) {
  say(`\nCODEX wiring (${hooksPath}):`);
  let raw = null;
  try { raw = fs.readFileSync(hooksPath, 'utf8'); } catch { /* raw stays null */ }
  if (raw === null) { check('Codex hooks config readable', false, `file not found: ${hooksPath}`); return; }

  // Deliberately TEXTUAL matching (like checkWiring): JSON (hooks.json) AND
  // TOML (config.toml) without a dedicated parser — we look for file
  // references, not for structure (it evolves with Codex; rigid parsing =
  // false negative).
  const wired = (name) => raw.includes(name);
  const expectRepo = (name) => {
    // Every occurrence of the file must point at THIS repo (never a copy).
    const re = new RegExp(`([A-Za-z]:[\\\\/][^"'\\s]*?|/[^"'\\s]*?)${name.replace('.', '\\.')}`, 'g');
    let m; let all = true; let found = false;
    while ((m = re.exec(raw)) !== null) {
      found = true;
      const file = `${m[1]}${name}`.replace(/\\\\/g, '\\');
      if (path.resolve(file) !== path.resolve(path.join(__dirname, '..', 'src', 'hooks', name))) all = false;
      if (!fs.existsSync(path.resolve(file))) all = false;
    }
    return found && all;
  };

  check('the CODEX shell (codex-doc-inject.js) is wired on PreToolUse', wired('codex-doc-inject.js'),
    'codex-doc-inject.js missing from the Codex wiring: NO doc injected on the Codex side, in silence.');
  check('the CODEX guard (codex-doc-write-guard.js) is wired on PostToolUse', wired('codex-doc-write-guard.js'),
    'codex-doc-write-guard.js missing: apply_patch writes without a real-time net.');
  check('the reset (ctxroute-reset.js, REUSED GATE) is wired on PreCompact', wired('ctxroute-reset.js'),
    'ctxroute-reset.js missing from the Codex wiring: no more re-injection after compaction, in silence.');
  check('the SESSION gate (session-inject.js, REUSED) is wired on SessionStart', wired('session-inject.js'),
    'session-inject.js missing from the Codex wiring: docs/session/ never injected on the Codex side.');
  check('the TURN gate (turn-count.js, REUSED) is wired on UserPromptSubmit', wired('turn-count.js'),
    'turn-count.js missing from the Codex wiring: driftUnit turn dead on the Codex side.');
  // ⚠️ 6th PATH — THE CANARY ON THE CODEX SIDE (07/08/2026, backlog item ②).
  //    Without it, the framework had an end-to-end witness on only ONE
  //    harness: the day OpenAI changes its hook contract, Codex injection
  //    dies IN SILENCE (everything is fail-open, the doctor stays green).
  //    The canary is also, by construction, our ONLY usable anti-deprecation
  //    gate: detecting the ANNOUNCEMENT of a deprecated flag proved
  //    impossible for free (3 leads measured and closed on 05/08); the canary
  //    detects the EFFECT, which is enough and costs nothing.
  // ⚠️ SAME FILE as on the Claude side, without a shell: `transcript_path`
  //    and `session_id` are documented under those names in BOTH payloads.
  check('the CANARY (canary-check.js, REUSED) is wired on UserPromptSubmit', wired('canary-check.js'),
    'canary-check.js missing from the Codex wiring: NO witness would see Codex stop consuming '
    + 'our injections. The framework would believe itself healthy on a harness gone mute.');
  for (const name of ['codex-doc-inject.js', 'codex-doc-write-guard.js', 'ctxroute-reset.js', 'session-inject.js', 'turn-count.js', 'canary-check.js']) {
    if (wired(name)) {
      check(`the wired file exists and is THIS repo: ${name}`, expectRepo(name),
        `the Codex wiring points at a copy / a non-existent file for ${name} (this repo: ${__dirname}).`);
    }
  }
  // ── THE CODEX CONTEXT CEILING (04/08/2026) ─────────────────────────
  // ⚠️ Codex SPILLS to disk any additionalContext exceeding its default of
  //    2500 TOKENS and only sends a preview, WITHOUT telling the hook: the
  //    silent failure this framework fights. Only `additionalContextLimit = 0`
  //    (official doc: "pass the handler's complete additional context
  //    directly to the model") guarantees full delivery.
  // ⚠️ Checked PER BLOCK, never on the whole file: a single occurrence
  //    somewhere would leave the OTHER emitter mute — precisely the false
  //    green a global match would produce.
  // ⚠️ Require the setting ONLY of the paths that EMIT context: imposing it on
  //    the reset / the guard / the counter (which emit nothing) would be an
  //    inert declaration, the error class killed on 31/07 and 04/08.
  // ⚠️ Split on `command` and NOT on `[[hooks.`: the doctor accepts TOML
  //    (requirements.toml, the real terrain) AND JSON (hooks.json) — a split
  //    on TOML syntax would make this check MUTE on a JSON wiring, i.e. inert,
  //    exactly the 03/08 defect. `command` exists in both.
  //    Contract: the setting lives in the block of ITS hook, after its `command`.
  // ⚠️ OPTIONAL QUOTES are mandatory in both patterns: TOML writes
  //    `command = '...'`, JSON writes `"command":"..."`. A pattern without
  //    `"?` sees NOTHING in JSON — the check then went green by accident
  //    (single block) or red wrongly. Measured right here on 04/08/2026.
  const blocs = raw.split(/(?="?command"?\s*[=:])/);
  for (const emitter of ['codex-doc-inject.js', 'session-inject.js']) {
    if (!wired(emitter)) continue;
    const block = blocs.find((b) => b.includes(emitter));
    check(`${emitter} declares additionalContextLimit = 0 (FULL delivery)`,
      Boolean(block) && /additionalContextLimit"?\s*[=:]\s*0(?!\d)/.test(block),
      `${emitter} is wired WITHOUT additionalContextLimit = 0: Codex applies its default of 2500 tokens, `
      + 'writes the surplus to disk and sends only a PREVIEW to the model, in SILENCE. '
      + 'Large docs and skills therefore never arrive whole on the Codex side.');
  }

  // ⚠️ Match restricted to `command` lines: a warning COMMENT is allowed to
  //    name protect-files.js without triggering (false positive lived through
  //    on 19/07/2026 on the _comment of the freshly wired hooks.json).
  check('the old protect-files.js is NO LONGER wired on the Codex side (otherwise DOUBLE injection)',
    !/command[^\n]*protect-files\.js/.test(raw),
    'protect-files.js still wired in the Codex hooks AT THE SAME TIME as the shell: each doc arrives TWICE (DOUBLE injection).');
}

// ── 2ter. CODEX FEATURE FLAG (~/.codex/config.toml) ──────────────────
// ⚠️ RAISON D'ÊTRE: the most perfect wiring in the world is DEAD if Codex
//    does not enable hooks. The flag lives in ANOTHER file than the wiring
//    (config.toml ≠ requirements.toml) and OUTSIDE the repo: no test could
//    see it. Hole paid for on 05/08/2026 — `[features].codex_hooks` was still
//    set while Codex 0.146 has DEPRECATED it in favour of `hooks`. The day a
//    deprecated flag is REMOVED, the whole Codex injection dies IN SILENCE
//    (hooks are fail-open by contract: nothing screams).
// ⚠️ TWO requirements, never only one: `hooks = true` PRESENT **AND**
//    `codex_hooks` ABSENT. Checking only the presence of the new one would
//    let through a file carrying both — hence a deprecated flag lying dormant.
// ⚠️ Only the DECLARATION counts, never a MENTION: a comment is allowed to
//    name `codex_hooks` to explain why it must no longer be written (that is
//    the case in the reference config.toml). Same lesson as the
//    protect-files false positive of 19/07/2026 → anchored at line start.
function checkCodexFeatures(configPath) {
  say(`\nCODEX feature flag (${configPath}):`);
  let raw = null;
  try { raw = fs.readFileSync(configPath, 'utf8'); } catch { /* raw stays null */ }
  if (raw === null) { check('Codex config readable', false, `file not found: ${configPath}`); return; }

  check('[features].hooks = true is DECLARED (without it, NO Codex hook runs)',
    /^[ \t]*hooks[ \t]*=[ \t]*true[ \t]*$/m.test(raw),
    'no `hooks = true` declaration in the Codex config: hooks are DISABLED, '
    + 'so no doc and no skill is injected on the Codex side — and nothing reports it.');

  check('the old DEPRECATED flag `codex_hooks` is no longer declared',
    !/^[ \t]*codex_hooks[ \t]*=/m.test(raw),
    '`codex_hooks` is still DECLARED: deprecated since Codex 0.146.0, replaced by `hooks`. '
    + 'Codex only announces it on stderr at startup (nothing is persisted) and will remove it: '
    + 'that day the whole Codex injection dies IN SILENCE. Rename it to `hooks = true`.');
}

say('ctxroute doctor\n');
probe();

// ── 3. REAL INSTALLATION (only with --settings) ──────────────────────
// ⚠️ This check is only valid for a live install, NEVER for the repo:
// `docs/mcp/*.md` is gitignored, so a fresh checkout (CI, clone) has none —
// requiring it on the repo side put the CI red on 3 OSes on 15/07/2026.
// "Docs exist" is an INSTALLATION invariant, not a repository one.
function checkInstall() {
  const paths = require('../src/paths');
  say('\ninstallation:');
  let docs = [];
  try {
    docs = fs.readdirSync(paths.docsDir()).filter((f) => f.endsWith('.md') && !f.endsWith('.md.example'));
  } catch { /* directory absent → docs empty → the check below fails, on purpose */ }
  check('at least one MCP server is documented (without a doc, the framework is useless)', docs.length > 0,
    `No docs/mcp/*.md in ${paths.docsDir()} — the hook runs but has nothing to inject.`);
}

const idx = process.argv.indexOf('--settings');
if (idx !== -1 && process.argv[idx + 1]) { checkInstall(); checkWiring(process.argv[idx + 1]); }
// Codex wiring: opt-in, independent of --settings (a machine may have only
// one harness). Usage: node doctor.js --codex-hooks ~/.codex/hooks.json
const idxC = process.argv.indexOf('--codex-hooks');
if (idxC !== -1 && process.argv[idxC + 1]) checkCodexWiring(process.argv[idxC + 1]);
// Codex feature flag: opt-in SEPARATE from the wiring, because it lives in
// ANOTHER file (config.toml) than the managed hooks (requirements.toml).
// Usage: node doctor.js --codex-config ~/.codex/config.toml
const idxF = process.argv.indexOf('--codex-config');
if (idxF !== -1 && process.argv[idxF + 1]) checkCodexFeatures(process.argv[idxF + 1]);


// ── A REDUCED MEASUREMENT MUST DECLARE ITSELF REDUCED (2026-08-22) ───────
//
// 🔴 MEASURED THAT DAY: `node tools/doctor.js` ran 14 checks, `--settings <path>` ran 67, and BOTH
//    printed `0 problem(s)` IN IDENTICAL WORDS. The wiring was validated with the reduced form,
//    read as healthy, and production shipped with a SPLIT BRAIN. The switch did not lie — it
//    answered a SMALLER question than the one it was asked, and said nothing about the difference.
// 🛑 SAME LAW AS `lint-corpus`'s LIVENESS PROBE: "I could not measure" is never "it is healthy".
// 🛑 THE FLAGS ARE NOT MADE MANDATORY: a clean clone and CI legitimately have no settings.json, and
//    a doctor unusable there would be a diagnostic lost to protect its own completeness. What is
//    refused is SILENCE about the gap.
// ⚠️ IT RIDES THE SUCCESS CHANNEL (`say`), never stderr and never a failed check: nothing here is
//    BROKEN. `--quiet` therefore still means total silence — that mode is wired on SessionStart WITH
//    `--settings`, so it is not a reduced run, and a diagnostic that talks at every session becomes
//    noise, then gets ignored the day it matters. The notice sits next to the health claim it
//    qualifies, so the two can never be read apart.
// ⚠️ THE CONVENTIONAL ADDRESS IS DERIVED FROM THE ONE ACCESSOR THAT OWNS IT (`paths.fleetHooksDir()`
//    — settings.json is that directory's sibling), NEVER re-assembled from `os.homedir()`: a harness
//    root rebuilt by hand is a second definition that rots without a word.
{
  const paths = require('../src/paths');
  let settingsPath = null;
  let settingsExists = false;
  try {
    settingsPath = path.join(paths.fleetHooksDir(), '..', 'settings.json');
    settingsExists = fs.existsSync(settingsPath);
  } catch { /* address unknown ⇒ the notice says nothing about it, it never guesses */ }
  const given = [];
  for (const flag of ['--settings', '--codex-hooks', '--codex-config']) {
    const i = process.argv.indexOf(flag);
    if (i !== -1 && process.argv[i + 1]) given.push(flag);
  }
  const notice = wiringPure.reducedNotice({
    flagsGiven: given, ranCount: checks.length, settingsPath, settingsExists,
  });
  if (notice.length > 0) say('');
  for (const line of notice) say(line);
}

const failed = checks.filter((c) => !c.ok).length;
if (failed > 0 || !QUIET) console.log(`\n${checks.length - failed} ok, ${failed} problem(s)`);
if (failed > 0) {
  // ⚠️ DELIBERATELY LOUD (stderr + exit 1): the silence IS the bug.
  // 🛑 THIS MESSAGE USED TO SAY "no MCP doc is injected" (fixed 09/08/2026).
  //    That was true BEFORE the 17/07 merge — the doctor then covered only
  //    the MCP path. Today it probes NINE paths (MCP, file, session, skill,
  //    reset, guard, turn counter, canary, Codex shells): a dead turn counter
  //    therefore displayed "no MCP doc is injected", i.e. a diagnostic that
  //    SENDS YOU LOOKING IN THE WRONG PLACE. A dead-man switch naming the
  //    wrong organ wastes the very time it is meant to save — the list of
  //    problems, on the other hand, was correct.
  console.error('\n🚨 ctxroute is BROKEN — one or more paths of the framework are dead:');
  for (const p of problems) console.error(`   • ${p}`);
  process.exit(1);
}
say('✅ framework alive: the hook runs AND really injects.');
