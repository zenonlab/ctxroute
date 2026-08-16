#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// CANARY SHELL — reads the REAL transcript, writes an out-of-band verdict.
// ═══════════════════════════════════════════════════════════════════════
//
// Wired on UserPromptSubmit: once per user TURN, never per tool call.
// ⚠️ That choice is a COST choice, measured: a node spawn costs ~330 ms on the
// maintainer's machine; per tool call, this canary would double the bill for
// information that only changes at session scale. NEVER move it to PreToolUse.
//
// ⚠️ MUTE BY CONTRACT (EMPTY stdout, exit 0 ALWAYS). On UserPromptSubmit,
//    stdout is injected into the context and an exit ≠ 0 BLOCKS the user's
//    prompt. A failure witness that blocks work would be worse than the
//    failure. It speaks through its FILE, never through its output.
//
// ⚠️ FULL FAIL-OPEN, with one nuance that matters: on error we write NOTHING
//    (we leave the previous verdict). Writing "alive" on an error would
//    manufacture green — exactly the "green that lies".
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ DEADLINE ARMED BEFORE ANY I/O — an obligation of EVERY shell in this repo
//    (sealed by `deadline-gate`). A hook reading stdin can hang forever if the
//    harness never writes: it would then block the user's prompt. Forgotten
//    here on 03/08/2026, caught by the gate.
require('../deadline').arm();

const fs = require('fs');
const path = require('path');
const canari = require('../canary');
const emission = require('../emission-core');
const lib = require('../lib-pure');
const paths = require('../paths');
const { readStdinJson } = require('../stdin-json');

// ⚠️ THIS SHELL IS COMMON TO BOTH HARNESSES — there is NO dialect left to
//    declare (07/08/2026, Codex port). It used to carry
//    `MARQUE_APPEL_CLAUDE = '"type":"tool_use"'`, the pattern by which Claude
//    Code records a tool call in its transcript, and porting the canary meant
//    guessing the equivalent in the other product.
// 🛑 THAT PLAN WAS ABANDONED ON DOCUMENTARY PROOF, not by taste.
//    Official Codex hooks doc (learn.chatgpt.com/docs/hooks, read on
//    07/08/2026): « the transcript format isn't a stable interface for hooks
//    and may change over time ». The backlog planned to look for
//    `response_item`/`custom_tool_call`: that was reverse-engineering a format
//    the vendor reserves the right to break — hence a canary that would have
//    died silently at the first update. A dead-man switch that dies without
//    saying so is WORSE than no dead-man switch.
// ✅ The denominator now comes from `emission-core.emissionCount`: OUR data,
//    identical on every harness. What we still look for in the transcript is
//    ONLY our own `[source:` mark — a substring, never a schema field.
// ⚠️ WHAT MAKES THE SHARING LEGITIMATE — VERIFIED IN BOTH OFFICIAL DOCS, not
//    deduced (07/08/2026). Claude Code (`code.claude.com/docs/en/hooks`) AND
//    Codex (`learn.chatgpt.com/docs/hooks`) both document, as COMMON input
//    fields: `transcript_path` (« Path to conversation JSON ») and
//    `session_id`. And on the Claude side the output contract explicitly allows
//    silence: « Exit 0 means success […] For most events, stdout is written to
//    the debug log but not shown ». A harness differing on any of these three
//    points would require a shell — never an `if` here.
//
// ⚠️ FACT DISCOVERED WHILE VERIFYING, AND IT MATTERS: the transcript is written
//    ASYNCHRONOUSLY. Claude doc, verbatim: « The transcript file is written
//    asynchronously and may lag the in-memory conversation, so it may not yet
//    include the current turn's most recent messages when a hook fires ».
//    ⇒ an injection that just landed may NOT be in the file yet. That is
//    HARMLESS HERE, and one must understand why before touching the threshold:
//    the lag concerns the LAST messages of a turn, whereas we require 25
//    EMISSIONS and read 2 MB of history. The offset is absorbed by the sample.
// 🛑 THIS FACT FORBIDS AN "IMPROVEMENT" THAT WOULD SEEM OBVIOUS: lowering the
//    threshold to 1 or 2, or looking only at the current turn. We would then be
//    reading a lagging transcript and crying the death of a perfectly live
//    channel. The threshold is not caution, it is what makes reading an
//    asynchronous file DECIDABLE.

// ⚠️ STABLE and unique path: the statusline reads it without knowing anything
//    about the framework. Putting it anywhere else would duplicate a path
//    truth.
function healthPath() {
  return path.join(paths.stateDir(), 'canary.json');
}

// BOUNDED read of the transcript's tail. ⚠️ Never `readFileSync` on the whole
// file: 104 MB measured in this fleet (see canary.js).
function readQueue(fichier) {
  const st = fs.statSync(fichier);
  const taille = Math.min(canari.BYTE_WINDOW, st.size);
  if (taille === 0) return '';
  const fd = fs.openSync(fichier, 'r');
  try {
    const buf = Buffer.alloc(taille);
    fs.readSync(fd, buf, 0, taille, st.size - taille);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function run(data) {
  const transcript = data && typeof data.transcript_path === 'string' ? data.transcript_path : '';
  // No transcript = a harness that does not expose it ⇒ the canary KEEPS QUIET.
  // ⚠️ EXPLICIT DEGRADATION, never a failure: this witness is specific to
  //    Claude Code. A harness without a transcript keeps the whole rest of the
  //    framework — it only loses THIS net, and it loses it in ASSUMED silence
  //    (nothing to report to the user of another product).
  if (!transcript) return;

  const extrait = readQueue(transcript);
  const injections = canari.countInjections(extrait);
  // ⚠️ SAME SCOPE KEY AS THE GATE (`lib.scopeId`, SINGLE SOURCE): the emissions
  //    counter is written by `emission-core` under that key. Composing it
  //    differently here would read a counter that does not exist — hence a
  //    denominator of 0, hence a canary eternally `undecidable`: mute, green,
  //    and perfectly useless. That is the most dangerous failure mode of a
  //    dead-man switch, and nothing but the doctor's probe would see it.
  const scopeId = lib.scopeId(data.session_id, data.agent_id);
  const emissions = emission.emissionCount(scopeId);
  const v = canari.verdict(emissions, injections);

  // ⚠️ VERDICT OBSERVABILITY (09/08/2026) — born from a REAL incident: the
  //    canary displayed "dead injection" while EVERYTHING was injecting (240
  //    labels and 95 injection events in its own reading window, and the other
  //    agents were receiving their docs). Replayed afterwards: "alive". NOT
  //    REPRODUCED.
  // 🛑 AND IT WAS IMPOSSIBLE TO KNOW WHY: the verdict did not say WHICH file
  //    had been read, nor how much of it. A dead-man switch that accuses
  //    without leaving a trace of its observation is UNAUDITABLE — at the next
  //    incident we would start from scratch, exactly as that day.
  // ⚠️ THESE FIELDS ARE A LOG, NOT AN INPUT: the engine NEVER reads them back.
  //    Letting them enter a decision would make them a 2nd truth.
  // ⚠️ FREE BY CONSTRUCTION: they travel in a write that already existed —
  //    zero extra I/O, zero lock, and nothing on the hot path (this hook runs
  //    when a prompt is sent, never per tool call).
  // 🛑 `transcript` carries a user path: this file lives under `state/`, which
  //    is GITIGNORED. NEVER move this log to a git-tracked path — the repo is
  //    public.
  let tailleTranscript = -1;
  try { tailleTranscript = fs.statSync(transcript).size; } catch { /* -1 = not measurable, never 0 (0 is a REAL size) */ }

  const dossier = paths.stateDir();
  fs.mkdirSync(dossier, { recursive: true });
  // ATOMIC write (tmp + rename): the statusline reads this file continuously;
  // a half-written JSON would make it display anything.
  const tmp = healthPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    verdict: v,
    emissions,
    injections,
    horodatage: Date.now(),
    // ── observation log, for the post-mortem ──
    transcript,
    tailleTranscript,
    octetsLus: tailleTranscript < 0 ? -1 : Math.min(canari.BYTE_WINDOW, tailleTranscript),
    scope: scopeId,
  }));
  fs.renameSync(tmp, healthPath());
}

/* istanbul ignore next — entry shell, proven by a real spawn */
if (require.main === module) {
  readStdinJson(
    (data) => {
      try { run(data); } catch { /* fail-open: we leave the previous verdict */ }
      process.exit(0);
    },
    () => process.exit(0)
  );
}

module.exports = { run, healthPath, readQueue };
