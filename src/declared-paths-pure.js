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
  const i = o.argv.indexOf(CONFIG_FLAG);
  if (i < 0) return undefined;
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
  configPathArgument,
  conventionalConfigParts,
  APP_DIR_NAME,
  CONFIG_FILE_NAME,
  STATE_DIR_KEY,
  DOCS_DIR_KEY,
  SESSION_DOCS_DIR_KEY,
  CONFIG_FLAG,
};
