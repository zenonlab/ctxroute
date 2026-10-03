// ═══════════════════════════════════════════════════════════════════════
// SETTLED DECISIONS STAY WRITTEN WHERE AGENTS MEET THEM (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 WHY: an operator decision lives in the skill or an injectable doc, and that is PROSE — any
//    agent editing the file can drop or soften it, and the next agent re-opens a question that
//    cost nights to settle. Born of the `read ECONNRESET` hunt, closed with measurements on
//    2026-09-24 ("the project is not responsible; only a measurement accusing the KM-TEST adapter
//    reopens it"). A rule guarded by prose alone is not a rule.
// 🔑 DATA, NOT CODE: `settled-decisions.json` lists (decision, file, marker) rows. A new settled
//    decision is one more row, never a new test. Reopening one means editing that file in the SAME
//    commit — a visible act, never a quiet deletion.
// ⚠️ The marker must stay VERBATIM: a reworded sentence is a changed decision, and that change
//    belongs in the data file too.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'settled-decisions.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The rows whose marker is missing from their file (a missing file is a missing marker). */
function missingMarkers(rows, readFile) {
  return rows.filter((r) => {
    let text;
    try { text = readFile(r.file); } catch { return true; }
    return !text.includes(r.marker);
  });
}

test('anti-vacuity: the settled-decision table is not empty and every row is well-formed', () => {
  assert.ok(Array.isArray(DATA.rows) && DATA.rows.length >= 1, 'no settled decision declared — the gate would certify nothing');
  const malformed = DATA.rows.filter((r) => !r || typeof r.decision !== 'string' || typeof r.file !== 'string'
    || typeof r.marker !== 'string' || r.marker.trim().length < 20);
  assert.deepEqual(malformed, [], 'a row needs decision, file and a marker of at least 20 characters (a short marker matches by accident)');
});

test('every settled decision is still written, verbatim, in the doc agents receive', () => {
  const missing = missingMarkers(DATA.rows, read);
  assert.deepEqual(missing.map((r) => `${r.decision} → ${r.file}: «${r.marker}»`), [],
    'a settled decision was deleted or reworded. Restore the sentence — or, if the operator reopened it, change settled-decisions.json in the SAME commit.');
});

test('SEEN RED: a doc that lost its marker is reported, a doc that keeps it is not', () => {
  const rows = [{ decision: 'd', file: 'a.md', marker: 'the verdict sentence that must stay' }];
  assert.equal(missingMarkers(rows, () => 'intro\nthe verdict sentence that must stay\n').length, 0);
  assert.equal(missingMarkers(rows, () => 'intro\nthe verdict sentence was softened\n').length, 1);
  assert.equal(missingMarkers(rows, () => { throw new Error('ENOENT'); }).length, 1);
});
