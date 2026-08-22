// ═══════════════════════════════════════════════════════════════════════
// GATE — THE WIRING IS GENERATED FROM ONE MANIFEST, OR IT HAS DRIFTED
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 THE DEFECT, MEASURED IN PRODUCTION ON 2026-08-22. The harness wiring
//    declared the framework NINETEEN times by hand — sixteen gate frames plus
//    the session gate, the turn counter and the PreCompact reset. The lane
//    argument was written on the sixteen and forgotten on the three. The gate
//    then recorded its deliveries in the daemon's RAM while those peers read
//    and erased the state FILES: TWO MEMORIES. After a compaction the reset
//    wiped a disk the daemon never read, so skills and `once` documents never
//    came back — no error, no badge, nothing red. `doctor.js --settings` did
//    catch it, but only at the NEXT session start, hours later.
//
// 📐 THE CLASS IS STRUCTURAL: one truth (the lane, the frame count) held in
//    nineteen hand-edited copies. Detection after the fact does not scale —
//    add a consumer, a harness or a machine and the surface grows linearly.
//    So the hand-written copy is REMOVED: `wiring.json` is the source, the
//    declarations are a generated artefact, and this gate re-derives them and
//    confronts them with what the machine really executes.
//
// 🛑 IT DOES NOT REPLACE `doctor.js --settings` — the two are DEFENCE IN
//    DEPTH, and they judge different things. This gate PREVENTS: it says the
//    live wiring is exactly what the manifest generates, so a hand edit is
//    red before it is ever executed. The doctor CATCHES: it judges coordinates
//    and lane coherence on whatever is actually there, including declarations
//    the manifest does not own, and it does so at session start on the
//    operator's machine, where no test in this repository runs. Deleting
//    either one leaves a whole failure mode uncovered.
//
// 🛑 PHASE ONE IS READ-ONLY. The generator writes a FRAGMENT to a temporary
//    file and this gate compares; nothing ever writes `settings.json`. That
//    file is NOT ours — it also carries the operator's own hooks, their
//    permissions and their preferences — so the manifest owns ONLY what it
//    declares, and the comparison ignores everything else, per (event,
//    matcher) block.
//
// ⚠️ FAIL-CLOSED AND NON-VACUOUS, because a mis-parsed comparison looks
//    exactly like a coherent one. An unreadable or invalid settings.json is
//    RED. Zero framework declarations found is RED. Zero declarations
//    generated is RED. An ambiguous repository root is RED. "We could not
//    measure" is never "it agrees".
//
// ⚠️ CLEAN SKIP when the machine has no wiring at all (CI, fresh clone, fork):
//    a gate that demanded the operator's home would be red for everybody. A
//    SKIP is visible in the runner's report; a silent pass is not.
//
// ⚠️ SABOTAGES THAT MUST TURN THESE CELLS RED, each one run before this file
//    was kept (see docs/framework/wiring-manifest.md):
//    ① `stateLane: "files"` in the manifest ⇒ the lane vanishes from the four
//       state consumers ⇒ drift. That is the 2026-08-22 defect, inverted.
//    ② one frame declaration deleted from the live copy ⇒ drift + count.
//    ③ `--client` stripped from `ctxroute-reset.js` alone in the live copy ⇒
//       drift. That is the 2026-08-22 defect, verbatim.
//    ④ an empty `consumers` list ⇒ the generator refuses, named, exit 2.
//    ⑤ an invalid JSON settings.json ⇒ RED, never a quiet pass.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const paths = require_('../src/paths');
const { byBlock } = require_('../src/wiring-plan');

// The repository root FOLLOWS the module that resolves it — never a `../`
// counted by hand from a test file that may be moved.
const REPO = path.resolve(path.dirname(require_.resolve('../src/wiring-plan')), '..');

// The wiring lives BESIDE the hook fleet, whose root has a single owner
// (`paths.js`). We consume that owner rather than rebuilding `~/.claude` by
// hand — that class of copy has been paid for six times in this repository.
// The override exists so a sabotage cell can point at a fixture; it is
// RESERVED for tests, like every other env var of `paths.js`.
function settingsPath() {
  return process.env.CTXROUTE_WIRING_SETTINGS
    || path.join(path.dirname(paths.fleetHooksDir()), 'settings.json');
}

const wired = fs.existsSync(settingsPath());

/** POSIX form: that is how the harness executes a command line. */
const posix = (p) => p.split(path.sep).join('/');

/**
 * Reads what the machine REALLY declares. Every failure here throws, named:
 * a wiring we cannot read is never a wiring that agrees.
 */
function live(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    throw new Error(`settings.json is UNREADABLE (${file}): ${e.message}. A wiring nobody can read is not a wiring that agrees with the manifest.`);
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) {
    throw new Error(`settings.json is INVALID JSON (${file}): ${e.message}. The harness would run a wiring this gate cannot judge.`);
  }
  const hooks = parsed && parsed.hooks;
  if (!hooks || typeof hooks !== 'object') {
    throw new Error(`settings.json declares no \`hooks\` section (${file}): the framework is not wired at all, which is not the same as being wired correctly.`);
  }

  const flat = [];
  for (const event of Object.keys(hooks)) {
    const blocks = Array.isArray(hooks[event]) ? hooks[event] : [];
    for (const block of blocks) {
      const matcher = block && typeof block.matcher === 'string' ? block.matcher : null;
      const entries = block && Array.isArray(block.hooks) ? block.hooks : [];
      for (const h of entries) {
        const decl = { event, matcher, type: h.type, command: h.command, url: h.url };
        if (h.timeout !== undefined) decl.timeout = h.timeout;
        flat.push(decl);
      }
    }
  }

  // ── THE ROOT IS MEASURED, NEVER WRITTEN DOWN ───────────────────────
  // This repository is public: an absolute home path may not live in a
  // tracked file. So the root comes from the wiring itself, and a candidate
  // only counts if it really holds this framework. Two distinct roots = two
  // copies of the framework wired at once, which is a fault of its own.
  const roots = new Set();
  for (const d of flat) {
    if (typeof d.command !== 'string') continue;
    const m = /^node\s+(\S+?)\/(?:src\/hooks|tools)\/[A-Za-z0-9_.-]+\.js(?:\s|$)/.exec(d.command);
    if (!m) continue;
    if (fs.existsSync(path.join(m[1], 'src', 'hooks', 'doc-inject.js'))) roots.add(m[1]);
  }
  if (roots.size !== 1) {
    throw new Error(`${roots.size} framework root(s) measured in the wiring [${[...roots].join(', ')}]. Zero means nothing of this framework is wired (or it was moved and every declaration is dead); more than one means two copies run at the same time. Neither can be compared with a single manifest.`);
  }
  const root = [...roots][0];
  const own = flat.filter((d) => typeof d.command === 'string' && d.command.startsWith(`node ${root}/`));
  return { root, declarations: own, total: flat.length };
}

/** Runs the REAL generator, as a process. A source grep can be fooled; a process cannot. */
function generate(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-'));
  const out = path.join(dir, 'fragment.json');
  // ⚠️ POSIX SEPARATORS ON BOTH SIDES, and that is CANONICAL, not cosmetic:
  //    a command line is executed as written, so `C:\…` and `C:/…` are two
  //    spellings of one path. The manifest generates one form; a wiring
  //    written in the other is a divergence the operator should see once and
  //    fix, not a difference the gate should silently absorb.
  const argv = ['tools/wiring-generate.js', '--quiet', '--out', posix(out), '--settings', posix(opts.settings), '--root', opts.root];
  if (opts.manifest) argv.push('--manifest', opts.manifest);
  execFileSync(process.execPath, argv, { cwd: REPO, encoding: 'utf8' });
  const fragment = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return fragment;
}

/** Both sides reduced to the SAME comparable shape, per (event, matcher) block. */
function blocks(declarations) {
  const g = byBlock(declarations.map((d) => ({
    event: d.event,
    matcher: d.matcher,
    type: d.type,
    command: d.command,
    ...(d.timeout === undefined ? {} : { timeout: d.timeout }),
  })));
  return JSON.stringify([...g.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), null, 2);
}

// ── ① THE MANIFEST IS THE SINGLE PLACE A HUMAN EDITS ─────────────────
test('the manifest declares real modules, relative, and at least one framed consumer', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'wiring.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.consumers) && manifest.consumers.length > 0,
    'wiring.json declares no consumer. An empty manifest generates an empty wiring, and an empty wiring agrees with a settings.json where the framework was never wired: both look like success.');

  const missing = manifest.consumers
    .map((c) => c.module)
    .filter((m) => !fs.existsSync(path.join(REPO, m)));
  assert.deepStrictEqual(missing, [],
    `wiring.json declares module(s) that do not exist: ${missing.join(', ')}. The wiring would spawn a dead file, and a dead hook is indistinguishable from an absent one.`);

  const absolute = manifest.consumers.map((c) => c.module).filter((m) => /^([A-Za-z]:|\/|~)|\\/.test(m));
  assert.deepStrictEqual(absolute, [],
    `wiring.json carries absolute or Windows-separated module path(s): ${absolute.join(', ')}. This repository is PUBLIC and treats itself as already public — the machine root is measured, never written down.`);

  const framed = manifest.consumers.filter((c) => c.framed === true);
  assert.strictEqual(framed.length, 1,
    `${framed.length} framed consumer(s) declared. Exactly one declaration is repeated per frame — the gate. Zero means the bandwidth of an action stopped being generated and went back to being typed by hand.`);
});

// ── ② THE GENERATOR IS DETERMINISTIC ─────────────────────────────────
test.skipIf(!wired)('the generator is deterministic: same input, byte-identical output', () => {
  const file = settingsPath();
  const root = live(file).root;
  const first = JSON.stringify(generate({ settings: file, root }));
  const second = JSON.stringify(generate({ settings: file, root }));
  assert.strictEqual(first, second,
    'Two runs of tools/wiring-generate.js on the same input produced different output. A drift gate built on a non-deterministic generator reports divergences that are only the generator disagreeing with itself.');
});

// ── ③ ANTI-VACUITY: THE COMPARISON HAS SOMETHING TO COMPARE ──────────
test.skipIf(!wired)('the comparison is non-vacuous: framework declarations found on BOTH sides', () => {
  const file = settingsPath();
  const l = live(file);
  const generated = generate({ settings: file, root: l.root }).declarations;

  assert.ok(l.total >= 1, `settings.json flattened to ${l.total} declaration(s): nothing was parsed, so nothing was judged.`);
  assert.ok(l.declarations.length >= 2,
    `Only ${l.declarations.length} framework declaration(s) found under ${l.root} out of ${l.total} total. A comparison of an empty set against an empty set passes while measuring nothing.`);
  assert.ok(generated.length >= 2,
    `The generator produced ${generated.length} declaration(s). An empty generated side agrees with an unwired machine.`);
  assert.ok(byBlock(generated).size >= 2,
    'The generated wiring covers fewer than two (event, matcher) blocks: the per-block comparison would be judging a single group and could not see a hook lost from another event.');
});

// ── ④ THE DRIFT CELL ─────────────────────────────────────────────────
test.skipIf(!wired)('GATE: the live wiring is EXACTLY what the manifest generates', () => {
  const file = settingsPath();
  const l = live(file);
  const generated = generate({ settings: file, root: l.root }).declarations;
  assert.strictEqual(blocks(l.declarations), blocks(generated),
    `The wiring the harness executes has DRIFTED from wiring.json.\n`
    + `  settings.json: ${file}\n  framework root: ${l.root}\n`
    + '⇒ Either someone hand-edited the wiring (put the change in wiring.json instead — it is the single place a human edits), '
    + 'or the manifest was changed without the wiring being re-applied. '
    + 'This is the shape of the 2026-08-22 defect: one truth, several hand-written copies, and the divergence is SILENT — '
    + 'the lane written on sixteen declarations and forgotten on three gave the framework two memories, so `once` documents '
    + 'never came back after a compaction, with nothing red anywhere.\n'
    + 'Regenerate and read the difference: node tools/wiring-generate.js --settings <settings.json> --root <framework root> --out <tmp file>');
});

// ── ⑤ SEEN RED: the manifest's lane is what the wiring carries ────────
// The sabotage is the 2026-08-22 defect, inverted: flip the manifest's lane
// and the flag must disappear from EVERY state consumer at once — which is
// precisely why it can no longer be forgotten on one of them.
test.skipIf(!wired)('SABOTAGE: flipping `stateLane` changes the wiring of every state consumer, and the gate sees it', () => {
  const file = settingsPath();
  const l = live(file);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-sab-'));
  const broken = path.join(dir, 'wiring.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'wiring.json'), 'utf8'));
  manifest.stateLane = 'files';
  fs.writeFileSync(broken, JSON.stringify(manifest, null, 2));
  try {
    const sabotaged = generate({ settings: file, root: l.root, manifest: posix(broken) }).declarations;
    const withLane = sabotaged.filter((d) => d.command.includes(' --client'));
    assert.deepStrictEqual(withLane.map((d) => d.command), [],
      'Flipping `stateLane` to "files" left the lane argument on some declarations: the lane is NOT applied in one pass, so it can still be written on one consumer and forgotten on another.');
    assert.notStrictEqual(blocks(l.declarations), blocks(sabotaged),
      'The gate compares equal against a wiring whose entire lane was removed. It would not see a split brain either.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── ⑥ SEEN RED: one peer losing the lane — the defect, verbatim ───────
test.skipIf(!wired)('SABOTAGE: stripping the lane from ONE peer alone is a divergence', () => {
  const file = settingsPath();
  const l = live(file);
  const generated = generate({ settings: file, root: l.root }).declarations;
  const split = l.declarations.map((d) => (d.command.includes('ctxroute-reset.js')
    ? { ...d, command: d.command.replace(' --client', '') }
    : d));
  assert.notStrictEqual(blocks(split), blocks(generated),
    'The PreCompact reset lost its lane argument and the comparison still agreed. That is exactly the 2026-08-22 production defect — the gate would be green on two memories.');
});

// ── ⑦ SEEN RED: a frame that never leaves ────────────────────────────
test.skipIf(!wired)('SABOTAGE: one deleted frame declaration is a divergence', () => {
  const file = settingsPath();
  const l = live(file);
  const generated = generate({ settings: file, root: l.root }).declarations;
  const idx = l.declarations.findIndex((d) => d.command.includes('--frame 7 '));
  assert.ok(idx >= 0, 'No `--frame 7` declaration in the live wiring: this sabotage would delete nothing and prove nothing.');
  const amputated = l.declarations.filter((_, i) => i !== idx);
  assert.notStrictEqual(blocks(amputated), blocks(generated),
    'A missing frame declaration compared equal. That content would never leave the gesture, in silence.');
});

// ── ⑧ FAIL-CLOSED: an unreadable or invalid wiring is RED ────────────
test('an unreadable or invalid settings.json is RED, never a quiet pass', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-bad-'));
  try {
    const missing = path.join(dir, 'settings.json');
    expect(() => live(missing)).toThrow(/UNREADABLE/);

    const invalid = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalid, '{ "hooks": ');
    expect(() => live(invalid)).toThrow(/INVALID JSON/);

    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, '{}');
    expect(() => live(empty)).toThrow(/declares no `hooks` section/);

    // A wiring that names no reachable copy of this framework cannot be
    // compared to a manifest — and "nothing found" must never read as "agrees".
    const foreign = path.join(dir, 'foreign.json');
    fs.writeFileSync(foreign, JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node C:/nowhere/src/hooks/doc-inject.js' }] }] },
    }));
    expect(() => live(foreign)).toThrow(/framework root/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── ⑨ FAIL-CLOSED: an empty manifest is a NAMED REFUSAL, not an empty wiring ──
test('the generator REFUSES an empty manifest instead of generating an empty wiring', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-empty-'));
  const broken = path.join(dir, 'wiring.json');
  fs.writeFileSync(broken, JSON.stringify({ stateLane: 'client', consumers: [] }));
  try {
    let failed = null;
    try {
      generate({ settings: 'C:/fixture/settings.json', root: 'C:/fixture/ctxroute', manifest: posix(broken) });
    } catch (e) { failed = e; }
    assert.ok(failed, 'An empty manifest generated a wiring instead of being refused. An empty wiring compares equal to a machine where the framework was never wired.');
    assert.match(String(failed.stderr || failed.message), /consumers` is empty/,
      'The refusal does not NAME the cause. A diagnostic that fails without saying why sends the reader hunting in the wrong file.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
