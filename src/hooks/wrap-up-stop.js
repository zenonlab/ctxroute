#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// wrap-up-stop.js — END OF TURN: refuses to let the agent stop while the
// adopter's judges say its session knowledge is not written down yet.
// Option `wrapUp` (EXPERIMENTAL), Claude Code forcing dialect.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE CHAIN. A sensor recorded how full the context is (`wrap-up-observe.js`).
//    At each end of turn this shell asks the pure core whether the option is DUE
//    (threshold crossed, context not settled); if so it runs the judges whose
//    perimeter covers the session, hands the verdicts back to the core, records
//    the new state and SPEAKS the decision in the harness's dialect
//    (`harness-profile.WRAP_UP`): a refusal carries the reason the model reads.
//
// 🛑 WIRED ONLY WHEN THE OPTION IS ON. `wiring.json` declares this consumer with
//    `optIn: "wrapUp"`: switched off, the generated wiring is byte-identical to a
//    manifest that never knew it — the agents in production pay nothing.
// 🛑 FAIL-OPEN, ALWAYS: any failure here ends the turn normally. A guardrail that
//    can trap a session is worse than no guardrail.
// ⚠️ THE DEADLINE IS ARMED LONG, AND DECLARED: the judges may legitimately run up
//    to `MAX_JUDGE_TIMEOUT_SECONDS`, so the anti-zombie bound is that ceiling plus
//    a margin — still below the 600 s the wiring declares on this hook, so the
//    harness never cuts a judge we were still waiting for.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('../lib-pure');
const paths = require('../paths');
const wrapUp = require('../wrap-up-pure');
const { WRAP_UP, HOOK_OUTPUT_BUDGET } = require('../harness-profile');
const { resolveStore, lockDirForKey } = require('../store-resolve');
const { runJudge } = require('../judge-runner');
const { readStdinJson } = require('../stdin-json');
const { printThenExit } = require('../stdout-exit');
const log = require('../log');
const { STORE_PREFIX } = require('./wrap-up-observe');
const { STORE_PREFIX: TOUCH_PREFIX } = require('./wrap-up-touch');
// READ only, never written here: the turn counter owned by `turn-count.js`, the same
// record `pretool-core` reads for the `turn` drift.
const TURN_PREFIX = 'turn-count-';

/** The anti-zombie bound of this shell: the judges' ceiling plus 30 s. */
const DEADLINE_MS = (wrapUp.MAX_JUDGE_TIMEOUT_SECONDS + 30) * 1000;

const DIALECT = WRAP_UP.claudeCode.forcing;

/** The message template: inline, a file next to the config, or the default. */
function messageOf(settings, configPath) {
  if (settings.message !== null) return { text: settings.message, problem: null };
  if (settings.messageFile !== null) {
    const file = path.resolve(path.dirname(configPath), settings.messageFile);
    try {
      return { text: fs.readFileSync(file, 'utf8'), problem: null };
    } catch {
      return { text: wrapUp.defaultMessage(), problem: `ctxroute wrapUp: message file unreadable (${file}), the default message was used.` };
    }
  }
  return { text: wrapUp.defaultMessage(), problem: null };
}

/** Writes the full report when the reason overflows, and keeps the folder bounded. */
function writeReport(reportPath, text) {
  const dir = path.dirname(reportPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reportPath, text);
  // One traversal per statement: the folder holds at most MAX_REPORTS + 1 files.
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.md')) entries.push({ name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs });
  }
  for (const name of wrapUp.reportsToEvict(entries, wrapUp.MAX_REPORTS)) {
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* already gone */ }
  }
}

/** The JSON this harness reads at an end of turn, from the core's decision. */
function output(decision, reason, notices, showNotices) {
  const out = {};
  if (decision === 'block') {
    out[DIALECT.decisionField] = DIALECT.blockValue;
    out[DIALECT.reasonField] = reason;
  }
  const said = notices.filter(Boolean);
  if (showNotices && said.length > 0) out[DIALECT.noticeField] = said.join('\n');
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 🛑 A SENSOR THAT STOPPED REPORTING IS SAID, ONCE PER CONTEXT — never left silent.
 * The turn counter is read from the EXISTING `turn-count-` record (the gate's own
 * source, `pretool-core`), and the flag lives in the `wrap-up-` record, purged
 * at compaction like the rest: no new store. A NOTICE, never a refusal.
 */
function saySilentSensor(settings, before, scope, config, store, withLock) {
  if (!lib.shouldShowNotification(config)) return null;
  const turns = store.loadState(TURN_PREFIX, scope).turns;
  if (!wrapUp.sensorSilent(settings, before, turns)) return null;
  let said = false;
  withLock(lockDirForKey(STORE_PREFIX + scope), () => {
    const state = store.loadState(STORE_PREFIX, scope);
    if (!wrapUp.sensorSilent(settings, state, turns)) return;
    store.saveState(STORE_PREFIX, scope, { ...state, sensorSilenceSaid: true });
    said = true;
  }, { fallback: null }); // lock unavailable = said at a later end of turn (fail-open)
  return said ? output('allow', '', [wrapUp.sensorSilenceNotice(turns)], true) : null;
}

/**
 * One end of turn. Exported for the in-process cells.
 * @param {*} data   the harness's Stop payload
 * @param {*} config ctxroute-config.json
 * @param {string} configPath
 * @returns {Promise<object|null>} the JSON to print, or null for silence
 */
async function handle(data, config, configPath) {
  if (!lib.isFrameworkEnabled(config)) return null;
  const settings = wrapUp.settingsOf(config && config.wrapUp);
  if (!settings.enabled) return null;
  const scope = lib.scopeId(data.session_id, data.agent_id);
  const key = STORE_PREFIX + scope;
  const { store, withLock } = resolveStore();
  // A READ needs no lock (the store writes atomically); the decision below
  // re-reads under the lock before writing.
  const before = store.loadState(STORE_PREFIX, scope);
  if (!wrapUp.isDue(settings, before)) return saySilentSensor(settings, before, scope, config, store, withLock);

  const cwd = typeof data.cwd === 'string' && data.cwd.length > 0 ? data.cwd : process.cwd();
  // 🔑 WHAT THIS SESSION WROTE, keyed by the SESSION (its sub-agents' writes are its
  //    work). This harness records every file write while the option is on, so NO
  //    record means "nothing written yet" — an empty, complete list, never "unknown".
  const record = store.loadState(TOUCH_PREFIX, lib.scopeId(data.session_id));
  const touched = wrapUp.touchedOf(record) || { files: [], complete: true };
  const judges = wrapUp.judgesFor(
    settings.judges, cwd, String(data.hook_event_name || ''), touched, WRAP_UP.claudeCode.touch.pathParams[0],
  );
  const observation = wrapUp.observationOf(before.observation);
  const nudges = Number.isInteger(before.nudges) ? before.nudges : 0;
  // One input PER judge: each is handed the written files of ITS perimeter only.
  const runs = await Promise.all(judges.map((j) => runJudge(
    j,
    wrapUp.judgeInput({ sessionId: scope, cwd, observation, atPercent: settings.atPercent, nudges, touched: j.touched }),
    { cwd, timeoutMs: settings.judgeTimeoutSeconds * 1000 },
  )));
  const verdicts = runs.map(wrapUp.verdictOf);

  let decision = null;
  withLock(lockDirForKey(key), () => {
    const state = store.loadState(STORE_PREFIX, scope);
    // 🛑 RE-CHECKED UNDER THE LOCK: a compaction may have purged the record while
    //    the judges ran — a new context starts fresh and owes nothing yet.
    if (!wrapUp.isDue(settings, state)) return;
    decision = wrapUp.decide(settings, state, verdicts);
    store.saveState(STORE_PREFIX, scope, decision.nextState);
  }, { fallback: null }); // lock unavailable = this end of turn is not judged (fail-open)
  if (decision === null) return null;

  const show = lib.shouldShowNotification(config);
  if (decision.action !== 'block') return output('allow', '', [decision.notice], show);

  const msg = messageOf(settings, configPath);
  const reportPath = path.join(paths.stateDir(), 'wrap-up-reports', `${lib.sanitizeSessionId(scope)}.md`);
  const { reason, overflow } = wrapUp.reasonOf(
    msg.text, observation.percent, decision.failing, decision.broken, HOOK_OUTPUT_BUDGET.claudeCode, reportPath,
  );
  if (overflow !== null) writeReport(reportPath, overflow);
  const spent = decision.nextState.nudges;
  return output('block', reason, [
    msg.problem,
    `ctxroute wrapUp: context ${observation.percent}% full, the agent is asked to write its session knowledge down (nudge ${spent}/${settings.maxNudges}).`,
  ], show);
}

if (require.main === module) {
  require('../deadline').arm({ ms: DEADLINE_MS });
  readStdinJson(
    (data) => {
      let configPath = '';
      let config = {};
      try {
        configPath = paths.configPath();
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch { /* no config = option off */ }
      handle(data || {}, config, configPath)
        .then((out) => {
          if (log.enabled('hooks', 'hook-trace')) {
            log.write('hooks', 'hook-trace', {
              hook: 'wrap-up-stop',
              decision: out === null ? 'silent' : (/** @type {any} */ (out).decision || 'notice'),
              pid: process.pid,
            });
          }
          return out === null ? process.exit(0) : printThenExit(JSON.stringify(out));
        })
        .catch((err) => {
          // 🛑 fail-open, and FINDABLE: the journal says what broke, the turn still ends.
          log.hookError('wrap-up-stop', err);
          process.exit(0);
        });
    },
    (err) => {
      log.hookError('wrap-up-stop', err);
      process.exit(0);
    },
  );
}

module.exports = { handle, output, DEADLINE_MS };
