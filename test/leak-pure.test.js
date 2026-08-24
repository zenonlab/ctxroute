// ⚠️ WHAT THIS SUITE PROTECTS: the DECISION "does this text contain personal
//    data?". It is PURE and mutated by Stryker; the I/O (git ls-files, reading
//    the files, the private list) lives in `leak-gate.test.js`. Same separation
//    as canary ⟷ canary-check: the mutation runner must stay fast and
//    deterministic.
//
// ⚠️ NO PERSONAL DATA HERE: the test values are made up ("dupont",
//    "boulangerie-durand"). A test writing the real first name to protect
//    WOULD BE the leak it claims to prevent.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { forbiddenPatterns, scan, escapeLiteral, lastSegment, GENERIC_ACCOUNTS, normalizePath, forgottenRoots } from '../src/leak-pure.js';

// ── ROOT COVERAGE (10/08/2026) ──────────────────────────────────────────
// ⚠️ These cases live HERE, in the PURE suite, and not only in the gate:
//    Stryker only replays the suites in its `include`. Tested only from the
//    gate, the code was mutated but NOT COVERED — 16 "no cov" mutants, that is,
//    an advertised guarantee nobody was holding.

test('normalizePath: separators, case and trailing slash make only ONE form', () => {
  assert.equal(normalizePath('C:\\Users\\x\\clients'), 'c:/users/x/clients');
  assert.equal(normalizePath('C:/Users/x/clients/'), 'c:/users/x/clients');
  assert.equal(normalizePath('a//b\\\\c///'), 'a/b/c');
  // ⚠️ Non-string: TOTAL, never a crash (a mistyped root must not bring the
  //    gate down — it must come out as undecided).
  assert.equal(normalizePath(42), '42');
});

test('forgottenRoots: only the root neither derived nor ignored comes out', () => {
  const seen = () => ['C:/p/client-sites', 'C:/p/agent/clients', 'C:/p/clients-vrac'];
  assert.deepEqual(
    forgottenRoots(seen(), ['C:/p/client-sites'], ['C:/p/agent/clients']),
    ['C:/p/clients-vrac']);
  // Everything decided ⇒ silence.
  assert.deepEqual(
    forgottenRoots(seen(), ['C:/p/client-sites', 'C:/p/clients-vrac'], ['C:/p/agent/clients']),
    []);
  // Nothing decided ⇒ all three come out, IN DISCOVERY ORDER.
  assert.deepEqual(forgottenRoots(seen(), [], []), seen());
});

test('forgottenRoots: case/separators NEVER create a false red', () => {
  assert.deepEqual(forgottenRoots(['C:\\P\\Client-Sites\\'], ['C:/p/client-sites'], []), []);
  assert.deepEqual(forgottenRoots(['C:/p/x'], [], ['C:\\P\\X']), []);
});

test('forgottenRoots: a root seen twice is reported only ONCE', () => {
  assert.deepEqual(forgottenRoots(['C:/p/x', 'C:/P/X/', 'C:/p/x'], [], []), ['C:/p/x']);
});

test('forgottenRoots: degenerate forms — never a crash, never a false green', () => {
  assert.deepEqual(forgottenRoots(null, [], []), []);
  assert.deepEqual(forgottenRoots(undefined, ['a'], ['b']), []);
  assert.deepEqual(forgottenRoots([], [], []), []);
  // 🛑 Lists absent ⇒ NOTHING is decided ⇒ everything comes out. The direction
  //    of the bias is deliberate: a corrupted private list must make the gate
  //    RED, never mute (a false green here lets a leak through).
  assert.deepEqual(forgottenRoots(['C:/p/x'], null, null), ['C:/p/x']);
  assert.deepEqual(forgottenRoots(['C:/p/x'], 'not an array', 42), ['C:/p/x']);
});

// ⚠️ WE NEVER WRITE A CGNAT-BLOCK IP IN CLEAR HERE: this file is TRACKED, and
//    the gate of this very file forbids it — rightly so (it caught a REAL
//    production IP written here on 04/08/2026). So we assemble it at runtime:
//    the literal exists in no file.
const ip = (...o) => o.join('.');
// Same reason for an email outside the reserved domains: we assemble it.

// ── THE PATTERNS ────────────────────────────────────────────────────────
test('without context: only email and real IP remain covered', () => {
  assert.equal(forbiddenPatterns(undefined, undefined, undefined).length, 2);
});

test('a term that is too short invents NO pattern', () => {
  // ⚠️ A 1-2 character term would match half the repo: the gate would be red
  //    permanently, hence unplugged.
  assert.equal(forbiddenPatterns('ab', '', ['x']).length, 2);
  assert.equal(forbiddenPatterns('abc', '', []).length, 3);
  assert.equal(forbiddenPatterns('', '', ['abcd']).length, 3);
});

test('a term present twice creates only ONE pattern (dedup)', () => {
  const m = forbiddenPatterns('dupont', 'C:/Users/dupont', ['dupont']);
  assert.equal(m.filter((x) => x.name.includes('dupont')).length, 1);
});

test('non-string / non-array inputs: ignored, never a throw', () => {
  assert.equal(forbiddenPatterns(42, {}, 'not an array').length, 2);
  assert.equal(forbiddenPatterns(null, null, [42, null, 'valide']).length, 3);
});

// ── WORD BOUNDARIES (the false positive that kills a gate) ──────────────
test('WORD BOUNDARIES: a first name does not match the word containing it', () => {
  // ⚠️ REAL case of 04/08/2026: the maintainer's first name is a sub-word of a
  //    common word — the gate went red on `frontmatter.js` and on the skill,
  //    two false positives. A gate that screams on healthy code stops being
  //    read, and the day it is right nobody believes it.
  const m = forbiddenPatterns(undefined, undefined, ['Marc']);
  assert.deepEqual(scan('un piège marchand', m), []);
  assert.deepEqual(scan('sur le marché', m), []);
  assert.equal(scan('written by Marc', m).length, 1);
  assert.equal(scan('(Marc)', m).length, 1);
  assert.equal(scan('Marc, the maintainer', m).length, 1);
});

test('case is ignored (a leak in capitals is still a leak)', () => {
  const m = forbiddenPatterns(undefined, undefined, ['dupont']);
  assert.equal(scan('DUPONT', m).length, 1);
});

// ── THE HOME PATH ───────────────────────────────────────────────────────
test('lastSegment: the USER folder, never the generic root', () => {
  // ⚠️ Taking ALL the segments would give "Users", present in every example
  //    path of the repo (`C:/Users/dev/...`, the documented convention): 6 false
  //    positives measured on 04/08/2026.
  assert.equal(lastSegment('C:/Users/dev'), 'dev');
  assert.equal(lastSegment('C:\\Users\\dev\\'), 'dev');
  assert.equal(lastSegment('/home/dev'), 'dev');
  assert.equal(lastSegment(''), '');
});

test('escapeLiteral: a Windows path becomes a LITERAL, never a wildcard', () => {
  // ⚠️ Without escaping, `C:\Users\x` contains `\U` and `.`: the regex would
  //    match almost everything and the gate would scream at the whole repo.
  const re = new RegExp(escapeLiteral('C:\\Users\\dev'));
  assert.ok(re.test('C:\\Users\\dev'));
  assert.ok(!re.test('CxUsersxdev'));
  assert.equal(escapeLiteral('a.b*c'), 'a\\.b\\*c');
});

// ── THE GENERIC PATTERNS ────────────────────────────────────────────────
test('EMAIL: a real domain is refused, documentation domains are not', () => {
  // ⚠️ RFC 2606 reserves example./test. for documentation: those are the ONLY
  //    admissible emails in a public repo.
  const m = forbiddenPatterns(undefined, undefined, []);
  assert.equal(scan('contact: ' + 'quelquun' + '@' + 'societe.fr', m).length, 1);
  assert.deepEqual(scan('contact: dev@example.com', m), []);
  assert.deepEqual(scan('contact: qa@test.org', m), []);
});

test('IP: the CGNAT block (real machines) is refused, its edges are not', () => {
  const m = forbiddenPatterns(undefined, undefined, []);
  assert.equal(scan('vps ' + ip(100, 88, 41, 95), m).length, 1);
  assert.equal(scan('vps ' + ip(100, 64, 0, 0), m).length, 1);
  assert.equal(scan('vps ' + ip(100, 127, 255, 255), m).length, 1);
  // Outside the 100.64/10 block: some public address space, not our machines.
  assert.deepEqual(scan(ip(100, 63, 0, 1), m), []);
  assert.deepEqual(scan(ip(100, 128, 0, 1), m), []);
});

test('IP: the DOCUMENTATION ranges remain allowed', () => {
  // ⚠️ The doctrine REQUIRES writing 203.0.113.x in examples. A gate forbidding
  //    them would make its own rule inapplicable.
  const m = forbiddenPatterns(undefined, undefined, []);
  assert.deepEqual(scan('demo 203.0.113.7', m), []);
  assert.deepEqual(scan('local 127.0.0.1', m), []);
  assert.deepEqual(scan('bind 0.0.0.0', m), []);
});

// ── TOTALITY ────────────────────────────────────────────────────────────
test('scan: TOTAL — absurd inputs, never a throw', () => {
  const m = forbiddenPatterns('dupont', 'C:/Users/dupont', []);
  for (const wrong of [undefined, null, 42, {}, []]) {
    assert.deepEqual(scan(wrong, m), []);
    assert.deepEqual(scan('text', wrong), []);
  }
});

test('scan: returns the PATTERN and the EXCERPT (a mute gate is unusable)', () => {
  // ⚠️ The message must say WHAT to remove and WHERE: without the excerpt, the
  //    author searches blindly and ends up unplugging the gate.
  const m = forbiddenPatterns(undefined, undefined, ['dupont']);
  const r = scan('author: dupont', m);
  assert.equal(r.length, 1);
  assert.match(r[0].name, /dupont/);
  assert.equal(r[0].excerpt, 'dupont');
});

test('NEGATIVE-CHECK: a clean text triggers NOTHING', () => {
  // ⚠️ Without this case, "everything is a leak" would pass all the others.
  const m = forbiddenPatterns('dupont', 'C:/Users/dupont', ['Marc', 'boulangerie-durand']);
  assert.deepEqual(scan('const x = 1; // nothing personal here', m), []);
  assert.deepEqual(scan('fixture path: C:/Users/dev/projet', m), []);
});

// ── HOLES REVEALED BY MUTATION (04/08/2026, 10 survivors) ───────────────
test('the HOME FOLDER contributes its own pattern, distinct from the OS account', () => {
  // ⚠️ Without this case, deleting the whole "home folder" branch passed GREEN:
  //    the other tests used a folder whose last segment EQUALS the OS account,
  //    so the dedup masked the loss.
  const m = forbiddenPatterns('compte', 'C:/Users/other-folder', []);
  assert.equal(m.length, 4, 'email + IP + account + folder');
  assert.equal(scan('path C:/Users/other-folder/x', m).length, 1);
});

test('3-character THRESHOLD: exactly 3 counts, 2 does not', () => {
  // ⚠️ EXACT boundary, hard-coded: a `>` instead of a `>=` would let 3-letter
  //    terms through without any test flinching.
  assert.equal(forbiddenPatterns('', '/home/abc', []).length, 3, 'folder of 3 = kept');
  assert.equal(forbiddenPatterns('', '/home/ab', []).length, 2, 'folder of 2 = ignored');
  assert.equal(forbiddenPatterns('', '', ['abc']).length, 3, 'term of 3 = kept');
  assert.equal(forbiddenPatterns('', '', ['ab']).length, 2, 'term of 2 = ignored');
});

test('LEFT BOUNDARY: a term glued to the end of a word does not count', () => {
  // ⚠️ Hole found by Stryker: only the RIGHT boundary was proven ("Marc" ⊄
  //    "marchand"). Without this case, removing the LEFT `\b` passed green —
  //    and the gate would have screamed at every word ending with the term.
  //    Both boundaries, never just one.
  const m = forbiddenPatterns(undefined, undefined, ['dupont']);
  assert.deepEqual(scan('grandupont', m), [], 'glued on the left: not an occurrence');
  assert.equal(scan('grand dupont', m).length, 1, 'detached: occurrence');
});

test('every pattern carries a LABEL saying what was found', () => {
  // ⚠️ A gate returning "violation" without saying which one is unusable: the
  //    author searches blindly and ends up unplugging it. The labels are
  //    therefore CONTRACT, not decoration.
  const m = forbiddenPatterns(undefined, undefined, []);
  assert.equal(scan('a' + '@' + 'societe.fr', m)[0].name, 'real email');
  assert.equal(scan(ip(100, 88, 41, 95), m)[0].name, 'real machine IP (CGNAT/Tailscale)');
  assert.equal(
    scan('dupont', forbiddenPatterns(undefined, undefined, ['dupont']))[0].name,
    'personal data: dupont'
  );
});

// ── GENERIC ACCOUNTS (CI regression of 04/08/2026) ──────────────────────
test('a SYSTEM/CI account is never treated as an identity', () => {
  // ⚠️ REAL REGRESSION: on GitHub Actions the account is called `runner`.
  //    Derived as-is, it matched "test runner", "tap-runner",
  //    "commandRunner"… → 13 false positives, RED CI at the first push.
  //    A gate red on healthy code ends up unplugged: these names are RULED OUT.
  //    Reverse risk nil — nobody is called "root" or "runner".
  const m = forbiddenPatterns('runner', '/home/runner', []);
  assert.equal(m.length, 2, 'no pattern derived from a generic account');
  assert.deepEqual(scan('the vitest test runner', m), []);
  assert.deepEqual(scan('/home/runner/work/projet', m), []);
});

test('case does NOT bypass the generic-account filter', () => {
  assert.equal(forbiddenPatterns('Runner', '/home/ROOT', []).length, 2);
});

test('a NON generic account stays protected (the filter does not disarm everything)', () => {
  // ⚠️ Without this case, ruling out ALL accounts would pass green: the gate
  //    would only have email + IP left and nobody would notice.
  const m = forbiddenPatterns('jdupont', '/home/jdupont', []);
  assert.equal(m.length, 3);
  assert.equal(scan('/home/jdupont/x', m).length, 1);
});

test('a DECLARED generic term is ruled out too', () => {
  // The filter applies to the literal, never to its origin.
  assert.equal(forbiddenPatterns('', '', ['runner', 'jdupont']).length, 3);
});

test('the list of generic accounts is a hard-coded CONTRACT', () => {
  // ⚠️ Written HARD-CODED, never derived from the code under test: an
  //    expectation mutating WITH the code would make every mutant invisible
  //    (fleet precedent, see quality-configs). Adding an account here = a
  //    DELIBERATE choice, since each entry DISARMS a protection — the list must
  //    stay short and justified.
  assert.deepEqual([...GENERIC_ACCOUNTS].sort(), [
    'admin', 'administrator', 'build', 'builder', 'docker', 'github', 'home',
    'jenkins', 'root', 'runner', 'ubuntu', 'user', 'users', 'vagrant',
  ]);
});
