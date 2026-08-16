// ═══════════════════════════════════════════════════════════════════════
// SUBSTRATE GATE — which PROJECTIONS of the event does each source SEE?
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY IT EXISTS (12/08/2026). There are TWO symmetries to hold, and the
//    repo only kept one:
//      ① the VOCABULARY — which operators a corpus ACCEPTS (gates ① and ② of
//         frontmatter.test.js);
//      ② the SUBSTRATE — which projections of the event a source LOOKS AT.
//    **Two of the three defects of that day were SUBSTRATE defects**: ㊵
//    (`scope` only read the 1st level ⇒ blind to the 16 MCP servers) and ㊴
//    part ② (`serverMatches` did not consult `scope`). A corpus can therefore
//    accept EXACTLY the same words and behave differently — and a gate
//    comparing KEYS cannot see it.
//
// 🛑 A SUBSTRATE HOLE BREAKS NOTHING: it makes things MUTE. And a silence is
//    indistinguishable from correct behaviour — no test, no mutation, no
//    doctor sees it, because they all prove what IS DELIVERED. That is the
//    raison d'être of this file: making the absence OBSERVABLE.
//
// ⚠️ PROBED BY BEHAVIOUR, NEVER BY TEXT. We place a unique WITNESS in a
//    projection and ask the REAL source whether it reacts. A code scan
//    (grep/AST) would say "the file mentions cwd" — yet `sources/file.js`
//    READS `toolInput.cwd` while nothing ever puts it there: a capability
//    present and INERT. Only behaviour decides.
//    (Same doctrine as symmetry gate ①: "the corpora are PROBED".)
//
// ⚠️ ADDING A SOURCE ⇒ ADDING ITS LINE HERE. Part ③ requires it: a registry
//    source absent from this table is RED. Without that the gate would be
//    born blind to the next source — the very defect it fights.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fileSource from '../src/sources/file.js';
import toolSource from '../src/sources/tool.js';
import mcpSource from '../src/sources/mcp.js';
import skillSource from '../src/sources/skill.js';
import { ADAPTERS } from '../src/source-adapters.js';

// Witness: a string existing nowhere else, so that a match is necessarily DUE
// to the projection under test (never to a corpus residue).
const T = 'temoin-substrat-9f3a';

// THE PROJECTIONS OF THE EVENT — that is all the harness gives.
// ⚠️ `cwd` lives at the ROOT of the payload (set by porte-core), not inside
//    toolInput: that is precisely what makes a single source see it.
// ⚠️ The WITNESS tool name is a CONSTANT shared by the projection AND by the
//    probed declarations: a declaration must be derived from the WITNESS,
//    never from the received payload — otherwise it would match everything
//    and part ④ would fall.
const NOM_OUTIL_TEMOIN = 'mcp__' + T + '__appel';

const PROJECTIONS = {
  'tool name': () => ({ toolName: NOM_OUTIL_TEMOIN, toolInput: {} }),
  'path (flat param)': () => ({ toolName: 'Read', toolInput: { file_path: '/x/' + T + '/y.js' } }),
  'shell command': () => ({ toolName: 'Bash', toolInput: { command: 'cd /x/' + T + ' && npm test' } }),
  'NESTED param (MCP)': () => ({ toolName: 'mcp__srv__appel', toolInput: { args: { q: T } } }),
  'cwd': () => ({ toolName: 'Read', toolInput: { file_path: '/ailleurs/z.js' }, cwd: '/x/' + T }),
};

// For each source: ALL the declarations an author could write to react to the
// witness. We ask "does at least ONE of them match?". We therefore measure the
// CAPABILITY offered to the author, never an implementation detail.
// 🛑 THIS BLOCK HAS ALREADY LIED ONCE (12/08/2026, on the 1st run): it did not
//    offer the `tool: [<exact name>]` form and therefore declared `skill`
//    BLIND to the tool name — a FALSE blindness, which was about to be
//    engraved with its justification. **An incomplete probe manufactures
//    exactly the false knowledge this gate fights.**
//    ⇒ Any source owning an axis must be probed ON THAT AXIS.
const SOURCES = {
  file: (payload) => fileSource.matchingDocs([{ pattern: T, doc: 'd' }], payload).length > 0,
  tool: (payload) =>
    toolSource.matchingDocs([{ doc: 'd', fm: { tool: [NOM_OUTIL_TEMOIN] } }], payload).length > 0
    || toolSource.matchingDocs([{ doc: 'd', fm: { tool: ['*'], scope: [T] } }], payload).length > 0,
  mcp: (payload) => mcpSource.matchingDocs({}, payload).some((c) => c.doc.includes(T)),
  skill: (payload) =>
    skillSource.matchingSkills({ skills: { s: { match: [T] } } }, payload).length > 0
    || skillSource.matchingSkills({ skills: { s: { tool: [NOM_OUTIL_TEMOIN] } } }, payload).length > 0
    || skillSource.matchingSkills({ skills: { s: { tool: ['*'], scope: [T] } } }, payload).length > 0,
};

// 🛑 THE ONLY ADMITTED BLINDNESSES — each with its REASON. Adding an entry
//    here is a WRITTEN DECISION, never a way to silence the gate.
//    Key = `source/projection`.
const CECITES_JUSTIFIEES = {
  'file/tool name':
    "The FILE source matches PATHS; the tool name is the DISJOINT axis of the `tool` source "
    + "(created on 19/07/2026 exactly for that). Merging them would make `WebFetch` match inside a "
    + "file path — the false positive that the disjunction of the keys eliminates by construction.",
  'file/NESTED param (MCP)':
    "`match` matches ONLY paths (+ the command of a POSIX shell): an MCP param is not a "
    + "path. FILTERING on a nested param, however, IS covered since ㊵ (`scope`, recursive "
    + "flattening) — it is the TRIGGERING that stays path-only, and that is intended (locality).",
  'file/cwd':
    "PARITY with the FROZEN oracle `protect-files.js`: `sources/file.js` is its exact replica and the "
    + "differential (2,434 cases) requires it. `file.js` KNOWS how to read `toolInput.cwd`, but `porte-core` "
    + "only puts it there for the `skill` source ⇒ a capability present and INERT on the docs side. "
    + "🛑 ASYMMETRY BY INHERITED CONSTRAINT, NOT BY PRINCIPLE — declaring it here is the goal of this gate. "
    + "What would lift it: the end of parity with the frozen oracle.",
  'tool/cwd':
    "Same reason as `file/cwd`: `porte-core` only merges `cwd` into `toolInput` for the `skill` "
    + "source. No doc can therefore react to the current directory — inherited asymmetry, declared.",
  'mcp/path (flat param)':
    "The MCP channel is triggered by the SERVER NAME (hence by the path of ITS doc). A file "
    + "path designates no server: reacting to it would be a pure false positive.",
  'mcp/shell command':
    "Same reason: a shell command carries no MCP server name. That is the axis of the FILE "
    + "source (`cd &&` reconstruction), disjoint by construction.",
  'mcp/NESTED param (MCP)':
    "The sub-tool IS read (`subToolParam` → `getByPath`), but only when the config declares it "
    + "for that server, and it designates a DOC LEVEL, never a free filter. Filtering by "
    + "parameter is covered by the FILE corpus (`tool:` + `scope:`) — maintainer decision "
    + "12/08/2026: two ways of expressing one thing = the opposite of the anti-synonym law.",
  'mcp/cwd':
    "The MCP channel consumes no local path: an MCP call goes out to a server, the current "
    + "directory does not qualify it. No parity at stake, this is a disjunction of meaning.",
};

test('SUBSTRATE ①: every BLINDNESS of a source on a projection MUST be justified', () => {
  const manquantes = [];
  for (const [nomSource, sonde] of Object.entries(SOURCES)) {
    for (const [nomProj, payload] of Object.entries(PROJECTIONS)) {
      // ⚠️ The payload is a THUNK evaluated INSIDE the test (Stryker perTest contract).
      if (sonde(payload())) continue;
      const cle = `${nomSource}/${nomProj}`;
      const justif = CECITES_JUSTIFIEES[cle];
      if (typeof justif !== 'string' || justif.trim().length <= 40) manquantes.push(cle);
    }
  }
  assert.deepEqual(manquantes, [],
    'UNJUSTIFIED SUBSTRATE BLINDNESS.\n'
    + "   A source does not SEE one projection of the event. It breaks nothing: it makes things MUTE,\n"
    + '   and a silence is indistinguishable from normal behaviour (㊵ and ㊴ were exactly that).\n'
    + '   Either you give it access, or you write WHY in CECITES_JUSTIFIEES.');
});

test('SUBSTRATE ②: a STALE justification must disappear (reverse part)', () => {
  // ⚠️ Without this part, the excuses pile up: we would keep the reason for a
  //    blindness ALREADY filled, and the table would stop describing the real
  //    engine.
  const perimees = [];
  for (const cle of Object.keys(CECITES_JUSTIFIEES)) {
    const [nomSource, ...reste] = cle.split('/');
    const nomProj = reste.join('/');
    const sonde = SOURCES[nomSource];
    const payload = PROJECTIONS[nomProj];
    // A key designating nothing any more is itself stale (source/projection renamed).
    if (!sonde || !payload) { perimees.push(cle + ' (non-existent target)'); continue; }
    if (sonde(payload())) perimees.push(cle + ' (the source now SEES this projection)');
  }
  assert.deepEqual(perimees, [],
    'STALE JUSTIFICATION — remove these entries from CECITES_JUSTIFIEES.');
});

test('SUBSTRATE ③: every REGISTRY source is probed (the gate is not born blind)', () => {
  // ⚠️ DERIVED from ADAPTERS, never from a copied list: a source added
  //    tomorrow must make this gate RED until it is probed. That is the only
  //    thing preventing the gate from ageing in silence.
  // 🛑 `session` is EXCLUDED and that is not an oversight: `docs/session/` is
  //    not a matching source (no event, no cadence — cf skill §2bis). It is
  //    delivered once per context, it LOOKS AT nothing.
  const ids = ADAPTERS.map((a) => a.id).filter((id) => id !== 'session');
  for (const id of ids) {
    assert.ok(id in SOURCES,
      `the source \`${id}\` is in ADAPTERS but is not PROBED here: add its line to SOURCES.`);
  }
  // ANTI-DORMANCY: an empty probe would make the gate green while observing nothing.
  assert.ok(ids.length >= 4, 'suspicious source registry');
  assert.ok(Object.keys(PROJECTIONS).length >= 5, 'suspicious projection set');
});

test('SUBSTRATE ④: the WITNESS really discriminates (anti-lying-probe)', () => {
  // 🛑 WITHOUT THIS PART THE GATE COULD BE DECORATIVE: if a probe ALWAYS
  //    matched (rule too permissive), no blindness would ever be detected and
  //    the table would certify instead of protecting. We therefore require
  //    that a payload WITHOUT the witness NEVER matches, for each source.
  const sansTemoin = () => ({ toolName: 'Read', toolInput: { file_path: '/rien/du/tout.js' }, cwd: '/ailleurs' });
  for (const [nomSource, sonde] of Object.entries(SOURCES)) {
    assert.equal(sonde(sansTemoin()), false,
      `the \`${nomSource}\` probe matches a payload WITHOUT the witness: it proves nothing.`);
  }
});
