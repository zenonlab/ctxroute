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
const { resolveStore } = require_('../src/store-resolve.js');

/** A shell dialect reduced to what the contract needs: a pure formatter. */
const dialect = (decision, doc, message) => ({ decision, doc, message });

// ── ① THE DAEMON ANSWERED — nobody decides a second time ────────────────
// 🛑 A local re-decision behind a successful answer would consume the `once`
//    documents a SECOND time, in the frame that had just received them.
test('when the daemon answers, its answer is emitted VERBATIM and nothing is re-decided', () => {
  const response = { hookSpecificOutput: { additionalContext: 'DU DAEMON' } };
  let emitted = null;
  let engineCalled = 0;

  client.run({ tool_name: 'Read' }, {
    output: dialect,
    emit: (json) => { emitted = json; },
    ask: (_data, _opts, done) => done(response),
    run: () => { engineCalled += 1; },
  }, { frame: 3, nbFrames: 16 });

  assert.equal(emitted, response, 'the daemon ran the same core through the same dialect: reformatting it here would be a second formatting of one decision');
  assert.equal(engineCalled, 0, 'the local engine ran BEHIND a successful answer — the `once` documents would be consumed twice');
});

// ── ② NO AUTHORITY — decide locally, and WRITE NOTHING ──────────────────
test('with no daemon, the frame decides locally and the store it is given can neither know nor write', () => {
  let seen = null;
  let emitted = null;

  client.run({ tool_name: 'Read' }, {
    output: dialect,
    emit: (json) => { emitted = json; },
    ask: (_data, _opts, done) => done(null),          // the kernel said: nobody there
    run: (_data, emit, options) => { seen = options; emit('allow', 'LOCAL', 'BADGE'); },
  }, { frame: 1, nbFrames: 16 });

  assert.deepEqual(emitted, { decision: 'allow', doc: 'LOCAL', message: 'BADGE' },
    'the local path must still deliver through the shell dialect');

  // 🔑 THE STORE MUST BE THE DISK PAIR — INVERTED ON 2026-08-22, AND THE
  //    REVERSAL IS THE WHOLE FIX. This cell used to demand an INERT store, on a
  //    reasoning that was correct at the time: while the daemon held the durable
  //    state in RAM, a fallback that wrote files would have been a SECOND
  //    memory. Since the daemon writes durable keys THROUGH to those same files,
  //    the disk is the one truth and reading it is not divergence.
  // 🔴 WHAT THE OLD INVARIANT COST: a store that writes nothing withholds every
  //    document needing a record, so a dead daemon starved the WHOLE FLEET of
  //    its `once` documents and skills — 15 silent minutes measured that
  //    morning, on a daemon that exits BY DESIGN at every edit of this
  //    repository. A lane whose normal regime is death may not treat death as
  //    an incident.
  const disk = resolveStore({ backend: 'disk' });
  assert.equal(seen.store, disk.store,
    'the fallback is not the disk store: either a second memory, or a memory that records nothing');
  assert.equal(seen.withLock, disk.withLock,
    'the fallback took no real lock: it races the daemon, which now writes the same files');
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
  const before = process.env.CTXROUTE_STATE_DIR;
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

    client.STATE_ABSENT.saveState('doc-seen-', 'temoin', { seen: ['doc'] });
    assert.deepEqual(fs.readdirSync(bac), [],
      'a write escaped the inert store: with a daemon holding its own memory that makes TWO '
      + 'memories, and a `once` delivered by one is re-delivered by the other, in silence');
  } finally {
    if (before === undefined) delete process.env.CTXROUTE_STATE_DIR;
    else process.env.CTXROUTE_STATE_DIR = before;
    fs.rmSync(bac, { recursive: true, force: true });
  }
});

// ── ④ THE REAL KERNEL — an absent daemon is a FACT, delivered at once ────
// 🛑 NO TIMER ANYWHERE. A missing pipe answers `ENOENT`, a dead socket
//    `ECONNREFUSED`, immediately. If this cell ever needs a delay to pass, the
//    lane has stopped asking the kernel and started guessing.
test('an address nobody listens on yields an immediate verdict, and the local path takes over', () => {
  const address = process.platform === 'win32'
    ? '\\\\.\\pipe\\ctxroute-personne-nest-la'
    : path.join(os.tmpdir(), 'ctxroute-personne-nest-la.sock');

  let fallback = 0;
  let done = false;
  client.run({ tool_name: 'Read' }, {
    output: dialect,
    emit: () => { done = true; },
    run: (_d, emit) => { fallback += 1; emit('none', '', ''); },
  }, { socketPath: address });

  // ⚠️ The settlement is asserted on the NEXT tick of the loop, which is where
  //    a kernel error surfaces — never after a delay we chose ourselves.
  return new Promise((resolve) => setImmediate(() => {
    assert.equal(fallback, 1, 'no daemon: the local path must take over, exactly once');
    assert.ok(done, 'and the frame must settle — a frame that never answers is a hook that hangs');
    resolve();
  }));
});
