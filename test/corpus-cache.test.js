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
import { createRequire } from 'node:module';
import { ADAPTERS } from '../src/source-adapters.js';
// 🛑 THIS IMPORT IS THE MODULE-GRAPH EDGE, AND REMOVING IT MAKES THE MUTATION OF
//    `corpus-cache.js` IMPOSSIBLE — MEASURED 2026-08-21. The only road this suite takes
//    to the module is `createRequire('../src/corpus')` → `require('./corpus-cache')`, and
//    a CJS `require` edge is INVISIBLE to vitest's module graph. Stryker's vitest runner
//    resolves the covering suites through that graph (`vitest.related`), so it answered
//    *"failed to find test files related to mutated files"*, ran NO test, and aborted the
//    whole run — a module in `mutate` measured by nothing, which is exactly the
//    "misleading massacre" the Stryker config header warns about.
// ⚠️ It is NOT a second source of truth: everything the cells OBSERVE still comes from
//    the CJS instance production uses (see the block below). This face is read for the
//    CONSTANTS only — literals, identical in both instances.
import { MAX_ROOTS, MAX_FILES, MAX_FILE_CHARS } from '../src/corpus-cache.js';

// 🔴 THE CACHE IS READ THROUGH `createRequire`, AND THIS IS NOT A STYLE CHOICE —
//    IT IS THE ONLY WAY THIS SUITE CAN SEE WHAT PRODUCTION SEES. MEASURED
//    2026-08-21: under vitest, an ESM `import '../src/corpus.js'` and the
//    `require('./corpus')` that `source-adapters.js` performs yield **TWO
//    DIFFERENT MODULE INSTANCES**. The suite armed a cache on its own copy while
//    the adapter used another, so `cachedFiles()` answered 0 for ever and the
//    cell read as "the cache does not cache" while production was fine (there,
//    both faces are CJS: `http-server.js` requires the same instance the adapter
//    does).
// 🛑 A GREEN — OR A RED — ON A TWIN IS NOT A VERDICT ON THE THING. The honest fix
//    is to observe the OBJECT PRODUCTION USES, never to weaken the assertion
//    until it agrees: a cell that stops counting held entries would let a cache
//    that caches nothing ship, which is exactly the vacuity this file guards.
const require_ = createRequire(import.meta.url);
const { readCorpus, enableCache, disableCache, cacheSize, cachedFiles, cachedWatchers } = require_('../src/corpus');

/** A corpus root with one document, plus one nested directory. */
function corpusRoot(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-corpus-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'a.md'), text, 'utf8');
  return dir;
}

/**
 * Records the watched directories and hands back the callbacks to fire.
 * ⚠️ IT ALSO COUNTS `close()`, because releasing a kernel watcher is an ACT nothing
 *    else observes: a cache that armed the watchers and never released them leaks a
 *    bounded OS resource for as long as the daemon lives, and every assertion about
 *    freshness stays green while it does.
 */
function recordingWatch() {
  const dirs = [];
  const fired = [];
  let closed = 0;
  return {
    dirs,
    watch(dir, cb) {
      dirs.push(dir);
      fired.push(cb);
      return { close() { closed += 1; } };
    },
    // ⚠️ One event is enough by contract: ANY event on ANY watched directory of a
    //    root drops that root entirely. We fire the first, never all of them, so
    //    the cell would still redden if only the last watcher were wired.
    fireFirst() { fired[0](); },
    closed() { return closed; },
  };
}

/**
 * A harness SKILLS folder holding one skill body, plus the road that reads it.
 * 🛑 WE GO THROUGH THE REAL ADAPTER, NEVER THROUGH `readDoc` DIRECTLY. This repo has
 *    already paid for the opposite: `keys` was proven on rules built by hand and was
 *    INERT on every real road. `source-adapters.js` is the ONLY caller that reads a
 *    skill body, so a cell that bypasses it would keep passing the day someone puts
 *    a private `fs.readFileSync` back in.
 */
function skillsRoot(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-skills-'));
  fs.writeFileSync(path.join(dir, 'demo.md'), body, 'utf8');
  return dir;
}

const SKILL_CONFIG = { skills: { demo: { match: ['widget-project'] } } };
const SKILL_PAYLOAD = { toolName: 'Read', toolInput: { file_path: '/home/dev/widget-project/a.js' } };

/**
 * TWO skills in one harness folder, plus the two gestures that reach one each.
 * ⚠️ A ceiling on the NUMBER of resident files, and the "give the allowance back"
 *    arithmetic of the character ceiling, are both INEXPRESSIBLE with a single
 *    body: one file can never prove that holding it stops the NEXT one.
 */
function skillsRootPair(demoBody, otherBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-skills-'));
  fs.writeFileSync(path.join(dir, 'demo.md'), demoBody, 'utf8');
  fs.writeFileSync(path.join(dir, 'other.md'), otherBody, 'utf8');
  return dir;
}

const PAIR_CONFIG = {
  skills: { demo: { match: ['widget-project'] }, other: { match: ['gadget-project'] } },
};
const OTHER_PAYLOAD = { toolName: 'Read', toolInput: { file_path: '/home/dev/gadget-project/b.js' } };

/** Runs the skill adapter exactly as the gateway does, and returns the body it produced. */
function collectBody(config, payload, docId) {
  const adapter = ADAPTERS.find((a) => a.id === 'skill');
  const acc = { matched: [], decls: {}, bodies: {}, labels: {}, owner: {}, meta: {} };
  adapter.collect(config, payload, acc);
  return acc.bodies[docId];
}

/** The single-skill road, used by every cell that needs only one body. */
function collectSkillBody() {
  return collectBody(SKILL_CONFIG, SKILL_PAYLOAD, 'skill/demo');
}

/** The two-skill road. `demo` and `other` are read by two DIFFERENT gestures. */
function collectDemo() {
  return collectBody(PAIR_CONFIG, SKILL_PAYLOAD, 'skill/demo');
}
function collectOther() {
  return collectBody(PAIR_CONFIG, OTHER_PAYLOAD, 'skill/other');
}

afterEach(() => {
  disableCache();
  delete process.env.CTXROUTE_SKILLS_DIR;
});

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
    // ANTI-VACUITY, and the set is asserted EXACTLY: "at least one" would stay green
    // on a cache that watched a directory nobody walked (a watcher armed on a name
    // the walk never produced protects nothing and holds an OS handle for ever).
    expect(w.dirs).toEqual([dir, path.join(dir, 'sub')]);
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

  // ⑤ THE DECISIVE CELL FOR THE SKILL BODIES — the same property, on the corpus's
  //    biggest documents (90–120 KB each) and on a HARNESS folder the operator edits
  //    by hand. A skill fixed a minute ago must be the one that goes out on the very
  //    next action; serving the previous body would make the agent act on stale
  //    PROJECT knowledge with nothing at all to see.
  //    🔴 THE TWO SABOTAGES, AND THEY REDDEN OPPOSITE HALVES — that is what makes
  //    the cell non-vacuous:
  //       ① put a private `fs.readFileSync` back in `skillAdapter` ⇒ nothing is ever
  //          resident: `cachedFiles()` is 0 and the HELD read answers 'BODY-V2'
  //          straight away. The cache half dies.
  //       ② make the file entry's watch callback stop calling `drop` (or arm no
  //          watcher at all) ⇒ the LAST read still answers 'BODY-V1' and the daemon
  //          has started serving yesterday's skill. The freshness half dies.
  //       ③ watch the FILE instead of its directory ⇒ `w.dirs` stops holding the
  //          skills folder — the rename-deafness guard.
  it('serves a skill body from memory, and the NEW body as soon as the kernel says the folder moved', () => {
    const dir = skillsRoot('BODY-V1');
    process.env.CTXROUTE_SKILLS_DIR = dir;
    const w = recordingWatch();
    enableCache(w.watch);

    expect(collectSkillBody()).toBe('BODY-V1');
    // ANTI-VACUITY — without these two, "it is always fresh" passes trivially on a
    // cache that never caches anything at all.
    expect(cachedFiles()).toBe(1);
    expect(w.dirs).toEqual([dir]);                 // the DIRECTORY, never the file
    expect(w.dirs.some((d) => d.endsWith('.md'))).toBe(false);

    // HELD: the disk has moved, the kernel has not spoken, so the resident body is
    // the right answer — this is what proves the second read touched no disk.
    fs.writeFileSync(path.join(dir, 'demo.md'), 'BODY-V2', 'utf8');
    expect(collectSkillBody()).toBe('BODY-V1');

    w.fireFirst();
    expect(cachedFiles()).toBe(0);
    expect(collectSkillBody()).toBe('BODY-V2');    // no restart, no TTL, no mtime
  });

  // ⑥ FAIL-OPEN AND CEILING, for the file kind — same law as the roots, and the
  //    ceiling is what keeps ~45 skills × 120 KB from becoming a dated outage.
  it('never holds a skill body it cannot be told about, nor one past its ceiling', () => {
    const dir = skillsRoot('BODY-V1');
    process.env.CTXROUTE_SKILLS_DIR = dir;

    enableCache(() => { throw new Error('no watch here'); });
    expect(collectSkillBody()).toBe('BODY-V1');
    expect(cachedFiles()).toBe(0);                 // nothing kept — the whole point
    fs.writeFileSync(path.join(dir, 'demo.md'), 'BODY-V2', 'utf8');
    expect(collectSkillBody()).toBe('BODY-V2');    // read-through, never stale

    // The character bound refuses this body outright: we read through, we do not
    // evict, and the answer stays correct.
    const w = recordingWatch();
    enableCache(w.watch, undefined, undefined, 1);
    expect(collectSkillBody()).toBe('BODY-V2');
    expect(cachedFiles()).toBe(0);
  });

  // ④ OFF BY DEFAULT — the parity guarantee the differentials rest on.
  it('holds nothing until a long-lived process asks for it', () => {
    const dir = corpusRoot('v1');
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(cacheSize()).toBe(0);
    expect(cachedFiles()).toBe(0);
    expect(cachedWatchers()).toBe(0);   // nothing resident ⇒ no kernel handle held
    fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'v2', 'utf8');
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v2');
  });

  // ⑧ THE CEILINGS ARE A CONTRACT, NOT A DETAIL — they are what keeps ~45 skills of
  //    90–120 KB from turning residency into a dated outage, and the arithmetic behind
  //    them lives in `corpus-cache.md`. 🛑 THE EXPECTED VALUES ARE WRITTEN OUT HERE, NEVER
  //    READ FROM THE MODULE: `toBe(MODULE.CONSTANT)` proves `x === x` and every mutant of
  //    the constant survives it (43 measured elsewhere in this repo the same day).
  it('bounds residency by DECLARED ceilings — 8 roots, 16 files, 4,194,304 characters', () => {
    expect(MAX_ROOTS).toBe(8);
    expect(MAX_FILES).toBe(16);
    expect(MAX_FILE_CHARS).toBe(4194304);
  });

  // ⑨ THE TWO KEY SHAPES, AND WHY A COLLISION HERE IS NOT A PERFORMANCE BUG BUT A
  //    CORRECTNESS ONE: one map holds both kinds, so a file key reachable from
  //    `rootKey` would serve a 120 KB skill body where a corpus array is expected.
  //    🔴 THE SEPARATOR IS INVISIBLE IN EVERY EDITOR AND EVERY DIFF — that is why
  //    it is built with `String.fromCharCode(0)` on BOTH sides here too, never
  //    typed inside a quoted literal.
  it('keys a resident FILE under TWO NULs, a string no root key can produce', () => {
    // 🛑 THIS CELL GOES STRAIGHT TO THE MODULE, and it is the only road that exists:
    //    the key builders are pure and no caller exposes their result. It still
    //    crosses `createRequire`, so the code exercised is the CJS instance
    //    production runs — never the ESM face imported at the top of this file.
    const { rootKey, fileKey } = require_('../src/corpus-cache');
    const NUL = String.fromCharCode(0);

    expect(rootKey('/docs', 'docs/')).toBe('/docs' + NUL + 'docs/');
    expect(fileKey('/skills/demo.md')).toBe(NUL + NUL + '/skills/demo.md');
    // The invariant itself, not just the two shapes: ONE nul on one side, TWO on the
    // other, so the file space is unreachable from the root space whatever a caller
    // passes — a path and a prefix cannot contain a NUL.
    expect(rootKey('/docs', 'docs/').includes(NUL + NUL)).toBe(false);
    expect(fileKey('/skills/demo.md').startsWith(NUL + NUL)).toBe(true);
  });

  // ⑩ A WATCHER IS A KERNEL HANDLE AND IT MUST BE GIVEN BACK — on the event AND on
  //    the shutdown. Nothing else in this file observes that: a cache that never
  //    closed anything would pass every freshness cell above while leaking one OS
  //    handle per walked directory, for as long as the daemon lives (weeks).
  //    🔴 SABOTAGE THAT MUST REDDEN IT: empty `closeEntry`, or make `invalidateAll`
  //    iterate nothing.
  it('gives every kernel watcher back — on the event, and on the shutdown', () => {
    const dir = corpusRoot('v1');
    const w = recordingWatch();
    enableCache(w.watch);

    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(cachedWatchers()).toBe(2);            // ONE per walked directory, no more
    expect(w.closed()).toBe(0);

    w.fireFirst();
    // BOTH are released, never only the one that fired: the entry is gone, so a
    // watcher still armed on it could never drop anything again.
    expect(w.closed()).toBe(2);
    expect(cachedWatchers()).toBe(0);

    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');   // re-read ⇒ re-armed
    expect(cachedWatchers()).toBe(2);
    disableCache();
    expect(w.closed()).toBe(4);                  // the shutdown path releases the rest
  });

  // ⑪ THE KERNEL DOES NOT WAIT FOR US: a second event on a root already dropped is
  //    the normal working day of a `git checkout` (several writes, one drop). The
  //    guard that makes `drop` idempotent is what keeps that from throwing INSIDE a
  //    watch callback — where nothing would catch it and the daemon would die of
  //    housekeeping.
  it('takes a SECOND event on a root it has already dropped, without throwing', () => {
    const dir = corpusRoot('v1');
    const w = recordingWatch();
    enableCache(w.watch);

    expect(readCorpus(dir, 'docs/')[0].text).toBe('v1');
    expect(cacheSize()).toBe(1);
    fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'v2', 'utf8');

    w.fireFirst();
    w.fireFirst();                               // the entry is already gone
    expect(cacheSize()).toBe(0);
    expect(readCorpus(dir, 'docs/')[0].text).toBe('v2');
  });

  // ⑫ A CEILING IS A POSITIVE NUMBER OR IT IS ABSENT. Zero is an ABSENCE — it means
  //    "the caller said nothing", never "hold nothing": read the other way round, a
  //    single miscomputed argument would silently turn the whole residency off and
  //    the daemon would look healthy while paying 41 ms on every request.
  it('treats a non-positive ceiling as ABSENT and falls back to the declared default', () => {
    const cdir = corpusRoot('v1');
    const sdir = skillsRoot('BODY-V1');
    process.env.CTXROUTE_SKILLS_DIR = sdir;

    const w1 = recordingWatch();
    enableCache(w1.watch, 0);
    expect(readCorpus(cdir, 'docs/')[0].text).toBe('v1');
    expect(cacheSize()).toBe(1);                 // MAX_ROOTS applied, not 0

    const w2 = recordingWatch();
    enableCache(w2.watch, undefined, 0);
    expect(collectSkillBody()).toBe('BODY-V1');
    expect(cachedFiles()).toBe(1);               // MAX_FILES applied, not 0

    const w3 = recordingWatch();
    enableCache(w3.watch, undefined, undefined, 0);
    expect(collectSkillBody()).toBe('BODY-V1');
    expect(cachedFiles()).toBe(1);               // MAX_FILE_CHARS applied, not 0
  });

  // ⑬ THE COUNT CEILING BITES ON THE SECOND FILE, and reaching it degrades instead
  //    of evicting a neighbour — the LRU thrashing the header refuses, which would
  //    read as "the cache does nothing" with nothing at all to see.
  it('stops holding skill bodies past its COUNT ceiling, and evicts no neighbour', () => {
    const dir = skillsRootPair('BODY-A', 'BODY-B');
    process.env.CTXROUTE_SKILLS_DIR = dir;
    const w = recordingWatch();
    enableCache(w.watch, undefined, 1);

    expect(collectDemo()).toBe('BODY-A');
    expect(cachedFiles()).toBe(1);
    expect(collectOther()).toBe('BODY-B');       // read-through, and still correct
    expect(cachedFiles()).toBe(1);               // the ceiling held

    // The surplus tells the truth on every request; the resident one stays resident.
    fs.writeFileSync(path.join(dir, 'other.md'), 'BODY-B2', 'utf8');
    expect(collectOther()).toBe('BODY-B2');
    fs.writeFileSync(path.join(dir, 'demo.md'), 'BODY-A2', 'utf8');
    expect(collectDemo()).toBe('BODY-A');        // held: no event, no eviction
  });

  // ⑭ THE CHARACTER LEDGER IS AN ARITHMETIC, AND IT IS THE HALF A COUNT CANNOT
  //    PROVE: what one resident body SPENDS is what stops the next one from being
  //    held. Bodies of 6 characters each against a bound of 8 — the second one
  //    cannot fit, and the first must be the reason.
  it('spends the character allowance on what it holds — the second body no longer fits', () => {
    const dir = skillsRootPair('BODY-A', 'BODY-B');
    process.env.CTXROUTE_SKILLS_DIR = dir;
    const w = recordingWatch();
    enableCache(w.watch, undefined, undefined, 8);

    expect(collectDemo()).toBe('BODY-A');
    expect(cachedFiles()).toBe(1);
    expect(collectOther()).toBe('BODY-B');       // 6 + 6 > 8 ⇒ read-through
    expect(cachedFiles()).toBe(1);

    fs.writeFileSync(path.join(dir, 'other.md'), 'BODY-B2', 'utf8');
    expect(collectOther()).toBe('BODY-B2');      // never stale, only unheld
  });

  // ⑮ AND THE ALLOWANCE COMES BACK WHEN THE ENTRY GOES. A drop that forgot to
  //    credit the ledger would let a daemon that has served for weeks refuse to hold
  //    anything at all — residency dying by arithmetic, silently, with a cache that
  //    still answers correctly and 41 ms per request back on the bill.
  //    ⚠️ The bound is set to the EXACT length of the body, which also pins the
  //    boundary itself: a body that fits exactly IS held.
  it('gives the character allowance back when the kernel drops the entry', () => {
    const dir = skillsRoot('BODY-V1');           // 7 characters
    process.env.CTXROUTE_SKILLS_DIR = dir;
    const w = recordingWatch();
    enableCache(w.watch, undefined, undefined, 7);

    expect(collectSkillBody()).toBe('BODY-V1');
    expect(cachedFiles()).toBe(1);               // an exact fit is admitted

    w.fireFirst();
    expect(cachedFiles()).toBe(0);

    fs.writeFileSync(path.join(dir, 'demo.md'), 'BODY-V2', 'utf8');
    expect(collectSkillBody()).toBe('BODY-V2');
    expect(cachedFiles()).toBe(1);               // the 7 characters were credited back
  });

  // ⑯ THE LOAD-TIME CONTRACT. Everything a CommonJS module does when it is REQUIRED
  //    — here its `module.exports` — runs before any test callback, so no test
  //    covers it and every mutant of it survives by construction (measured
  //    2026-08-21). Dropping the cached copy first is what puts that load INSIDE
  //    this cell; nothing else in this file can.
  //    ⚠️ The fresh copy is inspected, never DRIVEN: `corpus.js` keeps the instance
  //    it captured, and two live caches over one corpus is exactly the split brain
  //    this repository refuses.
  it('exports the surface its consumers require — proven on a load INSIDE the cell', () => {
    const spec = '../src/corpus-cache';
    delete require_.cache[require_.resolve(spec)];
    const mod = require_(spec);

    expect(typeof mod.createCorpusCache).toBe('function');
    expect(typeof mod.rootKey).toBe('function');
    expect(typeof mod.fileKey).toBe('function');
  });
});
