// ═══════════════════════════════════════════════════════════════════════
// GATE — THE ENGINE BUDGET FOLLOWS THE LIMIT DECLARED TO THE HARNESS
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE DEFECT IT CLOSES, MEASURED ON 05/08/2026. The Codex wiring declared
//    `additionalContextLimit = 0` (= "disables spilling", hence NO limit)
//    since 04/08. Its comment even said "that is WHY Codex does not need
//    fragmentation". But NOBODY had told the engine: the shell passed no
//    budget, the engine applied its floor of 8,000, and a 76,000-char skill
//    went out in **11 gestures instead of 1**.
//    Everything was green — 995 tests, 100 % mutation, doctor 27/27, live
//    canary. That is a GREEN THAT LIES: not a failure, a silent DEGRADATION.
//
// ⚠️ THE ERROR CLASS, to remember more than the case: **everything we DECLARE
//    to a harness must be READ BACK by the engine, never guessed in
//    parallel.** Two places for the same number = guaranteed divergence. That
//    is implicit coupling, enemy #1 of the fleet doctrine.
//
// ⚠️ WHY AS A COMMAND ARGUMENT. The number travels WITH its declaration, in
//    the same TOML block, one under the other — one can no longer change one
//    without this gate going red. The alternatives were discarded: hardcoded
//    in the code = the 2nd source we have just removed; read at runtime = one
//    more I/O on EVERY tool call on a fail-open path.
//    It is exactly the already-proven pattern of `--frame k --frames N`.
//
// ⚠️ CLEAN SKIP if the machine wiring does not exist (CI, fresh checkout,
//    fork): a gate requiring the maintainer's machine would be RED for
//    everybody.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import fs from 'node:fs';
import assert from 'node:assert';

const CABLAGE = 'C:/ProgramData/OpenAI/Codex/requirements.toml';
const present = fs.existsSync(CABLAGE);

/**
 * Splits the TOML into hook BLOCKS and returns, for each, the command and the
 * declared limit. ⚠️ Deliberately rustic: we do not parse the TOML (no
 * dependency for a gate), we read blocks separated by `[[`. What matters is
 * that both values are read IN THE SAME block — that is where the invariant
 * lives.
 */
function blocs(toml) {
  return toml
    .split(/\n(?=\[\[)/)
    .map((b) => {
      const cmd = /^command\s*=\s*['"]([^'"]+)['"]/m.exec(b);
      const lim = /^additionalContextLimit\s*=\s*(-?\d+)/m.exec(b);
      if (!cmd) return null;
      const budget = /--budget\s+(-?\d+)/.exec(cmd[1]);
      const script = /([\w-]+)\.js/.exec(cmd[1]);
      return {
        script: script ? script[1] + '.js' : cmd[1],
        limite: lim ? Number(lim[1]) : null,
        budget: budget ? Number(budget[1]) : null,
      };
    })
    .filter(Boolean);
}

// An EMITTER is a hook that can produce `additionalContext`: it is exactly the
// one for which Codex accepts an `additionalContextLimit` (the others, the
// binary ignores — "this event cannot emit additionalContext").
const emitters = (bs) => bs.filter((b) => b.limite !== null);

test.skipIf(!present)('GATE: each Codex emitter DECLARES its budget to the engine', () => {
  const sans = emitters(blocs(fs.readFileSync(CABLAGE, 'utf8')))
    .filter((b) => b.budget === null)
    .map((b) => b.script);
  assert.deepStrictEqual(
    sans,
    [],
    'These hooks declare a limit to the harness but do NOT pass it to the engine:\n  '
      + sans.join('\n  ')
      + "\n⇒ the engine applies its floor and splits for nothing, IN SILENCE."
      + "\n   Add `--budget <same number>` to their `command`.");
});

test.skipIf(!present)('GATE: the declared limit and the passed budget are the SAME number', () => {
  const discrepancies = emitters(blocs(fs.readFileSync(CABLAGE, 'utf8')))
    .filter((b) => b.budget !== null && b.budget !== b.limite)
    .map((b) => `${b.script}: additionalContextLimit=${b.limite} but --budget ${b.budget}`);
  assert.deepStrictEqual(
    discrepancies,
    [],
    'DIVERGENCE between what we declare to the harness and what we tell the engine:\n  '
      + discrepancies.join('\n  '));
});

// ⚠️ MANDATORY NEGATIVE-CHECK — lesson of the `*-must-stay-pure` (03/08/2026),
//    documented everywhere as THE guarantee and unable to go red. A gate that
//    has not been sabotaged is a gate presumed inert.
// ⚠️ IN-MEMORY SABOTAGE, never on the real file: it is a MACHINE POLICY in
//    production, read by every Codex agent running.
test('NEGATIVE: a divergence is DETECTED (gate not inert)', () => {
  const sain = [
    '[[hooks.PreToolUse.hooks]]',
    "command = 'node x/codex-doc-inject.js --budget 0'",
    'additionalContextLimit = 0',
  ].join('\n');
  const divergent = sain.replace('--budget 0', '--budget 5000');
  const muet = sain.replace(' --budget 0', '');

  assert.strictEqual(emitters(blocs(sain)).filter((b) => b.budget !== b.limite).length, 0,
    'witness: a coherent wiring does not go red');
  assert.strictEqual(emitters(blocs(divergent)).filter((b) => b.budget !== b.limite).length, 1,
    'SABOTAGE NOT DETECTED: two different numbers would go green.');
  assert.strictEqual(emitters(blocs(muet)).filter((b) => b.budget === null).length, 1,
    'SABOTAGE NOT DETECTED: an emitter without a budget would go green.');
});
