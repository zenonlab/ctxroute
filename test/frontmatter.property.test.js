// ═══════════════════════════════════════════════════════════════════════
// PROPERTY-BASED — frontmatter.js (parser → AUTOMATIC property-based testing)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ A parser receives bytes written by HUMANS and by MIGRATION SCRIPTS.
//    Hand-written cases only cover what the author thought of — that is
//    exactly the hole that let through the `serverName` bug of lib-pure.js
//    (found by fast-check in 259 runs, missed by 117 deterministic tests).
//
// ⚠️ NOT run by Stryker (unit only): any guard proven here MUST ALSO have
//    its deterministic case in frontmatter.test.js, otherwise the mutant survives.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fc from 'fast-check';
import { parse, validate } from '../src/frontmatter.js';

const RUNS = { numRuns: 1000 };

test('TOTALITY — parse NEVER throws, on any string whatsoever', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      parse(s);
      return true;
    }),
    RUNS
  );
});

test('TOTALITY — parse NEVER throws, even on generated fake frontmatter', () => {
  // A generator that targets the DANGER ZONE: real delimiters, hostile content.
  const inner = fc.string();
  const doc = fc.tuple(inner, fc.string()).map(([a, b]) => `---\n${a}\n---\n${b}`);
  fc.assert(
    fc.property(doc, (s) => {
      parse(s);
      return true;
    }),
    RUNS
  );
});

test('TOTALITY — validate NEVER throws on an arbitrary object', () => {
  fc.assert(
    fc.property(fc.object(), (o) => {
      assert.ok(Array.isArray(validate(o)));
      return true;
    }),
    RUNS
  );
});

test('WITHOUT FRONTMATTER — the body is the FULL text, never truncated', () => {
  // ⚠️ A critical invariant: a doc without a declaration must keep its whole content.
  //    Truncating = silently amputating a doc inside the agent's context.
  fc.assert(
    fc.property(
      fc.string().filter((s) => !/^﻿?---[ \t]*\r?\n/.test(s)),
      (s) => {
        const r = parse(s);
        assert.strictEqual(r.body, s);
        assert.strictEqual(r.hasFrontmatter, false);
        assert.deepStrictEqual(r.data, {});
        return true;
      }
    ),
    RUNS
  );
});

test('ROUND-TRIP — a written declaration is read back identically', () => {
  const key = fc.constantFrom('match', 'mode', 'rank', 'confirm');
  const safeStr = fc
    .string({ minLength: 1 })
    .filter((s) => s.trim() === s && s !== '' && !/[\r\n:'"\[\]#]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) && s !== 'true' && s !== 'false');

  fc.assert(
    fc.property(safeStr, fc.string(), (v, body) => {
      const r = parse(`---\nmatch: ${v}\n---\n${body}`);
      assert.strictEqual(r.data.match, v);
      assert.strictEqual(r.body, body);
      return true;
    }),
    RUNS
  );
  void key;
});

test('ROUND-TRIP — a written list [a, b] is read back as an array', () => {
  const item = fc
    .string({ minLength: 1 })
    .filter((s) => s.trim() === s && !/[\r\n,:'"\[\]#]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) && s !== 'true' && s !== 'false');
  fc.assert(
    fc.property(fc.array(item, { minLength: 1, maxLength: 5 }), (items) => {
      const r = parse(`---\nmatch: x\nscope: [${items.join(', ')}]\n---\nbody`);
      assert.deepStrictEqual(r.data.scope, items);
      return true;
    }),
    RUNS
  );
});

test('SECURITY — a doc WITHOUT `match` is ALWAYS invalid (never silent)', () => {
  // ⚠️ THE property that protects against the bug this refactor is meant to kill:
  //    a doc without a trigger must never be « accepted but inert ».
  fc.assert(
    fc.property(fc.object(), (o) => {
      const data = { ...o };
      delete data.match;
      assert.ok(validate(data).length > 0, 'a doc without match accepted = a doc dead in silence');
      return true;
    }),
    RUNS
  );
});

test('MULTI-MATCH — a list of patterns is ALWAYS accepted', () => {
  // ⚠️ REGRESSION SEALED (15/07/2026): validate() only accepted `match: <string>`.
  //    Measured on the real rules: 98 of the 288 docs are targeted by SEVERAL
  //    patterns → a third of the fleet would have been rejected by the migration gate.
  const pat = fc.string({ minLength: 1 }).filter((s) => s.trim() !== '');
  fc.assert(
    fc.property(fc.array(pat, { minLength: 1, maxLength: 6 }), (pats) => {
      assert.deepStrictEqual(validate({ match: pats }), [], `list rejected: ${JSON.stringify(pats)}`);
      return true;
    }),
    RUNS
  );
});

test('MULTI-MATCH — an EMPTY or badly typed list stays ALWAYS rejected', () => {
  // The counterpart: accepting lists must not open the door to empty triggers.
  fc.assert(
    fc.property(fc.oneof(fc.constant([]), fc.array(fc.integer(), { minLength: 1 }), fc.constant(''), fc.constant('   ')), (bad) => {
      assert.ok(validate({ match: bad }).length > 0, `invalid match accepted: ${JSON.stringify(bad)}`);
      return true;
    }),
    RUNS
  );
});

test('SECURITY — an unknown key is ALWAYS rejected (typo = a dead doc)', () => {
  const typo = fc.string({ minLength: 1 }).filter((s) => !['match', 'scope', 'exclude', 'mode', 'confirm', 'rank'].includes(s));
  fc.assert(
    fc.property(typo, (k) => {
      const errs = validate({ match: 'x', [k]: 'v' });
      assert.ok(errs.length > 0, `unknown key ${JSON.stringify(k)} accepted`);
      return true;
    }),
    RUNS
  );
});

test('IDEMPOTENCE — re-parsing an already extracted body no longer changes it', () => {
  fc.assert(
    fc.property(fc.string(), (body) => {
      const once = parse(`---\nmatch: x\n---\n${body}`).body;
      const twice = parse(once).body;
      // ⚠️ Except if the body itself starts with a frontmatter — a legitimate case,
      //    in which case we only check the absence of a crash (totality already covered).
      if (!/^﻿?---[ \t]*\r?\n/.test(once)) assert.strictEqual(twice, once);
      return true;
    }),
    RUNS
  );
});
