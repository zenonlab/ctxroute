// ═══════════════════════════════════════════════════════════════════════
// SERVICE UNITS GATE — the exit code stops living in five places
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 WHY THIS FILE EXISTS (2026-08-20). The three OS units, their README and the
//    injectable doc all NAME the daemon's stale-code exit status. That is five
//    hand-written copies of one number owned by `src/hooks/http-server.js`, and
//    the number ALREADY moved once (75 → 90) on the day it was written. A copy
//    that drifts here is not cosmetic: a unit that documents the wrong code sends
//    the next maintainer to configure the wrong thing, and the failure mode of
//    this whole lane is a supervisor that reads "job done" and leaves the daemon
//    dead while showing green.
//
// 🔑 WHY 90 AND NOT 75 — the fact this gate protects. 75 is `EX_TEMPFAIL`;
//    systemd ALIASES that number and prints it in its own manual as Example 1:
//    "Exit status 75 (TEMPFAIL), 250, and the termination signal SIGKILL are
//    considered clean service terminations." Copying a manual's example is the
//    NORMAL way to read a manual, so with 75 an ordinary gesture disarmed the
//    restart silently. 90 is outside every alias and outside that example.
//    ⚠️ The lesson was NOT "write a warning". Prose is not a rule — which is why
//    the second half of this gate makes `SuccessExitStatus=` mechanically absent.
//
// ⚠️ DERIVED, NEVER RE-TYPED: the expected value is READ from the module's own
//    export. There is no literal `90` anywhere in this file, so moving the
//    constant moves the gate with it, and a file that missed the move reddens.
// ⚠️ HISTORICAL is the twin of an EXEMPTIONS table, with the same INVERSE check:
//    a retired code may still be QUOTED (the systemd manual quotation is the
//    reason we avoid 75 and must survive), but the moment nothing quotes it any
//    more the entry has to go — a stale allowance is a hole reopened in silence.
// ⚠️ ANTI-VACUITY IS THE POINT, not a formality: a path that stops resolving
//    looks EXACTLY like five perfect files. Every floor below exists so that
//    "measured nothing" can never be reported as "all good".
// 🛑 SEEN RED BY IN-MEMORY SABOTAGE ONLY. Never write a broken unit to disk to
//    prove a gate: a crash mid-test leaves the repository holding the sabotage.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

// ⚠️ TEST-ONLY ROOT, and it is what lets this gate be SEEN RED end to end without
//    ever writing a broken unit into the repository: the negative-check points it
//    at a sabotaged COPY in the OS tmpdir. Same isolation pattern as `paths.js`.
// 🛑 NOT a bypass: every floor below applies to whatever root it names, so an
//    empty or truncated directory reddens instead of certifying. Unset in CI and
//    in every normal run — the default is the repository itself.
const ROOT = process.env.CTXROUTE_SERVICE_GATE_ROOT || REPO;

// ⚠️ THE DERIVATION. Importing is safe by construction: `http-server.js` guards
//    its lifecycle behind `require.main === module`, so nothing listens, nothing
//    watches, nothing exits. We take the RUNTIME value, not a parsed literal —
//    a regex over the source would agree with a constant that was commented out.
const { EXIT_STALE_CODE } = require('../src/hooks/http-server.js');

// ⚠️ THE CORPUS IS A DECLARED LIST, and it must be: these files have no shared
//    shape to derive from (an ini, a plist, an XML, two markdowns). What protects
//    it from rotting is the existence floor below — a renamed file is RED, never
//    silently dropped. The published mirror under `~/.claude/hooks/docs/` is NOT
//    scanned here: `mirror-sync-gate` already compares it byte for byte, and a
//    second judge of the same fact would be a twin that drifts.
const CORPUS = [
  'service/ctxroute-http.service',
  'service/com.ctxroute.http.plist',
  'service/ctxroute-http.task.xml',
  'service/README.md',
  'docs/framework/service-units.md',
];

// 🛑 A RETIRED exit code, allowed to appear ONLY as a quotation, with its reason.
//    Removing an entry whose number is still quoted turns this gate red; keeping
//    an entry nothing quotes any more ALSO turns it red (INVERSE part).
const HISTORICAL = {
  75: 'EX_TEMPFAIL. The systemd manual quotation ("Exit status 75 (TEMPFAIL), 250, '
    + '… are considered clean service terminations") is precisely WHY the daemon '
    + 'does not use 75. Deleting the quotation would delete the reason and invite '
    + 'the next agent to pick the sysexits value again.',
};

// ⚠️ 0 is not a code we own: it is the CONTRAST every unit has to explain
//    ("an exit 0 reads as: the job is done"). Silencing it would force the prose
//    to stop naming the very thing that makes a non-zero code necessary.
const CONTRAST = 0;

// 🔴 THE QUOTATION FORM, AND WHY IT IS LOAD-BEARING — found by SEEING THIS GATE
//    FAIL TO GO RED, 2026-08-20. The first version tolerated a retired code
//    ANYWHERE, so a sabotage writing "the daemon exits 75 whenever its own code
//    changes" — the exact drift this gate exists to catch — passed GREEN, because
//    75 was quotable and the file happened to name 90 elsewhere too. A retired
//    code is therefore tolerated ONLY in the wording the manual itself uses
//    ("Exit status 75"), never in a sentence that ASSERTS what our daemon does.
const FORME_CITATION = 'exit status';

/**
 * Every integer written in EXIT POSITION, with the FORM that introduced it —
 * "exit 90", "exits `90`", "exit code 90", "Exit status 75". Deliberately narrow:
 * a bare number in prose is NOT a claim about the exit code, and a gate that
 * flagged every digit would be disarmed within a day.
 * @param {string} text
 * @returns {{n: number, forme: string}[]}
 */
function exitMentions(text) {
  const re = /\b(exit(?:s|ed|ing)?)\b(?:\s+(code|status))?\s*`?(\d{1,3})`?/gi;
  const out = [];
  for (const m of text.matchAll(re)) {
    out.push({ n: Number(m[3]), forme: `${m[1]} ${m[2] || ''}`.toLowerCase().trim() });
  }
  return out;
}

/**
 * Is this mention legitimate? The live code in any wording; 0 as the contrast
 * every unit must be free to explain; a retired code ONLY as a quotation.
 * @param {{n: number, forme: string}} m
 * @returns {boolean}
 */
function toléré(m) {
  if (m.n === EXIT_STALE_CODE || m.n === CONTRAST) return true;
  return (m.n in HISTORICAL) && m.forme === FORME_CITATION;
}

/**
 * Is `name` present as an ACTIVE systemd directive — i.e. on a line that is not
 * a comment? ⚠️ Substring matching is WRONG here and would be worse than nothing:
 * the unit explains at length why `SuccessExitStatus=` must never be written, so
 * a naive `includes()` would flag the very warning it is meant to enforce, and
 * the only way to green it would be to DELETE the explanation.
 * @param {string} text
 * @param {string} name
 * @returns {boolean}
 */
function hasActiveDirective(text, name) {
  return text.split(/\r?\n/).some((line) => {
    const t = line.trim();
    if (t.startsWith('#') || t.startsWith(';')) return false;   // systemd comment syntax
    return new RegExp(`^${name}\\s*=`).test(t);
  });
}

/** @returns {Map<string, string>} corpus path → content */
function readCorpus() {
  const m = new Map();
  for (const rel of CORPUS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `\`${rel}\` DOES NOT EXIST. This gate cannot judge what it cannot read, and a\n`
        + 'missing path is indistinguishable from a perfect file. Renamed? Update CORPUS.');
    }
    m.set(rel, fs.readFileSync(abs, 'utf8'));
  }
  return m;
}

test('ANTI-VACUITY — the derivation really produced a usable exit code', () => {
  // 🛑 Without this, a renamed export makes `EXIT_STALE_CODE` undefined, every
  //    comparison below compares against nothing, and the suite goes green on a
  //    gate that measures air.
  assert.strictEqual(typeof EXIT_STALE_CODE, 'number',
    'EXIT_STALE_CODE is not exported as a number — the derivation is broken, not the units');
  assert.ok(Number.isInteger(EXIT_STALE_CODE) && EXIT_STALE_CODE > 0 && EXIT_STALE_CODE < 126,
    `EXIT_STALE_CODE=${EXIT_STALE_CODE} is outside 1..125. 0 would read as "job done" to every\n`
    + 'supervisor, and from 126 up the shells assign their own meanings.');
  assert.ok(!(EXIT_STALE_CODE in HISTORICAL),
    `EXIT_STALE_CODE=${EXIT_STALE_CODE} is listed as RETIRED in HISTORICAL. The live code cannot\n`
    + 'be one this repository already rejected — read why in that entry.');
});

test('ANTI-VACUITY — the scan really read the five files', () => {
  const corpus = readCorpus();
  assert.strictEqual(corpus.size, CORPUS.length);

  let total = 0;
  for (const [rel, text] of corpus) {
    assert.ok(text.length > 400, `\`${rel}\` is nearly empty (${text.length} c) — read, but not a unit`);
    const seen = exitMentions(text);
    assert.ok(seen.length > 0,
      `\`${rel}\` names NO exit code at all. Either the file stopped documenting the\n`
      + 'restart contract, or the pattern stopped matching prose it used to match.');
    total += seen.length;
  }
  // 🛑 A floor on the WHOLE corpus, because a pattern that silently stops matching
  //    is the failure this repository has already paid for elsewhere.
  assert.ok(total >= 10,
    `only ${total} exit-code mentions across ${CORPUS.length} files — the scan is broken, not the units`);
});

test('ANTI-INERT — the two rules see a real defect and stay silent on the real files', () => {
  // Forms taken from the REAL files, never a textbook case.
  assert.deepStrictEqual(exitMentions('The daemon exits 90 whenever its own code changes'),
    [{ n: 90, forme: 'exits' }]);
  assert.deepStrictEqual(exitMentions('an exit 0 reads as "the job is done"'),
    [{ n: 0, forme: 'exit' }]);
  assert.deepStrictEqual(exitMentions('"Exit status 75 (TEMPFAIL), 250, and SIGKILL"'),
    [{ n: 75, forme: 'exit status' }]);
  assert.deepStrictEqual(exitMentions('exit code 90 included'), [{ n: 90, forme: 'exit code' }]);
  // ⚠️ NOT a claim about the exit code — proving the rule is narrow on purpose.
  assert.deepStrictEqual(exitMentions('75 was the first choice, and systemd aliases it'), []);

  assert.strictEqual(hasActiveDirective('SuccessExitStatus=TEMPFAIL 250\n', 'SuccessExitStatus'), true,
    'an active SuccessExitStatus= goes unseen — the gate would certify the exact defect it exists for');
  assert.strictEqual(
    hasActiveDirective('# 🛑 SuccessExitStatus= IS DELIBERATELY ABSENT, AND IT MUST STAY ABSENT.\n', 'SuccessExitStatus'),
    false,
    'FALSE POSITIVE on the comment that explains the rule: the only way to green this\n'
    + 'would be to delete the explanation, which is how a gate teaches the wrong lesson');
});

test('SEEN RED — a stale exit code is caught even though that number stays quotable', () => {
  // 🛑 IN MEMORY. The sabotage never touches the repository.
  // 🔴 THIS IS THE CASE THAT ESCAPED THE FIRST VERSION OF THIS GATE. The sentence
  //    below is the real drift — the unit asserting that OUR daemon exits with the
  //    retired code — and it must be RED even though the same corpus legitimately
  //    quotes that number two lines further down.
  const dérive = 'The daemon exits 75 whenever its own code changes on disk.';
  assert.deepStrictEqual(exitMentions(dérive).filter((m) => !toléré(m)), [{ n: 75, forme: 'exits' }],
    'a stale exit code hidden behind a legitimate quotation is exactly the drift this gate exists for');

  // ⚠️ ANTI-FALSE-POSITIVE, same number, quotation form: must stay silent, or the
  //    only way to green the gate would be to delete the reason 75 was abandoned.
  const citation = 'systemd Example 1: "Exit status 75 (TEMPFAIL), 250, and SIGKILL"';
  assert.deepStrictEqual(exitMentions(citation).filter((m) => !toléré(m)), [],
    'the manual quotation is flagged — the gate would force the deletion of its own rationale');

  const inventé = 'the service will be restarted when the process exits 42';
  assert.deepStrictEqual(exitMentions(inventé).filter((m) => !toléré(m)), [{ n: 42, forme: 'exits' }],
    'an exit code belonging to nobody passes unnoticed');
});

test('the live exit code is DERIVED and stated by every unit', () => {
  const manquants = [];
  for (const [rel, text] of readCorpus()) {
    if (!exitMentions(text).some((m) => m.n === EXIT_STALE_CODE)) manquants.push(rel);
  }
  assert.deepStrictEqual(manquants, [],
    `THESE FILES DO NOT NAME THE LIVE EXIT CODE (${EXIT_STALE_CODE}):\n`
    + manquants.map((f) => `  ${f}`).join('\n')
    + '\nThe number is owned by `EXIT_STALE_CODE` in src/hooks/http-server.js. It moved once\n'
    + 'already (75 → 90); every place that names it must move in the SAME gesture.');
});

test('no unit names an exit code that belongs to nobody', () => {
  const coupables = [];
  for (const [rel, text] of readCorpus()) {
    for (const m of exitMentions(text)) {
      if (toléré(m)) continue;
      coupables.push(`  ${rel}: "${m.forme} ${m.n}"`);
    }
  }
  assert.deepStrictEqual(coupables, [],
    'AN EXIT CODE THAT IS NEITHER THE LIVE ONE, NOR 0, NOR A DECLARED RETIRED ONE **QUOTED**:\n'
    + coupables.join('\n')
    + `\nLive code = ${EXIT_STALE_CODE}. A retired code may appear only in the manual's own wording\n`
    + `("${FORME_CITATION} N"), never in a sentence asserting what this daemon does.\n`
    + 'Either the prose is stale, or the number retired and belongs in HISTORICAL with its reason.');
});

test('INVERSE — a retired code nothing quotes any more must be removed', () => {
  // 🛑 A stale allowance is worse than no allowance: it would silently excuse a
  //    FUTURE mistyped code that happens to match a number nobody remembers.
  const tout = [...readCorpus().values()].join('\n');
  const cités = new Set(exitMentions(tout).filter((m) => m.forme === FORME_CITATION).map((m) => m.n));
  for (const clé of Object.keys(HISTORICAL)) {
    assert.ok(cités.has(Number(clé)),
      `exit code ${clé} is declared in HISTORICAL and is quoted NOWHERE any more.\n`
      + 'Delete the entry — an allowance that protects nothing only hides the next defect.');
  }
});

test('the systemd unit carries NO active SuccessExitStatus= — the warning is now a machine', () => {
  const unit = readCorpus().get('service/ctxroute-http.service') || '';
  assert.strictEqual(hasActiveDirective(unit, 'SuccessExitStatus'), false,
    'ACTIVE `SuccessExitStatus=` IN THE UNIT. This is the trap the whole exit-code choice\n'
    + 'exists to avoid: listing the daemon\'s status there makes systemd read the stale-code\n'
    + 'restart as a CLEAN termination — `Restart=on-failure` then does nothing, the daemon\n'
    + 'stays dead after every `git pull`, and `systemctl status` shows green.\n'
    + 'If you copied it from the manual\'s Example 1: that example is the reason 75 was\n'
    + 'abandoned. Delete the line.');
  assert.ok(/^Restart\s*=\s*on-failure\s*$/m.test(unit),
    '`Restart=on-failure` is gone — nothing restarts the daemon on a non-zero exit,\n'
    + 'which is the only reason the exit code is non-zero in the first place.');
});

test('each unit still declares the restart mechanism its OS actually honours', () => {
  const corpus = readCorpus();
  const plist = corpus.get('service/com.ctxroute.http.plist') || '';
  // ⚠️ macOS restarts on a NON-ZERO exit only when SuccessfulExit is false. A bare
  //    <true/> KeepAlive would restart on EVERY exit, fighting the operator's own stop.
  assert.ok(/<key>SuccessfulExit<\/key>\s*<false\/>/.test(plist),
    '`KeepAlive`/`SuccessfulExit=false` is gone from the plist — macOS would stop restarting\n'
    + 'on a non-zero exit, or (with a bare KeepAlive) restart even when told to stop.');

  const task = corpus.get('service/ctxroute-http.task.xml') || '';
  // 🛑 Windows never restarts on an exit code ([MS-TSCH]: RestartOnFailure covers a
  //    FAILURE TO START). The event subscription is the only mechanism that can.
  assert.ok(/<EventTrigger>/.test(task) && /EventID=201/.test(task),
    'the EventTrigger on Operational event 201 is gone — on Windows NOTHING else reacts to\n'
    + 'the exit code: RestartOnFailure only covers a task that fails to START.');
  assert.ok(/<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/.test(task),
    '`ExecutionTimeLimit` is no longer PT0S ("run indefinitely") — Windows stops the daemon\n'
    + 'after the default limit, silently, days after every boot.');
});
