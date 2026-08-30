#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// EXPLAIN — "for THIS gesture, what gets injected, and WHY?"
// ═══════════════════════════════════════════════════════════════════════
//
// RAISON D'ÊTRE (31/07/2026, REFACTOR-PLAN §E): the language claimed
// explainability as a central feature ("we can ALWAYS answer why did this
// get injected") and offered NO way to ask the question. MEASURED COST: a
// whole session. Lacking a tool, the agent RE-IMPLEMENTED the engine by hand
// to test its doc, got the harness wrong 3 times (wrong number of arguments,
// `{id,fm,body}` instead of `{doc,text}`), and each wrong probe produced a
// "mute" interpreted as a verdict ON THE ENGINE ⇒ FALSE conclusion "the
// engine must be modified", defended several times before being disproved.
// ⚠️ The lesson is NOT "the agent must be more rigorous" (a prose
//    instruction does not survive 40 sessions): it is that the only way to
//    query the language was to RE-IMPLEMENT it. This tool makes the mistake
//    IMPOSSIBLE.
//
// ⚠️ IT DECIDES NOTHING — read-only, off the critical path, ZERO state write
//    (the session store is never touched: a FRESH session is simulated).
//
// ⚠️ VITAL INVARIANT: it consumes the SAME functions as the gate
//    (collect-core → ADAPTERS → gate.decide). The "why NOT" is obtained by
//    RE-QUERYING those functions with variants of the rule (rule without
//    scope, rule without exclude), NEVER by re-implementing the matching.
//    Writing a 2nd match logic here would recreate EXACTLY the bug this tool
//    prevents. If a reason is missing, we add a PROBE, never a homemade
//    condition.
//
// USAGE:
//   node explain.js --tool Bash --input '{"command":"docker run -d nginx"}'
//   node explain.js --file C:/path/to/gate.js
//   node explain.js --doc zone-declaration --tool Bash --input '{...}'
//   node explain.js --tool WebFetch --json
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const { collectAll, loadConfig } = require('../src/collect-core');
const gate = require('../src/gate');
const { parse, validate, TRIGGERS, WILDCARD } = require('../src/frontmatter');
const { readCorpus } = require('../src/corpus');
const { rulesFromCorpus } = require('../src/loader');
const fileSource = require('../src/sources/file');
const toolSource = require('../src/sources/tool');
const paths = require('../src/paths');

// ── ARGUMENTS ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  // 🛑 NEVER FABRICATE AN INPUT IN SILENCE. `cwd` is a declared path key (harness-profile
  //    `pathKeys`) and TRIGGERS a skill alone. Defaulting it fits interactive use and is WRONG
  //    when replaying a recorded payload: the verdict is true, the QUESTION is not the one asked.
  //    Cost 2026-08-27: a session accusing this tool of diverging from production.
  //    ⚠️ A `cwd` inside `--input` lands in `toolInput`, NOT here.
  const a = { toolName: '', toolInput: {}, doc: null, json: false, cwd: process.cwd(), cwdFromFlag: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--tool') { a.toolName = v || ''; i++; }
    else if (k === '--input') { try { a.toolInput = JSON.parse(v); } catch { a.bad = '--input is not valid JSON'; } i++; }
    // Shortcut for the most common case: "what does an agent opening this file receive?"
    else if (k === '--file') { a.toolName = a.toolName || 'Read'; a.toolInput = { file_path: v }; i++; }
    else if (k === '--doc') { a.doc = v; i++; }
    else if (k === '--cwd') { a.cwd = v; a.cwdFromFlag = true; i++; }
    else if (k === '--json') a.json = true;
  }
  return a;
}

// ── VERDICT: what would REALLY be injected (authority = the gate) ───────
// ⚠️ state = {}: FRESH session. A real session has state (once already
//    consumed, smart counters) — say it, never let it be believed otherwise.
function verdict(config, payload) {
  const acc = collectAll(config, payload);
  // ⚠️ 7th argument = the TARGET (52): without it, the global filter would be
  //    invisible HERE but applied by the gate — the tool would describe an
  //    engine that does not exist, the exact defect its own doc forbids
  //    (same class as the cascade).
  const r = gate.decide(config, acc.decls, acc.matched, {}, 0, acc.owner, payload.toolName);
  return { acc, decision: r.decision, inject: r.inject, filteredOut: r.filteredOut };
}

// ── PROBES: the "why NOT", by re-querying the real sources ──────────────
// ⚠️ Each probe calls matchingDocs again with a rule AMPUTATED of one
//    operator. This is a DECOMPOSITION of the real decision, not a 2nd
//    implementation.
function matchesWith(rules, payload) {
  return fileSource.matchingDocs(rules, payload).length > 0;
}
// 🛑 THE PROBES KEEP `keys` — REMOVING IT WOULD FABRICATE A FALSE REASON. `keys` chooses
//    the UNIVERSE the three operators read, so a probe that drops it answers a question
//    about a DIFFERENT rule: the tool would blame `scope` for a silence caused by the key
//    universe. That is precisely the false reason this file exists to make impossible.
const withoutFilters = (rules) => rules.map((r) => ({ pattern: r.pattern, doc: r.doc, keys: r.keys }));
const sansScope = (rules) => rules.map((r) => {
  const out = { pattern: r.pattern, doc: r.doc, keys: r.keys };
  if (r.exclude) out.exclude = r.exclude;
  return out;
});
// The `keys` probe: the SAME rule minus that single operator. If the verdict flips, the
// key universe is the cause — and it is the only thing that can say so, since a narrowed
// rule fails through `match`, `scope` OR `exclude` depending on which key carried the term.
const sansKeys = (rules) => rules.map(({ keys, ...r }) => r);

// Contexts REALLY confronted with the patterns (same functions as the source).
function testedContexts(payload) {
  const { toolName, toolInput } = payload;
  const out = fileSource.extractFilePaths(toolName, toolInput).slice();
  const command = typeof toolInput.command === 'string' ? toolInput.command : '';
  if (toolName === 'Bash' && command) out.push(...fileSource.bashCandidates(command));
  return out;
}

// Diagnosis of ONE doc of the file corpus against ONE payload.
function diagnose(docId, text, payload) {
  const { data: fm, body } = parse(text);
  const declares = TRIGGERS.filter((k) => k in fm);
  const base = { doc: docId, declares, fm };

  const errs = validate(fm);
  if (errs.length > 0) {
    return { ...base, injects: false, motif: 'INVALID FRONTMATTER — the loader ignores the doc (loader.js), it is dead for ALL payloads', detail: errs };
  }
  if (fm.inject === 'never') {
    return { ...base, injects: false, motif: 'INTENTIONAL SILENCE (`inject: never`) — reference doc, never auto-injected' };
  }
  if (body.trim() === '') {
    return { ...base, injects: false, motif: 'EMPTY BODY once the frontmatter is removed — filtered by the adapter (protect-files parity)' };
  }

  // ── FILE axis ──
  const rules = rulesFromCorpus([{ doc: docId, text }]);
  if (fileSource.matchingDocs(rules, payload).length > 0) {
    return { ...base, injects: true, motif: 'MATCH through the path/the command (`match`/`rules`)', axe: 'file' };
  }
  // ── TOOL axis ──
  if ('tool' in fm) {
    if (toolSource.matchingDocs([{ doc: docId, fm }], payload).length > 0) {
      return { ...base, injects: true, motif: 'MATCH through the TOOL NAME (`tool`)', axe: 'outil' };
    }
    const names = toolSource.toolList(fm);
    // ⚠️ `targets()` = THE function of the source, never an `includes`
    //    rewritten here: with the wildcard, a bare `includes` would report
    //    "tool not listed" while the real reason is the scope — a FALSE
    //    REASON, i.e. exactly the mistake this tool exists to make
    //    impossible. Any question about matching is asked OF THE SOURCES,
    //    never of a local copy.
    if (!toolSource.targets(names, payload.toolName)) {
      // ⚠️ `piege?` annotation (㉑): the key is set AFTER creation — without
      //    it, tsc freezes the literal and refuses the assignment. Zero
      //    runtime effect.
      const d = /** @type {typeof base & { injects: boolean, axe: string, motif: string, piege?: string }} */ ({ ...base, injects: false, axe: 'outil', motif: `\`tool\` declared but the received tool is NOT in it — declared: ${JSON.stringify(names)}, received: ${JSON.stringify(payload.toolName)}` });
      // ⚠️ Since 31/07/2026, `*` IS a wildcard (§B). If it is declared and we
      //    land here, it means the payload has NO tool name: the wildcard
      //    requires that there BE a tool (deliberate negative case). Say it,
      //    otherwise the author believes their wildcard is broken and blames
      //    the engine.
      if (names.includes(WILDCARD)) d.trap = '⚠️ `*` IS a wildcard, but it requires a NON-EMPTY tool name — here the payload carries none. Check your `--tool`.';
      return d;
    }
    if (fm.keys !== undefined && toolSource.matchingDocs([{ doc: docId, fm: { ...fm, keys: undefined } }], payload).length > 0) {
      return { ...base, injects: false, axe: 'outil', motif: `\`keys\` SILENCED this rule — without it, it would inject. Declared: ${JSON.stringify(fm.keys)}` };
    }
    // The tool is targeted: so it is scope or exclude that rejected (tool
    // axis, where exclude's "context" is the TOOL NAME — cf sources/tool.js).
    // PROBE: we remove `scope` and ask the SOURCE again. If it passes, that
    // was it; otherwise it is `exclude` (which has priority in shouldSkip).
    if (toolSource.matchingDocs([{ doc: docId, fm: { ...fm, scope: undefined } }], payload).length > 0) {
      const d = /** @type {typeof base & { injects: boolean, axe: string, motif: string, piege?: string }} */ ({ ...base, injects: false, axe: 'outil', motif: `\`scope\` NOT SATISFIED — expects one of ${JSON.stringify(fm.scope)} in the tool parameters` });
      // 🛑 ㊵.a — A MUTE BOUND RECREATES THE VERY DEFECT IT ACCOMPANIES. If the
      //    payload was truncated, the scope may have failed on text NEVER READ:
      //    saying so here is the only thing that distinguishes "the term is
      //    absent" from "we did not look".
      const t = fileSource.textValues(payload.toolInput || {}).truncated;
      if (t) d.trap = `⚠️ Payload TRUNCATED (${t}) before the scope was evaluated — bounds ${fileSource.MAX_DEPTH} depth levels / ${fileSource.MAX_SIZE} characters. The term you are looking for may live in the unread part.`;
      return d;
    }
    return { ...base, injects: false, axe: 'outil', motif: `\`exclude\` REJECTED the tool name — excluded: ${JSON.stringify(fm.exclude)}` };
  }

  // ── No trigger consumable by this corpus ──
  if (rules.length === 0) {
    const inert = declares.filter((k) => k !== 'match' && k !== 'rules' && k !== 'tool');
    if (inert.length > 0) {
      // ⚠️ False green §A: `mcp:` is a KNOWN key, so validate() accepts it,
      //    and NO source consumes it for the file corpus.
      return { ...base, injects: false, motif: `INERT TRIGGER HERE: \`${inert.join('`/`')}\` is consumed by NO source of the file corpus`, trap: 'An MCP doc is triggered by its PATH (docs/mcp/{server}.md), never by a frontmatter key. Move the file. Target REFACTOR-PLAN §A.' };
    }
    return { ...base, injects: false, motif: 'NO usable trigger' };
  }

  // ── Did the pattern match before the filters? ──
  const command = typeof payload.toolInput.command === 'string' ? payload.toolInput.command : '';
  if (payload.toolName === 'Bash' && /^\s*git\s+/.test(command)) {
    return { ...base, injects: false, motif: 'GIT COMMAND IGNORED BY CONSTRUCTION (sources/file.js) — a file name inside a commit message would produce a false positive', trap: 'Test with a NON-git command: the silence here says nothing about your rule.' };
  }
  // ⚠️ ASKED BEFORE the other reasons: `keys` is UPSTREAM of the three operators, so a
  //    silence it caused would otherwise be attributed to whichever one happened to fail.
  if (rules.some((r) => r.keys !== undefined) && matchesWith(sansKeys(rules), payload)) {
    return { ...base, injects: false, axe: 'file', motif: `\`keys\` SILENCED this rule — without it, it would inject. Declared: ${JSON.stringify(rules.map((r) => r.keys).filter(Boolean))}`,
      trap: '⚠️ `keys` chooses WHICH parameter keys are readable. A `-name` removes one from the default universe; a bare list REPLACES that universe entirely — so a whitelist naming only path keys leaves NO command key, and vice versa.' };
  }
  if (!matchesWith(withoutFilters(rules), payload)) {
    return { ...base, injects: false, axe: 'file', motif: 'NO PATTERN matches', detail: { patterns: rules.map((r) => r.pattern), testedContexts: testedContexts(payload) },
      trap: '⚠️ `match` looks at PATHS (+ the POSIX shell command), NEVER at every parameter. To react to a GESTURE: `tool` + `scope`.' };
  }
  if (!matchesWith(sansScope(rules), payload)) {
    return { ...base, injects: false, axe: 'file', motif: `\`exclude\` REJECTED the path — excluded: ${JSON.stringify(rules.map((r) => r.exclude).filter(Boolean))}` };
  }
  return { ...base, injects: false, axe: 'file', motif: `\`scope\` NOT SATISFIED — expects one of ${JSON.stringify(rules.map((r) => r.scope).filter(Boolean))} in the tool parameters` };
}

// ── CORPUS: find a doc by name fragment ─────────────────────────────────
function findDoc(fragment) {
  const n = String(fragment).replace(/\\/g, '/').toLowerCase();
  for (const d of readCorpus(paths.fileDocsDir(), 'docs/')) {
    if (d.doc.toLowerCase().includes(n)) return d;
  }
  return null;
}

// ── RENDERING ──────────────────────────────────────────────────────────
// ⚠️ `config` is PASSED, never re-read here (09/08/2026): the bottom line
//    called `loadConfig()` INSIDE the loop, hence one disk re-read PER
//    injected doc, while `main()` already held the config. Harmless (tool off
//    the hot path), but it is a 2nd read of the source of truth at the very
//    moment the tool claims "here is the cadence the engine will apply" — and
//    the engine decided with the object from `main()`. One object, one verdict.
function render(a, res, diag, config) {
  const L = [];
  L.push('PAYLOAD');
  L.push('  tool   : ' + (a.toolName || '(none)'));
  L.push('  params : ' + JSON.stringify(a.toolInput));
  // 🛑 ALWAYS printed WITH its origin: a reader who cannot see which directory was judged
  //    cannot tell a real verdict from a verdict about another gesture.
  L.push('  cwd    : ' + a.cwd + (a.cwdFromFlag ? '   (from --cwd)' : '   (DEFAULTED to process.cwd() — pass --cwd to replay a recorded payload)'));
  L.push('');
  if (diag) {
    L.push('DOC  ' + diag.doc);
    L.push('  triggers     : ' + (diag.declares.length ? diag.declares.join(', ') : '(none)'));
    L.push('  VERDICT      : ' + (diag.injects ? '✓ INJECTED' : '✗ NOT INJECTED'));
    L.push('  REASON       : ' + diag.motif);
    if (diag.detail) L.push('  DETAIL       : ' + JSON.stringify(diag.detail, null, 2).split('\n').join('\n                 '));
    if (diag.trap) L.push('  ' + diag.trap);
    L.push('');
  }
  L.push('INJECTED — ' + res.inject.length + ' doc(s)   [FRESH session simulated: a real session has already consumed its `once`]');
  for (const d of res.inject) {
    // ⚠️ 3 ARGUMENTS, THE SOURCE INCLUDED (bug fixed on 09/08/2026): without
    //    it, cascade stage ② (`defaults.{source}.mode`) is ignored HERE but
    //    applied by `gate.decide` ⇒ this tool ANNOUNCED a cadence the engine
    //    does not use. That is precisely the defect its own doc forbids:
    //    "describing an engine that does not exist".
    L.push('  ✓ ' + d + '   source=' + (res.acc.owner[d] || '?') + '   cadence=' + gate.modeForDoc(config, res.acc.decls[d], res.acc.owner[d]));
  }
  // ⚠️ TWO DISTINCT discard reasons, never merged (52): the GLOBAL FILTER
  //    (filterMode/filterList — a config policy) and the CADENCE (a session
  //    state). Merging them would send the author to fix the wrong cause.
  const filtered = Array.isArray(res.filteredOut) ? res.filteredOut : [];
  if (filtered.length) {
    L.push('');
    L.push('MATCHED BUT DISCARDED BY THE GLOBAL FILTER (filterMode/filterList, cascade defaults.{source} > global) — ' + filtered.length);
    for (const d of filtered) L.push('  🚫 ' + d);
  }
  const discarded = res.acc.matched.filter((d) => !res.inject.includes(d) && !filtered.includes(d));
  if (discarded.length) {
    L.push('');
    L.push('MATCHED BUT DISCARDED BY THE CADENCE — ' + discarded.length);
    for (const d of discarded) L.push('  ~ ' + d);
  }
  L.push('');
  L.push('DECISION: ' + res.decision);
  return L.join('\n');
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.bad) { console.error(a.bad); process.exit(2); }
  const config = loadConfig();
  const payload = { toolName: a.toolName, toolInput: a.toolInput, cwd: a.cwd };
  const res = verdict(config, payload);

  let diag = null;
  if (a.doc) {
    const found = findDoc(a.doc);
    if (!found) { console.error('doc not found in the file corpus: ' + a.doc); process.exit(2); }
    diag = diagnose(found.doc, found.text, payload);
  }

  if (a.json) {
    console.log(JSON.stringify({ payload: { toolName: a.toolName, toolInput: a.toolInput }, inject: res.inject, decision: res.decision, matched: res.acc.matched, diagnostic: diag ? { doc: diag.doc, injects: diag.injects, motif: diag.motif, trap: diag.trap || null, detail: diag.detail || null } : null }, null, 2));
  } else {
    console.log(render(a, res, diag, config));
  }
  process.exit(0);
}

// ⚠️ FAIL-LOUD, the OPPOSITE of the hooks (mute fail-open): a diagnostic that
//    stays silent about its own failure would return a "nothing gets
//    injected" that would be mistaken for a verdict on the engine — the exact
//    mistake of 31/07. Short message + exit 2, never a raw 10-line stack.
if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[explain] TOOL FAILURE (this is NOT a verdict on the engine): ' + (e && e.message));
    console.error('  corpus read: ' + paths.fileDocsDir());
    process.exit(2);
  }
}

module.exports = { parseArgs, verdict, diagnose, testedContexts, findDoc };
