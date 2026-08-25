#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// THE DAEMON ENTRY POINT — six lines of interception, then the real server.
// ═══════════════════════════════════════════════════════════════════════
//
// 🛑 THIS FILE HAS NO SEMANTICS AND MUST NEVER GAIN ANY. It exists so that the
//    freshness baseline can be the bytes Node ACTUALLY COMPILED rather than a
//    re-read. Re-reading the sources at startup would open a window in which the
//    baseline records the NEW bytes while the OLD code runs — the daemon would
//    then serve stale logic and compare itself clean for ever. A GREEN THAT
//    LIES, built on purpose. Read `stale-code.js` before touching a line here.
//
// ⚠️ THE ONE DECLARED RESIDUAL, stated rather than hidden: this file is the only
//    module nobody vouches for. Node compiled it before any hook could exist, so
//    a change made in the microseconds between that compilation and the first
//    statement below would go unseen. It is a file with no decisions, no state
//    and no I/O — which is exactly why the residual was put HERE and not on
//    `http-server.js`, the daemon file agents edit ten times a day.
//
// 🛑 THE ORDER OF THE FOUR STATEMENTS IS THE WHOLE GUARANTEE, and every one of
//    them is load-bearing:
//    ① take `module` — a builtin, already resident, nothing of ours;
//    ② arm the interception on a bare `Map`, so it needs none of our code;
//    ③ require the recorder — it and `stale-code-pure.js` are therefore
//      RECORDED, the two modules that decide freshness vouched for like the
//      rest, then hand it the map;
//    ④ require the server and run it. Everything it pulls in, at load time or
//      lazily hours later, is captured by the same hook automatically. That is
//      what makes the verified set DERIVED and not a list.
//    Inverting ② and ③ would leave the deciders unverifiable; inverting ③ and ④
//    would hand over an empty map and the server would refuse to serve.
//
// 🛑 `Module.prototype._compile` AND NOT `_extensions['.js']` — the reason is in
//    `stale-code.js` and it is not interchangeable: `_compile` is handed the
//    exact string about to be compiled, so recording it costs no second read,
//    hence NO WINDOW, and reimplements nothing of Node's loader.
// ⚠️ The filter here is deliberately the crudest possible (`node_modules`): the
//    real rule lives in `stale-code-pure.inScope` and is applied by `adopt`.
//    A bootstrap must have nothing to get wrong.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const Module = require('module');

const recorded = new Map();
// ⚠️ THE CAST IS THE REPO'S USUAL FORM, not a shortcut: `_compile` is Node's
//    internal CommonJS compile step and carries no public type. It is a
//    DOCUMENTED-BY-USE surface, stable since CommonJS existed, and the choice of
//    hooking it rather than `_extensions['.js']` is argued in `stale-code.js`.
const proto = /** @type {{_compile: Function}} */ (/** @type {unknown} */ (Module.prototype));
const compile = proto._compile;
proto._compile = function _compileRecorded(content, filename) {
  if (typeof content === 'string' && typeof filename === 'string' && !filename.includes('node_modules')) {
    recorded.set(filename, content);
  }
  return compile.call(this, content, filename);
};

require('../stale-code').adopt(recorded);

require('./http-server').main();
