// ═══════════════════════════════════════════════════════════════════════
// ENGLISH-ONLY — the published surface cannot slip back into another language
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-20). Decision ㉒ ("the WHOLE project is in
//    English") was taken on 16/08 and has been violated THREE times since — twice on
//    19/08 and once on 20/08 — every time by an agent that had just READ the rule, in
//    the same session. One violation survived a full session that ended with the agent
//    certifying "everything is clean": a whole French paragraph sitting in
//    `docs/framework/mutation-floor-gate.md`, i.e. in the mirror a FORK receives.
//    Nobody saw it, and no gate could. **A rule that only prose guards is not a rule.**
//
// 🛑 SCOPE = THE PUBLISHED SURFACE ONLY. `docs/framework/` is what a fork gets. The
//    maintainer's PERSONAL fleet docs (outside that mirror) legitimately stay French —
//    they never leave the machine. Widening this gate to them would make it red
//    forever, hence ignored, hence dead.
//
// ⚠️ IT IS NOT A FRENCH DETECTOR — it is a NOT-ENGLISH detector. Contributors are
//    international: the next slip may be German, Portuguese or Japanese. `eld` covers
//    60 languages, which is every realistic contributor language.
//
// 📐 THE DEPENDENCY WAS CHOSEN BY MEASUREMENT, AND THE MEASUREMENT REFUTED THE
//    INDUSTRY STANDARD. `franc` is the market leader by adoption (1,374,671
//    downloads/month, 4,407 stars against 119 for `eld`) — and on THIS corpus it
//    produced **97 false positives** at the same threshold, classifying English lines
//    as Scots (`sco`), whose trigrams overlap English. `eld` produced **ZERO false
//    positives and caught 2 real violations out of 2**. Adoption is not accuracy on
//    your own corpus. 🛑 Do NOT "upgrade" to franc/tinyld/cld3 on reputation: replay
//    this measurement first. (Also measured: the npm package named `lingua` is NOT the
//    Lingua detector — it is an unrelated i18n module; the real Lingua has no
//    maintained JS port.)
//
// ⚠️ `isReliable()` IS THE LOAD-BEARING PART, not a refinement: the detector says
//    ITSELF when the sample is too short to decide. That is exactly what `franc` lacks
//    and why it drowned. A gate that guesses on short text becomes noise, and a noisy
//    gate gets disarmed — the failure mode this repo names everywhere.
// ⚠️ MIN_CHARS = 90, MEASURED not chosen: at 60 a bare list of config filenames was
//    reliably called Swedish. Code spans, URLs and markdown are stripped BEFORE
//    judging — we judge PROSE, never syntax.
// ⚠️ ANTI-VACUITY: the scan must really read files and the detector must really
//    recognise a foreign sentence — otherwise a broken glob turns this green while
//    measuring nothing, the failure mode this repo has already paid for three times.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { eld } from 'eld/large';

const REPO = path.join(import.meta.dirname, '..');
const MIN_CHARS = 90;

/** PROSE only: code spans, links and markdown syntax are never a language. */
export function prose(line) {
  return line
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*#>|_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines of a text that a RELIABLE detection says are not English. */
export function foreignLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = prose(line);
    if (t.length < MIN_CHARS) continue;
    const d = eld.detect(t);
    if (d.language !== 'en' && d.isReliable()) out.push({ langue: d.language, text: t });
  }
  return out;
}

/**
 * Every PUBLISHED prose file, as a path relative to the repository.
 *
 * 🔴 IT SCANNED `docs/framework/*.md` ALONE UNTIL 2026-09-19, NON-RECURSIVELY, AND
 *    THE GAP HELD REAL FRENCH. `docs/mcp/*.md.example` and `docs/session/*.md*`
 *    are TRACKED — a fork receives them — and three of them carried whole French
 *    paragraphs while this gate stayed green. A judge whose scope is narrower
 *    than the thing it protects certifies instead of protecting.
 * ⚠️ AND THE OLD READER WAS FLAT, so a `.md` dropped in a future
 *    `docs/framework/<subdir>/` would never have been read — a hole that opens by
 *    itself the day somebody makes a folder. Deriving the list from git closes
 *    that too, without anybody having to remember it.
 * 🛑 `.js` IS DELIBERATELY OUT, AND THE REASON IS WRITTEN SO NOBODY "FIXES" IT.
 *    The project rule covers comments too, but several suites must carry French
 *    ON PURPOSE — `backlog-coherence-gate` feeds French backlog headings,
 *    `leak-gate` feeds French words, `pretool-differential` pins a French
 *    fixture. A gate reddening on those would be red for being CORRECT, hence
 *    disarmed within the week. Identifiers already have their own judge
 *    (`foreign-identifier-gate`); French PROSE in a comment stays a written,
 *    measured gap — not a silence.
 */
const publishedDocs = () => {
  // 🔑 GIT IS THE AUTHORITY ON "WHAT A FORK RECEIVES", never a path pattern.
  //    A first attempt walked `docs/` on DISK and immediately accused
  //    `docs/mcp/browser-*.md` — the maintainer's PERSONAL docs, deliberately
  //    gitignored and never published. That is the shape of a gate widened
  //    wrongly: red on correct content, therefore disarmed within the week.
  //    Asking git removes the question instead of answering it by hand.
  // 🛑 SCRUB THE WHOLE `GIT_*` FAMILY: git EXPORTS `GIT_DIR`/`GIT_INDEX_FILE` to
  //    every hook it runs and a child INHERITS them — they BEAT `cwd`, so this
  //    listing would describe whichever repository the parent hook was acting on,
  //    not ours, and the judged surface would be somebody else's. Nobody can
  //    enumerate what a future git version exports, so the whole family goes.
  // ⚠️ WRITTEN `env: env`, NOT the `{ env }` shorthand: `git-env-door-gate` reads
  //    the EXPLICIT property and reports a shorthand as "no env: option".
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  const listed = execFileSync('git', ['ls-files'], { cwd: REPO, env: env, encoding: 'utf8' });
  return listed.split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.md(\.example)?$/.test(l));
};

test('ANTI-VACUITY — the detector recognises a foreign sentence and stays silent on English', () => {
  // 🛑 Without this, a broken import or a dead detector makes the whole gate green.
  const fr = "Le cache incrémental ment dès qu'une dépendance change, et le vert local ne prouve alors plus rien du tout.";
  const en = 'The universe is not the harness: it is our own declaration about a third party, hence strictly larger.';
  assert.ok(foreignLines(fr).length === 1, 'the detector does not see a foreign sentence — it would certify instead of protect');
  assert.strictEqual(foreignLines(en).length, 0, 'false positive on plain English — a noisy gate gets disarmed, then bypassed');
  assert.ok(Object.keys(eld.info().Languages).length >= 50,
    'the language set collapsed — an international contributor would slip through');
});

test('ANTI-VACUITY — the scan really reads the published mirror', () => {
  assert.ok(publishedDocs().length >= 20,
    `only ${publishedDocs().length} mirrored docs scanned — the glob is broken and this gate measures nothing`);
});

test('㉒ — the PUBLISHED surface carries no non-English prose', () => {
  const offenders = [];
  for (const f of publishedDocs()) {
    for (const l of foreignLines(fs.readFileSync(path.join(REPO, f), 'utf8'))) {
      offenders.push(`  ${f} [${l.langue}] ${l.text.slice(0, 100)}`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    'NON-ENGLISH prose in the PUBLISHED surface (decision ㉒, 16/08/2026 — the whole project is English).\n' +
    'Rewrite those lines in English. The maintainer\'s personal fleet docs may stay in any language:\n' +
    'this gate only watches what a fork receives.\n' + offenders.join('\n'));
});
