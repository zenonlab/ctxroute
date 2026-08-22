#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// SINGLE SOURCE of the framework's paths (config / docs / state)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ EVERY path read or WRITTEN at runtime is declared HERE, only once.
// NEVER redo an ad-hoc `path.join(__dirname, '..', 'state')` in a hook:
// `stateDir` was hardcoded identically in legacy-mcp-inject.js AND
// ctxroute-reset.js — two copies of one and the same truth that diverge silently
// as soon as one of them changes (exactly the class of bug that sanitizeSessionId()
// already avoids for the FORMAT of the file name; here it is its DIRECTORY).
//
// ⚠️ The 3 env vars are RESERVED FOR TESTS AND FOR doctor.js — never a
// user setting (the user config is ctxroute-config.json).
// They exist so that a test/probe runs in TOTAL isolation
// (throwaway tmpdir) without ever touching the repo's shipped files. Bug experienced
// (15/07/2026): the integration tests wrote into the REAL
// ctxroute-config.json → framework left disabled in prod, silently.
//
// ⚠️ I/O-adjacent module (path + process.env): NEVER import it from
// lib-pure.js, which must stay pure (cf .dependency-cruiser.json).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const os = require('os');

// This file lives in src/: the repo root is ONE level above.
const ROOT = path.join(__dirname, '..');

function configPath() {
  return process.env.CTXROUTE_CONFIG_PATH || path.join(ROOT, 'ctxroute-config.json');
}

function docsDir() {
  return process.env.CTXROUTE_DOCS_DIR || path.join(ROOT, 'docs', 'mcp');
}

function stateDir() {
  return process.env.CTXROUTE_STATE_DIR || path.join(ROOT, 'state');
}

// ═══════════════════════════════════════════════════════════════════════
// THE FLEET ROOT — ONE definition, TWO projections. NEVER collapse them.
// ═══════════════════════════════════════════════════════════════════════
// The root of the harness hook fleet is THIS LIST OF SEGMENTS and nothing else.
// It is consumed in two different ways, and the difference is not cosmetic:
//   · `fleetHooksDir()`   — ANCHORED at the home, ABSOLUTE, overridable. The
//     address a PROCESS uses to REACH the filesystem.
//   · `fleetHooksLabel()` — RELATIVE, never anchored, never overridable. The
//     address PUBLISHED TO A READER in the `[source: …]` tag of every injected
//     document. That tag is a CONTRACT: an agent reads the exact path there to
//     go and UPDATE the doc when it finds it wrong — the loop that makes the
//     corpus self-repairing. A tag pointing at a directory that no longer holds
//     the file breaks that loop, and nothing would go red.
// 🛑 NEVER MAKE THE LABEL CALL THE ACCESSOR "to have a single function". This
//    repository is PUBLIC and treats itself as already public: the accessor
//    returns the maintainer's REAL HOME — or, under the test override, a
//    tmpdir. Emitting either into every injected document would leak a real
//    user path into the context of every agent, and would let a test override
//    rewrite a published contract. TWO PROJECTIONS OF ONE TRUTH is the fix;
//    ONE FUNCTION is a leak. Sealed both ways by `fleet-hooks-path.test.js`.
// ⚠️ The label joins with '/' and NEVER `path.join`: it is a POSIX-shaped
//    published address, not a filesystem path, and it must read identically on
//    Windows and on Linux (`pretool-differential` compares it byte for byte).
const FLEET_SEGMENTS = Object.freeze(['.claude', 'hooks']);

// ═══════════════════════════════════════════════════════════════════════
// THE OTHER TWO HARNESS ROOTS — same class, same owner, ONE definition each.
// ═══════════════════════════════════════════════════════════════════════
// 🔑 THE CLASS IS "A HARNESS ROOT REBUILT BY HAND", NEVER "the hooks root".
//    WI-VENDOR-PATH closed five copies of ONE of them and left the others
//    reachable by a `path.join(os.homedir(), …)` written anywhere — which is
//    the same defect with a different second segment. `tools/scope-reach.js`
//    was still doing exactly that for the TRANSCRIPT corpus, declared out of
//    scope on 21/08/2026 and closed here the same day.
// ⚠️ Root of the harness TRANSCRIPT corpus (Claude Code: ~/.claude/projects/),
//    one folder per project, `*.jsonl` inside. READ ONLY, and READ IN BULK
//    (hundreds of MB): never on the hot path.
const TRANSCRIPT_SEGMENTS = Object.freeze(['.claude', 'projects']);
// ⚠️ Root of the harness SKILL store (Claude Code: ~/.claude/commands/). It was
//    already assembled here and nowhere else; declaring it makes that a
//    JUDGED fact instead of a lucky one.
const SKILL_SEGMENTS = Object.freeze(['.claude', 'commands']);
// ⚠️ Root of the harness SECRET store (Claude Code fleet: ~/.claude/secrets/),
//    which holds the private anti-leak list. `src/leak-list.js` rebuilt it by
//    hand until 21/08/2026 — same shape, same silence, different second
//    segment — and it was left OUT of this registry that day with the written
//    reason "declaring it would accuse a file this module owns no accessor
//    for". 🛑 That reason was TRUE and TEMPORARY, and it is the shape every
//    permanent exemption takes: the answer to "the gate would redden the
//    truth" is to make the truth OWNED, never to keep the root un-policed.
const SECRET_SEGMENTS = Object.freeze(['.claude', 'secrets']);

// The home-anchored harness roots this module OWNS, as DATA.
// 🛑 THIS REGISTRY IS WHAT THE GATE JUDGES (`fleet-hooks-path.test.js`): it
//    derives the forbidden segment sets from HERE, and it fabricates one
//    offender PER ENTRY inside the judging scan. So a root added tomorrow is
//    policed the moment it is declared, and a root DELETED from this list
//    turns the gate RED instead of silently un-policing a directory.
// ⚠️ DECLARE A ROOT HERE ONLY IF THIS MODULE OWNS ITS ACCESSOR. Declaring one
//    that some other file legitimately assembles would redden the truth, and a
//    gate red on the truth gets disarmed the same day.
// ✅ THE LAST OMISSION IS CLOSED (`secretsDir`, 22/08/2026). A note used to sit
//    here saying `~/.claude/secrets/` was DELIBERATELY not declared because
//    `src/leak-list.js` owned it and this module had no accessor for it. The
//    note was honest and it was still an un-policed directory: it is REMOVED
//    rather than kept, because a stale allowance outlives every reader who
//    could judge it. 🛑 The lesson generalises — "the gate would accuse the
//    truth" is a reason to MOVE the truth here, never to leave a root out.
const HARNESS_ROOTS = Object.freeze([
  Object.freeze({ name: 'fleetHooksDir', segments: FLEET_SEGMENTS }),
  Object.freeze({ name: 'transcriptsDir', segments: TRANSCRIPT_SEGMENTS }),
  Object.freeze({ name: 'skillsDir', segments: SKILL_SEGMENTS }),
  Object.freeze({ name: 'secretsDir', segments: SECRET_SEGMENTS }),
]);

// ROOT of the harness HOOK FLEET (Claude Code: ~/.claude/hooks/). Everything the
// framework vendors into the fleet, and everything it reads back from it, hangs
// HERE — `fileDocsDir()` is BENEATH it, `skillsDir()` is BESIDE it.
// ⚠️ NEVER rebuild it with `path.join(os.homedir(), '.claude', 'hooks')` in a
//    script: that hardcoded form lived in vendor-deadline.js, lint-corpus.js and
//    scope-reach.js under THREE different env-var names (`VENDOR_TARGET_DIR`,
//    `CTXROUTE_HOOKS_DIR`, none at all) — three copies of ONE truth, i.e. exactly
//    the `stateDir` defect this file was born to kill, one level up.
// 🛑 THE CLASS IS SEALED, NOT THE CASE: `fleet-hooks-path.test.js` scans `src/`
//    and `tools/` (perimeter from `git ls-files`, AST via `rules/fleet-root.yml`)
//    and turns RED on ANY file but this one re-assembling ANY declared root —
//    the SEGMENTS it looks for are derived from `HARNESS_ROOTS` above, so moving
//    a root here moves the detector with it, and no copy of them exists anywhere
//    else. Naming the known offenders would only know the past — which is
//    exactly what happened: sealing the HOOKS root by name left the TRANSCRIPT
//    root open for a day.
// ⚠️ `os.homedir()` is the OS ANSWERING, not a guess — that is why it is the
//    admissible authority HERE and a defect everywhere else.
// Env var RESERVED for tests and for doctor.js.
function fleetHooksDir() {
  return process.env.CTXROUTE_FLEET_HOOKS_DIR || path.join(os.homedir(), ...FLEET_SEGMENTS);
}

// The fleet root as it is PUBLISHED, never as it is reached: relative, POSIX,
// home-free. ⚠️ NO env override HERE and its absence is DELIBERATE — a test
// pointing the engine at a tmpdir must not rewrite the `[source: …]` contract
// read by an agent on a normal machine.
function fleetHooksLabel() {
  return FLEET_SEGMENTS.join('/');
}

// The canonical segments themselves, for the GATE that has to look for them in
// other files. Frozen: a consumer that could mutate this array would move the
// root for everyone, from anywhere, at runtime.
function fleetHooksSegments() {
  return FLEET_SEGMENTS;
}

// Corpus of the harness TRANSCRIPTS (Claude Code: ~/.claude/projects/) — the
// record of what the harness REALLY called, one folder per project.
// ⚠️ ONE PROJECTION AND ONE ONLY, and the reason is written here rather than
//    left to look like an omission. `fleetHooksDir()` needed a second, PUBLISHED
//    projection because its address travels INTO documents (the `[source: …]`
//    tag). This one never does: it is walked by `tools/scope-reach.js` to read
//    `*.jsonl` off the disk, and the only place it ever surfaces is a NAMED
//    REFUSAL on an operator's own terminal — which is not a tracked file, not a
//    published document and not an injected context, so it carries no home into
//    anything that survives the command. Precedent in this repo: the canary
//    already logs the absolute transcript path, and it lives under `state/`
//    BECAUSE that is gitignored.
// 🛑 THE DAY THIS PATH IS EMITTED INTO A DOC, A TAG OR A COMMITTED FILE, it
//    needs the two-projection treatment like the fleet root — it is an ABSOLUTE
//    path anchored at a real home, and this repository is PUBLIC.
// ⚠️ `os.homedir()` is the OS ANSWERING, not a guess — admissible HERE, a defect
//    everywhere else. Env var RESERVED for tests and for doctor.js.
function transcriptsDir() {
  return process.env.CTXROUTE_TRANSCRIPTS_DIR || path.join(os.homedir(), ...TRANSCRIPT_SEGMENTS);
}

// The home-anchored harness roots, for the GATE that must look for them in the
// other files. Frozen at every level: a consumer able to mutate this would move
// a root for everyone, from anywhere, at runtime.
function harnessRoots() {
  return HARNESS_ROOTS;
}

// Corpus of the FILE docs (frontmatters migrated on 16/07/2026) — consumed by the
// unified engine. DERIVED from fleetHooksDir() so the root has ONE definition.
// Env var RESERVED for tests.
function fileDocsDir() {
  return process.env.CTXROUTE_FILEDOCS_DIR || path.join(fleetHooksDir(), 'docs');
}

// Corpus of the SESSION docs (injected at EVERY SessionStart: startup/resume/
// clear/compact — knowledge "like CLAUDE.md" but managed by the framework).
// Env var RESERVED for tests and for doctor.js.
function sessionDocsDir() {
  return process.env.CTXROUTE_SESSIONDOCS_DIR || path.join(ROOT, 'docs', 'session');
}

// Store of the harness SKILLS (Claude Code: ~/.claude/commands/{name}.md).
// READ ONLY (the skill's body is injected as is) — we NEVER write
// into a harness file. Env var RESERVED for tests and for doctor.js.
function skillsDir() {
  return process.env.CTXROUTE_SKILLS_DIR || path.join(os.homedir(), ...SKILL_SEGMENTS);
}

// ═══════════════════════════════════════════════════════════════════════
// THE SECRET STORE — TWO PROJECTIONS, and the leak question is ANSWERED here
// ═══════════════════════════════════════════════════════════════════════
// Store of the harness SECRETS (Claude Code fleet: ~/.claude/secrets/). READ
// ONLY: the framework never writes a secret, it only reads the private
// anti-leak list that `src/leak-list.js` hangs beneath this root.
//
// 🔑 THE LEAK QUESTION, ASKED AND ANSWERED BY MEASUREMENT — NOT BY PREFERENCE.
//    "Does this address ever travel into a message, a tag, a document or a
//    COMMITTED file?" For `transcriptsDir()` the answer was NO and one function
//    was enough. HERE THE ANSWER IS YES, and it was already yes before this
//    accessor existed: the address `.claude/secrets/ctxroute-fuite.json` is
//    written, BY HAND, in THREE tracked files of a PUBLIC repository —
//    `docs/framework/leak.md` (and its byte-identical fleet mirror) tells a
//    reader where the private list lives, and `test/leak-gate.test.js` prints
//    it in the remediation message of its schema cell. Three hand-written
//    copies of one published address: the `source-adapters.js` defect verbatim,
//    where two hardcoded label prefixes survived precisely BECAUSE nothing read
//    through them.
// ⇒ TWO PROJECTIONS, exactly like the fleet root:
//    · `secretsDir()`   — ABSOLUTE, anchored at the home, overridable. The
//      address a PROCESS uses to REACH the disk.
//    · `secretsLabel()` — RELATIVE, POSIX, home-free, NOT overridable. The
//      address PUBLISHED to a reader.
// 🛑 AND THE STAKE IS HIGHER HERE THAN ANYWHERE ELSE IN THIS FILE: this root
//    points at a SECRETS directory. Emitting `secretsDir()` would not merely
//    leak the maintainer's home into a public artefact, it would publish the
//    exact filesystem address of their secret store — and the anti-leak gate
//    that reads this very path is the one gate whose damage is IRREVERSIBLE
//    (pushed data survives in `git log -p` after the tree is fixed). NEVER make
//    the label call the accessor "to have a single function".
// ⚠️ `os.homedir()` is the OS ANSWERING, not a guess — admissible HERE, a defect
//    everywhere else. Env var RESERVED for tests and for doctor.js.
function secretsDir() {
  return process.env.CTXROUTE_SECRETS_DIR || path.join(os.homedir(), ...SECRET_SEGMENTS);
}

// The secret store as it is PUBLISHED, never as it is reached.
// ⚠️ NO env override, and its absence is DELIBERATE: a suite pointing the
//    anti-leak gate at a tmpdir must not rewrite the address a reader is told
//    to go and create their private list at.
function secretsLabel() {
  return SECRET_SEGMENTS.join('/');
}

module.exports = {
  configPath, docsDir, stateDir,
  fleetHooksDir, fleetHooksLabel, fleetHooksSegments,
  transcriptsDir, harnessRoots,
  secretsDir, secretsLabel,
  fileDocsDir, sessionDocsDir, skillsDir, ROOT,
};
