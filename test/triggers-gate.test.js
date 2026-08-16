// ═══════════════════════════════════════════════════════════════════════
// TRIGGERS GATE — "declared" MUST mean "consumed".
// ═══════════════════════════════════════════════════════════════════════
//
// REASON FOR EXISTING (31/07/2026, REFACTOR-PLAN §A): `validate()` answered
// 0 ERRORS on a doc of the FILE corpus carrying `mcp:` — a KNOWN key, hence
// accepted, and consumed by NO source ⇒ a MUTE doc, a happy validator.
// ⚠️ It is WORSE than a typo (`mach:` = rejected, dead doc detected): the key
//    is recognized, so the validator APPROVES SOMETHING DEAD. A validator that
//    approves something dead is not neutral — it actively steers towards the
//    wrong cause (on 31/07: accusing the ENGINE of not reading the commands).
//
// ⚠️ THIS GATE READS NO LIST: it CALLS the real sources and demands
//    that a trigger produce a match. A copied list would lie the day
//    a source changes; a real call, never. That is the difference between
//    "certifying" and "proving".
//
// ⚠️ ADDING A TRIGGER TO `TRIGGERS` WITHOUT ITS PROOF CASE = RED.
//    That is intentional: a trigger without proof of consumption is exactly
//    the bug this file exists to make impossible.
//
// ⚠️ ZERO I/O, no fleet: valid on a FRESH clone (a gate that is only true
//    on its author's machine is false for everyone).
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validate, TRIGGERS, KNOWN } from '../src/frontmatter.js';
import { rulesFromCorpus } from '../src/loader.js';
import fileSource from '../src/sources/file.js';
import toolSource from '../src/sources/tool.js';

// A case = a minimal frontmatter + the payload that MUST trigger it, and the
// source supposed to consume it. Thunks (never module-level consts: perTest).
const CAS = () => ({
  match: {
    fm: '---\nmatch: cible-unique.js\nmode: dumb\n---\nBody.\n',
    payload: { toolName: 'Read', toolInput: { file_path: 'C:/p/cible-unique.js' } },
    via: 'fichier',
  },
  rules: {
    fm: '---\nrules: [{"pattern":"cible-unique.js"}]\nmode: dumb\n---\nBody.\n',
    payload: { toolName: 'Read', toolInput: { file_path: 'C:/p/cible-unique.js' } },
    via: 'fichier',
  },
  tool: {
    fm: '---\ntool: ["WebFetch"]\nmode: dumb\n---\nBody.\n',
    payload: { toolName: 'WebFetch', toolInput: { url: 'https://exemple.test' } },
    via: 'outil',
  },
});

// Passes a frontmatter through the REAL chain of its source, returns true if it matches.
function declenche(texte, payload, via) {
  const doc = 'docs/preuve.md';
  if (via === 'fichier') {
    return fileSource.matchingDocs(rulesFromCorpus([{ doc, text: texte }]), payload).length > 0;
  }
  // Tool axis: the source consumes the parsed frontmatter (sources/tool.js contract).
  const { parse } = require('../src/frontmatter.js');
  return toolSource.matchingDocs([{ doc, fm: parse(texte).data }], payload).length > 0;
}

test('GATE: every trigger of TRIGGERS has a proof case', () => {
  const cas = CAS();
  for (const k of TRIGGERS) {
    assert.ok(cas[k],
      `\`${k}\` is declared a trigger but has NO proof case here: add it, ` +
      'or remove it from TRIGGERS. An unproven trigger = a mute doc + a happy validator.');
  }
});

test('GATE: each trigger really TRIGGERS (real source call)', () => {
  const cas = CAS();
  for (const k of TRIGGERS) {
    const c = cas[k];
    assert.equal(validate(require('../src/frontmatter.js').parse(c.fm).data).length, 0,
      `the proof frontmatter of \`${k}\` must be VALID`);
    assert.ok(declenche(c.fm, c.payload, c.via),
      `\`${k}\` is declared a trigger but NO source consumes it — it is a false green (§A).`);
  }
});

test('CONTRACT: `mcp` IS NO LONGER a trigger of the file corpus', () => {
  // ⚠️ CONTRACT value written HARDCODED: deriving the expectation from the tested
  //    value would make the test mutate WITH the code (invisible mutant).
  assert.deepStrictEqual(TRIGGERS, ['match', 'rules', 'tool']);
});

test('§A: a FILE doc carrying `mcp:` is RED, with the message that says where to go', () => {
  const errs = validate({ mcp: 'stripe' });
  assert.ok(errs.length > 0, '`mcp:` in a file doc MUST be rejected (before: 0 errors, mute doc)');
  const texte = errs.join(' | ');
  assert.ok(/PATH/.test(texte), 'the message must state the PATH docs/mcp/{server}.md');
  assert.ok(!/no trigger/.test(texte),
    'a single useful message: piling "no trigger" on top would drown the line that repairs');
});

test('NEGATIVE-CHECK: the gate DETECTS a non-consumed trigger', () => {
  // ⚠️ Without this, the gate could turn green while proving NOTHING.
  //    We simulate the addition of a phantom trigger and demand detection.
  const cas = CAS();
  const fantome = 'perimetre'; // a synonym actually invented then removed on 18/07/2026
  const listeSabotee = [...TRIGGERS, fantome];
  const manquants = listeSabotee.filter((k) => !cas[k]);
  assert.deepStrictEqual(manquants, [fantome],
    'the gate does not detect a trigger without proof: it proves NOTHING.');
});

test('NEGATIVE-CHECK: a KNOWN key is NEVER enough to trigger', () => {
  // `scope` is known and legitimate, but ALONE it triggers nothing:
  // distinguishing it from a trigger is the whole point of §A.
  assert.ok(KNOWN.includes('scope') && !TRIGGERS.includes('scope'));
  assert.ok(validate({ scope: ['x'] }).length > 0,
    'a doc with only `scope` would be mute: it MUST be red');
});

test('§A: NO validate message advises a REJECTED key', () => {
  // ⚠️ A validator that refuses must make the author AUTONOMOUS. Advising `mcp`
  //    (now rejected) would send them straight into the next wall — the message
  //    would itself become a trap. This gate reads the REAL messages.
  const messages = [
    ...validate({}),                       // no trigger
    ...validate({ mcp: 'stripe' }),        // inert key
    ...validate({ tool: ['*'] }),          // bare wildcard
  ].join(' | ');
  assert.ok(!/you need .*`mcp`|and\/or `mcp`/.test(messages),
    'a message advises `mcp` as a trigger while it is rejected: ' + messages);
});
