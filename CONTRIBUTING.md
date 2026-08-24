# Contributing to ctxroute

Thanks for your interest. This repository holds itself to an unusual standard:
it is written by agents and reviewed by nobody, so **every guarantee is
mechanical** — a rule that lives only in prose does not exist here.

## Ground rules

- **English only** — identifiers, messages, tests, comments, docs.
- **The code is the authority.** `LANGUAGE.md` and the docs carry `AUTO` blocks
  generated from the engine's constants (`node tools/language-doc.js --write`);
  a gate fails if they drift. Never edit an `AUTO` block by hand, and never
  state an enumerable fact in prose.
- **Every change ships with its proof in the same commit**: tests for all
  code, Stryker mutation on the pure modules (per-file floor: 100%, ratchet
  never lowered), and a mechanical gate for any new invariant.
- **Layers are enforced** (`layers.json`): pure modules decide and do no I/O;
  shared cores orchestrate but never exit or print; shells alone speak a
  harness dialect. `shell: true` is forbidden everywhere.
- **Porting to a new harness never touches the engine** — read
  `HARNESS-CONTRACT.md` and `src/harness-profile.js`.

## Workflow

1. `npm ci`
2. While working: `npm run t -- <file>` (suites covering that file) or `npm test` (fast lane).
3. Before submitting: `npm run check:all` (full suite + mutation + types + coupling + lint).
4. Structural change (add/delete/rename a file)? Update `FILE-MAP.md` in the same commit — a file outside that list is a hole by definition.

## What gets rejected

- A gate weakened, a threshold lowered, or an exemption added to silence a red.
- A heuristic where a decidable rule is possible.
- A new vocabulary word whose semantics an existing key already covers.
- Any personal data in tracked files (a pre-commit gate blocks it).
