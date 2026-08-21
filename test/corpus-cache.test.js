// ═══════════════════════════════════════════════════════════════════════
// THE ONE PROPERTY THAT MAKES A RESIDENT CORPUS SAFE.
// ═══════════════════════════════════════════════════════════════════════
// 🛑 A cache is not judged on being fast — it is judged on never serving
//    yesterday's knowledge. A daemon that answers with a document the operator
//    fixed an hour ago is the GREEN THAT LIES this repository fears most, and it
//    would look perfectly healthy from every side.
// ⚠️ THE KERNEL EVENT IS INJECTED, NEVER AWAITED. Driving a real `fs.watch` here
//    would mean waiting for the OS to deliver — i.e. a delay, on a machine, about
//    a file this very process just wrote: neither `distant` nor `undecidable`, so
//    the budget admits no motive for it. The engine keeps the real `fs.watch`; the
//    test keeps the DECISION and fires the callback itself. Racing to prove a race
//    is how a suite becomes flaky in turn.
// ⚠️ ANTI-VACUITY IN EVERY CELL: each one asserts that at least one directory was
//    actually watched. A cache that armed nothing would pass an "it refreshes"
//    check by never caching at all.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCorpus, enableCache, disableCache, cacheSize } from '../src/corpus.js';

/** A corpus root with one document, plus one nested directory. */
function corpusRoot(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-corpus-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'a.md'), text, 'utf8');
  return dir;
}

/** Records the watched directories and hands back the callbacks to fire. */
function recordingWatch() {
  const dirs = [];
  const fired = [];
  return {
    dirs,
    watch(dir, cb) {
      dirs.push(dir);
      fired.push(cb);
      return { close() { /* nothing held */ } };
    },
    // ⚠️ One event is enough by contract: ANY event on ANY watched directory of a
    //    root drops that root entirely. We fire the first, never all of them, so
    //    the cell would still redden if only the last watcher were wired.
    fireFirst() { fired[0](); },
  };
}

afterEach(() => disableCache());

describe('corpus cache', () => {
  // ① THE DECISIVE CELL. A document edited on disk is served in its NEW version on
  //    the very next request, with no restart — and until the kernel says so, the
  //    snapshot is genuinely held (otherwise there is no cache to speak of).
  //    🔴 SABOTAGE THAT MUST REDDEN IT: make the watch callback of `corpus-cache.js`
  //    stop calling `drop(key)` (or arm no watcher at all). The third read then
  //    returns 'v1' and the daemon has started serving yesterday's knowledge.
  it('serves the NEW version on the next request once the kernel says the corpus moved', () => {
    const dir = corpusRoot('v1');
    const w = recordingWatch();
    enableCache(w.watch);

    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(w.dirs.length).toBeGreaterThan(0);   // anti-vacuity: something IS watched
    expect(cacheSize()).toBe(1);

    fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'v2', 'utf8');
    // Held: no event yet, so the daemon is entitled to its snapshot.
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');

    w.fireFirst();
    expect(cacheSize()).toBe(0);
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v2');
  });

  // ② FAIL-OPEN: a root whose watch cannot be established is NEVER cached. One
  //    blind directory costs performance; a stale corpus costs correctness.
  it('degrades to re-reading when the watch cannot be established', () => {
    const dir = corpusRoot('v1');
    enableCache(() => { throw new Error('no watch here'); });

    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(cacheSize()).toBe(0);                // nothing kept — the whole point
    fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'v2', 'utf8');
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v2');
  });

  // ③ THE CEILING IS REAL, and reaching it degrades instead of evicting a neighbour.
  it('stops caching past its ceiling and keeps answering correctly', () => {
    const first = corpusRoot('one');
    const second = corpusRoot('two');
    const w = recordingWatch();
    enableCache(w.watch, 1);

    expect(readCorpus(first, 'docs/')[0].text).toBe('one');
    expect(readCorpus(second, 'docs/')[0].text).toBe('two');
    expect(cacheSize()).toBe(1);                // the ceiling held

    // The uncached root still tells the truth: read-through, never a stale answer.
    fs.writeFileSync(path.join(second, 'sub', 'a.md'), 'two-bis', 'utf8');
    expect(readCorpus(second, 'docs/')[0].text).toBe('two-bis');
  });

  // ④ OFF BY DEFAULT — the parity guarantee the differentials rest on.
  it('holds nothing until a long-lived process asks for it', () => {
    const dir = corpusRoot('v1');
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(cacheSize()).toBe(0);
    fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'v2', 'utf8');
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v2');
  });
});
