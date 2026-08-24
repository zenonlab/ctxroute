// ═══════════════════════════════════════════════════════════════════════
// THE THIRD HARNESS — one manifest, zero lines of engine, or the design failed
// ═══════════════════════════════════════════════════════════════════════
//
// 🎯 THE ACCEPTANCE CRITERION THIS FILE EXISTS FOR, and it is the operator's:
//    *anybody must be able to make THEIR harness compatible, simply* — a
//    company with a proprietary in-house agent, or even a rudimentary one.
//    The proof is therefore NOT "the second harness works". It is that a
//    THIRD, ARBITRARY harness costs ONE MANIFEST and ZERO lines of the plan
//    engine. Without that measurement, `wiring-plan.js` + `wiring-dialect.js`
//    would be a TOOL with one special case per product while looking like a
//    language — and the founding rule of this project is that the engine must
//    not move when a need appears.
//
// 🛑 THIS IS THE ANTI-VACUITY OF THE WHOLE MANIFEST CHAIN. `wiring.json`
//    generates the maintainer's own wiring, so it can pass while proving only
//    that the generator agrees with the one shape it was written against. The
//    fictional harness (`test/fixtures/wiring-fictional.json`) is deliberately
//    as far away as the vocabulary allows: another serialization (TOML),
//    another container path, another nesting (flat, no blocks), another name
//    for EVERY field, other event names, and three events MISSING entirely.
//    ⇒ IF MAKING THIS FILE PASS EVER REQUIRES EDITING `src/wiring-plan.js` OR
//    `src/wiring-dialect.js`, STOP: the design has failed, and saying so is
//    the deliverable.
//
// ⚠️ THE GENERATOR IS RUN AS A PROCESS, never called in memory. A source grep
//    can be fooled and an in-memory call skips the shell that reads the
//    machine facts; a process cannot lie about what it actually produces.
//
// ⚠️ `frames` IS SUPPLIED THROUGH `CTXROUTE_CONFIG_PATH`, the env var RESERVED
//    for tests: `ctxroute-config.json` is GITIGNORED, so a suite that read the
//    real one would be red on every clean clone and in CI. Paid 2026-08-07.

import { test, expect } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dialect } from '../src/wiring-dialect.js';

// The repository root FOLLOWS the module that resolves it — never a `../`
// counted by hand from a test file that may be moved.
const REPO = path.resolve(import.meta.dirname, '..');
const FICTIONAL = 'test/fixtures/wiring-fictional.json';
/** Fixture paths that exist NOWHERE: this cell judges what the generator PRODUCES. */
const FIXTURE = { settings: 'C:/fixture/settings.json', root: 'C:/fixture/ctxroute' };
const posix = (p) => p.split(path.sep).join('/');

/**
 * Runs the REAL generator as a PROCESS and returns everything it produced: the
 * document, what it said to a human, what it said about absences, and what it
 * left on disk. A source grep can be fooled and an in-memory call skips the
 * shell that measures the machine facts; a process cannot lie about what it
 * actually emits.
 *
 * @param {{manifest?: string, frames?: number, quiet?: boolean, write?: string, seed?: string}} o
 */
function run(o) {
  const {
    manifest = null, frames = 4, quiet = false, write = null, seed = null,
  } = o || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-port-'));
  const cfg = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(cfg, JSON.stringify({ enabled: true, frames }));
  const outPath = path.join(dir, write === null ? 'document.out' : write);
  if (seed !== null) fs.writeFileSync(outPath, seed);
  const argv = ['tools/wiring-generate.js'];
  if (quiet) argv.push('--quiet');
  argv.push(write === null ? '--document' : '--write', posix(outPath));
  if (write === null) argv.push('--settings', FIXTURE.settings);
  argv.push('--root', FIXTURE.root);
  if (manifest) argv.push('--manifest', manifest);
  const r = spawnSync(process.execPath, argv, {
    cwd: REPO, encoding: 'utf8', env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg },
  });
  const text = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
  const leftovers = fs.readdirSync(dir).sort();
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    status: r.status, stdout: r.stdout, stderr: r.stderr, text, leftovers,
  };
}

// ── ① THE CELL THE WHOLE DESIGN IS JUDGED BY ─────────────────────────
test('A THIRD, FICTIONAL HARNESS GENERATES ITS WIRING — one manifest, zero engine lines', () => {
  const r = run({ manifest: FICTIONAL });
  assert.strictEqual(r.status, 0, `the generator refused a coherent third harness:\n${r.stderr}`);
  const text = r.text;

  // ⚠️ EVERY EXPECTATION IS WRITTEN OUT BY HAND, from the FIXTURE and never
  //    read back from the module: an assertion that quotes the code under test
  //    is mutated with it and stops seeing the mutant.
  //
  // ANOTHER ADDRESS: the declarations live under `automation.triggers`, not
  // under this framework's native `hooks.<event>`.
  assert.match(text, /\[\[automation\.triggers\]\]/,
    "The fictional harness's container was not honoured: the generator wrote the shape it was born with instead of the one declared, which is a tool with one special case per product.");
  assert.strictEqual(text.includes('[[hooks.'), false,
    "The document carries the FIRST harness's container. A third harness that inherits another product's shape is not wired at all.");

  // ANOTHER SERIALIZATION: TOML, not JSON.
  expect(() => JSON.parse(text)).toThrow();
  assert.strictEqual(text.trimEnd().endsWith('deadline_seconds = 5'), true,
    'The document does not end on the last declaration this framework generates for that harness.');

  // ANOTHER NAME FOR EVERY FIELD. Each is asserted: a renderer that mapped
  // four and leaked the fifth would produce a document the harness reads as
  // four working hooks and one silently absent field.
  assert.match(text, /^when = "before_tool"$/m);
  assert.match(text, /^only_for = "\*"$/m);
  assert.match(text, /^kind = "command"$/m);
  assert.match(text, /^exec = "node C:\/fixture\/ctxroute\/src\/hooks\/doc-inject\.js --client --frame 1 --frames 4"$/m);
  assert.match(text, /^deadline_seconds = 7$/m);
  for (const native of ['type =', 'command =', 'timeout =', 'matcher =']) {
    assert.strictEqual(text.includes(native), false,
      `The document carries the native key \`${native}\`: the field mapping was not applied, so the fictional harness would read a wiring it does not understand.`);
  }

  // THE ENGINE STILL DECIDES: the frame coordinates, the state lane and the
  // declared bound are the SHARED decisions, and they must survive the change
  // of harness untouched. A renderer that lost them would emit a document that
  // looks right and delivers one frame out of four.
  assert.strictEqual((text.match(/--frames 4/g) || []).length, 4,
    'The four frames of one action are not all declared: the bandwidth of a gesture stopped being generated when the harness changed.');
  for (const k of [1, 2, 3, 4]) assert.match(text, new RegExp(`--frame ${k} --frames 4`));
  assert.strictEqual((text.match(/--client/g) || []).length, 5,
    'The state lane is not carried by every state consumer on this harness — that is the 2026-08-22 split brain, ported.');
});

// ── ② A HARNESS WITHOUT AN EVENT: SKIPPED, AND NAMED ─────────────────
//
// 🛑 A PATH MISSING FROM A WIRING LOOKS EXACTLY LIKE ONE THAT WORKS. The
//    fictional harness has no SessionStart, no PostToolUse and no PreCompact,
//    so three consumers cannot be wired — and the ONLY moment anybody can be
//    told is this one.
test('an event the harness does not have is SKIPPED and NAMED, never bodged onto a neighbour', () => {
  const r = run({ manifest: FICTIONAL, frames: 2 });
  assert.strictEqual(r.status, 0, r.stderr);

  // The three skipped paths really are absent from the document...
  for (const gone of ['session-inject.js', 'doc-write-guard.js', 'ctxroute-reset.js']) {
    assert.strictEqual(r.text.includes(gone), false,
      `${gone} was written onto a harness that has no event for it: a hook declared on an event the harness does not know runs NOTHING, in silence.`);
  }
  // ...and what remains was really written: an empty document would satisfy
  // the three assertions above while proving nothing at all.
  assert.strictEqual((r.text.match(/\[\[automation\.triggers\]\]/g) || []).length, 3,
    'Two frames plus the turn counter should have been written; a renderer that skipped everything passes the absences above by vacuity.');

  // AND THE ABSENCE IS SAID OUT LOUD, with the events NAMED and each dropped
  // module quoted. A count with no names sends the reader hunting.
  assert.match(r.stderr, /3 declaration\(s\) SKIPPED — "fictional-acme-agent" has no PostToolUse, PreCompact, SessionStart event/);
  for (const gone of ['session-inject.js', 'doc-write-guard.js', 'ctxroute-reset.js']) {
    assert.ok(r.stderr.includes(gone), `the skip notice does not name ${gone}.`);
  }
});

test('--quiet silences the COUNT of what was written, never an ABSENCE', () => {
  const r = run({ manifest: FICTIONAL, frames: 2, quiet: true });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, '', '`--quiet` still wrote the count to stdout.');
  assert.match(r.stderr, /SKIPPED/,
    '`--quiet` swallowed the skip notice. A count and an absence are different kinds of fact: one is noise, the other is the only warning anybody gets.');
});

// ── ③ THE WRITE MODE IS DECLARED, AND A REFUSAL QUOTES ITS REASON ────
test('--write is REFUSED on a harness that declares the fragment mode, quoting the declared reason', () => {
  const original = `${JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node /theirs.js' }] }] } }, null, 2)}\n`;
  const r = run({
    manifest: FICTIONAL, frames: 2, write: 'settings.json', seed: original,
  });

  assert.notStrictEqual(r.status, 0, 'A harness that declares it cannot be spliced was spliced anyway. A half-written wiring is worse than none.');
  assert.match(r.stderr, /declares `write\.mode: "fragment"`, so --write is REFUSED/);
  assert.match(r.stderr, /Declared reason: an invented harness has no configuration on this machine to splice into/,
    'The refusal does not quote the DECLARED reason — an absence of the write mode that cannot say why is indistinguishable from an oversight.');

  // 🛑 BOTH SIDES ARE ASSERTED. A refusal that had already half-written the
  //    file, or left a backup behind, would be the exact damage this mode
  //    exists to avoid: the operator's file is theirs, and it is their only
  //    copy.
  assert.strictEqual(r.text, original,
    'The target file was modified by a run that refused. Nothing may be written before the mode is checked.');
  assert.deepStrictEqual(r.leftovers, ['ctxroute-config.json', 'settings.json'],
    'A backup or a temporary file was left behind by a refused run.');
});

// ── ④ THE CONTROL: THE REAL MANIFEST STILL GENERATES ─────────────────
//
// Without it, every red above would be satisfied by a generator that refuses
// everything, and every green by one that produces nothing.
test("CONTROL: the repository's own manifest still generates its own document, in its own format", () => {
  const r = run({ frames: 3 });
  assert.strictEqual(r.status, 0, r.stderr);
  const doc = JSON.parse(r.text);
  assert.deepStrictEqual(Object.keys(doc), ['hooks']);
  assert.ok(Array.isArray(doc.hooks.PreToolUse), 'The native manifest stopped producing its PreToolUse block.');
  assert.strictEqual(doc.hooks.PreToolUse[0].matcher, '*');
  assert.strictEqual(doc.hooks.PreToolUse[0].hooks.length, 3,
    'The frame count no longer reaches the document: the bandwidth of an action is generated from the config, not typed.');
  assert.strictEqual(r.stderr, '',
    'The native manifest reported skipped paths: every event it declares should exist on the harness it declares.');
});

// ── ⑤ THE ENGINE MAY NOT KNOW A PRODUCT, AND THE LIST IS DERIVED ─────
//
// 🛑 THE RULE THIS SEALS: no `if (harness === ...)` anywhere in the plan engine
//    or the dialect module. It is DERIVED — the forbidden literals are read
//    from the manifests themselves, so a harness added tomorrow joins the
//    table by itself and this cell turns red the day its name is typed into
//    the engine. A hand-written list would only know the products that existed
//    when it was typed, which is the enumeration this repository refuses.
// ⚠️ COMMENTS ARE STRIPPED BEFORE THE SCAN: prose is free to name a harness —
//    that is how the reasons get written down — and a gate that reddened on a
//    comment would be disarmed within a week.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

test('GATE: neither the plan engine nor the dialect module names a single harness', () => {
  const manifests = ['wiring.json', FICTIONAL].map((f) => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8')));
  const names = manifests.map((m) => dialect(m).name);
  // ANTI-VACUITY: a scan against an empty list of names is green and measures
  // nothing at all.
  assert.ok(names.length >= 2, `Only ${names.length} harness name(s) derived: this gate would be judging almost nothing.`);
  for (const n of names) assert.ok(typeof n === 'string' && n.length > 2, `Refusing to scan for the useless name ${JSON.stringify(n)}.`);

  for (const file of ['src/wiring-plan.js', 'src/wiring-dialect.js']) {
    const code = strip(fs.readFileSync(path.join(REPO, file), 'utf8'));
    // ANTI-VACUITY, second floor: a `strip` that emptied the file would make
    // every `includes` below false, i.e. green while reading nothing.
    assert.ok(code.includes('function '), `${file} survived comment stripping as something that is no longer code: the scan below would be reading nothing.`);
    for (const n of names) {
      assert.strictEqual(code.includes(n), false,
        `${file} names the harness ${JSON.stringify(n)} outside a comment.\n`
        + 'A generator that learns one special case per product is a TOOL: it covers the harnesses somebody foresaw, and every new one brings the maintainer back. '
        + 'What varies between harnesses is DECLARED in the manifest (format, events, layout, write mode); what DECIDES stays shared. '
        + 'Put the difference in the manifest, never here.');
    }
  }
});

test('SEEN RED: the same scan finds a harness name planted in a copy of the engine', () => {
  // ⚠️ IN MEMORY, NEVER ON A REAL FILE. Sabotaging a tracked file to prove a
  //    gate bites is how a suite takes down its neighbours — that class was
  //    already paid for in this repository (38 tests, other suites).
  const name = dialect(JSON.parse(fs.readFileSync(path.join(REPO, FICTIONAL), 'utf8'))).name;
  const clean = strip(fs.readFileSync(path.join(REPO, 'src/wiring-plan.js'), 'utf8'));
  assert.strictEqual(clean.includes(name), false, 'The intact engine is already reported as naming a harness, so the sabotage below proves nothing.');
  const sabotaged = strip(`${fs.readFileSync(path.join(REPO, 'src/wiring-plan.js'), 'utf8')}\nconst SPECIAL_CASE = '${name}';\n`);
  assert.strictEqual(sabotaged.includes(name), true,
    'A harness name written as CODE survived the scan. The gate would be green on the very branch it exists to forbid.');
  // And a name written as PROSE must NOT be found: a gate that reddens on a
  // comment gets disarmed, and the reasons have to be writable somewhere.
  const commented = strip(`${fs.readFileSync(path.join(REPO, 'src/wiring-plan.js'), 'utf8')}\n// the ${name} harness declares this in its manifest\n`);
  assert.strictEqual(commented.includes(name), false,
    'The scan reddens on a comment. Prose must stay free to name a harness, or the reasons stop being written down.');
});
