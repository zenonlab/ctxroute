// ═══════════════════════════════════════════════════════════════════════
// SOURCE REGISTRY — THE extension point of the framework (plugins).
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ ADDING A SOURCE = 1 PURE module in sources/ + 1 adapter HERE.
//    The gateway (doc-inject.js) is NEVER touched: it iterates over ADAPTERS.
//    Neither are gate.js/lock/stores/doctor. This is the contract that makes the
//    framework "no-limit" without ever reopening the engine (heritage
//    doctrine: the engine is a frozen asset, the sources stack up).
//
// ADAPTER CONTRACT (the 2 examples below are authoritative):
//   { id, collect(config, payload, acc), message(injected, ctx) }
//   - `collect`: reads ITS corpus (local I/O) and supplies into `acc`:
//       acc.matched.push(docId)   — intra-source order = injection order
//       acc.decls[docId]  = gate.js decl ({mode?, threshold?, driftUnit?, enforce?})
//       acc.bodies[docId] = body WITHOUT frontmatter (trimmed by the gateway)
//       acc.labels[docId] = tag [source: …] (vocabulary SPECIFIC to the source)
//       acc.owner[docId]  = this.id · acc.meta[docId] = free (for message)
//     ⚠️ docId UNIQUE across sources (prefix: 'docs/…' file, 'mcp/…' MCP).
//     ⚠️ LOCAL FAIL-OPEN: if the failure of THIS source must not silence
//        the others, try/catch HERE (cf mcp) — never in the gateway.
//   - `message(injected, {fullDoc, config, acc})`: systemMessage of the
//     source ('' = nothing). The gateway joins the messages with ' · '.
//   - The order of the ADAPTERS array = inter-source concatenation order.
//
// ⚠️ PARITY sealed: porte-differential (file, byte-wise) + mcp-differential
//    (MCP, old vs new). Any change here = re-run BOTH.
// ⚠️ A SOURCE INFORMS; it is the GATE that can refuse (`enforce: true` ⇒
//    decision `deny`, gate.js:267 → pretool-core.js:417). 🛑 THESE TWO LINES
//    SAID "never blocks (deny/ask outside the engine)" and presented
//    `confirm` as "the only legal ask" — fixed on 09/08/2026: DOUBLY
//    false since 05/08. `deny` is INSIDE the engine (that is the whole point
//    of `enforce`), and `confirm`/`ask` were REMOVED that day (390
//    frontmatters cleaned) — this file was the LAST in the repo to
//    describe them as alive, all the others document them as dead.
//    A decl therefore no longer carries ANY confirmation key: do not
//    reintroduce one (human escalation = anti 0-human, absent from Codex).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib-pure');
const gate = require('./gate');
// ⚠️ ONLY for `baseId` (bringing `doc#3/7` back to `doc`) — the identity of a
//    document is a TRANSPORT rule, single source in budget.js. Copying
//    it here would make a 2nd truth that would diverge at the first change
//    of chunk format.
const budget = require('./budget');
const { parse, validate } = require('./frontmatter');
const { readCorpus } = require('./corpus');
const { rulesFromCorpus } = require('./loader');
const fileSource = require('./sources/file');
const toolSource = require('./sources/tool');
const mcpSource = require('./sources/mcp');
const skillSource = require('./sources/skill');
const paths = require('./paths');

// ── "FILE" SOURCE: frontmatters of the ~/.claude/hooks/docs/ corpus ──
// ⚠️ NO local try/catch: an unreadable corpus = a legitimate TOTAL failure,
//    swallowed by the gateway's global fail-open (original behavior).
const fileAdapter = {
  id: 'file',
  collect(config, payload, acc) {
    const corpus = readCorpus(paths.fileDocsDir(), 'docs/');
    const rules = rulesFromCorpus(corpus);
    for (const d of corpus) {
      const { data: fm, body } = parse(d.text);
      if (validate(fm).length === 0) acc.decls[d.doc] = fm;
      acc.bodies[d.doc] = body;
    }
    // ⚠️ protect-files PARITY: a doc with an EMPTY body (after frontmatter strip)
    //    = nonexistent, including for an `enforce` refusal. Filter BEFORE decide().
    //    (it used to say "the ask decision" — a word removed from the engine on 05/08/2026.)
    for (const m of fileSource.matchingDocs(rules, payload)) {
      if ((acc.bodies[m.doc] || '').trim() === '') continue;
      acc.matched.push(m.doc);
      acc.labels[m.doc] = '.claude/hooks/' + m.doc;
      acc.owner[m.doc] = this.id;
    }
  },
  // '📄 doc: …' — protect-files PARITY requires this badge to IGNORE
  // `showNotification`, unlike those of MCP and tool. Do NOT
  // "harmonize": that would change a production path for
  // aesthetics. The LABEL, however, is shared (cf badgeLabel).
  message(injected, ctx) {
    const label = badgeLabel(injected, ctx);
    return label ? '📄 doc: ' + label : '';
  },
};

/**
 * Short name of the document announced by the "📄 doc: …" badge.
 *
 * ⚠️ TWO SOURCES, IN THIS ORDER, and it is not a detail (06/08/2026):
 *    ① the `[source: …]` tag of the emitted text — that is protect-files PARITY,
 *       byte-wise, and it must remain the nominal path;
 *    ② failing that, the label the adapter has ALREADY supplied in `acc.labels`.
 * ⚠️ ② IS NOT DECORATIVE — REAL BUG: the `[source:]` tag lives at the END of the
 *    document, so **no chunk except the last one carries it**. A chunked
 *    doc then fell back on `docLabel`'s "markdown title" fallback,
 *    which caught the SEAL FOOTER: the badge displayed
 *    "📄 doc: ##FIN:7426e64b###". Fixed on both sides (CommonMark-compliant ATX
 *    regex in gate.js + this fallback), because only one of the two
 *    fixes would leave either a false name, or NO name.
 * 🛑 NEVER invert the order: reading `acc.labels` first would change the badge
 *    of the nominal case and break the parity differentials.
 */
// ⚠️ MAX NUMBER OF NAMES CITED. Beyond that, "+N": a badge is a STATUS
//    LINE, not a table of contents — 12 names would make it unreadable, hence ignored.
const MAX_NOMS = 3;

function nomCourt(id, ctx) {
  const brut = ctx.acc.labels[id];
  return brut ? String(brut).split(/[\\/]/).pop().replace(/\.md$/, '') : '';
}

function badgeLabel(injected, ctx) {
  // ⚠️ DEDUP BY DOCUMENT (07/08/2026): `injected` carries SEGMENTS, hence
  //    `doc#2/7` and `doc#3/7` of the SAME doc. Without `baseId` we would cite the
  //    same name twice — the trap already paid on `budget.announcement` on 05/08.
  const bases = [...new Set(injected.map((i) => budget.baseId(i)))];

  // ⚠️ NOMINAL CASE UNTOUCHED — A SINGLE DOC: historical path, BYTE-wise
  //    (`[source:]` tag first, `acc.labels` as fallback). That is the
  //    protect-files parity, sealed by `porte-differential`. Touching this path
  //    would turn the differential red without any engine having changed.
  if (bases.length <= 1) {
    const parTag = gate.docLabel(ctx.fullDoc);
    if (parTag) return parTag;
    return nomCourt(bases[0] !== undefined ? bases[0] : injected[0], ctx);
  }

  // 🔴 SEVERAL DOCS IN THE SAME FRAME — THE DEFECT FIXED HERE (07/08/2026).
  //    The code read `injected[0]`: four documents delivered, ONLY ONE named.
  //    REAL consequence, not cosmetic: the maintainer saw "chunk 1/8",
  //    "chunk 2/8", then another name — and concluded that the delivery
  //    had STOPPED at 2/8. It was complete. A morning spent
  //    diagnosing a nonexistent failure, on the strength of a false counter.
  // ⚠️ LESSON TO KEEP: a correct but UNREADABLE transport gets mistaken
  //    for a failure. Display is part of the contract, not decoration.
  const noms = bases.map((b) => nomCourt(b, ctx)).filter(Boolean);
  if (noms.length === 0) return '';
  const cites = noms.slice(0, MAX_NOMS).join(' · ');
  return noms.length > MAX_NOMS ? cites + ' +' + (noms.length - MAX_NOMS) : cites;
}

// ── "MCP" SOURCE: docs/mcp/ of the repo, pure selection sources/mcp.js ──
const mcpAdapter = {
  id: 'mcp',
  collect(config, payload, acc) {
    // The MCP corpus is read ONLY on an mcp__ tool (perf: zero I/O
    // added on Read/Edit/Bash). The "foreign" counters of the MCP docs
    // advance anyway on any call: gate.decide iterates over the STATE.
    if (!payload.toolName.startsWith('mcp__')) return;
    try {
      const cands = mcpSource.matchingDocs(config, payload);
      if (cands.length === 0) return;
      const byId = new Map(readCorpus(paths.docsDir(), 'mcp/').map((d) => [d.doc, d.text]));
      for (const c of cands) {
        const text = byId.get(c.doc);
        if (text === undefined) continue; // doc absent for this level = silence (parity)
        const { data: fm, body } = parse(text);
        if (body.trim() === '') continue;
        acc.bodies[c.doc] = body;
        // The frontmatter of the MCP doc SUPPLIES its cadence (mode/threshold); the whole
        // cascade is decided by gate.js — the source resolves NOTHING.
        // 🛑 `declFor(fm)` takes ONLY the frontmatter since 09/08/2026: passing
        // `config`/`server` back to it would resurrect the resolution that made
        // the `defaults.mcp` stage inert (cf header of sources/mcp.js).
        acc.decls[c.doc] = mcpSource.declFor(fm);
        acc.labels[c.doc] = c.sourceLabel;
        acc.owner[c.doc] = this.id;
        acc.meta[c.doc] = c;
        acc.matched.push(c.doc);
      }
    } catch {
      /* LOCAL fail-open — an unreadable MCP corpus never silences the file docs */
    }
  },
  // Badge '[ctxroute] server(+levels)' — legacy-mcp-inject parity,
  // respects showNotification (the file badge did not read it: parity).
  message(injected, ctx) {
    if (!lib.shouldShowNotification(ctx.config)) return '';
    const meta = ctx.acc.meta;
    return lib.formatSystemMessage(meta[injected[0]].server, injected.map((d) => meta[d].level));
  },
};

// ── "SKILL" SOURCE: config.skills registry, file matcher REUSED ──
// Injects the SKILL BODY read LIVE from the harness store (maintainer
// decision 18/07/2026: MECHANICALLY guaranteed injection, never a pointer that
// hopes the agent obeys). Zero duplication: the skill file remains the
// ONLY truth — read at each injection, never copied anywhere. Pointer
// fallback ONLY if the file is unreadable (fail-open: the perimeter
// still signals). Free cadence (once by default).
const skillAdapter = {
  id: 'skill',
  collect(config, payload, acc) {
    try {
      const skills = (config && config.skills) || {};
      for (const m of skillSource.matchingSkills(config, payload)) {
        const name = skillSource.skillNameFromDoc(m.doc);
        let body = null;
        try {
          // parse().body = the skill WITHOUT its frontmatter (harness metadata:
          // description/allowed-tools — noise in the context, not knowledge).
          body = parse(fs.readFileSync(path.join(paths.skillsDir(), name + '.md'), 'utf8')).body;
        } catch { /* unreadable file → pointer fallback below */ }
        acc.bodies[m.doc] = body && body.trim() !== '' ? body : skillSource.pointerBody(name);
        // ⚠️ We SUPPLY the registry entry, we resolve NOTHING: the complete cascade
        //    (defaults.skill > global > framework default 'once') lives in gate.js,
        //    a UNIQUE point. `acc.owner` below is what makes it possible.
        acc.decls[m.doc] = skillSource.declFor(skills[name]);
        acc.labels[m.doc] = m.doc; // 'skill/{name}' — [source:] tag specific to the source
        acc.owner[m.doc] = this.id;
        acc.meta[m.doc] = { name };
        acc.matched.push(m.doc);
      }
    } catch {
      /* LOCAL fail-open — an unreadable skills registry never silences the other sources */
    }
  },
  message(injected, ctx) {
    if (!lib.shouldShowNotification(ctx.config)) return '';
    return '🧩 skill: ' + injected.map((d) => ctx.acc.meta[d].name).join(', ');
  },
};

// ── "TOOL" SOURCE: trigger = EXACT name of a native tool (19/07/2026) ──
// Same corpus as the file source (the docs live in the same place, only the
// trigger KEY differs: `tool:` vs `match:`). Blind spot filled:
// WebFetch/WebSearch & co (neither path, nor mcp__) — proven mute by spawn before.
// ⚠️ docId dedup: a doc already matched by the file source is NOT
//    pushed again (same docId 'docs/…' = same body; first source wins).
const toolAdapter = {
  id: 'tool',
  collect(config, payload, acc) {
    try {
      // ⚠️ ZERO I/O ADDED: the file source (just before in ADAPTERS) has
      //    ALREADY parsed the whole corpus into acc.decls/acc.bodies — re-reading them here
      //    would double the reading of the ~320 docs ON EVERY tool call. We
      //    reuse the accumulator; the fileAdapter→toolAdapter order is therefore
      //    a DEPENDENCY (sealed by the ADAPTERS order comment).
      const docs = [];
      for (const doc of Object.keys(acc.decls)) {
        const fm = acc.decls[doc];
        if (!fm || !('tool' in fm)) continue;
        if ((acc.bodies[doc] || '').trim() === '') continue;
        docs.push({ doc, fm });
      }
      for (const m of toolSource.matchingDocs(docs, payload)) {
        if (acc.matched.includes(m.doc)) continue;
        acc.labels[m.doc] = '.claude/hooks/' + m.doc;
        acc.owner[m.doc] = this.id;
        acc.matched.push(m.doc);
      }
    } catch {
      /* LOCAL fail-open — a failure here never silences the other sources */
    }
  },
  // Unlike the FILE badge, this one respects `showNotification` —
  // inherited, intentional, documented asymmetry. Shared label (cf badgeLabel).
  message(injected, ctx) {
    if (!lib.shouldShowNotification(ctx.config)) return '';
    const label = badgeLabel(injected, ctx);
    return label ? '📄 doc: ' + label : '';
  },
};

// ⚠️ ORDER = concatenation order in the context (file before MCP,
//    as before the merge). Skill LAST: preserves the byte-wise file/MCP
//    parity (the differentials see nothing change). New source:
//    add it HERE, in its place. TOOL after FILE (docId dedup: file wins),
//    before MCP (a doc = file context, same label family).
const ADAPTERS = [fileAdapter, toolAdapter, mcpAdapter, skillAdapter];

module.exports = { ADAPTERS };
