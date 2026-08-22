// ═══════════════════════════════════════════════════════════════════════
// wiring-plan.js — ONE MANIFEST, N DECLARATIONS (pure, no I/O)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE DEFECT THIS EXISTS TO MAKE UNBUILDABLE, MEASURED IN PRODUCTION ON
//    2026-08-22. The harness wiring declared the framework NINETEEN times by
//    hand: sixteen gate frames plus the session gate, the turn counter and the
//    PreCompact reset. The lane argument was written on the sixteen and
//    forgotten on the three. The gate then recorded its deliveries in the
//    daemon's RAM while its peers read and erased the state FILES — TWO
//    MEMORIES — so after a compaction skills and `once` documents never came
//    back, with no error, no badge and nothing red.
//
// 🛑 THE CLASS IS STRUCTURAL, NOT HUMAN: one truth (the lane, the frame count)
//    held in nineteen hand-edited copies. Detecting the divergence afterwards
//    does not scale — every new consumer, harness or machine widens the
//    surface linearly. Here the copies are GENERATED, so the lane cannot be
//    written on one consumer and forgotten on another: it is applied to the
//    DERIVED set of state consumers in one pass, or to none of them.
//
// ⚠️ THIS MODULE IS PURE ON PURPOSE — no `fs`, no `process`, no clock. Every
//    machine fact (where the repo lives, how many frames the config asks for,
//    which shells consume the shared state, how the lane flag is spelled)
//    arrives as an ARGUMENT, measured by the shell. That is what lets the gate
//    replay a plan against a fixture, and what makes the module mutable.
//
// 🛑 EVERY REFUSAL HERE IS NAMED AND THROWS. A generator that quietly drops a
//    malformed consumer would produce a wiring MISSING a hook, which is the
//    exact failure mode — a silent absence — the framework refuses outright.

'use strict';

/** Placeholder substituted with the settings file the wiring is generated for. */
const SETTINGS_PLACEHOLDER = '{settings}';

/** Events a declaration may be attached to. A typo must not invent an event. */
const KNOWN_EVENTS = Object.freeze([
  'SessionStart', 'PreToolUse', 'PostToolUse',
  'UserPromptSubmit', 'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop',
]);

/** The two lanes. `client` = one authority (the daemon); `files` = the disk. */
const KNOWN_LANES = Object.freeze(['client', 'files']);

function fail(message) {
  throw new Error(`wiring manifest: ${message}`);
}

// A module path is written REPO-RELATIVE, in POSIX form. This repository is
// public and treats itself as already public: an absolute path in a tracked
// file would publish the operator's home. The absolute root is a MACHINE fact,
// passed in by the shell, never written down.
function checkModule(spec) {
  const m = spec.module;
  if (typeof m !== 'string' || m.length === 0) fail('a consumer has no `module`');
  if (/\\/.test(m)) fail(`\`${m}\`: module paths are POSIX (\`/\`), never backslashes`);
  if (/^([A-Za-z]:|\/|~)/.test(m)) fail(`\`${m}\`: module paths are REPO-RELATIVE, never absolute — an absolute path in a tracked file publishes the operator's home`);
  if (/(^|\/)\.\.(\/|$)/.test(m)) fail(`\`${m}\`: a module path never climbs out of the repository`);
}

/**
 * Builds the ordered declaration list the harness must execute.
 *
 * @param {any} manifest - the parsed `wiring.json`.
 * @param {{root: string, frames: number, laneFlag: string, stateConsumers: string[], settingsPath: string}} machine
 *   - `root`: absolute repo root, POSIX-separated, no trailing slash.
 *   - `frames`: the bandwidth of one action (`frames` in ctxroute-config.json).
 *   - `laneFlag`: the lane ARGUMENT, read from `src/client-core.js` — never re-spelled here.
 *   - `stateConsumers`: basenames of the shells that consume the shared injection
 *      state, DERIVED from the source, never a list typed by hand.
 *   - `settingsPath`: what `{settings}` expands to.
 * @returns {{event: string, matcher: (string|null), type: string, command: string, timeout: (number|undefined)}[]}
 */
function plan(manifest, machine) {
  if (!manifest || typeof manifest !== 'object') fail('unreadable manifest');
  const { root, frames, laneFlag, stateConsumers, settingsPath } = machine || {};

  if (typeof root !== 'string' || root.length === 0) fail('no repository root supplied');
  if (!Number.isInteger(frames) || frames < 1) fail(`\`frames\` must be an integer >= 1, got ${JSON.stringify(frames)}`);
  if (typeof laneFlag !== 'string' || laneFlag.length === 0) fail('the lane flag could not be read from src/client-core.js');
  if (!Array.isArray(stateConsumers)) fail('the state-consumer set was not derived');
  if (typeof settingsPath !== 'string' || settingsPath.length === 0) fail('no settings path supplied');

  if (!KNOWN_LANES.includes(manifest.stateLane)) {
    fail(`\`stateLane\` must be one of ${KNOWN_LANES.join(' | ')}, got ${JSON.stringify(manifest.stateLane)}`);
  }
  const consumers = manifest.consumers;
  // 🛑 ANTI-VACUITY AT THE SOURCE: an empty manifest would generate an EMPTY
  //    wiring, and an empty wiring compares equal to a settings.json in which
  //    the framework was never wired at all. Both look like agreement.
  if (!Array.isArray(consumers) || consumers.length === 0) fail('`consumers` is empty — an empty manifest generates an empty wiring, which agrees with a settings.json where the framework is absent');

  const onClientLane = manifest.stateLane === 'client';
  const out = [];
  const seen = new Set();

  for (const spec of consumers) {
    if (!spec || typeof spec !== 'object') fail('a consumer is not an object');
    checkModule(spec);
    if (seen.has(spec.module)) fail(`\`${spec.module}\` is declared twice — a duplicate declaration means the hook runs twice per event`);
    seen.add(spec.module);

    if (!KNOWN_EVENTS.includes(spec.event)) fail(`\`${spec.module}\`: unknown event ${JSON.stringify(spec.event)}`);
    const matcher = spec.matcher === undefined ? null : spec.matcher;
    if (matcher !== null && (typeof matcher !== 'string' || matcher.length === 0)) {
      fail(`\`${spec.module}\`: \`matcher\` is a non-empty string or null`);
    }
    if (spec.timeout !== undefined && (!Number.isInteger(spec.timeout) || spec.timeout < 1)) {
      fail(`\`${spec.module}\`: \`timeout\` is an integer >= 1 or absent`);
    }
    const args = spec.args === undefined ? [] : spec.args;
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string' || a.length === 0)) {
      fail(`\`${spec.module}\`: \`args\` is a list of non-empty strings`);
    }

    // THE LANE IS APPLIED TO THE DERIVED SET, NEVER DECLARED PER CONSUMER.
    // That is the whole point: a shared state migrates for ALL its consumers
    // or for NONE, so no hand can write the flag on one and forget another.
    const base = spec.module.slice(spec.module.lastIndexOf('/') + 1);
    const lane = onClientLane && stateConsumers.includes(base) ? [laneFlag] : [];
    const resolved = args.map((a) => (a === SETTINGS_PLACEHOLDER ? settingsPath : a));
    for (const a of resolved) {
      if (a.includes('{') && a.includes('}')) fail(`\`${spec.module}\`: unknown placeholder in argument ${JSON.stringify(a)}`);
    }

    // A FRAMED consumer is repeated once per frame, each copy carrying its own
    // coordinates. `frames` has ONE source (ctxroute-config.json) and reaches
    // here as a number: re-typing it in the manifest would recreate the two
    // places for one figure that `doctor --settings` exists to confront.
    const copies = spec.framed === true ? frames : 1;
    if (spec.framed !== undefined && typeof spec.framed !== 'boolean') fail(`\`${spec.module}\`: \`framed\` is a boolean`);

    for (let k = 1; k <= copies; k += 1) {
      const coords = spec.framed === true ? ['--frame', String(k), '--frames', String(frames)] : [];
      const argv = [...lane, ...resolved, ...coords];
      const command = `node ${root}/${spec.module}${argv.length ? ` ${argv.join(' ')}` : ''}`;
      const decl = { event: spec.event, matcher, type: 'command', command };
      if (spec.timeout !== undefined) decl.timeout = spec.timeout;
      out.push(decl);
    }
  }
  return out;
}

/**
 * Groups declarations by the (event, matcher) block they belong to, preserving
 * order INSIDE each block. ⚠️ The comparison is per block and never global:
 * settings.json interleaves the operator's own hooks with ours, and the
 * manifest owns ONLY what it declares.
 * ⚠️ The separator is NUL, written as an escape and never as a raw byte: it is
 * the one character a harness event name or a matcher regex cannot contain, so
 * two different pairs can never collapse into one key. A space would look
 * friendlier and would merge `PreToolUse` + ` *` with `PreToolUse ` + `*`.
 * @param {{event: string, matcher: (string|null)}[]} declarations
 * @returns {Map<string, any[]>}
 */
function byBlock(declarations) {
  const groups = new Map();
  for (const d of declarations) {
    const key = `${d.event}\u0000${d.matcher === null ? '' : d.matcher}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return groups;
}

module.exports = { plan, byBlock, SETTINGS_PLACEHOLDER, KNOWN_EVENTS, KNOWN_LANES };
