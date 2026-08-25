// ═══════════════════════════════════════════════════════════════════════
// WHERE THE FRAMEWORK'S DATA LIVES — the DECISIONS, alone
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THIS MODULE EXISTS AT ALL. Until now the address of the DATA was
//    derived from the address of the CODE (`path.join(__dirname, '..', …)`
//    inside `paths.js`) — for the state, for `docs/mcp` and for
//    `docs/session`. One consequence, and it is the whole reason for this
//    file: a SECOND copy of the code is a SECOND state and a SECOND corpus,
//    i.e. a SPLIT BRAIN — the class this repository refuses outright, because
//    it fails in SILENCE (a `once` document delivered twice, a maintainer's
//    doc edit that never reaches production, and nothing red anywhere).
//    Separating the two addresses is the prerequisite for running production
//    from a FROZEN copy of the code while the operator keeps editing docs.
//
// 🛑 THE ACCEPTANCE CRITERION IS ZERO DEFAULT CHANGE. With nothing declared —
//    no config key, no launch argument — every function here returns EXACTLY
//    the value the code derived before this module existed. It adds addresses
//    the operator MAY declare; it never moves anything on its own.
//
// ⚠️ PURE ON PURPOSE (no `fs`, no `path`, no `process`): the caller reads the
//    config, hands over the arguments and gives the OS its own authority —
//    `isAbsolute` is INJECTED, never re-implemented here. Re-writing "what is
//    an absolute path" would be guessing at something `path` already knows per
//    platform (a drive letter on Windows, a leading slash on POSIX, UNC
//    shares), and a wrong guess would REFUSE a legitimate address or ACCEPT an
//    ambiguous one. Purity is also what makes these decisions mutable by
//    Stryker: an UNMUTATED rule about where the data lives is a rule nobody has
//    proven can go red.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ The names of the config keys, written ONCE each: they travel into the
//    refusal message read by whoever must fix their config, and a second
//    spelling would name a key that does not exist.
const STATE_DIR_KEY = 'stateDir';
const DOCS_DIR_KEY = 'docsDir';
const SESSION_DOCS_DIR_KEY = 'sessionDocsDir';
const HTTP_KEY = 'http';

// ⚠️ The spelling of the environment escape, written ONCE: it travels into the
//    refusal message, and a second spelling would name a variable nobody set.
//    🛑 UNLIKE THE `CTXROUTE_*_DIR` VARIABLES, THIS ONE IS **NOT** TEST-RESERVED
//    — `service/ctxroute-http.service` declares it and `service/install-windows.ps1`
//    reads it back, so an operator legitimately owns it. What it shares with them
//    is its TREATMENT: it wins over the config key, exactly as they do.
// 🛑 THERE IS NO `CTXROUTE_HTTP_HOST`, AND THAT ASYMMETRY IS DECLARED, NEVER an
//    omission: no supervisor ever names a host to us (systemd writes it in
//    `ListenStream=`, launchd in `SockNodeName`), and an environment variable is
//    INHERITED — one leak able to move this bind OFF the loopback would hand this
//    fleet's private knowledge to the local network, on an endpoint that has no
//    authentication and must never need one. The host is declared in the config,
//    in writing, next to its port.
const HTTP_PORT_ENV = 'CTXROUTE_HTTP_PORT';

// ═══════════════════════════════════════════════════════════════════════
// THE DAEMON'S LISTENING ADDRESS — ONE fact, and it used to be FOUR halves
// ═══════════════════════════════════════════════════════════════════════
// 🔴 UNTIL 2026-08-25 ONE ADDRESS LIVED IN FOUR PLACES, TWO PER FIELD: a `HOST`
//    constant and a `DEFAULT_PORT` constant in `src/hooks/http-server.js` (what
//    the daemon BINDS) facing `transport.host` and `transport.port` in
//    `wiring.json` (where the harness POSTs). Each pair agreed by luck, and
//    NOTHING compared them — the class of the 2026-08-22 split brain, where one
//    truth held in nineteen hand-edited copies failed in silence. Here the
//    silence would be total: the http lane has NO fallback, so a wiring one
//    number — or one name — away from the listener loses EVERY frame of EVERY
//    action, instantly, with no error and no badge.
// ⇒ The address follows `frames` exactly: DERIVE, NEVER ENUMERATE. It is a
//    declared key of `ctxroute-config.json`, resolved HERE once, and both
//    consumers read that single resolution.
// 🛑 AND IT IS **ONE** KEY, NOT TWO. An `httpHost` beside an `httpPort` would be
//    two settings for one fact — the same disease one level up, in the
//    VOCABULARY this time. Grouped as `http: { host, port }`, an address can
//    only ever be read WHOLE, in ONE call, by both consumers.
// ⚠️ 127.0.0.1 and 8787 (the IANA dynamic range) are DEFAULTS rather than
//    refusals on purpose: the daemon must start on a machine that declared
//    nothing, and `frames`'s named refusal is admissible only because nothing
//    at RUNTIME depends on it.
const DEFAULT_HTTP_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 8787;

/**
 * A NAMED REFUSAL about the listening address — it says WHERE the value came
 * from, WHAT it was, what was required, and why nothing is resolved.
 * 🛑 A quiet fallback to 127.0.0.1:8787 is the defect, not the mercy: an
 *    operator who declared an address ASKED for that address, and a daemon
 *    listening somewhere else while the wiring knocks at the declared one is
 *    exactly the two-places divergence this key removes.
 * @param {string} source the config key (or one of its halves), or the variable
 * @param {unknown} value
 * @param {string} requirement one sentence saying what a usable value is
 * @returns {Error}
 */
function refuseEndpoint(source, value, requirement) {
  return new Error(
    `ctxroute REFUSED: "${source}" does not declare a usable listening address — received `
    + `${JSON.stringify(value)}. ${requirement} Nothing is resolved at all: the daemon BINDS this `
    + 'address and the harness wiring POSTs to it, so guessing here would wire the fleet where '
    + 'nobody listens — a refused connection is instant and SILENT on that lane, which has NO '
    + `fallback. Fix "${source}", or remove it to keep the default address.`
  );
}

/** @param {unknown} n @returns {boolean} */
function isPort(n) {
  // ⚠️ `Number.isInteger` DOES NOT COERCE — the specification returns false for
  //    anything that is not a Number — so it IS the type check, and a
  //    `typeof n === 'number'` in front of it would be dead at RUNTIME: a mutant
  //    no input can ever kill, and a test written to chase it would freeze
  //    useless code for ever. What the CHECKER still needs is an ASSERTION,
  //    which is erased at runtime and therefore never mutated (same idiom, and
  //    same reason, as the cast in `portOf` below).
  const port = /** @type {number} */ (n);
  return Number.isInteger(n) && port >= 1 && port <= 65535;
}

/**
 * The HOST half. ⚠️ Its SHAPE is checked, never its MEANING: an address this
 * kernel cannot bind fails at `listen` with the kernel's own error, and the
 * kernel is the authority — a list of admissible addresses written here would
 * refuse healthy ones and still prove nothing about the rest.
 * @param {unknown} declared @returns {string}
 */
function hostOf(declared) {
  if (declared === undefined || declared === null) return DEFAULT_HTTP_HOST;
  if (typeof declared !== 'string' || declared.length === 0) {
    throw refuseEndpoint(`${HTTP_KEY}.host`, declared, 'It must be a non-empty string.');
  }
  return declared;
}

/**
 * The PORT half, and the ONE place the environment escape is honoured.
 * @param {unknown} envPort @param {unknown} declared @returns {number}
 */
function portOf(envPort, declared) {
  if (typeof envPort === 'string' && envPort !== '') {
    const n = Number(envPort);
    if (!isPort(n)) throw refuseEndpoint(HTTP_PORT_ENV, envPort, 'It must be an integer in 1..65535.');
    return n;
  }
  if (declared === undefined || declared === null) return DEFAULT_HTTP_PORT;
  if (!isPort(declared)) {
    throw refuseEndpoint(`${HTTP_KEY}.port`, declared, 'It must be an integer in 1..65535.');
  }
  // The guard above IS the proof; the checker cannot narrow through a call.
  return /** @type {number} */ (declared);
}

/**
 * Resolve the ONE address the daemon binds and the wiring posts to.
 *
 * PRECEDENCE, the SAME shape as `resolveDeclaredDir` and for the same reason:
 *   ① `envPort` — `CTXROUTE_HTTP_PORT`. It MUST keep winning: the systemd unit
 *      declares it and the Windows installer reads it back, and every suite that
 *      forks a daemon on a free port sets it. It moves the PORT alone, because
 *      no supervisor ever names a host (see `HTTP_PORT_ENV` above).
 *   ② `readConfiguredHttp` — the operator's declared `http` object.
 *   ③ the historical `127.0.0.1:8787`, byte for byte.
 *
 * ⚠️ `readConfiguredHttp` is a THUNK because the I/O belongs to the SHELL, and
 *    it is called UNCONDITIONALLY: the host has no environment escape, so the
 *    config is the only place it can come from. (While the port lived alone,
 *    stage ② was skipped whenever stage ① fired — one read fewer, and an address
 *    that could only ever be resolved by halves.)
 * ⚠️ An EMPTY variable is an ABSENT variable (a shell exporting
 *    `CTXROUTE_HTTP_PORT=` means "I set nothing"), while a variable holding
 *    NONSENSE is a refusal — the operator typed it.
 * ⚠️ The key, and each of its halves, is OPTIONAL: absent (or JSON `null`) means
 *    "the framework decides", which is the behaviour that predates this key, to
 *    the byte.
 *
 * @param {{envPort?: unknown, readConfiguredHttp: () => unknown}} o
 * @returns {{host: string, port: number}}
 */
function resolveDeclaredHttp(o) {
  const declared = o.readConfiguredHttp();
  if (declared !== undefined
    && (typeof declared !== 'object' || Array.isArray(declared))) {
    throw refuseEndpoint(HTTP_KEY, declared, 'It must be an object carrying `host` and `port`.');
  }
  const pair = /** @type {{host?: unknown, port?: unknown}} */ (declared || {});
  return { host: hostOf(pair.host), port: portOf(o.envPort, pair.port) };
}

// ═══════════════════════════════════════════════════════════════════════
// THE CONFIG'S OWN ADDRESS — A LAUNCH ARGUMENT, AND NOTHING ELSE
// ═══════════════════════════════════════════════════════════════════════
// 🔑 THE CONFIG CANNOT DECLARE ITS OWN LOCATION, so the one address that must
//    come from OUTSIDE the config is this one. It is an ARGUMENT, exactly like
//    the state lane's `--client` (`client-core.js`), and for the same reason
//    written there: an ENVIRONMENT VARIABLE IS INHERITED, and one leak makes a
//    hook spawned from anywhere read a FOREIGN config — a whole fleet reading
//    another fleet's rules, in silence. The wiring writes the flag; nothing can
//    inherit it.
// 🔴 AND THE FLAG IS NAMESPACED, WHICH `--client` DOES NOT NEED TO BE —
//    MEASURED, not stylistic. `client-core.clientLane()` is called by four hook
//    SHELLS only; this flag is read by `paths.js`, which is loaded inside EVERY
//    process that touches this repository, tests and tools included. A bare
//    `--config` is already used by four npm scripts of this very package
//    (`vitest run --config vitest.heavy.config.mjs`, `depcruise --config
//    .dependency-cruiser.json`), so the framework would have read a VITEST
//    config file as its own, silently, in the middle of the suite. A flag's
//    universe is the process's whole `argv`, never our own intentions.
// 🛑 DECLARED HERE AND NOT IN `client-core.js` — a REQUIRE CYCLE, read in the
//    code, not supposed: `client-core` → `store-resolve` → `session-store` →
//    `paths`, and `paths` is what needs the flag. Putting the two lane
//    constants in one file would make `paths.js` the head of a cycle every
//    module of the repository sits under. The SHAPE is copied from `LANE_FLAG`
//    (one constant, one pure reader taking `argv`), which is what the rule
//    actually protects: one spelling, so no two callers can drift.
const CONFIG_FLAG = '--ctxroute-config';

/**
 * A NAMED REFUSAL about a config KEY — it says the KEY, the VALUE and WHY,
 * never a quiet fallback to the code-derived path.
 * 🛑 Falling back silently is the defect, not the mercy: the operator would
 *    believe their data lives where they wrote it, while the framework kept
 *    reading and writing next to its own source. Both halves of the fleet would
 *    look healthy and share nothing.
 * @param {string} configKey
 * @param {unknown} value
 * @param {string} why
 * @returns {Error}
 */
function refuse(configKey, value, why) {
  return new Error(
    `ctxroute REFUSED: the config key "${configKey}" is ${why} — received ${JSON.stringify(value)}. `
    + 'It must be an ABSOLUTE path. A relative one would be resolved against a working directory '
    + 'this framework does not control (a hook is spawned by the harness, from wherever the agent '
    + 'happens to stand), so two callers would silently address two different directories. '
    + `Nothing is resolved at all: fix "${configKey}", or remove the key to keep the default `
    + 'directory derived from the code.'
  );
}

/**
 * Resolve one directory the operator MAY declare in `ctxroute-config.json`.
 *
 * PRECEDENCE, and its order is load-bearing:
 *   ① `envDir` — the `CTXROUTE_*_DIR` override, RESERVED for tests and
 *      `doctor.js`. It MUST keep winning: every suite that isolates itself in
 *      a throwaway tmpdir does it through those variables, and the day a config
 *      beat them, those suites would start reading and writing the REAL data.
 *   ② `configuredDir` — the operator's declared address (`ctxroute-config.json`).
 *   ③ `defaultDir` — the historical, code-derived directory.
 *
 * ⚠️ `readConfiguredDir` is a THUNK, not a value, and that is what keeps stage
 *    ② from being PAID at stage ①: under the test override the config is never
 *    read at all, so a suite pointing at a throwaway config keeps costing zero
 *    I/O — and an unreadable config can never affect a run that overrode the
 *    address anyway.
 *
 * @param {{configKey: string, envDir?: unknown, readConfiguredDir: () => unknown,
 *          defaultDir: string, isAbsolute: (p: string) => boolean}} o
 * @returns {string}
 */
function resolveDeclaredDir(o) {
  // ⚠️ An EMPTY variable is an ABSENT variable: a shell that exports
  //    `CTXROUTE_STATE_DIR=` would otherwise pin the state to the empty
  //    string, i.e. to the process's current directory.
  if (typeof o.envDir === 'string' && o.envDir !== '') return o.envDir;

  const declared = o.readConfiguredDir();
  // The key is OPTIONAL: absent (or JSON `null`) means "the framework decides",
  // which is the behaviour that predates this module, to the byte.
  if (declared === undefined || declared === null) return o.defaultDir;

  if (typeof declared !== 'string' || declared === '') throw refuse(o.configKey, declared, 'not a non-empty string');
  if (!o.isAbsolute(declared)) throw refuse(o.configKey, declared, 'a RELATIVE path');
  return declared;
}

/**
 * A NAMED REFUSAL about the launch ARGUMENT.
 * 🛑 An operator who typed the flag ASKED for another config; reading the
 *    repository's own file instead would answer a different question than the
 *    one asked, and the whole fleet would run on rules nobody meant to apply.
 *    So an argument we cannot honour resolves NOTHING.
 * @param {unknown} value
 * @param {string} why
 * @returns {Error}
 */
function refuseArgument(value, why) {
  return new Error(
    `ctxroute REFUSED: the launch argument "${CONFIG_FLAG}" is ${why} — received ${JSON.stringify(value)}. `
    + 'It must be followed by ONE ABSOLUTE path to a config file. A relative one would be resolved '
    + 'against a working directory this framework does not control (a hook is spawned by the harness, '
    + 'from wherever the agent happens to stand), so two callers would silently read two different '
    + `configs. Nothing is resolved at all: fix the argument, or remove "${CONFIG_FLAG}" to keep the `
    + 'config file that sits next to the code.'
  );
}

/**
 * The config file's address as DECLARED on the command line.
 *
 * ⚠️ IT TAKES `argv`, IT DOES NOT READ IT. Reading `process.argv` is a SHELL
 *    capability (`layers.json`); a pure decision receives the arguments.
 * ⚠️ ABSENT ⇒ `undefined`, i.e. today's behaviour to the byte: the caller falls
 *    back to the config file sitting next to the code.
 * 🛑 PRESENT BUT UNUSABLE ⇒ A REFUSAL, NEVER `undefined`. A token starting with
 *    `-` is the NEXT FLAG, not an address (the wiring writes
 *    `--ctxroute-config --frame 3`, and reading `--frame` as a file name would
 *    send the framework to a config nobody owns); a missing token, an empty one
 *    or a relative one are the same class. Answering `undefined` there would
 *    silently serve the repository's own config to an operator who explicitly
 *    asked for another one.
 * 🛑 TWICE IS ALSO A REFUSAL. Two spellings of one address are two addresses,
 *    and `indexOf` would silently pick the first — the same "two callers, two
 *    truths" defect the flag exists to prevent.
 *
 * @param {{argv: unknown, isAbsolute: (p: string) => boolean}} o
 * @returns {string|undefined}
 */
function configPathArgument(o) {
  if (!Array.isArray(o.argv)) return undefined;
  // ⚠️ `indexOf` answers EXACTLY -1 when the flag is absent, so absence is
  //    compared for EQUALITY, never for order: `i < 0` would carry a boundary
  //    (`i === 0`) that no caller can ever reach — an untestable comparison, i.e.
  //    a mutant that survives for ever and freezes the line if a test chases it.
  const i = o.argv.indexOf(CONFIG_FLAG);
  if (i === -1) return undefined;
  if (o.argv.lastIndexOf(CONFIG_FLAG) !== i) throw refuseArgument(CONFIG_FLAG, 'declared MORE THAN ONCE');
  const next = o.argv[i + 1];
  if (typeof next !== 'string' || next === '') throw refuseArgument(next, 'followed by no address at all');
  if (next.startsWith('-')) throw refuseArgument(next, 'followed by another FLAG instead of an address');
  if (!o.isAbsolute(next)) throw refuseArgument(next, 'a RELATIVE path');
  return next;
}

// ═══════════════════════════════════════════════════════════════════════
// THE OS-CONVENTIONAL PER-USER CONFIG — READ FROM THE SPECS, NEVER INVENTED
// ═══════════════════════════════════════════════════════════════════════
// 🔑 WHY IT EXISTS, and it is TWO reasons that happen to have one cure.
//    ① PRODUCTION RUNS FROM THE DIRECTORY WE EDIT, so the daemon exits on its
//    own source change at every delivery. A FROZEN copy of the code cures that,
//    and the only thing such a copy lacks is a way to find the LIVE config.
//    ② THIS REPOSITORY IS PUBLIC, and until now an adopter's configuration had
//    to live INSIDE the clone — so a `git pull` or a re-clone DESTROYS it.
//    Convention over configuration answers both with one address.
// 🛑 IT IS EXISTENCE-CONDITIONAL AT THE CALLER, AND THAT IS THE WHOLE DESIGN.
//    A machine with no user-level file behaves EXACTLY as it did before this
//    function existed — zero default change is the acceptance criterion, which
//    is what makes the capability invisible to every install already running.
//
// 📚 SOURCES READ 2026-08-24, one per platform — this address is DOCUMENTED by
//    a third party, so it is READ, never reverse-engineered:
//    · XDG Base Directory Specification, version 0.8, dated 08 May 2021
//      (specifications.freedesktop.org/basedir/latest/): "$XDG_CONFIG_HOME
//      defines the base directory relative to which user-specific configuration
//      files should be stored. If $XDG_CONFIG_HOME is either not set or empty, a
//      default equal to $HOME/.config should be used." and "All paths set in
//      these environment variables must be absolute."
//    · Microsoft, KNOWNFOLDERID reference (learn.microsoft.com/windows/win32/
//      shell/knownfolderid, page dated 2020-07-27, revised 2023-08-30):
//      FOLDERID_RoamingAppData, folder type PERUSER, Display Name "Roaming",
//      Default Path "%APPDATA% (%USERPROFILE%\\AppData\\Roaming)".
//    · Apple, File System Programming Guide — "File System Basics", dated
//      2018-04-09: `~/Library/Application Support` — "Use this directory to
//      store all app data files except those associated with the user's
//      documents… configuration files… All content in this directory should be
//      placed in a custom subdirectory whose name is that of your app's bundle
//      identifier or your company." ⚠️ `~/Library/Preferences` is EXCLUDED BY
//      THAT SAME DOCUMENT — "You should not create files in this directory
//      yourself. Instead, use the NSUserDefaults class" — so a plain JSON file
//      there would be squatting an API's private store.
//
// 🛑 ONE DELIBERATE DIVERGENCE FROM THE XDG SPEC, DECLARED RATHER THAN HIDDEN.
//    The spec says a RELATIVE value "should" be considered invalid and IGNORED;
//    here it is a NAMED REFUSAL. The spec is written for desktop applications
//    that must keep working; this address decides which RULE SET an entire
//    fleet obeys, and silently substituting a directory the environment did not
//    name is the very "two callers, two configs" defect `--ctxroute-config`
//    refuses. Loud beats silent, and the operator can unset the variable.
// ⚠️ UNSET OR EMPTY IS NOT MALFORMED — it is the spec's own wording, and it
//    takes the documented default. Only a value we cannot honour refuses.
const APP_DIR_NAME = 'ctxroute';
const CONFIG_FILE_NAME = 'ctxroute-config.json';
const HOME_SUBJECT = 'the home directory reported by the operating system';

/**
 * A NAMED REFUSAL about the OS-conventional address.
 * 🛑 Never a quiet fallback: the framework would read a configuration out of a
 *    directory nobody named, and look perfectly healthy doing it.
 * @param {string} subject what was read, in words the operator can act on
 * @param {unknown} value
 * @param {string} why
 * @returns {Error}
 */
function refuseConventional(subject, value, why) {
  return new Error(
    `ctxroute REFUSED: ${subject} is ${why} — received ${JSON.stringify(value)}. `
    + 'The OS-conventional per-user configuration file is addressed from it, so a value this '
    + 'framework cannot honour is NEVER replaced by a guess — it would read a configuration out of '
    + 'a directory nobody named, and look healthy doing it. Nothing is resolved at all: correct it, '
    + 'or leave it unset to keep the location this platform documents.'
  );
}

/**
 * One environment variable that names a configuration ROOT.
 * ⚠️ ABSENT or EMPTY ⇒ `undefined`, i.e. the platform's documented default —
 *    the XDG specification says "not set or empty" in exactly those words.
 * @param {Record<string, unknown>} env @param {string} name
 * @param {(p: string) => boolean} isAbsolute
 * @returns {string|undefined}
 */
function configRootFromEnv(env, name, isAbsolute) {
  const raw = env[name];
  if (typeof raw !== 'string' || raw === '') return undefined;
  if (!isAbsolute(raw)) throw refuseConventional(`the environment variable "${name}"`, raw, 'a RELATIVE path');
  return raw;
}

/**
 * The home directory, which every documented default is anchored at.
 * @param {{home: unknown, isAbsolute: (p: string) => boolean}} o
 * @returns {string}
 */
function homeRoot(o) {
  if (typeof o.home !== 'string' || o.home === '') throw refuseConventional(HOME_SUBJECT, o.home, 'not a non-empty string');
  if (!o.isAbsolute(o.home)) throw refuseConventional(HOME_SUBJECT, o.home, 'a RELATIVE path');
  return o.home;
}

/**
 * The OS-conventional per-user configuration file, as PATH SEGMENTS.
 *
 * ⚠️ IT RETURNS SEGMENTS, NOT A PATH, and that is what keeps it PURE: joining
 *    is the platform's job (`path.join` in `paths.js`), and re-implementing a
 *    separator here would be guessing at something `path` already knows.
 * ⚠️ THE PLATFORM AND THE ENVIRONMENT ARE INJECTED, never read: that is what
 *    lets Windows, macOS and Linux all be PROVEN from any host.
 * ⚠️ AN UNKNOWN PLATFORM TAKES THE XDG LANE ON PURPOSE — the specification is
 *    not Linux-only, and every free unix honours it. Refusing there would make
 *    the framework die on a platform it could have served.
 *
 * @param {{platform: unknown, env: Record<string, unknown>, home: unknown,
 *          isAbsolute: (p: string) => boolean}} o
 * @returns {string[]}
 */
function conventionalConfigParts(o) {
  if (o.platform === 'win32') {
    // FOLDERID_RoamingAppData: default path %APPDATA%, and %USERPROFILE%\AppData\Roaming under it.
    const appData = configRootFromEnv(o.env, 'APPDATA', o.isAbsolute);
    if (appData !== undefined) return [appData, APP_DIR_NAME, CONFIG_FILE_NAME];
    return [homeRoot(o), 'AppData', 'Roaming', APP_DIR_NAME, CONFIG_FILE_NAME];
  }
  // Apple: ~/Library/Application Support/<app>/ — NEVER ~/Library/Preferences.
  if (o.platform === 'darwin') return [homeRoot(o), 'Library', 'Application Support', APP_DIR_NAME, CONFIG_FILE_NAME];
  // XDG: $XDG_CONFIG_HOME, defaulting to $HOME/.config when unset or empty.
  const xdg = configRootFromEnv(o.env, 'XDG_CONFIG_HOME', o.isAbsolute);
  if (xdg !== undefined) return [xdg, APP_DIR_NAME, CONFIG_FILE_NAME];
  return [homeRoot(o), '.config', APP_DIR_NAME, CONFIG_FILE_NAME];
}

module.exports = {
  resolveDeclaredDir,
  resolveDeclaredHttp,
  configPathArgument,
  conventionalConfigParts,
  APP_DIR_NAME,
  CONFIG_FILE_NAME,
  STATE_DIR_KEY,
  DOCS_DIR_KEY,
  SESSION_DOCS_DIR_KEY,
  HTTP_KEY,
  HTTP_PORT_ENV,
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  CONFIG_FLAG,
};
