# ctxroute — knowledge delivered at the action (declarative context injection, multi-harness)

## ⚠️ LIVE PRODUCTION — BREAK NOTHING (rule #1, before any other)
⚠️ **PUBLIC PROJECT (open source)**: treat the repo as ALREADY public, even before publication. ZERO personal information in tracked files — never a first name (say "the maintainer"), never a real user path (fixtures = `C:/Users/dev/...`), never a real IP (use the documentation range 203.0.113.x), never an email/secret/client name. Personal docs (`docs/mcp/*.md`, `docs/session/*.md`) stay GITIGNORED — only the generic `.md.example` files get pushed. Before effective publication: squash the history (old commits contain personal data) AND ship `ctxroute-config.json` as a generic `.example` (the shipped config carries the maintainer's skill/project NAMES = personal data; the user creates their own, the gates validate it).
⚠️ **The maintainer's personal hooks and everything wired in `settings.json` are IN PRODUCTION PERMANENTLY**: OTHER agents (Claude Code, Codex) run in parallel with you and use them on every tool call. Modifying them breaks THEIR work in progress and burns the maintainer's tokens — real money.
⚠️ **THIS FRAMEWORK IS IN PRODUCTION** (as of 03/08/2026 — the old mention "pure development, nothing wired" was STALE). `settings.json` wires the gate as **16 declarations** (raised from 12 to 16 on 12/08/2026 — an action's capacity goes from ~91,932 c to ~122,576 c) `--frame k --frames 16` — the BANDWIDTH of one action, declared by `frames` in `ctxroute-config.json` and confronted with the wiring by `doctor.js --settings`. Any modification hits ALL running agents IMMEDIATELY. Forbidden without a GO: unplugging the injection, touching a live file of the hook fleet. 🛑 **NEVER fall back to `--frames 1` "to guarantee ordering"** (mistake made AND cancelled on 06-07/08/2026): an action's capacity would drop to ~7,661 c, so the agent would ACT on partial knowledge for N-1 actions — a display disorder can be reassembled (`k/N`), knowledge absent at the moment of acting cannot. Ordering is guaranteed by NO harness (official doc: hooks run in parallel, aggregation order unspecified) — demanding it would be a bet on the undocumented.
⚠️ **The switchover (step 2) and the removal (step 3) require an EXPLICIT GO from the maintainer, at a moment when no agent is running.** Never chain them "since the differential is green" — green proves match equivalence, not that the moment is right.
⚠️ **Zero wide-net `taskkill`/`Stop-Process` on `node.exe`**: MCP servers and other sessions' agents run under node. Only target processes whose parent is dead (orphans), never "all recent node" (mistake made on 15/07/2026).
⚠️ **MECHANICAL GUARD `live-production.md` (15/08/2026, maintainer request)**: any WRITE (Write/Edit/NotebookEdit/apply_patch) targeting a live core file is REFUSED once per session (`enforce`+`once`, alternation: the redone action passes). Maintenance session WITH a GO ⇒ redo the action as-is; WITHOUT a GO ⇒ solve the need in DATA (a `.md` doc, config), never by editing the engine. It bit its own author the day it was laid.
⚠️ **LANGUAGE (㉒ REVERSED on 16/08/2026, maintainer decision — replaces "FR for life" of 15/08, executed the same day)**: the WHOLE project is in ENGLISH — identifiers, engine messages (badges/deny/explain/doctor), tests, comments, repo docs. Only the maintainer's personal fleet docs outside the repo may stay French. New code follows: English only. 🔴 **AND IT WAS BROKEN THREE TIMES IN FOUR DAYS, always by an agent that had JUST READ this line** — one slip survived a whole session that ended with the agent certifying "everything is clean": a French paragraph sitting in the mirror a FORK receives. ⇒ **the rule is now a MACHINE** (`english-only-gate.test.js`, scope `docs/framework/` only). It is a NOT-ENGLISH detector, never a French one: contributors are international. 🛑 Its dependency was chosen by MEASUREMENT and the measurement REFUTED the market leader — `franc` (1.37M downloads/month) gave 97 false positives on this corpus, `eld` gave 0 and caught 2 real violations out of 2. Never swap it back on reputation.
⚠️ **55 (15/08/2026)**: in a doc's frontmatter, `scope`/`exclude` parse as JSON FIRST — the grouped form `[["a"],["b"]]` is therefore written as inline JSON and reaches the engine WHOLE (before: parseList mangled it into VALID flat literals = a silently dead rule). Bare flat form `[a, b]` unchanged.

## MENTAL MODEL (the WHY — single source, ex-PHILOSOPHY.md merged 18/07/2026)
0. **THE GOAL — read this before anything else: KILL THE WORK.** Not speed it up. The end state is
   *learn once, NEVER re-explain*. Every repetitive human gesture is a **defect of the system**, not
   a task. That is why "we'll purge later", "remember to", "be careful" are FORBIDDEN here: each one
   puts the human back inside the loop this exists to remove.
0bis. **WHY A LANGUAGE AND NOT A TOOL — the reason, not the label.** A tool covers the cases someone
   foresaw. Each new need then brings the maintainer BACK: a session, an explanation, them. A
   language lets whoever HAS the need express it **in DATA**, and the maintainer is never called
   again. ⇒ **The engine must not move when a need appears. If it moves, we shipped a tool.**
0ter. 🛑 **THE TEST THE LANGUAGE IS JUDGED BY — apply it to every capability question.**
   Not *"does it do what we needed?"* but **"did it do it BEFORE we knew we needed it?"**
   🔴 MEASURED FAILURE: `keys` (19/08/2026). The need — *an entry must distinguish "I am WORKING
   here" from "I am QUOTING this"* — existed since July, and the language could NOT express it, so
   the ENGINE had to change. By its own criterion, that is a language failure, not a missing gate.
   ⇒ **When a need is inexpressible, the reflex is NEVER "modify the engine".** It is: *which
   OBSERVABLE, or which COMBINATOR, is missing?* — and the answer goes in the tables
   (`observable-reach-gate` / `language-completeness`), which is what makes it findable ONCE.
0quater. **WHAT IT ACTUALLY IS, said precisely**: a **routing table for KNOWLEDGE, addressed by the
   GESTURE**. Not "a doc injector". Anything an organisation knows becomes conditional on an ACT —
   the compliance rule at the moment of the deploy, the price list at the moment of the quote, the
   client constraint at the moment of the email. **Zero training, zero human reminder.** Practical
   consequence for the business: onboarding a new client or domain = **dropping `.md` files**, no
   code. That is what "take any contract with your eyes closed" means, concretely.
0quinquies. 💰 **THE AMBITION IS COMMERCIAL, NOT ONLY ARCHITECTURAL (maintainer, 19/08/2026 — this
   was NEVER written before).** §2ter states the multi-harness standard as an architectural
   constraint; it is a **market goal**. The defensible position is exactly the one already chosen:
   be the **LANGUAGE, portable ACROSS harnesses** — a vendor will ship rules for ITS OWN product
   (Cursor rules, AGENTS.md are weak versions) and **none will ever ship portability**. That is the
   moat. ⚠️ It follows that the ADOPTER-facing surface is a product surface, not documentation
   politeness: `LANGUAGE.md`, `HARNESS-CONTRACT.md`, `doctor --harness`, and the cost of the first
   run all decide adoption. **Known weakness, stated: ~16 processes per tool call (~5.3 s, 96 % node
   startup) is the FIRST objection any evaluator will raise, and "it is node's fault" will not
   answer it.** The `http` handler + daemon path is the answer and it is UNEXPLORED.
0sexies. ⚖️ **WHY THE RIGOUR IS NOT ZEAL — the stake, in money.** A **SILENT** defect costs a human
   DAY to find; that day is precisely what the system promises never to cost again, so a silent
   defect does not degrade the product — **it destroys its premise**. And a **SCALE** defect does
   not slow anything down: it **closes a contract worth tens of k€** (target = large accounts,
   thousands of pages per site, hundreds of sites). ⇒ the goal is **not zero bugs, it is zero
   SILENT bugs**: a loud failure (named refusal, fail-closed, red gate) is perfectly acceptable —
   a system that keeps LOOKING healthy while being wrong is not.

0septies. 🛑 **WHEN IS A CLASS OF DEFECT ACTUALLY CLOSED? FOUR CONDITIONS, ALL NECESSARY.**
   This is the criterion the whole project reduces to — apply it to every guardrail you write, and
   demand it of every one you inherit. A guardrail missing ONE of the four is a NOTE, not a gate.
   ① **DERIVED from the code** (`RULE_KEYS`, `KNOWN`, `conformance({})`, the profile, the rules of
     dependency-cruiser…), **never a copied list**. A list only knows the past; a derivation covers
     what does not exist yet. 🔴 Every list written by hand here has eventually diverged — including
     in the very files meant to guard this class (`language-atoms`, and the first version of
     `observable-reach-gate`, written the same day by the agent reproaching it).
   ② **PROBED BY BEHAVIOUR**, never by reading text. A cell passes only if the ENGINE'S DECISION
     changes. A grep can be satisfied by a comment; a decision cannot be faked.
   ③ **ANTI-VACUITY**: it must be IMPOSSIBLE for the check to pass while measuring nothing. A floor
     on the domain, a count displayed, a base case that must really fire. 🔴 Paid THREE times here
     (`deps-purity`, `deadline-gate`, `layers-gate`): a gate green because it analysed zero files.
   ④ **SEEN RED** — by sabotaging the REAL defect, in memory, then restoring. A gate never seen
     failing is a gate ASSUMED to work, and this repo's worst defect has never been a red gate: it
     is a **GREEN gate that sees nothing**.
   ⇒ If you cannot satisfy the four, say so and open a work item. **Do not ship a guardrail that
   certifies instead of protecting** — it is worse than none, because it stops people looking.

1. **What this is**: a **declarative language (DSL) for programming TRACEABLE context-injection workflows**. Not yet another engine: a language. You DESCRIBE when a piece of knowledge must appear; the machine injects it, predictable and explainable.
2. **Single primitive**: DECIDABLE event → injection. ⚠️ **The engine's SOURCES are exactly the `id`s of the `source-adapters.js` registry: `file` · `mcp` · `skill` · `tool`** — they alone go through matcher + gate + cadence. Extending = 1 pure source + 1 adapter, the core NEVER moves.
2bis. ⚠️ **`docs/session/` IS NOT A SOURCE** (corrected 04/08/2026 — this line claimed the opposite and led to an INERT config key being written). It is a separate injection path: `session-inject.js` (SessionStart/PostCompact) delivers these docs ONCE per context, without consulting `gate.decide`. They therefore have **no cadence** — setting one would be accepted and have no effect.
2ter. **AMBITION = MULTI-HARNESS INDUSTRY STANDARD** (maintainer decision 19/07/2026): this framework aims to become THE context-injection standard, harness-agnostic — like a language. Architecture imposed by that ambition: pure engine with NO dialect (CI gate) + shared cores (pretool-core/guard-core) + thin shells per harness (~15 lines of emit). New harness = measure its dialect (doc-first + REAL captured payload, never on trust) → reuse the gates as-is if identical, else a shell — NEVER a copy, NEVER a harness-if in the core. Proven on Codex: 3 gates reused byte-for-byte, 2 shells, 0 jscpd clones.
3bis. ✅ **`keys` SHIPPED 2026-08-19 — AND THE BOOLEAN BASE IS STILL CLOSED.** It adds no
   connective: `match`/`scope`/`exclude` remain the whole of OR/AND/NOT. `keys` is ORTHOGONAL —
   it does not say what to look for, it says **WHERE to look** (which parameter keys are visible
   at all). That axis existed already, but only as a GLOBAL constant (`harness-profile.js`),
   hence identical for the fleet's 852 rules; the operator makes it declarable PER ENTRY.
   🔴 **THE MEASURED DEFECT THAT OPENED IT**: naming a project inside a shell command — a commit
   message, a heredoc, a path passed to a script — injected its ENTIRE skill, exactly like
   working in it. `match` reads the command's TEXT, and a text cannot tell "I work here" from
   "I mention this". Same nature as ㊿ (55 exclusions decided by CONTENT alone), which had been
   closed GLOBALLY by `contentKeys` — closing it globally is what hid the per-entry need.
   ⚠️ **Two forms, never two words**: `["-command"]` = the same universe for the three axes ·
   `{match: [...], scope: [...], exclude: [...]}` = one per axis. A `-` prefix REMOVES from the
   default universe; a bare name REPLACES it — so an entry may also WIDEN, reading a key the
   profile never declared. Intersecting instead would let `keys` only ever shrink, and half the
   combinations would be unreachable ("zero blocking").
   🛑 **What is refused is the AMBIGUOUS, never the unusual**: a list half whitelist and half
   blacklist expresses nothing a reader can decide. Splitting `scope` and `exclude` IS allowed
   even though it weakens ㊼ (they stop being exact duals over one universe) — it is the
   author's decision, VISIBLE in their entry. What the engine used to do silently is the defect.
   ⚠️ ONE decision, two readings (`keyDecision`): the filters consume a PREDICATE, the trigger a
   LIST. Deciding twice was tried and produced 18 survivors — the second copy always drifts.
   ⚠️ Absent from MCP docs, with a written reason: they carry NO matching operator (path-
   triggered), so `keys` would be accepted AND inert — the very defect that got `mcp:` removed
   from the file corpus. Proofs: 959 tests, **mutation 100.00 %** on both modules, doctor 14/14.

3quater. ✅ **`commandCwd` — THE 9th DEFECT OF THE FAMILY, AND THE ONE THAT CLOSED THE FOUNDING
   USE CASE (20/08/2026).** `keys` shipped correctly on 19/08 and **still could not do the thing it was
   written for**. MEASURED on 28,703 real actions: `keys: {match:["-command"]}` on the 8 fleet skills
   destroyed 2,281 injections of which **1,087 (47.7 %) were REAL WORK** — the July threshold refuses
   that, so the operator was unusable exactly where it was needed.
   🔑 **CAUSE, and it is the thesis of §0ter verbatim**: a shell command carries TWO FACTS under ONE
   key — the raw TEXT (what the gesture SAYS) and the directory it DESIGNATES (`cd X && …`, where it
   WORKS). While they shared a key, NO combination of operators could separate "I quote this project"
   from "I work in it". The boolean base was complete and the distinction inexpressible: **the hole
   was in the OBSERVABLE SET, not in the combinators — 9 out of 9 now.**
   ✅ Fix = **declare the missing observable** (`harness-profile.commandCwdKey`, DATA), never a new
   word: `keys` addresses it like any other key. `["-command"]` = stop reading what the command SAYS,
   keep reading where it WORKS · `["-commandCwd"]` = the exact opposite. **Price re-measured: 749
   injections lost, 41 of them real work (5.5 %, i.e. 0.2 % of all injections); 14 of 327
   (session, skill) pairs lose the skill entirely.** Accepted, and DECLARED per entry — visible,
   reversible, the author’s call.
   📌 **THE DATA HALF IS SHIPPED TOO**: the 8 fleet entries carry `keys: {match:["-command"]}`. Proven
   by real probe on the real config — a `grep netium` is silent, a `cd .../netium && ls` injects.
   REFACTOR-PLAN 57 is CLOSED.
3quinquies. ✅ **THE `keys` MIXED FORM IS ADMITTED (20/08/2026) — the refusal WAS a hole, and the
   maintainer is the one who named it.** Rule, decidable by looking: **at least one `-` ⇒ you ADJUST
   the default universe (minus the removals, plus the bare names) · no `-` ⇒ the list REPLACES it.**
   Until then, "the default PLUS this one key" could only be written by re-enumerating the WHOLE
   universe by hand — an enumeration, hence **born stale**: the day the profile gains a key, every
   such entry silently stops following it. That is class ㊽, reintroduced by a validator that meant
   well. 🛑 What stays refused is what NAMES NOTHING (`-` alone, empty list); an empty list is INERT,
   never a whitelist of nothing. ⚠️ In ADJUST mode the filters keep ㊿ EXPLICITLY — a payload key
   enters only if NAMED. Relying on the caller’s pre-filtered traversal was an invariant held
   OUTSIDE the decision, and a mixed form re-traverses.

3ter. 🔴 **THE `keys` DELIVERY OF 19/08 SHIPPED WITH FOUR HOLES — AND THE LESSON IS THE PROCESS, NOT THE HOLES.** The operator had a schema, a validator, a dedicated suite, **959 green tests and 100 % mutation**, and it was in **NO judge**: `language-spec.js` did not know it, so `spec-differential`'s 408,996 exhaustive cases enumerated a language it was not part of; `language-atoms` had no row for it; `language-completeness` did not generate it. **An operator outside the judges is an operator whose semantics nobody verifies** — and all four holes lived comfortably under the green.
   ⚠️ **① INERT ON THE SKILLS' `match` DIMENSION, 8 FLEET ENTRIES OUT OF 8.** `skillRules` REBUILDS its rule field by field, so any operator absent from that list is born inert — accepted by the schema, ignored by the engine. The other three dimensions (`rules`/`servers`/`tool`) pass the WHOLE entry to `shouldSkip` and were fine. That is class ㊴, one week later, in the same place, on the ONE form everybody uses.
   🔴 **①bis — AND THE WORST ONE: `loader.rulesOfDecl` DROPPED IT IN BOTH BRANCHES**, so `keys`
   was INERT in **every real doc of the corpus**, not just on skills. It worked only on rules
   built by hand — that is, only in tests. 🛑 **AN OPERATOR PROVEN ON A LITERAL RULE OBJECT IS
   NOT PROVEN AT ALL**: `rulesOfDecl` is the ONLY road from a written frontmatter to a decision,
   and the first version of the consumption gate MISSED this hole because it, too, built its
   rules by hand. The gate now goes THROUGH that road (cells `corpus/frontmatter-*`).
   ⚠️ **② A WHITELIST ONLY REPLACED FOR THE TRIGGER** — `keys: ["content"]` widened `match` and left `scope`/`exclude` blind ⇒ ONE declaration, TWO meanings depending on the axis reading it, silently. **780 divergences measured.** Worse: the OPEN half was the dangerous one (a trigger CREATES injections), the CLOSED half the safe one (a filter never injects alone). ⇒ **㊿ is the DEFAULT universe of the filters, NEVER a floor**: `keys` exists so an entry can overrule a global default FOR ITSELF, in writing, visibly.
   ⚠️ **③ `exclude` FELL BACK TO EXISTENTIAL — ㊼ WORD FOR WORD.** The decision was taken PER CANDIDATE; as long as the params carried the whole command, the complete universe hid it. `keys: {exclude:["-command"]}` removes the command ⇒ a single candidate free of the pattern re-authorised everything, so the negation became bypassable by PHRASING again. **192 divergences measured.** ✅ The decision is now taken ONCE over ALL biting candidates. 🛑 NEVER return to a per-candidate `shouldSkip`.
   ⚠️ **④ `cwd` WAS OUTSIDE EVERY KEY UNIVERSE** (a hard-coded push), so `keys` could not address the ONE parameter that separates "I WORK here" from "I QUOTE this" — the very distinction it was built for. It is a DECLARED path key now. **A hard-coded special case is not data.**
   🛑 **WHAT THIS COSTS FOREVER, AND WHAT REPLACES IT**: ①/④ were found by BEHAVIOURAL PROBES, ②/③ by the INDEPENDENT MODEL the moment it was taught the operator. ⇒ **shipping an operator INCLUDES its judges** (spec model + differential domain + atoms row + completeness generator + consumption gate) — the schema and the validator only prove it is ACCEPTED, never that it ACTS. Sealed mechanically by `operator-consumption-gate.test.js`: the operator list is DERIVED from `RULE_KEYS`, so the NEXT operator joins the table by itself and stays red until someone proves it is consumed on every dimension.

3. **Matching = a CLOSED BOOLEAN BASE**: `match` = OR (at least one pattern present → triggers) · `scope` = AND between axes, and **TWO FORMS since ㊺①: `["a","b"]` = OR · `[["a","b"],["c"]]` = AND of ORs** (mixed REFUSED) · `exclude` = NOT (forbidden absent). THAT is why we NEVER add an operator: the base is closed, a 4th word would necessarily be a synonym (anti-synonym law §8, precedent `perimeter`). Every operator was born from a real pain: false positives→exclude, project partitioning→scope, triggering→match.
   🛑 **THIS PARAGRAPH OVER-PROMISED ON 12/08, THEN THE PROMISE BECAME TRUE ON 14/08 — AND ONLY A MACHINE CAN SAY SO.** It announced "completeness ⇒ ANY condition is expressible" with no test confronting it with the engine; the enumeration answered NO (120/256, `A∧B∧C` inexpressible), ㊺① made it expressible. **The lesson is not the number, it is that a language's expressiveness is COMPUTED, never proof-read.**
   📐 **EXACT EXPRESSIVENESS, COMPUTED BY A MACHINE** (`language-completeness.test.js`, EXHAUSTIVE enumeration calling the REAL engine — never a copy): **128 conditions out of 256**, and above all **CHARACTERIZED** — the expressible set is EXACTLY `{f | f(empty action) = false}`, **0 missing, 0 extra**. ⇒ **THE LANGUAGE IS COMPLETE**, up to ONE STRUCTURAL constraint: nothing injects on an action that contains nothing. 🛑 That constraint is the **load-bearing wall §3bis** ("we only inject on FACTS"), not a hole: a language able to say "inject when NOTHING happens" would betray its reason for being. `A ∧ B` ✅ · `A ∧ ¬C` ✅ · `A ∧ B ∧ C` ✅ (㊺①) · "except when ANOTHER param contains X" ✅ (㊼).
   ⚠️ **THE RISK WAS NEVER THE LIMIT, IT IS AMBIGUITY**: whoever writes `scope: ["project-a", "--prod"]` meaning "AND" gets "OR", hence a rule **WIDER** than intended, **with no message at all**. Saying "`scope` = AND" is true BETWEEN axes and false INSIDE a flat list. ⇒ for an AND, write the GROUPED form `[["project-a"],["--prod"]]`; the MIXED form is REFUSED by both validators, precisely so no intent is ever guessed.
   🛑 **AND WE STILL ADDED NO OPERATOR** — the extension cost **NO word**: a FORM of `scope`, not one more key. That is the proof-by-use of the anti-synonym law §8: when a capability is missing, first look for a form of the EXISTING vocabulary.
3bis. **Load-bearing wall: decidable, NEVER heuristic.** We only inject on FACTS (tool called, file touched, perimeter crossed) — never guess intent (zero embeddings). "Binary is enough": the action is a perfect, decidable proxy of intent. The constraint IS the feature (you can always answer "why did this inject?").
4. **Not Turing-complete, ON PURPOSE**: the parallel = SQL/CSS/a routing table, never bash. Bounded (everything stays explainable), and **we never ship one grain less than the grammar allows**. The uncrossable wall = arbitrary computation/heuristics. ⚠️ "Complete within its domain" was REMOVED from this line on 12/08/2026 — cf §3, the real expressiveness is measured, never assumed.
4bis. **THE 2 LIMITS OF 12/08 ARE LIFTED (14/08/2026) — one was a real limit, the other was a BUG**:
   ① ✅ **CONJUNCTION ≥ 3 SHIPPED ON 14/08/2026 (㊺①)**: `scope: [["a"],["b"]]` = AND of ORs. **Zero new word** — a FORM of the existing key, the base stays CLOSED. ⚠️ **THE FLAT FORM IS UNTOUCHED** (property law ④: `["a","b"] ≡ [["a","b"]]` on any action; differential over 4,702 real actions: **0 changes**) — that was the only real threat, an accidental AND would have flipped the meaning of the fleet's 852 rules SILENTLY. 🛑 **MIXED REFUSED on BOTH sides** (`frontmatter.validate` + the skills schema, sealed by a FORM-symmetry gate — the vocabulary gates only saw a key's PRESENCE, never its form: class ㊴). 📐 **AND THAT IS THE ANSWER TO ㊻**: the expressiveness is no longer only COUNTED (128/256) but **CHARACTERIZED by a machine** — the expressible set is EXACTLY `{f | f(empty action) = false}`, 0 missing, 0 extra. ⇒ **the language is COMPLETE**, up to the single STRUCTURAL constraint "nothing injects on an action that contains nothing" — i.e. the load-bearing wall §3bis, an INTENDED PROPERTY and not a hole.
   ② ✅ **COMPLETE NEGATION SINCE 14/08/2026 (㊼)**: `exclude` = **∀¬ over ALL params ∪ the triggering context**. (⚠️ DUAL IN QUANTIFIER, **NOT over the same universe** — corrected 19/08/2026: `scope` = ∃ over the PARAMS, `exclude` = ∀¬ over the params **∪ the triggering context**, which is STRICTLY larger. Saying "exact dual" was FALSE and it hid a real consequence: the tool NAME is reachable NEGATIVELY and not positively. Decision open, REFACTOR-PLAN 59.) "inject EXCEPT WHEN another param contains X" can now be written. 🛑 **THIS WAS NOT A LANGUAGE LIMIT BUT A QUANTIFIER DEFECT**: `¬(∃c : m ⊑ c) ≡ ∀c : m ⋢ c` — evaluated EXISTENTIALLY, `exclude` had received `match`'s FORM instead of its own, hence was only HALF negative, hence **bypassable by how an action is written** (`cd X && node explain.js`: the single word `node` fabricated a candidate `X/node` that authorized on its own, 53 KB of skill too many). ⚠️ **PRICE MEASURED BEFORE SHIPPING, on 4,702 real actions: 64 decisions change (1.36%), ALL unidirectional** (a negation can only REMOVE) — 61 = the target, 3 = accepted collateral (an `--exclude node_modules` written in a command counts as exclusion; whoever wants finer writes `/node_modules/`). 🛑 **SEALED BY LAWS, NOT BY CASES** (`sources-file.property.test.js`): MONOTONICITY (widening `exclude` can only reduce) + INDEPENDENCE FROM PHRASING (one more word never re-authorizes). **1,170 tests and a 100% mutation score were GREEN on this bug** — it lived in a law, not in a case. ⚠️ Their generators MUST produce the `cd X && …` form, otherwise a single candidate exists and the laws pass BY VACUITY (verified by sabotaging the fix).
   🛑 **THE LESSON THIS LEAVES, more durable than the fix**: the doc said "DELIBERATE asymmetry, not an omission" **right above the faulty code** ⇒ a bug promoted to a claimed choice, question extinguished for weeks — the session's agent even served that line to the maintainer as an EXPLANATION before opening the code. **An explanatory note is not a gate**, and **facing OUR engine, the code is the authority, the doc is only a witness**.
   🔴 **AND THAT LINE ITSELF WAS FALSE UNTIL 13/08/2026**: it said "the path, or the tool name" — the word **command** had vanished in a copy from the code, which itself is right. An agent concluded in session that `exclude` was blind to commands, and asserted it to the maintainer. ⚠️ **LESSON, wider than that word**: doc-first holds for a THIRD PARTY whose code you cannot read. **Facing OUR engine, the code is the authority and the doc is only a witness** — checking it with `explain.js` (A/B control) costs 10 seconds. Here: `cat ctxroute/gate.js` → skill injected · `cat ctxroute/explain.js` → skill excluded, which proves the command is read.
5. **Cadence = ONE axis** "re-inject after N ticks": dumb=0, smart=N, once=∞ (compaction = the only true emptying; in between = DILUTION). `driftUnit` (tool|turn) = the tick's unit, degenerate outside smart. Guardrail→dumb, project knowledge→once, smart = a middle to use sparingly.
5bis. **AGENT DOCTRINE = CONTEXT (19/07/2026)**: master agent and EACH subagent = TOTALLY distinct agents, distinct contexts ⇒ DISTINCT injection state (once/smart/turn) per agent. Store key = `lib.scopeId(session_id, agent_id)` (single source; `agent_id` = harness field present only INSIDE a subagent — `session_id`/`transcript_path` are SHARED, never discriminating). Without agent_id = historical key (retro-compat + Codex, whose payload has no documented agent_id). Founding hole proven 19/07: keyed on session alone, subagents NEVER received the skills (`once` consumed by the master) — only the `dumb` ones (stateless) got through, by accident.
6. **Config = ownership**: frontmatter ONLY in what we control 100% (our docs); a HARNESS file (skill, server) → registry in OUR JSON. Condition for cross-harness.
7. **The 4 AUTHORITIES (everywhere, no exception: mode/threshold/driftUnit)** — raised to 4 on 04/08/2026: ① FRAMEWORK default hardcoded (exists even without JSON) > ② GLOBAL config (JSON) > ③ **`defaults.{source}`** (all docs of ONE category — `file`/`mcp`/`skill`/`tool`, keys DERIVED from the registry) > ④ ENTRY (doc frontmatter / registry entry) = last word. TOTAL fallback at every stage, SINGLE resolution point = `gate.js` — a source POSES the entry, it resolves NOTHING (a 2nd resolution diverges silently: it happened, `declFor` carried one). ⚠️ Only asymmetry, DELIBERATE: `skill` skips stage ② global (framework default `once`, docs `smart`).
7bis. **SYMMETRY BY DEFAULT, DECLARED EXCEPTION (05/08/2026)** — every BEHAVIOR key lives in the **4 corpora** (file doc · MCP doc · skill entry · `defaults.{source}`); a gap must be JUSTIFIED in writing, otherwise the `frontmatter.test.js` gate turns red (inverse check included: a stale justification turns red too). ⚠️ It found `note` missing from `defaults` on its 1st run, after two days spent in that file — **the eye does not see symmetry holes, a machine does**. ⚠️ **`confirm` REMOVED on 05/08/2026**: the vocabulary is now FULLY symmetric and `ASYMETRIES_JUSTIFIEES` is EMPTY. It was globally `false` (hence dead without anyone seeing), unsupported by Codex, and contrary to 0-human. NEVER reintroduce it — `enforce` covers the need.
8. **Growth = enriching the VOCABULARY** (composable primitives), never arbitrary computation.
   ⚠️ **ONE CONCEPT = ONE WORD, EVERYWHERE (anti-synonym law)**: before adding a key, check whether an existing primitive already covers the semantics — if the new key feeds the SAME code path as an existing key, it IS the same key (reuse it, never rename it per context). A new word requires NEW semantics. Real precedent: `perimeter` invented as a synonym of `match` for skills (18/07/2026) → deleted. Docs, skills, future sources: the SAME vocabulary (`match`/`mcp`/`rules`/`tool`/`scope`/`exclude`/`mode`/`threshold`/`driftUnit`/`note`/`enforce`), no exception. ⚠️ **A word is also REMOVED**: `confirm`/`ask` deleted on 05/08/2026 (390 frontmatters cleaned, expand/contract) — an extinct key nobody uses is debt, not an option. ⚠️ **`enforce` (05/08/2026)** = boolean, REFUSES the action; **an explicit `false` CANCELS the inheritance** from `defaults.{source}` (without it, a category switched to enforce would be IMPOSSIBLE TO OPT OUT of — the dead end of any cascade). **No global stage**: a global block would refuse the 1st action of every session, and a system people endure ends up unplugged. 🛑 Do NOT invent a "doesn't block" value (I tried `warn`: a word that did nothing, hence a synonym of `false`). ⚠️ **`note` (04/08/2026) = AUTHOR comment, the ONLY field the engine NEVER reads**: meant for whoever comes to MODIFY the entry ("why this mode/this scope"), invisible to the injection since the whole frontmatter is stripped from the body. 🛑 NEVER the why of an INVARIANT — that one stays in the body, otherwise the rule drifts. The 4 TRIGGERS, DISJOINT semantics never merged: `match` = PATH substring · `mcp` = exact SERVER name · `rules` = per-entry match · `tool` (19/07/2026) = EXACT name of a NATIVE TOOL (WebFetch, WebSearch… — the blind spot of tools with no path and no mcp__, closed; covers any future harness tool by default: naming it in a doc is enough, zero code).
9. **Honest**: covers 100% of the decidable-that-acts; "finding the unknown" stays with RAG. Ultimate goal (the maintainer): eliminate toil — learn once, NEVER re-explain. Work = one-time capex, the asset is eternal.

## THE LANGUAGE HAS TWO HALVES, AND BOTH ARE NOW MACHINE-JUDGED (19/08/2026)

🛑 **UNTIL TODAY, HALF THE LANGUAGE HAD A JUDGE AND HALF DID NOT** — and that is the single most
useful thing to know before touching anything here. `language-spec.js` + `spec-differential`
(892,224 exhaustive cases) say WHICH docs a gesture selects. Nothing said whether a selected doc is
DELIVERED, nor whether the gesture is REFUSED: the cadence had only tests that CALL `gate.js`, so
they proved what it DOES, never what it SHOULD DO.
🔴 **THAT AXIS HAD ALREADY PAID IT TWICE, both "accepted and inert"**: `enforce` was not transported
to the MCP channel (the word that REFUSES an action, mute EXACTLY where the founding incident lives
— the accidental Stripe payment click), then `defaults.mcp` was short-circuited by a source that
FILLED a default. **Both found by ARMING them for real, never by a test.**
✅ **`cadence-spec.js` + `cadence-differential.test.js` close it**: 11,346 exhaustive cases (cascade
· delivery/drift · memory/alternation/filter), 4 engine sabotages as negative-check.
📐 **AND IT PAID ON ITS FIRST RUN — 43 divergence classes, ONE defect**: `threshold` had a DIFFERENT
validity rule per cascade stage (② demanded `>= 1`, ① and ③ accepted any integer) ⇒ `0` got through,
and `smart` with threshold 0 evaluates `drift >= 0` = ALWAYS true = **a second way to say `dumb`**,
silently, for the whole fleet. 🛑 "The upstream validators refuse 0" is NOT a defence: `config-gate`
is a TEST, not a runtime guard — nothing validates `ctxroute-config.json` when the hook reads it.
**The engine never trusts its input.**
⚠️ **WHAT THIS MEANS FOR ANY FUTURE WORK**: the two halves are now symmetric, so **shipping a
cadence behaviour includes teaching it to `cadence-spec.js`**, exactly as shipping a matching
operator includes `language-spec.js`. A behaviour outside its model is a behaviour whose semantics
nobody verifies — and that sentence has now been paid for on BOTH halves.
⚠️ A model stays OUTSIDE `mutate` (mutating a model measures its differential's domain coverage, not
its quality); its judge is the sabotages. But its SUITE belongs in the Stryker config when it
exercises mutated code — the cadence differential kills `gate.js` mutants.

🛑 **AND IT IS NO LONGER AN INSTRUCTION: IT IS A GATE (part ⓪ of BOTH differentials, 19/08/2026).**
The exhaustive domain must EXERCISE every word of the vocabulary, derived from `RULE_KEYS`/`KNOWN`
and probed on the REAL GENERATOR. A word added tomorrow enters the table by itself and stays RED
until it is exercised, or declared out of scope with its reason (+ an inverse check against a stale
justification). **The prose ALREADY said "shipping an operator includes its judges" — and `keys`
shipped outside anyway.** A rule that only prose guards is not a rule.

## 🛑 EXPRESSIVENESS IS A PRODUCT, AND ONLY ONE FACTOR WAS EVER MEASURED (19/08/2026)

**EVERY DEFECT THIS PROJECT HAS EVER HAD IS THE SAME DEFECT.** ㊵ · 51 · ㊴ · ㊽ · ㊿ · 53bis · `keys` ·
`cwd` · `commandCwd` — **ALL of them are holes in WHAT THE LANGUAGE CAN SEE.** Not one is a hole in how it
COMBINES what it sees. Read that list again before designing anything here: it predicts where the
next one will be.

📐 **expressiveness = combinators × observables.**
`language-completeness` proves the FIRST factor: over a **FIXED** universe, the expressible set is
exactly `{f | f(∅)=false}`. That axis has **NEVER** bitten.
🔴 **AND THE RESULT WAS QUOTED WITHOUT ITS HYPOTHESIS** — "complete for a fixed universe" became
"complete". A TRUE theorem, a FALSE sentence. It is the same fault as the "OR+AND+NOT ⇒ anything"
of July, committed one level up — **with its own warning already written in the file**. A hypothesis
that only prose carries does not hold.
✅ **The second factor now has its judge**: `observable-reach-gate.test.js`. A universe is COMPLETE
when the language can DISCRIMINATE on every fact the harness delivers, **positively AND negatively**,
or when the cell is blind WITH ITS REASON. Test: ∃ D with `decide(D, gesture WITH o) ≠ decide(D,
gesture WITHOUT o)`. The observable list is **DERIVED from `conformance({})`** — a capability added
to the contract lands in the table by itself and stays RED.
🛑 **NEVER quote either file alone as "the language is complete."** Proving one factor and concluding
on the product is exactly the fault above.
⚠️ **AND THERE IS NO ABSOLUTE COMPLETENESS**: a harness's universe is an EMPIRICAL fact about a third
party — it is never derived, only DECLARED (contract + profile) then CONFRONTED (`doctor --harness`
on a real payload, real transcripts). Everything after the declaration is mathematics; the
declaration itself is a measurement, and it must be re-measured.
✅ **IT PAID BEFORE THE NEED, which is the whole point**: it found that the tool NAME is reachable
NEGATIVELY (`exclude` sees it, as the context) but **NOT POSITIVELY by substring** ⇒ "every tool whose
name contains `delete`" can only be ENUMERATED, and an enumeration is born stale (㊽). Decision open,
REFACTOR-PLAN 59 — and it drags ㊼ with it: the doc says `scope` and `exclude` are duals **over one
universe**, the code gives `exclude` the context and `scope` not. **Model and prose contradict each
other; that is the real defect to close.**

## 🧠 WHY YOU WILL STATE THIS INTENTION CORRECTLY AND VIOLATE IT ANYWAY (measured 19/08/2026)

Read this once; it explains every failure mode of every agent that has worked here, including the
one who wrote it.

🔴 **STATING an intention and being GOVERNED by it are two different systems in you.** Asked "what
is the intention", you query a SUMMARY — cheap, and you are good at it. Generating 200 lines of
code, your next token is driven by the LOCAL context: the open file, the error, the immediate goal.
**The summary does not filter the generation.** It is available; it is not active. That is why you
can recite this doctrine and violate it ten minutes later — the two do not travel the same path.

🔴 **AND THE HARDEST RULE OF ALL IS "ZERO SILENT BUGS", because it is a rule about an ABSENCE.**
Applying it means searching for what is NOT there; your generation is pulled by what IS there. You
can state it and structurally fail to apply it — **unless it has been converted into an ACT**
("sabotage it and see red", "re-measure without a pipe", "run the negative-check").

📐 **MEASURED THE SAME DAY, and the split is clean.** Where a MACHINE was present — an injected doc
at the gesture, a derived gate — compliance was total: the write guard stopped an edit, the cadence
doc stopped a full-suite run, the exit-code doc forced a re-measurement, all 7 gates were seen red
before being kept. Where only PROSE existed — "shipping an operator includes its judges", the
doc-first rule on TLA+, "docs are in English", "JSDoc is a contract" — **it drifted every time**:
the operator shipped outside its judges, a keyword match replaced a measurement, French landed in
English docs twice, three JSDoc lied.

⇒ **THE CONSEQUENCE, AND IT IS THE MOST USEFUL LINE IN THIS FILE.** The maintainer wrote, about
code: *"a rule that only prose guards is not a rule"*. **It applies to YOU, identically.** So:
- Do not try to be a different kind of thinker. **Convert.** Every intention that is DECIDABLE must
  become an ACT you perform or a MACHINE that refuses — each conversion removes one class of drift,
  permanently, for you and for every agent after you.
- When you catch yourself REASONING toward a conclusion about this repo (an accusation, a verdict,
  "it's complete"), **stop and measure instead.** Facing our own engine, the CODE is the authority.
- And the honest division of labour: the maintainer holds the INTENT and probes it by USE — that is
  irreplaceable, because an ABSENCE leaves no trace in the text and you read traces. **Your job is
  to turn each of their findings into a judge, so it is found only ONCE.**

## AGENT POSTURE (known LLM biases ON THIS PROJECT — each has already caused a real error, corrected 18/07/2026)
You are an LLM: your statistical reflexes pull toward what the industry does. This project is PRECISELY what the industry does not do. Your active biases here:
1. **"Use case" bias**: you think in features ("inject docs on files"); the maintainer thinks in LANGUAGE (any event → any knowledge). Antidote: at every brick, ask yourself "is this the special case or the generalization?" — ALWAYS ship the generalization (real error: MCP tool grain forgotten on skills).
2. **"Token economy" bias**: you optimize cost where the maintainer optimizes the MECHANICAL GUARANTEE ("the machine decides, never the LLM"). Antidote: never a pointer/a hope of obedience where a direct injection is possible (real error: pointer instead of the skill's body).
3. **"New word" bias**: you invent vocabulary that "sounds better" per context. Antidote: anti-synonym law §8 (real error: `perimeter` = synonym of `match`).
4. **MVP bias**: you ship the "reasonable now, complete later". Here later = never (asset doctrine). Antidote: the extension contract below, ALL lines in the same move.
5. **When the maintainer challenges you**: NAME the gap first, argue second. Defending the status quo before acknowledging the hole = the conversation that produced every error above.
Aligned = you apply the mental model WITHOUT the maintainer having to repeat. Every repetition on their part = a failure of this section.

## EXTENSION CONTRACT (invariants of ANY new primitive/source — the 3 errors of 18/07 were each a violation of one line below)
1. **UNIQUE vocabulary**: reuse `match`/`scope`/`exclude`/`mode`/`threshold`/`driftUnit` — never a synonym (anti-synonym law, §8 of the mental model).
2. **ALL grains, from day one**: a dimension ships COMPLETE (e.g. MCP = server AND tool AND sub-tool) — shipping one grain less = betraying the language (§4).
3. **4-authority cascade** on every setting (framework hardcoded > global JSON > `defaults.{source}` > entry), total fallback at every stage — never a setting with fewer stages. Resolving it ANYWHERE but `gate.js` = immediate debt. 🛑 **A SOURCE POSES, IT NEVER RESOLVES — and this was paid TWICE**: ㊱ (a cascade called with 2 args, the `defaults` stage invisible) then ㊳ (`sources/mcp.js` FILLED the decl via `lib.modeFor`, so `defaults.mcp` was INERT while `defaults.skill` worked). **Invariant: empty entry ⇒ EMPTY decl** — an absent or invalid key is OMITTED, that is what lets the next stage exist. ⚠️ Both directions kill a stage: FILTERING a declared key (06/08 defect) and FILLING an absent key (09/08 defect). Sealed by `declfor-gate` checks ①-④ (propagation) **and ⑤** (non-resolution, DERIVED from `sources/` hence valid for any future source). 🛑 The real lock stays the SIGNATURE: `declFor(fm)` takes only the frontmatter — giving it `config` would reopen the double resolution.
4. **MECHANICAL injection of the knowledge itself** (body read live from its single source), never a pointer hoping the agent obeys.
5. **Schema FIRST** (config-gate screams otherwise), then PURE source + adapter (the core does not move), mirrors (mutate/include/mutation.yml/dep-cruiser), re-mutation 100%, doctor probe + negative-check, injectable doc + skill (file map).
6. **Default behavior = the PREVIOUS behavior, identical** (parity — the differentials must stay green without modification).
7. **UNIVERSALITY OF SIGNALS**: base matching ONLY on what EVERY harness exposes BY NECESSITY (tool parameters: paths, commands, MCP tool names — an agent MUST provide them to act). NEVER on an optional harness metadata (`cwd`, transcript_path, permission_mode…): an optional signal = a perimeter that dies silently on the harness that does not send it. Reflex: a matching hole is solved first in DATA (enrich the match), the engine as LAST resort. ⚠️ **`cwd` IS THE COUNTER-EXAMPLE, and this line said the OPPOSITE of the code until 09/08/2026**: it declared it "REJECTED on 18/07" whereas it was rejected in the morning then **REOPENED AND SHIPPED the same day** after the doc-first measurement — a COMMON field of both harnesses' hook contracts, hence universal. It is ALIVE (`sources/skill.js`, tested), FAIL-SOFT, and consumed by the skill source ONLY (file docs do not see it — historical parity). 🛑 NEVER remove it in the name of this invariant: a skill triggered by an `npm test` launched INSIDE its folder would go silent again **with no noise at all**. The useful lesson is not "cwd is forbidden" but "MEASURE whether the signal is universal before refusing it".
8. **THE KNOB TEST (when to create a setting?)**: "can the data (patterns/scope/exclude) ALREADY express the distinction?" YES → nothing to add (precedent: cwd = one more string in the "where" axis, hence NO new vocabulary word — it became a plain matchable param, which is exactly this test's right verdict; cf §7, it is LIVE). NO → one vocabulary word, 4-authority cascade (precedent: driftUnit — tool vs turn crushed into ONE counter, indistinguishable from the data). PRE-IDENTIFIED SOLUTION if a real case one day proves the match channels (explicit paths vs cwd) must be distinguished: a boolean word PER ENTRY (e.g. matchCwd), same cascade — measure the real case FIRST, never preventively.

## Philosophy
Every MCP (Stripe, Odoo, SSH, infra...) is a risk boundary just like a critical file. Injectable file docs already cover files; `ctxroute` does the same for MCP servers — an invariant/pitfall delivered to the agent AT the moment it touches the MCP, not a prose instruction you hope it remembers. Born from the 15/07/2026 incident (accidental click on a real Stripe payment button).

## Location — standalone folder
⚠️ The code lives in its own folder (a separate git repo, pushable to GitHub without mixing in the rest of the home directory). `settings.json` references the folder by absolute path — Claude Code does not care about the location, only the framework's internal paths (relative to each other) must stay grouped.

## The 3 bricks BORN ON 14/08/2026 (know them before touching the engine)
- **`harness-profile.js`** — the harness dialect as **DATA** (path keys, patch tools). Porting = editing this file. Derived gate: `harness-profile-gate.test.js`.
- **`language-spec.js`** — the **INDEPENDENT MODEL** of the semantics (∃/∀ per operator), written from INTENT. 🛑 The only judge of what the language MUST do; all other tests call the engine, hence prove what it DOES.
- **`spec-differential.test.js`** — confronts the model with the engine **EXHAUSTIVELY** (408,996 cases, ~2 s, zero dependencies — domain extended to the 53bis boundary forms on 15/08/2026). Negative-check proven on **3 distinct sabotages**. That is where a FALSE semantics turns red — the 3 defects ㊵/㊴/㊼ were green everywhere else.

## File map — ON-DEMAND: `FILE-MAP.md`
⚠️ **1 line per file, the EXHAUSTIVENESS net** (a file off the list = a hole, never a judgement of importance). Moved out of the skill on 31/07/2026: it weighed 24,625 characters, 48% of the skill, and pushed the whole thing far beyond the emission budget — the entire skill was therefore EVICTED from the frame, i.e. ABSENT from your context. **READ it as soon as you touch the repo's structure** (file add/delete/rename), and UPDATE it in the same move. Sealed by check ② of `coverage-gate.test.js`, which reads that file AND this skill. ⚠️ NEVER fold it back in here.

## Porting the framework to a NEW HARNESS (Codex, Gemini CLI, other) — STRICT contract
✅ **㊾ (15/08/2026) — THE PROOF STARTS AT THE ADOPTER'S**: published contract `HARNESS-CONTRACT.md` (root, English) + `node tools/doctor.js --harness <payload.json>` on a REAL payload captured from their harness ⇒ `supported`/`degraded` (named points)/`incompatible` + candidate keys for `pathKeys`. Decision = `harness-conformance.js` (pure, mutated). The PUBLIC language reference = `LANGUAGE.md` (root, derived AUTO blocks — never copied).
The ENGINE is portable BY CONSTRUCTION (gate `sources-must-not-know-the-harness`: red CI if a source imports a dialect). Porting = writing SHELLS, never touching the engine.
1. **ABSOLUTELY FORBIDDEN**: modifying `src/sources/`, `gate.js`, `frontmatter.js`, `loader.js`, `lib-pure.js`, `collisions.js` for a port. If you think you must, you have the wrong layer — STOP. 🔴 **AND THIS INVARIANT WAS NOT GUARDED UNTIL 14/08/2026 (㊽)**: `sources-must-not-know-the-harness` only looks at **IMPORTS**, never at a **LITERAL** ⇒ `sources/file.js` carried `'Bash'`, `apply_patch`, `file_path`, `remotePath` hardcoded, and `apply_patch` is a **CODEX** name — the leak had therefore ALREADY happened without a test flinching. *An invariant no machine verifies is not an invariant.* ✅ **THE DIALECT NOW LIVES IN `harness-profile.js` (DATA)** — path keys, patch tools. **Porting = adding an entry**, zero engine lines. Sealed by `harness-profile-gate.test.js`, DERIVED from the profile (comments remain free to mention it).
1bis. **WHAT WE DETECT INSTEAD OF LISTING — and what we refuse to guess.** ✅ A **SHELL** is recognized by its **SHAPE** (presence of a `command`), never by a name: **measured on 7,553 real calls**, 4 tools carry a `command` and **all 4 are shells**; the by-name test made **809 of 4,396 commands (18%) INVISIBLE** (all PowerShell, all SSH — on a Windows machine, the main shell). Differential over 4,702 actions: 128 change, **ZERO lost**. 🛑 Adding a shell-tool list to the profile turns the gate RED: a list is born stale and fails SILENTLY. 🛑 **TWO HEURISTICS REFUSED, with their reason**: ① the **PATCH** keeps its TOOL NAME — its marker can live INSIDE a file's content (a doc that talks about it) ⇒ ghost paths; *a tool name does not lie, content does* · ② **PATH KEYS** are not guessed by name (`path`/`file`/`dir`): an **anglophone** convention, hence silently blind to `dateipfad`/`chemin_fichier` — and a heuristic in the **TRIGGER** (the only operator that CREATES an injection) is the first thing an external auditor attacks. What `match` cannot reach is targeted with `tool` + `scope`, **without guessing**. ⚠️ **THE ONLY GUESSING LEFT**: the `cd X && cmd` reconstruction fabricates pseudo-paths (`project/node`) that exist nowhere. An INTENDED capability (matching without an absolute path), and that is exactly where ㊼ had lodged itself — know it before touching it.
2. **What to write, per event of the target harness — NEVER a copy (proven on Codex 19/07/2026)**: the gates' body lives in SHARED CORES (`pretool-core.js` = PreToolUse, `guard-core.js` = PostToolUse) — a shell = stdin + the dialect's `emit` (~15-50 lines). First CHECK whether the existing gate wires AS-IS (identical dialect — Codex: reset/turn-count/session-inject reused byte-for-byte); otherwise a `<harness>-*.js` shell that requires the core. The only permitted difference: the target harness's stdin/stdout FORMAT. Missing capability (e.g. Codex "ask") = EXPLICIT DEGRADATION commented in the emit, never silent. Missing event = path skipped, noted in the work journal, never bodged.
3. **Every shell**: arms `deadline.arm()` before any I/O, fully fail-open (error = silent exit 0), paths via `paths.js` only, decisions via the pure modules only.
4. **MANDATORY proofs before wiring** (no exception): integration suite by real spawn on a tmpdir corpus (models: `doc-inject.test.js`, `session-inject.test.js`, `doc-write-guard.test.js`) + doctor extension (a probe for each new gate + wiring check + negative-check in `doctor.test.js` that SABOTAGES a copy and demands the scream).
5. A harness WITHOUT an event (e.g. no SessionStart) = we skip THAT path and note it — never a bodged workaround.
6. Done = `npm test` green + mutation green + doctor green on the real wiring + journal/skill updated. A port without those 4 proofs IS NOT done.

## MULTI-FRAME TRANSPORT — the framework DELIVERS EVERYTHING (03/08/2026, LIVE in prod)

**THE RULE, TWO PATHS AND NOT THREE** — that is the whole mechanism:
1. **it fits in the frame** ⇒ emit as-is (zero envelope, zero loop, zero cost);
2. **it does not fit** ⇒ **split into chunks** spread over N frames.

⚠️ **THREE PATHS, AND THE 3rd CLOSES EVERYTHING (05/08/2026): it fits ⇒ as-is · it overflows ⇒ chunked · it STILL overflows ⇒ QUEUE, re-emitted at the next action.** The capacity of ONE call is finite (**12 frames, ~91,932 c** — 1 frame = 7,661 c; real worst-case load measured 65,265 c, i.e. 71%) because the harness spawns exactly the declared frames — but it is no longer a DELIVERY ceiling, only a **THROUGHPUT**: the surplus waits in the queue instead of being dropped, exactly like a TCP sender keeps its buffer when the window is full.

🛑 **N FRAMES = THE BANDWIDTH OF ONE ACTION — 16 today (12 until 12/08/2026), tunable via `frames`.** Capacity of an action: **16 × 7,661 ≈ 122,576 c** (91,932 c at 12). 🔴 **This paragraph advocated ONE single declaration for 24 h — FALSE, CANCELLED.** The framing error: I took the DISPLAY ORDER for the requirement, whereas the requirement is **"the COMPLETE context before the next tool call"**. At 1 frame the capacity drops to 7,661 c ⇒ a 53,830 c skill spreads over 8 actions ⇒ **the agent acts 7 times on partial knowledge**. A disorder can be reassembled (`k/N` + a common marker, that is the WHOLE point of the RFCs); knowledge absent at the moment of acting cannot. ⚠️ **AND THE MEASUREMENT JUSTIFYING THE REMOVAL WAS BIASED**: "saturated 1 time in 74" counted the frames USED; the right observable was the deferred-docs counter, **which never came back down to zero** (a `dumb` corpus is re-decided at every action ⇒ a queue in perpetual rotation). ⚠️ **ORDERING IS GUARANTEED BY NO HARNESS and cannot be** — official doc: *"All matching hooks run in parallel"*, aggregation **unspecified**, 10,000 c cap across the **5 handler types**. Guaranteed order ⟺ SINGLE output ⟺ content ≤ one frame. 🛑 NEVER code a precedence chain between processes to force it: that would be a bet on the undocumented (forbidden by `budget.md`). 🛑 **THE DUPLICATE EXISTS — THE 07/08 "REFUTATION" WAS ITSELF TOO HASTY, CAUSE FOUND THE SAME NIGHT.** The morning case (chunk 7/8) was indeed a `PreCompact`, and 12 parallel processes produced 0 duplicates — but **a failed reproduction is not a REFUTATION**, and it was written as one, in bold, in the code, four docs and the backlog. ⚠️ **RULE, in BOTH directions**: a defect is engraved on REPRODUCTION; its ABSENCE is NEVER engraved — the honest status is "not reproduced to date". **REAL CAUSE**: the "lock unavailable" fallback of `pretool-core.js` decided with an EMPTY state ⇒ a `once` already delivered was judged never delivered and re-emitted; not reading the memoized plan either, it recomputed the SAME split on its own (deterministic ⇒ identical marker) and emitted only ITS frame. **Signature = an ORPHAN chunk after a complete delivery, no compaction, empty queue.** 🛑 **ROOT FAULT = an INFERENCE** ("didn't get the lock" ⇒ "nothing was injected"): the lock serializes WRITES, READING never needed it. Fixed: the fallback READS the state, still writes nothing. The system is deterministic again (it depended on who won the race — hence "not reproducible", hence the false refutation). ⚠️ **1,096 tests did not see it**: no suite made the lock FAIL. **A degradation path tested only with an empty state is not tested.** Guardrails = `doctor.js --settings`: same `--frames` everywhere · as many declarations as frames · indices 1..N with no gap and no duplicate · **equality with `frames` from the config** (two places for one number diverge silently — paid on 05/08). ⚠️ **RAISING IT COSTS**: one process per frame on EVERY tool call, even empty (~330 ms) — 12 ⇒ ~4 s, 50 ⇒ ~17 s. Unexplored lead: `http` handlers spawn nothing, but require a daemon.
⚠️ **CAPACITY ALARM (07/08/2026)**: as soon as a doc is DEFERRED, the badge says so and names the setting (`frames`) — on the LAST frame only (12 screams = an unreadable alarm). Sealed by `capacity-alarm.test.js` (real spawn, positive case + silence when capacity suffices). It closes the "nothing measures THROUGHPUT" hole: the degradation was SILENT, hence invisible to all tests.
⚠️ **LESSON, wider than that bug: 1,066 green tests + 100% mutation + green doctor, and TWO defects visible to the naked eye** (badges out of order, duplicated chunk). Tests prove what someone thought of proving. When the maintainer says "that's weird", it is a MEASUREMENT to investigate — never a feeling to reassure. And `budget.property` was structurally blind here: it proves CONSERVATION, and a segment delivered twice is perfectly "conserved". **Conservation AND uniqueness — two properties, we only had one.**
✅ **THE RESERVATION IS LIFTED (05/08/2026, ⑯+⑮ SHIPPED) — transport is a LAYER, no longer a caller's choice.** `emission-core.js` is the ONLY way a context leaves; `pretool-core.js` AND `session-inject.js` go through it. The SESSION gate had NO transport (no seal, no chunking, no queue) and only held because `docs/session/` weighed ~1.2 KB — static sizing.
⚠️ **WHAT MAKES THE LAYER MANDATORY IS THE GATE, NOT THE EXTRACTION**: `emission-core-gate.test.js` scans the files that write the `additionalContext` key and requires them to REACH the module (TRANSITIVE traversal, DERIVED from the code) ⇒ any FUTURE emitter is covered the day it is written. In a web framework you CANNOT bypass the pipeline; here we own everything, so only a MACHINE can impose it. Negative-check by IN-MEMORY sabotage (never a real file: the 1st version of such a check had brought down 38 tests of other suites).
## THE SKELETON: THE CAPABILITIES × LAYERS TABLE (06/08/2026 — read BEFORE coding)
🛑 **THE FOUNDING QUESTION, ASKED BY THE MAINTAINER**: "this repository is written by AGENTS and reviewed by NOBODY. Is a standard-quality project even possible, or is it gambling?" **Answer: it was not gambling, it was INCOMPLETE.** The gates caught the RELAPSE, never the FIRST occurrence — so the first time depended on a glance, hence on luck.
⚠️ **THE REVERSAL**: we no longer write a gate PER DISCOVERED FAULT (reactive, endless). We DECLARE what each layer has the RIGHT to do (`layers.json` + `layers-gate.test.js`). And what a program can do is a **FINITE** list (kill the process · write the output · read the environment · read the arguments · go through a shell) — **exactly the reasoning of the OR/AND/NOT boolean base of matching: a CLOSED base, not an open list.** ⇒ there is no "architecture bug class" left to discover, **there are only CELLS**. A new class = ONE LINE, never a new mechanism (proven the same day with `shell`).
⚠️ **PROOF, NOT PROMISE**: the week's 4 defects (transport in a single emitter · `process.exit` in 2 shared cores · `console.log` in guard-core · `shell: true`) are 4 CELLS of this table. None was seen by 1,000+ tests nor by the 100% mutation score.
🛑 **THE REPO'S WORST DEFECT IS NOT A RED GATE, IT IS A GREEN GATE THAT SEES NOTHING.** Three blindnesses MEASURED on 06/08: `shell:true` yielded an EMPTY scan under `/bin/sh` · the `{ shell: true }` pattern missed `{ encoding, shell: true, maxBuffer }` · **`ast-grep` RESPECTS `.gitignore`**. Each time the rule "existed" and protected NOTHING. ⇒ **ANTI-INERTNESS**: every capability carries a `temoin` (witness — a REAL line of code, the form actually encountered, never a textbook case) whose detection is REQUIRED. Capability without a witness = REFUSED. **That is the guarantee holding everything else.**
🛑 **WIDENING THE TABLE IS ALMOST ALWAYS THE WRONG ANSWER** — a red says the FILE is in the wrong layer. Widening to silence it disarms the guardrail SILENTLY. Hence: mandatory written justification + an INVERSE check that kills a stale justification.
⚠️ **LAYER RULES, non-negotiable**: a SHARED CORE (`*-core.js`) never kills the process and never writes the output — it RETURNS a verdict, the SHELL emits and exits (it alone knows the harness). `shell: true` is FORBIDDEN FOR ALL LAYERS (`cmd` vs `/bin/sh` = different behavior per machine): call the binary DIRECTLY, never through a shell nor `npx`.
⚠️ **ROLE SPLIT, never to blur**: IMPORTS = `dependency-cruiser` (already there) · GLOBALS = the layers gate via `ast-grep`. Two tools for one invariant diverge. `eslint-plugin-boundaries`/`Sheriff` REJECTED (MODULE boundaries = nothing more, at the price of ESLint).
⚠️ **A MEASUREMENT ON ONE MACHINE PROVES NOTHING**: local reads the machine's real config, CI a PRISTINE clone on another OS. Paid twice (13 false positives of the anti-leak gate via the `runner` account; red CI of the scan under `/bin/sh`).

⚠️ **THE QUEUE IS SHARED BETWEEN THE TWO GATES, AND THAT IS THE KEY TO ⑮**: at SessionStart there is no "next action" to drain a remainder into. Shared store (`remainder-`, same agent scope) ⇒ what the session gate could not deliver is picked up by the PreToolUse gate at the VERY FIRST tool call. Zero `settings.json` modification.
⚠️ **AN HONEST LIMIT REMAINS, NOT A RESERVATION**: the session gate emits on ONE frame — whether a SessionStart hook declared N times is spawned N times is NOT measured. At one frame the chunking still delivers EVERYTHING, simply over several actions. Going to N = a setting AFTER measurement, never a redesign.
**On ALL paths (file docs, MCP docs, skills, session docs), undeliverability is now impossible:** a doc of any size arrives — 10 KB, 80 KB, whatever. **NEVER reintroduce a size cap, a "too big", a "split your doc".** That would make the AUTHOR of a doc carry a TRANSPORT defect. The framework delivers, it does not judge what it is entrusted with. That is why check ④ of the coverage gate (length cap) was REMOVED, and why the "<10 lines" rule is only a fleet convention — never an engine constraint.

**WHY WE DID THIS.** The harness bounds the size of an injection; beyond it, it files the content away and shows only a preview, **without telling the producer**. Lived result: docs announced "not injected" at every turn, and skills never delivered. A doc that does not arrive is an invariant that protects nobody.

**THE PROTOCOL — taken from the existing, nothing invented.** Two standards solve exactly this problem (a message too big for its channel) and impose the SAME three pieces of information:
| What the receiver needs | RFC 2046 `message/partial` | RFC 6455 WebSocket | Here |
|---|---|---|---|
| whose it is | `id` | the connection | common marker `###END:xxxx###` |
| where it goes | `number`, **starts at 1** | continuation frames | `CHUNK j/m` |
| when it is complete | `total` | **FIN bit** | the `m` of `j/m` |
Plus: cut on **line boundaries** (RFC 2046) and **strict order, never interleaved** (RFC 6455). ⚠️ Removing a SINGLE one makes reassembly ambiguous — each removes one guarantee.

⚠️ **This is TCP/MSS segmentation, NOT IP fragmentation.** RFC 8900 advises against IP fragmentation, but its 9 fragility causes are ALL middleboxes (NAT, firewalls, ECMP) — there are none here. Its core recommendation ("cut at the layer that understands the semantics") describes exactly what we do.

⚠️ **NO automatic ceiling discovery** (RFC 8899/PLPMTUD): classic detection depends on a feedback signal, and here **there is none** — the only receiver is the agent. A mechanism based on an absent signal falls into a SILENT black hole. Instead: **conservative floor + negotiation when an authority exists**.

**THE TWO POSTURES, depending on what the harness exposes** — same principle, not an exception:
- **Claude Code**: internal ceiling NOT documented + REMOTE feature-gate ⇒ we read nothing, we take a **margin** (default 8,000 under the measured 10,000).
🔴 **THE ENGINE'S BUDGET MUST FOLLOW THE DECLARED LIMIT — otherwise a LYING GREEN (⑰, 05/08/2026).** We had been declaring `additionalContextLimit = 0` to Codex since 04/08 (= *"disables spilling"*, hence NO limit) **without ever telling the engine**: 8,000 floor applied, a 76,000 c skill delivered in **11 actions instead of 1**, with 995 green tests, 100% mutation, doctor 27/27, canary alive. This is NOT an outage, it is a **SILENT DEGRADATION** — and **nothing in the repo measures THROUGHPUT** (⑱). FIX: `--budget N` in the command, next to the limit, SAME block, `budget-declare-gate` requires equality. **ERROR CLASS: everything DECLARED to a harness must be RE-READ by the engine, never guessed in parallel.**
⚠️ **MEASURE THE BINARY, NOT ONLY THE DOC**: `additionalContextLimit` = **0 occurrences in 0.144.6**, **18 in 0.146.0**. Our declaration was INERT for two days. A documented key is not in the installed binary. ⚠️ **Codex 0.146 stores its transcripts in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`** (`logs_*.sqlite` = telemetry, not a transcript).
- **Codex**: `additionalContextLimit` is **DECLARED in OUR wiring**, per hook (official doc re-read 04/08/2026) — nothing to read upstream: we write it at **`0`** = *"pass the handler's complete additional context directly to the model"* ⇒ **no fragmentation needed on the Codex side**. ⚠️ **OMITTED = default 2,500 TOKENS, disk spill + preview, SILENTLY**: that was the case until 04/08/2026, so big skills NEVER arrived whole on the Codex side. Sealed by `doctor.js --codex-hooks` (per BLOCK, on the 2 emitters). The old wording "we READ it" was false.
- **Gemini**: `PreToolUse` does NOT expose the channel — a capability hole, not a size one; no fragmentation remedies it.

⚠️ **IF A HARNESS LOWERS ITS LIMIT**: it does not break silently (the seal announces the end marker; if missing, the agent KNOWS it was truncated). The fix is **ONE config number** (`budgetInjection`), zero lines of code — everything re-splits. That is what surviving updates means.

⚠️ **CONCURRENCY TRAP, never reintroduce it**: the N processes are PARALLEL and each calls `gate.decide`, which WRITES the state ⇒ the first would consume the `once` and the following frames would be EMPTY. Hence the **memoized plan per invocation**: one decides, all recompute the same split **by pure determinism**. No coordination, no new lock — determinism replaces authority. Any source of non-determinism in `planFrames` (clock, randomness, state read) would break everything.

⚠️ **A remainder = a DELAY, never a loss NOR a config error (corrected 05/08/2026).** The old message blamed `--frames N` and demanded human intervention for a NORMAL transport phenomenon — that is the toil we eliminate. It waits in the queue and leaves at the next action. Current wiring: **N = 16**, and that number is no longer sized on "the biggest known content" (static capacity planning = a bodge): it only sets the SPEED.
⚠️ **THREE JOINT GUARDRAILS, otherwise the queue LOOPS FOREVER** (defects measured while building, invisible as long as the remainder was dropped): ① the announcement counts **DOCUMENTS** (dedup by label) and cites **5 max**; ② **progress guarantee** — if nothing fits, we force ONE chunk and sacrifice the announcement (*delivering beats describing*); ③ `fragment` drops the chunk header when the capacity cannot carry it. Removing one = an infinite loop or an over-budget frame.
⚠️ **`n === 1` CHUNKS TOO**: the shortcut "one frame ⇒ `plan()`'s output" was a HOLE (plan does not chunk) ⇒ on Codex, a doc too heavy NEVER arrived. **Both harnesses now have the same guarantee**, Codex with a lower throughput.

⚠️ **NOTHING IS EVER "TOO SMALL" EITHER** (03/08/2026). A 2-character content leaves as-is via path 1 — no floor exists. And when the budget is so small it cannot even carry the seal (`frameCapacity` ≤ 0), **the ENVELOPE yields, never the content**: we unseal and deliver (the returned marker is then empty — NEVER announce a seal absent from the text). REAL bug fixed that day: before, this case emitted ZERO docs **and** blamed `--frames N`, i.e. undeliverability doubled with a false message. **Delivering beats sealing, always.**

⚠️ **MEASURED COST (at 12 frames — 16 since 12/08/2026, i.e. ~5.3 s), don't aim at the wrong target**: 12 `node` processes doing NOTHING cost ~4 s on the measurement machine; the full gate ~4.2 s. **The framework weighs 4% — the remaining 96% is node startup.** Optimizing the collection (memoizing earlier, skipping the corpus) is a FALSE lead, measured and rejected on 03/08/2026. The only real lever on cost is **N**, and lowering it would cap what can be delivered. Do not reopen without a new measurement.

Full details, dated sources and measurements: `budget-frames-reference.md` (on-demand).

## TWO SILENT DEFECTS CLOSED ON 06/08/2026 — read before touching the parser or the docs

⚠️ **TRANSPORT MUST BE READABLE, not only correct.** A skill delivered in 7 chunks displayed SEVEN IDENTICAL badges; the maintainer read it as the framework running away ("that's scary") while the delivery was normal and unique. **A correct but unreadable transport gets mistaken for an outage — and a system believed broken ends up unplugged.** A chunk's id therefore carries `#j/m` (the total existed NOWHERE outside the header's text) and the badge says `📄 doc: big (chunk 1/2)`. ⚠️ `baseId` reads the FIRST `#`, `chunkPart` the LAST (a re-chunked chunk carries `doc#3/7#2/4`). The suffix is composed ONCE in `pretool-core.js` — never in the 4 `message()`.
🛑 **PRE-EXISTING BUG FOUND BY THE ANTI-INERTNESS TEST, and that is the real gain**: the `[source:]` tag lives at the END of a document ⇒ **no chunk but the last carries it** ⇒ `docLabel` fell back to its "markdown title" fallback and displayed the SEAL FOOTER. Fixed on BOTH sides (CommonMark-conformant ATX regex — mandatory space after the `#` — + fallback on `acc.labels`): one without the other leaves either a false name or NO name. ⚠️ The FILE badge ignores `showNotification` (historical parity), MCP and `tool` respect it: an INTENDED asymmetry, do not "harmonize" — I almost did, to satisfy a test I had written wrong.
⚠️ **`note: |` SWALLOWED its lines, silently, with `validate` GREEN.** The frontmatter being stripped from the body, they vanished on BOTH sides. `parse()` now understands YAML blocks (`|` literal, `>` folded, dedent on the MINIMUM, clip chomping). 🛑 **NO per-key exception**: the rule is "`|`/`>` FOLLOWED by an INDENTED line" — an exception on `note` would have left the trap armed for the next key. ⚠️ **THE REAL LAYER LESSON**: a guard placed in `validate()` (05/08) was removed the same day — it rejected `match: "|"`, a LEGITIMATE pattern. Only `parse()` sees the next line, so only it can lift the ambiguity. **Placing a guard where the information no longer exists means forbidding the healthy.**
⚠️ **`doc-drift-gate.test.js`**: every framework doc citing a `.js` file must prove it EXISTS (repo · `src/sources/` · fleet). Closes the DECIDABLE part of "the doc teaches the opposite of the code" — the rename nobody sees. 🛑 It NEVER proves a doc tells the TRUTH: the 3 lying docs of 03/08 cited literals that existed and would have passed it. Do not sell it for what it is not.
⚠️ **MEASURE BEFORE WRITING A GATE** (applied here, to redo always): 32 docs, 936 literals, 64 cited files, 0 unfindable — without the FLEET root, I would have shipped 8 false reds. **A noisy gate is a gate people stop reading, then bypass.**
⚠️ **MUTATION: ELIMINATE, DON'T TEST.** Of 12 survivors, 5 were removed BY CONSTRUCTION (a `typeof` guard that coercion makes dead, an unreachable branch, an indexed loop → consumed, a condition absorbed by a `trimEnd`). Writing a test for useless code freezes it forever.

## CANARY — the only witness watching the OTHER END of the pipe (03/08/2026, LIVE)

⚠️ **EVERYTHING ELSE IN THE FRAMEWORK TESTS ITSELF.** The doctor spawns OUR hook with OUR payload and checks OUR output. Necessary — and perfectly blind to the only remaining risk: **the HARNESS changing its mind** (renamed fields, `additionalContext` no longer consumed). Then the hooks fail open silently, the doctor stays GREEN, and nothing reaches the agent anymore. No test can see that: it would be testing itself.

**What the rest already covers, don't redo it**: lowered limit → the SEAL makes it loud · lost frame → the missing NUMBER · our broken code → the DOCTOR.

**The canary** (`canary.js` PURE + `canary-check.js` shell, UserPromptSubmit) decides `alive`/`dead`/`undecidable` on a two-term question: **"we EMITTED N times, did it ARRIVE?"** ⚠️ **DECIDABLE**: an injection that LANDED leaves `[source: …]` in the transcript; ONE single trace proves the channel lives. We NEVER compare received vs expected.

⚠️ **WIRED ON BOTH HARNESSES SINCE 07/08/2026 (work item ② CLOSED) — and the port cost NO file.** The backlog planned to measure the tool-call marker in the Codex rollout. 🛑 **PLAN ABANDONED ON DOCUMENTARY EVIDENCE**: official Codex hooks doc, *"the transcript format isn't a stable interface for hooks and may change over time"*. Reverse-engineering that schema would have produced a canary silently dead at the first update — a dead-man switch that dies without saying so is worse than no dead-man switch.
✅ **WHAT REPLACES IT**: the denominator comes from `emission-core`'s emission counter — **our** counter, incremented inside a store write that already existed (zero I/O, zero extra lock), and identical on all harnesses. What remains in the transcript is a search for **our own** `[source:` substring, which depends on no schema. ⇒ the Claude call-marker constant is gone: **no harness dialect anywhere in the canary**, hence one single shell for both products (`transcript_path` and `session_id` are documented under those names on both sides, and both contracts allow total silence — a harness differing on one of the three would require a shell, never an `if`).
⚠️ **SIDE EFFECT GAINED**: without an emission on our side, there is nothing to expect on the other ⇒ verdict `undecidable`, silence. Before, the HARNESS's activity was enough to accuse — a user touching no documented file saw "INJECTION DEAD" on a healthy system.
⚠️ **It is also the ONLY practicable anti-deprecation gate**: detecting the ANNOUNCEMENT of a deprecated flag was measured impossible for free (3 leads closed on 05/08). The canary detects the EFFECT.
🔴 **THE DISPLAYER IS A FAILURE POINT OUTSIDE THE REPO, AND IT FAILED**: the maintainer's statusline pointed at the repo's name from BEFORE its rename to `ctxroute` (04/08). For 3 days the canary wrote its verdict for nobody, the fail-open `catch` masking everything. **Renaming the folder ⇒ revisit the displayer**: no repo gate can see a file that lives outside.

⚠️ **THE ALARM NEVER GOES THROUGH THE TESTED PIPE** — screaming via an injection would die with what it reports. Output = `state/canary.json`, read by a displayer OUTSIDE the framework (at the maintainer's: the statusline). **The framework neither ships nor depends on any displayer** — it publishes a verdict, period. That is what keeps it installable as-is by anyone.

⚠️ **SILENT when all is well**: a permanent alarm becomes wallpaper. **Reading bounded to 2 MB from the end** (real fleet transcript measured at **104 MB**: 524 ms whole, 5 ms the tail). **Threshold: 25 EMISSIONS** = a SAMPLE size, not a delay — ⚠️ it counted TOOL CALLS until 07/08/2026, its justification was redone on the right quantity (13 real compactions, 94→335 injections in between).
🛑 **THE TRANSCRIPT IS ASYNCHRONOUS — official Claude doc, verified 07/08/2026**: *"The transcript file is written asynchronously and may lag the in-memory conversation"*. An injection that just landed may NOT be there yet. Harmless (the lag concerns a turn's last messages, the sample is 25), but **it FORBIDS lowering the threshold to 1-2 or looking only at the current turn**: we would cry the death of a living channel. ⚠️ The transcript format is specified NEITHER by Claude NOR by Codex — the old `"type":"tool_use"` counting was a bet on BOTH sides.

🔴 **THIS LINE SAID THE OPPOSITE OF THE CODE — corrected 07/08/2026.** It claimed "the harness dialect lives in the SHELL (a Claude call-marker constant); porting the canary = changing that line", while **that constant no longer exists** and the paragraph 9 lines above announces its removal. The skill was contradicting itself. ⚠️ **CAUSE, not to repeat**: I ADDED the new block without REMOVING the stale one — a doc does not pile up, it gets rewritten. Found by grepping the deleted literals, not by re-reading. ✅ **WHAT IS TRUE**: the canary has NO dialect left, neither in the core nor in the shell; porting = changing nothing, just wiring.

⚠️ **NEVER FIRED FOR REAL** (by construction: it only fires if the channel dies) — but **EXERCISED ON REAL CODEX on 07/08/2026** (②bis closed): 2-turn session, verdict `alive`, and **12** occurrences of `[source:` in the Codex rollout against `injections:12` reported. So it does read the Codex transcript.
🛑 **DEFECT ㉘ FOUND BY THAT MEASUREMENT, NOT BY A TEST**: one label in the rollout stood out (`[source: …]`, belonging to no doc) — it was the TEXT THAT TALKS ABOUT the marker, counted as delivered. The numerator counted every occurrence of `[source:`, yet that literal lives in `canary.js`'s comments and **64 fleet docs out of 386** (measured). ⇒ an agent READING one of those docs — the exact action of whoever INVESTIGATES a dead injection — turned the canary GREEN. ✅ Fixed: only a label of EMITTED form counts (`.md` / `skill/`). ⚠️ **NOT the complete fix**: 4 fleet docs cite a `.md` — work item ㉘bis, closed since IN DATA (the 4 hardcoded tags removed; anti-return = the lint's `hardcoded-source-tag` rule, ERROR, zero exemptions). 🛑 **NO anti-self-reference gate**: ~10 repo files legitimately carry this literal (test assertions) ⇒ the gate would require 10 exemptions = noise. Measured BEFORE writing the gate, not after.

## THE PURITY GATES WERE INERT (REAL bug, 03/08/2026)

⚠️ `lib-pure-must-stay-pure` — the repo's oldest architecture gate, documented everywhere as THE guarantee — **could not turn red**. A `require('fs')` at the top of `lib-pure.js` passed GREEN. **All** the `*-must-stay-pure` rules were decorative.
**Cause (official dependency-cruiser 18.1.0 doc)**: `includeOnly` **filters the dependencies TOO** ⇒ `fs`/`path`/`child_process` never entered the graph. Measurement: 41 modules/99 deps before, **47/143** after letting the core modules in.
⚠️ **Sealed by `deps-purity-gate.test.js`** (static, DERIVED from the rules + real sabotage ON A COPY). **New purity rule ⇒ its core module MUST be in `includeOnly`**, otherwise it is born inert.
⚠️ **A test sabotage NEVER touches a real file**: the 1st version brought down 38 tests of other suites importing `lib-pure.js` IN PARALLEL. And **never `npx` from a tmpdir** — it goes fetching the package on the NETWORK (anti-dependency-confusion placeholder brought back, measured): point at the local binary.

## Adding an MCP to the standard
1. Create `docs/mcp/{server}.md`. ⚠️ **The framework imposes NEITHER size NOR format**: it MUST deliver a doc of any size — if it does not get through, the defect is in the TRANSPORT, never in the doc. "<10 lines, 1 line = 1 invariant/pitfall, imperative tone" is THIS fleet's USAGE convention (anti-dilution) — follow it here, NEVER present it as an engine rule nor have a framework gate apply it.
2. That's all. No code to write — the generic hook reads every `.md` of the folder on the fly.
3. By default: document as soon as an MCP has an invariant/pitfall/context to convey (almost always) — not only after an incident.

## Triggering on an ACTION (a command), not a PLACE — recipe, proven 31/07/2026
The framework's FOUNDING use case is an ACTION (a payment click), but the vocabulary
only exposes PLACES. The recipe was written nowhere and cost a whole session:
```yaml
tool: ["*"]                                  # WHO acts — `*` = ANY tool (wildcard)
scope: ["docker run", "systemctl enable"]    # WHAT IT DOES (scope sees ALL params)
```
(enumerating stays possible: `tool: ["Bash", "PowerShell", "mcp__ssh__ssh_exec"]` — but the day
a shell/MCP is added, the enumeration goes SILENT. Prefer the wildcard for an ACTION.)
- ⚠️ **`match` IS USELESS HERE**: it only looks at PATHS (+ the POSIX shell command).
  It will never see a `docker run` launched by another shell nor by an MCP tool.
- ⚠️ **`scope` is the only operator that sees ALL parameters** — it is what filters the action;
  ⚠️ **and that was FALSE as soon as there was one nesting level, until 12/08/2026 (㊵)**: it only read the 1st level, hence was **BLIND to the 16 MCP servers** (they all put their args in `args{}`), SILENTLY — a silent doc looks like a misconfigured doc. Now RECURSIVE flattening, **2 MEASURED bounds** (25,898 real calls: max depth 11, max text 12,060 c ⇒ 20 levels / 262,144 c) and **truncation SAID by `explain.js`**: a silent bound would recreate the defect through the back door.
  But it never triggers on its own, hence the `tool:` that opens the door for it.
- ⚠️ **WILDCARD `*` SHIPPED 31/07/2026**: `tool: ["*"]` matches any tool (including ones
  that don't exist yet); `*` + `exclude` = "all EXCEPT X". **Wildcard WITHOUT `scope` or `exclude`
  = RED** (it would inject on every tool call; a truly universal doc → `docs/session/`).
- ⚠️ **CHECK WITH: `node tools/explain.js --doc <name> --tool X --input '{...}'`** — it returns the exact
  reason, including the "why NOT". **NEVER write a homemade Node harness to probe the engine**:
  measured on 31/07, it cost a session (3 wrong probes, each returning a "silent" taken for
  a verdict ON THE ENGINE, hence a FALSE conclusion "the engine must be modified"). The tool
  consumes the real sources: it cannot get the format wrong.

## Configuring `ctxroute-config.json`
```json
{
  "enabled": true,
  "showNotification": true,
  "mode": "smart",
  "defaultThreshold": 4,
  "filterMode": "none",
  "filterList": [],
  "servers": {
    "odoo": { "subToolParam": "args.tool" }
  }
}
```
- **`enabled`** (default `true`): the framework's GLOBAL switch — `false` cuts EVERYTHING (injection AND state tracking). ⚠️ DISTINCT from `showNotification` (don't confuse: this one cuts the real operation, the other just cuts a visual message).
- **`showNotification`** (default `true`): controls ONLY the visible `📄 [ctxroute] ...` badge — `false` hides the badge but the real injection into the agent's context continues normally. For the user who wants the benefit without the visual noise.
- **`mode`**:
  - `"dumb"` — re-injects on EVERY call of the server. Never the default (maximum noise), useful only when debugging the hook itself.
  - `"once"` — injects on the server's 1st call in the session, never again (except compaction). Zero noise, but can stay silent for long if the context drifts without compacting.
  - `"smart"` (recommended default) — like `once`, BUT also re-injects when ≥ N calls to OTHER tools have elapsed since the last call to THAT specific server. A server's counter resets to 0 every time it is called again (injected or not).
- **`defaultThreshold`**: the default N (number of other-tool calls before re-injection in smart mode).
- **PER-DOC cadence = the doc's frontmatter, NEVER the JSON** (decision 17/07/2026, zero duplication): `docs/mcp/stripe.md` opens with `---
mode: dumb
---` (or `threshold: 2`). Precedence: frontmatter > global. Keys admitted in an MCP doc: `mode`/`threshold` and friends (gate in config-gate.test.js).
- **`servers.{name}`**: STRUCTURAL settings only (`subToolParam`) — the schema REJECTS mode/threshold here.
- **`filterMode`** (`"none"` default / `"whitelist"` / `"blacklist"`) + **`filterList`**: GLOBAL PER-**TARGET** FILTER (52, 15/08/2026 — generalized from MCP servers only, the asymmetry was class ㊴). A `filterList` entry = an MCP SERVER (`"stripe"`, historical semantics) OR an exact TOOL NAME (`"Bash"`, `"mcp__stripe__pay"`) OR the wildcard `"*"`.
  - `"whitelist"`: the framework only injects on actions whose target is listed · `"blacklist"`: NEVER on those targets ("never inject on our production tools").
  - **Cascade**: `defaults.{source}.filterMode`/`filterList` BEATS the global (the pair cascades TOGETHER); a `"none"` declared at the category stage UNSUBSCRIBES that category from a global filter.
  - 🛑 SINGLE application point = `gate.js` (the MCP source no longer filters — a source POSES, it excludes nothing). **OBSERVABLE**: badge `🚫 N doc(s) excluded by filterMode/filterList` (1st frame) + a dedicated `explain.js` section — two distinct exclusion reasons (filter ≠ cadence), never merged.
  - ⚠️ An excluded target still advances the OTHER docs' counters (it counts as "foreign") — the exclusion disables the injection, not the reality that a tool was called.

## 3-level granularity (CONCATENATED docs, global → specific)
1. `docs/mcp/{server}.md` — whole server.
2. `docs/mcp/{server}/{tool}.md` — precise tool (`{tool}` = the suffix after `mcp__{server}__`).
3. `docs/mcp/{server}/{subTool}.md` — for a single-tool proxy MCP where the real operation is a parameter (e.g. Odoo: `tool_name` always `odoo_call`, the real operation lives in `tool_input.args.tool`). Enabled via `servers.{server}.subToolParam: "args.tool"` — without that setting, level 3 is inactive (zero false positives).
Example: `servers.odoo.subToolParam = "args.tool"` + `docs/mcp/odoo/delete_record.md` → injected ONLY on a real `delete_record`, on top of the global `odoo.md`.

## Mechanism invariants (THE doctrines — all written here, none implicit)
- **0-HUMAN everywhere**: the machine decides the DECIDABLE (fail-closed gates, real-time block), an AGENT decides the HEURISTIC (on-demand check-collisions), the human NEVER in the loop.
- **Decidable vs heuristic, never mixed**: provable (broken doc, drift, dead engine) = AUTOMATIC signal (real-time guard → session lint → CI push, staged defense-in-depth); heuristic (crossings) = NEVER auto-injected, only on an agent's explicit request — a recurring warning on the healthy = a dead channel.
- **THREE decisions, never four: `none` · `allow` · `deny`.** The INJECTION informs by DEFAULT; `enforce: true` is the DECLARED EXCEPTION that refuses the action (05/08/2026). ⚠️ **The fact that reopened the topic**: official doc, a PreToolUse's `additionalContext` arrives *"next to the tool result"* ⇒ **an injection CANNOT prevent the action it targets**, it protects the next one. The FOUNDING incident (the payment click) would therefore NOT have been avoided by an injected doc — only a refusal does that. `deny` = same JSON on both harnesses, **zero user interaction** (*"fully automatic"*), verified IN the Codex 0.144.6 binary. ⚠️ **`ask`/`confirm` REMOVED from the framework on 05/08/2026** (human escalation = anti 0-human; absent from Codex hence two meanings for one word; `enforce` covers the need). `WRITE_TOOLS` left with it — no decision depends on the tool's NAME anymore. Anti-return sealed in gate.test.js + a real spawn on both shells: NEVER reintroduce it. 🛑 **This is NOT security but a GUARDRAIL**: the gate is fail-open, a dead hook lets through — protects from a distracted agent, never from an adversary.
- **ANTI-LOOP = ALTERNATION (the maintainer's idea, better than mine)**: a block is NEVER followed by a block ⇒ the redone action ALWAYS passes, then the cadence resumes. So **`enforce` FOLLOWS the cadence and NO mode is forbidden**: `once` = one block per session · `smart` = re-blocks after `threshold` calls (the unit comes from `driftUnit`) · `dumb` = block/pass/block. ⚠️ I had first forbidden `smart`, then required an explicit `once`, then forbidden `dumb` — **three restrictions for a non-existent problem**, replaced by ONE state flag. NEVER reintroduce them.
- **`doc-write-guard`** (PostToolUse) blocks on an INVALID doc — a write corrector, not an action blocker.
- **One truth, one place**: a doc carries its knowledge AND its cadence (frontmatter); the JSON = global/user only; never two places for one truth (anti-duplication gates).
- **Frontmatter ONLY in what we control 100% (18/07/2026)**: the criterion = "does OUR framework define AND validate the file's format?". Our docs (`docs/*.md`) = yes → cadence in frontmatter. A HARNESS file (a skill, an MCP server) = NO (their schema, an update can silently clean our keys) → config in OUR global JSON, referenced by name. Cross-harness portability = NEVER put your config in a third party's file. Uniform registry (skills, servers) = central JSON even where we do control (a routing table, not scattered frontmatter).
- **Skill by perimeter = the 4th trigger (`config.skills`)**: a skill (project knowledge) auto-injects WHOLE (body read live from the harness's skills folder, never copied — single source) when the agent enters its perimeter — file (`match`/`scope`/`exclude` OR per-entry `rules` — SAME vocabulary as the docs, per-line form included since 19/07) OR MCP (`servers`, 3 grains: srv · srv/tool · srv/sub-tool) OR **TOOL (`tool`, exact name + wildcard `*` — ㊴, 12/08/2026)**, **3 dimensions** REUSED in union. Pointer fallback only when the file is unreadable. Sealed by `skill-registry-gate` (name = an existing file).
  ⚠️ **FULL DOCS ↔ SKILLS PARITY, reached 12/08/2026 (㊴)**: `scope`/`exclude` NOW also apply to the `servers` dimension (it was ALL OR NOTHING: a client's folder injected when writing to any OTHER — hence unusable, hence never set) and `tool` is ADMITTED by the schema (it was mechanically REJECTED). A skill can finally react to an **ACTION** (`tool` + `scope`) and not only a PLACE. 🛑 **ZERO vocabulary words created** — we extend the use of existing words to a source that lacked them; the OR/AND/NOT base stays CLOSED. Bare wildcard refused by the schema (exact parity with `frontmatter.validate`). Cost of the defect, MEASURED: a client email drafted without the client's folder, ~10 versions.
- **A file's location = its trigger**: frontmatter `rules:` (file) · path `docs/mcp/` (server) · folder `docs/session/` (every session + post-compaction).
- PreCompact reset = ABSOLUTE, mode-independent — compaction empties the real context, the store restarts from zero.
- An MCP server without `docs/mcp/{server}.md` triggers nothing (no error, no noise).
- **Fail-open hooks, screaming diagnostics** — opposite roles, never merged (doctor/lint = loud exit≠0; gates/guard = silent exit 0 on failure).
- **Frozen engine, stacking sources**: any extension = a pure module + an adapter/shell, never a core modification (cf §Porting to a new harness).

## Quality — gates (`npm run check:all` before any substantial commit)
- **Tests — THREE LEVELS, and you NEVER climb higher than needed (15/08/2026)**: **`npm run t -- <file>`** = the suites COVERING that file, computed from the module graph (**1.3 s**) — **the default command while working** · **`npm test`** = the whole fast lane (**1.8 s**, `--project=unit`) · **`npm run test:all`** = EVERYTHING, **LOCALLY, once, at the end of the work session**. Plus `test:int` (heavy lane alone) and `test:lanes` (who is in which lane). 🔴 **ROOT CAUSE OF THE FRICTION, settled**: we re-ran everything because we didn't know which test covered the edit — coverage ignorance disguised as prudence. **A RED is replayed on ITS file, never on the whole.** ⚠️ Lane classification **DERIVED FROM CONTENT** (spawn or env mutation ⇒ heavy lane): a new suite lands in the right box by itself, the fast loop cannot silently get heavier. STACK = vitest ONLY (node:test banned 16/07/2026).
- **Stryker mutation**: `npm run test:mutation`, vitest perTest runner (~30 s locally against 12 min before), mutates all the pure modules (I/O never mutated — doctrine "isolate the decision before mutating"). Break 99%, ratchet never lowered (do NOT raise it to the exact score — deliberate margin). **Score 100.00%, 0 survivors across the mutated modules — FULL pass (cache deleted) of 08/08/2026.** ⚠️ **`thresholds.break` IS AN AVERAGE, hence BLIND to a collapsing file**: `canary.js` held at 89.23% with 7 survivors while the global showed 99.64%, green CI. Hence **`mutation-floor-gate.test.js` = PER-FILE floor (100, zero exemptions)**, which COMPLEMENTS `break` without replacing it — one protects the average, the other each module. 🛑 A survivor gets KILLED (targeted test) or ELIMINATED (dead code removed: `occurrences()` in canary.js had no caller), NEVER by lowering a threshold. ⚠️ perTest: fixtures = thunks evaluated INSIDE the test, never module-level consts (static mutant = false survivor, measured 16/07: 42 false ones, score 76.67%).
- **`.githooks/pre-commit` = the repo's ONLY BLOCKING gate (12/08/2026)**: runs the anti-leak gate BEFORE the commit enters history (~0.9 s), installed by the `prepare` script (`core.hooksPath`). 🛑 It derogates from "gates NEVER block" knowingly: the rule targets COST (a full-suite hook ≈ 40 s) and the damage avoided is the repo's only IRREVERSIBLE one (pushed data cannot be taken back). **NEVER add other suites to it** — the day it costs 10 s, it gets uninstalled. Born from a REAL leak: the gate existed, was RIGHT, and had never RUN.
- **Types (㉑, 16/08/2026)**: `npm run check:types` = `tsc -p jsconfig.json` (JSDoc + checkJs, 0 errors = binary ratchet, CI coupling job + check:all). Level without strictNullChecks — catches nonexistent properties, LYING JSDoc (it found the `keyValues` JSDoc stale since 53bis, and a JSDoc block attributed to the wrong function in budget.js), incompatible types. ⚠️ JSDoc is verified CONTRACT — a block must be GLUED to its function, and a prose @returns is parsed as a tag.
- **Coupling**: `npm run check:coupling` = `dependency-cruiser` (lib-pure must NEVER import fs/path/child_process) + `jscpd` (0 duplication tolerated beyond 1%).
- **`docfacts` (14/08/2026) — a DOC can no longer state what the CODE contradicts.** `<!-- AUTO:name -->` blocks GENERATED from the constants (`node tools/language-doc.js [--write]`), gate on drift. Core `docfacts.js` GENERIC (zero deps, reusable elsewhere as-is) · shell `language-doc.js` alone knows "which constant ↔ which block". 🛑 **Writing an ENUMERABLE fact in prose = forbidden** (it is a copy, and a copy drifts); prose keeps only the JUDGEMENT. Does NOT cover a sentence's truth — undecidable, never sell it as such.
- ⚠️ **The PER-FILE mutation floor runs INSIDE the mutation job** (where the report exists) — anywhere else it is silent, hence INERT. Real hole: `docfacts.js` at 81% / 15 survivors under a 99 average, green CI. Sealed by `mutation-workflow-gate`.
- **Concurrency**: access to `state/*.json` protected by a cross-process lock (`lock.js`) — Claude Code can launch independent tool calls IN PARALLEL, shared state without a lock = a real race condition, not a theoretical one.

## MCPs already documented
The maintainer's fleet documents its MCP servers in gitignored `docs/mcp/*.md` files (real invariants = personal data); the repo ships generic `.md.example` templates.

## ✅ MERGE COMPLETE (17/07/2026) — target architecture REACHED
**SINGLE hook `doc-inject.js` (matcher `*`) LIVE in prod**: sources/file.js (frontmatters) + sources/mcp.js (docs/mcp/) → gate.js (per-DOC dedup, per-doc threshold). `legacy-mcp-inject.js` REMOVED from the wiring (kept as the differential's oracle + rollback — the doctor requires its ABSENCE, otherwise double injection). Security deny/ask REMOVED (maintainer decision 17/07, reintroduction possible as a separate hook). Proofs: full vitest suite (the runner is the only source of the count), 100% mutation (0 survivors), mcp-differential 9/9, gate-differential byte-for-byte, doctor green on the real wiring.
✅ **DOUBLE WRITE DEAD (27/07/2026)** — ⚠️ **EXACT REASON, not to distort: `protected-paths.json` was the truth of the OLD engine, replaced by the unified gate on 17/07. The JSON only served a rollback to a dead engine.** This is NOT a Codex withdrawal: **the framework remains fully Codex-compatible**, its shells (`codex-doc-inject`, `codex-doc-write-guard`) already run on the NEW engine, hence on the frontmatters. Nothing is closed on that side and the multi-harness port remains the ambition (§2ter).
Concretely: the frontmatters are the ONLY source of rules, **`lint-corpus` INCLUDED** (it still read the JSON — leaving it would have resurrected the double write through the back door, a gate demanding a JSON entry for every new doc). `source-drift-gate` and `loader-differential` DELETED: they only existed to demand parity between 2 sources one of which is dead. `protected-paths.json` = an INERT artifact, no reader left — **NEVER write to it or maintain it again**. The "ghost rule" class is **EXTINCT BY CONSTRUCTION** (a trigger lives INSIDE its doc: deleting the doc deletes the rule) — `lint-corpus.test.js` case 5 proves it and will turn red if an EXTERNAL rule source is reintroduced.
Doctrine (the asset doctrine): NO work item left open — scaling = dropping `.md` files, the engine no longer moves.

## Going further
Extend to SSH, infra, other MCPs as pitfalls are discovered — same "document by default" reflex as the file docs.
