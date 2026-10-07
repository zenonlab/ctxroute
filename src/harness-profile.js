'use strict';
// ═══════════════════════════════════════════════════════════════════════
// harness-profile.js — THE HARNESS DIALECT, IN A SINGLE PLACE
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS FILE IS **DATA**, NOT CODE. Zero logic, zero I/O,
//    zero dependency. It exists so that a port is a DATA EDIT
//    and never a modification of the engine.
//
// 🔴 WHY IT EXISTS (audit of 14/08/2026, measured). The porting contract
//    declares "ABSOLUTELY FORBIDDEN to modify `sources/` for a port", and
//    `sources-must-not-know-the-harness` is supposed to guarantee it. **That gate
//    only looks at the IMPORTS** (dependency-cruiser): it cannot see a
//    LITERAL. Measured result: `sources/file.js` carried 4 hard-coded dialects
//    (`'Bash'`, `apply_patch`, `file_path`, `remotePath`) — and `apply_patch` is
//    a **Codex** name, so the leak had ALREADY happened, without a single test flinching.
//    ⇒ An invariant that is ASSERTED but not GUARDED is not an invariant.
//
// ⚠️ WHAT IS **NOT** HERE, AND IT IS DELIBERATE — what we DETECT instead
//    of listing it. A list only knows the past; a shape covers the future.
//
//    ▸ SHELL TOOLS: NO list. We look at whether the gesture carries a
//      `command` parameter. **MEASURED on 7,553 real tool calls
//      (14/08/2026)**: 4 tools carry a `command` — `Bash`, `PowerShell`,
//      `mcp__ssh__ssh_exec`, `mcp__infra__infra_call` — and **all 4 are shell
//      commands, zero exception**. The test BY NAME (`toolName === 'Bash'`)
//      therefore made **809 commands out of 4,396 (18 %) invisible** to the trigger:
//      all of PowerShell and all of SSH. On a Windows machine, that is the main shell.
//
//    ▸ MCP TOOLS: no list either (the MCP channel is triggered by the
//      PATH of its doc, `tool: ["*"]` covers those that do not exist yet).
//
// 🛑 AND WHAT WE DO **NOT** DETECT BY SHAPE, with its reason — the symmetry
//    matters as much as the rule:
//
//    ▸ THE PATCH stays identified by the TOOL NAME. Detecting it by its marker
//      (`*** Update File:`) would be a trap: that marker can live INSIDE THE
//      CONTENT of a file — a doc that talks about `apply_patch`, for instance —
//      and we would extract phantom paths. **A tool name does not lie; a
//      content does.** (Maintainer's objection, 14/08/2026: it was right.)
//
//    ▸ THE PATH KEYS stay a LIST, because "this parameter designates a
//      path" is a **semantics**, not a shape. 🛑 Guessing by the NAME
//      (`path`/`file`/`dir`) has been RULED OUT: it is an **anglophone** convention,
//      and this framework targets international distribution — a server exposing
//      `dateipfad` or `chemin_fichier` would make the rule SILENTLY blind,
//      that is to say exactly the defect it claims to repair. A heuristic
//      in the TRIGGER (the only operator that CREATES an injection) is also
//      the first thing an external auditor will attack.
//
// ⚠️ EXTENDING = adding an entry here, **never** a line of engine. The default
//    values come from the DOCUMENTED hook contracts (Claude Code, Codex):
//    doc-first, like any data about a third party.
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_PROFILE = {
  // Parameters that DESIGNATE a path. Documented contract of the harnesses.
  // ⚠️ `cwd` IS HERE SINCE 19/08/2026 — it used to be pushed as a SPECIAL CASE inside
  //    `extractFilePaths`, hence OUTSIDE every key universe. Consequence measured that
  //    day: `keys` could not reach it, in EITHER form (`["-cwd"]` inert, a whitelist
  //    inert too), while the operator's whole contract is "which parameter keys are
  //    visible". So the one parameter that distinguishes "I am WORKING here" from "I am
  //    QUOTING it" was the one it could not address — the very distinction `keys` was
  //    written for. A capability that stops at an undeclared boundary is the class this
  //    file exists to abolish: the dialect is DATA, and a hard-coded exception is not data.
  // ⚠️ Default behaviour UNCHANGED (`cwd` was already a candidate); what changes is that
  //    it is now DECLARED, hence narrowable like the rest. Supplied only by `sources/skill.js`.
  pathKeys: ['file_path', 'remotePath', 'path', 'cwd'],
  // Tools whose PAYLOAD IS a patch (paths inside the text).
  // `apply_patch` = Codex CLI ≥ 0.144 (official doc re-read on 19/07/2026).
  patchTools: ['apply_patch'],
  // Parameters that carry a SHELL COMMAND. ⚠️ The harness names the TOOL however
  //    it wants (`Bash`, `PowerShell`, `mcp__ssh__ssh_exec`…) but the PARAMETER is
  //    stable — that is what we read, never the tool name (㊽). A harness that
  //    called it `cmd`/`script` adds an entry HERE, zero line of engine.
  commandKeys: ['command'],
  // 🛑 THE FACTS WE **DERIVE** ARE NOT HERE, AND THAT IS THE ARCHITECTURE (2026-08-20).
  //    This file is the HARNESS DIALECT: the names a third party actually sends. A derived
  //    observable — the directory a `cd X && …` designates, the paths it reconstructs — is
  //    OURS: no harness sends it, we compute it from what it does send. Two different kinds
  //    of fact, two files: `derived-observables.js` holds the registry (name + source key
  //    family + derivation), this one holds the dialect.
  // 🔴 THEY LIVED HERE FOR ONE EVENING, as two scalar fields, and the cost showed up
  //    immediately: the engine grew ONE BRANCH PER FIELD, and so would the independent model
  //    and every judge. A third fact would have made that a pattern. **The universe of the
  //    language is the harness's facts ∪ our derivations** — declared in two places because
  //    they have two different authorities, never enumerated in one hand-written list.
  // 🛑 **PAYLOAD** PARAMETERS — they TRANSPORT content, they DESIGNATE
  //    nothing. Removed from the universe of BOTH filters (`scope` AND `exclude`, never
  //    one without the other: their duality is the theorem of ㊼).
  // 🔴 REASON, MEASURED on 7,129 real gestures (㊿): **55 exclusions were
  //    decided SOLELY by content** — you write a test file whose
  //    text mentions `node_modules`, and the doc of the test conventions DISAPPEARS,
  //    silently, exactly when it is useful. It was the last MUTE defect of the language.
  // ⚠️ **STRICT** LIST, arbitrated on measurement: `description`/`caption`/`prompt`
  //    are EXCLUDED from it. Those are statements ABOUT the gesture (the agent describes what it
  //    does), hence legitimately a projection of the gesture; putting them in cost
  //    6 more docs without recovering anything (measured: +55/-13 against +55/-19).
  // ⚠️ ACCEPTED PRICE: 13 docs whose `scope` was only satisfied by the text
  //    that was written. That is SEMANTICALLY right — a filter qualifies the GESTURE, not
  //    the prose one types; the injection rested on a coincidence of words.
  contentKeys: ['old_string', 'new_string', 'content', 'body'],
};

// ═══════════════════════════════════════════════════════════════════════
// WHAT A HARNESS IMPOSES WHEN WE DECLARE NOTHING — the default, as DATA
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS IS **NOT** HERE SO THAT WE ADAPT TO IT. It is here so that
//    OVERRIDING a harness default becomes a VISIBLE GESTURE — a number written
//    next to the number it replaces — instead of a silence nobody can read. A
//    wiring that declares no timeout is not "the safe choice": it is a choice
//    the harness made for us, and until today that choice was invisible in
//    every file of this repository.
//
// 🛑 AND IT EXISTS SO THE **NEXT HARNESS IS FORCED TO ANSWER THE QUESTION**
//    instead of suffering it. Porting means filling an entry here; an entry
//    that cannot be filled is a MEASUREMENT that was never taken, and it must
//    say so (`UNMEASURED`) rather than borrow a neighbour's number. A default
//    inherited by accident is exactly the class this whole file abolishes.
//
// ⚠️ **AN ABSENT LANE IS AN ABSENCE, NEVER A VALUE.** Codex 0.146.0 has NO
//    `http` handler at all (*"Only `type:\"command\"` handlers run today"*), so
//    its `http` default is not zero, not null, not infinity: the lane does not
//    exist. Written `ABSENT`, so that a reader who confuses "no such lane" with
//    "no such timeout" is confronted with a word instead of an `undefined`.
//    ⚠️ A consumer therefore checks `typeof v === 'number'` FIRST; anything else
//    is a fact ABOUT the harness, never a duration to compute with.
//
// 📐 SOURCE, DATED: official hook contracts — `code.claude.com/docs/en/hooks`
//    read 2026-08-22 for Claude Code, and the Codex 0.146.0 hooks documentation
//    for the absent lane. Doc-first, like every fact about a third party.
//    UNIT = SECONDS everywhere (what both harnesses' wirings take).
//
// ⚠️ These facts live OUTSIDE `DEFAULT_PROFILE` on purpose: that object is the
//    MATCHING dialect (parameter names the language reads), it is flattened
//    into a vocabulary of strings and its shape is sealed key by key. A
//    duration is not a word of that vocabulary. Two kinds of fact about the
//    same third party, one file, two structures — never one bag.

/** The lane does not exist on this harness: there is no default to override. */
const ABSENT = 'absent';
/** The lane exists and nobody has measured its default yet. Say so, never guess. */
const UNMEASURED = 'unmeasured';

const HOOK_TIMEOUT_DEFAULTS = {
  claudeCode: {
    // A handler declared without a timeout runs under these, in SECONDS.
    command: 60,
    // ⚠️ TEN MINUTES. The `http` lane's default is an order of magnitude above
    //    the spawn lane's, which is precisely why a declared bound matters more
    //    there, not less: the quieter a default, the longer a hang lasts.
    http: 600,
    // Events whose default is LOWER than the handler default above. An event
    // absent from here inherits the handler's number.
    events: { UserPromptSubmit: 30, MessageDisplay: 10 },
  },
  codex: {
    command: UNMEASURED,
    http: ABSENT,
    events: {},
  },
};

// ═══════════════════════════════════════════════════════════════════════
// HOW MANY CHARACTERS ONE HOOK OUTPUT MAY CARRY — a MEASURED harness fact
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE NUMBER THAT WAS TRUE AND STOPPED BEING TRUE. Claude Code truncated a
//    hook's output at ~10,000 characters: DOCUMENTED by a user in issue #70460
//    (2026-06-23, v2.1.181 — "silently truncated to 10KB", closed NOT PLANNED),
//    and `budget.md` recorded it as re-verified on 2026-08-08. The whole
//    32-frame architecture exists to work AROUND it.
// ✅ MEASURED AGAIN 2026-08-31 ON THE REAL HARNESS (v2.1.251): ONE `type:"http"`
//    PreToolUse hook returned **1,500,000 characters** and the agent quoted the
//    LAST of the markers planted every ~1,000 characters. 400,000 passed the
//    same way. **No truncation, no preview, no spill.** The cap is gone from
//    the product AND absent from its documentation — so it has no contract at
//    all, in either direction.
//
// 🛑 THEREFORE THIS VALUE IS A CEILING WE CHOSE, NOT ONE THEY PROMISE.
//    `budget.md` states the law this obeys: *"do NOT peg a constant to the
//    harness limit: it can change without notice"*. 400,000 is FOUR TIMES under
//    what was measured to pass and THREE TIMES above the largest real payload
//    (the biggest skill of this fleet is ~139,000 characters) — margin on both
//    sides, and it costs nothing to lower.
// 🛑 NEVER `Infinity`, AND THIS IS THE LOAD-BEARING PART. `budget.md`: an
//    infinite budget yields *"one frame, NO SEAL and no chunking"* — so the end
//    marker disappears, and the end marker is the ONLY thing that makes a
//    returning limit AUDIBLE instead of silent. Declaring infinity would remove
//    the detector at exactly the moment it becomes necessary. A large FINITE
//    budget keeps the seal on every frame: the mechanism assumes no threshold
//    value, it holds at 10,000 as at 400,000.
// ⚠️ CODEX IS NOT TOUCHED: it negotiates its own limit in our wiring
//    (`additionalContextLimit: 0` = full delivery), so it needs nothing here —
//    and `UNMEASURED` would be a lie, while a number would be an invention.
// 🔴🔴 AND 400,000 WAS WRONG — CAUGHT IN PRODUCTION MINUTES LATER, SAME DAY.
//    Wired at 400,000 with `frames: 1`, the very FIRST injection came back as
//    **"Output too large (14.8KB). Full output saved to <file>. Preview (first
//    2KB)"** — the harness did not truncate, it SPILLED the document to disk and
//    handed the agent a 2 KB preview. The knowledge did not arrive.
// 🛑 SO THE CAP IS NOT GONE, IT CHANGED SHAPE, and the 1,500,000-character
//    measurement did NOT refute it: the agent quoted the last marker because it
//    could still REACH the spilled file, not because the text reached its
//    context. **A payload that arrives as a file path is a payload that did not
//    arrive.** The measurement asked "did the bytes survive?" when the only
//    question that matters is "did the AGENT receive them?".
// ⇒ THE FLOOR STANDS: this value goes back to what `budget.DEFAULT_BUDGET`
//    already was, and the shells keep declaring it EXPLICITLY so the number has
//    ONE owner and both lanes read it — that part of the change was sound and
//    is kept. What was wrong was the VALUE, never the plumbing.
// ⚠️ WHOEVER RAISES IT AGAIN MEASURES THE RIGHT THING: not "how many characters
//    can a hook return" but "above which size does the harness stop putting the
//    text in the agent's context". Those are two different numbers, and only the
//    second one is ours to respect. Observed spill at ~14.8 KB.
const HOOK_OUTPUT_BUDGET = {
  claudeCode: 8000,
  codex: UNMEASURED,
};

// ═══════════════════════════════════════════════════════════════════════
// WHERE A HARNESS SAYS "THE TOOL HAS ANSWERED", AND WHERE IT PUTS THE ANSWER (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════
// 🔑 The `response` setting decides a doc AFTER the tool ran, on what it answered. Which event
//    carries that moment, and under which field the answer travels, are a third party's names —
//    DATA, read by `lib-pure.afterAnswer`, never a literal in a shell.
// 📐 DOC-FIRST, read 2026-09-23: Claude Code `code.claude.com/docs/en/hooks` (PostToolUse:
//    `tool_response`, MCP results included) · Codex `learn.chatgpt.com/docs/hooks` (PostToolUse:
//    `tool_response`; Bash, apply_patch, MCP and local function tools — NOT hosted tools such as
//    WebSearch). ✅ MEASURED on Claude Code 2.1.280 the same day by a real PostToolUse hook: the
//    field is present on every tool, and an MCP result with structured content arrives as a JSON
//    STRING (`response-pure.js` unfolds it).
// ⚠️ A harness with no such event simply has no entry: its shell hands over no answer, and every
//    doc waiting for one stays silent there — a degradation `doctor --harness` names, never a
//    breakage (Windsurf and Kiro, 2026-09-23: their post-tool hooks cannot inject context).
const AFTER_ANSWER = {
  claudeCode: { eventField: 'hook_event_name', event: 'PostToolUse', responseField: 'tool_response' },
  codex: { eventField: 'hook_event_name', event: 'PostToolUse', responseField: 'tool_response' },
};

// ═══════════════════════════════════════════════════════════════════════
// HOW FULL THE CONTEXT IS, AND HOW AN END OF TURN IS REFUSED — the `wrapUp` option (2026-10-04)
// ═══════════════════════════════════════════════════════════════════════
// 🔑 Two capabilities, OPTIONAL, each a fact about a third party: a SENSOR that tells how full
//    the context window is BEFORE the harness compacts it, and a FORCING that refuses the end of
//    a turn with a reason the model reads. The core (`wrap-up-pure.js`) reads neither: it reads a
//    normalised observation, and the shell speaks the forcing dialect declared here.
// 📐 DOC-FIRST, read 2026-10-04: Claude Code `code.claude.com/docs/en/hooks` — Stop: top-level
//    `decision: "block"` + `reason` ("Set to \"block\" to prevent Claude from stopping"), input
//    `stop_hook_active`; mods (Claude Code 2.1.289 types) — `session.measure` "fires … after each
//    main-thread turn" carrying `context.percent`, "compare them with your own threshold here".
//    Codex `learn.chatgpt.com/docs/hooks` — Stop `decision: "block"` exists, but NO hook input
//    carries a token count (common fields: session_id, transcript_path, cwd, hook_event_name,
//    model, turn_id, permission_mode), so there is no sensor.
// 🛑 NEVER A COMPACTION VETO: the same Claude Code doc says a blocked compaction "stops
//    processing and asks you what to do" — a human in the loop. The sensor fires BELOW the wall.
// ⚠️ Codex's transcript DOES carry the figure (`token_count` events), and Codex itself writes
//    "the transcript format isn't a stable interface for hooks": it is deliberately NOT a sensor
//    here (operator decision 2026-10-04). The day a hook input carries the count, Codex gets a
//    sensor entry — data, zero engine line.
const WRAP_UP = {
  claudeCode: {
    sensor: { kind: 'mod', plugin: 'mods/wrap-up-sensor', event: 'session.measure' },
    forcing: { decisionField: 'decision', blockValue: 'block', reasonField: 'reason', noticeField: 'systemMessage' },
    // WHICH FILES THE SESSION WROTE (2026-10-04): the parameters Claude Code's file-writing
    // tools carry their path in (Write/Edit `file_path`, NotebookEdit `notebook_path`, from the
    // tool types of 2.1.289). The FIRST is also the one an edit is matched on when a judge's
    // perimeter is read on a written file. The tool NAMES live in the wiring's matcher.
    // ⚠️ A file a SHELL command writes is not recorded: what a command writes is not a fact
    //    the harness reports (stated in `wrap-up-touch.md`, never guessed from its text).
    touch: { pathParams: ['file_path', 'notebook_path'] },
  },
  codex: {
    sensor: ABSENT,
    forcing: { decisionField: 'decision', blockValue: 'block', reasonField: 'reason', noticeField: 'systemMessage' },
    touch: ABSENT,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// WHO IS ACTING — where each harness writes an agent's identity (2026-10-07)
// ═══════════════════════════════════════════════════════════════════════
//
// `category` derives `role:main` / `role:subagent` / `type:<x>` from these fields
// (`category-pure.contextFacts`). The engine never names a field: it reads the
// names HERE, so a harness that spells them differently is one entry, zero line
// of engine.
// 🛑 `sendsAgentId` IS A MEASURED PROMISE, NEVER A DEFAULT. It says "every gesture
//    of a sub-agent carries `idField`", which is what makes an ABSENT id mean "the
//    main agent". Without it an absence proves nothing and no role is derived —
//    a `role:main`-only doc then reaches NOBODY rather than leaking to a sub-agent.
// 📐 SOURCES, DATED:
//    Claude Code — `code.claude.com/docs/en/hooks` (SubagentStart, `agent_id`
//      "present only for a call coming from a sub-agent"), and MEASURED 2026-10-07
//      by a real `claude -p` capture: a sub-agent's PreToolUse carries `agent_id` +
//      `agent_type`, the main agent's carries neither.
//    Codex — its hooks doc lists `agent_id`/`agent_type` on SubagentStart/SubagentStop
//      ONLY (PreToolUse is silent about them), so the promise rests on a MEASUREMENT:
//      2026-10-07, codex-cli 0.146.0, isolated `CODEX_HOME` + a recording hook
//      (`codex exec --dangerously-bypass-hook-trust`, one spawned sub-agent): the main
//      agent's PreToolUse (Bash, spawn_agent, wait_agent) carried neither field; the
//      sub-agent's Bash PreToolUse carried `agent_id` + `agent_type: "default"`, the
//      same id as its SubagentStart. Neither harness sends a PARENT field (no `depth:`).
const IDENTITY = {
  claudeCode: { idField: 'agent_id', typeField: 'agent_type', sendsAgentId: true },
  codex: { idField: 'agent_id', typeField: 'agent_type', sendsAgentId: true },
};

module.exports = { DEFAULT_PROFILE, HOOK_TIMEOUT_DEFAULTS, HOOK_OUTPUT_BUDGET, AFTER_ANSWER, WRAP_UP, IDENTITY, ABSENT, UNMEASURED };
