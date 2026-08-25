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

const fs = require('fs');
const path = require('path');
const os = require('os');
const declared = require('./declared-paths-pure.js');

// This file lives in src/: the repo root is ONE level above.
const ROOT = path.join(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// THE CONFIG'S OWN ADDRESS — the one address that cannot be declared IN it
// ═══════════════════════════════════════════════════════════════════════
// 🔑 A LAUNCH ARGUMENT (`--ctxroute-config <absolute path>`), never an
//    environment variable: env vars are INHERITED, so one leak makes a hook
//    spawned from anywhere read a FOREIGN config — a fleet running another
//    fleet's rules, silently. Same doctrine as the state lane's `--client`; the
//    flag's spelling has ONE owner (`declared-paths-pure.CONFIG_FLAG`) so no two
//    callers can drift apart.
// 🛑 `CTXROUTE_CONFIG_PATH` STILL WINS AND IS READ FIRST — RESERVED for tests
//    and doctor.js, it is how every suite isolates itself in a throwaway
//    tmpdir. It is checked BEFORE `argv` is even looked at, so a suite that
//    overrode the address can never be stopped by a malformed argument some
//    runner happened to pass.
// ⚠️ NEITHER PRESENT ⇒ the config file sitting next to the code, byte for byte
//    the historical behaviour.
// ⚠️ READING `process.argv` HERE IS DELIBERATE AND IS WHAT MAKES IT SAFE. This
//    module is the SINGLE reader of the config address for the whole engine, so
//    every shell honours the argument by construction — a shell that silently
//    IGNORED it would read the wrong config with no error at all, which is the
//    exact failure this flag exists to prevent. `paths.js` is a shell-layer file
//    (`layers.json`), where reading the arguments is an allowed capability.
// ═══════════════════════════════════════════════════════════════════════
// STAGE ③ — THE OS-CONVENTIONAL PER-USER CONFIG, IF IT EXISTS ON DISK
// ═══════════════════════════════════════════════════════════════════════
// 🔑 IT LETS THE FRAMEWORK BE INSTALLED ANYWHERE WITHOUT BEING TOLD WHERE ITS
//    CONFIG LIVES — the missing half of running production from a FROZEN copy
//    of the code (the cure for the daemon exiting on its own source change),
//    and at the same time the cure for an adopter whose configuration had to
//    live INSIDE a clone that a `git pull` overwrites.
// 🛑 THE DECISION IS PURE, THE EXISTENCE CHECK IS I/O AND THEREFORE LIVES HERE.
//    `declared-paths-pure.conventionalConfigParts` receives the platform, the
//    environment and the home as ARGUMENTS — which is what makes Windows, macOS
//    and Linux all provable from any host — and returns SEGMENTS, because the
//    separator is `path`'s knowledge, never ours.
// ⚠️ THE FILE MUST EXIST, and that condition is the whole reason this change is
//    invisible: with no user-level file, `configPath()` returns byte for byte
//    what it returned before this stage was written.
function conventionalConfigPath() {
  return path.join(...declared.conventionalConfigParts({
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    isAbsolute: path.isAbsolute,
  }));
}

function configPath() {
  const override = process.env.CTXROUTE_CONFIG_PATH;
  if (override) return override;
  const fromArgv = declared.configPathArgument({ argv: process.argv, isAbsolute: path.isAbsolute });
  if (fromArgv !== undefined) return fromArgv;
  const conventional = conventionalConfigPath();
  if (fs.existsSync(conventional)) return conventional;
  return path.join(ROOT, 'ctxroute-config.json');
}

// ═══════════════════════════════════════════════════════════════════════
// THE THREE DATA ADDRESSES AN OPERATOR MAY DECLARE
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ `ctxroute-config.json` MAY declare `stateDir`, `docsDir` and
//    `sessionDocsDir`. All three are OPTIONAL, and with the keys ABSENT every
//    behaviour is what it was before they existed: `<repo>/state`,
//    `<repo>/docs/mcp`, `<repo>/docs/session`, resolved lazily, env override
//    first.
// 🔑 WHY THEY EXIST: these addresses used to be derived from where the CODE
//    sits, so a second copy of the code was a second state AND a second corpus —
//    a SPLIT BRAIN, and this project's one unacceptable failure mode is the
//    SILENT one. Freezing the code to stop the daemon exiting on its own source
//    change would otherwise freeze the maintainer's docs with it: their edits
//    would simply stop reaching production, with nothing to see.
// 🛑 THE `CTXROUTE_*_DIR` VARIABLES STILL WIN, and that order is not
//    negotiable: they are RESERVED for tests and doctor.js, and they are how
//    every suite isolates itself in a throwaway tmpdir. Were a config to beat
//    them, those suites would start writing into the REAL state — the exact
//    accident of 15/07/2026, one folder over.
// ⚠️ NO CACHE, DELIBERATELY. The resolution stays LAZY at every call (the env
//    variable is set by a parent AT SPAWN, and a memoised address would ignore
//    it), and a memoised CONFIG would be one more piece of state to invalidate
//    for a `readFileSync` of a few kilobytes that only happens when no env
//    override is in play.
// ⚠️ AN UNREADABLE CONFIG IS AN ABSENT CONFIG, never a refusal: every other
//    consumer of this file (`collect-core`, `session-inject`, `turn-count`)
//    already reads it that way, and a hook is fail-open by contract. What IS a
//    named refusal is a config that READS FINE and declares a value this
//    framework cannot honour — that one the operator wrote on purpose.
/** ONE reader for any value the config DECLARES — a directory, a port. @param {string} key @returns {unknown} */
function configuredValue(key) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return raw && typeof raw === 'object' ? raw[key] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One declarable directory, resolved through the SINGLE pure decision.
 * @param {string} key config key · @param {string|undefined} envDir reserved override
 * @param {string} defaultDir the historical, code-derived directory
 * @returns {string}
 */
function declarableDir(key, envDir, defaultDir) {
  // 🛑 NORMALISED, and the normalisation is NOT cosmetic. A declared
  //    `C:/x/state` and a joined `C:\x\state` name the SAME directory and are
  //    DIFFERENT strings, so any consumer that rebuilds an address and compares
  //    it with the one we hand out disagrees with us about a place both reached.
  //    MEASURED 2026-08-24: `lifecycle-log.test.js` asserts the journal's
  //    `path.dirname` EQUALS `stateDir()`, and it went red the hour a real
  //    configuration first declared one — one directory, two spellings, and the
  //    judge was right. `path.resolve` is the OS answering what the canonical
  //    spelling is; it is a no-op on a value already written that way.
  return path.resolve(declared.resolveDeclaredDir({
    configKey: key,
    envDir,
    readConfiguredDir: () => configuredValue(key),
    defaultDir,
    // ⚠️ The OS ANSWERING what an absolute path is — never a regex of ours.
    isAbsolute: path.isAbsolute,
  }));
}

// ════════════════════════════════════════════════════════════════════════
// THE DAEMON'S LISTENING ADDRESS — the SINGLE point both consumers read
// ════════════════════════════════════════════════════════════════════════
// 🛑 TWO CONSUMERS, ONE RESOLUTION, AND THAT IS THE WHOLE POINT (2026-08-25):
//    `src/hooks/http-server.js` BINDS this address, `tools/wiring-generate.js`
//    writes it into the URL the harness POSTs to. Until that day each held its
//    own copy of BOTH halves — `HOST` and `DEFAULT_PORT` constants there,
//    `transport.host` and `transport.port` in `wiring.json` — agreeing by luck,
//    with nothing comparing them. Reading them apart is what made a split brain
//    buildable; there is no second place to write any more.
// 🛑 AND IT IS RETURNED WHOLE, IN ONE CALL. A host resolved beside a port
//    would be two settings for one fact, i.e. the same disease one level up —
//    an address is read entire, or it is read twice.
// ⚠️ `CTXROUTE_HTTP_PORT` still WINS over the port, and unlike the
//    `CTXROUTE_*_DIR` variables it is NOT test-reserved:
//    `service/ctxroute-http.service` declares it and `service/install-windows.ps1`
//    reads it back. There is NO host variable, and the reason is written where
//    the spelling lives (`declared-paths-pure.js`).
// ⚠️ Under SOCKET ACTIVATION the supervisor owns the listening socket and the
//    daemon IGNORES what this returns (`listenOn` decides, in ONE place). The
//    value still tells the WIRING where to knock, and that address is the unit's.
function httpEndpoint() {
  return declared.resolveDeclaredHttp({
    envPort: process.env.CTXROUTE_HTTP_PORT,
    readConfiguredHttp: () => configuredValue(declared.HTTP_KEY),
  });
}

// Corpus of the MCP docs. Env var RESERVED for tests and for doctor.js.
function docsDir() {
  return declarableDir(declared.DOCS_DIR_KEY, process.env.CTXROUTE_DOCS_DIR, path.join(ROOT, 'docs', 'mcp'));
}

// The framework's MUTABLE STATE — the first address that stopped following the
// CODE (2026-08-24), same precedence as the two doc corpora above.
// Env var RESERVED for tests and for doctor.js.
function stateDir() {
  return declarableDir(declared.STATE_DIR_KEY, process.env.CTXROUTE_STATE_DIR, path.join(ROOT, 'state'));
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
  return declarableDir(
    declared.SESSION_DOCS_DIR_KEY,
    process.env.CTXROUTE_SESSIONDOCS_DIR,
    path.join(ROOT, 'docs', 'session')
  );
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

// ═══════════════════════════════════════════════════════════════════════
// THE STEERING JOURNALS — ONE PHYSICAL COPY FOR EVERY WORKTREE
// ═══════════════════════════════════════════════════════════════════════
// 🔴 MEASURED 2026-08-22. `REFACTOR-PLAN.md` and `REFACTOR-ARCHIVE.md` are the
//    project's only memory between two sessions, and they are GITIGNORED (they
//    carry personal values, the repository is public). Being untracked, they
//    follow NO branch, NO merge and NO checkout: every worktree therefore held
//    its OWN physical copy, and the copies DIVERGED — two trees on the same
//    commit, 75 lines apart on the plan and 17 on the archive. TWO of the three
//    reds of that morning came from that single cause: judges accusing lines
//    already rewritten in the other tree, i.e. work about to be redone twice.
// ✅ THE FIX IS THE DOCTRINE ALREADY WRITTEN FOR THE INJECTION STORE — ONE
//    STATE, ONE OWNER, EVERYONE ELSE A CLIENT — applied to the steering
//    documents. The owner is the repository's COMMON directory: `git` shares it
//    between every worktree BY CONSTRUCTION, and it is intrinsically outside
//    the tree git tracks. So the journals stay private AND stop being copied.
// 🛑 MAKING THEM TRACKED IS REFUSED: personal data, public repository.
// 🛑 AND THE RESOLUTION IS FAIL-CLOSED — never a fallback to `__dirname`. A
//    silent fallback would put one copy back per worktree, which is EXACTLY the
//    defect closed here, and it would do it with nothing going red: the reader
//    would find a plausible file and believe it authoritative.
// ⚠️ NO ENV OVERRIDE, DELIBERATELY. The other accessors expose one so a test
//    can run against a tmpdir; here an override is the divergence itself,
//    re-openable from any environment. A caller that must resolve from ANOTHER
//    repository (the proof cell, which builds a real repo + a real worktree)
//    passes `startDir` — an ARGUMENT, never an ambient setting.
// ⚠️ WE ASK GIT'S OWN FILES, WE DO NOT SPAWN GIT. The layout is git's
//    documented contract and it answers with no process, on the hot path or
//    not: `<root>/.git` is a DIRECTORY in an ordinary clone (it IS the common
//    directory), and a FILE `gitdir: <path>` in a linked worktree, whose target
//    holds a `commondir` file pointing at the shared directory. Anything else
//    is a NAMED REFUSAL, never a guess.
const STEERING_PLAN = 'REFACTOR-PLAN.md';
const STEERING_ARCHIVE = 'REFACTOR-ARCHIVE.md';

/** @param {string} where @param {string} why */
function refuseSteering(where, why) {
  return new Error(
    `ctxroute REFUSED: cannot resolve the git common directory from "${where}" (${why}). `
    + `The steering journals (${STEERING_PLAN} / ${STEERING_ARCHIVE}) live there so that every `
    + 'worktree reads ONE physical copy. Falling back to a per-tree path would silently recreate '
    + 'the divergence measured on 2026-08-22 — so nothing is resolved at all.'
  );
}

/**
 * The repository's COMMON directory — the one `git` shares between every
 * worktree. THROWS a named refusal when it cannot be resolved.
 * @param {string} [startDir] repository root to resolve from (default: this repo)
 * @returns {string}
 */
function gitCommonDir(startDir) {
  const root = startDir || ROOT;
  const dotGit = path.join(root, '.git');
  let st;
  try {
    st = fs.statSync(dotGit);
  } catch {
    throw refuseSteering(root, 'no .git entry there — this is not a git repository');
  }
  // Ordinary clone: `.git` IS the common directory.
  if (st.isDirectory()) return dotGit;
  // Linked worktree: `.git` is a file naming this worktree's private git dir.
  const pointer = /^\s*gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
  if (!pointer) throw refuseSteering(root, '.git is a file but carries no "gitdir:" line');
  const gitDir = path.resolve(root, pointer[1]);
  // `commondir` is git's OWN answer to "where is the shared directory?".
  const commonFile = path.join(gitDir, 'commondir');
  let rel;
  try {
    rel = fs.readFileSync(commonFile, 'utf8').trim();
  } catch {
    throw refuseSteering(root, `the git dir "${gitDir}" holds no commondir file`);
  }
  if (rel === '') throw refuseSteering(root, `the commondir file of "${gitDir}" is empty`);
  return path.resolve(gitDir, rel);
}

/**
 * Directory holding the steering journals — shared by every worktree.
 * @param {string} [startDir]
 * @returns {string}
 */
function steeringDir(startDir) {
  return gitCommonDir(startDir);
}

/** @param {string} [startDir] @returns {string} */
function planPath(startDir) {
  return path.join(steeringDir(startDir), STEERING_PLAN);
}

/** @param {string} [startDir] @returns {string} */
function archivePath(startDir) {
  return path.join(steeringDir(startDir), STEERING_ARCHIVE);
}

module.exports = {
  configPath, conventionalConfigPath, docsDir, stateDir, httpEndpoint,
  gitCommonDir, steeringDir, planPath, archivePath,
  fleetHooksDir, fleetHooksLabel, fleetHooksSegments,
  transcriptsDir, harnessRoots,
  secretsDir, secretsLabel,
  fileDocsDir, sessionDocsDir, skillsDir, ROOT,
};
