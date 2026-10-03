// ═══════════════════════════════════════════════════════════════════════
// vitest-projects.mjs — THE SUITE CLASSIFICATION, **DERIVED FROM THE CODE**
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (measured 15/08/2026, and it is a RELAPSE).
//    The full suite took **212 s** and the friction came back exactly where
//    it had been "fixed" in July — by an INSTRUCTION ("target the relevant
//    suite"). An instruction depends on vigilance, so it gives way; that is
//    the law of this repository and it just proved itself on the agent
//    itself. ⚠️ **Nothing bounded the growth**: the suite grows with every
//    work session (73 files), nobody watches — *monotonic growth = a dated
//    outage*, the disk doctrine applied to TIME.
//
// 📐 THE DECIDING MEASUREMENT: `import 274 s` for `tests 188 s`. **The cost
//    is environment startup, not assertions.** Official Vitest doc (read
//    15/08/2026, `vitest.dev/guide/improving-performance`):
//    `isolate: false` "disables the separate per-file environment" and
//    speeds things up significantly — **on the condition** that the project
//    "does not rely on side effects and cleans up its state".
//
// 🛑 THAT CONDITION IS WHAT DICTATES THE CLASSIFICATION, and it is DERIVED,
//    never hand-listed (a list is born stale at the next suite):
//      • a suite that **SPAWNS a process** (`spawnSync`, `execFile`, …) ⇒ it
//        writes real state, it is HEAVY and NON-ISOLABLE → `integration`;
//      • a suite that **MUTATES `process.env`/`chdir`** ⇒ without isolation,
//        its pollution would leak into other files → `integration`;
//      • everything else = PURE decision, no side effect (invariant already
//        guarded by dependency-cruiser) → `unit`, isolation disabled.
//
// ⚠️ INDUSTRY EQUIVALENT: Google's "test sizes" (small/medium/large), where
//    the size is DECLARED and **enforced by the machine** — a "small" test
//    that touches the network fails. Here the file's content decides, so
//    nobody can pick the wrong box.
//
// 🛑 NO PROOF IS REMOVED: `vitest run` without a filter launches EVERYTHING
//    (CI, before any switchover). Only the edit loop narrows — staging in
//    TIME (presubmit/postsubmit), never a deletion.
//
// ⚠️ Do NOT enable `experimental.fsModuleCache` (suggested by the same doc):
//    it persists the module graph ON DISK, it is `experimental`, and **its
//    growth is neither documented nor bounded**. Doctrine: everything that
//    writes declares a cap + eviction in the same move. Without a
//    measurement, no.
// ═══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

// ⚠️ Markers = WHAT MAKES A SUITE NON-ISOLABLE, not "what is slow".
//    The criterion is the CAUSE (side effect), never the symptom (duration):
//    a duration is measured after the fact, a cause is decided before.
const SPAWN = /spawnSync|execFileSync|execSync|child_process|spawn\(/;
const GLOBAL_STATE = /process\.env\.[A-Z_]+\s*=|delete process\.env|process\.chdir/;
// 🔴 THE THIRD MARKER, AND IT ANSWERS A DIFFERENT QUESTION FROM THE OTHER TWO
//    (2026-09-20). They ask "can this suite be ISOLATED in a thread"; this one
//    asks "does this suite compete for a MACHINE-WIDE resource" — a real
//    listening address. Two suites that each bind ports, fork daemons and kill
//    them do not merely slow each other down: they take each other's addresses,
//    reset each other's connections, and redden on `ECONNRESET` or
//    `ETIMEDOUT` with no assertion in sight.
// 📐 MEASURED, and it is why this exists: `dual-transport` renders 5/5 ALONE,
//    twice in a row, and reddens beside `http-daemon-lifecycle` or
//    `stale-code-guard`. The same shape hit `http-listeners`, `collect-scope`,
//    `state-daemon`, `thread-listener`, `serve-stall-concurrency` and the
//    thread-pool differential — 16 reds on one full run, ZERO of them an
//    assertion. **A red that is really a race is a red people stop reading.**
// 🛑 DERIVED FROM CONTENT LIKE ITS TWO SIBLINGS, never a hand list: a suite
//    that starts binding an address tomorrow joins this lane by itself. The
//    marker is the ACT of listening (`.listen(`) or of reaching the daemon's
//    own shells, never the file's name and never its duration.
// ⚠️ `support/free-port` joined on 2026-09-23: the shared allocator binds its
//    probes itself, so a suite that asks it for ports no longer writes `.listen(`
//    and would otherwise slip out of this lane with the very act that puts it here.
const BINDS_ADDRESS = /\.listen\(|http-daemon\.js|support\/free-port/;
// 🔴 A PORT IS NOT THE ONLY MACHINE-WIDE RESOURCE — MEASURED 2026-09-20, AND THE
//    RACE CAME BACK THROUGH THIS DOOR. The RENDEZVOUS (a named pipe on Windows,
//    an abstract socket on Linux) is one too, and it is derived from the served
//    state directory. Three suites fork a daemon that TAKES one without ever
//    writing `.listen(` — so they kept running concurrently, and
//    `state-daemon` reddened in a full heavy-lane run while passing alone.
// 🛑 TWO CONDITIONS, AND THE SECOND IS WHAT KEEPS THIS HONEST: naming the
//    rendezvous is not taking one. `kernel-endpoint.test.js` computes ADDRESSES
//    and binds nothing — it merely quotes `fork(` inside a comment, which is the
//    exact shape that dragged four static judges into the slow lane this
//    morning. The launcher must therefore be matched on a line of CODE, never on
//    a mention: a leading `//` or `*` disqualifies it.
// ⚠️ MEASURED BEFORE BEING KEPT: 4 suites match the rendezvous alone, 3 once the
//    launcher must be real — and the one that drops out is precisely the pure one.
const RENDEZVOUS = /kernel-endpoint|kernelAddress/;
const REAL_LAUNCHER = /^(?!\s*(?:\/\/|\*))[^\n]*\b(?:fork|spawn|spawnSync|execFile|execFileSync)\s*\(/m;
const TAKES_RENDEZVOUS = (src) => RENDEZVOUS.test(src) && REAL_LAUNCHER.test(src);

/**
 * Classifies the folder's suites into `unit` / `integration`. PURE (read-only).
 * @returns {{ unit: string[], integration: string[] }}
 */
export function classifySuites(root, excluded) {
  const excludedSet = new Set(excluded || []);
  const unit = [];
  const integration = [];
  const daemon = [];
  for (const f of fs.readdirSync(path.join(root, 'test'))) {
    if (!f.endsWith('.test.js') || excludedSet.has(f)) continue;
    const src = fs.readFileSync(path.join(root, 'test', f), 'utf8');
    const heavy = SPAWN.test(src) || GLOBAL_STATE.test(src);
    // ⚠️ THE ADDRESS LANE WINS OVER THE OTHER TWO, and the order is the point:
    //    a suite that binds is ALSO usually a spawning one, and what decides
    //    whether it can run beside its neighbours is the ADDRESS, never the
    //    spawn. Asking the cheaper question first would file it in a lane that
    //    lets it race.
    if (BINDS_ADDRESS.test(src) || TAKES_RENDEZVOUS(src)) daemon.push('test/' + f);
    else if (heavy) integration.push('test/' + f);
    else unit.push('test/' + f);
  }
  return { unit, integration, daemon };
}

export const MARKERS = { SPAWN, GLOBAL_STATE, BINDS_ADDRESS, RENDEZVOUS, REAL_LAUNCHER };

// ⚠️ INSPECTION CLI (`npm run test:lanes`) — the classification is DERIVED,
//    hence invisible when reading an `include`. A third party must be able to
//    see, in ONE command, what runs in which lane, without launching a test
//    or reading this code.
//    🛑 It writes NOTHING and decides NOTHING: read-only, like any diagnostic.
// ⚠️ Comparison by RESOLVED path: on Windows, `import.meta.filename` and
//    `process.argv[1]` do not match byte-for-byte (separators/case) — the
//    guard stayed SILENT, and the command printed nothing. Measured 15/08.
if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) {
  const { unit, integration, daemon } = classifySuites(import.meta.dirname, []);
  console.log(`\nFAST LANE   (npm test)            ${unit.length} suites — none spawns, none mutates the env`);
  console.log(`HEAVY LANE  (npm run test:int)    ${integration.length} suites — process spawn or global state`);
  console.log(`DAEMON LANE (npm run test:daemon) ${daemon.length} suites — they BIND a real address, so they run ONE AT A TIME\n`);
  for (const f of integration.sort()) console.log('  heavy : ' + f);
  for (const f of daemon.sort()) console.log('  daemon: ' + f);
}
