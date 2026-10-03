---
rules: [{"pattern":"settled-decisions.json","scope":["ctxroute"]},{"pattern":"settled-decision-gate.test.js","scope":["ctxroute"]}]
mode: smart
threshold: 30
---
# settled-decisions.json / settled-decision-gate.test.js — a settled decision stays written

🔴 **WHY IT EXISTS (2026-09-24)**: operator decisions live as PROSE in the skill and the injectable docs, and prose guards nothing — an agent editing a file can drop or soften the sentence, and the next agent reopens a question that cost nights to close. Born of the `read ECONNRESET` hunt, closed for good that day.
🔑 **DATA, NOT CODE**: one row = (decision, file, marker). The gate reddens when a marker is missing or reworded in its file. A new settled decision is ONE more row, never a new test.
🛑 **IF you change a sentence a row points to, you MUST change the row in the SAME commit** — and only because the operator changed the decision. Rewording "for style" is changing the decision.
🛑 **NEVER delete a row to turn the gate green.** Deleting a row IS reopening the decision: that is the operator's call, never an agent's, and it must be visible in the diff.
⚠️ A marker is at least 20 characters (a short one matches by accident) and is compared VERBATIM, line endings normalised. Anti-vacuity: an empty table is red.
