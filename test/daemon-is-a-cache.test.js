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
function surUnEtatNeuf(fn) {
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-cache-'));
  const avant = process.env.CTXROUTE_STATE_DIR;
  process.env.CTXROUTE_STATE_DIR = bac;
  try {
    for (const k of Object.keys(require_.cache)) {
      if (/paths|session-store|memory-store|store-resolve/.test(k)) delete require_.cache[k];
    }
    return fn(bac);
  } finally {
    if (avant === undefined) delete process.env.CTXROUTE_STATE_DIR;
    else process.env.CTXROUTE_STATE_DIR = avant;
    fs.rmSync(bac, { recursive: true, force: true });
  }
}

// ── ① THE DURABLE CLASS IS WRITTEN THROUGH, AND IT IS PROVEN BY THE FILE ──
test('a durable key written to the daemon lands on DISK in the same gesture', () => {
  surUnEtatNeuf((bac) => {
    const disque = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const daemon = createMemoryStore({ durableStore: disque });

    daemon.saveState('doc-seen-', 'sess', { seen: ['skill:ctxroute'] });

    // 🛑 THE FILE IS THE PROOF, never the store's own answer: a cache asked
    //    about itself always says yes. What the next process will read is what
    //    matters, and the next process reads this directory.
    const fichiers = fs.readdirSync(bac).filter((f) => f.startsWith('doc-seen-'));
    assert.equal(fichiers.length, 1,
      'the durable key never reached the disk: the daemon still OWNS it, so its death still withholds documents');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bac, fichiers[0]), 'utf8')),
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
  surUnEtatNeuf((bac) => {
    const disque = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const daemon = createMemoryStore({ durableStore: disque });

    daemon.saveState('plan-', 'sess--inv-1', { segments: ['a'] });

    assert.deepEqual(fs.readdirSync(bac).filter((f) => f.startsWith('plan-')), [],
      'an ephemeral key reached the disk: one write per frame per action, paid for a state that dies with the action');
    assert.deepEqual(daemon.loadState('plan-', 'sess--inv-1'), { segments: ['a'] },
      'the ephemeral key is not in RAM either — it was simply lost');
  });
});

// ── ③ THE ACCEPTANCE CRITERION: THE DAEMON DIES MID-SEQUENCE ─────────────
test('the daemon dies mid-sequence: the `once` is neither re-delivered nor lost', () => {
  surUnEtatNeuf(() => {
    const disque = require_('../src/session-store.js');
    const { createMemoryStore } = require_('../src/memory-store.js');
    const { resolveStore } = require_('../src/store-resolve.js');

    // The daemon is alive and records a delivery.
    const daemon = createMemoryStore({ durableStore: disque });
    daemon.saveState('doc-seen-', 'sess', { seen: ['doc-a'] });

    // 💀 IT DIES. Not a clean stop — the hard death, the one no exit hook covers.
    //    `close()` releases the exit listener WITHOUT flushing, which is exactly
    //    what a `SIGKILL` or a supervisor stop does to this process.
    daemon.close();

    // A frame acts during the window. It is on the client lane, nobody answers,
    // so it falls back — and the fallback must SEE what the daemon recorded.
    const repli = resolveStore({ backend: 'client' });
    assert.deepEqual(repli.store.loadState('doc-seen-', 'sess'), { seen: ['doc-a'] },
      'the fallback lost the delivery: the `once` is delivered a SECOND time, and nothing shows it');

    // It records its own delivery while the daemon is gone.
    repli.store.saveState('doc-seen-', 'sess', { seen: ['doc-a', 'doc-b'] });

    // 🔁 THE DAEMON COMES BACK. It must adopt what happened without it — no
    //    snapshot to restore from, because it never owned this state.
    const revenu = createMemoryStore({ durableStore: disque });
    assert.deepEqual(revenu.loadState('doc-seen-', 'sess'), { seen: ['doc-a', 'doc-b'] },
      'the daemon came back blind to what the fallback wrote: two memories, and the split brain is back');
    revenu.close();
  });
});

// ── ④ SEEN RED — the cell above must REJECT an owning daemon ─────────────
// 🛑 WITHOUT THIS, CELL ③ CANNOT BE TOLD FROM A BROKEN ONE. A store built with
//    NO `durableStore` is exactly the daemon as it behaved until 2026-08-22: it
//    owns the state in RAM. Feeding it to the same sequence must fail, or cell
//    ③ proves nothing at all.
test('CONTROL: a daemon that OWNS its state fails the same sequence', () => {
  surUnEtatNeuf(() => {
    const { createMemoryStore } = require_('../src/memory-store.js');
    const { resolveStore } = require_('../src/store-resolve.js');

    const proprietaire = createMemoryStore({});           // no durableStore: the old behaviour
    proprietaire.saveState('doc-seen-', 'sess', { seen: ['doc-a'] });
    proprietaire.close();

    assert.deepEqual(resolveStore({ backend: 'client' }).store.loadState('doc-seen-', 'sess'), {},
      'the owning daemon somehow reached the disk — this control no longer discriminates, and cell ③ is worthless');
  });
});
