#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// wiring-generate.js — the wiring becomes an ARTEFACT, the manifest the source
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 TWO MODES, AND ONLY ONE OF THEM TOUCHES THE OPERATOR'S FILE.
//    `--out <file>` emits a FRAGMENT — the framework's declarations, nothing
//    else — and REFUSES a file named `settings.json`; that is the mode
//    `test/wiring-drift-gate.test.js` uses, and a mistake there cannot cost
//    anybody their configuration.
//    `--write <settings.json>` SPLICES those declarations into a real wiring.
//    It exists because the alternative is the hand-editing that produced the
//    2026-08-22 defect. It is never the default: writing happens only when
//    that flag is typed, by a human, at a moment when no agent is running.
//
// 🛑 `settings.json` IS NOT OURS. It also carries the operator's own hooks,
//    their permissions and their preferences. The write is therefore a
//    SPLICE, decided by `wiring-plan.splice` (pure, mutated): our declarations
//    are replaced in place, every foreign key, block and entry passes through
//    byte-identical. This tool NEVER rewrites a file it does not own.
//
// 🛑 THE FOUR GUARDS ON THE WRITE PATH, none of them optional:
//    ① a TIMESTAMPED BACKUP is taken first and its path is PRINTED — a rollback
//      nobody can name does not exist;
//    ② the file is written atomically (tmp + rename), then RE-READ and PARSED —
//      a broken `settings.json` kills every hook on the machine, ours and
//      theirs, and it would do so silently;
//    ③ the re-read must match what we intended byte for byte, or the backup is
//      RESTORED and the tool refuses. A half-written wiring is worse than none;
//    ④ any declaration that MENTIONS this framework without being ours by
//      command is a REFUSAL, not a survivor — it would run beside what we
//      wrote, which is two wirings of one framework.
//
// ⚠️ IDEMPOTENT: replaying converges on the same file and stacks nothing. That
//    is a property of the splice, not of the caller's discipline.
//
// ⚠️ DETERMINISM IS A CONTRACT: same manifest + same machine facts ⇒ byte-
//    identical output. No clock, no randomness, no directory-order dependence
//    (the derived consumer set is SORTED). Without it the drift gate would
//    report a divergence that is only the generator disagreeing with itself.
//
// ⚠️ EVERY MACHINE FACT IS MEASURED, NEVER ASSUMED, AND A MISSING ONE IS A
//    NAMED REFUSAL (exit 2). A generator that guessed a default would emit a
//    plausible wiring that runs the wrong code — the silent failure this whole
//    repository is built against.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { plan, splice } = require('../src/wiring-plan');

const ROOT = path.resolve(__dirname, '..');

/** Loud refusal: a diagnostic that fails quietly is indistinguishable from one that passes. */
function refuse(message) {
  process.stderr.write(`wiring-generate: ${message}\n`);
  process.exit(2);
}

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  // A token starting with `-` is the NEXT flag, never this one's value.
  return v === undefined || v.startsWith('-') ? null : v;
}

/** Absolute paths travel POSIX-separated: that is the form the harness executes. */
const posix = (p) => p.split(path.sep).join('/');

// ── THE STATE CONSUMERS ARE DERIVED FROM THE CODE ────────────────────
// A shell consumes the shared injection state exactly when it asks
// `clientLane()` which lane it is on. A hand-written list would only know the
// consumers that existed the day it was typed — and the fifth one would join
// the split brain in silence. Same authority as `doctor.js --settings`, on
// purpose: two derivations of one truth must not be able to disagree.
function deriveStateConsumers(root) {
  const dir = path.join(root, 'src', 'hooks');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { refuse(`src/hooks is unreadable under ${posix(root)} — the state consumers cannot be derived, and guessing them is what produced the defect this tool closes`); }
  const found = files
    .filter((f) => /\.js$/.test(f))
    .filter((f) => {
      let src = '';
      try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return false; }
      return /clientLane\s*\(/.test(src);
    })
    .sort();
  if (found.length === 0) refuse('no state consumer found in src/hooks — either the derivation is broken or the lane no longer exists; both are refusals, never a wiring generated as if the lane were empty');
  return found;
}

// ── THE BACKUP IS TAKEN BEFORE ANYTHING, AND IT IS NAMED ─────────────
// ⚠️ THE TIMESTAMP IS UTC AND SORTABLE, and it is the ONLY non-deterministic
//    value this tool produces — deliberately confined to the WRITE path, so
//    the `--out` fragment the drift gate compares stays byte-reproducible.
// 🛑 A ROLLBACK NOBODY CAN NAME DOES NOT EXIST: the path is returned to the
//    caller and PRINTED, even in --quiet. Silence about a backup is the same
//    as having none the moment somebody needs it.
function backup(file) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const target = `${file}.ctxroute-backup-${stamp}`;
  // `copyFileSync` and not a rename: the original must stay in place, because a
  // crash between here and the write would otherwise leave the machine with NO
  // wiring at all — a worse state than the one we came to fix.
  try { fs.copyFileSync(file, target); } catch (e) { refuse(`the backup of ${posix(file)} could not be taken (${e.message}) — nothing was written: this tool does not modify a wiring it cannot roll back`); }
  return target;
}

/** Canonical form, so "what we wrote" and "what came back" are compared on content, not on formatting. */
const canonical = (value) => JSON.stringify(value);

// ── THE SPLICE, WRITTEN AND THEN PROVEN ──────────────────────────────
function write(target, declarations, root) {
  let raw;
  try { raw = fs.readFileSync(target, 'utf8'); } catch (e) {
    refuse(`--write ${posix(target)} is unreadable (${e.message}) — a wiring is never CREATED here, only updated: an unreadable path is far more often a wrong path than a missing file`);
  }
  let current;
  try { current = JSON.parse(raw); } catch (e) {
    refuse(`--write ${posix(target)} is not valid JSON (${e.message}) — refusing to overwrite a file we cannot read: whatever it contains, the operator has not seen it break yet`);
  }

  const result = splice(current, declarations, root);

  // ④ ANYTHING THAT MENTIONS US WITHOUT BEING OURS STOPS THE WRITE.
  //    Typically a declaration of this framework in ANOTHER spelling — another
  //    transport, another path, a copy left behind. Splicing beside it would
  //    leave two wirings of one framework running at once.
  if (result.suspects.length > 0) {
    refuse(`${result.suspects.length} declaration(s) in ${posix(target)} mention this framework without being generated by this manifest:\n`
      + result.suspects.map((s) => `    ${canonical(s)}`).join('\n')
      + `\n  Writing would leave them running BESIDE the ${declarations.length} declarations generated here — two wirings of one framework, which is exactly the split brain this manifest exists to remove.`
      + '\n  Declare them in wiring.json, or remove them from the wiring, then run again.');
  }

  const saved = backup(target);
  process.stdout.write(`backup: ${posix(saved)}\n`);

  const text = `${JSON.stringify(result.settings, null, 2)}\n`;
  // Atomic publication: a reader never sees a half-written wiring, and a crash
  // mid-write leaves the ORIGINAL file, not a truncated one.
  const tmp = `${target}.ctxroute-tmp`;
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* the temp file is debris, never the diagnosis */ }
    refuse(`the wiring could not be written (${e.message}) — the original is untouched, and ${posix(saved)} holds a copy of it`);
  }

  // ②③ RE-READ, PARSE, AND COMPARE WITH WHAT WE MEANT TO WRITE. A broken
  //     settings.json kills EVERY hook on the machine — ours and the
  //     operator's — and it does it silently. So the proof that the file is
  //     still a wiring is a READ, never the absence of an exception above.
  const restore = (why) => {
    try { fs.copyFileSync(saved, target); } catch (e) {
      refuse(`${why}\n  AND THE ROLLBACK FAILED (${e.message}). The wiring is at ${posix(target)} and its backup at ${posix(saved)} — restore it by hand before starting an agent.`);
    }
    refuse(`${why}\n  The backup was RESTORED from ${posix(saved)}: the machine is exactly as it was.`);
  };

  let reread;
  try { reread = JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) {
    restore(`the file written to ${posix(target)} does not parse back as JSON (${e.message}).`);
  }
  if (canonical(reread) !== canonical(result.settings)) {
    restore(`the file re-read from ${posix(target)} differs from what was written. Something else is writing this file, or the write was partial.`);
  }
  return { saved, ...result };
}

function main() {
  const out = flag('out');
  const target = flag('write');
  // 🛑 WRITING HAPPENS ONLY ON AN EXPLICIT FLAG. There is no default that
  //    touches a real wiring, and no mode where both happen at once: a tool
  //    that could do either depending on the arguments is a tool whose effect
  //    the operator has to reconstruct from the command line.
  if (!out && !target) refuse('one of --out <file> (emit a fragment) or --write <settings.json> (splice into a real wiring) is required');
  if (out && target) refuse('--out and --write are exclusive: emitting a fragment and modifying a wiring are two different acts, and they are typed separately on purpose');
  if (out && path.basename(out).toLowerCase() === 'settings.json') {
    refuse('--out may not be named settings.json: the fragment mode is read-only towards the operator\'s configuration, and --write is the flag that says otherwise');
  }

  const manifestPath = flag('manifest') || path.join(ROOT, 'wiring.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { refuse(`unreadable manifest ${posix(manifestPath)}: ${e.message}`); }

  // `{settings}` expands to the file the wiring AUDITS. In write mode that file
  // is MEASURED — it is the very file being spliced — so it is not asked for
  // twice; in fragment mode there is nothing to measure and it must be given.
  const settings = flag('settings') || target;
  if (!settings) refuse('--settings <path> is required: it is what `{settings}` expands to, and inventing it would wire a doctor that audits a file nobody executes');

  // `frames` has ONE source — the user's config — and it is CONFRONTED with the
  // wiring by `doctor --settings`. Re-declaring it in the manifest would put
  // the same number in two places, which is the divergence of 2026-08-05.
  let frames = null;
  try {
    const cfgPath = process.env.CTXROUTE_CONFIG_PATH || path.join(ROOT, 'ctxroute-config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Number.isInteger(cfg.frames) && cfg.frames >= 1) frames = cfg.frames;
  } catch { /* refused just below, with its reason */ }
  if (frames === null) refuse('`frames` is not declared in ctxroute-config.json — the bandwidth of one action has no default here: a guessed frame count silently changes what a gesture can deliver');

  let laneFlag = null;
  try { ({ LANE_FLAG: laneFlag } = require('../src/client-core')); } catch { /* refused below */ }
  if (typeof laneFlag !== 'string' || laneFlag.length === 0) refuse('LANE_FLAG is unreadable from src/client-core.js — the lane is an ARGUMENT and its spelling has ONE owner; re-typing it here is how four shells drift apart');

  const root = (flag('root') || posix(ROOT)).replace(/\/+$/, '');
  const declarations = plan(manifest, {
    root,
    frames,
    laneFlag,
    stateConsumers: deriveStateConsumers(ROOT),
    settingsPath: settings,
  });

  if (target) {
    const done = write(target, declarations, root);
    process.stdout.write(`${done.removed} declaration(s) replaced by ${done.written} -> ${posix(target)}\n`);
    return;
  }

  const fragment = {
    generatedBy: 'tools/wiring-generate.js',
    manifest: path.basename(manifestPath),
    declarations,
  };
  fs.writeFileSync(out, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
  if (process.argv.includes('--quiet')) return;
  process.stdout.write(`${declarations.length} framework declaration(s) -> ${posix(out)}\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { refuse(e.message); }
}

module.exports = { deriveStateConsumers };
