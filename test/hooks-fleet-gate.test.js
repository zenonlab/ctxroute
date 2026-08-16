// ═══════════════════════════════════════════════════════════════════════
// FLEET GATE — no hook of ~/.claude/hooks/ can turn into a zombie
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS GATE COVERS WHAT `deadline-gate.test.js` DOES NOT SEE.
//    The other one only reads THIS repo (2 hooks). The real fleet is 7 more
//    hooks in `~/.claude/hooks/` — including `statusline.js`, THE culprit of
//    the 875 zombies of 15/07/2026 (20 h of survival, 26 GB). Without this
//    test, the rule would be proven on the 2 files that had never leaked, and
//    absent on the 7 that do. A principle applied to 22 % of the fleet is not
//    engineering, it is an intention.
//
// ⚠️ SKIP ON A FRESH CLONE — PUBLIC repo: it must NEVER require the existence
//    of `~/.claude/hooks/`. Skipping is NOT failing (cf gitignore.md, lesson
//    of 15/07/2026: a repo gate must hold on a fresh clone).
//
// ⚠️ NEVER add an exception "that one does not need it". The hook that "does
//    not need it" is exactly the one that will zombify. A file either does
//    not read stdin OR it carries a deadline. There is no 3rd case.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PARC = path.join(os.homedir(), '.claude', 'hooks');
const present = fs.existsSync(PARC);

// A HOOK = a .js that reads stdin. ⚠️ Derived from the CONTENT, never from a
// hand-written list: a list forgets the next file added — the exact hole we
// are closing.
// ⚠️ SHARED predicates — the gate AND its negative-check below use the SAME
//    functions. Duplicating them would make the sabotage prove a twin.
const readsStdin = (src) => /process\.stdin/.test(src) || /require\(['"]\.\/stdin-json['"]\)/.test(src);
const hasDeadline = (src) => /require\(['"]\.\/deadline['"]\)/.test(src) && /\barm\s*\(/.test(src);

function hooksDuParc() {
  return fs
    .readdirSync(PARC)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => ({ name: f, src: fs.readFileSync(path.join(PARC, f), 'utf8') }))
    .filter((h) => readsStdin(h.src))
    // `deadline.js` itself = the vendored copy, it IS the deadline.
    .filter((h) => h.name !== 'deadline.js');
}

test(
  'no hook of ~/.claude/hooks/ reads stdin without a deadline',
  { skip: !present && 'no ~/.claude/hooks/ (fresh clone / other machine)', timeout: 300000 },
  () => {
    const hooks = hooksDuParc();

    // ⚠️ Zero hook detected = a blind gate that would go GREEN forever.
    //    Already lived through on 15/07/2026 on deadline-gate.test.js: it only
    //    looked for `process.stdin` and analysed NO real hook. An empty gate
    //    CERTIFIES.
    assert.ok(hooks.length > 0, `no stdin-reading hook detected in ${PARC} — blind gate, check hooksDuParc()`);

    const nus = hooks.filter((h) => !hasDeadline(h.src)).map((h) => h.name);

    assert.deepStrictEqual(
      nus,
      [],
      `${nus.length}/${hooks.length} fleet hook(s) WITHOUT a deadline → guaranteed zombie when the harness ` +
        `does not close stdin (Claude Code Windows bug #68626 — 875 zombies measured on 15/07/2026).\n` +
        `Fix in EACH of them, before any I/O:\n` +
        `  const deadline = require('../src/deadline');\n` +
        `  deadline.arm();`
    );
  }
);

test('NEGATIVE: the predicates really BITE (in-memory sabotage, never a real file)', () => {
  // 🛑 Without this part, a broken regex would make the gate green while
  //    classifying every hook as safe — the exact class paid on 16/08/2026
  //    (leak derivation inert, green by vacuity). Same predicates as the gate:
  //    a twin here would prove nothing.
  const bare = "const x = require('./stdin-json');\nconsole.log('no deadline here');\n";
  assert.ok(readsStdin(bare), 'a stdin-json reader must be seen as a hook');
  assert.ok(!hasDeadline(bare), 'SABOTAGE NOT DETECTED: a bare hook would pass as protected');

  const rawStdin = 'process.stdin.on("data", () => {});\n';
  assert.ok(readsStdin(rawStdin), 'a raw process.stdin reader must be seen as a hook');

  const armed = "const deadline = require('./deadline');\ndeadline.arm();\nconst y = require('./stdin-json');\n";
  assert.ok(readsStdin(armed) && hasDeadline(armed), 'a protected hook must NOT be reported');

  // A require without arm() is NOT protection: the timer never starts.
  const requireOnly = "const deadline = require('./deadline');\nconst z = require('./stdin-json');\n";
  assert.ok(!hasDeadline(requireOnly), 'require without arm() must count as BARE');
});
