// deps-criticality-gate.test.js — GATE: every dependency is CLASSIFIED, and every ENGINE is EXACTLY PINNED.
//
// ⚠️ WHY HERE (fleet propagation, 30/07/2026): the gate was born in another repo of the fleet after a
//    measured asymmetry — the VIDEO engine exactly pinned, the 3 SVG engines left on carets IN
//    PRODUCTION for months, because **nothing checked it**. The CLAUDE.md doctrine requires propagating
//    an improvement to the fleet IN THE SAME GESTURE: without that, the other repos keep an INVISIBLE
//    handicap.
// ⚠️⚠️ THIS REPO HAS NO ENGINE TODAY — AND THAT IS EXACTLY THE DANGEROUS CASE. A gate whose scope is
//    EMPTY is a DORMANT gate: it goes green without checking anything, and the day someone adds a
//    rendering engine on a caret, nobody knows whether it would have bitten. Hence the ANTI-DORMANCY
//    test below: it fabricates a FAKE badly pinned engine and requires the checker to reject it. The
//    mechanism is proven alive even with zero real engines.
// ⚠️ ASSUMED CROSS-REPO DUPLICATION: this gate is deliberately copied into every repo of the fleet
//    rather than factored into a shared package. A repo MUST stand alone (GitHub = bonus, never a
//    production dependency); a common brick would create an inter-repo coupling worse than the copy.
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// ⚠️ The RULES live in `deps-criticality-pure.js` (mutated by Stryker) — a gate only OBSERVES.
//    A decision locked inside a test file is never mutated, hence never proven.
import { isExactPin, pinningFaults as pureFaults, unclassifiedDeps, ghostEntries } from "../src/deps-criticality-pure.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ⚠️ BOM TOLERATED ON READ — found while installing this gate: `package.json` carried a UTF-8 BOM (a
// Windows editor), and `JSON.parse` THROWS on it while npm accepts it. Result: the tooling reading the
// manifest dies on a file the package manager finds perfectly valid. The BOM was removed, but a gate
// must not DIE on the very defect it is supposed to report.
const lireJson = (f) => JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));
const MANIFEST = lireJson(path.join(ROOT, "deps-criticality.json"));

// ⚠️ Folders carrying package.json files that are NOT ours (dependencies, tool sandboxes).
const IGNORE = new Set(["node_modules", ".git", ".stryker-tmp", "coverage", "reports", "dist"]);

// List of package.json files DERIVED from the tree, never written down — a sub-package added later is
// covered without anyone thinking about it.
function packageJsons(dir = ROOT, out = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e)) continue;
    const p = path.join(dir, e);
    if (e === "package.json") out.push(p);
    else if (statSync(p).isDirectory()) packageJsons(p, out);
  }
  return out;
}

function allDeps() {
  const out = [];
  for (const file of packageJsons()) {
    const where = path.relative(ROOT, path.dirname(file)).replace(/\\/g, "/") || ".";
    const pkg = lireJson(file);
    for (const block of ["dependencies", "devDependencies"]) {
      for (const [name, range] of Object.entries(pkg[block] || {})) out.push({ name, range, where });
    }
  }
  return out;
}

describe("dependency criticality", () => {
  test("every dependency is CLASSIFIED in deps-criticality.json (unclassified = RED, never a silent oversight)", () => {
    const deps = allDeps();
    // ⚠️ ANTI-HOLLOW-GATE: if discovery broke (IGNORE too broad, folder renamed), this test would go
    //    green while checking NOTHING.
    expect(deps.length).toBeGreaterThanOrEqual(5);

    const unknown = unclassifiedDeps(deps, MANIFEST.engine, MANIFEST.ordinary).map((d) => `${d.name} (${d.where})`);
    expect(
      unknown,
      `\nUNCLASSIFIED DEPENDENC(IES):\n  ${unknown.join("\n  ")}\n\n=> Add each one to deps-criticality.json under "engine" (it DETERMINES the delivered output ⇒ EXACT pinning mandatory) or "ordinary" (it does not change the output ⇒ caret desirable), with the REASON. Deciding IS the point of the gate.\n`,
    ).toEqual([]);
  });

  test("every dependency classified `engine` is EXACTLY PINNED (no ^, no ~, no range)", () => {
    const faults = pureFaults(allDeps(), MANIFEST.engine).map((d) => `${d.where} · ${d.name} = "${d.range}" — classified ENGINE ⇒ MUST be pinned EXACTLY.`);
    expect(faults, `\n${faults.join("\n")}\n`).toEqual([]);
  });

  test("ANTI-DORMANCY: the checker BITES, even though this repo has no engine today", () => {
    // ⚠️ WITHOUT THIS TEST, the previous gate would be MEANINGLESS here: zero classified engines ⇒ zero
    //    possible faults ⇒ eternal green. So we prove the mechanism on a FAKE engine: we take a real
    //    dependency of the repo (necessarily on a caret) and declare it an engine for the test's
    //    duration.
    const deps = allDeps();
    const surPlage = deps.find((d) => !isExactPin(d.range));
    expect(surPlage, "no dependency on a range: impossible to prove the gate bites").toBeTruthy();

    const factice = { [surPlage.name]: "FAKE ENGINE — present ONLY to prove the gate bites." };
    // ⚠️ Expected count DERIVED from reality, never written as "1": the same dependency can be declared
    //    in SEVERAL package.json files — each declaration must produce its fault. Hard-coding 1 makes
    //    the test red for the wrong reason (experienced while installing it, on a multi-package repo).
    const expected = deps.filter((d) => d.name === surPlage.name && !isExactPin(d.range)).length;
    expect(expected).toBeGreaterThanOrEqual(1);
    expect(pureFaults(deps, factice)).toHaveLength(expected);
    // And the converse: correctly pinned, it must NOT be reported (no gate that screams wrongly).
    expect(pureFaults([{ ...surPlage, range: "1.2.3" }], factice)).toEqual([]);
  });

  test("the manifest classifies NO phantom dependency (an entry nobody installs any more)", () => {
    // ⚠️ An entry nobody writes gives a FALSE impression of coverage. The manifest must reflect reality
    //    IN BOTH DIRECTIONS.
    const ghosts = ghostEntries(allDeps(), MANIFEST.engine, MANIFEST.ordinary);
    expect(
      ghosts,
      `entr(ies) of deps-criticality.json that NO package.json installs: ${ghosts.join(", ")} — remove them (a phantom classification suggests a coverage that does not exist)`,
    ).toEqual([]);
  });
});
