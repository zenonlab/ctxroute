---
match: [harness-conformance.js, harness-conformance.test.js, HARNESS-CONTRACT.md]
scope: [ctxroute]
mode: smart
rank: 512
---
# harness-conformance.js — the harness CONFORMANCE TEST (㊾, 2026-08-15)

🛑 **A port is PROVEN at the adopter's, never at ours**: `node doctor.js --harness <payload.json>` on a REAL payload captured from THEIR harness ⇒ verdict `supported`/`degraded`/`incompatible` — each degradation NAMED with its consequence, never a binary yes/no. The published contract = `docs/framework/HARNESS-CONTRACT.md` (English — the adopter READS it).
⚠️ **HONEST SCOPE, written in the report**: a payload proves the PRESENCE of the fields, never that the injected context is CONSUMED by the model — only the canary sees that, in real use. Never sell this script for more.
⚠️ **Key diagnosis (tail of 51)**: any key UNKNOWN to the profile whose value has the SHAPE of a path is NAMED as a `pathKeys` candidate — a DIAGNOSTIC is allowed to suggest, a TRIGGER never to guess. The ㊽/51 boundary stays intact: the adopter decides, the engine adds nothing on its own.
⚠️ **REQUIRED = tool_name + tool_input** (missing/invalid payload ⇒ a verdict, never a throw — a diagnostic that crashes = a false engine verdict) · **OPTIONAL** = session_id/cwd/transcript_path/agent_id, each with its written degradation. Adding a capability = an entry in THESE lists + its test, never a condition somewhere else.
⚠️ PURE, mutated (mutate + Stryker include + dep-cruiser includeOnly, done 2026-08-15). The I/O shell = the `--harness` block of doctor.js (early exit BEFORE the probes: a --harness does not pay for 9 probes).
