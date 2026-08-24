// ═══════════════════════════════════════════════════════════════════════
// `paths.*` END TO END — the real config file, the real env, a REAL shell
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY A SECOND SUITE. `declared-paths-pure.test.js` judges the DECISIONS
//    with everything injected; it can never prove that `paths.js` WIRES them —
//    that the config is really read, that the keys are really the ones the
//    schema declares, that the platform's own `path.isAbsolute` is really what
//    answers, and that a REAL spawned hook honours the launch argument. An
//    operator's declared address that the engine never consults is the
//    "accepted and inert" defect, and it is invisible to a suite built on
//    literals.
//
// ⚠️ This file MUTATES `process.env` and SPAWNS, so the derived classification
//    puts it in the HEAVY lane (`vitest-projects.mjs`) — which is correct:
//    without per-file isolation its pollution would leak into its neighbours.
// 🛑 IT NEVER TOUCHES THE SHIPPED FILES: every config it reads is written in
//    a throwaway tmpdir and reached through `CTXROUTE_CONFIG_PATH` or the
//    launch argument. Writing into the real `ctxroute-config.json` is the
//    accident of 15/07/2026 (fixture residue shipped, framework injecting
//    nothing, in silence).
// ═══════════════════════════════════════════════════════════════════════

import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const paths = require('../src/paths.js');

// ⚠️ DERIVED INDEPENDENTLY of the module under test: this suite sits in
//    `test/`, so the repo root is ONE level up — the same arithmetic
//    `paths.js` does from `src/`, written here from the OTHER side. Reading
//    `paths.ROOT` would demonstrate `x === x`.
const REPO = path.join(import.meta.dirname, '..');
const HISTORICAL = {
  state: path.join(REPO, 'state'),
  docs: path.join(REPO, 'docs', 'mcp'),
  sessionDocs: path.join(REPO, 'docs', 'session'),
  config: path.join(REPO, 'ctxroute-config.json'),
};

// The three declarable directories, as ONE table: every cell below runs on all
// three, so a key wired for the state and forgotten for the docs is RED.
// ⚠️ DERIVED from `paths.js`'s own exports and from the pure module's key
//    constants — never a hand-written triple, which would only know today.
const declared = require('../src/declared-paths-pure.js');
const ADDRESSES = [
  { key: declared.STATE_DIR_KEY, env: 'CTXROUTE_STATE_DIR', read: () => paths.stateDir(), historical: HISTORICAL.state },
  { key: declared.DOCS_DIR_KEY, env: 'CTXROUTE_DOCS_DIR', read: () => paths.docsDir(), historical: HISTORICAL.docs },
  { key: declared.SESSION_DOCS_DIR_KEY, env: 'CTXROUTE_SESSIONDOCS_DIR', read: () => paths.sessionDocsDir(), historical: HISTORICAL.sessionDocs },
];

// ⚠️ The environment variable that names the OS-CONVENTIONAL configuration ROOT
//    on THIS host, chosen exactly as the three specifications do. It is TOUCHED
//    like the reserved variables so no cell can leak it into its neighbours, and
//    every cell repoints it at a FRESH EMPTY directory — otherwise a real
//    user-level file on the machine running the suite would decide the verdict,
//    and the suite would be green or red for a reason that is not in the repo.
const CONVENTIONAL_VAR = process.platform === 'win32'
  ? 'APPDATA'
  : (process.platform === 'darwin' ? 'HOME' : 'XDG_CONFIG_HOME');

const TOUCHED = ['CTXROUTE_CONFIG_PATH', CONVENTIONAL_VAR, ...ADDRESSES.map((a) => a.env)];
const SAVED = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));

/** Restore the environment exactly as it was — a leaked variable poisons every later suite. */
function restore() {
  for (const key of TOUCHED) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
}
afterEach(restore);

/**
 * Points the OS-conventional configuration root at a FRESH EMPTY directory, so
 * that stage ③ is decidable from this suite alone.
 * 🛑 WITHOUT THIS, every cell below would depend on whether the human running
 *    the suite happens to have a user-level config on their machine — green
 *    here, red on the next laptop, for a reason found nowhere in the repository.
 */
function emptyConventionalRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-conventional-'));
  process.env[CONVENTIONAL_VAR] = dir;
  return dir;
}

/** Clears every reserved override, so only the config and the default remain. */
function noOverrides() {
  for (const key of TOUCHED) delete process.env[key];
  emptyConventionalRoot();
}

/** Writes a throwaway config and points the engine at it. @param {object|string} content */
function withConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-declared-'));
  const file = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  process.env.CTXROUTE_CONFIG_PATH = file;
  return dir;
}

// ── ① ZERO DEFAULT CHANGE ────────────────────────────────────────────────
for (const a of ADDRESSES) {
  test(`① NO \`${a.key}\` key ⇒ EXACTLY the historical directory (zero default change)`, () => {
    noOverrides();
    withConfig({ enabled: true });
    assert.equal(a.read(), a.historical);
  });

  test(`① NO config file at all ⇒ \`${a.key}\` still the historical directory (fail-soft)`, () => {
    noOverrides();
    process.env.CTXROUTE_CONFIG_PATH = path.join(os.tmpdir(), 'ctxroute-there-is-no-such-config.json');
    assert.equal(a.read(), a.historical);
  });

  test(`① an UNREADABLE config is an ABSENT config for \`${a.key}\` (a hook is fail-open)`, () => {
    noOverrides();
    withConfig('{ this is not json');
    assert.equal(a.read(), a.historical);
  });

  // ── ② the key is really consulted ─────────────────────────────────────
  test(`② a DECLARED absolute \`${a.key}\` wins — the key is really consulted`, () => {
    noOverrides();
    const target = path.join(os.tmpdir(), `ctxroute-declared-${a.key}`);
    withConfig({ enabled: true, [a.key]: target });
    assert.equal(a.read(), target);
    assert.notEqual(a.read(), a.historical);
  });

  test(`② declaring \`${a.key}\` moves ONLY that address — the other two stay historical`, () => {
    // 🛑 ANTI-CROSS-WIRING: three keys read through one helper is exactly where a
    //    copy/paste sends `docsDir` to the state's declaration, silently.
    noOverrides();
    const target = path.join(os.tmpdir(), `ctxroute-only-${a.key}`);
    withConfig({ enabled: true, [a.key]: target });
    for (const other of ADDRESSES) {
      assert.equal(other.read(), other.key === a.key ? target : other.historical);
    }
  });

  // ── ③ the reserved variable still wins ────────────────────────────────
  test(`③ \`${a.env}\` still BEATS the declared \`${a.key}\` (suites keep their isolation)`, () => {
    noOverrides();
    const throwaway = path.join(os.tmpdir(), `ctxroute-throwaway-${a.key}`);
    withConfig({ enabled: true, [a.key]: path.join(os.tmpdir(), 'ctxroute-declared-elsewhere') });
    process.env[a.env] = throwaway;
    assert.equal(a.read(), throwaway);
  });

  // ── ④ named refusal ───────────────────────────────────────────────────
  test(`④ a RELATIVE \`${a.key}\` is a NAMED REFUSAL — the key AND the value are said`, () => {
    noOverrides();
    withConfig({ enabled: true, [a.key]: 'somewhere' });
    assert.throws(a.read, (e) => {
      assert.match(e.message, /ctxroute REFUSED/);
      assert.match(e.message, new RegExp(`"${a.key}"`));
      assert.match(e.message, /"somewhere"/);
      return true;
    });
  });

  test(`④ the refusal REPLACES the resolution of \`${a.key}\` — the code-derived path never comes back`, () => {
    noOverrides();
    withConfig({ enabled: true, [a.key]: './somewhere' });
    let resolved = null;
    try { resolved = a.read(); } catch { /* expected */ }
    assert.equal(resolved, null);
  });
}

test('the resolution stays LAZY: a config written AFTER the module was loaded is honoured', () => {
  // 🛑 A memoised address would ignore the env variable a parent sets AT SPAWN —
  //    the doctrine written at the top of `paths.js` since the beginning.
  noOverrides();
  const first = path.join(os.tmpdir(), 'ctxroute-lazy-one');
  withConfig({ enabled: true, stateDir: first });
  assert.equal(paths.stateDir(), first);
  const second = path.join(os.tmpdir(), 'ctxroute-lazy-two');
  withConfig({ enabled: true, stateDir: second });
  assert.equal(paths.stateDir(), second);
});

test('the schema DECLARES the three keys the engine reads (an undeclared key is refused by config-gate)', () => {
  // ⚠️ The two halves of one truth: the engine honours the keys, and the schema
  //    is what lets an operator write them without config-gate rejecting their
  //    file. A capability honoured but forbidden is the mirror of "accepted and
  //    inert".
  const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'ctxroute-config.schema.json'), 'utf8'));
  for (const a of ADDRESSES) {
    assert.equal(schema.properties[a.key].type, 'string', `${a.key} must be declared in the schema`);
    assert.equal(schema.properties[a.key].minLength, 1);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// THE CONFIG'S OWN ADDRESS — in this process, then in a REAL spawned shell
// ═══════════════════════════════════════════════════════════════════════

test('the launch argument is ABSENT here ⇒ the config next to the code (zero default change)', () => {
  noOverrides();
  assert.equal(paths.configPath(), HISTORICAL.config);
});

test('`CTXROUTE_CONFIG_PATH` still wins over the argument, and the argument is not even PARSED', () => {
  // 🛑 The order matters beyond precedence: a runner that happens to pass a
  //    malformed `--ctxroute-config` must never be able to break a suite that
  //    already overrode the address.
  noOverrides();
  const reserved = path.join(os.tmpdir(), 'ctxroute-reserved-config.json');
  process.env.CTXROUTE_CONFIG_PATH = reserved;
  const saved = process.argv;
  try {
    process.argv = ['node', 'x.js', declared.CONFIG_FLAG]; // a form that REFUSES when parsed
    assert.equal(paths.configPath(), reserved);
  } finally {
    process.argv = saved;
  }
});

test('the argument IS parsed when no reserved override is set, and it wins over the default', () => {
  noOverrides();
  const saved = process.argv;
  const target = path.join(os.tmpdir(), 'ctxroute-argument-config.json');
  try {
    process.argv = ['node', 'x.js', declared.CONFIG_FLAG, target];
    assert.equal(paths.configPath(), target);
  } finally {
    process.argv = saved;
  }
});

test('🛑 REAL SPAWN: a shell given ONLY the launch argument reads that config, and the corpus it declares', () => {
  // 🔑 THE PROOF THAT NO SHELL CAN SILENTLY IGNORE THE ARGUMENT. `paths.js` is
  //    the single reader of the config address, so a real process launched with
  //    the flag and NO reserved variable must reach a foreign config AND the
  //    `sessionDocsDir` that config declares. In memory this proves nothing: the
  //    engine could be reading the repository's own files.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-spawn-'));
  const docs = path.join(base, 'frozen-session-docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'a.md'), 'DECLARED-CORPUS-WITNESS');
  const cfg = path.join(base, 'frozen-config.json');
  fs.writeFileSync(cfg, JSON.stringify({ enabled: true, sessionDocsDir: docs, stateDir: path.join(base, 'state') }));

  const env = { ...process.env };
  for (const key of TOUCHED) delete env[key];

  const hook = path.join(REPO, 'src', 'hooks', 'session-inject.js');
  const run = (args) => spawnSync(process.execPath, [hook, ...args], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
    encoding: 'utf8',
    env,
  });

  const withArg = run([declared.CONFIG_FLAG, cfg]);
  assert.equal(withArg.status, 0);
  assert.match(withArg.stdout, /DECLARED-CORPUS-WITNESS/);

  // ⚠️ ANTI-VACUITY, and it is what makes the cell mean anything: the SAME shell
  //    WITHOUT the argument must NOT find that corpus. Otherwise the witness
  //    could have come from anywhere.
  const without = run([]);
  assert.doesNotMatch(without.stdout, /DECLARED-CORPUS-WITNESS/);
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE ③ — THE OS-CONVENTIONAL PER-USER CONFIG, END TO END
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHAT THIS HALF ADDS. `declared-paths-pure.test.js` proves the ADDRESS for
//    the three platforms with everything injected; it can never prove that
//    `paths.js` WIRES it — that the platform, the environment and the home are
//    really handed over, that the file's EXISTENCE is really what conditions the
//    stage, and that the two stages above it still win. A conventional address
//    computed correctly and never consulted is the "accepted and inert" defect;
//    an address consulted when the file does NOT exist would move every install
//    already running, silently.

/** Writes a config AT the OS-conventional address for this host. @param {object} content */
function writeConventionalConfig(content) {
  const file = paths.conventionalConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(content));
  return file;
}

test('③ the conventional address sits UNDER the declared root, and is the app folder plus the config file', () => {
  // ⚠️ The three per-platform LAYOUTS are proven in the pure suite; what is
  //    proven here is that the root really comes from the environment and that
  //    the two trailing segments really reach the shell.
  const root = emptyConventionalRoot();
  const file = paths.conventionalConfigPath();
  assert.ok(path.isAbsolute(file), 'the conventional address must be absolute');
  assert.ok(file.startsWith(root), `${file} must sit under ${root}`);
  assert.equal(path.basename(file), declared.CONFIG_FILE_NAME);
  assert.equal(path.basename(path.dirname(file)), declared.APP_DIR_NAME);
});

test('③ NO conventional file ⇒ the stage is SKIPPED and the code-derived config wins (zero default change)', () => {
  // 🛑 THE ANTI-VACUITY TWIN OF THE CELL BELOW, and the whole reason this
  //    delivery is invisible to every install already running.
  noOverrides();
  assert.equal(paths.configPath(), HISTORICAL.config);
});

test('③ a conventional file that EXISTS wins over the config sitting next to the code', () => {
  noOverrides();
  const file = writeConventionalConfig({ enabled: true });
  assert.equal(paths.configPath(), file);
  assert.notEqual(file, HISTORICAL.config);
});

test('③ and the framework really READS it: an address declared there moves the data', () => {
  // ⚠️ Finding the file proves nothing on its own — a config the engine locates
  //    and never consults is the same silence as no config at all.
  noOverrides();
  const target = path.join(os.tmpdir(), 'ctxroute-from-the-conventional-config');
  writeConventionalConfig({ enabled: true, sessionDocsDir: target });
  assert.equal(paths.sessionDocsDir(), target);
});

test('② the launch argument still BEATS the conventional file', () => {
  noOverrides();
  writeConventionalConfig({ enabled: true });
  const saved = process.argv;
  const wanted = path.join(os.tmpdir(), 'ctxroute-argument-wins.json');
  try {
    process.argv = ['node', 'x.js', declared.CONFIG_FLAG, wanted];
    assert.equal(paths.configPath(), wanted);
  } finally {
    process.argv = saved;
  }
});

test('① the reserved `CTXROUTE_CONFIG_PATH` still BEATS the conventional file', () => {
  noOverrides();
  writeConventionalConfig({ enabled: true });
  const reserved = path.join(os.tmpdir(), 'ctxroute-reserved-wins.json');
  process.env.CTXROUTE_CONFIG_PATH = reserved;
  assert.equal(paths.configPath(), reserved);
});

test('🛑 REAL SPAWN: a shell told NOTHING finds the OS-conventional config, and the corpus it declares', () => {
  // 🔑 THE WHOLE CHAIN, END TO END. A real process, no reserved variable, no
  //    launch argument — only the operating system's own convention — must
  //    reach a foreign config AND the `sessionDocsDir` that config declares.
  //    That is precisely what a FROZEN copy of the code will depend on.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-conv-spawn-'));
  const docs = path.join(base, 'conventional-session-docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'a.md'), 'CONVENTIONAL-CORPUS-WITNESS');

  // Ask the module itself where this platform puts the file, then put one there.
  const saved = process.env[CONVENTIONAL_VAR];
  let file;
  try {
    process.env[CONVENTIONAL_VAR] = base;
    file = paths.conventionalConfigPath();
  } finally {
    if (saved === undefined) delete process.env[CONVENTIONAL_VAR];
    else process.env[CONVENTIONAL_VAR] = saved;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ enabled: true, sessionDocsDir: docs, stateDir: path.join(base, 'state') }));

  const env = { ...process.env };
  for (const key of TOUCHED) delete env[key];

  const hook = path.join(REPO, 'src', 'hooks', 'session-inject.js');
  const run = (root) => spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
    encoding: 'utf8',
    env: { ...env, [CONVENTIONAL_VAR]: root },
  });

  const found = run(base);
  assert.equal(found.status, 0);
  assert.match(found.stdout, /CONVENTIONAL-CORPUS-WITNESS/);

  // ⚠️ THE ANTI-VACUITY TWIN: the SAME shell whose conventional root holds NO
  //    such file must NOT find that corpus. Otherwise the witness could have
  //    come from anywhere, and the cell would prove nothing at all.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxroute-conv-empty-'));
  const missing = run(elsewhere);
  assert.doesNotMatch(missing.stdout, /CONVENTIONAL-CORPUS-WITNESS/);
});
