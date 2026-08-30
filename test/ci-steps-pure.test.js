// ═══════════════════════════════════════════════════════════════════════
// CONTRACT — src/ci-steps-pure.js, on SYNTHETIC data (Stryker-mutated 100%)
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  CI_STEPS,
  knownGroups,
  normalizeCommand,
  runCommand,
  stepBlocks,
  runStepsOf,
  calledGroup,
  auditDivergence,
  unCalledGroups,
  missingCiAliases,
  ciPreconditions,
  divergenceMessage,
  unCalledGroupMessage,
  missingAliasMessage,
} from '../src/ci-steps-pure.js';

describe('CI_STEPS canonical table', () => {
  it('is a non-empty array of {group, command}', () => {
    expect(Array.isArray(CI_STEPS)).toBe(true);
    expect(CI_STEPS.length).toBeGreaterThan(0);
    for (const s of CI_STEPS) {
      expect(typeof s.group).toBe('string');
      expect(typeof s.command).toBe('string');
      expect(s.command.length).toBeGreaterThan(0);
    }
  });

  it('carries exactly the 4 groups this mission targets', () => {
    expect(knownGroups()).toEqual(['unit', 'coupling', 'mutation', 'spec']);
  });

  it('the mutation-floor step declares a localBinary, never npx locally', () => {
    const floor = CI_STEPS.find((s) => /mutation-floor-gate/.test(s.command));
    expect(floor).toBeDefined();
    expect(floor.command.startsWith('npx ')).toBe(true);
    expect(floor.localBinary).toBeDefined();
    expect(floor.localBinary.startsWith('npx')).toBe(false);
    expect(floor.localBinary).toContain('mutation-floor-gate.test.js');
  });
});

describe('knownGroups()', () => {
  it('deduplicates and preserves first-appearance order', () => {
    expect(knownGroups()).toEqual([...new Set(CI_STEPS.map((s) => s.group))]);
  });
});

describe('normalizeCommand()', () => {
  it('trims edges and collapses internal whitespace runs', () => {
    expect(normalizeCommand('  npm   run   ci  ')).toBe('npm run ci');
  });
  it('is idempotent', () => {
    const once = normalizeCommand('  a   b ');
    expect(normalizeCommand(once)).toBe(once);
  });
  it('coerces a non-string input via String()', () => {
    expect(normalizeCommand(42)).toBe('42');
  });
});

describe('runCommand()', () => {
  it('extracts a single-quoted run: value', () => {
    expect(runCommand("      - run: 'npm run ci:unit'")).toBe('npm run ci:unit');
  });
  it('extracts a double-quoted run: value', () => {
    expect(runCommand('      - run: "npm run ci:unit"')).toBe('npm run ci:unit');
  });
  it('extracts an unquoted run: value', () => {
    expect(runCommand('      - run: npm run ci:unit')).toBe('npm run ci:unit');
  });
  it('returns null for a `uses:` step (no run: at all)', () => {
    expect(runCommand('      - uses: actions/checkout@v5')).toBeNull();
  });
  it('returns null for a block with `uses:` on one line and `with:` below', () => {
    expect(runCommand('      - uses: actions/setup-node@v5\n        with:\n          node-version: 22')).toBeNull();
  });
  it('normalizes internal whitespace of the extracted command', () => {
    expect(runCommand('      - run: npm   run    ci')).toBe('npm run ci');
  });
});

describe('stepBlocks()', () => {
  it('splits a job into one block per 6-space-indented bullet', () => {
    const yml = [
      'jobs:',
      '  test:',
      '    steps:',
      '      - uses: actions/checkout@v5',
      '      - uses: actions/setup-node@v5',
      '        with:',
      '          node-version: 22',
      '      - run: npm ci',
      '      - run: npm run ci:unit',
    ].join('\n');
    const blocks = stepBlocks(yml);
    expect(blocks.length).toBe(4);
    // ⚠️ EXACT string, WITH its newlines — a joiner silently dropping the
    //    separator (e.g. `.join('')`) would still pass a `.toContain()` check.
    expect(blocks[1]).toBe('      - uses: actions/setup-node@v5\n        with:\n          node-version: 22');
    expect(blocks[3]).toBe('      - run: npm run ci:unit');
  });

  it('joins a TRAILING multi-line block (no bullet after it) WITH newlines', () => {
    const yml = ['      - uses: actions/checkout@v5', '        with:', '          x: 1'].join('\n');
    const blocks = stepBlocks(yml);
    expect(blocks).toEqual(['      - uses: actions/checkout@v5\n        with:\n          x: 1']);
  });

  it('returns an empty array when there is no step bullet at all', () => {
    expect(stepBlocks('jobs:\n  test:\n    steps: []\n')).toEqual([]);
  });

  it('ignores a bullet indented at a DIFFERENT depth (not a step)', () => {
    const yml = ['jobs:', '  test:', '    steps:', '  - not-a-step: true', '      - run: npm ci'].join('\n');
    const blocks = stepBlocks(yml);
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toContain('npm ci');
  });
});

describe('runStepsOf()', () => {
  it('discards `uses:` steps and keeps only `run:` ones, normalized', () => {
    const yml = ['      - uses: actions/checkout@v5', "      - run: 'npm  run   ci:unit'"].join('\n');
    expect(runStepsOf(yml)).toEqual([{ command: 'npm run ci:unit' }]);
  });

  it('returns an empty array for a workflow with no run step', () => {
    expect(runStepsOf('      - uses: actions/checkout@v5')).toEqual([]);
  });
});

describe('calledGroup()', () => {
  it('recognizes the bare `npm run ci` call (null = every group)', () => {
    expect(calledGroup('npm run ci')).toBeNull();
  });
  it('recognizes `npm run ci:<group>` and returns the group name', () => {
    expect(calledGroup('npm run ci:unit')).toBe('unit');
  });
  it('returns undefined for a command with a completely different shape', () => {
    expect(calledGroup('npm test')).toBeUndefined();
    expect(calledGroup('npm ci')).toBeUndefined();
    expect(calledGroup('echo hello')).toBeUndefined();
  });
  it('returns undefined for `npm run ci:` with an EMPTY group name (not `\\S+`)', () => {
    expect(calledGroup('npm run ci:')).toBeUndefined();
  });
});

describe('auditDivergence()', () => {
  const workflow = [
    '      - run: npm ci',
    '      - run: npm run ci:unit',
    '      - run: npm run ci:coupling',
  ].join('\n');

  it('finds zero divergence on a fully-compliant workflow', () => {
    expect(auditDivergence(workflow)).toEqual([]);
  });

  it('reports "outside the local command" for a plain third-party run', () => {
    const sabotaged = workflow + '\n      - run: echo hello';
    const found = auditDivergence(sabotaged);
    expect(found.length).toBe(1);
    expect(found[0].reason).toBe('outside the local command');
    expect(found[0].command).toBe('echo hello');
  });

  it('reports "unknown group" for `npm run ci:<invented>`', () => {
    const sabotaged = workflow + '\n      - run: npm run ci:nonexistent';
    const found = auditDivergence(sabotaged);
    expect(found.length).toBe(1);
    expect(found[0].reason).toBe('unknown group');
  });

  it('admits `npm ci` (setup) without flagging it', () => {
    expect(auditDivergence('      - run: npm ci')).toEqual([]);
  });

  it('admits a BARE `npm run ci` (covers every group) without flagging it', () => {
    // ⚠️ `calledGroup` returns `null` for the bare form — the `group !== null`
    //    guard below matters: without it, `null` would be tested against
    //    `known.has(null)` (always false) and get flagged as "unknown group".
    expect(auditDivergence('      - run: npm run ci')).toEqual([]);
  });
});

describe('unCalledGroups()', () => {
  it('returns every known group when the workflow text is empty', () => {
    expect(unCalledGroups([''])).toEqual(knownGroups());
  });

  it('returns an EMPTY array as soon as a bare `npm run ci` appears anywhere', () => {
    expect(unCalledGroups(['      - run: npm run ci:unit', '      - run: npm run ci'])).toEqual([]);
  });

  it('returns only the groups with NO caller across ALL given texts', () => {
    const texts = ['      - run: npm run ci:unit', '      - run: npm run ci:coupling'];
    const missing = unCalledGroups(texts);
    expect(missing).toContain('mutation');
    expect(missing).toContain('spec');
    expect(missing).not.toContain('unit');
    expect(missing).not.toContain('coupling');
  });

  it('ignores non-call steps (`npm ci`, third-party commands) when accumulating', () => {
    const texts = ['      - run: npm ci', '      - run: echo hi', '      - run: npm run ci:unit'];
    expect(unCalledGroups(texts)).not.toContain('unit');
  });
});

describe('missingCiAliases()', () => {
  it('reports every alias missing from an empty/undefined scripts object', () => {
    const missing = missingCiAliases(undefined);
    expect(missing).toContain('ci');
    for (const g of knownGroups()) expect(missing).toContain(`ci:${g}`);
  });

  it('reports nothing when every alias is present', () => {
    const scripts = { ci: 'x' };
    for (const g of knownGroups()) scripts[`ci:${g}`] = 'x';
    expect(missingCiAliases(scripts)).toEqual([]);
  });

  it('reports exactly the ONE missing alias among many present', () => {
    const scripts = { ci: 'x' };
    for (const g of knownGroups()) scripts[`ci:${g}`] = 'x';
    delete scripts['ci:unit'];
    expect(missingCiAliases(scripts)).toEqual(['ci:unit']);
  });

  it('treats a non-object input the same as an empty one', () => {
    expect(missingCiAliases(null)).toEqual(missingCiAliases({}));
    expect(missingCiAliases(42)).toEqual(missingCiAliases({}));
  });
});

describe('ciPreconditions() — ANTI-MUTE-PROBE', () => {
  it('is red on an empty world (both conditions)', () => {
    const issues = ciPreconditions({ workflowSteps: [], canon: [] });
    expect(issues.length).toBe(2);
  });
  it('is red on a non-empty canon but zero steps', () => {
    const issues = ciPreconditions({ workflowSteps: [], canon: CI_STEPS });
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('no RUN step');
  });
  it('is red on non-empty steps but an empty canon', () => {
    const issues = ciPreconditions({ workflowSteps: [{ command: 'npm ci' }], canon: [] });
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('canonical table EMPTY');
  });
  it('is green when both are non-empty', () => {
    expect(ciPreconditions({ workflowSteps: [{ command: 'npm ci' }], canon: CI_STEPS })).toEqual([]);
  });
  it('treats a non-array input the same as empty', () => {
    expect(ciPreconditions({ workflowSteps: null, canon: null }).length).toBe(2);
  });
});

describe('message builders — named, non-empty, cite the offending fact', () => {
  it('divergenceMessage names the command and the reason, and spells out the admitted forms + the fix', () => {
    const msg = divergenceMessage({ command: 'echo hi', reason: 'outside the local command' });
    expect(msg).toContain('echo hi');
    expect(msg).toContain('outside the local command');
    // ⚠️ EXACT text, not just "some content" — this is the operator-facing fix
    //    instruction: an empty line here would still satisfy a looser check.
    expect(msg).toContain('Only these forms are admitted: `npm ci`, `npm run ci`, `npm run ci:<group>`.');
    expect(msg).toContain("Replace it with the matching `npm run ci:<group>` call, or extend CI_STEPS.");
  });
  it('unCalledGroupMessage names the group', () => {
    expect(unCalledGroupMessage('mutation')).toContain('mutation');
  });
  it('missingAliasMessage names the script', () => {
    expect(missingAliasMessage('ci:spec')).toContain('ci:spec');
  });
});
