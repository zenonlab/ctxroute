// ═══════════════════════════════════════════════════════════════════════
// harness-conformance.js — THE CONFORMANCE TEST OF A HARNESS (㊾, 15/08/2026)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY: « will it work on their side? » had NO measurable answer —
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
function candidateKeys(toolInput, profil) {
  const p = profil || DEFAULT_PROFILE;
  const connues = new Set([...p.pathKeys, ...p.commandKeys, ...p.contentKeys, 'cwd']);
  const out = new Set();
  const visiter = (v, cle, prof) => {
    if (typeof v === 'string') {
      if (cle && !connues.has(cle) && looksLikePath(v)) out.add(cle);
    } else if (Object(v) === v && prof < 20) {
      for (const [k, x] of Object.entries(v)) visiter(x, Array.isArray(v) ? cle : k, prof + 1);
    }
  };
  visiter(toolInput, null, 0);
  return [...out].sort();
}

/**
 * THE conformance verdict of ONE pre-tool hook payload. PURE.
 * @param {any} payload - the exact JSON the harness sends on stdin (TOTAL:
 *   any shape whatsoever yields a verdict, never a throw — hence `any`, honest).
 * @returns {{verdict:string, requis:Array, degradations:Array, candidateKeys:Array}}
 *   verdict: 'incompatible' (a REQUIRED item is missing) · 'degraded' (every required
 *   item present, at least one optional absent) · 'supported' (everything present).
 *   ⚠️ The verdict VALUES are a CROSS-FILE contract: they are printed and
 *   compared by `tools/doctor.js`, which is outside this module — renaming
 *   them here alone would be two truths. Renamed to English on 16/08/2026
 *   on BOTH sides at once (doctor.js, this module, its test, README).
 */
function conformance(payload) {
  const p = payload || {};
  const requis = [
    { capacite: 'tool_name', present: typeof p.tool_name === 'string' && p.tool_name !== '',
      role: 'the `tool` trigger and the context of `exclude` — without it, no source can target a gesture' },
    { capacite: 'tool_input', present: Object(p.tool_input) === p.tool_input,
      role: 'the ENTIRE universe of matching (match/scope/exclude) — without it, the framework is blind' },
  ];
  const optionnels = [
    { capacite: 'session_id', present: typeof p.session_id === 'string' && p.session_id !== '',
      degradation: 'once/smart cadence per PROCESS instead of per session (more frequent re-injections, never a loss)' },
    { capacite: 'cwd', present: typeof p.cwd === 'string' && p.cwd !== '',
      degradation: 'the « by current directory » skill perimeter is MUTE (an `npm test` launched inside the project does not trigger its skill)' },
    { capacite: 'transcript_path', present: typeof p.transcript_path === 'string' && p.transcript_path !== '',
      degradation: 'the canary (dead-man switch) answers `undecidable` — the framework works but its death would be silent' },
    { capacite: 'agent_id', present: typeof p.agent_id === 'string' && p.agent_id !== '',
      degradation: 'the sub-agents share the master\'s injection state (a `once` consumed by the master deprives the sub-agent)' },
  ];
  const degradations = optionnels.filter((o) => !o.present);
  const verdict = requis.some((r) => !r.present)
    ? 'incompatible'
    : degradations.length > 0 ? 'degraded' : 'supported';
  return {
    verdict,
    requis,
    degradations,
    candidateKeys: candidateKeys(p.tool_input || {}, undefined),
  };
}

module.exports = { conformance, candidateKeys, looksLikePath };
