// ═══════════════════════════════════════════════════════════════════════
// harness-conformance.js — THE CONFORMANCE TEST OF A HARNESS (㊾, 15/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY: "will it work on their side?" had NO measurable answer —
//    a port is PROVEN at the adopter's, never at ours. This module returns the
//    verdict an adopter obtains BY RUNNING `doctor.js --harnais` on a
//    REAL payload captured from THEIR harness: supported / degraded (named points) /
//    incompatible. Never a binary yes-no.
//
// 📐 WHAT A PAYLOAD CAN PROVE, AND NOTHING MORE (honesty of the perimeter):
//    the PRESENCE of the contract's fields. It CANNOT prove that the context
//    channel is CONSUMED by the model — only the CANARY sees that, at
//    the adopter's, in real use. The report SAYS so instead of promising it.
//
// ⚠️ THE CONTRACT (published in docs/framework/HARNESS-CONTRACT.md):
//    REQUIRED — a pre-tool event · `tool_name` (non-empty string) ·
//               `tool_input` (JSON object) · a context channel (declarative).
//    OPTIONAL, each absence = a NAMED DEGRADATION, never a failure:
//               `session_id` (without it: once/smart cadence per PROCESS, not
//               per session) · `cwd` (without it: per-directory skill perimeter
//               mute) · `transcript_path` (without it: canary undecidable) ·
//               `agent_id` (without it: sub-agents share the master's state).
//
// ⚠️ DIAGNOSIS OF THE PATH KEYS (tail of 51): the profile never GUESSES
//    that a key designates a path (a heuristic in a trigger = forbidden).
//    But a DIAGNOSIS is allowed to SUGGEST: any key unknown to the profile
//    whose value HAS THE SHAPE of a path is NAMED as a candidate — it is
//    the adopter who decides, by adding the key to `pathKeys` if they recognise it.
//    Without this report, an exotic key degraded the matching SILENTLY.
//
// ⚠️ PURE: zero I/O, zero dialect — consumed by doctor.js (I/O) and the tests.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { DEFAULT_PROFILE } = require('./harness-profile.js');

// Does a value HAVE THE SHAPE of a path? DIAGNOSIS ONLY — never a
// matching decision (the exact boundary that ㊽/51 refused to cross).
function looksLikePath(v) {
  if (typeof v !== 'string' || v.length < 3) return false;
  if (/\s/.test(v)) return false; // a sentence is not a path
  return /[\\/]/.test(v);
}

// Keys of the payload (at any depth) whose value looks like a path and
// that the profile does not know — the CANDIDATES for `pathKeys`, named once.
function candidateKeys(toolInput, profile) {
  const p = profile || DEFAULT_PROFILE;
  // ⚠️ NO literal `'cwd'` here: the profile DECLARES it as a path key since 19/08/2026, so
  //    adding it by hand would be redundant — hence an EQUIVALENT MUTANT (removing it
  //    changes no verdict). It survived in CI while the local run, using the incremental
  //    Stryker cache, reported 100 %: this file had not changed, only `harness-profile.js`
  //    had, and the cache did not invalidate its DEPENDENTS. 🛑 A dependency change makes
  //    the incremental cache LIE — trust only a cacheless run, or the CI clone.
  const known = new Set([...p.pathKeys, ...p.commandKeys, ...p.contentKeys]);
  const out = new Set();
  const visiter = (v, key, prof) => {
    if (typeof v === 'string') {
      if (key && !known.has(key) && looksLikePath(v)) out.add(key);
    } else if (Object(v) === v && prof < 20) {
      for (const [k, x] of Object.entries(v)) visiter(x, Array.isArray(v) ? key : k, prof + 1);
    }
  };
  visiter(toolInput, null, 0);
  return [...out].sort();
}

/**
 * THE conformance verdict of ONE pre-tool hook payload. PURE.
 * @param {any} payload - the exact JSON the harness sends on stdin (TOTAL:
 *   any shape whatsoever yields a verdict, never a throw — hence `any`, honest).
 * @returns {{verdict:string, required:Array, degradations:Array, candidateKeys:Array}}
 *   verdict: 'incompatible' (a REQUIRED item is missing) · 'degraded' (every required
 *   item present, at least one optional absent) · 'supported' (everything present).
 *   ⚠️ The verdict VALUES are a CROSS-FILE contract: they are printed and
 *   compared by `tools/doctor.js`, which is outside this module — renaming
 *   them here alone would be two truths. Renamed to English on 16/08/2026
 *   on BOTH sides at once (doctor.js, this module, its test, README).
 */
function conformance(payload) {
  const p = payload || {};
  const required = [
    { capability: 'tool_name', present: typeof p.tool_name === 'string' && p.tool_name !== '',
      role: 'the `tool` trigger and the context of `exclude` — without it, no source can target a gesture' },
    { capability: 'tool_input', present: Object(p.tool_input) === p.tool_input,
      role: 'the ENTIRE universe of matching (match/scope/exclude) — without it, the framework is blind' },
  ];
  const optional = [
    { capability: 'session_id', present: typeof p.session_id === 'string' && p.session_id !== '',
      degradation: 'once/smart cadence per PROCESS instead of per session (more frequent re-injections, never a loss)' },
    { capability: 'cwd', present: typeof p.cwd === 'string' && p.cwd !== '',
      degradation: 'the "by current directory" skill perimeter is MUTE (an `npm test` launched inside the project does not trigger its skill)' },
    { capability: 'transcript_path', present: typeof p.transcript_path === 'string' && p.transcript_path !== '',
      degradation: 'the canary (dead-man switch) answers `undecidable` — the framework works but its death would be silent' },
    { capability: 'agent_id', present: typeof p.agent_id === 'string' && p.agent_id !== '',
      degradation: 'the sub-agents share the master\'s injection state (a `once` consumed by the master deprives the sub-agent), and no `role:` category is derived (a doc restricted to the main agent or to sub-agents reaches nobody)' },
    { capability: 'agent_type', present: typeof p.agent_type === 'string' && p.agent_type !== '',
      degradation: 'no `type:` category is derived for a sub-agent (a doc restricted to one agent type reaches nobody, a `-type:` exclusion excludes everyone — fail-closed, never a leak)' },
  ];
  const degradations = optional.filter((o) => !o.present);
  const verdict = required.some((r) => !r.present)
    ? 'incompatible'
    : degradations.length > 0 ? 'degraded' : 'supported';
  return {
    verdict,
    required,
    degradations,
    candidateKeys: candidateKeys(p.tool_input || {}, undefined),
  };
}

/**
 * NUMERIC FIELDS THAT LOOK LIKE A CONTEXT MEASUREMENT, anywhere in a hook payload — the
 * DIAGNOSTIC that sees the day a harness starts sending its context fill to hooks (option
 * `wrapUp`, 2026-10-04). Codex's hook inputs carry no token count today; the day one appears,
 * `doctor --harness` NAMES it here, and wiring a sensor for that harness becomes a data edit.
 * 🛑 A DIAGNOSTIC SUGGESTS, IT NEVER WIRES: a name-shaped guess is admissible here precisely
 *    because nothing acts on it — the adopter reads it and decides (same rule as `candidateKeys`).
 * @param {any} payload
 * @returns {string[]} dotted paths, sorted
 */
function contextCandidateKeys(payload) {
  const out = new Set();
  const visit = (v, at, depth) => {
    if (typeof v === 'number') {
      if (Number.isFinite(v) && /token|context|window/i.test(at)) out.add(at);
    } else if (Object(v) === v && !Array.isArray(v) && depth < 20) {
      for (const [k, x] of Object.entries(v)) visit(x, at === '' ? k : `${at}.${k}`, depth + 1);
    }
  };
  visit(payload, '', 0);
  return [...out].sort();
}

/**
 * Which harness can run the `wrapUp` option, and why not — read from the profile's DATA.
 * A sensor is DECLARED as an object (`{ kind, event }`); anything else — the
 * profile's `ABSENT` marker included, which is a string — means no sensor. One
 * test, no comparison to the marker: that comparison was redundant, hence an
 * equivalent mutant by construction.
 * @param {Object<string, {sensor: *}>} wrapUpProfile  `harness-profile.WRAP_UP`
 * @returns {{harness: string, supported: boolean, sensor: string}[]}
 */
function wrapUpSupport(wrapUpProfile) {
  return Object.keys(wrapUpProfile).map((harness) => {
    const sensor = wrapUpProfile[harness].sensor;
    const supported = Object(sensor) === sensor;
    return { harness, supported, sensor: supported ? `${sensor.kind} (${sensor.event})` : 'none' };
  });
}

module.exports = { conformance, candidateKeys, looksLikePath, contextCandidateKeys, wrapUpSupport };
