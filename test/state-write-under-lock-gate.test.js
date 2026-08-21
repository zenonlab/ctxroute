// ═══════════════════════════════════════════════════════════════════════
// STATE WRITE UNDER LOCK — the queue invariant stops being carried by prose
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-20, audit of work item 58). `emission.md` states
//    "`emettre` IS CALLED UNDER LOCK" — and NOTHING checked it. The writer
//    (`emission-core.js`) does not take the lock itself: it is safe only because BOTH
//    of its callers happen to wrap it. That is an invariant held by the CALLER, the
//    exact shape this repo has already paid for twice (`keys` ㊿, the lockless
//    fallback). And `emission-core.js` is BY DESIGN the layer every future emitter
//    crosses ⇒ the third emitter writes the queue unlocked, in silence.
//
// 🔑 WHAT WORK ITEM 58 ACTUALLY MEASURED, and it settles the first question:
//    **the cross-process lock MUST exist.** Reading the critical section shows it is
//    not a per-doc counter (which would decompose into independent files and make the
//    lock pointless) but a LEADER ELECTION plus a memoized plan: among N parallel
//    frame processes, ONE decides and writes, the others read its plan back. That is
//    shared truth by construction. And it already uses the OS primitive (atomic
//    `mkdir`), so the "never reimplement what the OS provides" doctrine is satisfied.
//
// ⚠️ SCOPE = THE WRITES, never the reads. Reading has never needed the lock (sealed
//    elsewhere: putting `{}` back on the lockless path was a production bug).
// ⚠️ DERIVED, not a list: the rule matches the SHAPE of a write, so a writer added
//    tomorrow is covered the day it is written. The only exemption is declared below
//    and its truth is guaranteed BY THE SAME SCAN (see EXEMPTIONS).
// ⚠️ ANTI-INERT: a witness in the REAL form must be detected, and the same call INSIDE
//    a lock must NOT be — a gate that flags everything gets disarmed as fast as one
//    that flags nothing.
// ⚠️ `ast-grep` HONOURS `.gitignore` (3rd blindness measured 06/08/2026) ⇒ witnesses
//    are written into the OS tmpdir, never into the repository.
// 🛑 Call the binary DIRECTLY: `shell: true` is forbidden in every layer here, and
//    `npx` goes to the network from a tmpdir.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.join(import.meta.dirname, '..');

// 🛑 EXEMPTION = a writer whose lock is held by its CALLERS, with the reason.
//    Its truth is not taken on trust: the rule ALSO matches `.emit(`, the module's
//    only entry point, so a call site outside a lock turns this same gate RED.
const EXEMPTIONS = {
  'src/emission-core.js':
    'Queue writer. It is the layer EVERY emitter crosses, so it cannot take the lock '
    + 'itself without double-locking its callers, which already hold it around the '
    + 'read-then-rewrite of the queue. Guaranteed by the `.emit(` half of this rule.',
  // ⚠️ FLAGGED ON AN INDIRECTION, and that is the rule working as intended: the write
  //    hides behind `const saveState = (...) => store.saveState(...)`, so its safety
  //    can no longer be read at the call. Both real call sites ARE inside this file's
  //    own `withLock`. RELIC besides: unwired since 17/07/2026, kept only as the
  //    differential oracle — rewiring it would mean double injection, and the doctor
  //    screams. 🛑 NEVER use this entry as a precedent for LIVE code: an alias that
  //    hides a write is exactly what the gate exists to surface.
  'src/hooks/legacy-mcp-inject.js':
    'Unwired relic (differential oracle). The write is behind an alias; its two call '
    + 'sites both sit inside the withLock of that same file.',
  // ⚠️ SHARED CORE: the increment rule lives here so the spawned shell and the daemon
  //    cannot read one store-shape rule in two places and drift apart (paid twice —
  //    ㊱, ㊳). It therefore cannot take the lock itself without double-locking the
  //    shell, which already wraps this call.
  'src/turn-core.js':
    'The turn counter\'s read-modify-write, shared by two callers with OPPOSITE lock '
    + 'regimes: the spawned shell wraps it in its own withLock, and the daemon needs '
    + 'none (see the entry below). Taking the lock here would double-lock the first and '
    + 'be pure cost for the second.',
  // 🛑 A THIRD KIND OF REASON, AND IT IS NOT "THE CALLER HOLDS THE LOCK" — writing it
  //    that way would be a comfortable lie. The daemon writes with NO lock at all
  //    because there is NOTHING TO SERIALISE AGAINST: it is a single process, on a
  //    single-threaded loop, and the kernel hands it one connection at a time. That is
  //    the whole thesis of `kernel-state.md`, proven by TLC and by 16 real frame
  //    processes delivering one `once` exactly once with zero file written.
  // ⚠️ A cross-process lock here would protect nothing and cost everything — and
  //    `store` + `withLock` travelling together is precisely what makes "memory + file
  //    lock" impossible to build by accident.
  // 🔴 THIS ENTRY IS TRUE ONLY WHILE THE DAEMON OWNS ITS STATE ALONE. The day a second
  //    writer touches that memory — a second daemon, a thread, an async route that
  //    interleaves a read and a write — this line becomes FALSE and the exemption must
  //    go, not be widened. Every route is synchronous for that reason.
  'src/hooks/http-server.js':
    'The daemon: a single process on a single-threaded loop, served one connection at a '
    + 'time by the kernel. There is no concurrent writer to exclude, so there is no lock '
    + 'to take — the serialisation is given, above us, for free. TRUE ONLY while it owns '
    + 'its state alone and every route stays synchronous.',
};

const REGLE = `
id: state-write-outside-lock
language: javascript
severity: error
rule:
  any:
    - pattern: $O.saveState($$$A)
    - pattern: $O.emit($$$A)
  not:
    inside:
      pattern: withLock($$$W)
      stopBy: end
`;

const CONTROLE = `
id: any-state-write
language: javascript
severity: error
rule:
  pattern: $O.saveState($$$A)
`;

function binaire() {
  const nom = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep';
  const bin = path.join(REPO, 'node_modules', '@ast-grep', 'cli', nom);
  if (!fs.existsSync(bin)) throw new Error('ast-grep NOT FOUND (' + bin + ') — this gate cannot judge. `npm ci`.');
  return bin;
}

function scan(regle, cible) {
  // ⚠️ `ast-grep scan` EXITS NON-ZERO as soon as it matches an `error` rule — that is
  //    its contract, not a failure. Letting `execFileSync` throw would turn every
  //    FINDING into a crash, and the gate would report "tool broken" instead of the
  //    defect. We read stdout in both cases and let a truly malformed output fail at
  //    `JSON.parse`, loudly.
  let out;
  try {
    out = execFileSync(binaire(), ['scan', '--inline-rules', regle, cible, '--json=compact'], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    if (typeof e.stdout !== 'string') throw e;
    out = e.stdout;
  }
  return JSON.parse(out.trim() || '[]');
}

const rel = (f) => f.split(path.sep).join('/');

test('ANTI-VACUITY — the scan really reads the sources', () => {
  // 🛑 Without this floor, a broken path or a gitignored `src/` makes the gate green
  //    while measuring NOTHING — the repository's worst defect.
  const tous = scan(CONTROLE, 'src');
  assert.ok(tous.length >= 5,
    `only ${tous.length} state writes seen in src/ — the scan is broken, not the repository`);
});

test('ANTI-INERT — the rule sees a REAL unlocked write, and stays silent on a locked one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-lockgate-'));
  try {
    // Forms taken from the REAL code, never a textbook case.
    const nu = path.join(dir, 'nu.js');
    fs.writeFileSync(nu, 'function f(){ store.saveState(PREFIX, sessionId, r.state); }\n');
    assert.strictEqual(scan(REGLE, nu).length, 1,
      'the rule does not see an unlocked write — it would certify instead of protect');

    const sous = path.join(dir, 'sous.js');
    fs.writeFileSync(sous,
      'function f(){ withLock(dir, () => { store.saveState(PREFIX, sessionId, r.state); }); }\n');
    assert.deepStrictEqual(scan(REGLE, sous), [],
      'false positive on a write already under lock — a noisy gate gets disarmed, then bypassed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('58 — no state write escapes the cross-process lock', () => {
  const coupables = scan(REGLE, 'src')
    .map((h) => ({ f: rel(h.file), l: h.range.start.line + 1, t: h.lines.trim() }))
    .filter((h) => !(h.f in EXEMPTIONS));
  assert.deepStrictEqual(coupables, [],
    'STATE WRITTEN OUTSIDE `withLock` — two crossing processes lose part of the queue,\n'
    + 'and the loss is SILENT (the doc said this was true; only this gate makes it true).\n'
    + 'Wrap the write, or declare the file in EXEMPTIONS with the reason its callers hold the lock.\n'
    + coupables.map((h) => `  ${h.f}:${h.l} ${h.t}`).join('\n'));
});

test('58 INVERSE — an exemption that has become pointless is RED', () => {
  // 🛑 A stale exemption is a hole reopened in silence: it would excuse a FUTURE
  //    unlocked write in a file that no longer needs the excuse.
  const vus = new Set(scan(REGLE, 'src').map((h) => rel(h.file)));
  for (const f of Object.keys(EXEMPTIONS)) {
    assert.ok(vus.has(f),
      `\`${f}\` is exempted and writes NOTHING outside a lock any more — remove the entry.`);
  }
});
