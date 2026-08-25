---
match: [protocol-routes-pure.js, protocol-routes-pure.test.js]
mode: dumb
---
# protocol-routes-pure.js — the four route names of our protocol, ONE owner

🔴 **THE FOURTH DEFECT OF THE ADDRESS FAMILY, CLOSED 2026-08-25.** `/purge`, `/turn`, `/emit` were constants of `src/hooks/http-server.js` AND hand-written strings in `ctxroute-reset.js`, `turn-count.js`, `session-inject.js`; `/pretool` was written in `src/hooks/state-client.js` AND as `transport.path` in `wiring.json`. Same shape as the rendezvous, the port and the host — one truth in two places, compared by nothing.
🛑 **A MISSPELT ROUTE DOES NOT 404, AND THAT IS THE WHOLE POINT.** The daemon serves the GATE route for any path it does not recognise — deliberately, so an older client stays byte-identical — so a divergence is ANSWERED: a purge purges nothing, a turn goes uncounted, a session queue is served by the gate. In silence, with nothing red.
🛑 **A CLIENT NEVER READS A ROUTE OFF `http-server.js`**: that would pull a long-lived server's module graph (`net`, the store, the watcher) into a hook spawned at every gesture. The owner knows NOTHING — no `fs`, no `path`, no `process`.
🛑 **NO LOCAL ALIAS PER ROUTE** (`const ROUTE_PURGE = ROUTES.purge`): it reads well and it is exactly the shape `rendezvous-address-gate` hunts for, a name that looks like the owner of an address. Read the table where it is used.
⚠️ **A FUNCTION, NOT A MODULE-LEVEL OBJECT**: a literal evaluated at load is a STATIC mutant the perTest runner can never kill. A fresh table per call is also why it needs no `Object.freeze`.
⚠️ **THE WIRING READS IT TOO**: `tools/wiring-generate.js` passes the gate route to `plan()` as a MACHINE FACT, exactly as it passes `paths.httpEndpoint()`. An endpoint or a route re-declared in `wiring.json`'s `transport` is a NAMED REFUSAL.
⚠️ **THE QUERY IS OURS**: `?frame=k&frames=N` is appended to the gate route. A route carrying its own query would put two `?` in one URL — coordinates nobody can read back.
