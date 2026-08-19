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
import path from 'node:path';
import { eld } from 'eld/large';

const REPO = path.join(import.meta.dirname, '..');
const MIRROIR = path.join(REPO, 'docs', 'framework');
const MIN_CHARS = 90;

/** PROSE only: code spans, links and markdown syntax are never a language. */
export function prose(ligne) {
  return ligne
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*#>|_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines of a text that a RELIABLE detection says are not English. */
export function lignesEtrangeres(texte) {
  const out = [];
  for (const ligne of texte.split('\n')) {
    const t = prose(ligne);
    if (t.length < MIN_CHARS) continue;
    const d = eld.detect(t);
    if (d.language !== 'en' && d.isReliable()) out.push({ langue: d.language, texte: t });
  }
  return out;
}

const docsPubliees = () =>
  (fs.existsSync(MIRROIR) ? fs.readdirSync(MIRROIR) : []).filter((f) => f.endsWith('.md'));

test('ANTI-VACUITY — the detector recognises a foreign sentence and stays silent on English', () => {
  // 🛑 Without this, a broken import or a dead detector makes the whole gate green.
  const fr = "Le cache incrémental ment dès qu'une dépendance change, et le vert local ne prouve alors plus rien du tout.";
  const en = 'The universe is not the harness: it is our own declaration about a third party, hence strictly larger.';
  assert.ok(lignesEtrangeres(fr).length === 1, 'the detector does not see a foreign sentence — it would certify instead of protect');
  assert.strictEqual(lignesEtrangeres(en).length, 0, 'false positive on plain English — a noisy gate gets disarmed, then bypassed');
  assert.ok(Object.keys(eld.info().Languages).length >= 50,
    'the language set collapsed — an international contributor would slip through');
});

test('ANTI-VACUITY — the scan really reads the published mirror', () => {
  assert.ok(docsPubliees().length >= 20,
    `only ${docsPubliees().length} mirrored docs scanned — the glob is broken and this gate measures nothing`);
});

test('㉒ — the PUBLISHED surface carries no non-English prose', () => {
  const coupables = [];
  for (const f of docsPubliees()) {
    for (const l of lignesEtrangeres(fs.readFileSync(path.join(MIRROIR, f), 'utf8'))) {
      coupables.push(`  ${f} [${l.langue}] ${l.texte.slice(0, 100)}`);
    }
  }
  assert.deepStrictEqual(coupables, [],
    'NON-ENGLISH prose in the PUBLISHED surface (decision ㉒, 16/08/2026 — the whole project is English).\n' +
    'Rewrite those lines in English. The maintainer\'s personal fleet docs may stay in any language:\n' +
    'this gate only watches what a fork receives.\n' + coupables.join('\n'));
});
