import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import declared from '../src/declared-paths-pure.js';
import render from '../service/render-units-pure.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOCKET_UNIT = path.join(ROOT, 'service', 'ctxroute-http.socket');
const PLIST = path.join(ROOT, 'service', 'com.ctxroute.http.plist');

const DEFAULTS = declared.listenEndpoints({
  host: declared.DEFAULT_HTTP_HOST,
  port: declared.DEFAULT_HTTP_PORT,
  listeners: declared.DEFAULT_LISTENERS,
});

// ═══════════════════════════════════════════════════════════════════════
// THE SHIPPED UNITS ARE WHAT THE RENDERER PRODUCES — OR ONE OF THEM LIES
// ═══════════════════════════════════════════════════════════════════════
// 🔑 THIS IS THE CELL THAT CLOSES THE CLASS, and it is stronger than comparing
//    counts. If rendering the shipped file with the DEFAULT configuration does
//    not give the shipped file back, then the template and the default have
//    drifted — and one of the two is lying to whoever reads it.
// ⚠️ It also proves the renderer against the REAL formats rather than fixtures
//    somebody wrote to match their own implementation.

test('① rendering the systemd unit with the defaults reproduces it BYTE FOR BYTE', () => {
  assert.ok(DEFAULTS.length === declared.DEFAULT_LISTENERS && DEFAULTS.length >= 1,
    `the default endpoint list came back as ${DEFAULTS.length} entries — nothing below measures anything.`);
  const shipped = fs.readFileSync(SOCKET_UNIT, 'utf8');
  assert.equal(render.renderSystemdSocket(shipped, DEFAULTS), shipped,
    'the shipped socket unit is NOT what the renderer produces from the default '
    + 'configuration. Either the unit was hand-edited away from the default, or the '
    + 'default moved without the unit following. The installer renders this file, so '
    + 'the shipped one must already be its own output.');
});

test('② rendering the launchd plist with the defaults reproduces it BYTE FOR BYTE', () => {
  const shipped = fs.readFileSync(PLIST, 'utf8');
  assert.equal(render.renderLaunchdPlist(shipped, DEFAULTS), shipped,
    'the shipped plist is NOT what the renderer produces from the default '
    + 'configuration — same disagreement as cell ①, on the macOS side.');
});

test('③ a DIFFERENT count is rendered on both formats, and is IDEMPOTENT', () => {
  const two = [
    { host: '10.0.0.1', port: 9000 },
    { host: '10.0.0.1', port: 9001 },
  ];
  const unit = render.renderSystemdSocket(fs.readFileSync(SOCKET_UNIT, 'utf8'), two);
  const lines = unit.split('\n').filter((l) => /^ListenStream\s*=/.test(l));
  assert.deepEqual(lines, ['ListenStream=10.0.0.1:9000', 'ListenStream=10.0.0.1:9001']);
  // 🛑 IDEMPOTENT OR IT IS NOT A RENDERER: an installer re-run must converge, never
  //    accumulate a second block of sockets systemd would open the union of.
  assert.equal(render.renderSystemdSocket(unit, two), unit, 'the unit rendering is not idempotent.');

  const plist = render.renderLaunchdPlist(fs.readFileSync(PLIST, 'utf8'), two);
  const ports = plist.split('\n').filter((l) => l.includes('<key>SockServiceName</key>')).length;
  assert.equal(ports, 2, 'the plist rendering did not produce exactly two listeners.');
  assert.ok(plist.includes('<string>9001</string>'), 'the second port is missing from the plist.');
  assert.equal(render.renderLaunchdPlist(plist, two), plist, 'the plist rendering is not idempotent.');
  // The comment above the key carries the reasoning and must survive a render.
  assert.ok(plist.includes('AN ARRAY OF FOUR SINCE'),
    'the rendering ate the surrounding comment — the reasoning lives there.');
});

test('④ a file with nothing to render is a NAMED REFUSAL, never a silent insertion', () => {
  // 🛑 Guessing where a listening socket belongs is how an installer ships a unit
  //    that loads and serves nothing.
  assert.throws(() => render.renderSystemdSocket('[Socket]\nAccept=no\n', DEFAULTS),
    /ListenStream/, 'a unit with no ListenStream must be refused BY NAME');
  assert.throws(() => render.renderLaunchdPlist('<plist><dict></dict></plist>', DEFAULTS),
    /Listeners/, 'a plist with no Listeners entry must be refused BY NAME');
  assert.throws(() => render.renderSystemdSocket(fs.readFileSync(SOCKET_UNIT, 'utf8'), []),
    /no endpoint/, 'an empty endpoint list must be refused');
});

test('⑤ CONTROL: a unit left behind by the default FAILS cell ①', () => {
  // 🛑 The sabotage is the REAL defect — the unit that kept its single socket when
  //    the default moved to four — replayed in memory.
  const shipped = fs.readFileSync(SOCKET_UNIT, 'utf8');
  const stale = render.renderSystemdSocket(shipped, DEFAULTS.slice(0, 1));
  assert.notEqual(stale, shipped,
    'stripping the unit down to one socket produced the shipped file unchanged: the '
    + 'comparison in cell ① cannot see the drift it exists for.');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑥ EVERY REFUSAL IS EXERCISED, AND ITS WORDING IS CONTRACT
// ═══════════════════════════════════════════════════════════════════════
// 🔴 MEASURED 2026-09-19, ON THE FIRST RUN AFTER THIS MODULE ENTERED THE MUTATION
//    PERIMETER: ~24 survivors, ALL of them on the refusal lines. Cell ④ asked
//    whether a refusal ARRIVES and never what it SAYS, and it exercised ONE side
//    of each `||` — so the wording could be emptied and a condition flipped with
//    the suite still green. This module is the one that decides what a supervisor
//    binds; an unproven guard here is a listening address nobody chose.
// 🛑 THE WORDING IS COPIED FROM THE SOURCE, never reconstructed from memory —
//    that reconstruction has cost this repository two red suites — and it is
//    written OUT, never read back off the module: an expectation that quotes the
//    code under test demonstrates `x === x` and kills no mutant.
// 🔑 A refusal's DETAIL is what tells the operator which of two files they handed
//    over. A test that accepts any message lets the two refusals become one.

const PREFIX = 'ctxroute: cannot render the listening sockets — ';
/** Asserts the EXACT refusal text, prefix included. */
const refuses = (fn, why, note) => assert.throws(fn, (e) => {
  assert.strictEqual(e.message, PREFIX + why, note);
  return true;
});

test('⑥ the endpoint list is refused on BOTH halves of its guard, by exact wording', () => {
  const NO_ENDPOINT = 'no endpoint was given. The configuration always resolves at least one, '
    + 'so an empty list means the caller never asked `paths.httpListenEndpoints()`.';
  const unit = fs.readFileSync(SOCKET_UNIT, 'utf8');

  // ⚠️ THE TWO SIDES ARE DISTINCT INPUTS, or the `||` is half proven: "not an
  //    array" and "an array with nothing in it" fail for different reasons.
  refuses(() => render.renderSystemdSocket(unit, /** @type {any} */ (null)), NO_ENDPOINT,
    'a NON-ARRAY endpoint list must be refused with the same named reason');
  refuses(() => render.renderSystemdSocket(unit, []), NO_ENDPOINT,
    'an EMPTY endpoint list must be refused with the same named reason');
  refuses(() => render.renderLaunchdPlist(fs.readFileSync(PLIST, 'utf8'), []), NO_ENDPOINT,
    'the plist renderer shares the guard, so it must share the wording');
});

test('⑦ a malformed endpoint is refused, and the refusal SHOWS the offender', () => {
  const unit = fs.readFileSync(SOCKET_UNIT, 'utf8');
  // ⚠️ THREE WAYS TO BE MALFORMED, and each must bite on its own: a missing
  //    object, a host that is not a string, a port that is not an integer. A
  //    single case would leave the other two conditions unproven.
  for (const bad of [null, { host: 42, port: 8787 }, { host: 'h', port: 8787.5 }]) {
    refuses(
      () => render.renderSystemdSocket(unit, /** @type {any} */ ([bad])),
      `an endpoint is malformed: ${JSON.stringify(bad)}. Expected {host, port}.`,
      'a malformed endpoint must be refused BY NAME and the refusal must show which one',
    );
  }
  // ⚠️ AND IT MUST BE FOUND WHEREVER IT SITS: a guard that only reads the first
  //    entry passes every list whose head is well formed.
  refuses(
    () => render.renderSystemdSocket(unit, /** @type {any} */ ([DEFAULTS[0], null])),
    'an endpoint is malformed: null. Expected {host, port}.',
    'a malformed endpoint in SECOND position was not seen: the loop stops at the first entry',
  );
});

test('⑧ an empty text is refused by each renderer, in ITS OWN words', () => {
  // 🛑 The two messages must stay DISTINCT: they are what tells the operator
  //    which file they handed over. Merging them would lose the only information
  //    the refusal carries.
  for (const empty of [undefined, '', '   \n\t ']) {
    refuses(() => render.renderSystemdSocket(/** @type {any} */ (empty), DEFAULTS),
      'the unit text is empty.', 'an empty unit text must be refused, blank or absent alike');
    refuses(() => render.renderLaunchdPlist(/** @type {any} */ (empty), DEFAULTS),
      'the plist text is empty.', 'an empty plist text must be refused, blank or absent alike');
  }
});

test('⑨ a file with nothing to render is refused with its FULL reason', () => {
  refuses(() => render.renderSystemdSocket('[Socket]\nAccept=no\n', DEFAULTS),
    'this unit declares no `ListenStream=` at all. Refusing to guess where '
    + 'the listening sockets belong.',
    'the systemd refusal lost its reason: "refusing to guess" is what stops an installer '
    + 'shipping a unit that loads and serves nothing');
  refuses(() => render.renderLaunchdPlist('<plist><dict></dict></plist>', DEFAULTS),
    'this plist declares no `Listeners` socket entry. Either socket activation '
    + 'was removed on macOS — a decision that belongs in its own document — or the '
    + 'caller handed the wrong file.',
    'the launchd refusal lost its reason: it is what separates "we removed activation" '
    + 'from "you handed the wrong file"');
});

test('⑩ a plist declaring `Listeners` TWICE is refused, never silently resolved', () => {
  // 🛑 Which of two entries launchd keeps is not ours to guess, and picking one
  //    would bind a socket set the operator never chose — silently.
  const twice = fs.readFileSync(PLIST, 'utf8').replace('<key>Listeners</key>',
    '<key>Listeners</key><dict/><key>Listeners</key>');
  refuses(() => render.renderLaunchdPlist(twice, DEFAULTS),
    'this plist declares `Listeners` twice. Two entries are two sockets sets, '
    + 'and which one launchd keeps is not ours to guess.',
    'two Listeners entries must be a NAMED refusal, never a quiet choice');
});

test('⑪ the ListenStream block is replaced WHERE IT STANDS, contiguously', () => {
  // 🔑 The loop that walks to the LAST contiguous declaration is what keeps the
  //    lines around the block intact. A renderer that replaced only the first
  //    would leave the old sockets below it — two blocks, and systemd would open
  //    every one of them.
  const before = '[Socket]\nListenStream=a:1\nListenStream=b:2\nListenStream=c:3\nAccept=no\n';
  const out = render.renderSystemdSocket(before, DEFAULTS);
  const decls = out.split('\n').filter((l) => /^\s*ListenStream\s*=/.test(l));
  assert.strictEqual(decls.length, DEFAULTS.length,
    `three declarations were replaced by ${decls.length} instead of ${DEFAULTS.length}: `
    + 'a block replaced in part leaves sockets nobody declared, and systemd opens them all');
  assert.ok(out.startsWith('[Socket]\n') && out.includes('\nAccept=no\n'),
    'the lines around the block did not survive: the renderer moved more than the sockets');

  // ⚠️ AND A DECLARATION SEPARATED FROM THE BLOCK IS NOT PART OF IT — the loop
  //    stops at the first non-declaration line, deliberately.
  const split = '[Socket]\nListenStream=a:1\nAccept=no\nListenStream=b:2\n';
  const kept = render.renderSystemdSocket(split, DEFAULTS.slice(0, 1));
  assert.ok(kept.includes('ListenStream=b:2'),
    'a declaration BELOW a non-declaration line was swallowed: the block detection ran past its end');

  // ⚠️ THE BLOCK ENDING AT THE LAST LINE, with no trailing newline: that is the
  //    ONLY input where the walk's `last + 1 < lines.length` bound is what stops
  //    it. Every fixture ending in `\n` leaves a trailing empty element, so the
  //    non-declaration line does the stopping and the bound is never exercised.
  const atEnd = render.renderSystemdSocket('[Socket]\nListenStream=a:1', DEFAULTS);
  const tail = atEnd.split('\n').filter((l) => /^\s*ListenStream\s*=/.test(l));
  assert.strictEqual(tail.length, DEFAULTS.length,
    'a block that ends at the LAST line of the file was not replaced whole: the walk ran past the end');
  assert.ok(atEnd.startsWith('[Socket]\n'), 'the header did not survive a block sitting at the end of file');
});

// ═══════════════════════════════════════════════════════════════════════
// ⑫ THE PLIST VALUE IS DEPTH-COUNTED — the whole reason that loop exists
// ═══════════════════════════════════════════════════════════════════════
// 🔑 macOS documents `Sockets` as a dictionary of dictionaries OR a dictionary of
//    an ARRAY of dictionaries, so the value NESTS and the FIRST closing tag is not
//    the matching one. A lazy regex would cut the value in the middle and hand
//    launchd malformed XML — which it reads as no socket at all, in silence.
// 🔴 MEASURED 2026-09-19: every mutant of that loop SURVIVED, because no fixture
//    ever nested. The code was right and proven by nothing.
test('⑫ a NESTED value is closed at its OWN tag, never at the first one', () => {
  const nested = '<plist><dict><key>Listeners</key><dict>'
    + '<key>a</key><dict><key>SockServiceName</key><string>1</string></dict>'
    + '</dict><key>After</key><string>kept</string></dict></plist>';
  const out = render.renderLaunchdPlist(nested, DEFAULTS);

  assert.ok(out.includes('<key>After</key><string>kept</string>'),
    'what followed the `Listeners` value was destroyed: the loop closed on the FIRST tag it met, '
    + 'in the middle of the nested dictionary, and launchd would be handed malformed XML');
  assert.strictEqual((out.match(/<key>SockServiceName<\/key>/g) || []).length, DEFAULTS.length,
    `the rendered value does not carry exactly ${DEFAULTS.length} socket entries: the nested `
    + 'dictionary was either kept alongside the new one or the replacement missed its bounds');
  assert.ok(!out.includes('<key>a</key>'),
    'the OLD nested entry survived beside the new value: two socket sets, and which one launchd keeps is not ours to guess');
  // 🔴 THE ONE-LINE PLIST IS THE 2026-09-19 DEFECT, AND NO CELL CHECKED ITS OUTPUT
  //    UNTIL 2026-10-01: the key is not at the head of its line, so there is NO
  //    indentation to inherit and every rendered line starts with spaces ONLY.
  //    The defect re-emitted `<plist><dict>` in front of every line instead.
  const keyLines = out.split('\n').filter((l) => /<key>SockServiceName<\/key>/.test(l));
  assert.ok(keyLines.length > 0 && keyLines.every((l) => l === '        <key>SockServiceName</key>'),
    `a rendered line carries something other than its indentation: ${JSON.stringify(keyLines[0])} — `
    + 'on a one-line plist the text BEFORE the key is not indentation, and copying it corrupts the XML');

  // 🛑 AND THE RESULT MUST BE WELL FORMED, which is the half a content check
  //    cannot see. A scanner that stopped at the FIRST closing tag would cut the
  //    value inside the nesting and leave an ORPHAN `</dict>` behind: every
  //    assertion above still passes, and launchd is handed XML it reads as no
  //    socket at all — silently. Counting the tags is what separates the two.
  const opensCount = (out.match(/<dict>/g) || []).length;
  const closesCount = (out.match(/<\/dict>/g) || []).length;
  assert.strictEqual(opensCount, closesCount,
    `the rendered plist carries ${opensCount} <dict> against ${closesCount} </dict>: the value was cut `
    + 'inside its own nesting, and malformed XML is read by launchd as no socket at all');
});

test('⑬ a value that never closes is a NAMED REFUSAL, and an ABSENT one too', () => {
  // 🛑 Both are the same family — the key is there and its value is unusable —
  //    and each carries its OWN wording, because they send the reader to
  //    different places in the file.
  refuses(() => render.renderLaunchdPlist('<plist><dict><key>Listeners</key><dict><key>a</key>', DEFAULTS),
    'the `Listeners` <dict> is never closed.',
    'an unclosed value must be refused BY NAME: rendering into it would produce XML launchd reads as nothing');
  refuses(() => render.renderLaunchdPlist('<plist><dict><key>Listeners</key></dict></plist>', DEFAULTS),
    'the `Listeners` key has no value element.',
    'a key with no value element must be refused: there is nothing to replace, and guessing would invent a socket set');
});

test('⑭ an EMPTY value element is still found, opening and closing tag adjacent', () => {
  // 🔑 THE ONE INPUT THAT SEPARATES "does this text START here" FROM "does the text
  //    so far END here". With the opening and the closing tag adjacent, a scanner
  //    that recognised the opening tag by its END would step six characters past
  //    it — straight over the closing tag — never bring the depth back to zero,
  //    and REFUSE a perfectly well formed plist. Every other fixture has content
  //    between the two tags, which absorbs the offset and hides the difference.
  // ⚠️ It is also the real shape of a plist whose socket set was emptied by hand.
  const empty = '<plist><dict><key>Listeners</key><dict></dict>'
    + '<key>After</key><string>kept</string></dict></plist>';
  const out = render.renderLaunchdPlist(empty, DEFAULTS);
  assert.strictEqual((out.match(/<key>SockServiceName<\/key>/g) || []).length, DEFAULTS.length,
    'an EMPTY value element was not replaced by the declared socket set');
  assert.ok(out.includes('<key>After</key><string>kept</string>'),
    'what followed an empty value element was destroyed: the scan never found the closing tag');
});
