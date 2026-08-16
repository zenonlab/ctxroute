// ═══════════════════════════════════════════════════════════════════════
// language-doc.js — THE LANGUAGE FACTS, DERIVED FROM THE CODE
// ═══════════════════════════════════════════════════════════════════════
//
// SPECIFIC SHELL of `docfacts.js` (generic). It alone knows the BINDING
// "this engine constant ↔ that block of that doc" — the only part that
// cannot be generic, since it IS the project.
//
// ⚠️ THE CONSTANTS ARE IMPORTED, NEVER COPIED. That is the whole point:
//    a key added to `KNOWN` shows up here without anyone thinking about it,
//    and the gate stays red until the doc displays it. Copying a list here
//    would recreate EXACTLY the defect this file exists to kill.
//
// USAGE:
//   node tools/language-doc.js            → verify (silent when all is well)
//   node tools/language-doc.js --write    → regenerate the docs' AUTO blocks
//
// ⚠️ LAYERS: the CORE (`facts()`) is PURE and reads no file; only the CLI
//    shell at the bottom does I/O, writes output and picks the exit code.
//    NEVER move a `process.exit` or a `console.log` up into the core: it must
//    stay callable from a test without killing the runner.
//
// ⚠️ ONE derivation, TWO targets (since 2026-08-16, decision ㉒ reversed —
//    the whole repository is English-only): `docs/session/language.md` (the
//    session-injected dense doc) and `LANGUAGE.md` (the public root
//    reference) share the SAME facts. Two docs deriving from two lists would
//    be exactly the bug class docfacts exists to kill.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const fm = require('../src/frontmatter');
const file = require('../src/sources/file');
const docfacts = require('../src/docfacts');

// ⚠️ Paths RELATIVE to this file, never to the `cwd`: the gate and the CLI
//    are launched from different directories.
const DOC = require('path').join(__dirname, '..', 'docs', 'session', 'language.md');
const DOC_EN = require('path').join(__dirname, '..', 'LANGUAGE.md');

/**
 * THE FACTS. PURE — no I/O, hence mutable and testable without a disk.
 * @returns {Array<{name: string, content: string}>}
 *
 * ⚠️ A fact only enters here if it is ENUMERABLE (a list, a bound, a
 *    number). Everything that is JUDGEMENT ("the code is authoritative",
 *    "the injection lands after the action") stays in PROSE, outside the
 *    AUTO blocks: a machine cannot verify it, and pretending otherwise would
 *    be the false sense of safety that `docfacts.js` fights.
 */
function facts() {
  return [
    {
      name: 'vocabulary',
      content:
        `File doc keys: ${docfacts.wordList(fm.KNOWN)}\n`
        + `\`rules\` entry keys: ${docfacts.wordList(fm.RULE_KEYS)}\n`
        + `Triggers: ${docfacts.wordList(fm.TRIGGERS)} · tool wildcard \`${fm.WILDCARD}\` · \`inject: ${fm.INJECT.join('|')}\` disarms\n`
        + 'Unknown key ⇒ doc REJECTED (never silently ignored).',
    },
    {
      name: 'cadence',
      content:
        `\`mode\`: ${docfacts.wordList(fm.MODES)} · \`driftUnit\`: ${docfacts.wordList(fm.DRIFT_UNITS)}\n`
        + 'Cascade: entry > `defaults.{source}` > global > framework default.',
    },
    {
      name: 'bounds',
      content:
        `\`scope\` is BOUNDED: ${file.MAX_DEPTH} nesting levels · ${file.MAX_SIZE} characters.\n`
        + 'Beyond that the value is truncated ⇒ `scope` goes mute — and `explain.js` says so.',
    },
  ];
}

// The CLI's TARGETS — both docs carry the SAME facts (single derivation).
const TARGETS = [
  { filePath: DOC, facts },
  { filePath: DOC_EN, facts },
];

module.exports = { facts, factsEn: facts, DOC, DOC_EN, TARGETS };

// ── CLI SHELL (I/O + output + exit code) ─────────────────────────────────
// ⚠️ `require.main === module`: nothing runs when a test imports the module.
//    Without this guard, importing this file would kill the runner.
if (require.main === module) {
  const fs = require('fs');
  let echec = false;

  for (const target of TARGETS) {
    const text = fs.readFileSync(target.filePath, 'utf8');
    const f = target.facts();

    if (process.argv.includes('--write')) {
      const out = docfacts.regenerate(text, f);
      if (out !== text) {
        fs.writeFileSync(target.filePath, out);
        console.log(`✅ ${f.length} block(s) regenerated in ${target.filePath}`);
      } else {
        console.log(`✅ ${target.filePath} already up to date.`);
      }
      continue;
    }

    const { ok, discrepancies } = docfacts.verify(text, f);
    if (ok) {
      console.log(`✅ ${f.length} fact(s) match the code in ${target.filePath}.`);
    } else {
      // FAIL-LOUD: a diagnostic silent about its own failure reads as "all good".
      echec = true;
      console.error(`\n❌ ${target.filePath} STATES what the code contradicts:\n`);
      discrepancies.forEach((e) => console.error(`  • ${e}\n`));
    }
  }
  if (echec) {
    console.error('  Fix: `node tools/language-doc.js --write` (the CODE is authoritative).\n');
    process.exit(1);
  }
  process.exit(0);
}
