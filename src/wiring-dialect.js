// ═══════════════════════════════════════════════════════════════════════
// wiring-dialect.js — A HARNESS'S WIRING DIALECT IS DATA (pure, no I/O)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE HOLE THIS CLOSES, AND IT WAS WRITTEN DOWN BEFORE IT WAS FILLED.
//    `wiring-plan.js` made the framework's declarations a GENERATED artefact,
//    which killed the class "one truth, nineteen hand-edited copies". But it
//    could only ever produce ONE SHAPE — the `settings.json` of Claude Code:
//    JSON, at one address, nested as `hooks[event][].hooks[]`. Codex keeps the
//    same nesting in `~/.codex/config.toml`: ANOTHER FORMAT, ANOTHER ADDRESS.
//    So its wiring was still written by hand, i.e. still exposed to the exact
//    defect the manifest exists to remove — one harness protected, the others
//    not, and nothing anywhere said so.
//
// 🛑 THE RULE THIS FILE OBEYS, AND IT IS THE PROJECT'S FOUNDING ONE: THE
//    ENGINE MUST NOT MOVE WHEN A NEED APPEARS. A generator that learned one
//    special case per product would be a TOOL — it would cover the harnesses
//    somebody foresaw, and every new one would bring the maintainer back. So
//    what VARIES between harnesses is DECLARED, here, in data:
//      · the serialization FORMAT (which codec writes the document);
//      · the LAYOUT (where declarations live in the document, how they nest,
//        and what every field is CALLED);
//      · the EVENTS the harness actually has;
//      · whether its file can be SPLICED, or only handed over as a fragment.
//    What DECIDES — frame coordinates, the state lane, the bound, ownership —
//    stays in `wiring-plan.js`, shared by every harness. 🛑 There is no
//    harness NAME anywhere in either module's logic, and there must never be:
//    `test/wiring-harness-portability.test.js` derives the forbidden literals
//    from the manifests themselves and turns red the day one appears.
//
// ⚠️ PURE ON PURPOSE — no `fs`, no `process`, no clock. The manifest arrives
//    parsed, the document leaves as a string. That is what lets a fictional
//    harness be exercised from a fixture, and what makes the module mutable.
//
// 🛑 EVERY REFUSAL IS NAMED AND THROWS, and the two that matter most are the
//    ones a lenient generator would swallow:
//      · an UNKNOWN FORMAT is refused, never written as the format we happen
//        to know — a harness handed a document in the wrong syntax reads
//        NOTHING, and reports nothing;
//      · a field the LAYOUT NAMES NO KEY FOR is refused, never dropped — a
//        silently dropped bound, matcher or endpoint produces a wiring that
//        runs and differs from what was declared, which is this repository's
//        one unacceptable failure mode.
//    The single thing that is SKIPPED rather than refused is an event the
//    harness does not have — and it is NAMED to the caller, because a path
//    quietly missing from a wiring is indistinguishable from one that works.

'use strict';

/** The segment a container path uses to mean "one branch per event". */
const EVENT_PLACEHOLDER = '{event}';

/**
 * The fields a generated declaration may carry, in the order they are written.
 *
 * ⚠️ A FUNCTION, NOT A MODULE-LEVEL CONSTANT, and that is not style. A literal
 *    evaluated once at module load is a STATIC mutant: the vitest runner keeps
 *    its workers alive with modules cached, so Stryker never re-evaluates it
 *    and it survives every test that could kill it. Same remedy as
 *    `knownEvents()` in `wiring-plan.js` and `derived-observables.js`.
 * ⚠️ `event` and `matcher` are NOT here: they are STRUCTURAL — the layout may
 *    place them in the container path, in a block or in the entry, so they are
 *    handled by the renderer, never by the field loop.
 *
 * @returns {string[]} the declaration fields a layout must be able to name.
 */
function declarationFields() {
  return ['type', 'command', 'url', 'timeout', 'statusMessage'];
}

/**
 * The serialization codecs a harness may declare. An unknown one is a NAMED
 * REFUSAL: a document written in a syntax the harness cannot parse runs
 * NOTHING, silently, which is worse than not being written at all.
 * ⚠️ A FUNCTION, for the reason given above.
 * @returns {string[]}
 */
function knownFormats() {
  return ['json', 'toml'];
}

/**
 * What a harness lets us do to its wiring file.
 * `splice` = we edit the operator's file in place, under the four guards of
 * `tools/wiring-generate.js`. `fragment` = we emit the block and the operator
 * pastes it — an HONEST mode, and the right one whenever an in-place edit
 * cannot be PROVEN safe. A `fragment` declaration must carry its REASON, so
 * the absence of the write mode is a stated fact and never an oversight.
 * @returns {string[]}
 */
function knownWriteModes() {
  return ['splice', 'fragment'];
}

/** How declarations nest under the container. @returns {string[]} */
function knownGroupings() {
  return ['blocks', 'flat'];
}

/** Where the matcher is written. `none` = the harness has no such notion. @returns {string[]} */
function knownMatcherPlaces() {
  return ['block', 'entry', 'none'];
}

function fail(message) {
  throw new Error(`wiring dialect: ${message}`);
}

/** TOML bare keys, official spec v1.0.0 (read 2026-08-23): `A-Za-z0-9_-` only. */
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * Reads and VALIDATES the `harness` block of a manifest.
 *
 * 🛑 THE BLOCK IS REQUIRED, WITH NO DEFAULT. A generator that assumed a shape
 *    when none was declared would write one harness's dialect into another
 *    harness's file — accepted, wired, and inert. The whole point of this file
 *    is that the shape is SAID.
 *
 * @param {any} manifest - the parsed manifest.
 * @returns {{name: string, format: string, write: {mode: string, reason?: string}, events: Record<string,string>, layout: any}}
 */
function dialect(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('unreadable manifest');
  const h = manifest.harness;
  if (!h || typeof h !== 'object' || Array.isArray(h)) {
    fail('`harness` is missing — a manifest declares WHICH harness it wires (format, events, layout, write mode). There is no default: assuming one product\'s shape for another writes a document that harness reads as nothing at all, with no error and no log');
  }
  if (typeof h.name !== 'string' || h.name.length === 0) fail('`harness.name` is a non-empty string — every refusal below quotes it, and a refusal that cannot name the harness sends the reader to the wrong file');

  if (!knownFormats().includes(h.format)) {
    fail(`\`harness.format\` must be one of ${knownFormats().join(' | ')}, got ${JSON.stringify(h.format)} — an unknown format is REFUSED, never written in the one we happen to know: a harness handed a document in the wrong syntax runs NOTHING and says nothing. Adding a format is adding a CODEC (one entry in \`knownFormats\` and its writer), never a branch per product`);
  }

  const write = h.write;
  if (!write || typeof write !== 'object' || Array.isArray(write)) fail(`\`harness.write\` is an object declaring at least \`mode\` (${knownWriteModes().join(' | ')}) — whether this tool may edit the operator's only copy of their configuration is not a thing to leave unsaid`);
  if (!knownWriteModes().includes(write.mode)) {
    fail(`\`harness.write.mode\` must be one of ${knownWriteModes().join(' | ')}, got ${JSON.stringify(write.mode)}`);
  }
  if (write.mode === 'fragment' && (typeof write.reason !== 'string' || write.reason.length === 0)) {
    fail('`harness.write.reason` is a non-empty string when the mode is `fragment` — the ABSENCE of the write mode is a declared fact with a cause, never an omission somebody will later mistake for one');
  }

  const events = h.events;
  if (!events || typeof events !== 'object' || Array.isArray(events)) fail('`harness.events` maps this framework\'s event names to the harness\'s own — a harness that names its events differently, or lacks one entirely, is a DIALECT fact and it is declared here');
  const names = Object.keys(events);
  if (names.length === 0) fail('`harness.events` is empty — every consumer would be skipped and the generated wiring would be EMPTY, which is indistinguishable from a harness where the framework was never wired');
  // 🛑 TWO OF THIS FRAMEWORK'S EVENTS SPOKEN WITH ONE NAME IS REFUSED HERE,
  //    at the declaration, and not later when a document is being built. Down
  //    there the two sets would simply MERGE into one branch — a document that
  //    is valid, that runs, and in which nothing says that two distinct
  //    moments of an agent's life were collapsed into one. If a harness really
  //    has a single event covering both, say so by declaring one of them and
  //    letting the other be SKIPPED and NAMED: an absence that is announced
  //    beats a merge nobody asked for.
  const spokenNames = new Map();
  for (const canonical of names) {
    const spoken = events[canonical];
    if (typeof spoken !== 'string' || spoken.length === 0) fail(`\`harness.events.${canonical}\` is a non-empty string`);
    if (spokenNames.has(spoken)) {
      fail(`\`harness.events\` speaks both ${JSON.stringify(spokenNames.get(spoken))} and ${JSON.stringify(canonical)} as ${JSON.stringify(spoken)} — two distinct moments of an agent's life would silently share one branch of the document. Declare the one this harness really has, and let the other be skipped and named`);
    }
    spokenNames.set(spoken, canonical);
  }

  return { name: h.name, format: h.format, write, events, layout: layoutOf(h, h.name) };
}

/**
 * Reads and VALIDATES the layout: where declarations live, how they nest, and
 * what each field is called.
 *
 * @param {any} h - the `harness` block.
 * @param {string} name - the harness's name, quoted in refusals.
 * @returns {any} the validated layout.
 */
function layoutOf(h, name) {
  const l = h.layout;
  if (!l || typeof l !== 'object' || Array.isArray(l)) fail(`\`harness.layout\` is missing for ${JSON.stringify(name)} — the shape of a wiring document is the whole of what differs between harnesses, and it is not guessed`);

  const container = l.container;
  if (!Array.isArray(container) || container.length === 0 || container.some((s) => typeof s !== 'string' || s.length === 0)) {
    fail('`harness.layout.container` is a non-empty list of non-empty strings — the path in the document where our declarations live');
  }
  const placeholders = container.filter((s) => s === EVENT_PLACEHOLDER).length;
  if (placeholders > 1) fail(`\`harness.layout.container\` carries ${placeholders} \`${EVENT_PLACEHOLDER}\` segments — a declaration belongs to exactly one event, so exactly one segment may branch on it`);
  const perEvent = placeholders === 1;

  if (!knownGroupings().includes(l.grouping)) {
    fail(`\`harness.layout.grouping\` must be one of ${knownGroupings().join(' | ')}, got ${JSON.stringify(l.grouping)} — \`blocks\` nests entries under a matcher-carrying block, \`flat\` writes one object per declaration`);
  }
  const matcherIn = l.matcherIn === undefined ? 'none' : l.matcherIn;
  if (!knownMatcherPlaces().includes(matcherIn)) {
    fail(`\`harness.layout.matcherIn\` must be one of ${knownMatcherPlaces().join(' | ')}, got ${JSON.stringify(l.matcherIn)}`);
  }

  // 🛑 `blocks` EXISTS TO CARRY A MATCHER. A block grouping whose matcher lives
  //    in the entry (or nowhere) is a nesting level that holds nothing, and a
  //    shape nobody can read back is a shape nobody can judge.
  if (l.grouping === 'blocks' && matcherIn !== 'block') {
    fail(`\`harness.layout.grouping: "blocks"\` requires \`matcherIn: "block"\` (got ${JSON.stringify(matcherIn)}) — the block level exists to carry the matcher; one that carries nothing is an empty nesting nobody can read back`);
  }
  if (l.grouping === 'flat' && matcherIn === 'block') {
    fail('`harness.layout.grouping: "flat"` has no block to write a matcher into — declare `matcherIn: "entry"`, or `"none"` if this harness has no matchers at all');
  }

  const key = (field, required) => {
    const v = l[field];
    if (v === undefined) {
      if (required) fail(`\`harness.layout.${field}\` is required for this layout`);
      return undefined;
    }
    if (typeof v !== 'string' || v.length === 0) fail(`\`harness.layout.${field}\` is a non-empty string`);
    return v;
  };

  const entriesKey = key('entriesKey', l.grouping === 'blocks');
  const matcherKey = key('matcherKey', matcherIn !== 'none');
  // ⚠️ THE EVENT IS WRITTEN IN EXACTLY ONE PLACE. Either the container branches
  //    on it, or the entry names it — declaring BOTH would be two places for
  //    one fact, the very class the manifest exists to remove, rebuilt inside
  //    the file that removes it.
  const eventKey = key('eventKey', !perEvent);
  if (perEvent && eventKey !== undefined) {
    fail(`\`harness.layout.eventKey\` may not be declared when \`container\` already branches on \`${EVENT_PLACEHOLDER}\` — that would write one fact in two places`);
  }

  const fields = l.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('`harness.layout.fields` maps this framework\'s declaration fields to the harness\'s own key names');
  for (const f of Object.keys(fields)) {
    if (!declarationFields().includes(f)) fail(`\`harness.layout.fields.${f}\` names no field this framework generates (${declarationFields().join(', ')}) — an unknown mapping is a typo that would silently never apply`);
    if (typeof fields[f] !== 'string' || fields[f].length === 0) fail(`\`harness.layout.fields.${f}\` is a non-empty string`);
  }

  return { container, perEvent, grouping: l.grouping, matcherIn, entriesKey, matcherKey, eventKey, fields };
}

/**
 * Is this layout one that `wiring-plan.splice` can edit in place?
 *
 * 🛑 A PROPERTY OF THE LAYOUT, NEVER OF A PRODUCT. The splice walks a
 *    two-level tree (a container branching on the event, blocks carrying a
 *    matcher, entries under a key) in a format it can re-read and compare
 *    byte for byte. ANY harness whose wiring has that shape gets the write
 *    mode for free; any other gets the fragment mode and its reason. That is
 *    what keeps a third harness free of engine work.
 *
 * @param {{format: string, layout: any}} d - a validated dialect.
 * @returns {string|null} `null` when the splice applies, else why it does not.
 */
function spliceObstacle(d) {
  if (d.format !== 'json') {
    return `its wiring is \`${d.format}\`, and an in-place edit re-reads the file and compares it BYTE FOR BYTE with what was intended — a comparison only a format we can rewrite losslessly supports. Rewriting a commented document through a parser destroys the operator's comments, which are theirs and not ours`;
  }
  if (d.layout.grouping !== 'blocks') return `its declarations are \`${d.layout.grouping}\`, and the splice replaces entries inside matcher-carrying blocks`;
  if (!d.layout.perEvent || d.layout.container.length !== 2 || d.layout.container[1] !== EVENT_PLACEHOLDER) {
    return `its container is \`${d.layout.container.join('.')}\`, and the splice walks a container that branches on the event at its second segment`;
  }
  return null;
}

/**
 * Turns the neutral declaration list into the harness's document.
 *
 * ⚠️ AN EVENT THE HARNESS DOES NOT HAVE IS SKIPPED AND NAMED, never bodged.
 *    A path silently missing from a wiring looks exactly like one that works,
 *    and the caller is the only layer that can tell the operator.
 *
 * @param {{event: string, matcher: (string|null)}[]} declarations - `plan()`'s output.
 * @param {any} d - a validated dialect.
 * @returns {{document: any, skipped: any[], skippedEvents: string[]}}
 */
function render(declarations, d) {
  if (!Array.isArray(declarations) || declarations.length === 0) {
    fail('nothing to render — an empty declaration set produces an empty document, and an empty document agrees with a harness where the framework was never wired');
  }
  if (!d || typeof d !== 'object' || !d.layout) fail('render was given no validated dialect');
  const { layout } = d;

  const skipped = declarations.filter((x) => !Object.prototype.hasOwnProperty.call(d.events, x.event));
  const kept = declarations.filter((x) => Object.prototype.hasOwnProperty.call(d.events, x.event));
  const skippedEvents = [...new Set(skipped.map((x) => x.event))].sort();
  if (kept.length === 0) {
    fail(`${JSON.stringify(d.name)} declares none of the events this manifest's consumers use (${skippedEvents.join(', ')}) — every path would be skipped and the document would be empty, which is indistinguishable from an unwired machine`);
  }

  // ── ONE ENTRY, FIELD BY FIELD, AND NOTHING SILENTLY DROPPED ────────
  const entryOf = (x) => {
    const e = {};
    if (layout.eventKey !== undefined) e[layout.eventKey] = d.events[x.event];
    if (layout.matcherIn === 'entry' && x.matcher !== null) e[layout.matcherKey] = x.matcher;
    for (const f of declarationFields()) {
      if (x[f] === undefined) continue;
      const k = layout.fields[f];
      if (k === undefined) {
        fail(`a declaration carries \`${f}\` and ${JSON.stringify(d.name)} names no key for it — writing the document anyway would DROP it: the harness would run a wiring that differs from what was declared, with no error and no log. Declare \`harness.layout.fields.${f}\`, or stop generating that field for this harness`);
      }
      e[k] = x[f];
    }
    return e;
  };

  if (layout.matcherIn === 'none') {
    const matched = kept.filter((x) => x.matcher !== null);
    if (matched.length > 0) {
      fail(`${matched.length} declaration(s) carry a matcher and ${JSON.stringify(d.name)} declares \`matcherIn: "none"\` — dropping it would widen the hook from a named tool to EVERY tool call, silently. Declare where this harness writes a matcher, or stop declaring one in the manifest`);
    }
  }

  // ── THE BRANCHES, IN FIRST-APPEARANCE ORDER (determinism is a contract) ──
  const branches = new Map();
  for (const x of kept) {
    // ⚠️ `null`, NOT A STRING LITERAL. When `!perEvent` every declaration
    //    shares ONE bucket regardless of its real event (the container has no
    //    `{event}` segment to write it into, and `entryOf` already names the
    //    event via `eventKey`) — the exact VALUE used as that bucket's Map key
    //    is unobservable in the rendered document, so any distinct constant is
    //    equally correct. `null` says "no per-event branch" without inventing
    //    a string nothing ever reads.
    const branch = layout.perEvent ? d.events[x.event] : null;
    if (!branches.has(branch)) branches.set(branch, []);
    branches.get(branch).push(x);
  }

  const document = {};
  for (const [branch, group] of branches) {
    const list = layout.grouping === 'flat' ? group.map(entryOf) : blocksOf(group, layout, entryOf);
    // ⚠️ NO COLLISION GUARD HERE, AND THAT IS DELIBERATE. Branch names are the
    //    harness's own event names, and `dialect()` already refuses two of
    //    ours spoken as one, so no input can make two branches share a path.
    //    A guard for that would be UNREACHABLE — an equivalent mutant, which
    //    this repository removes at the source instead of freezing with a test.
    place(document, layout.container.map((s) => (s === EVENT_PLACEHOLDER ? branch : s)), list);
  }
  return { document, skipped, skippedEvents };
}

/** Groups a branch's declarations into matcher-carrying blocks, order preserved. */
function blocksOf(group, layout, entryOf) {
  const byMatcher = new Map();
  for (const x of group) {
    const k = x.matcher === null ? '' : x.matcher;
    if (!byMatcher.has(k)) byMatcher.set(k, []);
    byMatcher.get(k).push(x);
  }
  return [...byMatcher.entries()].map(([m, group_]) => {
    const block = {};
    if (m !== '') block[layout.matcherKey] = m;
    block[layout.entriesKey] = group_.map(entryOf);
    return block;
  });
}

/** Writes `value` at `path` in `doc`, creating the intermediate tables. */
function place(doc, path, value) {
  let node = doc;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (node[path[i]] === undefined) node[path[i]] = {};
    node = node[path[i]];
  }
  node[path[path.length - 1]] = value;
}

// ═══════════════════════════════════════════════════════════════════════
// THE CODECS — a format is a WRITER, never a branch per product
// ═══════════════════════════════════════════════════════════════════════

/**
 * Writes a rendered document in the declared format.
 * @param {any} document
 * @param {string} format
 * @returns {string} the document, ending with a newline.
 */
function serialize(document, format) {
  if (format === 'json') return `${JSON.stringify(document, null, 2)}\n`;
  if (format === 'toml') return toml(document);
  // ⚠️ NO `return` AFTER THIS — `fail()` always throws, so any statement past
  //    it is unreachable: dead code Stryker cannot even schedule a test
  //    against, which is exactly why it is removed here instead of frozen
  //    under one.
  fail(`no writer for format ${JSON.stringify(format)} — the format was accepted and nothing can write it, which is an accepted-and-inert capability, the shape of defect this framework refuses`);
}

// ── TOML, THE SUBSET WE GENERATE AND NOTHING ELSE ────────────────────
// 🛑 THIS IS A WRITER, NEVER A PARSER, AND THE DISTINCTION IS THE WHOLE
//    SAFETY ARGUMENT. It only ever writes values THIS framework produced —
//    POSIX command lines, a URL, integers, event names — so the escaping
//    surface is closed. Anything outside that closed set is a NAMED REFUSAL
//    rather than a guessed escape: a document written with a wrong escape is a
//    document the harness silently fails to parse.
// 📐 SPEC READ 2026-08-23, TOML v1.0.0 (toml.io/en/v1.0.0): bare keys are
//    `A-Za-z0-9_-` only; a basic string must escape the quotation mark, the
//    backslash and every control character other than tab. We therefore REFUSE
//    those characters instead of escaping them — nothing we generate contains
//    one, so a refusal here means the input stopped being what we think it is.
function tomlKey(k) {
  if (!BARE_KEY.test(k)) fail(`\`${k}\` cannot be written as a TOML bare key (spec v1.0.0: A-Za-z0-9_- only) — quoting it here would be guessing at an escaping this writer deliberately does not implement`);
  return k;
}

function tomlValue(v, where) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) fail(`\`${where}\` holds a non-finite number — TOML has no writing for it`);
    return String(v);
  }
  if (typeof v === 'string') {
    // eslint-disable-next-line no-control-regex
    if (/["\\]|[\u0000-\u0008\u000A-\u001F\u007F]/.test(v)) {
      fail(`\`${where}\` holds a string this writer refuses to escape (${JSON.stringify(v)}) — quotation marks, backslashes and control characters need escaping, and this framework generates none of them: a value carrying one is a sign the input is no longer what we think it is, not an invitation to guess`);
    }
    return `"${v}"`;
  }
  // ⚠️ NO `return` AFTER THIS — same reason as `serialize()` above: `fail()`
  //    always throws, so anything past it is unreachable.
  fail(`\`${where}\` holds a value of type ${v === null ? 'null' : typeof v}, which this writer does not produce and will not invent`);
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {any} document
 * @returns {string}
 */
function toml(document) {
  const out = [];
  emitTable(document, [], out);
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/** A table earns a header when it holds a scalar of its own, or holds nothing at all. */
function needsHeader(obj) {
  const keys = Object.keys(obj);
  return keys.length === 0 || keys.some((k) => !Array.isArray(obj[k]) && !isPlainObject(obj[k]));
}

function emitTable(obj, path, out) {
  const scalars = [];
  const tables = [];
  const arrays = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) arrays.push(k);
    else if (isPlainObject(v)) tables.push(k);
    else scalars.push(k);
  }
  // Scalars first: an array-of-tables header opens a new element, so a scalar
  // written after one would land in the wrong table.
  for (const k of scalars) out.push(`${tomlKey(k)} = ${tomlValue(obj[k], [...path, k].join('.'))}`);
  if (scalars.length > 0) out.push('');
  for (const k of tables) {
    const p = [...path, k];
    // ⚠️ A HEADER ONLY WHERE IT CARRIES SOMETHING. TOML IMPLIES the parent
    //    tables of a dotted header, so `[a]` written above `[[a.b]]` is a legal
    //    but empty line — noise in a document a human is meant to paste and
    //    read. An intentionally EMPTY table keeps its header: dropping that one
    //    would lose the only thing it says.
    if (needsHeader(obj[k])) out.push(`[${p.map(tomlKey).join('.')}]`);
    emitTable(obj[k], p, out);
  }
  for (const k of arrays) {
    const p = [...path, k];
    for (const element of obj[k]) {
      if (!isPlainObject(element)) fail(`\`${p.join('.')}\` holds a list of values this writer does not produce — only lists of tables are written, and inventing an inline array here would be guessing`);
      out.push(`[[${p.map(tomlKey).join('.')}]]`);
      emitTable(element, p, out);
    }
  }
}

module.exports = {
  dialect, render, serialize, spliceObstacle,
  declarationFields, knownFormats, knownWriteModes, knownGroupings, knownMatcherPlaces,
  EVENT_PLACEHOLDER,
};
