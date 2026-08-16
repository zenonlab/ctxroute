// ═══════════════════════════════════════════════════════════════════════
// session-store.js — THE WRITE MUST BE ATOMIC (07/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// 🔴 REAL, MEASURED DEFECT: `fs.writeFileSync` TRUNCATES the file before
//    filling it. A concurrent reader therefore sees an EMPTY or PARTIAL file,
//    `JSON.parse` throws, `loadState` returns `{}` — that is to say the ASSERTION
//    "no doc has ever been injected". Measurement on the REAL state of the corpus
//    (209 bytes, measured median 63): **9,596 phantom reads out of 24,147**.
//
// ⚠️ WHY IT MATTERS SINCE 07/08/2026: the lock-less fallback of
//    `pretool-core.js` now READS the state (it used to guess it). This read
//    is lock-FREE by construction — that is the whole point of the fallback. Without an
//    atomic write, it falls back into the same phantom chunk it
//    fixes. The two fixes are INSEPARABLE: one without the other does not hold.
//
// 🛑 THE FIX IS NOT "read under the lock": a reader that requires the
//    lock is no longer a fallback. It is the WRITER that must make the state
//    uninterruptible (tmp + rename, `rename` being atomic on POSIX as well as
//    on Windows). Same pattern as `canary-check.js`, which already did it.
// ⚠️ NEVER go back to a direct `writeFileSync` on the destination
//    file, even "because it is simpler": simplicity is paid for
//    here in silent re-injections, invisible to all the other tests.
import { test, afterAll } from 'vitest';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'store-atomique-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// EXTERNAL probe: parent = reader, child = writer. Two real PROCESSES —
// an in-process test would prove nothing (no concurrency of disk writes).
const SONDE = path.join(TMP, 'sonde.cjs');
fs.writeFileSync(SONDE, `
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const DIR = process.argv[2];
process.env.CTXROUTE_STATE_DIR = DIR;
const store = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'session-store.js').replace(/\\/g, '/'))});
// REALISTIC-sized state (measured on the corpus: median 63 B, max 268 B).
const etat = {};
for (let i = 0; i < 4; i++) etat['docs/fichier-' + i + '.md'] = { seen: true, sinceLastCall: i };
const ECRIVAIN = path.join(DIR, 'ecrivain.cjs');
fs.writeFileSync(ECRIVAIN, [
  "process.env.CTXROUTE_STATE_DIR = " + JSON.stringify(DIR) + ";",
  "const store = require(" + JSON.stringify(path.join(${JSON.stringify(__dirname.replace(/\\/g, '/'))}, '..', 'src', 'session-store.js').replace(/\\\\/g, '/')) + ");",
  "const etat = " + JSON.stringify(etat) + ";",
  "const fin = Date.now() + 1500;",
  "while (Date.now() < fin) store.saveState('doc-seen-', 'course', etat);",
  // CLEAN completion witness: it is what distinguishes "the writer finished"
  // from "the writer was killed" — only the first case can promise 0 .tmp.
  // ⚠️ INLINE path: the writer script does NOT require the path module —
  //    calling it there threw a ReferenceError, the witness was never written,
  //    and the wait ran out its full 10 s (green, but 12 s instead of 2).
  "require('fs').writeFileSync(" + JSON.stringify(path.join(DIR, 'fini.flag')) + ", 'ok');",
].join('\\n'));
const enfant = spawn(process.execPath, [ECRIVAIN], { stdio: 'ignore' });
// 🛑 WAIT FOR THE FIRST STATE BEFORE COUNTING — without this we count the spawn
//    latency of the writer as phantom reads. MEASURED: 756 ENOENT
//    of pure startup, which made a PERFECT fix TURN RED
//    (23,131/23,131 healthy reads once the window is excluded).
//    An ABSENT file returns {} and that {} is TRUE — it is not the targeted defect.
const DEST = path.join(DIR, 'doc-seen-course.json');
const limite = Date.now() + 10000;
while (!fs.existsSync(DEST) && Date.now() < limite) { /* waiting for the 1st state */ }
if (!fs.existsSync(DEST)) { console.log(JSON.stringify({ lectures: 0, vides: 0, restes: 0 })); process.exit(0); }
let lectures = 0, vides = 0;
const fin = Date.now() + 1500;
while (Date.now() < fin) {
  const s = store.loadState('doc-seen-', 'course');
  lectures++;
  if (Object.keys(s).length === 0) vides++;
}
// 🛑 NEVER KILL THE WRITER BEFORE COUNTING THE .tmp — RED CI on macOS
//    on 08/08/2026. A process KILLED between the \`writeFileSync(tmp)\` and the
//    \`rename\` necessarily leaves its temporary behind: no program can
//    survive that, so the assertion demanded the impossible. The REAL invariant is
//    "a writer that terminates NORMALLY leaves nothing behind".
//    (A tmp from a killed process is not eternal garbage: it carries the store's
//    prefix, so \`ctxroute-reset.js\` sweeps it at the next compaction.)
// ⚠️ Wait by WITNESS FILE, not by event: the reading loop is
//    a synchronous busy-wait, it would block the reception of an \`exit\`.
const FINI = path.join(DIR, 'fini.flag');
// ⚠️ A SLEEPING WAIT (Atomics.wait, the same primitive as lock.js) rather than a
//    tight loop: on a 2-core CI runner, burning a core while waiting
//    slows down the very writer we are waiting for. Zero cost, real benefit.
// 🛑 I FIRST BLAMED THIS LOOP FOR A 12 s SLOWDOWN — IT WAS
//    FALSE. The real cause: the writer script did not have the path module,
//    so the witness was NEVER written and the wait ran out its full
//    10 s. The test was GREEN while measuring the wrong phenomenon. Switching to
//    Atomics.wait remains good, but it fixed nothing — do not take this
//    comment at face value: the observed duration is ~2 s.
const dors = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* restricted env */ } };
const limiteFin = Date.now() + 10000;
while (!fs.existsSync(FINI) && Date.now() < limiteFin) dors(20);
enfant.kill(); // safety net only: normally already finished
const restes = fs.readdirSync(DIR).filter((f) => f.endsWith('.tmp'));
console.log(JSON.stringify({ lectures, vides, restes: restes.length }));
`);

function courir() {
  const dir = fs.mkdtempSync(path.join(TMP, 'run-'));
  const r = spawnSync(process.execPath, [SONDE, dir.replace(/\\/g, '/')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'probe failed: ' + r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('ATOMICITY: a lock-less reader NEVER sees an empty state during a write', { timeout: 30000 }, () => {
  const r = courir();
  // ⚠️ ANTI-MUTE-PROBE WITNESS: without any read, "0 empty" would be a false green.
  //    That is the trap that cost 5 false probes on this repo.
  assert.ok(r.lectures > 100, `mute probe: only ${r.lectures} reads`);
  assert.strictEqual(r.vides, 0,
    `${r.vides} read(s) out of ${r.lectures} returned {} while the state EXISTS — `
    + 'NON-atomic write: the reader sees a truncated file. '
    + 'Measured BEFORE the fix: 9,596 / 24,147.');
});

test('ATOMICITY: no temporary file survives the writes', { timeout: 30000 }, () => {
  // An abandoned tmp would pile up in state/ without anyone seeing it.
  assert.strictEqual(courir().restes, 0, 'abandoned .tmp file(s) in state/');
});

// COUNTER-PROOF — without it, a `loadState` that ALWAYS returned a non-empty
// object (bug) would pass the test above. The fail-open must stay intact.
test('FAIL-OPEN INTACT: an ABSENT state does return {} (and that {} is TRUE)', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'vide-'));
  const r = spawnSync(process.execPath, ['-e', `
    process.env.CTXROUTE_STATE_DIR = ${JSON.stringify(dir.replace(/\\/g, '/'))};
    const s = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'session-store.js').replace(/\\/g, '/'))});
    console.log(JSON.stringify(s.loadState('doc-seen-', 'jamais-vu')));
  `], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim()), {});
});

// COUNTER-PROOF — atomicity must not be paid for in LOST WRITES.
// `rename` can fail (Windows lock); if the catch swallowed it, the state would
// never be saved and the `once` cadence would no longer hold.
test('NO LOST WRITE: after saving, the state is read back identically', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'ecrit-'));
  const r = spawnSync(process.execPath, ['-e', `
    process.env.CTXROUTE_STATE_DIR = ${JSON.stringify(dir.replace(/\\/g, '/'))};
    const s = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'session-store.js').replace(/\\/g, '/'))});
    const etat = { 'docs/a.md': { seen: true, sinceLastCall: 3 } };
    for (let i = 0; i < 50; i++) s.saveState('doc-seen-', 'boucle', etat);
    console.log(JSON.stringify(s.loadState('doc-seen-', 'boucle')));
  `], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim()), { 'docs/a.md': { seen: true, sinceLastCall: 3 } });
});
