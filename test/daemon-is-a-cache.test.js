// ═══════════════════════════════════════════════════════════════════════
// THE DAEMON IS A CACHE, NOT AN OWNER — the acceptance criterion, verbatim.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 STATED BY THE OPERATOR ON 2026-08-22 AND BINDING: *"we restart it forty
//    billion times a day, and from the agent's point of view it is as if it had
//    never restarted."* This daemon exits BY DESIGN at every edit of this
//    repository — dozens of times a day, for ever. That is the NORMAL regime,
//    not an incident, so every fix of the shape "die less" is wrong by
//    construction: 3 restarts or 100, it is the same patch with a bigger number.
//    The death has to become FREE.
//
// 🔴 WHAT IT COST BEFORE: the daemon owned the durable state in RAM and saved it
//    every N mutations, so each death withheld every `once` document and every
//    skill from the WHOLE fleet — 15 silent minutes measured that morning. No
//    error, no badge, no red gate: the coherence judge was green, because
//    everything-on-the-daemon IS perfectly coherent.
//
// ⚠️ INDISTINGUISHABLE IN THE RESULT, NOT IN THE LATENCY. The fallback reads a
//    file instead of a socket, so it is slower. Buying that speed back would
//    mean holding durable state in RAM again — the very defect closed here.
//    Correct-but-slower, never fast-but-wrong.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

/** Runs `fn` against a state directory of its own, modules reloaded onto it. */
function onAFreshState(fn) {
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-cache-'));
  const before = process.env.CTXROUTE_STATE_DIR;
  process.env.CTXROUTE_STATE_DIR = bac;
  try {
    for (const k of Object.keys(require_.cache)) {
      if (/paths|session-store|memory-store|store-resolve/.test(k)) delete require_.cache[k];
    }
    return fn(bac);
  } finally {
    if (before === undefined) delete process.env.CTXROUTE_STATE_DIR;
    else process.env.CTXROUTE_STATE_DIR = before;
    fs.rmSync(bac, { recursive: true, force: true });
  }
}

// ── ① THE DURABLE CLASS IS WRITTEN THROUGH, AND IT IS PROVEN BY THE FILE ──
test('a durable key written to the daemon lands on DISK in the same gesture', () => {
  onAFreshState((bac) => {
    const disk = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const daemon = createMemoryStore({ durableStore: disk });

    daemon.saveState('doc-seen-', 'sess', { seen: ['skill:ctxroute'] });

    // 🛑 THE FILE IS THE PROOF, never the store's own answer: a cache asked
    //    about itself always says yes. What the next process will read is what
    //    matters, and the next process reads this directory.
    const files = fs.readdirSync(bac).filter((f) => f.startsWith('doc-seen-'));
    assert.equal(files.length, 1,
      'the durable key never reached the disk: the daemon still OWNS it, so its death still withholds documents');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bac, files[0]), 'utf8')),
      { seen: ['skill:ctxroute'] },
      'the file exists but does not carry the state — a write-through that writes something else is worse than none');
  });
});

// ── ② THE EPHEMERAL CLASS STAYS OUT, AND THAT ASYMMETRY IS DELIBERATE ────
// ⚠️ ANTI-VACUITY: without this cell, "everything is written through" would pass
//    cell ① just as well — and it would cost one disk write per frame per tool
//    call on a machine whose SSD wear is a declared budget. A `plan-` dies with
//    its action, so losing it costs a RECOMPUTATION, never a re-delivery.
test('an ephemeral key is NOT written through — the two classes are treated differently', () => {
  onAFreshState((bac) => {
    const disk = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const daemon = createMemoryStore({ durableStore: disk });

    daemon.saveState('plan-', 'sess--inv-1', { segments: ['a'] });

    assert.deepEqual(fs.readdirSync(bac).filter((f) => f.startsWith('plan-')), [],
      'an ephemeral key reached the disk: one write per frame per action, paid for a state that dies with the action');
    assert.deepEqual(daemon.loadState('plan-', 'sess--inv-1'), { segments: ['a'] },
      'the ephemeral key is not in RAM either — it was simply lost');
  });
});

// ── ③ THE ACCEPTANCE CRITERION: THE DAEMON DIES MID-SEQUENCE ─────────────
test('the daemon dies mid-sequence: the `once` is neither re-delivered nor lost', () => {
  onAFreshState(() => {
    const disk = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const { resolveStore } = require_('../src/store-resolve.js');

    // The daemon is alive and records a delivery.
    const daemon = createMemoryStore({ durableStore: disk });
    daemon.saveState('doc-seen-', 'sess', { seen: ['doc-a'] });

    // 💀 IT DIES. Not a clean stop — the hard death, the one no exit hook covers.
    //    `close()` releases the exit listener WITHOUT flushing, which is exactly
    //    what a `SIGKILL` or a supervisor stop does to this process.
    daemon.close();

    // A frame acts during the window. It is on the client lane, nobody answers,
    // so it falls back — and the fallback must SEE what the daemon recorded.
    const fallback = resolveStore({ backend: 'client' });
    assert.deepEqual(fallback.store.loadState('doc-seen-', 'sess'), { seen: ['doc-a'] },
      'the fallback lost the delivery: the `once` is delivered a SECOND time, and nothing shows it');

    // It records its own delivery while the daemon is gone.
    fallback.store.saveState('doc-seen-', 'sess', { seen: ['doc-a', 'doc-b'] });

    // 🔁 THE DAEMON COMES BACK. It must adopt what happened without it — no
    //    snapshot to restore from, because it never owned this state.
    const returned = createMemoryStore({ durableStore: disk });
    assert.deepEqual(returned.loadState('doc-seen-', 'sess'), { seen: ['doc-a', 'doc-b'] },
      'the daemon came back blind to what the fallback wrote: two memories, and the split brain is back');
    returned.close();
  });
});

// ── ④ SEEN RED — the cell above must REJECT an owning daemon ─────────────
// 🛑 WITHOUT THIS, CELL ③ CANNOT BE TOLD FROM A BROKEN ONE. A store built with
//    NO `durableStore` is exactly the daemon as it behaved until 2026-08-22: it
//    owns the state in RAM. Feeding it to the same sequence must fail, or cell
//    ③ proves nothing at all.
test('CONTROL: a daemon that OWNS its state fails the same sequence', () => {
  onAFreshState(() => {
    const { createMemoryStore } = require_('../src/memory-store.js');
    const { resolveStore } = require_('../src/store-resolve.js');

    const owner = createMemoryStore({});           // no durableStore: the old behaviour
    owner.saveState('doc-seen-', 'sess', { seen: ['doc-a'] });
    owner.close();

    assert.deepEqual(resolveStore({ backend: 'client' }).store.loadState('doc-seen-', 'sess'), {},
      'the owning daemon somehow reached the disk — this control no longer discriminates, and cell ③ is worthless');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ THE CONSEQUENCE NOBODY DREW ON 2026-08-22 — the write-through crosses a
//    lock the daemon was not taking.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 MEASURED 2026-08-23, on two REAL processes. Cells ① to ④ prove the daemon
//    writes the durable class to disk; NOTHING proved it did so under the mutual
//    exclusion a spawned peer takes on those same files. Its `/emit` and `/turn`
//    routes did not: they were exempted from `state-write-under-lock-gate` with
//    the reason "one process, one thread, one connection at a time — there is
//    nothing to serialise against", **which stopped being true the day the
//    daemon started writing THROUGH**. The kernel serialises the daemon's OWN
//    callers; it serialises nothing against another process.
//    Read-modify-write on one `remainder-` key, one writer lock-less and
//    daemon-shaped, one spawned and locked: **209 updates lost out of 800**.
//    Control with BOTH writers locked: 0-1 out of 800. The write is atomic
//    (tmp + rename), so nothing was ever CORRUPT — what disappeared is a
//    RECORDED DELIVERY, i.e. a document delivered twice, in silence.
//
// 🛑 WHY THIS CELL IS NOT THE REPRODUCTION ITSELF. The reproduction is a RACE:
//    it needs two processes to cross, so it answers "it happened" and never "it
//    cannot happen". Committed as a suite it would be flaky in BOTH directions —
//    the control lost 1 update of 800 with correct locking on both sides — and a
//    suite that reddens on scheduling noise is a suite people stop reading, then
//    disarm. This cell asks the DECIDABLE question instead: at the instant of the
//    write, is the lock the spawned lane takes actually HELD?
// 🛑 AND IT ASKS FOR THE ADDRESS TOO, WHICH THE STATIC GATE CANNOT. That gate
//    matches the SHAPE `withLock(...)`, so a route holding some OTHER directory
//    would pass it while protecting nothing. A lock only serialises writers that
//    take the SAME name: two spellings are two locks, and two locks are no lock.
/**
 * Drives one daemon route and reports, per write, whether each lock was held.
 * @param {string} route the route's name, for the anti-vacuity message
 * @param {(daemon: object, scope: string) => void} appel
 */
function underLock(route, appel) {
  return onAFreshState(() => {
    const disk = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const { docLockDir, turnLockDir } = require_('../src/store-resolve.js');
    const scope = 'sess';
    // ⚠️ THE OBSERVATION IS TAKEN AT THE INSTANT OF THE WRITE, from INSIDE the
    //    durable store — the last place before the bytes land. Asking afterwards
    //    would answer about a lock already released.
    const vus = [];
    const spy = {
      loadState: (p, s) => disk.loadState(p, s),
      saveState: (p, s, v) => {
        vus.push({
          prefix: p,
          doc: fs.existsSync(docLockDir(scope)),
          turn: fs.existsSync(turnLockDir(scope)),
        });
        disk.saveState(p, s, v);
      },
      purgeByPrefix: (k) => disk.purgeByPrefix(k),
    };
    const daemon = createMemoryStore({ durableStore: spy });
    try { appel(daemon, scope); } finally { daemon.close(); }
    // 🛑 ANTI-VACUITY: a route that wrote NOTHING would satisfy "every write was
    //    locked" trivially, and this cell would certify instead of protect.
    assert.ok(vus.length >= 1,
      `${route} wrote nothing at all — this cell measures nothing, it does not pass`);
    return vus;
  });
}

test('the daemon `/emit` route writes the queue while HOLDING the spawned lane lock', () => {
  const vus = underLock('/emit', (daemon, scope) => {
    require_('../src/hooks/http-server.js').emitRoute(
      { fresh: [], budgetMax: 8000, nbFrames: 1, index: 1, scopeId: scope }, daemon);
  });
  for (const v of vus) {
    assert.equal(v.prefix, 'remainder-',
      'unexpected key on the /emit path — this cell is aimed at the wrong write');
    assert.ok(v.doc,
      'the daemon rewrote the `remainder-` queue with the spawned lane lock FREE: an interleaved '
      + 'read-modify-write loses a queue segment or a recorded delivery, silently (209 of 800 measured)');
  }
});

test('the daemon `/turn` route writes the counter while HOLDING the spawned lane lock', () => {
  const vus = underLock('/turn', (daemon, scope) => {
    require_('../src/hooks/http-server.js').turnRoute({ prefix: 'turn-count-', scope }, daemon);
  });
  for (const v of vus) {
    assert.equal(v.prefix, 'turn-count-',
      'unexpected key on the /turn path — this cell is aimed at the wrong write');
    assert.ok(v.turn,
      'the daemon bumped `turn-count-` with the spawned lane lock FREE: `turn-count.js` reads and '
      + 'rewrites that same file under `turnLockDir`, so a crossing loses a turn or the refusal flag');
  }
});
