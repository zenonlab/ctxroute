#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// RENDER an installed supervisor unit from the CONFIGURATION — one source.
// Usage: node service/render-units.js --socket <path> | --plist <path>
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS EXISTS (2026-09-19). Under socket activation the SUPERVISOR binds,
//    so the number of listening sockets lived in the configuration AND in the
//    unit — and the daemon REFUSES to start when the two disagree. An adopter
//    who changed `http.listeners` and not the unit got a service that never came
//    up; one who changed the unit and not the key got the same. One truth in two
//    files, on two different syntaxes.
// 🔑 THE CONFIGURATION IS THE SOURCE, THE UNIT IS DERIVED. The installer calls
//    this on the file it just installed, exactly as `tools/wiring-generate.js`
//    derives the harness wiring from the same address. Nobody hand-counts sockets
//    again, on any of the three platforms.
//
// 🛑 THE DECISION IS NOT HERE — it is `service/render-units-pure.js`, pure and
//    tested against the REAL shipped units (rendering them with the default
//    configuration must reproduce them byte for byte). This file only reads,
//    writes and refuses; a rendering proven through a shell proves nothing.
//
// 🛑 IT WRITES A FILE THE MACHINE BOOTS FROM, so it carries the same guards as
//    the wiring generator: a timestamped backup whose path is PRINTED (a rollback
//    nobody can name does not exist), an atomic write, and a re-read that must
//    come back identical — a half-written unit is worse than a stale one.
// ⚠️ NOTHING TO CHANGE IS A SUCCESS, not a no-op to hide: re-running an installer
//    must converge, and saying so out loud is how an operator knows it did.
//
// ⚠️ EXIT CODES ARE THE CONTRACT: 0 = rendered or already correct · 2 = refused,
//    with the reason on stderr. The installers read them and never guess.
// 🛑 NO `process.exit` HERE (2026-10-01): it cut the refusal on a POSIX pipe — the
//    installer log (a pipe on Linux and macOS) would show half of WHY. A refusal
//    THROWS, the one entry point prints it and leaves with 2 once stderr drained;
//    success ends NATURALLY.

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../src/paths.js');
const render = require('./render-units-pure.js');

/**
 * Stops the script dead at the call, exactly as an exit did — NEVER wrap a call
 * in a `try` whose `catch` swallows it.
 * @param {string} message
 * @returns {never}
 */
function refuse(message) {
  throw new Error(message);
}

const KINDS = { '--socket': render.renderSystemdSocket, '--plist': render.renderLaunchdPlist };

function main() {
  const kind = process.argv[2];
  const target = process.argv[3];
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind) || typeof target !== 'string' || target === '') {
    refuse('usage: node service/render-units.js --socket <path> | --plist <path>');
  }
  if (!path.isAbsolute(target)) {
    refuse(`the target must be an ABSOLUTE path; got ${JSON.stringify(target)}. `
      + 'A relative one resolves against whatever directory the installer happened to be in.');
  }

  let before;
  try {
    before = fs.readFileSync(target, 'utf8');
  } catch (err) {
    refuse(`cannot read ${target}: ${err && err.message}. `
      + 'Render the unit AFTER installing it, never before.');
  }

  // 🛑 THE ENDPOINTS COME FROM THE ONE RESOLUTION POINT, never re-derived here:
  //    `paths.httpListenEndpoints()` is what the daemon binds and what the wiring
  //    generator POSTs to. A second derivation is a second truth.
  let endpoints;
  try {
    endpoints = paths.httpListenEndpoints();
  } catch (err) {
    refuse(`the configuration does not resolve: ${err && err.message}`);
  }

  let after;
  try {
    after = KINDS[kind](before, endpoints);
  } catch (err) {
    refuse(err && err.message);
  }

  if (after === before) {
    process.stdout.write(`ctxroute: ${target} already declares the ${endpoints.length} `
      + 'socket(s) the configuration asks for — nothing to change.\n');
    return;
  }

  const backup = `${target}.ctxroute-backup-${new Date().toISOString().replace(/[:.]/g, '')}`;
  try {
    fs.copyFileSync(target, backup);
    process.stdout.write(`backup: ${backup}\n`);
  } catch (err) {
    refuse(`cannot write the backup beside ${target}: ${err && err.message}. `
      + 'Refusing to modify a unit that could not be saved first.');
  }

  const temporary = `${target}.ctxroute-tmp`;
  try {
    fs.writeFileSync(temporary, after, 'utf8');
    fs.renameSync(temporary, target);
  } catch (err) {
    try { fs.unlinkSync(temporary); } catch { /* it may never have been created */ }
    refuse(`cannot write ${target}: ${err && err.message}. The backup above is intact.`);
  }

  // ⚠️ RE-READ, never trust the write: a truncated unit and a complete one look the
  //    same to a caller that only checked for an exception.
  const reread = fs.readFileSync(target, 'utf8');
  if (reread !== after) {
    try { fs.copyFileSync(backup, target); } catch { /* the path is printed above */ }
    refuse(`${target} did not come back byte-identical after writing. `
      + `The backup was restored from ${backup}.`);
  }

  process.stdout.write(`ctxroute: ${target} now declares ${endpoints.length} listening socket(s) — `
    + `${endpoints.map((e) => `${e.host}:${e.port}`).join(', ')}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`ctxroute REFUSED: ${e && e.message}\n`);
  require('../src/stdout-exit.js').exitAfterFlush(2);
}
