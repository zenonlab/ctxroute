// ═══════════════════════════════════════════════════════════════════════
// DIFFERENTIAL TEST — sources/file.js MUST be indistinguishable from protect-files.js
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS IS THE REFACTOR'S SAFETY NET. Nobody reviews 529 rules by hand.
//    Without this test, a semantic divergence = a doc that stops being
//    injected, SILENTLY, on a critical file, discovered months later.
//
// ORACLE = the REAL prod script, spawned, not a reference reimplementation.
//    Comparing two re-readings of the same code only proves that I read it twice.
//    protect-files.js marks each doc "[source: .claude/hooks/<doc>]" → the order
//    and the identity of the docs are directly observable in its real output.
//
// ⚠️ THIS TEST IS SKIPPED if protect-files.js is absent (fresh checkout, CI, another
//    machine) — the public repo NEVER depends on the maintainer's home directory.
//    Skipping is NOT failing: it screams locally, where the refactor happens.
//    (Lesson of 15/07/2026: a repo gate must hold on a FRESH clone.)
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { matchingDocs } from '../src/sources/file';

const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const LEGACY = path.join(HOOKS_DIR, 'protect-files.js');
const RULES_PATH = path.join(HOOKS_DIR, 'protected-paths.json');

const available = fs.existsSync(LEGACY) && fs.existsSync(RULES_PATH);

// ── ORACLE: spawns the real hook, extracts the docs in order ──
// ⚠️ The [source: ...] markers appear in the real injection order.
//    We read THAT order, never a Set — the parent→child order IS the contract.
//
// ⚠️ PARALLEL SPAWN MANDATORY, it is not a free optimization.
//    Measured on 15/07/2026: 2021 cases × 440 ms of Node startup = 15 MINUTES
//    sequentially. A 15-min gate is never run → dead gate → no
//    protection. The answer is NEVER to sample the corpus (silent
//    cap: "green" having tested only a third of the rules) — the spawns
//    are independent, so we parallelize them. 15 min → ~1 min, 0 rule skipped.
// ⚠️ ORACLE — 2 TRAPS EXPERIENCED ON 15/07/2026, BOTH WRONGLY ACCUSED THE ENGINE.
//    A false oracle is WORSE than no oracle: it condemns correct code.
//
// TRAP 1 — 61 docs of `~/.claude/hooks/docs/` contain a HARDCODED `[source: ...]`
//    in their CONTENT (an agent copied the injected output into the file).
//    Counting all the markers counted those lines as injections.
// TRAP 2 — the hook's output is **JSON**: the newlines in it are
//    ESCAPED (`\n`), so splitting the raw stdout on a real `\n\n---\n\n`
//    finds ONLY ONE block → only the last doc was seen → 43 false divergences,
//    exactly the MULTI-DOC cases.
//
// ⚠️ THE LESSON: PARSE THE FORMAT, NEVER IMPROVISE ON TEXT. The hook emits a JSON
//    contract (`hookSpecificOutput.additionalContext`) — read it as JSON. Any
//    regex "trick" on the raw stdout will fall back into one of the two traps.
// ⚠️ EXTRACTED into oracle.js on 16/07/2026 (it had a second consumer, deleted with the shadow relic on 21/08/2026):
//    there is only ONE reading of the oracle's output — two parsers = two
//    ways of lying. The 2 traps (hardcoded marker, escaped JSON) are sealed there.
import { legacyDocs as oracleDocs } from '../src/oracle.js';
function legacyDocs(payload) {
  return oracleDocs(LEGACY, payload);
}

// Pool with bounded concurrency. ⚠️ Do NOT launch 2021 spawns at once:
// 2021 simultaneous Node processes = the machine falls over (or the OS refuses the handles).
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function newDocs(rules, payload) {
  return matchingDocs(rules, payload).map((d) => d.doc);
}

// ⚠️ Corpus derived from the REAL rules — never a hand-written list.
//    A manual list only covers what I thought of; the 529 patterns
//    are, for their part, exactly what runs in prod.
function buildCorpus(rules) {
  const cases = [];
  for (const r of rules) {
    if (typeof r.pattern !== 'string' || !r.pattern) continue;
    const p = r.pattern.replace(/\/$/, '');
    const base = `C:/Users/dev/Desktop/${p}`;
    const scopeHint = Array.isArray(r.scope) && r.scope.length ? r.scope[0] : '';

    // Bare path — reveals the scoped rules that must NOT match out of scope.
    cases.push({ toolName: 'Read', toolInput: { file_path: base } });
    // Path carrying the scope — reveals the nominal match.
    if (scopeHint) {
      cases.push({ toolName: 'Read', toolInput: { file_path: `C:/Users/dev/Desktop/${scopeHint}/${p}` } });
    }
    // Write — same match, but a different ask/allow execution path on the legacy side.
    cases.push({ toolName: 'Edit', toolInput: { file_path: base } });
    // Case + backslashes — seals norm() (the cross-platform trap).
    cases.push({ toolName: 'Read', toolInput: { file_path: base.replace(/\//g, '\\').toUpperCase() } });
  }
  return cases;
}

// ⚠️ ORPHAN RULE = a rule whose `.md` NO LONGER EXISTS in the corpus.
// 🛑 THIS IS NOT A LOOSENING OF THE GATE, IT IS THE CORRECTION OF A FALSE ORACLE
//    (12/08/2026, measured: 17 divergences, whose CAUSE was 4 deleted docs).
//    `protected-paths.json` has been FROZEN and INERT since 27/07/2026; the corpus,
//    for its part, lives. The oracle CANNOT emit a doc it fails to read, whereas
//    `matchingDocs` returns the raw reference — the "empty/unreadable body"
//    filtering lives in the ADAPTER, not in the source. Comparing those two on an
//    orphan rule therefore compares two different LAYERS, never two engines.
// 🛑 AND IT IS A FALSE RED THAT GROWS ON ITS OWN: every doc deleted from the corpus
//    adds ~4. A gate that is durably red for a reason unrelated to the code is a
//    gate one stops reading, then disables — exactly what this repo
//    fights. The number is ANNOUNCED (never a silent cap) and a deleted
//    `.md` is still caught by `doc-drift-gate`, not here.
function playableRules(rules) {
  return rules.filter((r) => typeof r.doc === 'string' && fs.existsSync(path.join(HOOKS_DIR, r.doc)));
}

test('differential sources/file.js ≡ protect-files.js on the real rules', { skip: !available && 'protect-files.js absent (fresh clone)', timeout: 6000000 }, async () => {
  const allOfThem = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')).rules;
  const rules = playableRules(allOfThem);
  const orphans = allOfThem.length - rules.length;
  // ⚠️ ANNOUNCED, never kept quiet: a silently reduced corpus is a "green" that lies.
  if (orphans > 0) console.log(`  → ${orphans} ORPHAN rule(s) discarded (doc deleted from the corpus — the frozen oracle still cites them)`);
  const corpus = buildCorpus(rules);

  // ⚠️ ZERO SILENT CAP: we announce the real size of the corpus.
  //    A gate that truncates without saying so lies ("covered" when it is not).
  console.log(`  → ${corpus.length} cases derived from ${rules.length} real rules, no sampling`);

  const results = await mapPool(corpus, 12, async (payload) => {
    const a = await legacyDocs(payload);
    const b = newDocs(rules, payload);
    // ⚠️ join('|') = ORDERED comparison. A Set would pass while the
    //    parent→child order is broken — exactly the regression we are looking for.
    return a.join('|') === b.join('|')
      ? null
      : { entry: payload.toolInput.file_path, tool: payload.toolName, former: a, nouveau: b };
  });

  const divergences = results.filter(Boolean);
  assert.deepStrictEqual(
    divergences.slice(0, 5),
    [],
    `${divergences.length}/${corpus.length} divergences (first 5 above)`
  );
});

test('differential: Bash commands (cd reconstruction + git skip)', { skip: !available && 'protect-files.js absent (fresh clone)', timeout: 6000000 }, async () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')).rules;
  const cases = [
    { toolName: 'Bash', toolInput: { command: 'cd C:/Users/dev/Desktop/ctxroute && node lib-pure.js' } },
    { toolName: 'Bash', toolInput: { command: 'git commit -m "fix lib-pure.js"' } }, // known false positive → must stay empty
    { toolName: 'Bash', toolInput: { command: 'cat lib-pure.js' } },
    { toolName: 'Bash', toolInput: { command: 'cd /srv && ls' } },
  ];
  for (const payload of cases) {
    assert.deepStrictEqual(
      newDocs(rules, payload),
      await legacyDocs(payload),
      `divergence on: ${payload.toolInput.command}`
    );
  }
});

// ⚠️ NEGATIVE-CHECK of the filter above — MANDATORY (an untested comparison
//    filter can mask a REAL regression, lesson of `differential-normalise`).
//    It proves BOTH directions: a rule whose `.md` exists is KEPT, an
//    orphan rule is the ONLY one discarded. Without this test, accidentally
//    broadening the filter would empty the differential without anything turning red.
test('differential: the filter discards ONLY the orphan rules', { skip: !available && 'corpus absent (fresh clone)' }, () => {
  const allOfThem = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')).rules;
  const kept = playableRules(allOfThem);
  assert.ok(kept.length > 0, 'the filter must never discard everything (emptied gate = dead gate)');
  for (const r of kept) {
    assert.ok(fs.existsSync(path.join(HOOKS_DIR, r.doc)), `kept while ${r.doc} is absent`);
  }
  const filteredOut = allOfThem.filter((r) => !kept.includes(r));
  for (const r of filteredOut) {
    assert.ok(!fs.existsSync(path.join(HOOKS_DIR, r.doc)), `discarded while ${r.doc} EXISTS — the filter eats healthy rules`);
  }
  // IN-MEMORY sabotage (never a real file): a rule pointing at a nonexistent doc MUST fall.
  const dummy = { pattern: 'x', doc: 'docs/__inexistante-' + Date.now() + '.md' };
  assert.equal(playableRules([...allOfThem, dummy]).length, kept.length, 'an orphan rule must be discarded');
});
