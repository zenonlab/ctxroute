// ═══════════════════════════════════════════════════════════════════════
// lifecycle-pure.js — WHEN THE DAEMON RUNS, AND WHO STARTS IT.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE QUESTION THIS MODULE ANSWERS (2026-09-29, operator request): a daemon
//    that serves a harness has no reason to exist while no harness runs —
//    WHERE a restart is guaranteed (Linux, macOS: the OS holds the socket). On
//    Windows nothing can guarantee it, so the daemon stays up from login unless
//    the operator opts into `on-demand` (see `resolveMode`). ONE product,
//    ONE setting (`http.lifecycle`), defaults that depend on WHERE it runs —
//    the shape every tool that ships to both (Ollama, Tailscale, PostgreSQL)
//    uses, never two editions.
//
// 🛑 THE STOP IS BY INACTIVITY, NEVER BY COUNTING SESSIONS. Counting open
//    sessions is coordination between PEERS: a session that crashes never says
//    goodbye, so the count lies for ever — either a daemon nobody can stop or
//    one killed under a live session. The industry answer is an idle window
//    (systemd's own bus-activated services exit after a quiet period; Gradle
//    and Bazel daemons do the same), and it needs no registry at all.
//
// 🛑 THE START IS ASKED OF THE OS SUPERVISOR, NEVER DONE BY A HOOK. A hook that
//    spawns the daemon itself is how orphans are born (`http-lane.md`): the
//    harness may kill its hook's process tree, and nothing would supervise the
//    exit-90 restart. On Windows the hook asks Task Scheduler to RUN the task —
//    a no-op when it already runs (`MultipleInstancesPolicy IgnoreNew`), a start
//    when it does not. On Linux and macOS the supervisor already holds the
//    socket, so the first CONNECTION starts the daemon and the hook has nothing
//    to ask: `ensureCommand` answers `null` there, by design.
//
// ⚠️ THIS FILE IS THE ONE PLACE THAT KNOWS WHICH OS DOES WHAT for the
//    lifecycle. Platform names are INPUTS here, never read from `process`, so
//    the three platforms are proven from one host.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/** The closed vocabulary of `http.lifecycle`. */
const MODES = Object.freeze(['auto', 'on-demand', 'login']);
/** Absent ⇒ the framework decides from the environment. */
const DEFAULT_MODE = 'auto';
/**
 * Thirty minutes without a single request before an on-demand daemon leaves.
 *
 * 🔑 LONG ON PURPOSE: a coffee break must not cost a cold start, and a cold
 *    start is never a loss anyway — every prompt asks the supervisor again.
 */
const DEFAULT_IDLE_SECONDS = 1800;
/** A sanity bound, not a measured limit: one day. A typo is refused, not obeyed. */
const MAX_IDLE_SECONDS = 86400;
/**
 * The Windows task the supervisor runs. ONE spelling for the code; the
 * installer's copy is held equal by `test/lifecycle-pure.test.js`.
 */
const WINDOWS_TASK_NAME = 'ctxroute-http';

/**
 * @param {string} key
 * @param {unknown} value
 * @param {string} why
 * @returns {string}
 */
function refusal(key, value, why) {
  return `\`http.${key}\` = ${JSON.stringify(value)} is refused. ${why}`;
}

/**
 * WHICH MODE APPLIES — the declaration, or `auto` resolved on facts.
 *
 * 🔑 `auto` RESOLVES ON WHAT A RESTART DEPENDS ON, NOT ON A GUESS ABOUT THE USER.
 *    Linux and macOS hand the socket to a supervisor, so an idle exit costs
 *    nothing there: the next CONNECTION starts a fresh daemon ⇒ `on-demand`.
 *    Windows has no socket activation: after an idle exit only a harness
 *    session asking Task Scheduler brings the daemon back ⇒ `login`, on every
 *    edition.
 * 🔴 WHY WINDOWS IS `login` AND NOT `on-demand` — MEASURED 2026-09-30, it was
 *    `on-demand` for desktops for one evening. A security suite's "do not
 *    disturb" mode (Avast, rule `PauseSystemBackgroundTasks`, any full-screen
 *    app) DISABLES scheduled tasks while it is active; a live proof in
 *    production stopped the daemon, the session asked Task Scheduler, and the
 *    scheduler REFUSED ("the task is disabled"). A running daemon survives a
 *    disabled task; one that left on idle cannot come back until the suite
 *    lets go. An outage nobody sees costs more than the ~300 MB an idle daemon
 *    holds, so `on-demand` on Windows stays available, never the default.
 * 🛑 AN UNKNOWN VALUE IS A NAMED REFUSAL, never a quiet `auto`: an operator
 *    who typed `ondemand` asked for something, and silently answering with the
 *    default would leave them believing a behaviour they do not have.
 *
 * @param {unknown} declared the raw `http.lifecycle` value
 * @param {{platform: string, osVersion: string}} facts
 * @returns {{mode: string, reason: string, refusal: string|null}}
 */
function resolveMode(declared, facts) {
  const value = declared === undefined || declared === null ? DEFAULT_MODE : declared;
  // ⚠️ NO `typeof` GUARD: `includes` is a strict comparison against strings, so
  //    a non-string is refused by it already — Stryker proved the guard
  //    equivalent (2026-09-29), and an equivalent guard is removed, never frozen.
  if (!MODES.includes(/** @type {string} */ (value))) {
    return {
      mode: '',
      reason: '',
      refusal: refusal('lifecycle', declared, `It must be one of ${MODES.join(', ')}.`),
    };
  }
  if (value !== 'auto') {
    return { mode: /** @type {string} */ (value), reason: 'declared in the configuration', refusal: null };
  }
  if (facts.platform === 'win32') {
    return {
      mode: 'login',
      reason: `auto: on Windows (${facts.osVersion}) nothing holds the socket and third parties can pause `
        + 'Task Scheduler, so the daemon stays up from login',
      refusal: null,
    };
  }
  return {
    mode: 'on-demand',
    reason: `auto: on ${facts.platform} the supervisor holds the socket, so an idle exit costs nothing`,
    refusal: null,
  };
}

/**
 * HOW LONG A QUIET DAEMON WAITS BEFORE LEAVING, in milliseconds.
 *
 * @param {unknown} declared the raw `http.idleSeconds` value
 * @returns {{ms: number, refusal: string|null}}
 */
function idleWindow(declared) {
  if (declared === undefined || declared === null) {
    return { ms: DEFAULT_IDLE_SECONDS * 1000, refusal: null };
  }
  if (!Number.isInteger(declared)) {
    return { ms: 0, refusal: refusal('idleSeconds', declared, 'It must be a whole number of seconds.') };
  }
  const seconds = /** @type {number} */ (declared);
  if (seconds < 1 || seconds > MAX_IDLE_SECONDS) {
    return {
      ms: 0,
      refusal: refusal('idleSeconds', declared, `It must lie between 1 and ${MAX_IDLE_SECONDS}.`),
    };
  }
  return { ms: seconds * 1000, refusal: null };
}

/**
 * WHETHER A QUIET WINDOW REALLY WAS QUIET.
 *
 * 🔑 THE ACTIVITY IS A COUNTER, NEVER A TIMESTAMP: every request of every
 *    thread bumps it, and the window closes on EQUALITY. Nothing compares
 *    clocks, so a clock change cannot make a busy daemon leave.
 * ⚠️ Only `on-demand` ever asks — a `login` daemon never arms the window.
 *
 * @param {number} seenAtArm the counter when the window opened
 * @param {number} seenNow the counter when it closes
 * @returns {'exit'|'rearm'}
 */
function idleVerdict(seenAtArm, seenNow) {
  return seenAtArm === seenNow ? 'exit' : 'rearm';
}

/**
 * WHAT A SESSION ASKS THE OS SUPERVISOR, so the daemon is up when it is needed.
 *
 * 🛑 `null` IS AN ANSWER, NOT A GAP: on Linux and macOS the supervisor owns
 *    the socket, and the first connection is what starts the daemon. Asking it
 *    anything more would be a second mechanism for one job.
 * ⚠️ Asked in BOTH modes on Windows: in `login` it is the safety net for a
 *    daemon that never came up (a task paused at logon by a third party), and
 *    on a running task it costs one no-op (~60 ms measured 2026-09-29).
 *
 * @param {string} platform
 * @returns {{file: string, args: string[]}|null}
 */
function ensureCommand(platform) {
  if (platform !== 'win32') return null;
  return { file: 'schtasks', args: ['/run', '/tn', WINDOWS_TASK_NAME] };
}

/**
 * HOW TO ASK THE SUPERVISOR FOR THE DAEMON'S DEFINITION — the doctor's probe.
 *
 * ⚠️ `/xml` because the XML is LANGUAGE-NEUTRAL: the table and list formats of
 *    `schtasks` print a LOCALISED status ("Prêt", "Désactivé"…), and a verdict
 *    built on a translated word breaks on every machine in another language.
 *    Measured 2026-09-29: the XML comes back as UTF-8 on stdout.
 * @param {string} platform
 * @returns {{file: string, args: string[]}|null} `null` where no probe exists
 */
function supervisorQuery(platform) {
  if (platform !== 'win32') return null;
  return { file: 'schtasks', args: ['/query', '/tn', WINDOWS_TASK_NAME, '/xml'] };
}

/**
 * WHETHER THE SUPERVISOR CAN START THE DAEMON AT ALL — tri-state, never a guess.
 *
 * 🔴 BORN OF A MEASURED OUTAGE (2026-09-29): a third-party "do not disturb"
 *    mode paused every scheduled task while an application was full screen,
 *    the machine rebooted inside such a pause, the logon trigger met a disabled
 *    task, and the daemon never started — while every diagnostic stayed green.
 *    A disabled task is a FACT the scheduler states in its own XML, so the
 *    verdict reads that fact instead of inferring anything from a port.
 * ⚠️ ONLY `<Settings><Enabled>` COUNTS: triggers carry an `<Enabled>` of their
 *    own, and reading the first one in the document would judge a trigger.
 *    Absent inside `<Settings>` means ENABLED — the Task Scheduler schema's
 *    default.
 * 🛑 On Linux and macOS this is `unmeasured`, SAID, never `armed`: no probe of
 *    those supervisors exists here yet, and "I could not measure" is never
 *    "it is healthy".
 * ⚠️ NO TASK IS `unmeasured`, NOT `disarmed`: a CI runner, or an adopter who
 *    supervises the daemon another way, has no such task, and the scheduler's
 *    refusal is LOCALISED text this module cannot tell apart from an access
 *    error. What it CAN state without guessing is the case that hurt — a task
 *    that exists and is disabled.
 *
 * @param {string} platform
 * @param {string|null} taskXml the task definition as the scheduler exports
 *   it, or `null` when the scheduler returned none
 * @returns {{verdict: 'armed'|'disarmed'|'unmeasured', reason: string}}
 */
function supervisorVerdict(platform, taskXml) {
  if (platform !== 'win32') {
    return { verdict: 'unmeasured', reason: `no supervisor probe exists for ${platform} yet` };
  }
  if (taskXml === null) {
    return {
      verdict: 'unmeasured',
      reason: `the scheduler returned no task "${WINDOWS_TASK_NAME}" — if the daemon is supervised another way, `
        + 'nothing here can judge it (service/install-windows.ps1 registers it)',
    };
  }
  // ⚠️ The end is searched AFTER the start: a closing tag before the opening
  //    one is no block at all, and asking for it from `open` makes that case
  //    the same "not found" as a missing tag — one condition, no impossible
  //    branch for a mutant to hide in.
  const open = taskXml.indexOf('<Settings>');
  const close = open === -1 ? -1 : taskXml.indexOf('</Settings>', open);
  if (close === -1) {
    return { verdict: 'unmeasured', reason: 'the task definition carries no <Settings> block' };
  }
  const settings = taskXml.slice(open, close);
  if (settings.includes('<Enabled>false</Enabled>')) {
    return {
      verdict: 'disarmed',
      reason: `the scheduled task "${WINDOWS_TASK_NAME}" is DISABLED — nothing can start the daemon. `
        + 'A security suite\'s "do not disturb" / game mode pausing scheduled tasks is a known cause '
        + '(README, "Known issues"); re-enable the task and exempt it there.',
    };
  }
  return { verdict: 'armed', reason: `the scheduled task "${WINDOWS_TASK_NAME}" is enabled` };
}

/**
 * WHAT THE USER IS TOLD, AT THE PROMPT, WHEN THE SUPERVISOR COULD NOT START THE DAEMON.
 *
 * 🔴 WHY IT EXISTS (2026-09-30): the session-start doctor names a disabled task,
 *    but a task disabled MID-SESSION (a security suite's game mode) left the
 *    agent working without its knowledge and the user seeing nothing. The ensure
 *    hook runs at EVERY prompt, so it is the one place that can say it live.
 * 🛑 IT SPEAKS ONLY ON A FACT, NEVER ON A GUESS: the request must have FAILED
 *    (non-zero status) AND the scheduler's own XML must say DISABLED. A failed
 *    request with no task, or an unreadable definition, stays SILENT — an
 *    adopter supervising the daemon another way must never be nagged.
 * ⚠️ A NOTICE, NEVER A DECISION: the shell emits `{systemMessage}` alone, which
 *    blocks nothing and injects nothing into the agent's context.
 *
 * 🔴 AND THE DAEMON MUST BE DOWN — MEASURED THE HARD WAY (2026-09-30): the
 *    first version spoke on a disabled task alone, and a live proof showed the
 *    daemon ANSWERING while the notice claimed agents were working blind. A
 *    disabled task does not stop a daemon already running, and a security suite
 *    disables it at every screenshot: that notice would have lied several times
 *    a day. `daemonRefused` is the KERNEL's answer (a refused connection),
 *    never an inference; `null` (could not ask, or an unexpected error) is
 *    silence.
 *
 * @param {number|null} runStatus the supervisor request's exit status
 * @param {{verdict: string, reason: string}} supervisor `supervisorVerdict`'s answer
 * @param {boolean|null} daemonRefused true only when the kernel REFUSED a
 *   connection to the daemon's declared address
 * @returns {string|null}
 */
function ensureNotice(runStatus, supervisor, daemonRefused) {
  if (runStatus === 0) return null;
  if (daemonRefused !== true) return null;
  if (supervisor.verdict !== 'disarmed') return null;
  return `ctxroute: the daemon could not be started — ${supervisor.reason} `
    + 'Until then, agents act WITHOUT the knowledge ctxroute delivers.';
}

module.exports = {
  MODES,
  DEFAULT_MODE,
  DEFAULT_IDLE_SECONDS,
  MAX_IDLE_SECONDS,
  WINDOWS_TASK_NAME,
  resolveMode,
  idleWindow,
  idleVerdict,
  ensureCommand,
  supervisorQuery,
  supervisorVerdict,
  ensureNotice,
};
