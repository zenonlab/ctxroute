// doctor-wiring-pure.js — THE DECISIONS of the doctor's wiring check, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS. `tools/doctor.js` is the fleet's dead-man
//    switch: a dead PreToolUse hook is INDISTINGUISHABLE from an absent one (no error, no log,
//    just no more injected docs — lived through twice on 2026-07-15). Its `checkWiring()` was
//    ~325 lines of PURE DECISION — split-brain detection, frame coordinates 1..N with no gap and
//    no duplicate, lane coherence, divergent `--frames` — sitting inside an I/O tool, hence
//    OUTSIDE Stryker's `mutate`. **The judgement of the thing that judges everything else had
//    never been mutated.** An inverted comparison, a `some` turned into an `every`, a `filter`
//    that no longer filters would have stayed GREEN for ever, and a false dead-man switch is
//    worse than none: it REASSURES, so nobody looks again. Same precedent, same remedy as
//    `disk-writers-pure.js`, `quadratic-budget-pure.js`, `state-eviction-pure.js`,
//    `lifecycle-log-pure.js`, `memory-store-pure.js`.
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no
//    `process.argv`, no `console`, no `process.exit`. It RECEIVES what was measured (the parsed
//    settings, the config's `frames`, the lane flag, the consumers derived from `src/hooks/`) and
//    RETURNS an ORDERED list of findings. The shell reads the disk, resolves paths, prints and
//    exits. 🛑 NEVER put file access back here "to simplify": that would lose the MUTABILITY
//    which is the entire justification of the file. Sealed by `doctor-wiring-pure-must-stay-pure`
//    (dependency-cruiser) and by `layers-gate`.
//
// ⚠️ SOME DECISIONS CANNOT BE TAKEN HERE, AND THEY ARE HANDED BACK RATHER THAN FAKED: "does this
//    wired file EXIST" and "is it THIS repo's copy" need `fs` and `path`. Those come out as
//    `{ kind: 'file' }` entries carrying the extracted path; the shell answers them. Extracting
//    the path from a declaration IS a decision (a regex over text) and stays here.
//
// ⚠️ NO NESTED TRAVERSAL ANYWHERE IN THIS FILE, DELIBERATELY (complexity declares itself). That is
//    why every membership test below is a REGEX and never `.includes()`: `no-undeclared-quadratic`
//    counts `.includes()` among its traversal atoms, so one inside a `filter` would spend a line of
//    this file's complexity budget on a plain substring test. Same reasoning already written into
//    the lane-coherence block of the original.
'use strict';
// ⚠️ The gate's file name is load-bearing in TWO places (the consumer derivation and the split
//    brain report) — declared ONCE so the two cannot drift apart.
const GATE_FILE = 'doc-inject.js';
// ⚠️ JSDoc is a VERIFIED CONTRACT here (`npm run check:types`), not decoration: a block must be
//    GLUED to its function, and a lying type is caught by `tsc`, never by a reader.
/**
 * @typedef {{kind: "check", name: string, ok: boolean, detail: (string|undefined)}} CheckFinding
 * @typedef {{kind: "file", base: string, file: string, existsName: string, absentDetail: string, copyName: string, copyDetail: string}} FileFinding
 * @typedef {CheckFinding|FileFinding} Finding
 * @typedef {{base: string, label: string, absent?: (f: string) => string, copy?: (f: string, repo: string) => string}} HookSpec
 * @typedef {{settings: *, wantedFrames: (number|null), laneFlag: (string|null), consumers: string[], repoDir: string}} WiringInput
 */
// ── THE DECLARATION READER ───────────────────────────────────────────────────
// 🛑 BOTH TRANSPORTS, ALWAYS. A declaration is `type:"command"` (a spawned process, coordinates in
//    `--frame k --frames N`) OR `type:"http"` (a POST to the daemon, coordinates in the URL's
//    query string). Reading only `"command"` counted ZERO frames the day the http lane was wired
//    and invented a divergence that did not exist: LOUD, but judging nothing. We do NOT presume the
//    exact structure of settings.json either — it evolves with the harness, and rigid parsing would
//    be a false negative.
const DECL_RE = /"(?:command|url)"\s*:\s*"([^"]+)"/g;
/**
 * Every hook declaration of a settings object, whatever the event that carries it.
 * @param {unknown} settings parsed settings.json
 * @returns {string[]} the raw `"command": "…"` / `"url": "…"` fragments
 */
function declarations(settings) {
  return JSON.stringify(settings).match(DECL_RE) || [];
}
// ⚠️ ONE READER FOR THE TWO DIALECTS, never two copies: the total and the index must be read by the
//    SAME code, or a transport gains an index check and loses the total one, silently.
/**
 * @param {string} text one declaration
 * @param {string} word 'frame' or 'frames'
 * @returns {number|null} the coordinate, or null when the declaration carries none
 */
function coord(text, word) {
  const spawn = new RegExp(`--${word}\\s+(\\d+)`).exec(text);
  if (spawn) return Number(spawn[1]);
  const http = new RegExp(`[?&]${word}=(\\d+)`).exec(text);
  return http ? Number(http[1]) : null;
}
// ⚠️ A path is extracted, never guessed: an absolute Windows path (`C:\…`) or a POSIX one, ending
//    on the file we are looking for. A declaration carrying no such path (the http lane has NO file
//    name at all) yields null and is simply not judged on existence — accusing it would turn one
//    transport into a fault.
/**
 * @param {string} text one declaration
 * @param {string} base the file name, e.g. 'doc-inject.js'
 * @returns {string|null}
 */
function filePath(text, base) {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`([A-Za-z]:[\\\\/][^"]*?|/[^"]*?)${escaped}`).exec(text);
  return m ? `${m[1]}${base}` : null;
}
// ── THE HOOK REGISTRY — every path the wiring must carry ────────────────────
// ⚠️ DERIVED CHECKS, never eight copy-pasted blocks: a hook added tomorrow joins the wiring check
//    by adding ONE entry here. `file: false` = the hook is only required to be PRESENT (nothing
//    downstream resolves its path, so demanding one would be an inert check).
// ⚠️ `label`, `absent` and `copy` are CONTRACT TEXT, kept per hook rather than unified: a
//    dead-man switch that names the wrong organ wastes the very time it exists to save (the
//    2026-08-09 lesson — "no MCP doc is injected" printed for a dead turn counter).
const HOOKS = Object.freeze([
  Object.freeze({
    base: 'ctxroute-reset.js',
    re: /ctxroute-reset/,
    file: true,
    label: 'file',
    name: 'the PreCompact reset is wired (ctxroute-reset.js)',
    detail: 'ctxroute-reset.js missing from settings.json: no more re-injection after compaction, in silence.',
    absent: (f) => `settings.json points at a NON-EXISTENT file: ${f} — hook dead in silence.`,
    copy: (f, repo) => `settings.json points at ANOTHER copy of the framework: ${f} (this repo: ${repo}) — your changes here do not apply.`,
  }),
  Object.freeze({
    base: 'session-inject.js',
    re: /session-inject/,
    file: true,
    label: 'SESSION gate',
    name: 'the SESSION gate (session-inject.js) is wired on SessionStart',
    detail: 'session-inject.js missing from settings.json: no docs/session/ doc injected any more, in silence.',
    absent: (f) => `settings.json points at a non-existent session gate: ${f} — hook dead in silence.`,
    copy: (f, repo) => `settings.json points at ANOTHER copy of the session gate: ${f} (this repo: ${repo}).`,
  }),
  Object.freeze({
    base: 'doc-write-guard.js',
    re: /doc-write-guard/,
    file: false,
    label: 'file',
    name: 'the write guard (doc-write-guard.js) is wired on PostToolUse',
    detail: 'doc-write-guard.js missing from settings.json: no more real-time feedback on an invalid doc.',
  }),
  Object.freeze({
    base: 'turn-count.js',
    re: /turn-count/,
    file: false,
    label: 'file',
    name: 'the TURN gate (turn-count.js) is wired on UserPromptSubmit',
    detail: 'turn-count.js missing from settings.json: driftUnit turn dead — docs never re-injected, in silence.',
  }),
  // ⚠️ The CANARY is the ONLY witness looking at the OTHER end of the pipe: that the HARNESS still
  //    consumes our injections. Everything else in the framework tests itself and would stay GREEN
  //    if the harness stopped reading `additionalContext`. Unwired it degrades nothing VISIBLE — it
  //    just makes that failure mode UNDETECTABLE, for good.
  // ⚠️ Match BOTH spellings: the repo file is `canary-check.js` (renamed 2026-08-16), but a
  //    not-yet-migrated wiring may still say `canari-check`.
  Object.freeze({
    base: 'canary-check.js',
    re: /canar[yi]-check/,
    file: true,
    label: 'file',
    name: 'the CANARY (canary-check.js) is wired on UserPromptSubmit',
    detail: 'canary-check.js missing from settings.json: NO witness checks any more that the harness still consumes '
      + 'our injections. The day it stops, everything stays green and nothing reaches the agent any more.',
    absent: (f) => `settings.json points at a NON-EXISTENT file: ${f} — the witness died before serving.`,
    copy: (f, repo) => `settings.json points at ANOTHER copy of the framework: ${f} (this repo: ${repo}).`,
  }),
]);
// ⚠️ The GATE is not in the list above because it is NOT recognised by a file name: on the http lane
//    a declaration carries only a URL with the frame coordinates. Its own descriptor, same shape.
const GATE = Object.freeze({
  base: GATE_FILE,
  label: 'GATE',
  absent: (f) => `settings.json points at a NON-EXISTENT GATE: ${f} — hook dead in silence.`,
  copy: (f, repo) => `settings.json points at ANOTHER copy of the gate: ${f} (this repo: ${repo}).`,
});
// ⚠️ Two indices only, and no third: an unused constant is dead code, hence an EQUIVALENT mutant
//    nobody can kill — this repository eliminates those at the source instead of testing them.
const RESET = 0;
const SESSION = 1;
/** @param {{name: string, ok: boolean, detail: (string|undefined)}} e @returns {CheckFinding} */
function said(e) {
  return { kind: 'check', name: e.name, ok: e.ok, detail: e.detail };
}
/**
 * Every finding of the wiring check, IN ORDER.
 *
 * @param {object} input
 * @param {*} input.settings parsed settings.json (never null: the shell judges readability)
 * @param {number|null} input.wantedFrames `frames` from ctxroute-config.json, null when undeclared
 * @param {string|null} input.laneFlag `LANE_FLAG` read from client-core.js, null when unreadable
 * @param {string[]} input.consumers hook file names containing a `clientLane(` call
 * @param {string} input.repoDir the directory this doctor runs from, quoted verbatim in the "another copy" verdict
 * @returns {Finding[]} ordered entries: `{kind:'check'}` decided here, `{kind:'file'}` for the shell
 */
function wiringFindings(input) {
  const commands = declarations(input.settings);
  /** @type {Finding[]} */
  const out = [];
  // ── RESET first: without it, docs are never re-injected after compaction, in silence.
  const resets = declsFor(commands, HOOKS[RESET].re);
  out.push(said({ name: HOOKS[RESET].name, ok: resets.length >= 1, detail: HOOKS[RESET].detail }));
  pushFiles(out, resets, HOOKS[RESET], input.repoDir);
  // ── SINGLE HOOK: since the merge (2026-07-17), legacy-mcp-inject.js must NO LONGER be wired —
  //    the gate also injects MCP docs. Leaving it = MCP docs injected TWICE on every call (tokens
  //    burned in silence).
  out.push(said({
    name: 'legacy-mcp-inject.js is NO LONGER wired (the gate covers MCP — otherwise double injection)',
    ok: !commands.some((c) => /legacy-mcp-inject/.test(c)),
    detail: 'legacy-mcp-inject.js still wired in settings.json: MCP docs injected TWICE (gate + legacy).',
  }));
  // ── GATE (doc-inject.js): the UNIQUE injector (file + MCP) since the merge.
  // ⚠️ A GATE DECLARATION IS RECOGNISED BY WHAT IT CARRIES, NEVER BY ITS FILE NAME ALONE: on the
  //    http lane there is no file name at all, only a URL carrying the frame coordinates. Anchored
  //    on `frames=` and not on the host or the port, which are the operator's to choose.
  const gate = commands.filter(
    (c) => (/doc-inject\.js/.test(c) || /[?&]frames=\d+/.test(c)) && !/legacy-mcp-inject/.test(c),
  );
  out.push(said({
    name: 'the GATE (doc-inject.js) is wired — otherwise NO doc is injected at all',
    ok: gate.length >= 1,
    detail: 'doc-inject.js missing from settings.json: since the merge, IT is what injects ALL docs. Silent death.',
  }));
  // ── MULTI-FRAME COHERENCE. What is checked is the COHERENCE of the wiring, never its size: a
  //    missing or duplicated index makes an entire frame vanish IN SILENCE, and nothing else can see
  //    it (the wiring lives OUTSIDE the repo).
  // 🛑 JUDGEMENT REVERSED ON 2026-08-06, WRITTEN HERE SO IT IS NOT REDONE. Two checks lived here for
  //    a few hours — "the gate is declared ONLY ONCE" and "no `--frames N>1`". They are DELETED
  //    because their premise was FALSE: the requirement was never the display order, it is that the
  //    context be COMPLETE before the next tool call. One process = one output = one frame ceiling,
  //    so a corpus bigger than that needs several frames on the SAME gesture, i.e. N declarations.
  //    Falling back to 1 did not slow anything down: it made the agent act on incomplete knowledge
  //    for N-1 gestures. Do NOT resurrect them.
  const declares = gate.map((c) => {
    const n = coord(c, 'frames');
    return n === null ? 1 : n;
  });
  const uniqueN = [...new Set(declares)];
  out.push(said({
    name: 'every gate declaration announces the SAME number of frames',
    ok: uniqueN.length === 1,
    detail: `Divergent --frames values in settings.json: ${uniqueN.join(', ')}. The processes would split the content differently: the frames would no longer re-assemble.`,
  }));
  const expected = uniqueN.length === 1 ? uniqueN[0] : gate.length;
  out.push(said({
    name: 'there are exactly as many declarations as announced frames',
    ok: gate.length === expected,
    detail: `${gate.length} declaration(s) of doc-inject.js for --frames ${expected}. Each frame is carried by ONE process: ${expected - gate.length} are missing, so that content will NEVER leave this gesture.`,
  }));
  // ── BANDWIDTH IS DECLARED IN A SINGLE PLACE (2026-08-07).
  // 🔴 ERROR CLASS ALREADY PAID FOR ON 2026-08-05: a setting written in a harness's wiring and NEVER
  //    READ BACK by the engine. Measured result: a skill delivered in 11 gestures instead of 1 —
  //    with 995 green tests, 100 % mutation, doctor 27/27 and a live canary. A GREEN THAT LIES:
  //    nothing was broken, everything was degraded. Two places for the same number ALWAYS end up
  //    diverging, and that divergence is silent.
  // ⚠️ Key absent from the config = no opinion, no blame: nobody is forced to declare their
  //    bandwidth (a language does not impose a policy — same doctrine as `skillsWithoutPerimeter`).
  if (input.wantedFrames !== null) {
    out.push(said({
      name: `the wiring honours the declared bandwidth (frames: ${input.wantedFrames})`,
      ok: expected === input.wantedFrames && gate.length === input.wantedFrames,
      detail: `ctxroute-config.json asks for ${input.wantedFrames} frame(s), settings.json wires ${gate.length} (--frames ${expected}). The harness obeys settings.json: the REAL capacity is ${gate.length}, not ${input.wantedFrames}. Realign the two — this is exactly the silent divergence of 2026-08-05.`,
    }));
  }
  const indices = gate.map((c) => {
    const i = coord(c, 'frame');
    return i === null ? 0 : i;
  });
  indices.sort((a, b) => a - b);
  const expectedOnes = Array.from({ length: expected }, (_, i) => i + 1);
  out.push(said({
    name: 'the frame indices cover 1..N, with no gap and no duplicate',
    ok: JSON.stringify(indices) === JSON.stringify(expectedOnes),
    detail: `Declared --frame indices: [${indices.join(', ')}] instead of [${expectedOnes.join(', ')}]. A missing index = a frame never emitted; a duplicated index = content delivered twice. Both are SILENT.`,
  }));
  pushFiles(out, gate, GATE, input.repoDir);
  // ── The remaining hooks, in wiring order: session gate, write guard, turn counter, canary.
  // ⚠️ The `.filter` lives in `declsFor`, NOT inline in this loop: a traversal inside a traversal is
  //    a declared O(N²) here, and this one has no reason to be one.
  for (let i = SESSION; i < HOOKS.length; i += 1) {
    const hook = HOOKS[i];
    const decls = declsFor(commands, hook.re);
    out.push(said({ name: hook.name, ok: decls.length >= 1, detail: hook.detail }));
    if (hook.file) pushFiles(out, decls, hook, input.repoDir);
  }
  laneCoherence(out, input, commands, gate);
  return out;
}
/** @param {string[]} commands @param {RegExp} re @returns {string[]} */
function declsFor(commands, re) {
  return commands.filter((c) => re.test(c));
}
/** @param {Finding[]} out @param {string[]} decls @param {HookSpec} hook @param {string} repoDir */
function pushFiles(out, decls, hook, repoDir) {
  for (const c of decls) {
    const file = filePath(c, hook.base);
    if (file === null) continue;
    out.push({
      kind: 'file',
      base: hook.base,
      file,
      existsName: `the wired file exists: ${hook.base}`,
      absentDetail: hook.absent(file),
      copyName: `the wired ${hook.label} really is THIS repo: ${hook.base}`,
      copyDetail: hook.copy(file, repoDir),
    });
  }
}
// ── LANE COHERENCE — ALL THE CONSUMERS, OR NONE (2026-08-21) ────────────────
//
// 🔴 MEASURED IN PRODUCTION, THEN ROLLED BACK, THE SAME DAY. The injection state has FOUR
//    consumers: the gate (`doc-inject`), the session gate (which SHARES the `remainder-` queue with
//    it), the turn counter and the PreCompact reset. Only the gate was moved onto the daemon's
//    `type:"http"` lane; the daemon then owned its state IN RAM while the three others kept reading
//    and erasing FILES. Sequence measured: inject → the `once` is consumed → run the REAL PreCompact
//    hook → ask again ⇒ the daemon answered 2 bytes. After a compaction, skills and `once` documents
//    never came back — no error, no badge, no red gate anywhere. That is TWO MEMORIES, the exact
//    defect `client-core.js` exists to forbid ("one authority, or none"), reintroduced from OUTSIDE
//    the repo, where nothing here could see it. The wiring is this defect's ONLY possible witness.
//
// ⚠️ THE PEER LIST IS DERIVED, NEVER WRITTEN. A hand-written list only knows the consumers that
//    existed the day it was typed; the fifth one would join the split in silence. Same reasoning for
//    the flag itself — `LANE_FLAG` comes from `client-core.js`, never re-spelled here.
//
// ⚠️ A PEER WITH NO DECLARATION AT ALL IS NOT JUDGED HERE: "not wired" is the business of the checks
//    above, and accusing it twice would turn one fault into two reds. We judge only what IS declared.
//
// 🛑 ANTI-VACUITY: this check must be IMPOSSIBLE to pass while examining nothing. No gate
//    declaration, no derived consumer, or an unreadable `LANE_FLAG` ⇒ RED — "we could not measure"
//    is never "it is coherent".
/** @param {Finding[]} out @param {WiringInput} input @param {string[]} commands @param {string[]} gate */
function laneCoherence(out, input, commands, gate) {
  const flagReadable = typeof input.laneFlag === 'string' && input.laneFlag.length > 0;
  const laneRe = flagReadable
    ? new RegExp(input.laneFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : null;
  const consumers = input.consumers;
  const peers = new Set(consumers.filter((f) => f !== GATE_FILE));
  // ONE PASS over the declarations: a file name identifies the consumer (a `command` always carries
  // one), and the lane flag says which lane it reaches. A consumer declared SEVERAL times reaches
  // the daemon only if EVERY one of its declarations does — one disk-bound process is enough to
  // make a second memory.
  const lanes = new Map();
  for (const c of commands) {
    const m = /([A-Za-z0-9_.-]+\.js)/.exec(c);
    if (!m || !peers.has(m[1])) continue;
    const reached = laneRe !== null && laneRe.test(c);
    lanes.set(m[1], lanes.has(m[1]) ? lanes.get(m[1]) && reached : reached);
  }
  const diskSide = [...lanes.keys()].filter((n) => !lanes.get(n));
  const daemonSide = [...lanes.keys()].filter((n) => lanes.get(n));
  out.push(said({
    name: 'the lane-coherence check has something to judge (flag read, consumers derived, gate declared)',
    ok: flagReadable && consumers.includes(GATE_FILE) && peers.size >= 1 && gate.length >= 1,
    detail: `Lane coherence UNMEASURABLE: LANE_FLAG ${flagReadable ? `= ${input.laneFlag}` : 'unreadable from src/client-core.js'}, `
      + `${consumers.length} consumer(s) derived from src/hooks/ (gate ${consumers.includes(GATE_FILE) ? 'found' : 'MISSING'}), `
      + `${gate.length} gate declaration(s) in settings.json. A check that examines nothing is not a check that passes.`,
  }));
  // The GATE reaches the daemon when ANY of its declarations does: `type:"http"` (recognised by the
  // `"url"` key — the http lane has no file name at all) or a lane flag on the spawn lane. One frame
  // on the daemon is enough: that frame's deliveries are recorded in a memory the disk-bound peers
  // will never read, and never erase.
  const gateOnDaemon = gate.some((c) => /^\s*"url"/.test(c) || (laneRe !== null && laneRe.test(c)));
  out.push(said({
    name: 'every consumer of the injection state reaches the SAME authority (no split brain)',
    ok: !gateOnDaemon || diskSide.length === 0,
    detail: `SPLIT BRAIN in settings.json. On the DAEMON: ${[GATE_FILE, ...daemonSide].join(', ')}. `
      + `On the DISK (no ${input.laneFlag || '--client'}): ${diskSide.join(', ')}. `
      + 'The gate records its deliveries in the daemon\'s RAM while those peers read and erase the state FILES: TWO MEMORIES. '
      + 'MEASURED COST: after a compaction the reset wipes a disk the daemon never reads, so skills and `once` documents NEVER '
      + 'come back — no error, no badge, no red anywhere. '
      + `FIX: add \`${input.laneFlag || '--client'}\` to the declaration of each consumer listed on the disk side, or take the gate `
      + 'back off the daemon lane. All the consumers, or none — a shared state migrates for ALL of them or for NONE.',
  }));
}
// ═══════════════════════════════════════════════════════════════════════════
// A REDUCED MEASUREMENT MUST DECLARE ITSELF REDUCED (2026-08-22)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 MEASURED THAT DAY: `node tools/doctor.js` runs 14 checks, `--settings <path>` runs 67, and BOTH
//    printed `0 problem(s)` IN IDENTICAL WORDS. The wiring was validated with the reduced form, read
//    as healthy, and production shipped with a SPLIT BRAIN. The dead-man switch did not lie — it
//    answered a smaller question than the one it was asked, and said nothing about the difference.
//
// 🛑 SAME LAW AS `lint-corpus`'s LIVENESS PROBE: **"I could not measure" is never "it is healthy".**
//    A diagnostic whose scope silently shrinks is exactly the GREEN GATE THAT SEES NOTHING this
//    repository calls its worst defect — worse than a red, because it stops people looking.
//
// 🛑 THE FLAG IS NOT MADE MANDATORY, ON PURPOSE. A clean clone and CI legitimately have no
//    settings.json, and a doctor that refuses to run there would be uninstallable — the diagnostic
//    would be lost to protect its own completeness. What is refused is SILENCE about the gap.
//
// ⚠️ THE GROUP LIST IS A REGISTRY, NOT A SENTENCE: an optional check group added tomorrow declares
//    itself here and the notice names it by itself. A prose paragraph would go stale the day a
//    fourth flag appeared, and go stale SILENTLY — the class this whole file exists to close.
const OPTIONAL_GROUPS = Object.freeze([
  Object.freeze({
    flag: '--settings',
    missing: 'the installation (is any MCP server documented?) and the ENTIRE harness wiring: gate, '
      + 'PreCompact reset, session gate, write guard, turn counter, canary, frame coordinates, '
      + 'declared bandwidth, lane coherence',
  }),
  Object.freeze({
    flag: '--codex-hooks',
    missing: 'the Codex wiring: its six channels, the anti-double-injection rule and the context ceiling',
  }),
  Object.freeze({
    flag: '--codex-config',
    missing: 'the Codex feature flag (`hooks = true` present, deprecated `codex_hooks` absent)',
  }),
]);
/**
 * The notice a reduced run owes its reader. Empty array = nothing was reduced, say nothing.
 *
 * @param {object} input
 * @param {string[]} input.flagsGiven the optional flags actually passed on the command line
 * @param {number} input.ranCount how many checks really ran
 * @param {string|null} input.settingsPath the conventional settings.json address, null if unknown
 * @param {boolean} input.settingsExists whether a file sits at that address
 * @returns {string[]} the lines to print, in order
 */
function reducedNotice(input) {
  // ⚠️ A Set, not `flagsGiven.includes(...)` inside the filter: that would be a nested traversal, and
  //    complexity declares itself here like everywhere else.
  const given = new Set(input.flagsGiven);
  const skipped = OPTIONAL_GROUPS.filter((g) => !given.has(g.flag));
  if (skipped.length === 0) return [];
  const lines = [
    `⚠️ REDUCED MEASUREMENT — ${input.ranCount} check(s) ran, and that is NOT the whole framework.`,
  ];
  for (const g of skipped) lines.push(`   • \`${g.flag}\` not given ⇒ NOT MEASURED: ${g.missing}`);
  // ⚠️ The wiring lives OUTSIDE this repository, so NO test here can see it. When a settings.json is
  //    sitting at the conventional address and we did not read it, saying so is the difference
  //    between "nothing to check" and "something was there and we walked past it".
  const wiringSkipped = skipped.some((g) => g.flag === OPTIONAL_GROUPS[0].flag);
  if (wiringSkipped && input.settingsPath !== null) {
    if (input.settingsExists) {
      lines.push(`   🔴 ${input.settingsPath} EXISTS and was NOT read. The wiring lives outside this repository: nothing in it can see a dead hook.`);
      lines.push(`      Measure it: node tools/doctor.js --settings "${input.settingsPath}"`);
    } else {
      lines.push(`   ℹ no settings.json at ${input.settingsPath} — a clean clone and CI legitimately have none.`);
    }
  }
  lines.push('   🛑 "I could not measure" is never "it is healthy".');
  return lines;
}
module.exports = {
  GATE_FILE, GATE, DECL_RE, HOOKS, OPTIONAL_GROUPS,
  declarations, coord, filePath, wiringFindings, reducedNotice,
};
