// ═══════════════════════════════════════════════════════════════════════
// protocol-routes-pure.js — THE FOUR ROUTE NAMES OF OUR WIRE PROTOCOL, ONCE
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE DEFECT THIS EXISTS TO MAKE UNBUILDABLE, AND IT IS THE FOURTH OF ONE
//    CLASS FOUND ON 2026-08-25. The rendezvous was hashed from the code folder,
//    the daemon's PORT lived in two files, its HOST in two more — each time ONE
//    truth held in two places nothing compared. The routes were the same shape:
//    `/purge`, `/turn` and `/emit` were constants in `src/hooks/http-server.js`
//    AND hand-written strings in `ctxroute-reset.js`, `turn-count.js` and
//    `session-inject.js`; `/pretool` was written in `state-client.js` AND as
//    `transport.path` in `wiring.json`.
//
// 🛑 AND A MISSPELT ROUTE DOES NOT 404. The daemon serves the GATE route for any
//    path it does not recognise — deliberately, because that is what keeps an
//    older client byte-identical. So a purge would purge nothing, a turn would
//    go uncounted and a session queue would be answered by the gate, IN SILENCE.
//    That is the exact failure signature of the whole class: nobody errors,
//    nothing is logged, the injection simply stops being what it says it is.
//
// 🛑 THE DAEMON SHELL IS NOT THE OWNER, AND IT MAY NOT BECOME ONE AGAIN. A
//    client reading the route off `http-server.js` would pull a long-lived
//    server's whole module graph — `net`, the store, the watcher — into a hook
//    spawned at every gesture. The owner is therefore a module that knows
//    NOTHING: no `fs`, no `path`, no `process`, no clock. It is imported by the
//    daemon AND by the four client shells AND by `tools/wiring-generate.js`,
//    which writes the gate route into the URL the harness POSTs to.
//
// ⚠️ A FUNCTION, NOT A MODULE-LEVEL OBJECT, AND THAT IS NOT STYLE. A literal
//    evaluated once at module load is a STATIC mutant: the vitest runner keeps
//    its workers alive with modules cached, so Stryker never re-evaluates it and
//    it survives every test that could kill it (MEASURED 2026-08-22 on
//    `wiring-plan.js`'s event list — five of eight names survived). Returned
//    from a call, the literals are evaluated INSIDE the test. Same remedy as
//    `derived-observables.js`. NEVER hoist them back into a `const`.
// ⚠️ A FRESH object per call is also why it needs no `Object.freeze`: no caller
//    holds it long enough to share it, so nobody can mutate a table everyone
//    else reads.

'use strict';

/**
 * The route names of this framework's own wire protocol.
 *
 * ⚠️ `gate` is ALSO the daemon's DEFAULT route — anything it does not recognise
 *    is served by the gate — which is precisely why a typo anywhere else here
 *    fails silently instead of loudly, and why these four names may only ever be
 *    decided in this one place.
 *
 * @returns {{gate: string, purge: string, turn: string, emit: string}} the four routes.
 */
function routes() {
  return {
    // The PreToolUse gate: the frames POST here, and every unknown path lands
    // here too.
    gate: '/pretool',
    // PreCompact: the real context was emptied, so the memory of what was
    // injected before it no longer describes anything.
    purge: '/purge',
    // UserPromptSubmit: the counter a `driftUnit: "turn"` document reads.
    turn: '/turn',
    // SessionStart: the emission queue the session gate shares with the gate.
    emit: '/emit',
  };
}

module.exports = { routes };
