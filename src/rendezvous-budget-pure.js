// rendezvous-budget-pure.js — THE DECISION of the rendezvous gate, separated from its I/O.
//
// ⚠️⚠️ WHY THIS FILE EXISTS, AND IT WAS ITS OWN AUTHOR WHO WROTE THE WEAKNESS DOWN.
//    **Stryker does not mutate test code.** The verdict of `test/rendezvous-address-gate.test.js`
//    lived INSIDE that suite, so an inverted comparison — a `!==` become `===`, a `some` become
//    `every`, a floor read the wrong way round — would have stayed GREEN FOR EVER. A gate nobody
//    judges is worse than no gate at all, because it REASSURES and people stop looking. Exactly the
//    `temporal-budget-pure.js` / `quadratic-budget-pure.js` / `doctor-wiring-pure.js` precedent, and
//    the same remedy: the rule becomes PURE, hence mutable, hence proven.
//
// ⚠️ CONTRACT: ZERO I/O — no `fs`, no `path`, no `child_process`, no `process.env`, no `process.argv`,
//    no `console`, no `process.exit`. It RECEIVES what was measured and RETURNS a verdict. The gate
//    keeps the scans (ast-grep on the JavaScript, the line patterns on the declarative units, the
//    structural walk of `wiring.json`), reads `rendezvous-budget.json`, and only OBSERVES then calls.
//    🛑 NEVER put disk access back here "to simplify": that would lose the mutability which is the
//    entire justification of the file. Sealed by `layers-gate` and by dependency-cruiser
//    (`rendezvous-budget-pure-must-stay-pure`).
//
// ⚠️ THE RULE IT ENCODES — AN ADDRESS DECLARES ITSELF. Every literal by which one component REACHES
//    another (a host, a port, a URL, a pipe or socket name, a route of our own protocol) is a truth
//    two processes must spell IDENTICALLY. When they do not, NOTHING SAYS SO: no exception, no log,
//    no badge — the daemon listens here, the client knocks there, and the injection simply stops.
//    Three defects of that one class were found on 2026-08-25, hours apart, each by a human pulling
//    on a thread.
//
// 🔑 THE CHECK AN INSTANCE JUDGE CANNOT DO IS AGREEMENT (part ④ below). Two SITES holding one address
//    is not forbidden — under socket activation the operating system INSISTS on holding its own copy
//    — what is forbidden is holding two DIFFERENT ones. `daemon-http-port` has FOUR sites and until
//    this rule existed nothing on earth compared them.
//
// ⚠️ THE ORIGINS ARE A PARAMETER, NEVER A LIST COPIED HERE. They live in `rendezvous-budget.json`
//    beside the sentence that justifies each of them; a second copy in this module would be a second
//    truth, i.e. the very class this gate exists to refuse. The gate passes `Object.keys(origins)`.
//
// ⚠️ EVERY REFUSAL MESSAGE IS CONTRACT, NOT DECORATION. This repository paid 43 survivors in one go
//    for treating the DETAIL of a refusal as ornament. The sibling suite copies each string FROM
//    HERE, verbatim — and never asserts against a constant re-read from this module, which would
//    only ever prove `x === x`.

'use strict';

// ⚠️ Below this many characters nobody learns WHY an address may be written down at that site. Not a
//    style rule: a `why` shorter than a sentence is a permit granted without a reason, and a permit
//    without a reason is inherited, reason included, by the next line of that shape.
const MIN_WHY = 40;

// ⚠️ THE ONE ORIGIN THAT NAMES NO RENDEZVOUS — a MEASURED shape collision: the literal matches an
//    atom and is not an address at all. It is DECLARED rather than excluded by a rule, so the day it
//    becomes an address the line is already in front of a reader. Held as a constant because two
//    parts of this verdict must agree on the word: part ③ requires such an entry to name NOTHING,
//    part ④ steps over it, and two spellings of one word would silently split the two.
// 🛑 AND IT IS **NOT** CALLED `NOT_AN_ADDRESS` — the gate this module serves REFUSED that name, on
//    its first run, and it was right: the declarator atom matches any identifier whose word segments
//    include `ADDRESS`, so the constant would have been a rendezvous literal needing a permit in
//    `rendezvous-budget.json`. Declaring a shape collision the judge itself creates would be adding a
//    permit to escape one's own rule. NEVER rename it back.
const COLLISION_ORIGIN = 'not-an-address';

// ⚠️ A `Map` AND NEVER A PLAIN OBJECT, on BOTH sides of the comparison. `JSON.parse` returns a plain
//    object, so `sites['constructor']` yields `Object.prototype.constructor`: TRUTHY. An undeclared
//    site would then read as DECLARED, its `count` would be `undefined`, and the gate would go SILENT
//    on it — a guard that fails OPEN is worse than no guard. `Object.entries` walks OWN keys only,
//    which removes the class BY CONSTRUCTION rather than by a check nobody can test.
// ⚠️ TWO LEVELS (file → text → count) AND NOT ONE JOINED KEY. A `file + ' :: ' + text` key makes the
//    separator part of the contract: a text containing that separator would be split back into the
//    wrong pair, and the separator itself becomes a literal nothing can distinguish from noise.
const NO_TEXTS = new Map();

/**
 * What the scans really found, counted per (file, text).
 * @param {{file: string, text: string}[]} occurrences
 * @returns {Map<string, Map<string, number>>}
 */
function counts(occurrences) {
  const perFile = new Map();
  for (const o of occurrences) {
    let texts = perFile.get(o.file);
    if (!texts) {
      texts = new Map();
      perFile.set(o.file, texts);
    }
    texts.set(o.text, (texts.get(o.text) || 0) + 1);
  }
  return perFile;
}

/**
 * The manifest's declarations, in the same two-level shape as the measurement.
 * @param {Record<string, Record<string, object>>} sites
 * @returns {Map<string, Map<string, any>>}
 */
function declarations(sites) {
  const perFile = new Map();
  for (const [file, entries] of Object.entries(sites)) {
    perFile.set(file, new Map(Object.entries(entries)));
  }
  return perFile;
}

/**
 * THE VERDICT — pure, total, deterministic.
 *
 * @param {{file: string, text: string}[]} occurrences what the three scans really found
 * @param {Record<string, Record<string, {count: number, rendezvous: (string|null), value: (string|null), origin: string, why: string}>>} sites the manifest's declarations, keyed by RELATIVE path then by the exact text of the site
 * @param {Record<string, {value: string, why: string}>} rendezvous the named meeting points, each with the ONE value every site of it must write
 * @param {string[]} origins the CLOSED list of admissible origins, DERIVED from the manifest
 * @returns {string[]} faults, sorted; EMPTY when the repository is coherent
 *
 * ⚠️ Returns the LIST, never a boolean: a gate must say WHAT to fix, not just "no".
 * ⚠️ SORTED: the message must not depend on the order in which the scanner walked the disk, otherwise
 *    the same defect reads differently from one run to the next and people stop trusting the output.
 */
function verdict(occurrences, sites, rendezvous, origins) {
  const faults = [];
  const measured = counts(occurrences);
  const declared = declarations(sites);
  // ⚠️ THE RENDEZVOUS TABLE IS READ THROUGH A `Map` TOO, and this was a REAL hole
  //    found by its own suite: `rendezvous['toString']` yields the function
  //    inherited from `Object.prototype` — TRUTHY — so an unknown rendezvous named
  //    like a prototype member was ALREADY accused by part ③ and then accused a
  //    SECOND time by part ④, for writing its value against `undefined`. One
  //    mechanism for both parts, and the class disappears by construction.
  const targets = new Map(Object.entries(rendezvous));

  // ① FAIL-CLOSED — an occurrence nobody declared. An address nobody wrote down is an address nobody
  //    compared, so the default is REFUSAL and never "green unless someone remembers".
  for (const [file, texts] of measured) {
    const entries = declared.get(file);
    for (const [text, count] of texts) {
      const entry = entries ? entries.get(text) : undefined;
      if (!entry) {
        faults.push(file + ': UNDECLARED RENDEZVOUS LITERAL `' + text + '`'
          + ' — every address by which one component reaches another must be declared in'
          + ' `rendezvous-budget.json` with its rendezvous, its value and its origin.');
        continue;
      }
      // ⚠️ AN EQUALITY, NOT A CEILING. Measured above the declaration = a site appeared. Measured
      //    BELOW = a stale declaration, which widens the permit for free and in silence.
      if (entry.count !== count) {
        faults.push(file + ': COUNT DRIFT on `' + text + '` — ' + count + ' measured, '
          + entry.count + ' declared.');
      }
    }
  }

  // ② THE OTHER DIRECTION — a dormant permit. A declaration whose literal has gone gets re-inherited,
  //    reason included, by the next line of that shape. An address that MOVED is therefore red on
  //    BOTH ends, and that is the intended behaviour, not friction.
  for (const [file, entries] of declared) {
    const texts = measured.get(file) || NO_TEXTS;
    for (const [text, entry] of entries) {
      if (!texts.has(text)) {
        faults.push(file + ': DORMANT DECLARATION `' + text + '` — declared, measured NOWHERE.'
          + ' An address that MOVED is red on both ends, and that is the point: the class is'
          + ' one truth quietly acquiring a second home.');
      }
      // ③ THE DECLARATION ITSELF MUST MEAN SOMETHING.
      // ⚠️ The origin list is CLOSED and comes from the manifest: a word that fits everything
      //    justifies nothing, exactly as the temporal budget admits only two motives.
      if (!origins.includes(entry.origin)) {
        faults.push(file + ': `' + text + '` declares origin `' + String(entry.origin)
          + '`, which is not one of ' + origins.join(' / ') + '.');
      }
      if (typeof entry.why !== 'string' || entry.why.trim().length < MIN_WHY) {
        faults.push(file + ': `' + text + '` carries no usable `why`.');
      }
      if (entry.origin === COLLISION_ORIGIN) {
        // A shape collision names NOTHING. Letting it name a rendezvous would smuggle a non-address
        // into the agreement check, where it would compare a null value against a real one.
        if (entry.rendezvous !== null) {
          faults.push(file + ': `' + text + '` is declared `' + COLLISION_ORIGIN + '` yet names a rendezvous.');
        }
      } else if (!targets.has(String(entry.rendezvous))) {
        faults.push(file + ': `' + text + '` names the unknown rendezvous `'
          + String(entry.rendezvous) + '`.');
      }
    }
  }

  // ④ AGREEMENT — the check an INSTANCE judge cannot do. Every site of one rendezvous writes the SAME
  //    value, and the same one the rendezvous itself declares. THIS is the 2026-08-25 defect,
  //    generalised: one truth, several places, agreeing by luck with nothing comparing them.
  // ⚠️ WALKED SEPARATELY and not folded into ③: a declaration must be judged on its VALUE even when
  //    its own shape is already faulty, otherwise one defect would hide the next.
  for (const [file, entries] of declared) {
    for (const [text, entry] of entries) {
      // A shape collision has no value to agree about — part ③ already required it to name nothing.
      if (entry.origin === COLLISION_ORIGIN) continue;
      const target = targets.get(String(entry.rendezvous));
      // An unknown rendezvous is ALREADY named by part ③. Accusing it twice would make the red
      // non-actionable, and reading `.value` off nothing would crash the judge instead of judging.
      if (!target) continue;
      if (entry.value !== target.value) {
        faults.push('SPLIT ADDRESS on `' + String(entry.rendezvous) + '`: ' + file + ' writes `'
          + String(entry.value) + '` while the rendezvous declares `' + String(target.value)
          + '`. Two places, one truth — and on this lane a divergence is TOTALLY SILENT.');
      }
    }
  }

  return faults.sort();
}

module.exports = {
  verdict,
  MIN_WHY,
  COLLISION_ORIGIN,
};
