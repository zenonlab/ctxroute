// ═══════════════════════════════════════════════════════════════════════
// A CHUNKED DOCUMENT KEEPS ONE NAME — every piece is announced exactly like
// the last one.
//
// 🔴 REAL DEFECT, OBSERVED IN PRODUCTION 2026-09-13. A 10,130 c doc went out in
//    two pieces and the operator read TWO badges:
//        "📄 doc: 🔗 SI TU TOUCHES CE FICHIER, TU DOIS TOU (chunk 1/2)"
//        "📄 doc: panneau-contenu (chunk 2/2)"
//    One document, two names — indistinguishable from two documents, one of
//    which stopped mid-delivery. An hour was spent diagnosing a transport
//    failure that never happened: all 32 frames had reached the daemon.
//
// 🔑 CAUSE, and it is why the 2026-08-06 fix did not close the class. The
//    `[source: …]` tag lives at the END of a document, so NO piece but the last
//    carries it. `badgeLabel` asks `gate.docLabel(ctx.fullDoc)` FIRST and only
//    falls back on `acc.labels` when that answers ''. In August the regex was
//    made CommonMark-compliant so the seal footer `###END:xxx###` stopped being
//    read as a title — which makes `docLabel` answer '' and the fallback fire.
//    But a document with a REAL markdown title makes it answer that title, so
//    the fallback is short-circuited and the first piece is named after the
//    document's heading instead of the document. The class was closed for docs
//    WITHOUT a title and left open for docs WITH one — i.e. for most of them.
//
// 🛑 THE INVARIANT IS ABOUT THE PIECES, NOT ABOUT A TAG. Whoever reads a badge
//    must be able to tell "more of the same document" from "another document".
//    That is a property of the SET of pieces, so these cells assert equality
//    BETWEEN pieces and never a hard-coded string alone.
// ═══════════════════════════════════════════════════════════════════════

import { test, afterAll } from 'vitest';
import assert from 'node:assert';
import { ADAPTERS } from '../src/source-adapters.js';
import { badgeLabel, shortName, MAX_NAMES } from '../src/badge-label-pure.js';

// 🛑 THE PURE MODULE IS IMPORTED DIRECTLY, and that is not a convenience.
//    Stryker mutates `src/badge-label-pure.js`; a suite reaching it only
//    THROUGH the adapter would still kill mutants, but the cells below that
//    exercise the multi-document branch have no adapter path at all, and a
//    decision only reachable through an I/O module is a decision nobody can
//    measure. The adapter cells stay too — they prove the WIRING, which a
//    direct call never does. Both, never one instead of the other.
const fileAdapter = ADAPTERS.find((a) => a.id === 'file');

// The label an adapter really publishes: a repo-relative path, never a bare id
// (cf. `acc.labels[m.doc] = fleetHooksLabel() + '/' + m.doc` in the collector).
const LABELS = { 'panneau-contenu.md': '.claude/hooks/docs/panneau-contenu.md' };

// The document of the incident, reduced to what decides the badge: a markdown
// title first, the `[source:]` tag last.
const TITLE = '# 🔗 SI TU TOUCHES CE FICHIER, TU DOIS TOUCHER AUSSI';
const FIRST_PIECE = TITLE + '\nbody of the first piece';
const LAST_PIECE = 'body of the last piece\n[source: .claude/hooks/docs/panneau-contenu.md]';
const WHOLE = FIRST_PIECE + '\n' + LAST_PIECE;

// 🛑 `injected` HOLDS BASES, `emitted` HOLDS THE RAW IDS — exactly as
//    `pretool-core` builds them (it maps `baseId` over `plan.emitted` before
//    calling an adapter). A first version of this helper passed ids carrying
//    `#` as `injected`, which no caller ever does: six cells went green over a
//    fix that was DEAD in production. Never shape these two by intuition —
//    copy the caller.
const badge = (injected, fullDoc, emitted = injected) =>
  fileAdapter.message(injected, { fullDoc, config: {}, acc: { labels: LABELS, owner: {} }, emitted });

// ── THE DEFECT ITSELF ──────────────────────────────────────────────────
test('a chunked doc: the first piece is named after the DOCUMENT, not its heading', () => {
  assert.strictEqual(badge(['panneau-contenu.md'], FIRST_PIECE, ['panneau-contenu.md#1/2']), '📄 doc: panneau-contenu');
});

test('a chunked doc: every piece carries the SAME name', () => {
  const first = badge(['panneau-contenu.md'], FIRST_PIECE, ['panneau-contenu.md#1/2']);
  const last = badge(['panneau-contenu.md'], LAST_PIECE, ['panneau-contenu.md#2/2']);
  assert.strictEqual(first, last, 'two pieces of one document must not be announced under two names');
});

// ⚠️ A piece re-queued then re-chunked carries `doc#1/2#2/4` (capacity lowered
//    between two actions). `chunkPart` reads the LAST `#` on purpose, so this
//    form must be recognised as a piece too — otherwise the defect returns for
//    exactly the documents that overflowed twice, i.e. the biggest ones.
test('a re-chunked piece is still a piece', () => {
  assert.strictEqual(badge(['panneau-contenu.md'], FIRST_PIECE, ['panneau-contenu.md#1/2#2/4']), '📄 doc: panneau-contenu');
});

// ── CONTROL CELLS: the whole-document path must not move one byte ───────
// 🛑 These are the protect-files parity, sealed elsewhere by
//    `pretool-differential`. A fix that turns them red is a fix that changed a
//    production path to repair a display — refuse it.
test('CONTROL — a whole doc still reads its [source:] tag', () => {
  assert.strictEqual(badge(['panneau-contenu.md'], WHOLE), '📄 doc: panneau-contenu');
});

test('CONTROL — a whole doc with no tag still falls back on its markdown title', () => {
  assert.strictEqual(
    badge(['sans-tag.md'], TITLE),
    '📄 doc: 🔗 SI TU TOUCHES CE FICHIER, TU DOIS TOU',
    'the historical fallback is what names a doc the engine has no label for',
  );
});

// ⚠️ ANTI-VACUITY. A piece whose document the accumulator never labelled must
//    still be named rather than go silent: without this cell, "read acc.labels
//    for a piece" could be implemented as "return '' for a piece" and every
//    cell above would still pass while the badge lost its name entirely.
test('a piece with no label falls back on the text rather than going silent', () => {
  const orphan = fileAdapter.message(['inconnu.md'], {
    fullDoc: FIRST_PIECE,
    config: {},
    acc: { labels: {}, owner: {} },
    emitted: ['inconnu.md#1/2'],
  });
  assert.strictEqual(orphan, '📄 doc: 🔗 SI TU TOUCHES CE FICHIER, TU DOIS TOU');
});

// ── THE TWO PATHS MUST BE TELLABLE APART ───────────────────────────────
// 🛑 EVERY CELL ABOVE USES A DOCUMENT WHOSE TAG AND LABEL AGREE, so they cannot
//    see WHICH source the name came from. Mutation proved it: turning
//    `if (chunkPart(...))` into `if (true)` survived all of them. A control that
//    cannot distinguish the paths certifies whichever one it finds.
//    ⇒ these two cells make the tag and the label DISAGREE on purpose.
const DISAGREE = { 'real.md': 'docs/from-the-label.md' };
const TAGGED = 'body\n[source: docs/from-the-tag.md]';

test('a WHOLE doc takes its name from the TAG, never from the label', () => {
  const ctx = { fullDoc: TAGGED, acc: { labels: DISAGREE, owner: {} } };
  assert.strictEqual(badgeLabel(['real.md'], ctx), 'from-the-tag');
});

test('a PIECE takes its name from the LABEL, never from the text it carries', () => {
  const ctx = { fullDoc: TAGGED, acc: { labels: DISAGREE, owner: {} } };
  assert.strictEqual(badgeLabel(['real.md'], { ...ctx, emitted: ['real.md#1/2'] }), 'from-the-label');
});

// ⚠️ A whole document with NO tag AND NO heading: `docLabel` answers '', so the
//    label is the only name left. Without this cell, `if (parTag) return parTag`
//    can be turned into `if (true) return parTag` — returning the EMPTY string
//    and dropping the badge — and every other cell stays green.
test('a whole doc with neither tag nor heading still falls back on its label', () => {
  const ctx = { fullDoc: 'plain body, no tag, no heading', acc: { labels: DISAGREE, owner: {} } };
  assert.strictEqual(badgeLabel(['real.md'], ctx), 'from-the-label');
});

// ── A FRAME CARRIES SEVERAL DOCUMENTS, AND EACH IS JUDGED ON ITS OWN ───
// 🔴 Mutation exposed these four as a single blind spot: every cell so far put
//    ONE document in `emitted`, so "is THIS document chunked?" could be
//    weakened to "is ANYTHING here chunked?", to "is anything here at all?",
//    or to `every` — all survived. A frame mixing a whole document with the
//    pieces of another is the NOMINAL case in production, not an edge.
const mixed = (base, emitted) =>
  badgeLabel([base], { fullDoc: TAGGED, acc: { labels: { [base]: 'docs/' + base }, owner: {} }, emitted });

test('mixed frame: a WHOLE doc beside another one’s pieces keeps the TAG path', () => {
  // `a.md` is whole here — the presence of `b.md#1/2` must NOT make it a piece.
  assert.strictEqual(mixed('a.md', ['a.md', 'b.md#1/2']), 'from-the-tag');
});

test('mixed frame: the CHUNKED doc of the pair still reads its label', () => {
  assert.strictEqual(mixed('b.md', ['a.md', 'b.md#1/2']), 'b');
});

test('mixed frame: ANOTHER document being chunked never makes this one a piece', () => {
  assert.strictEqual(mixed('a.md', ['b.md#1/2', 'c.md#2/3']), 'from-the-tag');
});

// ── THE MULTI-DOCUMENT BRANCH, reached DIRECTLY ────────────────────────
// 🔴 It exists because `injected[0]` was read alone on 2026-08-07: four
//    documents delivered, ONE named. The operator read "chunk 1/8", "2/8", then
//    another name, and concluded delivery had STOPPED. It was complete. A
//    morning lost on a false counter — the same class as the defect this file
//    was born of, one year of lessons apart.
const ctxOf = (labels) => ({ fullDoc: 'irrelevant here', acc: { labels, owner: {} } });

test('several docs in one frame: ALL are named, never just the first', () => {
  const ctx = ctxOf({ 'a.md': 'docs/a.md', 'b.md': 'docs/b.md' });
  assert.strictEqual(badgeLabel(['a.md', 'b.md'], ctx), 'a · b');
});

// ⚠️ DUPLICATED BASES, NEVER SEGMENTS — and the difference is the whole lesson
//    of 2026-09-13. The caller already does `[...new Set(plan.emitted.map(
//    baseId))]`, so `badgeLabel` receives bases that are ALREADY deduplicated:
//    its own `Set` is a DEFENSIVE conversion on a total function, kept on
//    purpose, and this cell exercises it with an input the caller could at
//    worst hand it — never with one it provably never produces.
// 🛑 An earlier version of this cell passed `['a.md#1/2', 'a.md#2/2', 'b.md']`.
//    It was green, and it described a caller that does not exist. The gate
//    `fabricated-segment-id-gate` now refuses that shape by construction.
test('several docs: a base repeated is named ONCE (defensive dedup)', () => {
  const ctx = ctxOf({ 'a.md': 'docs/a.md', 'b.md': 'docs/b.md' });
  assert.strictEqual(badgeLabel(['a.md', 'a.md', 'b.md'], ctx), 'a · b');
});

// ⚠️ A badge is a STATUS LINE, not a table of contents: beyond MAX_NAMES it
//    counts instead of listing. The cell asserts the CONTRACT value, never
//    `MAX_NAMES` itself — reading the constant under test would prove x === x.
test('several docs: at most 3 names, then "+N"', () => {
  const ctx = ctxOf({ 'a.md': 'a.md', 'b.md': 'b.md', 'c.md': 'c.md', 'd.md': 'd.md', 'e.md': 'e.md' });
  assert.strictEqual(badgeLabel(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'], ctx), 'a · b · c +2');
  assert.strictEqual(MAX_NAMES, 3);
});

test('several docs: exactly 3 are listed with no "+N"', () => {
  const ctx = ctxOf({ 'a.md': 'a.md', 'b.md': 'b.md', 'c.md': 'c.md' });
  assert.strictEqual(badgeLabel(['a.md', 'b.md', 'c.md'], ctx), 'a · b · c');
});

// ⚠️ ANTI-VACUITY of the multi-doc branch: no label at all ⇒ EMPTY string, so
//    the caller drops the badge entirely. An orphan "(chunk 3/7)" that does not
//    say OF WHAT worries more than silence.
test('several docs with no labels at all: empty, so the badge is dropped', () => {
  assert.strictEqual(badgeLabel(['a.md', 'b.md'], ctxOf({})), '');
});

test('several docs: an unlabelled one is skipped, the others are still named', () => {
  const ctx = ctxOf({ 'a.md': 'docs/a.md' });
  assert.strictEqual(badgeLabel(['a.md', 'orphan.md'], ctx), 'a');
});

// ── shortName ──────────────────────────────────────────────────────────
test('shortName: basename only, .md stripped, both separators', () => {
  const ctx = ctxOf({ x: 'a/b/c.md', y: 'a\\b\\d.md', z: 'plain' });
  assert.strictEqual(shortName('x', ctx), 'c');
  assert.strictEqual(shortName('y', ctx), 'd');
  assert.strictEqual(shortName('z', ctx), 'plain');
});

test('shortName: an unknown document yields the empty string, never a crash', () => {
  assert.strictEqual(shortName('never-registered', ctxOf({})), '');
});

// ═══════════════════════════════════════════════════════════════════════
// THE PROOF THAT THE FIRST FIX LACKED: the REAL caller, not a fabricated one.
//
// 🔴 A FIX SHIPPED DEAD ON 2026-09-13 WITH A GREEN SUITE. `pretool-core` maps
//    `baseId` over `plan.emitted` BEFORE calling an adapter, so `injected`
//    holds BASES — the `#j/m` is gone. The first fix asked
//    `chunkPart(injected[0])`, which therefore answered `null` for every real
//    delivery, while six cells passed because THEY fabricated ids carrying `#`.
//    **A green on a twin is not a green on the thing**, and this repository had
//    written that sentence down before I committed the mistake.
// 🛑 THESE CELLS DRIVE `pretool-core.run` OVER A REAL CORPUS ON DISK. Any future
//    cell about chunk naming MUST go through here too: a unit cell that builds
//    `injected` by hand can only prove what its author already believed.
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run as coreRun } from '../src/pretool-core.js';
import { output } from '../src/hooks/doc-inject.js';
import { parseFrameArgs } from '../src/lib-pure.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'badge-real-'));
const DOCS = path.join(TMP, 'docs');
const STATE = path.join(TMP, 'state');
const CONFIG = path.join(TMP, 'config.json');

// A document BIGGER than one frame (~7,684 c) and carrying a markdown HEADING —
// the exact shape that reopened the class. Without the heading `docLabel`
// answers '' and the old fallback would hide the defect.
const BIG = [
  '---',
  'match: [widget.ts]',
  'mode: dumb',
  '---',
  '# A HEADING THAT MUST NEVER BECOME A BADGE NAME',
  'x'.repeat(11000),
].join('\n');

function frameBadge(k) {
  const before = { ...process.env };
  Object.assign(process.env, {
    CTXROUTE_FILEDOCS_DIR: DOCS,
    CTXROUTE_STATE_DIR: STATE,
    CTXROUTE_CONFIG_PATH: CONFIG,
  });
  let out = null;
  try {
    coreRun(
      { tool_name: 'Read', tool_input: { file_path: 'C:/proj/widget.ts' }, session_id: 'badge-real' },
      (d, f, m) => { out = output(d, f, m); },
      { ...parseFrameArgs([process.execPath, 'hook', '--frame', String(k), '--frames', '4']), invocationId: 'inv-1' },
    );
  } finally {
    for (const key of ['CTXROUTE_FILEDOCS_DIR', 'CTXROUTE_STATE_DIR', 'CTXROUTE_CONFIG_PATH']) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
  return out && out.systemMessage ? out.systemMessage : '';
}

test('REAL CHAIN: a chunked doc is announced under ONE name on every frame', () => {
  fs.rmSync(DOCS, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'widget-notes.md'), BIG, 'utf8');
  fs.writeFileSync(CONFIG, JSON.stringify({ enabled: true, mode: 'dumb', frames: 4 }), 'utf8');

  const badges = [frameBadge(1), frameBadge(2)].filter((b) => b !== '');
  assert.ok(badges.length >= 2, 'the document must really be split, otherwise this cell proves nothing');

  // ⚠️ ANTI-VACUITY: the chunk suffix must be there, or the doc was not chunked
  //    and the whole cell is a control of the nominal case wearing a disguise.
  assert.ok(badges.every((b) => /\(chunk \d+\/\d+\)/.test(b)), 'expected chunk suffixes, got: ' + badges.join(' | '));

  // THE INVARIANT: strip the position, the NAME must be identical.
  const names = badges.map((b) => b.replace(/ \(chunk \d+\/\d+\)/, '').replace(/ · .*$/, ''));
  assert.strictEqual(names[0], names[1], 'one document announced under two names: ' + badges.join(' | '));
  assert.strictEqual(names[0], '📄 doc: widget-notes', 'the name must be the DOCUMENT, never its heading');
});

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));
