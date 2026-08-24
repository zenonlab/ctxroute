// ═══════════════════════════════════════════════════════════════════════════
// DOC-DRIFT — an injected doc that LIES is WORSE than no doc (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🛑 THE DEFECT IT CLOSES, AND IT WAS LIVED THROUGH: on 03/08/2026, THREE
//    fleet docs taught the OPPOSITE of the code (`browser-mcp-child-guard.md`
//    mandated the `stdio:'ignore'` that WAS the defect to fix ·
//    `browser-mcp-transports.md` claimed "not compliant with the 404" two hours
//    after compliance was reached · `browser-mcp-concierge.md` described an
//    abandoned `ONSTART`). They were only fixed because an agent happened to
//    PASS OVER them.
//    ⚠️ An injected doc carries the tone of a proven invariant
//    (`🛑 MANDATORY`): nobody questions it. Edge case reached the same day —
//    the GATE and its DOC said the same FALSE thing: two ramparts agreeing
//    with each other and both off target. It took a HUMAN audit to get out,
//    which is exactly what 0-human forbids.
//
// ⚠️ WHAT IT COVERS, AND ONLY THAT: the DECIDABLE part of the lie — a doc
//    citing a FILE that no longer exists (rename, deletion). That is the
//    class that happens mechanically and that nobody sees, because a rename
//    never touches the docs talking about the renamed file.
// 🛑 IT DOES NOT PROVE that a doc tells the truth — no test can. NEVER
//    present it as "the defence against docs that lie": that would be the
//    false sense of security this file exists to fight.
//
// ⚠️ MEASUREMENT BEFORE WRITING (06/08/2026, mandatory before any gate): 32
//    docs, 936 backticked literals, 64 `.js` files cited, **0 not found**
//    once the fleet is taken into account. A criterion with false positives
//    would have produced a gate nobody reads — hence a dead gate. Do NOT
//    widen it to function identifiers without redoing that measurement: the
//    docs also cite functions of OTHER projects, and the noise would kill
//    the signal.

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO = path.join(__dirname, '..');
const MIRROR = path.join(REPO, 'docs', 'framework');
// The fleet does not exist on a fresh clone (CI, fork) — cf parc-sync-gate.
const FLEET = path.join(os.homedir(), '.claude', 'hooks');

// ⚠️ UNIQUE SOURCE of the rule "is this literal a .js file?".
//    De facto exported for the negative-check: sabotage the SAME function,
//    never a copy — a copy would stay green while the real rule breaks.
function citedFiles(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([^`\n]{3,60})`/g)) {
    const s = m[1].trim();
    // BARE file name (`budget.js`) or with a folder (`sources/file.js`).
    // ⚠️ No absolute path and no `..`: those are examples, not targets.
    if (/^[\w-]+(\/[\w-]+)*\.js$/.test(s)) out.add(s);
  }
  return [...out];
}

// ⚠️ THREE ROOTS, and the order does not matter at all (existence, not
//    priority): the repo, its sources/, and the FLEET — a framework doc
//    legitimately talks about `protect-files.js` or `statusline.js`, which
//    live at the maintainer's home.
//    MEASURED: without the fleet root, 8 of the 64 files would be FALSE reds.
function located(rel) {
  for (const base of [REPO, path.join(REPO, 'src'), path.join(REPO, 'src', 'sources'), path.join(REPO, 'src', 'hooks'), path.join(REPO, 'tools'), FLEET]) {
    if (fs.existsSync(path.join(base, rel))) return base;
  }
  return null;
}

function mirrorDocs() {
  return fs.readdirSync(MIRROR).filter((f) => f.endsWith('.md'));
}

test('DOC-DRIFT ①: every .js file cited by a framework doc EXISTS', () => {
  const dead = [];
  let verifies = 0;
  for (const doc of mirrorDocs()) {
    const text = fs.readFileSync(path.join(MIRROR, doc), 'utf8');
    for (const rel of citedFiles(text)) {
      const base = located(rel);
      if (base === null) {
        // ⚠️ ON A FRESH CLONE the fleet is absent: we cannot JUDGE a file that
        //    does not belong to the repo. We skip it EXPLICITLY rather than
        //    going red wrongly — but the part stays active for everything
        //    living in the repo, so it is never blind in CI.
        if (!fs.existsSync(FLEET)) continue;
        dead.push(doc + ' cites `' + rel + '` — NOT FOUND (repo, sources/, fleet)');
      } else verifies++;
    }
  }
  assert.deepStrictEqual(dead, [],
    'An INJECTED doc cites a file that no longer exists. Rename or deletion:\n'
    + '  - either the file moved → fix the doc IN THE SAME GESTURE;\n'
    + '  - or the doc is stale → rewrite it, never let it lie.\n'
    + dead.map((m) => '  ' + m).join('\n'));
  // ⚠️ ANTI-DORMANCY: without this floor, a broken regex would return ZERO
  //    citations and the gate would be GREEN while analysing NOTHING — the
  //    exact defect paid for three times (deps-purete, deadline-gate,
  //    couches-gate).
  assert.ok(verifies >= 20, 'DORMANT gate: only ' + verifies + ' citations checked (expected ≥ 20)');
});

test('DOC-DRIFT ②: NEGATIVE-CHECK — a doc citing a dead file GOES RED', () => {
  // ⚠️ IN MEMORY, never on a real file: a sabotage on disk once brought down
  //    38 tests of other suites reading the same file IN PARALLEL
  //    (03/08/2026). We sabotage the DATA, not the repository.
  const fakeOnes = 'See `module-that-does-not-exist.js` for the details.';
  const citedNames = citedFiles(fakeOnes);
  assert.deepStrictEqual(citedNames, ['module-that-does-not-exist.js'], 'the rule MUST see the citation');
  assert.strictEqual(located(citedNames[0]), null, 'and MUST declare it not found');
});

test('DOC-DRIFT ③: the rule does NOT fire on what is not a file', () => {
  // ⚠️ THIS PART PROTECTS THE GATE'S VALUE, not its correctness: a noisy gate
  //    is a gate people stop reading, then work around. Each shape below is
  //    present in the REAL docs of the fleet.
  const text = [
    '`mode: dumb`', '`match`', '`--budget 0`', '`node doctor.js --quiet`',
    '`process.exit(0)`', '`{ shell: true }`', '`additionalContext`', '`0.146.0`',
  ].join(' ');
  assert.deepStrictEqual(citedFiles(text), [],
    'false positive: the gate would accuse a healthy doc');
});
