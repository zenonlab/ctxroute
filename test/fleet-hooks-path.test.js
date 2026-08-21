// ═══════════════════════════════════════════════════════════════════════
// WI-VENDOR-PATH — the fleet root has ONE definition, and it is CONSUMED
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 THE DEFECT THIS CLOSES: `vendor-deadline.js` addressed `~/.claude/hooks`
//    by rebuilding it itself (`os.homedir()` + '.claude' + 'hooks'), under its
//    own env var, while `paths.js` already owned that directory
//    (`fileDocsDir()` hangs BENEATH it, `skillsDir()` BESIDE it). That is the
//    `stateDir` defect verbatim — two copies of one truth — one level up, and
//    on the ONE script that WRITES into that directory.
//
// ⚠️ TWO ASSERTIONS, AND NEITHER IS ENOUGH ALONE:
//    ① EQUALITY — the accessor still resolves where the hardcoded form did.
//       Without it, a "clean" refactor could silently move the target and
//       vendor `deadline.js` into a folder no harness reads.
//    ② CONSUMPTION, PROVEN BY BEHAVIOUR — we set the override and the SPAWNED
//       script must report THAT directory. A source grep would be satisfied by
//       a comment; a process cannot fake where it looked.
//    Sabotage that must turn it RED: put `path.join(os.homedir(),'.claude',
//    'hooks')` back into `vendor-deadline.js` ⇒ ② fails (it reports the real
//    fleet, not the tmpdir). Change the accessor's segments ⇒ ① fails.
//
// ⚠️ DRY-RUN ONLY (never `--write`): the real fleet is in production for other
//    agents. The tmpdir is empty, so the script has nothing to arm anyway.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fleetHooksDir, fileDocsDir, skillsDir } from '../src/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(__dirname, '..', 'src', 'vendor-deadline.js');

test('① THE TARGET HAS NOT MOVED — fleetHooksDir() = the historical hardcoded form', () => {
  const sauve = process.env.CTXROUTE_FLEET_HOOKS_DIR;
  delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
  try {
    assert.strictEqual(
      fleetHooksDir(),
      path.join(os.homedir(), '.claude', 'hooks'),
      'the accessor no longer resolves where vendor-deadline.js used to write'
    );
    // The two siblings prove the SHAPE of the tree, which is what makes this
    // the right root and not an arbitrary one.
    assert.strictEqual(fileDocsDir(), path.join(fleetHooksDir(), 'docs'), 'fileDocsDir must hang BENEATH the fleet root');
    assert.strictEqual(skillsDir(), path.join(os.homedir(), '.claude', 'commands'), 'skillsDir must stay BESIDE it');
  } finally {
    if (sauve === undefined) delete process.env.CTXROUTE_FLEET_HOOKS_DIR;
    else process.env.CTXROUTE_FLEET_HOOKS_DIR = sauve;
  }
});

test('② THE ACCESSOR IS REALLY CONSUMED — vendor-deadline.js targets what paths.js says', () => {
  const faux = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-root-'));
  const r = spawnSync(process.execPath, [VENDOR], {
    env: { ...process.env, CTXROUTE_FLEET_HOOKS_DIR: faux },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `dry-run must succeed on an existing folder — stderr: ${r.stderr}`);
  // ⚠️ We assert on the ANNOUNCED target, i.e. the directory the script really
  //    resolved — never on the presence of a `require('./paths')` in its source.
  assert.ok(
    r.stdout.includes(`target         : ${faux}`),
    `vendor-deadline.js ignored the paths.js override (still rebuilding the root itself?) — stdout: ${r.stdout}`
  );
});
