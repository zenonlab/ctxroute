// deps-criticality-pure.test.js — EDGE CASES of the criticality gate decisions (PURE module, mutated).
//
// ⚠️ WHAT THIS SUITE PROTECTS: the rules deciding whether the gate screams or keeps quiet. As long as
//    they lived in the gate's own file, Stryker did not mutate them — an inverted comparison would have
//    stayed green forever. Here every rule is exercised on its BOUNDS and its ADVERSARIAL inputs.
// ⚠️ HERMETIC: zero fs, zero network, zero SSH.
import { describe, test, expect } from "vitest";
import {
  EXACT_VERSION, isExactPin, pinningFaults, unclassifiedDeps, ghostEntries,
} from "../src/deps-criticality-pure.js";

const d = (name, range, where = ".") => ({ name, range, where });

describe("deps-criticality-pure", () => {
  test("isExactPin: ACCEPTS the forms designating ONE version (including pre-release and build)", () => {
    for (const v of ["1.2.3", "0.0.0", "10.20.30", "1.5.4-r.1", "2.0.0-beta.7", "1.2.3+sha.abc", "1.2.3-rc.1+b2"]) {
      expect(isExactPin(v), `"${v}" is EXACT and was rejected — a false positive, the gate will end up disabled`).toBe(true);
    }
  });

  test("isExactPin: REFUSES anything that lets npm choose (the heart of the gate)", () => {
    for (const v of ["^1.2.3", "~1.2.3", "1.2.x", "1.x", "*", "", "latest", ">=1.2.3", "<2.0.0", "1.2.3 || 2.0.0",
      "1.2", "1", "1.2.3.4", " 1.2.3", "1.2.3 ", "v1.2.3", "1.2.3-", "=1.2.3"]) {
      expect(isExactPin(v), `"${v}" was taken for an EXACT version — a drift would slip through`).toBe(false);
    }
  });

  test("isExactPin: NON-STRING inputs ⇒ false, never an exception (fail-closed)", () => {
    // ⚠️ A malformed package.json must not CRASH the gate: it must make it GO RED.
    for (const v of [null, undefined, 123, {}, [], true, NaN]) expect(isExactPin(v)).toBe(false);
  });

  test("isExactPin: ADVERSARIAL — an ARRAY containing a version does NOT pass (JS coercion)", () => {
    // ⚠️ TRAP PROVEN BY STRYKER: `/regex/.test(x)` converts its argument to a string, so
    //    `EXACT_VERSION.test(['1.2.3'])` is **true**. The `typeof` guard is what blocks that.
    expect(EXACT_VERSION.test(["1.2.3"]), "premise: the regex alone lets itself be fooled").toBe(true);
    expect(isExactPin(["1.2.3"]), "the typeof guard is gone: an array passes for exact").toBe(false);
    expect(isExactPin(new String("1.2.3"))).toBe(false);
  });

  test("EXACT_VERSION is ANCHORED on both sides (otherwise 'not-1.2.3-at-all' would pass)", () => {
    expect(EXACT_VERSION.source.startsWith("^")).toBe(true);
    expect(EXACT_VERSION.source.endsWith("$")).toBe(true);
    expect(isExactPin("prefixe1.2.3")).toBe(false);
    expect(isExactPin("1.2.3suffixe!")).toBe(false);
  });

  test("pinningFaults: reports ONLY badly pinned engines", () => {
    const deps = [d("sharp", "^1.0.0"), d("vitest", "^3.0.0"), d("other", "2.0.0")];
    const f = pinningFaults(deps, { sharp: "raison", other: "raison" });
    expect(f.map((x) => x.name)).toEqual(["sharp"]);
  });

  test("pinningFaults: the SAME dependency in 2 package.json files produces 2 faults", () => {
    const f = pinningFaults([d("m", "^1.0.0", "."), d("m", "^1.0.0", "dispatcher")], { m: "r" });
    expect(f.length).toBe(2);
    expect(f.map((x) => x.where)).toEqual([".", "dispatcher"]);
  });

  test("pinningFaults: ADVERSARIAL — a key inherited from the prototype is NOT an engine", () => {
    // ⚠️ Without `hasOwnProperty`, `engines['toString']` would be "true" (inherited from Object).
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(pinningFaults([d(name, "^1.0.0")], {}), `"${name}" taken for a classified engine`).toEqual([]);
    }
  });

  test("pinningFaults: empty/absurd inputs ⇒ [] without a throw", () => {
    expect(pinningFaults([], {})).toEqual([]);
    expect(pinningFaults(null, { m: "r" })).toEqual([]);
    expect(pinningFaults([d("m", "^1.0.0")], null)).toEqual([]);
    expect(pinningFaults([null, undefined, d("m", "1.0.0")], { m: "r" })).toEqual([]);
  });

  test("unclassifiedDeps: reports the unknown one ONLY ONCE even if declared several times", () => {
    const deps = [d("known", "^1.0.0"), d("unknownDep", "^2.0.0", "a"), d("unknownDep", "^2.0.0", "b")];
    expect(unclassifiedDeps(deps, {}, { known: "r" }).map((x) => x.name)).toEqual(["unknownDep"]);
  });

  test("unclassifiedDeps: BOTH classes count as a classification; neither ⇒ RED", () => {
    expect(unclassifiedDeps([d("m", "1.0.0")], { m: "r" }, {})).toEqual([]);
    expect(unclassifiedDeps([d("o", "^1.0.0")], {}, { o: "r" })).toEqual([]);
    expect(unclassifiedDeps([d("x", "^1.0.0")], {}, {}).length).toBe(1);
  });

  test("unclassifiedDeps: the EMPTY-list fallback fabricates NO phantom entry", () => {
    // ⚠️ A gate inventing a non-existent dependency would scream at nothing and be disabled.
    const r = unclassifiedDeps(undefined, {}, {});
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
    expect(unclassifiedDeps("not-an-array", {}, {})).toEqual([]);
    expect(unclassifiedDeps([null], {}, {})).toEqual([]);
  });

  test("ghostEntries: detects a classification nobody installs any more", () => {
    expect(ghostEntries([d("alive", "1.0.0")], { alive: "r" }, { stale: "r" })).toEqual(["stale"]);
    expect(ghostEntries([d("alive", "1.0.0")], { alive: "r" }, {})).toEqual([]);
    expect(ghostEntries([], {}, {})).toEqual([]);
    expect(ghostEntries(null, { a: "r" }, null)).toEqual(["a"]);
  });

  test("NULL entry in the list: the gate does not DIE (both functions, same input)", () => {
    // ⚠️ Kills the LAST surviving mutant of the repo (`.filter(Boolean)` removed).
    //    Without that guard, a `null` makes `.name` throw — and a gate that DIES on a malformed
    //    entry no longer reports ANYTHING. Same doctrine as the BOM-tolerant read: a gate never
    //    dies from the defect it reports.
    //    ⚠️ BOTH functions are exercised on the SAME degraded input, otherwise the robustness of
    //    one would only be luck.
    const deps = [d("a", "1.0.0"), null, undefined, d("b", "^2")];
    expect(ghostEntries(deps, { a: {} }, { b: {} })).toEqual([]);
    expect(ghostEntries(deps, { ghost: {} }, {})).toEqual(["ghost"]);
    expect(ghostEntries([null, undefined], { x: {} }, {})).toEqual(["x"]);
    expect(unclassifiedDeps(deps, { a: {} }, {}).map((x) => x.name)).toEqual(["b"]);
  });
});
