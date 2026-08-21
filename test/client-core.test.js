// ═══════════════════════════════════════════════════════════════════════
// client-core.js — ONE AUTHORITY, OR NONE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS SUITE EXISTS TO FORBID, AND IT IS INVISIBLE ONCE SHIPPED: TWO
//    MEMORIES. If the local fallback ever wrote to the state files while a
//    daemon holds its own memory, a `once` delivered by one would be
//    re-delivered by the other, indefinitely, with no error anywhere. So the
//    cells below assert an ABSENCE of writes — the hardest thing to notice by
//    reading code, and the easiest to break by "improving" the fallback.
// ⚠️ The last cell talks to the REAL kernel: it aims at an address nobody
//    listens on and requires an immediate verdict. No timer, no retry, no
//    "wait and see" — that is the whole premise of this lane.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const client = require_('../src/client-core.js');

/** A shell dialect reduced to what the contract needs: a pure formatter. */
const dialecte = (decision, doc, message) => ({ decision, doc, message });

// ── ① THE DAEMON ANSWERED — nobody decides a second time ────────────────
// 🛑 A local re-decision behind a successful answer would consume the `once`
//    documents a SECOND time, in the frame that had just received them.
test('when the daemon answers, its answer is emitted VERBATIM and nothing is re-decided', () => {
  const reponse = { hookSpecificOutput: { additionalContext: 'DU DAEMON' } };
  let emis = null;
  let moteurAppele = 0;

  client.run({ tool_name: 'Read' }, {
    output: dialecte,
    emit: (json) => { emis = json; },
    ask: (_data, _opts, done) => done(reponse),
    run: () => { moteurAppele += 1; },
  }, { frame: 3, nbFrames: 16 });

  assert.equal(emis, reponse, 'the daemon ran the same core through the same dialect: reformatting it here would be a second formatting of one decision');
  assert.equal(moteurAppele, 0, 'the local engine ran BEHIND a successful answer — the `once` documents would be consumed twice');
});

// ── ② NO AUTHORITY — decide locally, and WRITE NOTHING ──────────────────
test('with no daemon, the frame decides locally and the store it is given can neither know nor write', () => {
  let vues = null;
  let emis = null;

  client.run({ tool_name: 'Read' }, {
    output: dialecte,
    emit: (json) => { emis = json; },
    ask: (_data, _opts, done) => done(null),          // the kernel said: nobody there
    run: (_data, emit, options) => { vues = options; emit('allow', 'LOCAL', 'BADGE'); },
  }, { frame: 1, nbFrames: 16 });

  assert.deepEqual(emis, { decision: 'allow', doc: 'LOCAL', message: 'BADGE' },
    'the local path must still deliver through the shell dialect');

  // 🛑 THE STORE MUST BE THE ABSENT ONE, NEVER THE FILE STORE. Reaching for the
  //    files here is exactly the second memory this design forbids.
  assert.deepEqual(vues.store.loadState('doc-seen-', 's'), {},
    'the fallback store claims to know something: with no daemon, nothing anywhere has recorded anything');
  assert.equal(vues.store.saveState('doc-seen-', 's', { x: 1 }), undefined,
    'saveState must be inert — making it write reintroduces the duplicate delivery in production');

  // 🛑 AND THE LOCK MUST NEVER GRANT: handing back `fallback` is what routes
  //    `pretool-core` into its lock-less branch, the one proved sufficient by
  //    TLC. Returning anything else would make this frame emit a full delivery
  //    it is not allowed to record.
  assert.equal(vues.withLock('/nowhere', () => 'SECTION', { fallback: null }), null,
    'the lock granted the critical section: the frame would deliver a `once` it cannot record');
});

// ── ③ THE ABSENT STORE IS INERT ON DISK, MEASURED ───────────────────────
// 🛑 ANTI-VACUITY IS THE WHOLE CELL. A first version created a temp folder and
//    asserted it stayed empty — which the inert store satisfies WITHOUT PROVING
//    ANYTHING, since it writes nowhere at all: a store writing to the REAL state
//    directory would have passed just the same. The CONTROL below is what gives
//    the emptiness a meaning: the same folder, the same call, the REAL store —
//    it must produce a file. Only then does "still empty" mean something.
test('the fallback store leaves NOTHING on disk — proven against a store that DOES write', () => {
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-client-'));
  const avant = process.env.CTXROUTE_STATE_DIR;
  process.env.CTXROUTE_STATE_DIR = bac;
  try {
    for (const k of Object.keys(require_.cache)) {
      if (/paths|session-store/.test(k)) delete require_.cache[k];
    }
    const reel = require_('../src/session-store.js');

    reel.saveState('doc-seen-', 'temoin', { seen: ['doc'] });
    assert.ok(fs.readdirSync(bac).length > 0,
      'CONTROL: the real store wrote nothing here either — this cell cannot tell a silent store '
      + 'from a store aiming somewhere else, so its verdict would be worthless');
    for (const f of fs.readdirSync(bac)) fs.rmSync(path.join(bac, f), { force: true });

    client.ETAT_ABSENT.saveState('doc-seen-', 'temoin', { seen: ['doc'] });
    assert.deepEqual(fs.readdirSync(bac), [],
      'a write escaped the inert store: with a daemon holding its own memory that makes TWO '
      + 'memories, and a `once` delivered by one is re-delivered by the other, in silence');
  } finally {
    if (avant === undefined) delete process.env.CTXROUTE_STATE_DIR;
    else process.env.CTXROUTE_STATE_DIR = avant;
    fs.rmSync(bac, { recursive: true, force: true });
  }
});

// ── ④ THE REAL KERNEL — an absent daemon is a FACT, delivered at once ────
// 🛑 NO TIMER ANYWHERE. A missing pipe answers `ENOENT`, a dead socket
//    `ECONNREFUSED`, immediately. If this cell ever needs a delay to pass, the
//    lane has stopped asking the kernel and started guessing.
test('an address nobody listens on yields an immediate verdict, and the local path takes over', () => {
  const adresse = process.platform === 'win32'
    ? '\\\\.\\pipe\\ctxroute-personne-nest-la'
    : path.join(os.tmpdir(), 'ctxroute-personne-nest-la.sock');

  let repli = 0;
  let fini = false;
  client.run({ tool_name: 'Read' }, {
    output: dialecte,
    emit: () => { fini = true; },
    run: (_d, emit) => { repli += 1; emit('none', '', ''); },
  }, { socketPath: adresse });

  // ⚠️ The settlement is asserted on the NEXT tick of the loop, which is where
  //    a kernel error surfaces — never after a delay we chose ourselves.
  return new Promise((resolve) => setImmediate(() => {
    assert.equal(repli, 1, 'no daemon: the local path must take over, exactly once');
    assert.ok(fini, 'and the frame must settle — a frame that never answers is a hook that hangs');
    resolve();
  }));
});
