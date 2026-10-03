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
// ⚠️ `state/` IS IGNORED AND IT IS NOT HYGIENE — MEASURED 2026-09-19 after FOUR
//    intermittent reds. It is where `lock.js` takes its locks, as DIRECTORIES
//    created and removed by `mkdir`/`rmdir` in milliseconds. A parallel suite
//    takes one, this walk sees it in `readdirSync`, and `statSync` lands after
//    the `rmdir`: ENOENT, the walk throws, and vitest reports the exception
//    against whichever cell was running — which spoke of phantom dependencies
//    that were never measured. It holds runtime state, never a sub-package.
const IGNORE = new Set(["node_modules", ".git", ".stryker-tmp", "coverage", "reports", "dist", "state"]);

/** The disk, as the walk sees it. Replaced ONLY by the cells that drive the races. */
const walkInternals = { readdir: readdirSync, stat: statSync };

// List of package.json files DERIVED from the tree, never written down — a sub-package added later is
// covered without anyone thinking about it.
// 🛑 THE DISK READS ARE INJECTED so the two guards below can be DRIVEN. They
//    exist for races a real machine produces at random — a lock taken by a
//    parallel suite, a directory gone between the read and the stat — and a
//    guard nobody can make fail is a guard ASSUMED to work. Default to `fs`, so
//    every real caller is untouched.
function packageManifests(dir = ROOT, out = [], io = walkInternals) {
  for (const e of io.readdir(dir)) {
    if (IGNORE.has(e)) continue;
    const p = path.join(dir, e);
    if (e === "package.json") { out.push(p); continue; }
    // 🛑 A VANISHED ENTRY IS SKIPPED, NEVER FATAL. A tree changes under any
    //    walker on a live machine, and a judge that DIES of it reports a defect
    //    that does not exist — paid four times on 2026-09-19. What disappeared
    //    between the read and the stat cannot be the manifest we are looking
    //    for: it was there a microsecond ago and is gone now. 🛑 This swallows
    //    NOTHING else — only the entry that no longer exists.
    let stats;
    try { stats = io.stat(p); } catch (err) {
      if (err && err.code === "ENOENT") continue;
      throw err;
    }
    if (stats.isDirectory()) packageManifests(p, out, io);
  }
  return out;
}

function allDeps() {
  const out = [];
  for (const file of packageManifests()) {
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

    const fake = { [surPlage.name]: "FAKE ENGINE — present ONLY to prove the gate bites." };
    // ⚠️ Expected count DERIVED from reality, never written as "1": the same dependency can be declared
    //    in SEVERAL package.json files — each declaration must produce its fault. Hard-coding 1 makes
    //    the test red for the wrong reason (experienced while installing it, on a multi-package repo).
    const expected = deps.filter((d) => d.name === surPlage.name && !isExactPin(d.range)).length;
    expect(expected).toBeGreaterThanOrEqual(1);
    expect(pureFaults(deps, fake)).toHaveLength(expected);
    // And the converse: correctly pinned, it must NOT be reported (no gate that screams wrongly).
    expect(pureFaults([{ ...surPlage, range: "1.2.3" }], fake)).toEqual([]);
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

// ═══════════════════════
// THE WALK ITSELF — the class that reddened FOUR times in one day
// ═══════════════════════
// 🔴 MEASURED 2026-09-19: this judge did not FAIL an assertion, it THREW —
//    `ENOENT: stat 'state\\.lock-doc-unknown'` — and vitest attributes an
//    exception to whichever cell is running, which happened to be the one about
//    phantom dependencies. It had never measured a phantom. The walk was inside
//    `state/`, where `lock.js` takes its locks as DIRECTORIES created and removed
//    in milliseconds; a parallel suite took one between the read and the stat.
//    It was never random — it was racing a lock, which is exactly why it was
//    always green alone. Four evenings were filed "not reproduced in isolation".
describe("the walk that finds the manifests", () => {
  test("`state/` is ignored — it is where the LOCKS live, and they vanish mid-walk", async () => {
    expect(IGNORE.has("state"), "`state/` must be ignored").toBe(true);
    // 🔑 ANTI-VACUITY: a name in a list proves nothing about WHY. This asks the
    //    OWNER of the lock address where locks go, and requires it to be the
    //    very folder the guard excludes.
    // 🛑 It does NOT take a real lock: `state/` belongs to the LIVE daemon, and
    //    blocking production to prove a point about a test is the "never share a
    //    window between observation and intervention" rule, broken again.
    const { docLockDir } = await import("../src/store-resolve.js");
    const address = docLockDir("walk-probe-session");
    expect(
      path.relative(ROOT, address).replace(/\\/g, "/").startsWith("state/"),
      `the lock address is ${address} — if locks no longer live under state/, this guard now excludes the WRONG folder and the walk is unprotected`,
    ).toBe(true);
  });

  test("an entry that VANISHES between the read and the stat is skipped, never fatal", () => {
    // The exact race, made deterministic: the entry is listed, then the stat
    // says it is gone — which is what a released lock looks like.
    const vanished = {
      readdir: (d) => (d === "/root" ? ["gone", "package.json"] : []),
      stat: (f) => {
        if (f.endsWith("gone")) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
        return { isDirectory: () => false };
      },
    };
    let found = null;
    let threw = null;
    try { found = packageManifests("/root", [], vanished); } catch (err) { threw = err; }
    expect(threw, `the walk DIED on a vanished entry: ${threw && threw.message}`).toBe(null);
    expect(found.length, "and it must still return the manifest it was looking for").toBe(1);
    expect(found[0].endsWith("package.json")).toBe(true);
  });

  test("ONLY ENOENT is swallowed — a permission error still kills the judge", () => {
    // 🛑 A walker that swallows EVERY error cannot report a broken disk. The
    //    repair must stay narrow, or it becomes the next silent hole.
    const denied = {
      readdir: () => ["locked"],
      stat: () => { const e = new Error("EACCES"); e.code = "EACCES"; throw e; },
    };
    let threw = null;
    try { packageManifests("/root", [], denied); } catch (err) { threw = err; }
    expect(threw && threw.code, "EACCES must propagate — the ENOENT repair may not hide a real problem")
      .toBe("EACCES");
  });
});
