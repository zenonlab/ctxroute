// ═══════════════════════════════════════════════════════════════════════
// split-scope-pure.js — an action is SPLIT once, never once per frame.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 MEASURED 2026-09-19, AND IT IS THE THIRD FLOOR OF THE SAME STAIRCASE.
//    `freshness-scope-pure.js` stopped the daemon re-verifying its own code per
//    frame; `collect-scope-pure.js` stopped it re-collecting the corpus per
//    frame. The SPLIT of that corpus was still recomputed by every one of the
//    32 frames of one action — MEASURED, `budget.planFrames` called **32 times
//    for one action**, and `budget.js` accounting for **26.7 % of the daemon's
//    CPU**, its `fingerprint` alone for 16.3 %.
// ✅ MEASURED A/B ON THE REAL SERVER, twice each arm, real corpus, 193,495
//    characters delivered per action: **180/186 ms → 128/131 ms per action**,
//    and the delivered bodies IDENTICAL — one SHA-1 over every sorted response
//    of every action, the same digest in all four runs.
//
// 🔑 WHY THE RECOMPUTATION EXISTS AT ALL, because it is not a mistake and must
//    not be "fixed" on the other lane. The split is deterministic BY DESIGN so
//    that N separate PROCESSES agree on it without coordinating: on the spawn
//    lane the frames really are N processes with no shared memory, and
//    determinism is what replaces an authority there. The daemon is ONE process
//    with ONE memory, so every recomputation past the first is inherited waste —
//    and ONLY a long-lived process can know that two requests belong to one
//    action.
// 🔑 WHY IT IS NOT A LATENCY QUESTION: the daemon is SINGLE-THREADED, so every
//    millisecond spent here is a millisecond during which it accepts nobody and
//    does not drain its sockets — and Windows then refuses connections on a
//    server that is perfectly alive (`http-lane.md`). Same reasoning, same
//    measured effect, as the two floors below.
//
// 🛑 KEYED ON THE INPUTS, NEVER ON THE INVOCATION — and that is the one design
//    decision worth reading twice. `split` has THREE callers in
//    `pretool-core.js`: the deciding frame, the replay of frames 2..N, and the
//    CARRYOVER, which splits the plan of a DIFFERENT invocation. An invocation
//    key would therefore file one action's frames under another's name, and the
//    failure would be silent and wrong CONTENT. Keyed on what the function is a
//    function of, a wrong guess can only ever MISS — i.e. recompute, i.e. the
//    behaviour of the day before.
// 🛑 THE DIGEST IS INJECTED, NEVER IMPORTED. This module must stay pure and
//    dependency-free (the purity rules forbid it `node:crypto`), and the shell
//    that owns I/O is also the one allowed to own a hash. Injecting it is also
//    what lets every branch be driven deterministically in a test.
//
// 🛑 FAILS TOWARDS MORE WORK, NEVER TOWARDS WRONG FRAMES: no table, no usable
//    hasher, a malformed segment, or an eviction ⇒ an empty signature, which
//    matches nothing ⇒ SPLIT. Every caller unable to produce a signature keeps
//    the historical behaviour BYTE FOR BYTE, which is what leaves the spawn lane
//    and every differential untouched (extension contract §6).
// 🛑 AN INVERTED CONDITION HERE WOULD SERVE ONE ACTION'S FRAMES TO ANOTHER,
//    silently. That is why the decision lives in a PURE module, mutated, and not
//    in the I/O shell where Stryker never looks — the same reason its two twins
//    were extracted.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

// ⚠️ SMALLER THAN `collect-scope-pure`'s 64, and the difference is MEASURED, not
//    guessed: an entry here holds the COMPOSED FRAMES of an action — 193,495
//    characters on the real corpus — where a collection entry holds the bodies
//    once. Sixteen entries is therefore a few megabytes, and the live set is a
//    handful: the client opens at most one connection at a time, so an action
//    older than sixteen has long stopped receiving frames.
const MAX_ENTRIES = 16;

/** A fresh, empty table. One per daemon, never persisted — losing it on restart
 *  degrades to "split once more", never to wrong frames. */
function createState() {
  return new Map();
}

/**
 * The key a split is filed under: everything `budget.planFrames` is a function
 * of, and nothing else.
 *
 * ⚠️ EVERYTHING THE SPLIT DEPENDS ON GOES THROUGH THE HASHER — the frame count,
 *    the budget, the segment count, then each id and each text, LENGTH-PREFIXED
 *    so the encoding is self-delimiting. Anything left out of the key is a fact
 *    two different emissions may disagree on while sharing an answer.
 *
 * @param {unknown} segments the split's input
 * @param {unknown} budgetMax characters one frame may carry
 * @param {unknown} nbFrames number of frames declared
 * @param {() => {update: (s: string) => unknown, digest: () => string}} newHash
 *   hasher factory, INJECTED (the shell owns `node:crypto`, this module may not)
 * @returns {string} the key, or `''` when no key can be made — `''` matches
 *   nothing, so the caller splits
 */
function signature(segments, budgetMax, nbFrames, newHash) {
  // ⚠️ THE ARRAY CHECK IS NOT ABSORBED BY THE LOOP, which is why it stays:
  //    a `Set` of perfectly valid segments ITERATES, so without it an
  //    array-like would yield a key built on an `undefined` length. A string
  //    WOULD be absorbed — one observable case is enough to earn a guard.
  if (!Array.isArray(segments)) return '';
  if (!Number.isInteger(budgetMax) || !Number.isInteger(nbFrames)) return '';

  // 🛑 ONE MECHANISM MAKES THIS FUNCTION TOTAL, NEVER TWO. The first version
  //    guarded the hasher's shape AND wrapped it, so every one of those guards
  //    was ABSORBED by the catch below: 17 mutants survived, all equivalent by
  //    construction. Writing a test for an absorbed guard FREEZES dead code
  //    for ever — the remedy is to delete it. What is left is observable.
  try {
    const hash = newHash();
    hash.update(`${nbFrames} ${budgetMax} ${segments.length}`);
    for (const seg of segments) {
      // ⚠️ A SEGMENT WITH NO TEXT ABORTS THE KEY rather than being coerced: a
      //    memo that guesses what it was handed is a memo that answers for
      //    something else. Observable with a hasher that accepts anything.
      if (typeof seg.text !== 'string') return '';
      // 🔑 LENGTH-PREFIXED, SO THE ENCODING IS SELF-DELIMITING. Concatenating
      //    id and text makes `{id:'a', text:'bc'}` and `{id:'ab', text:'c'}`
      //    hash alike, and a separator CHARACTER is only as safe as the
      //    assumption that no document contains it. A count cannot be forged.
      const id = typeof seg.id === 'string' ? seg.id : '';
      hash.update(`${id.length}:${id}${seg.text.length}:${seg.text}`);
    }
    const digest = hash.digest();
    // A hasher answering anything but a string has broken its contract; an
    // empty answer is a key that matches nothing, i.e. the same fail-safe.
    return typeof digest === 'string' ? digest : '';
  } catch {
    return '';
  }
}

/**
 * The frames already computed for this exact input, or `null`.
 *
 * 🛑 `null` IS THE FAIL-SAFE ANSWER and the caller must read it as "split": no
 *    table, or no key, can never mean "there is nothing to serve".
 *
 * @param {Map<string, unknown[]>|null|undefined} state tracking table, mutated
 * @param {unknown} key from `signature`, or `''`
 * @returns {unknown[]|null} the memoised frames, or null when they must be built
 */
function lookup(state, key) {
  if (!(state instanceof Map)) return null;
  if (typeof key !== 'string' || key === '') return null;
  if (!state.has(key)) return null;
  const frames = state.get(key);
  // ⚠️ RE-INSERT ON THE YOUNG END: an action still receiving frames must never
  //    be the one an eviction sacrifices — that would make the LONGEST actions,
  //    the ones this exists for, pay the most. Same rule as both twins.
  state.delete(key);
  state.set(key, frames);
  return frames;
}

/**
 * Remember the frames computed for this input, and evict down to the cap.
 *
 * ⚠️ A NON-ARRAY IS NEVER STORED: handing back something a caller would then
 *    index into is how a memo turns into a silent wrong answer. Refusing to
 *    store simply means the next frame splits again.
 *
 * @param {Map<string, unknown[]>|null|undefined} state tracking table, mutated
 * @param {unknown} key from `signature`, or `''`
 * @param {unknown} frames the split to memoise
 * @param {number} [maxEntries] eviction ceiling, overridable for tests
 * @returns {boolean} true when it was stored
 */
function remember(state, key, frames, maxEntries) {
  if (!(state instanceof Map)) return false;
  if (typeof key !== 'string' || key === '') return false;
  if (!Array.isArray(frames)) return false;

  state.delete(key);
  state.set(key, frames);
  const cap = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : MAX_ENTRIES;
  // ⚠️ A LOOP, though one pass is enough in practice (the table grows by one
  //    entry per stored split): it drains down to the cap rather than assuming a
  //    single overflow, exactly like both twins and `frame-sequencer-pure`.
  while (state.size > cap) {
    state.delete(state.keys().next().value);
  }
  return true;
}

module.exports = { createState, signature, lookup, remember, MAX_ENTRIES };
