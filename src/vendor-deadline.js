#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// VENDORS deadline.js into ~/.claude/hooks/ + arms the fleet's hooks
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ DRY-RUN BY DEFAULT (`--write` to apply). A script that writes by
//    default is a script one runs one time too many. These files are IN
//    PRODUCTION: other agents use them on every tool call.
//
// ⚠️ IDEMPOTENT: replaying converges, never duplicates an `arm()` already in place.
//    The condition for resuming after a mid-course crash without damage.
//
// ⚠️ COPY, NOT require() TOWARDS THIS REPO: the personal hooks must NOT depend
//    on an absolute path to a public repo (it moves, they die). `deadline.js`
//    is standalone ON PURPOSE so that it can be copied. The drift of the 2 copies is killed by
//    `deadline-vendor.test.js` — without this drift-test, this script creates debt.
//
// ⚠️ INSERTION BEFORE THE 1st EXECUTABLE LINE (after shebang/comments/'use strict').
//    Universal rule: the deadline is armed before ANY I/O, `require` or not.
//    ⚠️ The 1st version looked for "after the last leading require" and MISSED
//    `browser-recover.js` (no require: it reads process.stdin directly) —
//    6 hooks armed out of 7, caught by vendor-deadline.test.js on a COPY, never
//    in prod. An `arm()` placed in a callback protects NOTHING: the zombie waits
//    BEFORE the callback, that is the whole point.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const SRC = path.join(__dirname, 'deadline.js');
const WRITE = process.argv.includes('--write');

// ⚠️ THE FLEET ROOT COMES FROM `paths.js`, NEVER FROM A LOCAL `os.homedir()`.
//    Until 21/08/2026 this file rebuilt `~/.claude/hooks` itself, under its own
//    env var (`VENDOR_TARGET_DIR`) — a SECOND definition of a directory
//    `paths.js` already owns (`fileDocsDir()` lives beneath it). Two copies of
//    one path diverge in silence: this script WRITES into that directory, so the
//    divergence would arm the wrong fleet and nothing would say so.
// ⚠️ LAZY (resolved inside main(), never frozen in a module-level const):
//    otherwise the env var a test sets at spawn time is ignored.
// ⚠️ The override is `CTXROUTE_FLEET_HOOKS_DIR`, RESERVED FOR TESTS AND
//    doctor.js — NEVER a user setting (the user config is ctxroute-config.json).

const BANNIERE = [
  '',
  '// ⚠️ DEADLINE — NEVER remove, NEVER move it lower down.',
  '//    Claude Code (Windows) does not always close the stdin of the hook it spawns',
  '//    (Anthropic bug anthropics/claude-code#68626): without this, this process waits for an',
  "//    `end` that NEVER comes and lives FOREVER. Measured on 15/07/2026:",
  '//    875 `statusline.js` zombies, one of them 20 h old, 0.8 GB of RAM free out of 16.',
  '//    `.unref()` guarantees ZERO added latency when everything is fine.',
  '//    Gate: ctxroute/hooks-fleet-gate.test.js — copy: deadline-vendor.test.js.',
  "const deadline = require('./deadline');",
  'deadline.arm();',
  '',
].join('\n');

function isHook(src) {
  return /process\.stdin/.test(src) || /require\(['"]\.\/stdin-json['"]\)/.test(src);
}

function alreadyArmed(src) {
  return /require\(['"]\.\/deadline['"]\)/.test(src) && /\barm\s*\(/.test(src);
}

// Index of the 1st EXECUTABLE line: we skip the shebang, comments (// and /* */),
// blank lines and 'use strict' (which MUST stay at the head of its scope).
// ⚠️ Returns -1 if the file has no executable code: we DO NOT PATCH
//    blindly. An unexpected file is REPORTED to a human, never guessed.
function pointInsertion(lines) {
  let dansBloc = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (dansBloc) {
      if (l.includes('*/')) dansBloc = false;
      continue;
    }
    if (l === '') continue;
    if (i === 0 && l.startsWith('#!')) continue;
    if (l.startsWith('//')) continue;
    if (l.startsWith('/*')) {
      if (!l.includes('*/')) dansBloc = true;
      continue;
    }
    // ⚠️ 'use strict' must precede all code — we insert AFTER it, never before.
    if (/^['"]use strict['"];?$/.test(l)) continue;
    return i;
  }
  return -1;
}

function main() {
  const PARC = paths.fleetHooksDir();
  // ⚠️ NAMED REFUSAL, NEVER A FALLBACK TO A PLAUSIBLE PATH. An unreachable
  //    target is exactly where a vendoring script is tempted to "try the other
  //    likely place" — and writing `deadline.js` into the wrong root arms a
  //    fleet nobody runs while REPORTING SUCCESS. A judge that cannot find its
  //    target and lets things through is worse than no judge at all.
  // ⚠️ The message names the ADDRESS *and* WHERE IT CAME FROM: a stale test
  //    override and a home directory that moved are two different bugs, and an
  //    error that does not say which one costs a round trip to find out.
  if (!fs.existsSync(PARC)) {
    const origine = process.env.CTXROUTE_FLEET_HOOKS_DIR
      ? 'CTXROUTE_FLEET_HOOKS_DIR' : 'paths.fleetHooksDir()';
    console.error(`REFUSED — fleet root not found: ${PARC} (address from ${origine}). Nothing written.`);
    process.exit(1);
  }

  const rapport = { copie: false, armes: [], deja: [], manuels: [], ignores: 0 };

  // 1. Vendor deadline.js (byte-for-byte copy).
  const dest = path.join(PARC, 'deadline.js');
  const srcContent = fs.readFileSync(SRC, 'utf8');
  const identique = fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === srcContent;
  if (!identique) {
    if (WRITE) fs.writeFileSync(dest, srcContent);
    rapport.copie = true;
  }

  // 2. Arm each hook.
  for (const f of fs.readdirSync(PARC)) {
    if (!f.endsWith('.js') || f.endsWith('.test.js') || f === 'deadline.js') continue;
    const abs = path.join(PARC, f);
    const src = fs.readFileSync(abs, 'utf8');

    if (!isHook(src)) {
      rapport.ignores++;
      continue;
    }
    if (alreadyArmed(src)) {
      rapport.deja.push(f);
      continue;
    }

    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    const lines = src.split(/\r?\n/);
    const idx = pointInsertion(lines);
    if (idx === -1) {
      // ⚠️ NEVER a guessed patch: we report, a human decides.
      rapport.manuels.push(f);
      continue;
    }

    // ⚠️ INSERTION *BEFORE* line idx, NEVER after (`idx + 1`): a statement
    //    can span several lines (`const LOCK_RE = new RegExp(` in
    //    browser-recover.js) — inserting after its 1st line cuts it IN TWO and breaks
    //    the syntax. Experienced on 15/07/2026, caught by the `node --check` of
    //    vendor-deadline.test.js on a COPY. ⚠️ The "the process dies" test was GREEN
    //    on that broken file: a process that CRASHES also dies. Death never
    //    proves that it works — keep both tests, never one without the other.
    lines.splice(idx, 0, BANNIERE.replace(/\n/g, eol));
    if (WRITE) fs.writeFileSync(abs, lines.join(eol));
    rapport.armes.push(f);
  }

  console.log(WRITE ? '=== WRITTEN ===' : '=== DRY-RUN (--write to apply) ===');
  console.log(`target         : ${PARC}`);
  console.log(`deadline.js    : ${rapport.copie ? 'to copy' : 'already identical'}`);
  console.log(`to arm         : ${rapport.armes.length}${rapport.armes.length ? ' → ' + rapport.armes.join(', ') : ''}`);
  console.log(`already armed  : ${rapport.deja.length}${rapport.deja.length ? ' → ' + rapport.deja.join(', ') : ''}`);
  console.log(`non-hooks      : ${rapport.ignores} (do not read stdin)`);
  console.log(`⚠️ MANUAL      : ${rapport.manuels.length}${rapport.manuels.length ? ' → ' + rapport.manuels.join(', ') : ''}`);
}

main();
