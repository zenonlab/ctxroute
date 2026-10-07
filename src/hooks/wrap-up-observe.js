#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// wrap-up-observe.js — the SENSOR's landing point: records how full the
// context window is, for the `wrapUp` option (EXPERIMENTAL).
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 ANY SENSOR, ONE DOOR. Whatever tells a harness's fill (on Claude Code, the
//    mod `mods/wrap-up-sensor` listening to `session.measure`) hands THIS process
//    one JSON on stdin: `{ session_id, agent_id?, context: { tokens?, window,
//    percent? } }`. It is normalised by `wrap-up-pure.observationOf` and stored in
//    the scope's `wrap-up-` record. A new harness writes a new sensor, never a new
//    door.
//
// ⚠️ MUTE BY CONTRACT, FAIL-OPEN: nothing on stdout, exit 0 always. A sensor
//    that fails costs one observation (the option fires one turn later), never a
//    broken turn.
// ⚠️ OPTION OFF ⇒ NOTHING WRITTEN. A disabled option leaves no state behind.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const lib = require('../lib-pure');
const paths = require('../paths');
const wrapUp = require('../wrap-up-pure');
const { resolveStore, lockDirForKey } = require('../store-resolve');
const { readStdinJson } = require('../stdin-json');
const log = require('../log');

const STORE_PREFIX = 'wrap-up-';

/**
 * Records one observation. Exported for the in-process cells; the shell below
 * only reads stdin and exits.
 * @param {*} data  the sensor's JSON
 * @param {*} config  ctxroute-config.json
 * @returns {boolean} whether a record was written
 */
function record(data, config) {
  if (!lib.isFrameworkEnabled(config)) return false;
  if (!wrapUp.settingsOf(config && config.wrapUp).enabled) return false;
  const observation = wrapUp.observationOf(data && data.context);
  if (observation === null) return false;
  const scope = lib.scopeId(data.session_id, data.agent_id);
  const { store, withLock } = resolveStore();
  let written = false;
  withLock(lockDirForKey(STORE_PREFIX + scope), () => {
    // 🛑 READ, NEVER GUESSED: the record also carries the nudges spent and the
    //    settled flag, which a fresh literal would erase.
    const state = store.loadState(STORE_PREFIX, scope);
    store.saveState(STORE_PREFIX, scope, wrapUp.withObservation(state, observation));
    written = true;
  }, { fallback: null }); // lock unavailable = this observation is skipped (fail-open)
  return written;
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
        const recorded = record(data, config);
        if (log.enabled('hooks', 'hook-trace')) {
          log.write('hooks', 'hook-trace', { hook: 'wrap-up-observe', recorded, pid: process.pid });
        }
      } catch (err) {
        // 🛑 fail-open, and FINDABLE: the journal says what broke, the agent sees nothing.
        log.hookError('wrap-up-observe', err);
      }
      process.exit(0);
    },
    (err) => {
      log.hookError('wrap-up-observe', err);
      process.exit(0);
    },
  );
}

module.exports = { record, STORE_PREFIX };
