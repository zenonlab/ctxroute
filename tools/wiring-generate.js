#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// wiring-generate.js — the wiring becomes an ARTEFACT, the manifest the source
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 PHASE ONE IS READ-ONLY, AND THAT IS A DECISION, NOT A LIMITATION.
//    `settings.json` is NOT ours: it also carries the operator's own hooks,
//    their permissions and their preferences. A generator that rewrote the
//    whole file would destroy configuration it does not own. So this tool
//    emits a FRAGMENT — the framework's declarations, and nothing else — into
//    the file named by `--out`. `test/wiring-drift-gate.test.js` compares that
//    fragment with what the live file really declares. Taking the generator
//    live (splicing the fragment INTO settings.json) is a separate decision,
//    for the operator, at a moment when no agent is running.
//
// 🛑 IT REFUSES TO WRITE A FILE NAMED `settings.json`. The whole value of this
//    phase is that a mistake here cannot cost the operator their configuration.
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
const { plan } = require('../src/wiring-plan');

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

function main() {
  const out = flag('out');
  if (!out) refuse('--out <file> is required (this tool NEVER writes settings.json itself — read the header)');
  if (path.basename(out).toLowerCase() === 'settings.json') {
    refuse('--out may not be named settings.json: phase one is read-only and must not be able to overwrite the operator\'s configuration');
  }

  const manifestPath = flag('manifest') || path.join(ROOT, 'wiring.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { refuse(`unreadable manifest ${posix(manifestPath)}: ${e.message}`); }

  const settings = flag('settings');
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

  const root = flag('root') || posix(ROOT);
  const declarations = plan(manifest, {
    root: root.replace(/\/+$/, ''),
    frames,
    laneFlag,
    stateConsumers: deriveStateConsumers(ROOT),
    settingsPath: settings,
  });

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
