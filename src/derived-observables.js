'use strict';
// ═══════════════════════════════════════════════════════════════════════
// derived-observables.js — THE FACTS WE DERIVE, AS A REGISTRY
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT AN OBSERVABLE IS. The language decides on FACTS about a gesture. Most are handed
//    over by the harness and their names are its dialect (`harness-profile.js`). A few we
//    DERIVE ourselves from what it hands over: no harness ever sends "the directory this
//    command designates" — we read it out of the command. **The universe is therefore the
//    harness's facts ∪ our derivations**, which is why it is strictly larger than anything a
//    harness delivers, and why it is DECLARED rather than discovered.
//
// 🛑 WHY A REGISTRY AND NOT ONE FIELD PER FACT (2026-08-20, evening). The two derivations
//    below were first written as two hard-coded profile fields, and the engine immediately
//    grew TWO near-identical branches — one per fact. A third fact would have added a third
//    branch, in the engine AND in the independent model AND in every judge. That is the
//    definition of a TOOL, and this project's founding line says the opposite: **"the engine
//    must not move when a need appears — if it moves, we shipped a tool."** Same patron as
//    `source-adapters.js`: an entry carries its name and its behaviour, the consumers LOOP.
//    ⇒ **Adding a derived observable = ONE entry here.** Zero engine line, zero judge edited:
//    the reach table and the spec model both derive their rows from this list.
//
// ⚠️ "DERIVE" HAS A BOUND, AND IT IS NOT COSMETIC: we derive MECHANICALLY, we never GUESS.
//    Reading the `cd` of a command assumes nothing — it reads. Guessing that a parameter
//    NAMED `path` designates a path was RULED OUT (㊽): an anglophone convention would be
//    silently blind to a server exposing `dateipfad`, and a heuristic in the TRIGGER — the
//    only operator that CREATES an injection — is the first thing an auditor attacks.
//
// ⚠️ `from` NAMES THE KEY FAMILY A DERIVATION READS, and the trigger reads it WHOLE, never
//    narrowed by `keys`. Deliberate and measured: an entry that drops the raw `command` must
//    KEEP seeing where the command works, otherwise the operator loses 47.7 % of real work
//    (28,703 actions). Narrowing a derivation's INPUT would silently re-merge the very facts
//    this file exists to separate.
// ═══════════════════════════════════════════════════════════════════════

// ⚠️ ONE regex for BOTH derivations: they read the SAME `cd`, and two copies of a pattern are
//    two ways to drift apart. Its limits (no pushd, no subshell, no double cd) are INHERITED
//    as is — widening them would make the exhaustive differential diverge on a question
//    nobody asked. Change it only with that differential replayed.
const CD_RE = /\bcd\s+["']?([^\s"'&;]+)["']?\s*(?:&&|;)/;

// ① The directory a shell command DESIGNATES — "I WORK here".
// ⚠️ Returns [] when the command designates nothing — a rule reading ONLY this observable
//    then bites on nothing, which is the honest answer. NEVER fall back on the raw text:
//    that fallback silently re-merges the two facts, which is the defect itself.
function commandCwdCandidates(command) {
  const cdMatch = command.match(CD_RE);
  return cdMatch ? [cdMatch[1]] : [];
}

// ② The paths RECONSTRUCTED by gluing that directory to each following word — "this relative
//    file". It exists so a pattern can match a file of the project without anyone typing an
//    absolute path.
// 🔴 WHY IT IS ITS OWN FACT SINCE 2026-08-20 — the 10th defect of the same family, and the
//    first one a HUMAN caught by watching what got injected. The gluing is word by word, so a
//    project name merely QUOTED after a `cd` — in a commit message, a heredoc, an argument —
//    becomes a plausible path OF that project and TRIGGERS its skill.
//    `keys: {match:["-command"]}` shuts the raw text and this reconstruction reopens the
//    window: **the guard closes the door, the `cd` opens the window.**
// 📐 MEASURED ON THE REAL CORPUS: 13,910 shell actions, **6,336 carrying a `cd` (46 %),
//    402,734 fabricated paths, up to 1,740 for a SINGLE command** — and one of them delivered
//    a FOREIGN project's entire 90 KB skill into an unrelated session, evicting from the frame
//    budget the knowledge that session actually needed. Price of dropping it, measured over
//    8,000 real actions: **20 injections out of 5,978 (0.33 %)**, concentrated on one doc that
//    legitimately matches a relative path.
// 🛑 REMOVING THE RECONSTRUCTION WAS PROPOSED AND REFUSED (maintainer, 2026-08-20): it serves
//    the awkward cases, and dropping a capability to close a case is a REGRESSION. We CUT IN
//    TWO, we never REMOVE — "we never ship one grain less than the grammar allows".
// ⚠️ A command carrying a `cd` ALWAYS yields at least one glued candidate (splitting an empty
//    tail still yields one element) ⇒ every pattern satisfied by the bare directory is also
//    satisfied by `directory/…`. **That is what makes declaring ① decision-neutral by
//    default**, and it is PROVEN by the exhaustive differential, never assumed.
function commandPathCandidates(command) {
  const cdMatch = command.match(CD_RE);
  if (!cdMatch) return [];
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT mutant, PROVEN — a junk candidate is
  //   never a SUBSTRING match of any pattern, so it can neither bite nor enter `mordants`,
  //   hence it changes no decision and no exclusion universe.
  const out = [];
  const afterCd = command.split(/&&|;/).slice(1).join(' ');
  for (const w of afterCd.trim().split(/\s+/)) out.push(cdMatch[1] + '/' + w);
  return out;
}

// 🛑 THE REGISTRY. `name` is what `keys` addresses, `from` is the key family the derivation
//    reads, `derive` is the derivation itself. ORDER IS PART OF THE CONTRACT: it fixes the
//    order of the candidates, hence the `mordants` an `exclude` sees — reordering is a
//    behaviour change and must be replayed against the differential.
// ⚠️ `temoin` IS MANDATORY, and it is what makes the judges DERIVED instead of hand-written.
//    A capability without a witness is REFUSED here exactly as in `layers.json`: the reach
//    table builds its cells from the two strings it RETURNS — a gesture that produces the fact,
//    and a pattern that only this fact makes matchable ONCE THE OTHERS ARE DROPPED (the isolating
//    declaration is DERIVED from the registry, never listed by hand).
//    ⇒ A new entry lands in the reach table by itself and stays RED until it is proven both
//    REACHABLE and DROPPABLE. Forgetting the witness is impossible: the table asserts it.
// ⚠️ IT IS A THUNK, NOT AN OBJECT, and that is not style: a literal evaluated at MODULE level
//    is a STATIC mutant — the vitest runner keeps its workers alive with modules cached, so
//    Stryker cannot attribute it to any test and it survives forever. Measured here: 2 false
//    survivors, 92.86 % on a file whose logic was fully covered. Fixture = thunk, always.
// 🛑 THE WITNESS IS A REAL FORM, never a textbook one — same rule as the layers table, where
//    an invented shape let three green gates measure nothing.
const DERIVED_OBSERVABLES = [
  {
    name: 'commandCwd',
    from: 'commandKeys',
    derive: commandCwdCandidates,
    witness: () => ({ command: 'cd /w/@@ && ls -la', pattern: '/w/@@' }),
  },
  {
    name: 'commandPaths',
    from: 'commandKeys',
    derive: commandPathCandidates,
    // ⚠️ The pattern carries a SEGMENT the reconstruction alone can build (`dir/word`): the bare
    //    directory is a SUBSTRING of every glued path, so a witness taken on the directory
    //    would be satisfied by the other fact and the cell would measure nothing.
    witness: () => ({ command: 'cd /w/@@ && ls', pattern: '/w/@@/ls' }),
  },
];

// The addressable names, DERIVED — never a second list written by hand (class ㊽: a list only
// knows the past, and every hand-written list in this repo has eventually diverged).
const DERIVED_NAMES = DERIVED_OBSERVABLES.map((o) => o.name);

// Every derived candidate of one command, in registry order.
// ⚠️ Consumed by `bashCandidates` (the public probe) so the ∀¬ of `exclude` keeps seeing the
//    WHOLE universe: a filter that stopped seeing a value would be a negation weakened in
//    silence, which is ㊼ all over again. Only the TRIGGER composes the facts per rule.
function derivedCandidates(command) {
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT mutant, same proof as above.
  const out = [];
  for (const o of DERIVED_OBSERVABLES) out.push(...o.derive(command));
  return out;
}

module.exports = {
  DERIVED_OBSERVABLES,
  DERIVED_NAMES,
  derivedCandidates,
  commandCwdCandidates,
  commandPathCandidates,
};
