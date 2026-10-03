// ═══════════════════════════════════════════════════════════════════════
// THE THREAD ENTRY POINT — the same six lines of interception as the daemon's.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS FILE HAS NO SEMANTICS AND MUST NEVER GAIN ANY. It is `http-daemon.js`
//    for a worker: the freshness baseline has to be the bytes Node ACTUALLY
//    COMPILED, in THIS isolate, never a re-read. A worker is a separate isolate
//    and compiles its own copy of every module, so it needs its own recording —
//    inheriting the main thread's would vouch for bytes this thread never ran.
//
// 🔴 WITHOUT IT A SERVER THREAD REFUSES EVERY REQUEST, LOUDLY BUT FOR THE WRONG
//    REASON. `staleCode.check()` is FAIL-CLOSED: with no recorder armed it
//    reports zero verified modules and the verdict is STALE, so the thread would
//    bind its sockets and then answer nothing at all. Read `stale-code.js`
//    before touching a line here.
//
// 🛑 THE ORDER OF THE FOUR STATEMENTS IS THE WHOLE GUARANTEE, exactly as in
//    `http-daemon.js`: take `module` · arm the interception on a bare `Map` ·
//    require the recorder (so it and `stale-code-pure.js` are themselves
//    recorded) · require the body. Inverting any pair leaves either the
//    deciders unverifiable or the map empty.
//
// ⚠️ THE DECLARED RESIDUAL IS THE SAME ONE: this file and `worker_threads` were
//    compiled before any hook could exist. It holds no decision, no state and no
//    I/O, which is exactly why the residual lives here.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const Module = require('module');

const recorded = new Map();
const proto = /** @type {{_compile: Function}} */ (/** @type {unknown} */ (Module.prototype));
const compile = proto._compile;
proto._compile = function _compileRecorded(content, filename) {
  if (typeof content === 'string' && typeof filename === 'string' && !filename.includes('node_modules')) {
    recorded.set(filename, content);
  }
  return compile.call(this, content, filename);
};

require('../stale-code').adopt(recorded);

const { workerData } = require('node:worker_threads');

// 🛑 A ROLE THIS BOOTSTRAP DOES NOT KNOW IS A NAMED REFUSAL, never a thread that
//    starts and does nothing: a silent worker is indistinguishable from a
//    healthy one, and it would hold sockets nobody serves.
if (workerData && workerData.role === 'owner') {
  require('./state-owner-entry').main(workerData);
} else if (workerData && workerData.role === 'server') {
  require('./server-thread');
} else {
  throw new Error(`thread-boot: unknown worker role ${JSON.stringify(workerData && workerData.role)}. `
    + 'A thread that starts without a role would look exactly like a healthy one and serve nothing.');
}
