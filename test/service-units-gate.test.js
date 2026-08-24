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
  'service/ctxroute-http.socket',
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
function tolerated(m) {
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

/**
 * A plist carries its whole rationale in XML comments, and that rationale NAMES
 * every key it forbids — at length, on purpose. So the plist rules below must
 * read the DECLARATIONS only.
 *
 * 🛑 EXACTLY THE `hasActiveDirective` PROBLEM, ONE FILE FORMAT OVER. A naive
 *    `includes('<key>KeepAlive</key>')` would be satisfied by the paragraph that
 *    explains why KeepAlive must never come back, and the only way to green it
 *    would be to DELETE the explanation — which is how a gate teaches the wrong
 *    lesson and gets disarmed.
 * ⚠️ Deliberately simple: plist comments do not nest (XML forbids `--` inside a
 *    comment), so a non-greedy sweep is exact here, not an approximation.
 * @param {string} xml
 * @returns {string} the same document with every comment removed
 */
function stripXmlComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Is `name` DECLARED as a plist key — as opposed to merely discussed?
 * @param {string} xml
 * @param {string} name
 * @returns {boolean}
 */
function hasPlistKey(xml, name) {
  return new RegExp(`<key>\\s*${name}\\s*</key>`).test(stripXmlComments(xml));
}

/**
 * Why an XML comment BODY is illegal, or null when it is fine.
 *
 * ⚠️ THE WHOLE XML RULE, not the one form we happened to hit: a comment may
 *    contain no `--` at all, and may not end in `-`. Implementing only the first
 *    half would leave the gate satisfied by a file a real parser still refuses.
 * @param {string} body the text between `<!--` and `-->`
 * @returns {string|null}
 */
function commentDefect(body) {
  if (body.includes('--')) return 'contains "--"';
  if (body.endsWith('-')) return 'ends with "-"';
  return null;
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

  // ⚠️ SAME PAIR FOR THE SOCKET UNIT'S TWO RULES, on the forms the real file uses:
  //    both units explain at length WHY `Accept=yes` and `FlushPending=` are
  //    forbidden, so a substring check would flag its own rationale.
  assert.strictEqual(hasActiveDirective('FlushPending=yes\n', 'FlushPending'), true,
    'an active FlushPending= goes unseen — the queued connections it drops are the whole repair');
  assert.strictEqual(hasActiveDirective('# 🛑 FlushPending= IS DELIBERATELY ABSENT\n', 'FlushPending'), false,
    'FALSE POSITIVE on the comment forbidding it');
  assert.strictEqual(/^Accept\s*=\s*no\s*$/m.test('Accept=yes\n'), false,
    'the Accept check accepts `yes` — it would certify one node process per frame');
  assert.strictEqual(/^Accept\s*=\s*no\s*$/m.test('#    …the inetd model, Accept=no is preferable\n'), false,
    'the Accept check is satisfied by prose — a comment would green a missing directive');

  // ⚠️ SAME PAIR FOR THE PLIST, on the forms the real file uses. The plist
  //    explains at length why `KeepAlive` and `RunAtLoad` must stay gone, so a
  //    substring check would flag its own rationale and the only way to green it
  //    would be to delete the warning.
  assert.strictEqual(hasPlistKey('<key>KeepAlive</key>\n<dict/>\n', 'KeepAlive'), true,
    'a declared KeepAlive goes unseen — the eager restart burst could come back unnoticed');
  assert.strictEqual(
    hasPlistKey('<!--\n  🛑 RunAtLoad AND KeepAlive ARE DELIBERATELY ABSENT.\n'
      + '     <key>KeepAlive</key> would re-arm the burst.\n-->\n', 'KeepAlive'),
    false,
    'FALSE POSITIVE on the comment forbidding it: greening this gate would mean deleting\n'
    + 'the paragraph that tells the next reader why the key is not there');
  assert.strictEqual(hasPlistKey('<key>Sockets</key>\n', 'Sockets'), true,
    'a declared Sockets key goes unseen — the socket-activation check would measure nothing');

  // ⚠️ BOTH BRANCHES OF THE XML COMMENT RULE, exercised here because only one of
  //    them is reachable by mutating a real file: a body ending in `-` cannot be
  //    produced without also producing a `--` in the raw text, so the corpus scan
  //    alone would leave this half UNPROVEN — measured 2026-08-23, where that
  //    sabotage came back VOID rather than red.
  // ⚠️ The first form is the REAL sentence that made the plist unparseable, not a
  //    textbook case.
  assert.strictEqual(commentDefect(' Read it with `log show --predicate` '), 'contains "--"',
    'the double-hyphen half is blind — this is the exact text a real parser rejected');
  assert.strictEqual(commentDefect(' we do not reimplement it -'), 'ends with "-"',
    'the trailing-hyphen half is blind: `<!-- x --->` is malformed and would go unseen');
  assert.strictEqual(commentDefect(' a perfectly ordinary comment — em dashes are fine '), null,
    'FALSE POSITIVE on healthy prose: an em dash is one character, not two hyphens, and a\n'
    + 'gate that forbade it would make these files unwritable');
  assert.strictEqual(commentDefect(' a lone - hyphen mid-sentence is legal '), null,
    'FALSE POSITIVE on a single hyphen — the rule would reject every hyphenated word');
});

test('SEEN RED — a stale exit code is caught even though that number stays quotable', () => {
  // 🛑 IN MEMORY. The sabotage never touches the repository.
  // 🔴 THIS IS THE CASE THAT ESCAPED THE FIRST VERSION OF THIS GATE. The sentence
  //    below is the real drift — the unit asserting that OUR daemon exits with the
  //    retired code — and it must be RED even though the same corpus legitimately
  //    quotes that number two lines further down.
  const drift = 'The daemon exits 75 whenever its own code changes on disk.';
  assert.deepStrictEqual(exitMentions(drift).filter((m) => !tolerated(m)), [{ n: 75, forme: 'exits' }],
    'a stale exit code hidden behind a legitimate quotation is exactly the drift this gate exists for');

  // ⚠️ ANTI-FALSE-POSITIVE, same number, quotation form: must stay silent, or the
  //    only way to green the gate would be to delete the reason 75 was abandoned.
  const citation = 'systemd Example 1: "Exit status 75 (TEMPFAIL), 250, and SIGKILL"';
  assert.deepStrictEqual(exitMentions(citation).filter((m) => !tolerated(m)), [],
    'the manual quotation is flagged — the gate would force the deletion of its own rationale');

  const invented = 'the service will be restarted when the process exits 42';
  assert.deepStrictEqual(exitMentions(invented).filter((m) => !tolerated(m)), [{ n: 42, forme: 'exits' }],
    'an exit code belonging to nobody passes unnoticed');
});

test('the live exit code is DERIVED and stated by every unit', () => {
  const missing = [];
  for (const [rel, text] of readCorpus()) {
    if (!exitMentions(text).some((m) => m.n === EXIT_STALE_CODE)) missing.push(rel);
  }
  assert.deepStrictEqual(missing, [],
    `THESE FILES DO NOT NAME THE LIVE EXIT CODE (${EXIT_STALE_CODE}):\n`
    + missing.map((f) => `  ${f}`).join('\n')
    + '\nThe number is owned by `EXIT_STALE_CODE` in src/hooks/http-server.js. It moved once\n'
    + 'already (75 → 90); every place that names it must move in the SAME gesture.');
});

test('no unit names an exit code that belongs to nobody', () => {
  const offenders = [];
  for (const [rel, text] of readCorpus()) {
    for (const m of exitMentions(text)) {
      if (tolerated(m)) continue;
      offenders.push(`  ${rel}: "${m.forme} ${m.n}"`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    'AN EXIT CODE THAT IS NEITHER THE LIVE ONE, NOR 0, NOR A DECLARED RETIRED ONE **QUOTED**:\n'
    + offenders.join('\n')
    + `\nLive code = ${EXIT_STALE_CODE}. A retired code may appear only in the manual's own wording\n`
    + `("${FORME_CITATION} N"), never in a sentence asserting what this daemon does.\n`
    + 'Either the prose is stale, or the number retired and belongs in HISTORICAL with its reason.');
});

test('INVERSE — a retired code nothing quotes any more must be removed', () => {
  // 🛑 A stale allowance is worse than no allowance: it would silently excuse a
  //    FUTURE mistyped code that happens to match a number nobody remembers.
  const tout = [...readCorpus().values()].join('\n');
  const cited = new Set(exitMentions(tout).filter((m) => m.forme === FORME_CITATION).map((m) => m.n));
  for (const clé of Object.keys(HISTORICAL)) {
    assert.ok(cited.has(Number(clé)),
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
  // 🔴 THE LINE THAT USED TO BE ASSERTED HERE WAS `Restart=on-failure`, AND IT WAS
  //    THE BURST (2026-08-20). An eager restart puts a fresh instance back into
  //    the `git pull` that is still rewriting files, so ten edits became ten
  //    restarts and the start limit ended the story. Under socket activation
  //    nothing needs restarting: systemd holds the socket, the connections queue,
  //    and the next one starts a fresh instance.
  // ⚠️ `no` is systemd's documented DEFAULT — it is required in WRITING because
  //    here it is a decision, and because a silent return to `on-failure` would
  //    re-arm the exact defect with every file still looking correct.
  assert.ok(/^Restart\s*=\s*no\s*$/m.test(unit),
    '`Restart=no` is gone from the service. If it became `on-failure` again, the stale-code\n'
    + 'burst is back: each exit brings an instance straight back into the running `git pull`.\n'
    + 'The daemon is meant to be started BY A CONNECTION — see service/ctxroute-http.socket.');
  assert.ok(hasActiveDirective(unit, 'Requires'),
    'the service no longer requires its socket unit — started alone it would bind the port\n'
    + 'itself, giving one unit two different behaviours depending on how it was started.');
});

test('the socket unit carries the settings the whole lane depends on', () => {
  const sock = readCorpus().get('service/ctxroute-http.socket') || '';

  // 🛑 `Accept=yes` would spawn ONE PROCESS PER CONNECTION — the ~330 ms of node
  //    startup per frame that this entire lane exists to delete, paid again with
  //    a supervisor on top. It is also what guarantees a single instance.
  assert.ok(/^Accept\s*=\s*no\s*$/m.test(sock),
    'ACTIVE `Accept=no` IS GONE FROM THE SOCKET UNIT. With `Accept=yes`, systemd spawns a\n'
    + 'service instance per connection: the HTTP lane would cost MORE than the spawn lane it\n'
    + 'replaces, and nothing would guarantee a single daemon any more.');
  assert.ok(hasActiveDirective(sock, 'ListenStream'),
    'the socket unit listens on nothing — there is no address for systemd to hold.');
  assert.ok(/^ListenStream\s*=\s*127\.0\.0\.1:/m.test(sock),
    'the socket is not bound to loopback. This endpoint returns the fleet\'s private knowledge\n'
    + 'and has no authentication: the socket IS the boundary.');

  // 🛑 FlushPending=yes clears the socket's buffers when the service exits — i.e.
  //    it DROPS the queued connections, which are precisely the injections that
  //    survive a stale-code exit. The outage would come back while every file
  //    still looked correct.
  assert.strictEqual(hasActiveDirective(sock, 'FlushPending'), false,
    'ACTIVE `FlushPending=` IN THE SOCKET UNIT. systemd.socket(5): "the socket\'s buffers are\n'
    + 'cleared after the triggered service exited" — the connections waiting in the backlog are\n'
    + 'the whole repair. Delete the line.');
});

test('every XML unit is WELL-FORMED — a comment may not carry a double hyphen', () => {
  // 🔴 FOUND BY MEASUREMENT, 2026-08-23, AND IT WAS PRE-EXISTING. Handing the
  //    plist to a real XML parser for the first time made it REFUSE the file: the
  //    log paragraph spelled `log show` with its option in full, and XML forbids
  //    `--` anywhere inside a comment. A file that documents a supervisor is not
  //    prose — it is parsed by that supervisor, and this one had never been
  //    parsed by anything. Exactly the class this repository fears: correct
  //    against the documentation, never against a machine.
  // ⚠️ THE RULE IS THE WHOLE XML RULE, not a sample of it: a comment may contain
  //    neither `--` nor a trailing `-`. So this cell cannot be satisfied by a
  //    file that merely avoids the one form we happened to hit.
  // ⚠️ DERIVED FROM THE DIRECTORY, never a hand-written list: an XML unit added
  //    tomorrow enters this net by itself. A list only ever knows the past.
  const dir = path.join(ROOT, 'service');
  const units = fs.readdirSync(dir).filter((f) => /\.(plist|xml)$/.test(f));

  // 🛑 ANTI-VACUITY: an empty directory, a renamed extension or a path that
  //    stopped resolving looks EXACTLY like a set of perfect files.
  assert.ok(units.length >= 2,
    `only ${units.length} XML unit(s) found under service/ — expected at least the plist and the`
    + ' scheduled task. The scan is broken, not the units.');

  const offenders = [];
  let comments = 0;
  for (const f of units) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
      comments++;
      const corps = m[1];
      const fallbackValue = commentDefect(corps);
      if (!fallbackValue) continue;
      const line = text.slice(0, m.index).split('\n').length;
      const offendingOne = corps.split('\n').find((l) => l.includes('--')) || '';
      offenders.push(`  ${f}: comment opened at line ${line} ${fallbackValue}`
        + (offendingOne ? ` → ${offendingOne.trim().slice(0, 80)}` : ''));
    }
  }

  // 🛑 SECOND ANTI-VACUITY FLOOR: these files are mostly rationale. Zero comments
  //    parsed means the pattern stopped matching, which is indistinguishable from
  //    a clean sweep.
  assert.ok(comments >= 10,
    `only ${comments} XML comments parsed across ${units.length} units — the pattern is broken.`);

  assert.deepStrictEqual(offenders, [],
    'MALFORMED XML COMMENT — the supervisor will refuse the whole file:\n'
    + offenders.join('\n')
    + '\nXML forbids `--` anywhere inside a comment and forbids a comment ending in `-`.\n'
    + 'This is not a style rule: it is why a real parser rejected the plist on 2026-08-23.\n'
    + 'Rephrase the sentence — never spell a long option inside these comments.');
});

test('the plist carries the socket launchd must own, and the shim that fetches it', () => {
  const plist = readCorpus().get('service/com.ctxroute.http.plist') || '';

  // 🔑 WITHOUT THIS DICTIONARY macOS SILENTLY GOES BACK TO THE EAGER MODEL: node
  //    binds the port itself, nothing holds it between a stale-code exit and the
  //    next start, and every injection arriving in that window is lost with no
  //    error anywhere. The file would still look perfectly correct.
  assert.ok(hasPlistKey(plist, 'Sockets'),
    'the `Sockets` dictionary is gone from the plist — launchd no longer owns the listening\n'
    + 'socket, so the stale-code window is back and nothing observable says so.');
  assert.ok(hasPlistKey(plist, 'Listeners'),
    'the `Listeners` socket is gone. That name is SHARED with the first argument of\n'
    + '`launch_activate_socket` in service/launchd-socket-shim.c: renaming it on one side\n'
    + 'only makes every activation fail with "no such socket".');

  // 🛑 This endpoint returns the fleet's private knowledge and has NO
  //    authentication — the socket IS the boundary, exactly as `ListenStream=`
  //    is bound to loopback on the systemd side.
  assert.ok(/<key>SockNodeName<\/key>\s*<string>127\.0\.0\.1<\/string>/.test(stripXmlComments(plist)),
    '`SockNodeName` is not 127.0.0.1. There is no authentication and there must never need\n'
    + 'to be one: widening this exposes the fleet\'s private knowledge to the network.');
  assert.ok(hasPlistKey(plist, 'SockServiceName'),
    '`SockServiceName` is gone — that is the ONE place the port is written on macOS, the\n'
    + 'counterpart of `ListenStream=` on Linux, and what install-macos.sh reads back rather\n'
    + 'than re-typing.');

  // 🛑 ONE PLACE FOR ONE NUMBER. `CTXROUTE_HTTP_PORT` used to carry the address
  //    here; it was REMOVED when the socket moved in rather than left behind as a
  //    second copy, because the daemon IGNORES it under activation — so a stale
  //    value would be invisible right up until the day it was believed.
  assert.strictEqual(hasPlistKey(plist, 'EnvironmentVariables'), false,
    '`EnvironmentVariables` is back in the plist. If it carries the port again, macOS has\n'
    + 'TWO places naming one address and the daemon reads NEITHER while activated — the\n'
    + 'copy would be free to drift with nothing ever noticing.');

  // ⚠️ The daemon cannot receive a launchd socket on its own: retrieval goes
  //    through `launch_activate_socket`, a C function. The shim is that
  //    translation, and it has to be the process launchd actually starts.
  const args = stripXmlComments(plist).match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  assert.ok(args, 'ProgramArguments is gone from the plist — launchd has nothing to start.');
  const entries = [...args[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
  assert.ok(entries.length >= 3,
    `ProgramArguments carries ${entries.length} entries, expected at least 3 (shim, node, entry point).\n`
    + 'If the shim was dropped, node receives no descriptor and binds the port itself — the\n'
    + 'eager model, reintroduced while the `Sockets` key still says otherwise.');
  assert.ok(/launchd-socket-shim$/.test(entries[0]),
    `the FIRST ProgramArguments entry is \`${entries[0]}\`, not the socket shim. launchd starts\n`
    + 'that first entry; anything else means the descriptor is never fetched and never placed\n'
    + 'on fd 3, so `inheritedFd()` returns null and the port path runs.');
});

test('each unit still declares the restart mechanism its OS actually honours', () => {
  const corpus = readCorpus();
  const plist = corpus.get('service/com.ctxroute.http.plist') || '';
  // 🔴 THE LINE THAT USED TO BE ASSERTED HERE WAS `KeepAlive`/`SuccessfulExit=false`,
  //    AND IT WAS THE macOS TWIN OF THE LINUX BURST (2026-08-23). launchd now OWNS
  //    the listening socket, so nothing needs restarting: the next CONNECTION starts
  //    the next instance and the ones arriving meanwhile wait in the backlog. An
  //    eager respawn would throw a fresh instance straight back into the `git pull`
  //    that is still rewriting files — ten edits, ten launches, then throttling.
  //    This is exactly the move the systemd unit made when `Restart=on-failure`
  //    became `Restart=no`, and it is asserted here for the same reason: the keys
  //    look like an improvement to anyone who has not read why they left.
  assert.strictEqual(hasPlistKey(plist, 'KeepAlive'), false,
    'DECLARED `KeepAlive` IS BACK IN THE PLIST. Under socket activation there is nothing to\n'
    + 'restart: launchd holds the socket and a connection starts the instance. An eager\n'
    + 'respawn re-arms the stale-code burst the socket was introduced to remove.');
  assert.strictEqual(hasPlistKey(plist, 'RunAtLoad'), false,
    'DECLARED `RunAtLoad` IS BACK IN THE PLIST. It starts the daemon at login instead of on\n'
    + 'demand, which is the eager model socket activation replaced.');

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
