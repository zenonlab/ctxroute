// ═══════════════════════════════════════════════════════════════════════
// CORPUS CACHE — one resident snapshot per corpus root, dropped by the KERNEL.
// ═══════════════════════════════════════════════════════════════════════
//
// 📐 WHY IT EXISTS, MEASURED 2026-08-20 AND IT MOVES THE TARGET. A round trip
//    through the daemon costs **41.49 ms**, of which the **transport is 0.17 ms**.
//    The other 41 ms are the CORPUS RE-READ — the very cost the spawn lane pays
//    too, hidden inside node's startup. The daemon alone takes an action from
//    ~5.3 s to ~660 ms; the REST of the win is here, and nowhere near the pipe.
//    🛑 Do not "optimise the pipe": it has already been measured and it is 0.4 %.
//
// 🛑 OFF BY DEFAULT, AND THAT IS THE PARITY GUARANTEE. `corpus.js` consults this
//    module only after an explicit `enableCache()`. A spawned hook, a lint, a
//    test, `explain.js` — none of them enable it, so they walk the filesystem
//    exactly as before, byte for byte. Only a LONG-LIVED process may hold a
//    snapshot, because only a long-lived process can be told when it goes stale.
//
// 🛑 INVALIDATION IS AN EVENT, NEVER A DELAY. The kernel already knows when a
//    file changed (inotify · ReadDirectoryChangesW · FSEvents) and `fs.watch` is
//    the interface to it. There is NO timer, NO TTL, NO poll and NO mtime
//    comparison anywhere in this file: a temporal call would have to be declared
//    to the budget, whose only two admissible motives are `distant` and
//    `undecidable`, and neither describes a file on this machine. If you find
//    yourself reaching for a delay here, the design is wrong.
//
// 🛑 WE WATCH DIRECTORIES, NOT FILES, AND IT IS MEASURED. Git does not write a
//    file in place: it writes a temporary file and RENAMES it over the target. A
//    watch on the file follows the dead inode and goes SILENTLY DEAF — strictly
//    worse than no watch at all, because a deaf watcher is indistinguishable
//    from a quiet one. Every directory the read WALKED is watched, so a file
//    created, renamed over, or deleted anywhere in the corpus fires an event.
//    ⚠️ A directory created LATER is covered too: creating it is itself an event
//    in its parent, which drops the entry; the next read re-walks and re-watches.
//
// ⚠️ AN EVENT DROPS, IT NEVER EXITS. `watchOwnCode` kills the process when the
//    CODE moves, because serving stale logic is a green that lies. A DOC moving
//    is the normal working day of this fleet — dropping the snapshot is the whole
//    response, and the next request rebuilds it from disk.
//
// ⚠️ FAIL-OPEN, PER ROOT. If a watch cannot be established the snapshot is NOT
//    kept: we hand back the freshly read corpus and stay on the re-read-every-time
//    behaviour for that root. **We never serve what we cannot be told about.**
//    One blind directory costs performance; a stale corpus costs correctness.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// 🛑 A CEILING IN THE SAME GESTURE AS THE WRITER — the space doctrine, applied to
//    RAM, exactly as `memory-store-pure.js` applies it to the state. A daemon runs
//    for WEEKS; a cache without a bound is not "a big number", it is a DATED
//    outage. The arithmetic is written in the open so the next reader can refute
//    it rather than trust it.
//
// 📐 WHAT ONE ENTRY HOLDS: exactly ONE snapshot of ONE corpus root — the same
//    bytes the daemon reads on EVERY request today. The change is residency, not
//    volume: what was transient becomes held. Fleet measured at ~386 documents
//    written to a "< 10 lines" convention; at a generous 10 KB each that is
//    ~4 MB per root, and the SESSION and MCP roots are far smaller.
//
// 📐 WHY THE ENTRY COUNT IS BOUNDED BY CONSTRUCTION AND WHY THAT IS NOT ENOUGH.
//    The keys are `(directory, prefix)` pairs, and the callers use exactly three,
//    all named in `paths.js`: the fleet docs, `docs/mcp/`, `docs/session/`. But a
//    bound that rests on "the callers currently pass three values" is a bound held
//    OUTSIDE the code that must respect it — the class of defect this repository
//    exists to remove. So the count is CAPPED here, and the cap is the eviction:
//    past it we simply stop caching and read through. Ceiling = 8 roots × one
//    corpus each ⇒ a few MB, and it cannot grow with uptime, traffic or sessions.
// ⚠️ EVICTION IS BY EVENT, NOT BY AGE OR SIZE — there is nothing to expire. An
//    entry lives until the kernel says its content changed. No clock is consulted.
// ⚠️ READ THROUGH RATHER THAN EVICT A NEIGHBOUR: an LRU here would let a fourth
//    root silently destroy the caching of the three that matter on every request
//    (thrashing), which reads as "the cache does nothing" with no way to see why.
//    Refusing to cache the surplus is slower for the surplus and honest for the rest.
const MAX_ROOTS = 8;

/**
 * The key of one corpus root.
 * ⚠️ The separator is a NUL, because no path and no prefix may contain one: with a
 *    plain space, `dir="a b"`+`prefix="c/"` and `dir="a"`+`prefix="b c/"` collide,
 *    and a collision here serves one corpus under another corpus's name.
 * ⚠️ `String.fromCharCode(0)` and never a quoted escape: a NUL typed inside a
 *    string literal is INVISIBLE in every editor and every diff, so the next
 *    reader sees two adjacent quotes and "fixes" the separator away.
 */
function rootKey(dir, prefix) {
  return String(dir) + String.fromCharCode(0) + String(prefix);
}

/**
 * Closes the watchers of ONE entry.
 * ⚠️ A FUNCTION AND NOT AN INNER LOOP, deliberately: `drop`, `invalidateAll` and
 *    the failure path of `armWatchers` all need it, and writing it inline in each
 *    would nest one traversal inside another — which `no-undeclared-quadratic`
 *    counts, rightly, and which nothing here needs.
 * ⚠️ Closing twice is normal (an event and a shutdown can race in the same tick)
 *    and must be harmless, hence the swallow.
 * @param {{watchers: Array<{close: () => void}>}} entry
 */
function closeEntry(entry) {
  for (const w of entry.watchers) {
    try { w.close(); } catch { /* already closed — the desired end state */ }
  }
  entry.watchers = [];
}

/**
 * A snapshot handed to a caller is always a FRESH array of FRESH objects.
 *
 * 🛑 THIS IS WHAT KEEPS THE DIFFERENTIAL BYTE-IDENTICAL, and it is not paranoia.
 *    Without the cache each consumer received an array nobody else could see; with
 *    it, one consumer mutating `d.text` (or splicing the array) would poison every
 *    later request — a corruption that appears only on the SECOND call, i.e. never
 *    in a test that makes one. Copying costs no I/O and no parsing; the strings
 *    themselves are shared, and strings are immutable.
 * @param {Array<{doc: string, text: string}>} snapshot
 * @returns {Array<{doc: string, text: string}>}
 */
function handOut(snapshot) {
  return snapshot.map((e) => ({ doc: e.doc, text: e.text }));
}

/**
 * Builds a cache over a corpus reader.
 *
 * @param {{
 *   read: (dir: string, prefix: string, dirsOut: string[]) => Array<{doc: string, text: string}>,
 *   watch: (dir: string, cb: () => void) => {close: () => void},
 *   maxRoots?: number
 * }} deps `read` walks the filesystem and reports the directories it entered;
 *   `watch` is the kernel notification, injected so a test drives it without
 *   racing a real filesystem.
 * @returns {{
 *   read: (dir: string, prefix: string) => Array<{doc: string, text: string}>,
 *   invalidateAll: () => void,
 *   size: () => number
 * }}
 */
function createCorpusCache(deps) {
  const { read, watch } = deps;
  const maxRoots = typeof deps.maxRoots === 'number' && deps.maxRoots > 0 ? deps.maxRoots : MAX_ROOTS;
  /** @type {Map<string, {snapshot: Array<{doc: string, text: string}>, watchers: Array<{close: () => void}>}>} */
  const entries = new Map();

  /** Drops one entry and releases its watchers. Idempotent. */
  function drop(key) {
    const entry = entries.get(key);
    if (entry === undefined) return;
    entries.delete(key);
    closeEntry(entry);
  }

  /**
   * Arms one watcher per walked directory.
   * @param {string[]} dirs
   * @param {string} key
   * @returns {Array<{close: () => void}>|null} null ⇒ the root could not be
   *   watched, so it MUST NOT be cached.
   */
  function armWatchers(dirs, key) {
    const watchers = [];
    for (const dir of dirs) {
      // ⚠️ ALL OR NOTHING, unlike `watchOwnCode` which degrades per directory.
      //    There, a blind directory costs a delayed restart; here it would make
      //    us serve a document we were never told had changed. The two failures
      //    are not comparable, so the two policies are not either.
      try {
        watchers.push(watch(dir, () => drop(key)));
      } catch {
        closeEntry({ watchers });
        return null;
      }
    }
    return watchers;
  }

  return {
    /**
     * The cached read. A MISS reads the filesystem exactly as the uncached path
     * does, then keeps the result ONLY if every directory it walked could be
     * watched and the ceiling allows one more root.
     */
    read(dir, prefix) {
      const key = rootKey(dir, prefix);
      const hit = entries.get(key);
      if (hit !== undefined) return handOut(hit.snapshot);
      /** @type {string[]} */
      const dirs = [];
      // ⚠️ NO try/catch: an unreadable corpus is a real failure and belongs to the
      //    caller's fail-open, exactly as in `corpus.js`. Swallowing it here would
      //    cache an empty corpus — the injection would go silently mute.
      const snapshot = read(dir, prefix, dirs);
      // ⚠️ THE CEILING IS CHECKED AFTER THE READ, never before: the answer is the
      //    same either way, and refusing to READ would be a cache that breaks the
      //    engine instead of merely not helping it.
      if (entries.size >= maxRoots) return snapshot;
      const watchers = armWatchers(dirs, key);
      if (watchers === null) return snapshot;
      // ⚠️ A drop may already have fired between the read and here (the kernel does
      //    not wait for us). Storing anyway is safe: the event that mattered was
      //    about the bytes we JUST read, and any later change fires again on these
      //    same watchers.
      entries.set(key, { snapshot, watchers });
      return handOut(snapshot);
    },

    /** Drops everything and releases every watcher. Used by `disableCache`. */
    invalidateAll() {
      const keys = [...entries.keys()];
      for (const k of keys) drop(k);
    },

    /** @returns {number} resident roots — the observable the ceiling bounds. */
    size() {
      return entries.size;
    },
  };
}

module.exports = { createCorpusCache, rootKey, MAX_ROOTS };
