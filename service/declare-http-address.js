#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// DECLARE the listening address in the configuration — ONCE, never twice.
// Usage: node service/declare-http-address.js <address>
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS EXISTS. The Windows profile leaves `127.0.0.0/8` for a dedicated
//    adapter (libuv disables SYN retransmission on any address whose first byte
//    is 127). The ADDRESS is the operator's declaration and the machine is
//    reconciled TOWARDS it — so somebody has to make that declaration, and an
//    adopter who has never heard of this defect would otherwise keep it.
//
// 🛑 IT NEVER OVERRULES A DECLARED ADDRESS. If `http.host` is already there, the
//    operator chose it; this script says so and changes nothing. The only case
//    it writes is the one where the configuration is SILENT — turning a default
//    into an explicit choice, never a choice into another choice.
//
// 🛑 IT WRITES THE OPERATOR'S ONLY COPY, so it carries the same guards as the
//    wiring generator: a timestamped backup whose path is PRINTED (a rollback
//    nobody can name does not exist), an atomic write, and a re-read that must
//    parse — a half-written configuration is worse than none.
//
// ⚠️ EXIT CODES ARE THE CONTRACT: 0 = written or already declared (both are the
//    desired state) · 2 = refused, with the reason on stderr. The installer
//    reads them and never guesses.
// 🛑 NO `process.exit` HERE (2026-10-01): it cut the refusal on a POSIX pipe — an
//    install log would show half of WHY. A refusal THROWS, the one entry point
//    prints it and leaves with 2 once stderr drained; success ends NATURALLY.

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../src/paths.js');

/**
 * Stops the script dead at the call, exactly as an exit did — NEVER wrap a call
 * in a `try` whose `catch` swallows it.
 * @param {string} message
 * @returns {never}
 */
function refuse(message) {
  throw new Error(message);
}

function main() {
  const address = process.argv[2];
  if (typeof address !== 'string' || address.trim() === '') {
    refuse('no address was given. Usage: node service/declare-http-address.js <address>');
  }

  const configPath = paths.configPath();

  let raw = null;
  try { raw = fs.readFileSync(configPath, 'utf8'); } catch { raw = null; }
  if (raw === null) {
    refuse(`the configuration was not found at ${configPath}. Create it first — this script `
      + 'declares an address INTO a configuration, it never invents one.');
  }

  let config = null;
  try { config = JSON.parse(raw); } catch {
    refuse(`${configPath} is not valid JSON. Refusing to rewrite a file this script cannot read: `
      + 'a half-understood configuration is how a whole fleet loses its injection in silence.');
  }

  const declared = config && config.http && config.http.host;
  if (typeof declared === 'string' && declared !== '') {
    // 🔑 THE DESIRED STATE IS ALREADY EXPRESSED. Saying so — instead of staying
    //    quiet — is what makes a no-op legible in an install log.
    process.stdout.write(`already declared: http.host = ${declared} (left untouched)\n`);
    return;
  }

  // ⚠️ The PORT half is deliberately NOT touched: it has its own precedence
  //    (`CTXROUTE_HTTP_PORT` wins over it) and inventing one here would be a
  //    second authority for a number that already has one.
  const next = { ...config, http: { ...(config.http || {}), host: address.trim() } };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${configPath}.before-address-${stamp}.json`;
  fs.copyFileSync(configPath, backup);
  process.stdout.write(`backup: ${backup}\n`);

  const tmp = path.join(path.dirname(configPath), `.ctxroute-address-${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, configPath);

  // 🛑 RE-READ AND RE-PARSE. "The write threw no exception" is not "the file is
  //    usable" — and this file decides where a whole fleet knocks.
  let reread = null;
  try { reread = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { reread = null; }
  if (!reread || !reread.http || reread.http.host !== address.trim()) {
    fs.copyFileSync(backup, configPath);
    refuse(`the configuration did not read back as written — the backup has been RESTORED from ${backup}.`);
  }

  process.stdout.write(`declared: http.host = ${reread.http.host} in ${configPath}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`ctxroute REFUSED: ${e && e.message}\n`);
  require('../src/stdout-exit.js').exitAfterFlush(2);
}
