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

// The harness's OWN defaults, as DATA. Read here so the ceiling of a declared
// bound is DERIVED from what the harness applies on its own, never re-typed as
// a plausible number in a second place.
const { HOOK_TIMEOUT_DEFAULTS } = require('./harness-profile');

/** Placeholder substituted with the settings file the wiring is generated for. */
const SETTINGS_PLACEHOLDER = '{settings}';

/**
 * Events a declaration may be attached to. A typo must not invent an event.
 *
 * ⚠️ A FUNCTION, NOT A MODULE-LEVEL CONSTANT, AND THAT IS NOT STYLE. A literal
 *    evaluated once at module load is a STATIC mutant: the vitest runner keeps
 *    its workers alive with modules cached, so Stryker never re-evaluates it
 *    and it survives every test that could kill it. MEASURED 2026-08-22 on
 *    this very list: five of the eight names survived while a cell drove all
 *    eight through `plan()`. Returned from a call, the literals are evaluated
 *    INSIDE the test. Same remedy as `derived-observables.js`.
 * ⚠️ A FRESH list per call is also why it needs no `Object.freeze`: no caller
 *    holds the array long enough to share it, so nobody can mutate a whitelist
 *    everyone else reads. NEVER hoist it back into a `const`.
 *
 * @returns {string[]} the events a consumer may declare.
 */
function knownEvents() {
  return [
    'SessionStart', 'PreToolUse', 'PostToolUse',
    'UserPromptSubmit', 'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop',
  ];
}

/** The two lanes. `client` = one authority (the daemon); `files` = the disk. */
const KNOWN_LANES = Object.freeze(['client', 'files']);

// ── THE BOUND IS PART OF THE PLAN, NOT PART OF THE TYPING ────────────
// 🔑 THE SECOND HALF OF THE 2026-08-22 DEFECT. The frame declarations were
//    hand-edited, so the `timeout` bound was written SIXTEEN TIMES in a row.
//    Sixteen copies of one truth: fifteen may cut at ten seconds while the
//    sixteenth waits ten minutes, and nothing anywhere says so. Worse, an
//    ABSENT bound is INVISIBLE — it does not read as a mistake, it reads as a
//    line, and it only manifests the day an agent sits waiting for a frame
//    that inherited a default nobody chose.
// 🛑 SO THE BOUND IS DECLARED ONCE, IN THE MANIFEST, AND APPLIED IN ONE PASS.
//    An absent or malformed declaration is a NAMED REFUSAL and never a default
//    value: inheriting a bound without knowing it is EXACTLY the defect being
//    closed here (600 s inherited in silence). A generator that filled in a
//    plausible number would emit a wiring that runs, waits differently from
//    what anyone decided, and says nothing.
/**
 * Where the gate's bound is declared. ONE spelling, quoted in every refusal.
 * ⚠️ A FUNCTION for the same reason as `knownEvents()`: written as a
 *    module-level constant this literal was a STATIC mutant — emptied, every
 *    refusal still fired and simply stopped NAMING the key to write, and no
 *    test could see it. MEASURED 2026-08-22. NEVER hoist it back into a
 *    `const`; the value is evaluated at the call, i.e. inside the test.
 * @returns {string} the manifest path of the gate's bound.
 */
function gateBoundPath() {
  return 'bounds.gateHookTimeoutSeconds';
}

// ── A BOUND HAS TWO ENDS, AND ONLY ONE OF THEM WAS GUARDED ───────────
// 🔑 UNTIL 2026-08-22 any integer >= 1 was accepted, so `999999` — eleven and
//    a half DAYS — read as a decision and bounded nothing. The ceiling is not
//    a taste: past the default the HARNESS applies on its own, a declared
//    bound never fires first, so it changes no behaviour while looking like a
//    choice. That is the same silence as the absent bound below, dressed as a
//    number.
// 📐 THE SCALE, MEASURED 2026-08-22: a frame answered over the loopback in
//    11 ms, over 16 and over 100 sequential frames. The value in production is
//    10 s — roughly 900x that measurement — so the legal interval is wide
//    enough that no load this machine can produce turns a healthy answer into
//    a refusal.
// 🛑 THE CEILING IS DERIVED, NEVER TYPED: it is the SMALLEST handler default
//    any harness of `HOOK_TIMEOUT_DEFAULTS` declares (60 s today, the Claude
//    Code spawn lane). A number copied here instead would be a second place
//    for one truth — the very class this module exists to remove — and it
//    would stop following the table the day a harness declares a shorter one.
/**
 * The largest bound worth declaring, DERIVED from the harness defaults.
 *
 * @param {any} defaults - the harness timeout table (`HOOK_TIMEOUT_DEFAULTS`).
 * @returns {number} the ceiling, in seconds.
 */
function boundCeiling(defaults) {
  const numbers = [];
  for (const harness of Object.values(defaults || {})) {
    // The lanes are the TRANSPORTS this module already knows: a second list of
    // lane names would drift away from the first one.
    for (const lane of KNOWN_TRANSPORTS) {
      // ⚠️ `typeof` FIRST, always: a lane may be declared `absent` or
      //    `unmeasured` — words that state a fact ABOUT a harness and are
      //    never durations to compute with.
      // ⚠️ The harness entry is READ defensively: a table entry that is not an
      //    object must produce the NAMED refusal below, never a TypeError from
      //    inside a generator whose whole contract is that every refusal is
      //    named.
      if (harness && typeof harness[lane] === 'number') numbers.push(harness[lane]);
    }
  }
  // 🛑 ANTI-VACUITY: with nothing numeric to derive from, the ceiling would be
  //    `Infinity` — no ceiling at all, restored in silence. Refused, named.
  if (numbers.length === 0) fail('no harness declares a numeric hook timeout default, so no ceiling can be derived — a bound with no ceiling is not a bound, and guessing one here would be the second place for a truth this module exists to remove');
  return Math.min(...numbers);
}

// ── THE COORDINATES OF A FRAME HAVE ONE SOURCE, WHATEVER CARRIES THEM ──
// 🛑 A frame's coordinates (which one, out of how many) are ONE FACT. Two
//    transports WRITE that fact differently — `--frame k --frames N` on a
//    command line, `?frame=k&frames=N` in a URL — and a module that computed
//    the pair once per branch would hold two copies of one truth: exactly the
//    class this file exists to make unbuildable, rebuilt inside the file that
//    closes it. So the pair is computed ONCE, by `coordinates()`, and each
//    transport only RENDERS it; and it is READ back by ONE reader, so a
//    transport cannot gain a check the other silently lacks.
/** The two coordinate names. ONE spelling each, shared by every writing and every reading. */
const COORD_NAMES = Object.freeze({ index: 'frame', total: 'frames' });

/** The transports a declaration may travel on. An unknown one is a NAMED REFUSAL, never a fallback. */
const KNOWN_TRANSPORTS = Object.freeze(['command', 'http']);

function fail(message) {
  throw new Error(`wiring manifest: ${message}`);
}

/**
 * Reads the gate's declared bound, or REFUSES, named. Exported so the gate
 * judges the same value the generator applies — a second reading of one truth
 * is the very shape of defect this module exists to make unbuildable.
 *
 * @param {any} manifest - the parsed `wiring.json`.
 * @returns {number} the bound, in seconds.
 */
function gateBound(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('unreadable manifest');
  const bounds = manifest.bounds;
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    fail(`\`bounds\` is missing — \`${gateBoundPath()}\` has NO default here: a bound inherited without being chosen is invisible until the day an agent waits for it`);
  }
  const seconds = bounds.gateHookTimeoutSeconds;
  const ceiling = boundCeiling(HOOK_TIMEOUT_DEFAULTS);
  if (!Number.isInteger(seconds) || seconds < 1) {
    fail(`\`${gateBoundPath()}\` must be an integer in 1..${ceiling} seconds, got ${JSON.stringify(seconds)} — a malformed bound is refused, never rounded to something plausible`);
  }
  if (seconds > ceiling) {
    fail(`\`${gateBoundPath()}\` must be an integer in 1..${ceiling} seconds, got ${JSON.stringify(seconds)} — beyond the smallest default a harness applies on its own, a declared bound never fires first, so it bounds NOTHING while reading like a decision (measured 2026-08-22: a frame answers in 11 ms, and the value in production is 10 s, ~900x that)`);
  }
  return seconds;
}

/**
 * The transport the FRAMED declarations travel on, or a NAMED REFUSAL.
 *
 * 🛑 ABSENT MEANS `command`, AND THAT DEFAULT IS DELIBERATE, not laziness: it
 *    is the form every harness executes, the only one Codex has a handler for
 *    (`"Only type:\"command\" handlers run today"`), and it keeps a manifest
 *    written before this key existed generating the exact same wiring.
 * 🛑 AN UNKNOWN `kind` IS REFUSED, NEVER DEGRADED TO `command`. A harness with
 *    no handler for a transport runs NOTHING for that declaration — no error,
 *    no log, just an injection that never happens; and a generator that
 *    quietly rewrote the operator's typo into a spawn would produce a wiring
 *    that runs, differs from what was declared, and says nothing.
 *
 * @param {any} manifest - the parsed `wiring.json`.
 * @returns {{kind: string, host?: string, port?: number, path?: string, statusMessage?: string}}
 */
function gateTransport(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('unreadable manifest');
  const t = manifest.transport;
  if (t === undefined) return { kind: 'command' };
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    fail(`\`transport\` is an object declaring at least \`kind\`, got ${JSON.stringify(t)} — a malformed transport is refused, never read as "the default one"`);
  }
  if (!KNOWN_TRANSPORTS.includes(t.kind)) {
    fail(`\`transport.kind\` must be one of ${KNOWN_TRANSPORTS.join(' | ')}, got ${JSON.stringify(t.kind)} — an unknown transport is REFUSED, never wired as a command: a harness with no handler for it runs NOTHING, in silence`);
  }
  // ── WHAT THE HUMAN READS WHILE THE FRAME RUNS ──────────────────────
  // 🛑 IT IS DECLARABLE, AND UNTIL 2026-08-22 IT WAS ONLY DERIVED — the last
  //    segment of the repository root. That derivation matches the live wiring
  //    and nothing in any harness contract OBLIGES it: a fact nobody declared
  //    is a fact nobody can change without editing the engine, which is the
  //    definition of a tool. Declared here, it stays DATA.
  // ⚠️ THE DERIVATION REMAINS THE DEFAULT, written rather than removed: it is
  //    what the live wiring already carries, and dropping it would rewrite
  //    every generated declaration for a key the operator never touched.
  if (t.statusMessage !== undefined && (typeof t.statusMessage !== 'string' || t.statusMessage.length === 0)) {
    fail(`\`transport.statusMessage\` is a non-empty string when declared, got ${JSON.stringify(t.statusMessage)} — an empty one is a status line saying nothing, which is worse than the derived name it replaces`);
  }
  // ⚠️ THE KEY IS ADDED ONLY WHEN DECLARED, never as `statusMessage: undefined`:
  //    an own key holding `undefined` is not the same object as no key at all,
  //    and every comparison in this repo is a deep STRICT one.
  const declared = t.statusMessage === undefined ? {} : { statusMessage: t.statusMessage };
  if (t.kind === 'command') return { kind: t.kind, ...declared };

  // 🛑 NEITHER THE ENDPOINT NOR THE ROUTE IS DECLARED HERE, AND THAT ABSENCE IS
  //    THE POINT (host and port 2026-08-25 morning, the ROUTE the same day).
  //    They used to be `transport.host`, `transport.port` and `transport.path`,
  //    while the daemon that BINDS and SERVES them held a `HOST`, a
  //    `DEFAULT_PORT` and its route constants of its own: ONE truth, TWO
  //    places, four times over, agreeing by luck with nothing comparing them.
  //    A wiring one number — or one NAME — away from the listener loses every
  //    frame of every action, and the route is the WORST of the four, because
  //    a misspelt one does not even 404: the daemon serves the GATE route for
  //    anything it does not recognise, so the frames would be answered by a
  //    route nobody meant, in silence.
  // 🛑 THE ROUTE NOW REACHES `plan()` AS A MACHINE FACT, read from the single
  //    owner (`src/protocol-routes-pure.js`) by the shell — exactly like the
  //    address, which comes from `paths.httpEndpoint()`. A `transport.path`
  //    RE-ADDED here would rebuild the divergence inside the very file that
  //    exists to remove it, so an unknown key of the transport is refused
  //    below rather than ignored.
  // ⚠️ WHAT STAYS IN THE MANIFEST IS WHAT BELONGS TO THE WIRING AND TO NOTHING
  //    ELSE: which transport carries the frames.
  const unknown = Object.keys(t).filter((k) => k !== 'kind' && k !== 'statusMessage');
  if (unknown.length > 0) {
    fail(`\`transport\` declares ${JSON.stringify(unknown)} — the ADDRESS and the ROUTE are not the wiring's to name: they are read from their single owners (\`paths.httpEndpoint()\` and \`src/protocol-routes-pure.js\`) and reach the plan as machine facts, so re-declaring one here is the very divergence this manifest removes`);
  }
  return { kind: t.kind, ...declared };
}

/**
 * The coordinates of ONE frame, computed ONCE. Each transport RENDERS this
 * pair; none of them recomputes it.
 * @param {number} index - which frame, 1-based.
 * @param {number} total - how many frames the gesture carries.
 * @returns {{name: string, value: number}[]} the pair, in the order it is written.
 */
function coordinates(index, total) {
  return [{ name: COORD_NAMES.index, value: index }, { name: COORD_NAMES.total, value: total }];
}

/**
 * The command-line WRITING of the coordinates.
 * @param {{name: string, value: number}[]} coords
 * @returns {string[]}
 */
function asArgv(coords) {
  return coords.flatMap((c) => [`--${c.name}`, String(c.value)]);
}

/**
 * The URL WRITING of the same coordinates.
 * @param {{name: string, value: number}[]} coords
 * @returns {string}
 */
function asQuery(coords) {
  return coords.map((c) => `${c.name}=${c.value}`).join('&');
}

/** Where a declaration's coordinates could be written: a command line, or a URL. */
function coordinateText(decl) {
  if (!decl) return null;
  if (typeof decl.command === 'string') return decl.command;
  if (typeof decl.url === 'string') return decl.url;
  return null;
}

/** ONE reader for both writings: a transport must not be able to gain a check the other lacks. */
function coordinateOf(text, name) {
  const spawn = new RegExp(`(?:^|\\s)--${name}\\s+(\\d+)(?:\\s|$)`).exec(text);
  if (spawn) return Number(spawn[1]);
  const query = new RegExp(`[?&]${name}=(\\d+)(?:&|$)`).exec(text);
  return query ? Number(query[1]) : null;
}

/**
 * A declaration's frame coordinates, or `null` when it carries none.
 * 🛑 THIS IS HOW A GATE DECLARATION IS RECOGNISED, EVERYWHERE — never by a
 *    `command` field (the http lane has none) and never by a file name (a URL
 *    names a port, not a directory). Same authority as `doctor.js`.
 *
 * @param {any} decl
 * @returns {{index: number, total: number}|null}
 */
function frameCoordinates(decl) {
  const text = coordinateText(decl);
  const index = coordinateOf(text, COORD_NAMES.index);
  const total = coordinateOf(text, COORD_NAMES.total);
  if (index === null || total === null) return null;
  return { index, total };
}

/**
 * The gate's declarations, recognised by the coordinates the plan writes on
 * them. ⚠️ DERIVED from the coordinates, never from a count, a position or a
 * transport: a judge that identified the gate by "the sixteen last ones" would
 * agree with a wiring in which the sixteen are the wrong hook, and one that
 * read `command` alone would count ZERO the day the gate moved to http — loud,
 * and judging nothing.
 *
 * @param {{command?: string, url?: string}[]} declarations
 * @returns {any[]}
 */
function gateFrames(declarations) {
  if (!Array.isArray(declarations)) fail('gateFrames expects a declaration list');
  return declarations.filter((d) => frameCoordinates(d) !== null);
}

/**
 * The gate declarations that do NOT carry the declared bound — an absent bound
 * and a divergent one are the SAME finding, because both mean this frame waits
 * differently from its fifteen peers.
 *
 * @param {{command?: string, timeout?: number}[]} declarations
 * @param {number} bound
 * @returns {any[]}
 */
function framesMissingBound(declarations, bound) {
  if (!Number.isInteger(bound) || bound < 1) fail(`a bound to check against must be an integer >= 1, got ${JSON.stringify(bound)}`);
  return gateFrames(declarations).filter((d) => d.timeout !== bound);
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
 * @param {{root: string, frames: number, host?: string, port?: number, routePath?: string, laneFlag: string, stateConsumers: string[], settingsPath: string}} machine
 *   - `root`: absolute repo root, POSIX-separated, no trailing slash.
 *   - `frames`: the bandwidth of one action (`frames` in ctxroute-config.json).
 *   - `host`/`port`: the daemon's listening address (`http` in ctxroute-config.json,
 *      read WHOLE through `paths.httpEndpoint()`) — the http transport ONLY.
 *   - `routePath`: the GATE route the daemon serves, read from its single owner
 *      `src/protocol-routes-pure.js` — the http transport ONLY.
 *   - `laneFlag`: the lane ARGUMENT, read from `src/client-core.js` — never re-spelled here.
 *   - `stateConsumers`: basenames of the shells that consume the shared injection
 *      state, DERIVED from the source, never a list typed by hand.
 *   - `settingsPath`: what `{settings}` expands to.
 * @returns {{event: string, matcher: (string|null), type: string, command?: string, url?: string, statusMessage?: string, timeout: (number|undefined)}[]}
 */
function plan(manifest, machine) {
  if (!manifest || typeof manifest !== 'object') fail('unreadable manifest');
  const { root, frames, host, port, routePath, laneFlag, stateConsumers, settingsPath } = machine || {};

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

  // Read BEFORE the loop, and AFTER the anti-vacuity refusal above: the bound
  // is a property of the whole manifest, so a malformed one refuses the entire
  // plan rather than half-generating a wiring — but a manifest that declares
  // nothing at all must be told to the reader as an EMPTY manifest, which is a
  // more fundamental fault than a missing bound.
  const bound = gateBound(manifest);
  // The transport is a property of the whole manifest too, and it is read
  // BEFORE the loop for the same reason: a malformed one refuses the entire
  // plan rather than emitting half a wiring on one lane and half on another.
  const transport = gateTransport(manifest);

  const onClientLane = manifest.stateLane === 'client';
  // 🛑 THE PAIR THAT GENERATES THE 2026-08-22 DEFECT ON PURPOSE. On the `http`
  //    transport every frame reaches the DAEMON, which owns the injection
  //    state in its RAM; `stateLane: "files"` leaves the gate's peers reading
  //    and erasing the state files. That is TWO MEMORIES — the split brain
  //    itself: after a compaction the reset wipes a disk the daemon never
  //    read, `once` documents never come back, and nothing anywhere is red.
  //    A shared state migrates for ALL its consumers or for NONE, so the pair
  //    is a NAMED REFUSAL rather than a wiring that runs and lies.
  // 🛑 THE ADDRESS IS A MACHINE FACT, VALIDATED WHERE IT IS USED — and only
  //    the http transport has an endpoint at all, so demanding one of a
  //    `command` manifest would refuse a wiring that names no address. An
  //    unusable half is a NAMED REFUSAL, never a plausible default: the engine
  //    never trusts its input, and a wiring one number — or one name — away
  //    from the listener loses every frame of every action, in silence.
  // ⚠️ BOTH halves are checked, because both were re-typed in the manifest
  //    until 2026-08-25 and a host is exactly as capable of pointing nowhere.
  if (transport.kind === 'http' && (typeof host !== 'string' || host.length === 0)) {
    fail(`the daemon's host must be a non-empty string, got ${JSON.stringify(host)} — it is DECLARED ONCE (`
      + '`http.host` in ctxroute-config.json) and read by BOTH the daemon that binds it and this generator, '
      + 'so no manifest ever re-types it');
  }
  if (transport.kind === 'http' && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    fail(`the daemon's port must be an integer in 1..65535, got ${JSON.stringify(port)} — it is DECLARED ONCE (`
      + '`http.port` in ctxroute-config.json) and read by BOTH the daemon that binds it and this generator, '
      + 'so no manifest ever re-types it');
  }
  // 🛑 THE ROUTE IS A MACHINE FACT TOO, AND ITS REFUSAL IS THE LOUDEST OF THE
  //    THREE ON PURPOSE. A wrong host or port fails at the socket; a wrong
  //    ROUTE succeeds and is answered by the GATE, so nothing anywhere errors.
  //    It is validated where it is USED, and only the http transport has one.
  if (transport.kind === 'http' && (typeof routePath !== 'string' || !routePath.startsWith('/'))) {
    fail(`the gate's route must start with \`/\`, got ${JSON.stringify(routePath)} — it is DECLARED ONCE (`
      + '`src/protocol-routes-pure.js`) and read by BOTH the daemon that serves it and this generator, '
      + 'so no manifest ever re-types it');
  }
  // The query is OURS: it carries the frame coordinates. A route bringing its
  // own would produce two `?` in one URL, i.e. coordinates nobody can read.
  if (transport.kind === 'http' && /[?#]/.test(String(routePath))) {
    fail(`the gate's route must carry no query and no fragment, got ${JSON.stringify(routePath)} — the query is where the frame coordinates travel`);
  }
  if (transport.kind === 'http' && !onClientLane) {
    fail(`\`transport.kind: "http"\` with \`stateLane: ${JSON.stringify(manifest.stateLane)}\` is a SPLIT BRAIN: the frames would record their deliveries in the daemon's memory while their peers read and erase the state files — two memories, no error and nothing red, which is the 2026-08-22 production defect generated on purpose`);
  }
  const out = [];
  const seen = new Set();

  for (const spec of consumers) {
    if (!spec || typeof spec !== 'object') fail('a consumer is not an object');
    checkModule(spec);
    if (seen.has(spec.module)) fail(`\`${spec.module}\` is declared twice — a duplicate declaration means the hook runs twice per event`);
    seen.add(spec.module);

    if (!knownEvents().includes(spec.event)) fail(`\`${spec.module}\`: unknown event ${JSON.stringify(spec.event)}`);
    const matcher = spec.matcher === undefined ? null : spec.matcher;
    if (matcher !== null && (typeof matcher !== 'string' || matcher.length === 0)) {
      fail(`\`${spec.module}\`: \`matcher\` is a non-empty string or null`);
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

    // 🛑 EVERY DECLARATION CARRIES A BOUND, AND AN ABSENT ONE IS A REFUSAL.
    //    A hook with no `timeout` inherits the harness default in silence — the
    //    invisible half of the 2026-08-22 defect. The GATE takes its bound from
    //    the manifest (ONE number, N frames, so the sixteen cannot diverge);
    //    every other consumer declares its own, because they are one
    //    declaration each and their bounds differ by intent — a doctor is
    //    allowed to be slower than a turn counter.
    // ⚠️ CHECKED LAST, after `framed` is known to be a boolean: a malformed
    //    `framed` must be told to the reader as a malformed `framed`, not as a
    //    missing timeout on a consumer that never claimed to need one.
    if (spec.framed === true) {
      if (spec.timeout !== undefined) {
        fail(`\`${spec.module}\`: a framed consumer must NOT declare its own \`timeout\` — its bound is \`${gateBoundPath()}\`, and two places for one number is the divergence this manifest exists to remove`);
      }
    } else if (!Number.isInteger(spec.timeout) || spec.timeout < 1) {
      fail(`\`${spec.module}\`: \`timeout\` must be an integer >= 1 — an undeclared bound is inherited from the harness in silence, and that silence is what kept sixteen hand-written copies invisible`);
    }

    // 🛑 A URL CARRIES NO ARGV. Emitting an http declaration for a consumer
    //    that declared arguments would DROP them — accepted, wired, and inert:
    //    the shape of failure this framework refuses outright. The refusal is
    //    named, and the fix is the operator's (declare `kind: "command"`, or
    //    move that argument into the endpoint).
    const onHttp = spec.framed === true && transport.kind === 'http';
    if (onHttp && args.length > 0) {
      fail(`\`${spec.module}\`: a framed consumer on the \`${transport.kind}\` transport cannot carry \`args\` (${JSON.stringify(args)}) — a URL has no argv, so those arguments would be silently DROPPED from the wiring`);
    }

    for (let k = 1; k <= copies; k += 1) {
      // ONE computation of the pair (which frame, out of how many); the
      // transport below only chooses how to WRITE it.
      const coords = spec.framed === true ? coordinates(k, frames) : null;
      // The bound is written by the SAME pass that writes the frame, so the
      // sixteen cannot diverge: there is one number and one loop.
      if (onHttp) {
        // ⚠️ THE LANE ARGUMENT IS ABSENT HERE, AND THAT IS NOT AN OVERSIGHT:
        //    on this transport the daemon IS the authority, so there is no
        //    second lane to name. The peers keep carrying it, which is exactly
        //    what `doctor.js` checks for coherence.
        // The `kind` IS the scheme: one word, never a second spelling of it.
        out.push({
          event: spec.event,
          matcher,
          type: transport.kind,
          url: `${transport.kind}://${host}:${port}${routePath}?${asQuery(coords)}`,
          timeout: bound,
          // Declared wins; the derivation is the written default.
          statusMessage: transport.statusMessage === undefined ? tokenOf(root) : transport.statusMessage,
        });
        continue;
      }
      const argv = [...lane, ...resolved, ...(coords === null ? [] : asArgv(coords))];
      const command = `node ${root}/${spec.module}${argv.length ? ` ${argv.join(' ')}` : ''}`;
      // ⚠️ ON THIS LANE THE STATUS LINE IS WRITTEN ONLY WHEN DECLARED, and the
      //    asymmetry with the http branch above is DELIBERATE: the spawn
      //    declarations have never carried one, so deriving a default here
      //    would rewrite every generated command declaration for a key nobody
      //    asked for — a silent change to the wiring of every port.
      const spoken = spec.framed === true && transport.statusMessage !== undefined
        ? { statusMessage: transport.statusMessage } : {};
      out.push({
        event: spec.event, matcher, type: 'command', command,
        timeout: spec.framed === true ? bound : spec.timeout,
        ...spoken,
      });
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

// ═══════════════════════════════════════════════════════════════════════
// THE SPLICE — WE OWN OUR DECLARATIONS AND NOTHING ELSE
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 `settings.json` IS NOT OURS. It carries the operator's own hooks, their
//    permissions and their preferences. So the write is a SPLICE, never a
//    rewrite: our declarations are replaced in place, every foreign key,
//    block and entry passes through UNTOUCHED, in its original order.
//
// ⚠️ THIS DECISION LIVES HERE, IN THE PURE MODULE, ON PURPOSE. Putting "which
//    entries are ours" in the shell would put it outside Stryker, i.e. outside
//    everything that measures whether the rule is actually enforced — and the
//    rule decides what gets DELETED from the operator's configuration.
//
// ⚠️ IDEMPOTENT BY CONSTRUCTION: ours are removed everywhere first, then the
//    freshly generated set is inserted at the index of the FIRST removed entry
//    of its block (or appended if that block held none of ours). Replaying
//    converges on the same file; it never stacks a second copy.

/** The framework's own name on this machine: the last segment of its POSIX root. */
function tokenOf(root) {
  return root.slice(root.lastIndexOf('/') + 1);
}

/**
 * Does `text` mention `needle` AS A PATH SEGMENT, rather than as a bare
 * substring?
 *
 * 🔴 WHY THIS EXISTS — MEASURED IN PRODUCTION 2026-08-31. The suspect test read
 *    `text.includes(root) || text.includes(token)`, and a NEIGHBOURING project
 *    called `ctxroute-policies` sits beside this repository. Its declaration
 *    (`node .../Desktop/ctxroute-policies/bin/check.js`) CONTAINS both the root
 *    and the token as prefixes, so the splice accused a hook it does not own
 *    and REFUSED to write — the generator became unusable on the operator's own
 *    machine, for a file it had no business claiming.
 * 🛑 THE OWNERSHIP TEST WAS ALREADY RIGHT (`node ${root}/`, trailing slash
 *    mandatory): only the MENTION test compared raw text. Two questions about
 *    the same boundary must not be answered by two different rules — that gap
 *    is the whole defect.
 * ⚠️ A MENTION STAYS DELIBERATELY BROAD (it must catch a second copy of this
 *    framework whatever spells it), it simply may not run past a segment: the
 *    match counts only when what FOLLOWS cannot continue a name. Sibling
 *    directories (`-policies`, `_old`, `2`) stop being accused; a real
 *    `…/ctxroute/…` or a bare `"ctxroute"` still is.
 */
function mentionsSegment(text, needle) {
  if (needle === '') return false;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    const next = text[i + needle.length];
    if (next === undefined || !/[A-Za-z0-9_-]/.test(next)) return true;
  }
  return false;
}

/**
 * Ownership is decided by the command's ROOT, never by a file name: two copies
 * of the framework must not look alike.
 * ⚠️ A URL HAS NO ROOT — it names a port, never a directory — so a declaration
 *    on that transport is recognised by its COORDINATES, the same authority
 *    `doctor.js` uses. KNOWN LIMIT, written rather than hidden: two copies of
 *    the framework pointed at the SAME endpoint are indistinguishable here;
 *    what separates them is the port, and the port is the operator's.
 */
function ownedBy(entry, root) {
  if (!entry) return false;
  if (typeof entry.command === 'string' && entry.command.startsWith(`node ${root}/`)) return true;
  return typeof entry.url === 'string' && frameCoordinates(entry) !== null;
}

/** A block's matcher, normalised the way `plan()` writes it: absent ⇔ null. */
function matcherOf(block, key) {
  return block && typeof block[key] === 'string' ? block[key] : null;
}

/**
 * The document shape the splice walks when the caller declares none.
 *
 * ⚠️ IT IS A DEFAULT, NOT A PRODUCT. The splice used to hold these three
 *    names as literals; they moved out so a harness whose wiring nests the
 *    same way under OTHER key names is spliced by the same code, from its own
 *    manifest. The default keeps every existing caller byte-identical
 *    (extension contract: default behaviour = the previous behaviour), and it
 *    is a FUNCTION rather than a constant for the static-mutant reason given
 *    on `knownEvents()`.
 * @returns {{rootKey: string, entriesKey: string, matcherKey: string}}
 */
function defaultShape() {
  return { rootKey: 'hooks', entriesKey: 'hooks', matcherKey: 'matcher' };
}

/**
 * Splices generated declarations into a parsed settings object.
 *
 * @param {any} settings - the PARSED target file; it is never mutated.
 * @param {{event: string, matcher: (string|null), type: string, command: string, timeout: number}[]} declarations
 * @param {string} root - the POSIX framework root the declarations were generated for.
 * @param {{rootKey?: string, entriesKey?: string, matcherKey?: string}} [shape] - where the
 *   harness keeps its declarations; absent = the shape this framework was born wiring.
 * @returns {{settings: any, removed: number, written: number, suspects: any[]}}
 *   `suspects` = entries that MENTION this framework yet are not ours by
 *   command. They are handed back, not deleted: the caller refuses.
 */
function splice(settings, declarations, root, shape) {
  const s = { ...defaultShape(), ...(shape || {}) };
  for (const k of ['rootKey', 'entriesKey', 'matcherKey']) {
    if (typeof s[k] !== 'string' || s[k].length === 0) fail(`the splice was given no \`${k}\` — it decides which entries of a file we do not own are DELETED, and a wrong name there empties the wrong branch`);
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) fail('the target settings is not a JSON object');
  if (typeof root !== 'string' || root.length === 0) fail('no framework root supplied to the splice');
  // 🛑 AN EMPTY GENERATED SET WOULD *REMOVE* THE FRAMEWORK FROM THE WIRING and
  //    look exactly like a successful update. Refused, named.
  if (!Array.isArray(declarations) || declarations.length === 0) fail('nothing to splice — an empty declaration set would unwire the framework instead of updating it');

  const next = JSON.parse(JSON.stringify(settings));
  const hooks = next[s.rootKey];
  // Refusing an absent section is fail-closed on the likeliest mistake: a path
  // that points at a file which is not the wiring at all.
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) fail(`the target declares no \`${s.rootKey}\` section — this is probably not the wiring file you think it is, and a wiring is never created out of nothing here`);

  // ── ANYTHING THAT MENTIONS US BUT IS NOT OURS IS A SUSPECT ──────────
  // A second wiring of this framework in another spelling (an http lane frame,
  // a stale copy under an old path) would survive the splice and run BESIDE
  // the declarations we just wrote — two wirings, which is the split brain
  // wearing a different coat. We report; the caller refuses.
  const token = tokenOf(root);
  const suspects = [];

  const removedIndex = new Map();
  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const blocks = Array.isArray(hooks[event]) ? hooks[event] : [];
    for (const block of blocks) {
      // 🛑 A BLOCK WITHOUT A REAL `hooks` ARRAY IS SKIPPED, NOT WALKED WITH AN
      //    EMPTY FALLBACK. The fallback existed and was UNOBSERVABLE: when it
      //    was taken the loop only ever filled `kept`, which the assignment
      //    below then refused to publish (it requires `block.hooks` to BE an
      //    array). No input could make the two shapes differ — a mutant of that
      //    `[]` survived every test, which is exactly what an equivalent mutant
      //    is. It is REMOVED at the source rather than frozen by a test.
      if (!block || !Array.isArray(block[s.entriesKey])) continue;
      const entries = block[s.entriesKey];
      const kept = [];
      for (const entry of entries) {
        if (ownedBy(entry, root)) {
          removed += 1;
          const m = matcherOf(block, s.matcherKey);
          const key = `${event}\u0000${m === null ? '' : m}`;
          if (!removedIndex.has(key)) removedIndex.set(key, { block, at: kept.length });
          continue;
        }
        // A DECLARATION THAT MENTIONS US BUT IS NOT OURS BY COMMAND IS A
        // SUSPECT, never a silent survivor: it would keep running BESIDE what
        // we just wrote — two wirings of one framework, which is the split
        // brain of 2026-08-22 wearing a different coat.
        const text = JSON.stringify(entry);
        if (mentionsSegment(text, root) || mentionsSegment(text, token)) suspects.push(entry);
        kept.push(entry);
      }
      // ⚠️ NO GUARD HERE, AND ITS ABSENCE IS PROVEN, NOT ASSUMED. The `continue`
      //    above already established that `block` is truthy AND `block[s.entriesKey]`
      //    is an array, and nothing in this loop reassigns either. A guard repeating
      //    it was TRUE on every input: no test could tell `&&` from `||`, nor the
      //    condition from `true` — 2 survivors measured, the last ones in this file.
      //    REMOVED at the source, never frozen by a test written for dead code.
      //    🛑 The comment block above removed the OTHER half of this same guard on
      //    2026-08-22 and left this one standing; the key became a parameter on
      //    08-23 and the redundancy came back with it. Redundancy travels in pairs.
      block[s.entriesKey] = kept;
    }
    // A block we emptied is dropped: an empty `hooks: []` is debris, and debris
    // accumulates one entry per replay, which is the opposite of idempotent.
    hooks[event] = blocks.filter((b) => !(b && Array.isArray(b[s.entriesKey]) && b[s.entriesKey].length === 0));
    if (hooks[event].length === 0) delete hooks[event];
  }

  for (const [key, group] of byBlock(declarations)) {
    const [event, matcherText] = key.split('\u0000');
    const matcher = matcherText === '' ? null : matcherText;
    // ⚠️ FIELD BY FIELD, AND ONLY THE ONES THE DECLARATION CARRIES: a
    //    `command: undefined` written on an http entry (or the reverse) would
    //    be a key the harness reads as present-and-empty. The ORDER is the one
    //    a harness writes itself, so a regenerated wiring diffs cleanly
    //    against a hand-written one instead of showing sixteen false changes.
    const entries = group.map((d) => {
      const e = { type: d.type };
      if (d.command !== undefined) e.command = d.command;
      if (d.url !== undefined) e.url = d.url;
      e.timeout = d.timeout;
      if (d.statusMessage !== undefined) e.statusMessage = d.statusMessage;
      return e;
    });

    const target = removedIndex.get(key);
    if (target && Array.isArray(target.block[s.entriesKey])) {
      target.block[s.entriesKey].splice(target.at, 0, ...entries);
      if (!Array.isArray(hooks[event])) hooks[event] = [target.block];
      else if (!hooks[event].includes(target.block)) hooks[event].push(target.block);
      continue;
    }
    // Nothing of ours lived under this (event, matcher) yet: we APPEND our own
    // block rather than joining one of the operator's. Their blocks stay theirs.
    const block = matcher === null ? { [s.entriesKey]: entries } : { [s.matcherKey]: matcher, [s.entriesKey]: entries };
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    hooks[event].push(block);
  }

  return { settings: next, removed, written: declarations.length, suspects };
}

module.exports = {
  plan, byBlock, splice, gateBound, gateTransport, gateFrames, framesMissingBound, frameCoordinates,
  boundCeiling, SETTINGS_PLACEHOLDER, knownEvents, KNOWN_LANES, KNOWN_TRANSPORTS,
  gateBoundPath, COORD_NAMES,
  // ⚠️ Exported ONLY for direct unit testing of its boundary behaviour (a
  //    needle ending at the very last character of the text), which its sole
  //    caller — `JSON.stringify(entry)`, always terminated by `}` — can never
  //    reach. NOT part of the manifest vocabulary; internal to the splice.
  mentionsSegment,
};
