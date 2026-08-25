// ═══════════════════════════════════════════════════════════════════════
// THE DECLARABLE ADDRESSES — the DECISIONS, judged alone (2026-08-24)
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS SUITE PROTECTS. `stateDir`, `docsDir` and `sessionDocsDir` let
//    an operator DECLARE where the framework's data lives, and
//    `--ctxroute-config` lets them declare where its config lives, so that
//    those addresses stop being derived from the address of the CODE. The whole
//    delivery is worth nothing if any of these facts stops holding, and each
//    one fails SILENTLY:
//      ① nothing declared ⇒ EXACTLY the historical address (a default that
//         moved would relocate every fleet's memory and corpus on upgrade, with
//         nothing red);
//      ② a declared ABSOLUTE path is honoured (otherwise the key is
//         "accepted and inert" — this repository's oldest defect class);
//      ③ the reserved `CTXROUTE_*` variables still BEAT the declaration (they
//         are RESERVED for tests and doctor.js: were a config to win, every
//         suite that isolates itself in a tmpdir would start writing into the
//         REAL data, which is the accident of 15/07/2026 one folder over);
//      ④ a RELATIVE value is a NAMED REFUSAL — never a quiet fallback to the
//         code-derived path, which would let the operator believe the data
//         lives where they wrote it while the framework used another folder.
//
// ⚠️ DETERMINISTIC AND SPAWN-FREE ON PURPOSE: this file is what Stryker runs
//    against `src/declared-paths-pure.js`. The end-to-end behaviour of
//    `paths.*` (real config file, real env, a REAL spawned shell) lives in
//    `test/declared-paths.test.js`, which mutates `process.env` and therefore
//    belongs to the heavy lane.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';
// ⚠️ DIRECT **STATIC ESM** import of the mutated module — never through a
//    re-export, and 🛑 NEVER through `createRequire`. Two distinct reasons,
//    both silent when violated:
//      ① a re-export breaks the perTest coverage mapping, and the mutants get
//         credited to somebody else's suite;
//      ② a `createRequire(...)` edge does not exist in the ESM module graph,
//         which is the ONLY graph `vitest --related` walks. The Stryker vitest
//         runner narrows the run to the suites RELATED to the mutated files,
//         so a module reached that way has NO related suite at all: measured
//         2026-08-25, `stryker run --mutate src/declared-paths-pure.js` died
//         on `DryRunExecutor No tests were found` / `ConfigError: No tests
//         were executed`, with 198 mutants instrumented and ZERO tests run,
//         while the very same config run under plain vitest listed 1,280
//         green tests. The module shipped WITHOUT its mutation proof and
//         nothing was red. `src/declared-paths-pure.js` is CommonJS, so the
//         default export IS its `module.exports`.
import declared from '../src/declared-paths-pure.js';

// ⚠️ A THUNK, evaluated INSIDE each test: a fixture built at module level is a
//    STATIC mutant, covered by no test, hence a false survivor (42 measured on
//    this repo on 16/07/2026).
const base = (over) => ({
  configKey: 'stateDir',
  envDir: undefined,
  readConfiguredDir: () => undefined,
  defaultDir: '/derived/from/the/code/state',
  isAbsolute: (p) => p.startsWith('/'),
  ...over,
});

const argvBase = (over) => ({
  argv: ['node', 'hook.js'],
  isAbsolute: (p) => p.startsWith('/'),
  ...over,
});

// ── ① ─────────────────────────────────────────────────────────────────────
test('① no key declared ⇒ the code-derived default, unchanged', () => {
  assert.equal(declared.resolveDeclaredDir(base()), '/derived/from/the/code/state');
});

test('① a key explicitly null ⇒ the code-derived default too (JSON has no `undefined`)', () => {
  assert.equal(
    declared.resolveDeclaredDir(base({ readConfiguredDir: () => null })),
    '/derived/from/the/code/state'
  );
});

// ── ② ─────────────────────────────────────────────────────────────────────
test('② a DECLARED absolute path wins over the code-derived default', () => {
  assert.equal(
    declared.resolveDeclaredDir(base({ readConfiguredDir: () => '/declared/elsewhere' })),
    '/declared/elsewhere'
  );
});

// ── ③ ─────────────────────────────────────────────────────────────────────
test('③ the reserved env variable still BEATS the declared config (suites keep their isolation)', () => {
  assert.equal(
    declared.resolveDeclaredDir(base({
      envDir: '/tmp/throwaway',
      readConfiguredDir: () => '/declared/elsewhere',
    })),
    '/tmp/throwaway'
  );
});

test('③ the env override does not even ASK for the config (stage ② is never paid at stage ①)', () => {
  let asked = 0;
  declared.resolveDeclaredDir(base({
    envDir: '/tmp/throwaway',
    readConfiguredDir: () => { asked += 1; return '/declared/elsewhere'; },
  }));
  assert.equal(asked, 0);
});

test('③ an EMPTY env variable is an ABSENT one (it must not pin the address to the cwd)', () => {
  assert.equal(
    declared.resolveDeclaredDir(base({ envDir: '', readConfiguredDir: () => '/declared/elsewhere' })),
    '/declared/elsewhere'
  );
});

test('③ a non-string env value is ignored, never coerced into an address', () => {
  assert.equal(
    declared.resolveDeclaredDir(base({ envDir: 42, readConfiguredDir: () => '/declared/elsewhere' })),
    '/declared/elsewhere'
  );
});

// ── ④ ─────────────────────────────────────────────────────────────────────
test('④ a RELATIVE path is REFUSED — never silently resolved against an unknown base', () => {
  assert.throws(
    () => declared.resolveDeclaredDir(base({ readConfiguredDir: () => 'state' })),
    (e) => {
      // 🛑 The DETAIL of a refusal is CONTRACT, not decoration: whoever reads it
      //    must learn WHICH key and WHICH value, or they cannot act on it.
      assert.ok(e instanceof Error);
      assert.match(e.message, /ctxroute REFUSED/);
      assert.match(e.message, /"stateDir"/);
      assert.match(e.message, /"state"/);
      assert.match(e.message, /a RELATIVE path/);
      return true;
    }
  );
});

test('④ the refusal message, asserted WHOLE and HARDCODED (a refusal detail is contract, not decoration)', () => {
  // ⚠️ COPIED from the source, never reconstructed from memory and never read back
  //    out of the module (that would demonstrate `x === x`). Every sentence here
  //    tells the operator something they need to act: what is wrong, why an
  //    absolute path is required, and what the two ways out are.
  const expected = 'ctxroute REFUSED: the config key "stateDir" is a RELATIVE path — received "state". '
    + 'It must be an ABSOLUTE path. A relative one would be resolved against a working directory '
    + 'this framework does not control (a hook is spawned by the harness, from wherever the agent '
    + 'happens to stand), so two callers would silently address two different directories. '
    + 'Nothing is resolved at all: fix "stateDir", or remove the key to keep the default '
    + 'directory derived from the code.';
  try {
    declared.resolveDeclaredDir(base({ readConfiguredDir: () => 'state' }));
    assert.fail('a relative path must be refused');
  } catch (e) {
    assert.equal(e.message, expected);
  }
});

test('④ the refusal names the OFFENDING key, not a fixed one — the three keys are distinguishable', () => {
  // ⚠️ ANTI-VACUITY on the generalisation: with the key hardcoded again, a
  //    `docsDir` mistake would be reported as a `stateDir` mistake and the
  //    operator would go and fix a key they never wrote.
  for (const key of [declared.STATE_DIR_KEY, declared.DOCS_DIR_KEY, declared.SESSION_DOCS_DIR_KEY]) {
    assert.throws(
      () => declared.resolveDeclaredDir(base({ configKey: key, readConfiguredDir: () => 'somewhere' })),
      new RegExp(`the config key "${key}" is a RELATIVE path`)
    );
  }
});

test('④ the three config keys are spelled ONCE, and here is that spelling', () => {
  assert.equal(declared.STATE_DIR_KEY, 'stateDir');
  assert.equal(declared.DOCS_DIR_KEY, 'docsDir');
  assert.equal(declared.SESSION_DOCS_DIR_KEY, 'sessionDocsDir');
});

test('④ an EMPTY string is refused too (it is neither absent nor an address)', () => {
  assert.throws(
    () => declared.resolveDeclaredDir(base({ readConfiguredDir: () => '' })),
    /not a non-empty string/
  );
});

test('④ a non-string declared value is refused, and the refusal shows it', () => {
  assert.throws(
    () => declared.resolveDeclaredDir(base({ readConfiguredDir: () => 7 })),
    (e) => {
      assert.match(e.message, /not a non-empty string/);
      assert.match(e.message, /received 7/);
      return true;
    }
  );
});

test('④ the refusal is a THROW, never a fallback — the default must NOT come back', () => {
  let returned = null;
  try { returned = declared.resolveDeclaredDir(base({ readConfiguredDir: () => 'relative/state' })); } catch { /* expected */ }
  assert.equal(returned, null, 'a refusal that returns the code-derived path is the silent defect itself');
});

test('the platform decides what is absolute — the injected predicate is really consulted', () => {
  // ⚠️ ANTI-VACUITY: with a predicate that answers `false` for everything, even a
  //    POSIX-looking path must be refused. Otherwise the module would be judging
  //    absoluteness with a rule of its own, i.e. guessing what `path` knows.
  assert.throws(
    () => declared.resolveDeclaredDir(base({ readConfiguredDir: () => '/looks/absolute', isAbsolute: () => false })),
    /a RELATIVE path/
  );
  // And the mirror: a value the platform calls absolute is accepted as-is.
  assert.equal(
    declared.resolveDeclaredDir(base({ readConfiguredDir: () => 'C:\\state', isAbsolute: () => true })),
    'C:\\state'
  );
});

// ═══════════════════════════════════════════════════════════════════════
// THE CONFIG'S OWN ADDRESS — a LAUNCH ARGUMENT, and the refusals around it
// ═══════════════════════════════════════════════════════════════════════

test('flag ABSENT ⇒ undefined, i.e. the caller keeps the config next to the code', () => {
  assert.equal(declared.configPathArgument(argvBase()), undefined);
});

test('a non-array argv is no argv at all — never a crash on the hot path', () => {
  assert.equal(declared.configPathArgument(argvBase({ argv: undefined })), undefined);
});

test('flag PRESENT with an absolute address ⇒ that address, verbatim', () => {
  assert.equal(
    declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config', '/frozen/ctxroute-config.json'] })),
    '/frozen/ctxroute-config.json'
  );
});

test('the flag is read wherever it sits, and the address is the token AFTER it', () => {
  assert.equal(
    declared.configPathArgument(argvBase({
      argv: ['node', 'hook.js', '--ctxroute-config', '/frozen/cfg.json', '--frame', '3', '--frames', '32'],
    })),
    '/frozen/cfg.json'
  );
});

test('the flag has ONE spelling, and here it is (four shells cannot drift apart)', () => {
  assert.equal(declared.CONFIG_FLAG, '--ctxroute-config');
});

test('🛑 the flag NAMESPACED: a bare `--config` belongs to other tools and must NOT be read', () => {
  // 🔴 MEASURED: four npm scripts of this package pass `--config` to vitest or to
  //    dependency-cruiser, and `paths.js` is loaded INSIDE those processes. A bare
  //    flag would have made the framework read `vitest.heavy.config.mjs` as its
  //    own config, silently, in the middle of the suite.
  assert.equal(
    declared.configPathArgument(argvBase({ argv: ['node', 'vitest', 'run', '--config', '/repo/vitest.heavy.config.mjs'] })),
    undefined
  );
});

test('🛑 the flag followed by ANOTHER FLAG is a REFUSAL, never a silent fallback', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config', '--frame', '3'] })),
    (e) => {
      assert.match(e.message, /ctxroute REFUSED/);
      assert.match(e.message, /"--ctxroute-config"/);
      assert.match(e.message, /followed by another FLAG instead of an address/);
      assert.match(e.message, /"--frame"/);
      return true;
    }
  );
});

test('🛑 the flag with NOTHING after it is a REFUSAL', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config'] })),
    /followed by no address at all/
  );
});

test('🛑 the flag followed by an EMPTY token is a REFUSAL too', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config', ''] })),
    /followed by no address at all/
  );
});

test('🛑 a RELATIVE address is a REFUSAL — the cwd of a spawned hook is not ours to guess', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config', 'ctxroute-config.json'] })),
    /is a RELATIVE path/
  );
});

test('🛑 the flag declared TWICE is a REFUSAL — two spellings of one address are two addresses', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({
      argv: ['node', 'hook.js', '--ctxroute-config', '/a/cfg.json', '--ctxroute-config', '/b/cfg.json'],
    })),
    /declared MORE THAN ONCE/
  );
});

test('the argument refusal, asserted WHOLE and HARDCODED', () => {
  const expected = 'ctxroute REFUSED: the launch argument "--ctxroute-config" is a RELATIVE path — received "cfg.json". '
    + 'It must be followed by ONE ABSOLUTE path to a config file. A relative one would be resolved '
    + 'against a working directory this framework does not control (a hook is spawned by the harness, '
    + 'from wherever the agent happens to stand), so two callers would silently read two different '
    + 'configs. Nothing is resolved at all: fix the argument, or remove "--ctxroute-config" to keep the '
    + 'config file that sits next to the code.';
  try {
    declared.configPathArgument(argvBase({ argv: ['node', 'hook.js', '--ctxroute-config', 'cfg.json'] }));
    assert.fail('a relative config address must be refused');
  } catch (e) {
    assert.equal(e.message, expected);
  }
});

test('the platform decides absoluteness HERE TOO — the injected predicate is really consulted', () => {
  assert.throws(
    () => declared.configPathArgument(argvBase({
      argv: ['node', 'hook.js', '--ctxroute-config', '/looks/absolute.json'],
      isAbsolute: () => false,
    })),
    /is a RELATIVE path/
  );
  assert.equal(
    declared.configPathArgument(argvBase({
      argv: ['node', 'hook.js', '--ctxroute-config', 'C:\\frozen\\cfg.json'],
      isAbsolute: () => true,
    })),
    'C:\\frozen\\cfg.json'
  );
});

// ═══════════════════════════════════════════════════════════════════════
// THE OS-CONVENTIONAL PER-USER CONFIG — the THREE platforms, from ONE host
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THESE CELLS PROTECT. The address is DOCUMENTED by a third party, so
//    getting it wrong is not a style mistake: the framework would look for its
//    rules in a folder no operating system ever offers, i.e. never find them,
//    i.e. behave exactly as if the operator had written nothing. And because
//    the caller only takes this address WHEN THE FILE EXISTS, that failure is
//    perfectly SILENT. The platform and the environment are INJECTED, which is
//    what lets Windows, macOS and Linux be proven from whichever host runs this.

// ⚠️ A THUNK, evaluated INSIDE each test (a module-level fixture is a static
//    mutant, hence a false survivor).
const conventional = (over) => ({
  platform: 'linux',
  env: {},
  home: '/home/dev',
  isAbsolute: (p) => p.startsWith('/'),
  ...over,
});

// ── Linux / XDG ───────────────────────────────────────────────────────────
test('XDG: no `XDG_CONFIG_HOME` ⇒ $HOME/.config, the default the specification documents', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional()),
    ['/home/dev', '.config', 'ctxroute', 'ctxroute-config.json']
  );
});

test('XDG: an ABSOLUTE `XDG_CONFIG_HOME` replaces the home-anchored default', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: '/etc/xdg-of-this-user' } })),
    ['/etc/xdg-of-this-user', 'ctxroute', 'ctxroute-config.json']
  );
});

test('XDG: an EMPTY `XDG_CONFIG_HOME` is an ABSENT one — the spec says "not set or empty"', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: '' } })),
    ['/home/dev', '.config', 'ctxroute', 'ctxroute-config.json']
  );
});

test('XDG: a non-string `XDG_CONFIG_HOME` is ignored, never coerced into an address', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: 42 } })),
    ['/home/dev', '.config', 'ctxroute', 'ctxroute-config.json']
  );
});

test('🛑 XDG: a RELATIVE `XDG_CONFIG_HOME` is a NAMED REFUSAL carrying what was READ', () => {
  // 🛑 DECLARED DIVERGENCE FROM THE SPEC, not an oversight: it says "ignore",
  //    which is right for a desktop application and wrong here — this address
  //    decides which RULE SET a whole fleet obeys, so a silent substitution is
  //    the "two callers, two configs" defect. Loud beats silent.
  assert.throws(
    () => declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: 'relative/config' } })),
    (e) => {
      assert.match(e.message, /ctxroute REFUSED/);
      assert.match(e.message, /"XDG_CONFIG_HOME"/);
      assert.match(e.message, /"relative\/config"/);
      assert.match(e.message, /a RELATIVE path/);
      return true;
    }
  );
});

test('an UNKNOWN platform takes the XDG lane — the specification is not Linux-only', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ platform: 'freebsd', env: { XDG_CONFIG_HOME: '/x' } })),
    ['/x', 'ctxroute', 'ctxroute-config.json']
  );
});

// ── Windows ───────────────────────────────────────────────────────────────
test('Windows: `%APPDATA%` is the documented default path of FOLDERID_RoamingAppData', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' },
      home: 'C:\\Users\\dev',
      isAbsolute: () => true,
    })),
    ['C:\\Users\\dev\\AppData\\Roaming', 'ctxroute', 'ctxroute-config.json']
  );
});

test('Windows: no `%APPDATA%` ⇒ %USERPROFILE%\\AppData\\Roaming, the documented expansion', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({
      platform: 'win32', env: {}, home: 'C:\\Users\\dev', isAbsolute: () => true,
    })),
    ['C:\\Users\\dev', 'AppData', 'Roaming', 'ctxroute', 'ctxroute-config.json']
  );
});

test('🛑 Windows: a RELATIVE `%APPDATA%` is a NAMED REFUSAL naming THAT variable', () => {
  assert.throws(
    () => declared.conventionalConfigParts(conventional({
      platform: 'win32', env: { APPDATA: 'AppData\\Roaming' }, home: 'C:\\Users\\dev', isAbsolute: () => false,
    })),
    (e) => {
      assert.match(e.message, /"APPDATA"/);
      assert.match(e.message, /a RELATIVE path/);
      return true;
    }
  );
});

test('Windows does NOT read `XDG_CONFIG_HOME` — the PLATFORM decides which variable is authoritative', () => {
  // ⚠️ ANTI-CROSS-WIRING: one environment bag, three lanes, and a copy/paste
  //    sending the Windows lane to the XDG variable would be invisible on a
  //    Linux host.
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({
      platform: 'win32', env: { XDG_CONFIG_HOME: '/etc/xdg' }, home: 'C:\\Users\\dev', isAbsolute: () => true,
    })),
    ['C:\\Users\\dev', 'AppData', 'Roaming', 'ctxroute', 'ctxroute-config.json']
  );
});

// ── macOS ─────────────────────────────────────────────────────────────────
test('macOS: ~/Library/Application Support/<app>, the directory Apple documents for app data', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ platform: 'darwin', home: '/Users/dev' })),
    ['/Users/dev', 'Library', 'Application Support', 'ctxroute', 'ctxroute-config.json']
  );
});

test('macOS ignores `XDG_CONFIG_HOME` — Apple documents no such variable', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ platform: 'darwin', home: '/Users/dev', env: { XDG_CONFIG_HOME: '/etc/xdg' } })),
    ['/Users/dev', 'Library', 'Application Support', 'ctxroute', 'ctxroute-config.json']
  );
});

// ── the home, which every documented default is anchored at ───────────────
test('🛑 an EMPTY home is a NAMED REFUSAL — an address anchored at nothing is not an address', () => {
  assert.throws(
    () => declared.conventionalConfigParts(conventional({ home: '' })),
    (e) => {
      assert.match(e.message, /the home directory reported by the operating system/);
      assert.match(e.message, /not a non-empty string/);
      return true;
    }
  );
});

test('🛑 a non-string home is a NAMED REFUSAL, and the refusal shows what it read', () => {
  assert.throws(
    () => declared.conventionalConfigParts(conventional({ home: undefined })),
    /the home directory reported by the operating system is not a non-empty string/
  );
});

test('🛑 a RELATIVE home is a NAMED REFUSAL too', () => {
  assert.throws(
    () => declared.conventionalConfigParts(conventional({ home: 'dev' })),
    (e) => {
      assert.match(e.message, /the home directory reported by the operating system/);
      assert.match(e.message, /a RELATIVE path/);
      return true;
    }
  );
});

test('an ABSOLUTE `XDG_CONFIG_HOME` needs no home at all — the home is read only when it is USED', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ home: undefined, env: { XDG_CONFIG_HOME: '/x' } })),
    ['/x', 'ctxroute', 'ctxroute-config.json']
  );
});

test('Windows with an ABSOLUTE `%APPDATA%` needs no home either', () => {
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({
      platform: 'win32', env: { APPDATA: 'D:\\roaming' }, home: undefined, isAbsolute: () => true,
    })),
    ['D:\\roaming', 'ctxroute', 'ctxroute-config.json']
  );
});

// ── contract ──────────────────────────────────────────────────────────────
test('the app directory and the file name are spelled ONCE, and here is that spelling', () => {
  assert.equal(declared.APP_DIR_NAME, 'ctxroute');
  assert.equal(declared.CONFIG_FILE_NAME, 'ctxroute-config.json');
});

test('the conventional refusal, asserted WHOLE and HARDCODED (a refusal detail is contract)', () => {
  // ⚠️ COPIED from the source, never reconstructed from memory and never read
  //    back out of the module (that would demonstrate `x === x`).
  const expected = 'ctxroute REFUSED: the environment variable "XDG_CONFIG_HOME" is a RELATIVE path — received "cfg". '
    + 'The OS-conventional per-user configuration file is addressed from it, so a value this '
    + 'framework cannot honour is NEVER replaced by a guess — it would read a configuration out of '
    + 'a directory nobody named, and look healthy doing it. Nothing is resolved at all: correct it, '
    + 'or leave it unset to keep the location this platform documents.';
  try {
    declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: 'cfg' } }));
    assert.fail('a relative conventional root must be refused');
  } catch (e) {
    assert.equal(e.message, expected);
  }
});

test('the platform decides absoluteness HERE TOO — the injected predicate is really consulted', () => {
  // ⚠️ ANTI-VACUITY: with a predicate answering `false` for everything, even a
  //    POSIX-looking root must be refused.
  assert.throws(
    () => declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: '/looks/absolute' }, isAbsolute: () => false })),
    /a RELATIVE path/
  );
  assert.deepEqual(
    declared.conventionalConfigParts(conventional({ env: { XDG_CONFIG_HOME: 'C:\\cfg' }, isAbsolute: () => true })),
    ['C:\\cfg', 'ctxroute', 'ctxroute-config.json']
  );
});

// ════════════════════════════════════════════════════════════════════════
// THE DAEMON'S LISTENING ADDRESS — ONE fact, resolved WHOLE (2026-08-25)
// ════════════════════════════════════════════════════════════════════════
//
// 🔑 The same four facts as the directories above, on the address the daemon
//    BINDS and the wiring POSTs to — and each one fails SILENTLY, on a lane that
//    has NO fallback, so the loss is EVERY frame of EVERY action.
// 🛑 PLUS ONE THIS SUITE EXISTS TO KEEP: the two halves are resolved in ONE
//    call. A host fetched apart from its port is two settings for one fact, and
//    that is exactly the divergence the grouped key removes.

/** The declaration under test, with an INJECTED reader — never a file. */
const endpoint = (o = {}) => declared.resolveDeclaredHttp({
  envPort: o.envPort,
  readConfiguredHttp: () => o.declared,
});

test('nothing declared resolves the historical address, byte for byte', () => {
  // ⚠️ A default that moved would send the daemon and the wiring somewhere
  //    else on upgrade, with nothing red — zero default change is the acceptance
  //    criterion, not a preference. Written out, never read back from the module.
  assert.deepEqual(endpoint(), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(endpoint({ declared: null }), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(endpoint({ declared: {} }), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(endpoint({ envPort: '' }), { host: '127.0.0.1', port: 8787 },
    'An EMPTY variable is an ABSENT variable: a shell exporting CTXROUTE_HTTP_PORT= set nothing.');
  // The exported defaults are the SAME fact, and a consumer reads them.
  assert.equal(declared.DEFAULT_HTTP_HOST, '127.0.0.1');
  assert.equal(declared.DEFAULT_HTTP_PORT, 8787);
});

test('a declared address is HONOURED — both halves, and each one alone', () => {
  // ⚠️ "Accepted and inert" is this repository's oldest defect class: a key the
  //    schema takes and the engine ignores.
  assert.deepEqual(endpoint({ declared: { host: 'declared.invalid', port: 41999 } }),
    { host: 'declared.invalid', port: 41999 });
  // 🛑 EACH HALF IS OPTIONAL ON ITS OWN, and this is what proves the halves are
  //    not cross-wired: declaring one must leave the OTHER historical.
  assert.deepEqual(endpoint({ declared: { host: 'declared.invalid' } }),
    { host: 'declared.invalid', port: 8787 });
  assert.deepEqual(endpoint({ declared: { port: 41999 } }),
    { host: '127.0.0.1', port: 41999 });
  assert.deepEqual(endpoint({ declared: { host: null, port: null } }),
    { host: '127.0.0.1', port: 8787 });
});

test('the environment variable BEATS the declared port, and touches the host NOT AT ALL', () => {
  // 🛑 IT MUST KEEP WINNING: the systemd unit declares it, the Windows installer
  //    reads it back, and every suite that forks a daemon on a free port sets it.
  assert.deepEqual(endpoint({ envPort: '41999', declared: { host: 'declared.invalid', port: 8787 } }),
    { host: 'declared.invalid', port: 41999 });
  // ⚠️ ANTI-VACUITY: the config reader is really CONSULTED even when the
  //    variable wins — the host has no environment escape, so the config is the
  //    only place it can come from and skipping that read would silence it.
  assert.deepEqual(endpoint({ envPort: '41999', declared: { host: 'declared.invalid' } }),
    { host: 'declared.invalid', port: 41999 });
});

test('an unusable half is a NAMED REFUSAL naming the key and the value, never a quiet fallback', () => {
  // 🛑 A quiet fallback IS the defect: an operator who declared an address
  //    ASKED for that address, and a daemon listening elsewhere while the wiring
  //    knocks at the declared one is the two-places divergence this key removes.
  assert.throws(() => endpoint({ declared: { port: 0 } }), /"http\.port"[\s\S]*received 0/);
  assert.throws(() => endpoint({ declared: { port: 65536 } }), /"http\.port"[\s\S]*received 65536/);
  assert.throws(() => endpoint({ declared: { port: 87.5 } }), /"http\.port"[\s\S]*received 87\.5/);
  assert.throws(() => endpoint({ declared: { port: '8787' } }), /"http\.port"[\s\S]*received "8787"/);
  assert.throws(() => endpoint({ declared: { host: '' } }), /"http\.host"[\s\S]*received ""/);
  assert.throws(() => endpoint({ declared: { host: 8787 } }), /"http\.host"[\s\S]*received 8787/);
  assert.throws(() => endpoint({ envPort: 'eight' }), /"CTXROUTE_HTTP_PORT"[\s\S]*received "eight"/);
  assert.throws(() => endpoint({ envPort: '0' }), /"CTXROUTE_HTTP_PORT"[\s\S]*received "0"/);
  // ⚠️ THE KEY ITSELF must be an object: a scalar or an array declares no
  //    address at all, and reading `.host` off it would silently resolve the
  //    historical default while the operator believes they moved the daemon.
  assert.throws(() => endpoint({ declared: 8787 }), /"http"[\s\S]*received 8787/);
  assert.throws(() => endpoint({ declared: '127.0.0.1:8787' }), /"http"[\s\S]*received "127\.0\.0\.1:8787"/);
  assert.throws(() => endpoint({ declared: ['127.0.0.1', 8787] }), /"http"[\s\S]*received \["127\.0\.0\.1",8787\]/);
  // ⚠️ THE RANGE ADMITS ITS OWN EXTREMITIES — refusing 1 or 65535 would refuse
  //    a healthy endpoint the operator is entitled to choose.
  assert.equal(endpoint({ declared: { port: 1 } }).port, 1);
  assert.equal(endpoint({ declared: { port: 65535 } }).port, 65535);
});

test('EVERY endpoint refusal SAYS WHAT A USABLE VALUE IS — the requirement is contract, never decoration', () => {
  // 🛑 `refuseEndpoint` takes the requirement as an ARGUMENT, so a caller that
  //    passed an EMPTY one would still produce a perfectly well-formed refusal:
  //    it would name the source and the value, and leave the operator with no
  //    way to know what to write instead. The whole-message cell below pins ONE
  //    of the four call sites; these three pin the others, each asserted IN
  //    PLACE (right after the value, right before the consequence) so a
  //    requirement that merely EXISTS somewhere in the sentence does not pass.
  // ⚠️ COPIED from the source, never reconstructed from memory and never read
  //    back out of the module (that would demonstrate `x === x`).
  const around = (fn, expected) => {
    try {
      fn();
      assert.fail('an unusable listening address must be refused');
    } catch (e) {
      assert.ok(e.message.includes(expected), `missing requirement: ${e.message}`);
    }
  };
  around(() => endpoint({ declared: { host: '' } }),
    'received "". It must be a non-empty string. Nothing is resolved at all:');
  around(() => endpoint({ envPort: 'eight' }),
    'received "eight". It must be an integer in 1..65535. Nothing is resolved at all:');
  around(() => endpoint({ declared: 8787 }),
    'received 8787. It must be an object carrying `host` and `port`. Nothing is resolved at all:');
});

test('the endpoint refusal, asserted WHOLE and HARDCODED (a refusal detail is contract)', () => {
  // ⚠️ COPIED from the source, never reconstructed from memory and never read
  //    back out of the module (that would demonstrate `x === x`).
  const expected = 'ctxroute REFUSED: "http.port" does not declare a usable listening address — received 0. '
    + 'It must be an integer in 1..65535. Nothing is resolved at all: the daemon BINDS this address and '
    + 'the harness wiring POSTs to it, so guessing here would wire the fleet where nobody listens — a '
    + 'refused connection is instant and SILENT on that lane, which has NO fallback. Fix "http.port", or '
    + 'remove it to keep the default address.';
  try {
    endpoint({ declared: { port: 0 } });
    assert.fail('an unusable port must be refused');
  } catch (e) {
    assert.equal(e.message, expected);
  }
});
