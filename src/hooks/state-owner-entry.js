// ═══════════════════════════════════════════════════════════════════════
// state-owner-entry.js — THE OWNER THREAD'S SHELL: what it holds, and when.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE DIVISION OF LABOUR THIS FILE EXISTS FOR. `state-owner-thread.js` is
//    the SERVING loop and knows nothing about disks; this shell decides WHAT is
//    owned — the memory store, the three invocation tables, and the two
//    snapshots that make a restart invisible. A loop that opened files would be
//    a loop nothing could drive from a test.
//
// 🛑 THE STORE IS ASKED FOR, NEVER OPENED. `store-resolve.js` is the SINGLE
//    resolution point and it hands out the store and its lock TOGETHER; a
//    thread that opened its own would be the sixth importer that rule exists to
//    redden, and the pair is what stops anyone from building the incoherent
//    half (memory plus a file lock protects nothing; disk plus an empty lock IS
//    the production bug of 2026-08-07).
//
// 🛑 THE ORDER IS THE GUARANTEE, AND IT IS THE SAME ONE `main()` OBEYS:
//    RESTORE BEFORE ANYBODY CAN ASK. At the instant this thread starts, no
//    server thread exists yet — the pool is started after the owner — so the
//    reads below have no concurrency to fear. Restoring later would put back,
//    by hand, the exact race the design removes.
//
// 🔴 WITHOUT THE SNAPSHOTS A RESTART IS VISIBLE TO THE AGENT, MEASURED
//    2026-09-19: the daemon exits by design at every code delivery, `doc-seen-`
//    survives on disk so the documents stay marked delivered, and the three
//    tables died with the process — so the frames landing after the restart
//    were counted as the FIRST and re-served chunk 1. The document is not
//    re-decided; the CHUNK is re-served, and the agent sees its skill arrive a
//    second time mid-session.
//
// ⚠️ THE STORE IS A CACHE, NOT AN OWNER — unchanged by the move to a thread.
//    `durableStore` forwards every durable key to the disk store, which is the
//    truth; only the ephemeral `plan-` class lives in RAM, so this thread's
//    death costs a recomputation and never a re-delivered document.
//
// ⚠️ THERE IS NO "TEST MODE" HERE, DELIBERATELY. A suite points
//    `CTXROUTE_STATE_DIR` at a throwaway directory and drives this very code; a
//    second construction path would be a second behaviour nobody measures.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createOwner } = require('./state-owner-thread');
const channel = require('../thread-channel-pure');
const ownerOps = require('../owner-ops');
const frameSequencer = require('../frame-sequencer-pure');
const deliveryNotice = require('../delivery-notice-pure');
const carryover = require('../carryover-pure');
const invocationSnapshot = require('../invocation-snapshot-pure');
const storeResolve = require('../store-resolve');
const paths = require('../paths');

/**
 * Build the owned state, exactly as `main()` used to build it.
 *
 * @returns {{
 *   ops: {tables: Record<string, Function>, store: Record<string, Function>},
 *   tables: object,
 *   store: {flush: Function, restore: Function, loadState: Function, saveState: Function, purge: Function},
 *   invocationsPath: string,
 *   restored: number
 * }}
 */
function own() {
  const store = /** @type {{flush: Function, restore: Function, loadState: Function, saveState: Function, purge: Function}} */ (
    storeResolve.resolveStore({ backend: 'daemon' }).store
  );
  store.restore();
  const tables = {
    sequencer: frameSequencer.createState(),
    notice: deliveryNotice.createState(),
    carryover: carryover.createState(),
  };
  const invocationsPath = path.join(paths.stateDir(), 'daemon-invocations.json');
  let restored = 0;
  try {
    restored = invocationSnapshot.adopt(
      tables,
      invocationSnapshot.decode(JSON.parse(fs.readFileSync(invocationsPath, 'utf8'))),
    );
  } catch {
    // fail-open: no file, unreadable or malformed — which is today's behaviour.
  }
  const ops = ownerOps.createOps({
    sequencer: tables.sequencer,
    notice: tables.notice,
    carryover: tables.carryover,
    store,
  });
  return { ops, tables, store, invocationsPath, restored };
}

/**
 * Save what must cross the death, then let the thread end.
 *
 * 🛑 AT DEATH, NEVER PER FRAME. Writing these on every frame would be 32 disk
 *    writes per action on a machine whose SSD wear is a declared budget. One
 *    write while the thread is stopping costs a serving daemon exactly nothing.
 * ⚠️ FAIL-OPEN BOTH TIMES: a thread on its way out must never throw.
 *
 * @param {{store: object, tables: object, invocationsPath: string}} owned
 * @returns {void}
 */
function persist(owned) {
  try { /** @type {{flush: Function}} */ (owned.store).flush(); } catch { /* housekeeping never delays a stop */ }
  try {
    fs.writeFileSync(owned.invocationsPath, JSON.stringify(invocationSnapshot.encode(owned.tables)));
  } catch {
    // fail-open: the worst loss is exactly the behaviour from before the snapshot existed.
  }
}

/**
 * The worker body: own the state, answer for ever, save on the way out.
 *
 * @param {{control: SharedArrayBuffer, payload: SharedArrayBuffer, clients: number, slotBytes?: number}} wiring
 * @returns {void}
 */
function main(wiring) {
  const owned = own();
  const control = new Int32Array(wiring.control);
  const owner = createOwner({
    control,
    payload: new Uint8Array(wiring.payload),
    clients: wiring.clients,
    slotBytes: wiring.slotBytes,
    ops: owned.ops,
  });
  try {
    owner.loop();
  } finally {
    persist(owned);
    // 🔴 THE FLAG IS WHAT LETS THE MAIN THREAD LEAVE. `process.exit` kills a
    //    worker outright — no event, no `finally` — so without it a SIGTERM
    //    would kill this thread mid-save on every clean stop, and the arrival
    //    order of every invocation in flight would be lost while the shutdown
    //    looked perfectly clean.
    Atomics.store(control, channel.DRAINED, 1);
    Atomics.notify(control, channel.DRAINED);
  }
}

module.exports = { main, own, persist };
