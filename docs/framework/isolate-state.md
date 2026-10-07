---
rules: [{"pattern":"isolate-state.setup.mjs","scope":["ctxroute"]},{"pattern":"isolate-state.test.js","scope":["ctxroute"]},{"pattern":"vitest.config.mjs","scope":["ctxroute"]},{"pattern":"vitest.heavy.config.mjs","scope":["ctxroute"]},{"pattern":"vitest.stryker.config.mjs","scope":["ctxroute"]}]
mode: smart
threshold: 40
---
# isolate-state — the suite never writes the operator's journals (2026-10-04)

🔴 **Born of a measured leak**: since the journals record every failure the runtime survives, suites that PROVOKE failures wrote 5 fake lines into the LIVE `ctxroute-daemon.log` / `ctxroute-hooks.log`, and a restore of the form `process.env.X = previous` (with `previous` undefined) created a stray `undefined/` directory carrying a home path — caught by the anti-leak gate at commit time.
🔑 **`test/isolate-state.setup.mjs` is the `setupFiles` of EVERY vitest config**: a test file that sets no `CTXROUTE_STATE_DIR` gets a tmpdir of its own (children inherit it), removed at worker exit. A file that sets or deletes the variable keeps its own choice.
🛑 **IF you add a vitest config, you MUST list the setup in it** — `isolate-state.test.js` reddens otherwise. 🛑 **IF you restore an env var, `delete` it when the saved value is `undefined`**: assigning `undefined` writes the STRING "undefined".
