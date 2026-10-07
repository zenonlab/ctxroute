#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// wrap-up-touch.js — records which files a SESSION wrote, for the `wrapUp`
// option's judges (EXPERIMENTAL). Claude Code, after each file write.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY. A judge that reads a whole repository's state blames every agent
//    working in it for every other agent's files, and never meets an agent
//    started from another folder. The harness REPORTS each write (tool and
//    path): that fact is recorded here, so at the end of a turn each judge is
//    handed the files THIS session wrote inside its perimeter.
//
// 🛑 KEYED BY THE SESSION, NEVER BY THE AGENT. A sub-agent's writes are its
//    session's work (`lib.scopeId(session_id)`, no agent id): the end-of-turn
//    judgement belongs to the session that delegated them.
// 🛑 WIRED ONLY WHEN THE OPTION IS ON (`optIn: "wrapUp"` in `wiring.json`):
//    switched off, no agent pays this process.
// ⚠️ MUTE BY CONTRACT, FAIL-OPEN: nothing on stdout, exit 0 always. A lost
//    write costs a judge one file it does not see, never a broken action.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('../lib-pure');
const paths = require('../paths');
const wrapUp = require('../wrap-up-pure');
const { WRAP_UP } = require('../harness-profile');
const { resolveStore, lockDirForKey } = require('../store-resolve');
const { readStdinJson } = require('../stdin-json');
const log = require('../log');

const STORE_PREFIX = 'touched-';
const PATH_PARAMS = WRAP_UP.claudeCode.touch.pathParams;

/**
 * The absolute paths one write designated. A relative path is resolved against
 * the payload's `cwd`, the directory the harness ran the tool in.
 * @param {*} data  the harness's PostToolUse payload
 * @returns {string[]}
 */
function writtenPaths(data) {
  const input = data && data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
  const base = typeof data.cwd === 'string' && data.cwd.length > 0 ? data.cwd : process.cwd();
  const out = [];
  for (const key of PATH_PARAMS) {
    const v = input[key];
    if (typeof v === 'string' && v.length > 0) out.push(path.resolve(base, v));
  }
  return out;
}

/**
 * Records one write. Exported for the in-process cells; the shell below only
 * reads stdin and exits.
 * @param {*} data  the harness's PostToolUse payload
 * @param {*} config  ctxroute-config.json
 * @returns {boolean} whether the record changed
 */
function record(data, config) {
  if (!lib.isFrameworkEnabled(config)) return false;
  if (!wrapUp.settingsOf(config && config.wrapUp).enabled) return false;
  const written = writtenPaths(data);
  if (written.length === 0) return false;
  const scope = lib.scopeId(data.session_id);
  const { store, withLock } = resolveStore();
  let changed = false;
  withLock(lockDirForKey(STORE_PREFIX + scope), () => {
    // 🛑 READ, NEVER GUESSED: the record already holds this session's earlier writes.
    const next = wrapUp.withTouched(store.loadState(STORE_PREFIX, scope), written);
    if (next === null) return;
    store.saveState(STORE_PREFIX, scope, next);
    changed = true;
  }, { fallback: null }); // lock unavailable = this write is not recorded (fail-open)
  return changed;
}

if (require.main === module) {
  require('../deadline').arm();
  readStdinJson(
    (data) => {
      try {
        let config = {};
        try {
          config = JSON.parse(fs.readFileSync(paths.configPath(), 'utf8'));
        } catch { /* no config = framework defaults, option off */ }
        const recorded = record(data || {}, config);
        if (log.enabled('hooks', 'hook-trace')) {
          log.write('hooks', 'hook-trace', { hook: 'wrap-up-touch', recorded, pid: process.pid });
        }
      } catch (err) {
        // 🛑 fail-open, and FINDABLE: the journal says what broke, the agent sees nothing.
        log.hookError('wrap-up-touch', err);
      }
      process.exit(0);
    },
    (err) => {
      log.hookError('wrap-up-touch', err);
      process.exit(0);
    },
  );
}

module.exports = { record, writtenPaths, STORE_PREFIX };
