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
  // 🔴 THE **DERIVED** OBSERVABLE OF A SHELL GESTURE (20/08/2026) — the directory the
  //    command DESIGNATES (`cd X && …`), as opposed to the raw text it CONTAINS.
  // ⚠️ WHY IT IS DECLARED HERE AND NOT HARD-CODED IN THE ENGINE: a shell command carries
  //    TWO facts under ONE key, and a language can only discriminate on facts it has
  //    DECLARED. While both lived under `command`, "I am QUOTING this project" and "I am
  //    WORKING in it" were the same observable — so no combination of operators could
  //    separate them, and the defect was not in the boolean base but in the universe.
  //    That is the 9th defect of this project and the 9th of the same family.
  // 📐 MEASURED on 28,703 real actions before shipping: dropping the WHOLE `command` key
  //    from a trigger costs 2,281 injections of which **1,087 are real work (47.7 %)** —
  //    refused by the same threshold that reverted July's two exclusions. Dropping only
  //    the RAW half costs 749 of which **41 (5.5 %, i.e. 0.2 % of all injections)**.
  // ⚠️ It is a NAME, not a parameter: no harness sends it. It is the handle by which
  //    `keys` addresses the derived half — `keys: {match: ["-command"]}` now means
  //    "stop reading what the command SAYS, keep reading where it WORKS", and
  //    `["-commandCwd"]` says the exact opposite. Default universe UNCHANGED: both halves
  //    are active unless an entry says otherwise.
  commandCwdKey: 'commandCwd',
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

module.exports = { DEFAULT_PROFILE };
