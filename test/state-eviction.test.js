// state-eviction.test.js — THE DECISIVE CELL: what actually DISAPPEARS from a real state directory.
//
// 🛑 AN EVICTION IS PROVEN BY WHAT IT DELETES, NEVER BY "the function ran". A real fleet script
//    targeted `*.tar.gz` while the producer wrote `*.sql.gz`: 0 bytes removed since forever, disk at
//    87 %. A cleaner that matches nothing is indistinguishable from a cleaner that works — so this
//    cell asserts the EXACT set of survivors and the EXACT set of removals, both directions.
// ⚠️ SEEN RED TWICE, and both sabotages are the two failure modes of this class:
//      ① make the matcher select nothing (`classify` returning `null` for `plan-`) ⇒ `removed` is
//         empty while every survivor assertion still passes — the trap.
//      ② let it delete a durable key (drop the `kind !== 'durable'` age guard) ⇒ `doc-seen-ancient`
//         disappears, and the memory of every agent goes with it.
// ⚠️ THE OS TMPDIR, ALWAYS. Never the repo's `state/`, and never the LIVE install: this suite
//    DELETES files, and the live `state/` holds the running fleet's memory.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweep } from '../src/state-eviction.js';
import { DURABLE_PREFIXES, EPHEMERAL_PREFIX } from '../src/state-eviction-pure.js';

// ── THUNKS (never a const evaluated at module load) ───────────────────────────
const OLD_MS = () => 10 * 60 * 1000; // 10 min > the 5 min bound (30 s deadline × 10)
const makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-evict-'));
const write = (dir, name, ageMs) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '{}');
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(p, when, when);
};

test('THE SWEEP REMOVES EXACTLY THE DEAD EPHEMERA — and leaves every durable key and every stranger', () => {
  const dir = makeDir();
  // Dead: an ephemeral plan past the bound, and a leftover tmp of a writer that crashed.
  write(dir, 'plan-sess--inv-old.json', OLD_MS());
  write(dir, 'doc-seen-sess.json.913.ab.tmp', OLD_MS());
  // Alive: a plan of an action in flight, and a tmp a writer may still be filling.
  write(dir, 'plan-sess--inv-live.json', 0);
  write(dir, 'doc-seen-sess.json.914.cd.tmp', 0);
  // Durable, one per prefix — including one ANCIENT: an agent's death is not decidable from here.
  write(dir, 'doc-seen-ancient.json', 400 * 24 * 3600 * 1000);
  write(dir, 'ctxroute-seen-sess.json', OLD_MS());
  write(dir, 'turn-count-sess.json', OLD_MS());
  write(dir, 'remainder-sess.json', OLD_MS());
  // Strangers: never ours to delete, whatever their age.
  write(dir, 'canary.json', OLD_MS());
  write(dir, 'daemon-snapshot.json', OLD_MS());
  write(dir, 'notes.txt', OLD_MS());
  fs.mkdirSync(path.join(dir, '.lock-turn-sess')); // a live cross-process lock (a DIRECTORY)

  const r = sweep({ dir });

  expect(r.removed.sort()).toEqual(['doc-seen-sess.json.913.ab.tmp', 'plan-sess--inv-old.json']);
  expect(r.failed).toEqual([]);
  expect(r.unclassified).toEqual(['canary.json', 'daemon-snapshot.json']);
  expect(fs.readdirSync(dir).sort()).toEqual([
    '.lock-turn-sess',
    // 🛑 THE TWO UNCLASSIFIED FILES SURVIVE, AND THAT IS THE POINT OF FAIL-CLOSED.
    //    They are OLD enough to be swept if age alone decided, and they match no declared
    //    prefix — so the sweep REPORTS them and removes nothing. A name invented tomorrow
    //    leaks visibly instead of vanishing by surprise, and `unclassified` is the only
    //    thing in this repository that can SEE an undeclared state writer.
    'canary.json',
    'ctxroute-seen-sess.json',
    'daemon-snapshot.json',
    'doc-seen-ancient.json',
    'doc-seen-sess.json.914.cd.tmp',
    'notes.txt',
    'plan-sess--inv-live.json',
    'remainder-sess.json',
    'turn-count-sess.json',
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a missing state directory is silence, never a throw (a hook must not die of housekeeping)', () => {
  const r = sweep({ dir: path.join(os.tmpdir(), 'ctxroute-evict-does-not-exist-4f2a') });
  expect(r.removed).toEqual([]);
});

test('THE CLASS LIST IS CONFRONTED WITH THE RESET, never copied and left to rot', () => {
  // 🛑 `ctxroute-reset.js` sweeps the SAME five prefixes on a compaction order. Two hand-written
  //    enumerations of one truth diverge in silence: the day a sixth store is added, the reset
  //    empties it and the eviction lets it grow for ever. This cell reads the reset's own literal.
  const src = fs.readFileSync(new URL('../src/hooks/ctxroute-reset.js', import.meta.url), 'utf8');
  const m = /for \(const prefix of \[([^\]]+)\]\)/.exec(src);
  expect(m).not.toBe(null);
  const declared = [];
  for (const raw of m[1].split(',')) declared.push(raw.trim().replace(/^'|'$/g, ''));
  expect(declared.sort()).toEqual([...DURABLE_PREFIXES, EPHEMERAL_PREFIX].sort());
});
