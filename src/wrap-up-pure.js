// ═══════════════════════════════════════════════════════════════════════
// wrap-up-pure.js — THE DECISION OF THE `wrapUp` OPTION (EXPERIMENTAL). PURE.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT IT IS FOR. When an agent's context window approaches its wall, the
//    knowledge it built during the session (what it learned, which docs and
//    tests are missing) is about to be summarised away. This option makes the
//    agent write that knowledge down BEFORE the wall, and it does not rely on
//    the agent's goodwill: the harness's end-of-turn event is answered with a
//    REFUSAL to stop until the adopter's JUDGES say the work is done.
//    "The model produces, a deterministic machine decides" — the judges are
//    the machine, this module only routes their verdicts.
//
// 🛑 IT NEVER BLOCKS A COMPACTION. Official Claude Code hooks doc, read
//    2026-10-04: "If compaction is blocked, Claude Code stops processing and
//    asks you what to do […] doesn't retry or auto-resume blocked compaction"
//    — a blocked compaction puts a HUMAN back in the loop. The wall is avoided
//    by acting BELOW it (a threshold under the harness's own compaction point),
//    never by holding it shut.
//
// 🔑 THE CORE READS ONE OBSERVATION, NEVER A HARNESS. How a harness learns how
//    full its window is varies (a mod event, a hook field, a file); what reaches
//    this module is always the same normalised fact: `{ tokens, window,
//    percent }`. A new harness plugs a SENSOR that produces it and a forcing
//    DIALECT that speaks its end-of-turn output — zero line here.
//
// ⚠️ ZERO I/O, ZERO HARNESS NAME (dependency-cruiser + harness-profile-gate):
//    the shells read stdin, config, state and run the judges; this module only
//    decides. It is mutated, which is the reason it exists apart.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 🛑 THE PERIMETER ENGINE IS REUSED, NEVER REWRITTEN. A judge is declared on a
//    project with the SAME words as a skill (`match` / `scope` / `exclude` /
//    `rules`, matched on the session's `cwd`), so it goes through the SAME
//    matcher: a second implementation would drift from the language at the
//    first operator added (class ㊴, paid twice here).
const { matchingSkills, skillNameFromDoc } = require('./sources/skill');

/** Version of the JSON a judge receives on stdin. A judge written today must
 *  still be readable by its author in two years: the shape changes only with
 *  this number. 2 = 1 plus `touched` (see `judgeInput`). */
const JUDGE_CONTRACT_VERSION = 2;

/**
 * The ceiling of a judge's run, in seconds. It is BELOW the bound the wiring
 * declares on the end-of-turn hook (`wiring.json`, 600 s): a judge cut by the
 * harness would be indistinguishable from a judge that crashed, and the
 * agent would never be told why. A cell confronts the two numbers.
 */
const MAX_JUDGE_TIMEOUT_SECONDS = 540;

/** Defaults of the option. The option itself is OFF unless `enabled: true`. */
const DEFAULTS = Object.freeze({ atPercent: 70, maxNudges: 3, judgeTimeoutSeconds: 120 });

// ⚠️ THE DEFAULT MESSAGE IS ENGLISH (the whole repository is) and REPLACEABLE
//    by the adopter, in any language. Its last sentence is load-bearing: an
//    agent writing under pressure INVENTS facts (measured on this fleet,
//    2026-09-13: three docs, three green gates, six invented facts), so it is
//    told to check every claim against the code before writing it.
// ⚠️ A FUNCTION, NEVER A MODULE-LEVEL CONSTANT: a literal evaluated at import
//    belongs to no test, so Stryker marks its mutants static and never tries
//    them (measured here: 2 false survivors on this very text).
function defaultMessage() {
  return [
    'Your context window is {percent}% full: it will be compacted soon, and what you learned in this session will be summarised away.',
    'Before stopping, write that knowledge down where the next context will find it:',
    '- the injectable docs of every file you created or changed (an invariant, a trap, a contract),',
    '- every skill that covers what you changed (the project\'s and its components\'), when it moves their structure, contracts or rules,',
    '- the memory of what you did, decided and left open,',
    '- the regression tests for every behaviour you built or fixed.',
    'Check every claim against the code before you write it: a wrong doc is re-injected for months.',
  ].join('\n');
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
// 🛑 A JUDGE IS AN ARGUMENT VECTOR, NEVER A COMMAND LINE: a line needs a shell to be
//    split, and the system shell differs per machine (`cmd` on Windows, `/bin/sh`
//    elsewhere) — the same judge would behave differently on the three OSes, which
//    `layers.json` forbids for every layer. `[program, ...args]` runs identically.
const isArgv = (v) => Array.isArray(v) && v.length > 0 && v.every((a) => typeof a === 'string' && a.length > 0);

/**
 * Normalises the option's configuration. TOTAL: never throws.
 *
 * 🛑 A MALFORMED VALUE SWITCHES THE OPTION OFF AND IS NAMED — it never falls
 *    back to a guessed default. A threshold typed `"70"` that silently became
 *    70 would hide the typo; one that silently became the default would hide
 *    it too. The schema refuses it upstream (config-gate); this is the runtime
 *    wall for a config nobody validated.
 *
 * @param {*} raw  the `wrapUp` key of ctxroute-config.json
 * @returns {{enabled: boolean, atPercent: number, maxNudges: number, judgeTimeoutSeconds: number, message: (string|null), messageFile: (string|null), judges: Object<string, object>, problems: string[]}}
 */
function settingsOf(raw) {
  const off = (problems) => ({
    enabled: false,
    atPercent: DEFAULTS.atPercent,
    maxNudges: DEFAULTS.maxNudges,
    judgeTimeoutSeconds: DEFAULTS.judgeTimeoutSeconds,
    message: null,
    messageFile: null,
    judges: {},
    problems,
  });
  if (raw === undefined || raw === null) return off([]);
  if (!isPlainObject(raw)) return off(['`wrapUp` must be an object']);
  const problems = [];
  const pick = (key, ok, fallback, rule) => {
    if (raw[key] === undefined) return fallback;
    if (ok(raw[key])) return raw[key];
    problems.push(`\`wrapUp.${key}\` ${rule}, got ${JSON.stringify(raw[key])}`);
    return fallback;
  };
  const enabled = pick('enabled', (v) => typeof v === 'boolean', false, 'must be true or false');
  const atPercent = pick('atPercent', (v) => isInt(v, 1, 99), DEFAULTS.atPercent, 'must be an integer from 1 to 99');
  const maxNudges = pick('maxNudges', (v) => isInt(v, 1, 20), DEFAULTS.maxNudges, 'must be an integer from 1 to 20');
  const judgeTimeoutSeconds = pick(
    'judgeTimeoutSeconds',
    (v) => isInt(v, 1, MAX_JUDGE_TIMEOUT_SECONDS),
    DEFAULTS.judgeTimeoutSeconds,
    `must be an integer from 1 to ${MAX_JUDGE_TIMEOUT_SECONDS}`,
  );
  const message = pick('message', (v) => typeof v === 'string' && v.trim().length > 0, null, 'must be a non-empty string');
  const messageFile = pick('messageFile', (v) => typeof v === 'string' && v.length > 0, null, 'must be a non-empty path');
  if (message !== null && messageFile !== null) problems.push('`wrapUp.message` and `wrapUp.messageFile` are exclusive: one message, one source');
  const judges = pick('judges', isPlainObject, {}, 'must be an object of named judges');
  for (const name of Object.keys(judges)) {
    const j = judges[name];
    if (!isPlainObject(j) || !isArgv(j.command)) {
      problems.push(`judge \`${name}\` needs a \`command\`: a non-empty list of non-empty strings, the program then its arguments`);
    }
  }
  if (problems.length > 0) return off(problems);
  return { enabled, atPercent, maxNudges, judgeTimeoutSeconds, message, messageFile, judges, problems };
}

/**
 * The normalised observation every sensor must produce. TOTAL: `null` when the
 * input does not carry a usable fill.
 *
 * ⚠️ `percent` wins when the sensor gives it (the harness computed it against
 *    ITS window, which may be a compaction window smaller than the model's);
 *    otherwise it is derived from `tokens / window`.
 *
 * @param {*} raw
 * @returns {{tokens: (number|null), window: number, percent: number}|null}
 */
function observationOf(raw) {
  if (!isPlainObject(raw)) return null;
  const window = raw.window;
  if (!Number.isFinite(window) || window <= 0) return null;
  const tokens = Number.isFinite(raw.tokens) && raw.tokens >= 0 ? raw.tokens : null;
  if (Number.isFinite(raw.percent) && raw.percent >= 0) return { tokens, window, percent: Math.floor(raw.percent) };
  if (tokens === null) return null;
  return { tokens, window, percent: Math.floor((tokens * 100) / window) };
}

/**
 * The state of one scope after a new observation. PROPAGATES the entry (never
 * rebuilds it: a field added tomorrow must survive, rule
 * `no-rebuilt-state-entry`).
 *
 * @param {*} state
 * @param {{tokens: (number|null), window: number, percent: number}} observation
 */
function withObservation(state, observation) {
  return { ...(isPlainObject(state) ? state : {}), observation };
}

/**
 * Must the judges run at this end of turn? Decided BEFORE spawning anything,
 * so a session below its threshold pays no process at all.
 *
 * @param {ReturnType<typeof settingsOf>} settings
 * @param {*} state
 * @returns {boolean}
 */
function isDue(settings, state) {
  if (!settings.enabled) return false;
  const s = isPlainObject(state) ? state : {};
  if (s.settled === true) return false;
  const o = observationOf(s.observation);
  return o !== null && o.percent >= settings.atPercent;
}

/**
 * Turns one context may pass, option on, with NO observation before the human
 * is told. The sensor reports after each turn, so by the end of the third turn
 * two measures are owed: none means the sensor is not there or no longer fires.
 */
const SILENT_SENSOR_TURNS = 3;

/**
 * 🛑 THE OPTION MUST NEVER DIE IN SILENCE. The sensor belongs to the harness
 * (a mod, an event its vendor may rename or remove): when it stops, `isDue`
 * stays false for ever and nothing else would say so. TRUE once per context,
 * when the option is on, enough turns passed, and no observation ever arrived.
 *
 * @param {{ enabled: boolean }} settings
 * @param {*} state  the scope's `wrap-up-` record (absent when nothing was observed)
 * @param {*} turns  the scope's turn counter for this context
 * @returns {boolean}
 */
function sensorSilent(settings, state, turns) {
  if (!settings.enabled) return false;
  const s = isPlainObject(state) ? state : {};
  if (s.sensorSilenceSaid === true) return false;
  if (observationOf(s.observation) !== null) return false;
  return Number.isInteger(turns) && turns >= SILENT_SENSOR_TURNS;
}

/** What the human reads when `sensorSilent` holds. Names no harness: the doctor does. */
function sensorSilenceNotice(turns) {
  return `ctxroute wrapUp: the option is on, but no context measure has arrived in ${turns} turns, so it cannot fire. `
    + 'Its sensor is missing or no longer reports: `node tools/doctor.js --harness <payload.json>` names the sensor this harness needs.';
}

/**
 * Files one session may record before its list is declared incomplete. A real
 * session writes tens of files; a runaway one (a generator, a bulk rename) must
 * not grow a record without end. Past it the list stops growing and says so
 * (`complete: false`): a judge then widens its scope, it never trusts a cut list.
 */
const MAX_TOUCHED = 1000;

/**
 * The files a SESSION wrote, as recorded by the harness's file-writing tools.
 * TOTAL: `null` when there is no usable record.
 *
 * 🔑 WHY IT EXISTS: a judge that reads the state of a whole repository blames
 *    every agent working in it for every other agent's files, and an agent
 *    started from another folder is not seen at all. What THIS session wrote is
 *    a FACT the harness reports on every write, so it is recorded instead of
 *    guessed.
 * ⚠️ `complete` is true ONLY when the record says so: a record without the flag
 *    is read as incomplete, so a judge widens instead of trusting it.
 *
 * @param {*} raw  the session's `touched-` record
 * @returns {{files: string[], complete: boolean}|null}
 */
function touchedOf(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.files)) return null;
  const files = raw.files.filter((f) => typeof f === 'string' && f.length > 0);
  return { files, complete: raw.complete === true };
}

/**
 * The session's record after a write, or `null` when nothing changes (a file
 * written twice costs no second disk write). PROPAGATES the record (rule
 * `no-rebuilt-state-entry`).
 *
 * @param {*} state  the session's `touched-` record (`{}` when absent)
 * @param {*} written  the paths the write designated
 * @returns {object|null}
 */
function withTouched(state, written) {
  const s = isPlainObject(state) ? state : {};
  const known = touchedOf(s);
  // A fresh session starts complete: nothing was written yet, and that is a fact.
  // `touchedOf` already returns a NEW array (its filter), so the stored record is never mutated.
  const files = known === null ? [] : known.files;
  let complete = known === null ? true : known.complete;
  const seen = new Set(files);
  let changed = false;
  for (const p of Array.isArray(written) ? written : []) {
    if (typeof p !== 'string' || p.length === 0 || seen.has(p)) continue;
    if (files.length >= MAX_TOUCHED) {
      changed = changed || complete;
      complete = false;
      continue;
    }
    seen.add(p);
    files.push(p);
    changed = true;
  }
  return changed ? { ...s, files, complete } : null;
}

/**
 * The judges whose perimeter covers this session, in declaration order, each
 * with the files of ITS perimeter that this session wrote.
 *
 * 🔑 THE PERIMETER IS READ ON THE CWD **AND** ON EVERY FILE WRITTEN. A session
 *    started in one folder that works in a project must still meet that
 *    project's judge: each written file is matched as the injection would match
 *    an edit of it (same matcher, same words), so "this judge covers this file"
 *    means exactly "this project's knowledge would have reached that edit".
 *
 * @param {Object<string, *>} judges
 * @param {string} cwd
 * @param {string} eventName  the end-of-turn event's own name, handed by the
 *   shell (the core never spells a harness name)
 * @param {*} [touched]  the session's `touched-` record, or nothing when this
 *   harness records no writes
 * @param {string} [pathKey]  the parameter name the harness's file tools carry a
 *   path in, handed by the shell for the same reason as `eventName`
 * @returns {{name: string, command: string[], touched: ({files: string[], complete: boolean}|null)}[]}
 */
function judgesFor(judges, cwd, eventName, touched, pathKey) {
  const t = typeof pathKey === 'string' && pathKey.length > 0 ? touchedOf(touched) : null;
  const hitsOf = (toolInput) => {
    const names = new Set();
    for (const m of matchingSkills({ skills: judges }, { toolName: eventName, toolInput, cwd })) names.add(skillNameFromDoc(m.doc));
    return names;
  };
  const byCwd = hitsOf({});
  /** @type {Map<string, string[]>} */
  const filesOf = new Map();
  if (t !== null) {
    for (const file of t.files) {
      // ⚠️ NESTED, DECLARED (quadratic-budget.json): files × judges, both bounded —
      //    MAX_TOUCHED files, and the handful of judges an adopter declares.
      for (const name of hitsOf({ [pathKey]: file })) {
        // Appended in place: a copy per file would make this loop quadratic in files.
        const list = filesOf.get(name);
        if (list) list.push(file);
        else filesOf.set(name, [file]);
      }
    }
  }
  const out = [];
  for (const name of Object.keys(judges)) {
    const files = filesOf.get(name) || [];
    if (!byCwd.has(name) && files.length === 0) continue;
    out.push({ name, command: judges[name].command, touched: t === null ? null : { files, complete: t.complete } });
  }
  return out;
}

/**
 * The JSON a judge receives on stdin — the PUBLIC contract, versioned.
 *
 * Version 2 (2026-10-04) = version 1 plus `touched`: the files this session
 * wrote inside the judge's perimeter (`{ files, complete }`), or `null` when
 * the harness records no writes. Every version-1 field is unchanged.
 *
 * @param {{sessionId: string, cwd: string, observation: object, atPercent: number, nudges: number, touched?: *}} facts
 */
function judgeInput(facts) {
  return {
    version: JUDGE_CONTRACT_VERSION,
    sessionId: facts.sessionId,
    cwd: facts.cwd,
    context: observationOf(facts.observation),
    atPercent: facts.atPercent,
    nudges: facts.nudges,
    touched: touchedOf(facts.touched),
  };
}

/**
 * One judge's run, read as a verdict. TOTAL.
 *
 * - could not start, or overran its bound ⇒ `broken` (it proved nothing,
 *   either way: never counted as a pass, never as a fail);
 * - exit 0 ⇒ `pass`;
 * - any other exit ⇒ `fail`, its text = the findings of a structured JSON
 *   output (`{ ok: false, findings: [{ file, message, severity }] }`) when it
 *   gave one, its raw output otherwise.
 *
 * @param {{name: string, exitCode: (number|null), stdout: string, stderr: string, timedOut: boolean, spawnError: (string|null)}} run
 * @returns {{name: string, status: ('pass'|'fail'|'broken'), text: string}}
 */
function verdictOf(run) {
  const name = run.name;
  if (run.spawnError) return { name, status: 'broken', text: `could not start: ${run.spawnError}` };
  if (run.timedOut) return { name, status: 'broken', text: 'overran its time bound and was stopped' };
  if (run.exitCode === 0) return { name, status: 'pass', text: '' };
  const out = String(run.stdout || '').trim();
  const structured = findingsText(out);
  const text = structured !== null ? structured : out.length > 0 ? out : String(run.stderr || '').trim();
  return { name, status: 'fail', text: text.length > 0 ? text : `exited with code ${run.exitCode}` };
}

/** Structured findings ⇒ one line each; anything else ⇒ null. */
function findingsText(out) {
  // ⚠️ AN EMPTY `catch`, ON PURPOSE: text that is not JSON simply leaves `parsed`
  //    null and falls into the shape check below. A `return null` here was an
  //    EQUIVALENT mutant by construction (removing it reached the same `null`).
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch { /* not JSON: read as raw text */ }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.findings)) return null;
  const lines = [];
  for (const f of parsed.findings) {
    if (isPlainObject(f)) lines.push(`- ${f.severity ? `[${f.severity}] ` : ''}${f.file ? `${f.file}: ` : ''}${f.message || ''}`);
  }
  return lines.join('\n');
}

/**
 * THE DECISION at an end of turn whose judges have run.
 *
 * 🛑 THE BOUND IS THE ANTI-LOOP. The harness doc itself warns that blocking the
 *    end of a turn "can create an infinite loop if your condition never
 *    becomes true": after `maxNudges` refusals the session is RELEASED, loudly,
 *    and the option stays quiet until the next context.
 * 🛑 A BROKEN JUDGE NEVER HOLDS A SESSION. It is named to the human and the
 *    turn ends: a judge that cannot answer has no authority to refuse.
 * ⚠️ NO JUDGE DECLARED for this project ⇒ ONE nudge (the message alone), then
 *    settled: without a judge nothing can prove the work done, so insisting
 *    would be a loop with no exit condition.
 *
 * @param {ReturnType<typeof settingsOf>} settings
 * @param {*} state
 * @param {{name: string, status: string, text: string}[]} verdicts
 * @returns {{action: string, nextState: object, failing: object[], broken: object[], notice: (string|null)}}  action is 'allow' or 'block'
 */
function decide(settings, state, verdicts) {
  /** @type {any} */
  const s = isPlainObject(state) ? state : {};
  // The testable form (lib-pure doctrine): `x > 0 ? x : 0` has an equivalent
  // `>=` mutant at zero, `Math.max` has none.
  const nudges = Number.isInteger(s.nudges) ? Math.max(0, s.nudges) : 0;
  const failing = verdicts.filter((v) => v.status === 'fail');
  const broken = verdicts.filter((v) => v.status === 'broken');
  const settle = (notice) => ({ action: 'allow', nextState: { ...s, settled: true }, failing, broken, notice });
  if (nudges >= settings.maxNudges) {
    return settle(`ctxroute wrapUp: released after ${nudges} nudge(s) without a passing verdict${failing.length ? ` (still failing: ${failing.map((v) => v.name).join(', ')})` : ''}.`);
  }
  if (verdicts.length === 0) {
    if (nudges > 0) return settle(null);
    return { action: 'block', nextState: { ...s, nudges: 1 }, failing, broken, notice: null };
  }
  if (failing.length > 0) return { action: 'block', nextState: { ...s, nudges: nudges + 1 }, failing, broken, notice: null };
  if (broken.length > 0) return settle(`ctxroute wrapUp: judge(s) could not answer, session not held: ${broken.map((v) => `${v.name} (${v.text})`).join('; ')}.`);
  return settle(null);
}

/**
 * The text handed back to the agent with a refusal.
 *
 * ⚠️ BOUNDED BY THE SHELL'S BUDGET, AND THE SURPLUS IS NEVER THROWN AWAY: when
 *    the full text does not fit, the reason carries its head and NAMES the
 *    file the shell wrote the whole report to (`overflow` = that full text).
 *
 * @param {string} message  the template, `{percent}` substituted
 * @param {number} percent
 * @param {{name: string, text: string}[]} failing
 * @param {{name: string, text: string}[]} broken
 * @param {number} budget   characters the harness reliably puts in context
 * @param {string} reportPath where the shell will write the full text if needed
 * @returns {{reason: string, overflow: (string|null)}}
 */
function reasonOf(message, percent, failing, broken, budget, reportPath) {
  const parts = [String(message).split('{percent}').join(String(percent))];
  for (const v of failing) parts.push(`\n## Judge \`${v.name}\` says the work is not done\n${v.text}`);
  for (const v of broken) parts.push(`\n## Judge \`${v.name}\` could not answer\n${v.text}`);
  const full = parts.join('\n');
  if (full.length <= budget) return { reason: full, overflow: null };
  const tail = `\n\n[The full report (${full.length} characters) is in ${reportPath} — read it before going on.]`;
  const head = full.slice(0, Math.max(0, budget - tail.length));
  return { reason: head + tail, overflow: full };
}

/** How many overflow reports are kept on disk (one per scope, overwritten). */
const MAX_REPORTS = 64;

/**
 * THE EVICTION OF OVERFLOW REPORTS, decided here and proven by what it deletes.
 * One report per scope, rewritten in place; a fleet running for years creates
 * one scope per session, so without a ceiling the folder grows for ever.
 * Keeps the `max` most recent, returns the NAMES of the others (coldest first).
 *
 * @param {{name: string, mtimeMs: number}[]} entries
 * @param {number} max
 * @returns {string[]}
 */
function reportsToEvict(entries, max) {
  // Ties broken by name with `localeCompare`: a `<` ternary has an equivalent
  // `<=` mutant (two files never share a name), `localeCompare` has none.
  const sorted = entries.slice().sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  return sorted.slice(max).map((e) => e.name).reverse();
}

module.exports = {
  SILENT_SENSOR_TURNS,
  sensorSilent,
  sensorSilenceNotice,
  MAX_REPORTS,
  reportsToEvict,
  JUDGE_CONTRACT_VERSION,
  MAX_JUDGE_TIMEOUT_SECONDS,
  DEFAULTS,
  defaultMessage,
  settingsOf,
  observationOf,
  withObservation,
  isDue,
  MAX_TOUCHED,
  touchedOf,
  withTouched,
  judgesFor,
  judgeInput,
  verdictOf,
  decide,
  reasonOf,
};
