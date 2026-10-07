#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════
// EXAMPLE JUDGE for the `wrapUp` option — "every file I changed has a doc".
// ═══════════════════════════════════════════════════════════════════════
//
// An EXAMPLE, never required: copy it, change it, or write your own judge in
// any language. A judge is just a program the `wrapUp` option runs at the end
// of a turn once the context is filling up. It is wired from the config alone:
//
//   "wrapUp": {
//     "enabled": true,
//     "judges": {
//       "docs": {
//         "command": ["node", "/path/to/ctxroute/examples/judges/undocumented-changes.js"],
//         "match": ["my-project"]
//       }
//     }
//   }
//
// THE CONTRACT (version 2), the same for every judge:
//   · stdin  = JSON `{ version, sessionId, cwd, context, atPercent, nudges, touched }`
//     `touched` = `{ files, complete }`: the absolute paths THIS session wrote
//     inside this judge's perimeter (sub-agents included), or `null` when the
//     harness records no writes
//   · exit 0 = the work is done · any other exit = it is not
//   · stdout = what the agent reads: raw text, or
//     `{ "ok": false, "findings": [{ "file", "message", "severity" }] }`
//
// WHAT THIS ONE CHECKS: the files the session wrote that no injectable file doc
// covers. It asks ctxroute's OWN engine (`collect-core`, the very code the
// injection runs), so "covered" means exactly what the gate would deliver on an
// edit of that file, never a second guess at it.
//
// WHICH FILES:
//   · `touched` complete ⇒ exactly the files this session wrote. Another agent
//     working in the same repository is never blamed, committed work is still
//     judged, and the session's folder does not matter.
//   · otherwise (no record on this harness, or a list cut at its bound) ⇒ the
//     files changed in the git repository of `cwd`, as a wider net.
//
// ARGUMENTS, all optional, written in the `command` array of the config:
//   --since <git revision>  in the git mode, also judge the files changed since
//                           that revision (default: only what is not committed)
//   --ignore <text>         skip a file whose shown path (relative to the
//                           session folder when inside it) contains <text> (repeatable)
//
// ⚠️ HONEST LIMIT: a file written by a SHELL command is not in `touched` (what
//    a command writes is not something the harness reports). Write files with
//    the file tools, or judge them another way.
// ⚠️ In the git mode, outside a git repository there is nothing to measure: it
//    says so on stderr and passes, since the agent could never satisfy it.
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { collectAll, loadConfig } = require('../../src/collect-core');

/** Findings beyond this count are summarised: the agent gets a list it can act on. */
const MAX_FINDINGS = 50;

/**
 * @param {string[]} argv
 * @returns {{ since: string|null, ignore: string[] }}
 */
function parseArgs(argv) {
  const out = { since: null, ignore: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--since' && i + 1 < argv.length) out.since = argv[++i];
    else if (argv[i] === '--ignore' && i + 1 < argv.length) out.ignore.push(argv[++i]);
  }
  return out;
}

// A judge run from inside a git hook inherits GIT_DIR & co., and they beat `cwd`: git
// would read ANOTHER repository. The whole family is dropped, except the ceiling, which
// can only STOP the search for a repository, never point it somewhere else.
const ENV_WITHOUT_GIT = { ...process.env };
for (const k of Object.keys(ENV_WITHOUT_GIT)) if (k.startsWith('GIT_') && k !== 'GIT_CEILING_DIRECTORIES') delete ENV_WITHOUT_GIT[k];

function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: ENV_WITHOUT_GIT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Repository-relative paths changed in the working tree (and since `since`),
 * deletions excluded: a file that no longer exists needs no doc.
 * @returns {{ root: string, files: string[] }}
 */
function changedFiles(cwd, since) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const files = new Set();
  // Porcelain v1 with -z: "XY path", paths relative to the repository root; a
  // rename carries its old path as the NEXT entry, which is skipped.
  const entries = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    if (xy[0] === 'R' || xy[0] === 'C') i += 1;
    if (!xy.includes('D')) files.add(e.slice(3));
  }
  if (since) {
    for (const rel of git(root, ['diff', '--name-only', '--diff-filter=d', '-z', since]).split('\0')) {
      if (rel.length > 0) files.add(rel);
    }
  }
  return { root, files: [...files].sort() };
}

/** True when at least one injectable FILE doc would be delivered on an edit of `absPath`. */
function isDocumented(config, absPath, cwd) {
  const acc = collectAll(config, { toolName: 'Edit', toolInput: { file_path: absPath }, cwd });
  return acc.matched.some((id) => acc.owner[id] === 'file');
}

/**
 * The judgement itself, I/O injected so a test drives it on a real repository.
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
/**
 * The files to judge, as `{ shown, abs }` pairs: what the session wrote when the
 * contract says so completely, the git repository's changes otherwise.
 * @returns {{ files: {shown: string, abs: string}[] } | { skip: string }}
 */
function filesToJudge(input, args, cwd) {
  const t = input && input.touched;
  if (t && t.complete === true && Array.isArray(t.files)) {
    const files = [];
    for (const abs of t.files) {
      // A file written then deleted needs no doc.
      if (typeof abs !== 'string' || !fs.existsSync(abs)) continue;
      const rel = path.relative(cwd, abs);
      // Shown with '/' on every OS, like the git mode: one spelling for `--ignore` to match.
      files.push({ shown: rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel.split(path.sep).join('/'), abs });
    }
    return { files };
  }
  try {
    const changed = changedFiles(cwd, args.since);
    return { files: changed.files.map((rel) => ({ shown: rel, abs: path.join(changed.root, rel) })) };
  } catch (err) {
    return { skip: `undocumented-changes: nothing to measure in ${cwd} (${String(err.message).split('\n')[0]})\n` };
  }
}

function judge(input, argv, config) {
  const args = parseArgs(argv);
  const cwd = input && typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd();
  const scope = filesToJudge(input, args, cwd);
  if ('skip' in scope) return { code: 0, stdout: '', stderr: scope.skip };
  const missing = [];
  for (const f of scope.files) {
    if (args.ignore.some((t) => f.shown.includes(t))) continue;
    if (!isDocumented(config, f.abs, cwd)) missing.push(f.shown);
  }
  if (missing.length === 0) return { code: 0, stdout: '', stderr: '' };
  const findings = missing.slice(0, MAX_FINDINGS).map((file) => ({
    file,
    message: 'changed in this session, and no injectable doc covers it: write what the next agent must know before touching it',
    severity: 'error',
  }));
  if (missing.length > MAX_FINDINGS) {
    findings.push({ file: '', message: `${missing.length - MAX_FINDINGS} more file(s) without a doc`, severity: 'error' });
  }
  return { code: 1, stdout: JSON.stringify({ ok: false, findings }), stderr: '' };
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let input = {};
    try { input = JSON.parse(raw); } catch { /* no contract on stdin: judge the current directory */ }
    const r = judge(input, process.argv.slice(2), loadConfig());
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.stdout) process.stdout.write(r.stdout);
    process.exitCode = r.code;
  });
}

module.exports = { judge, parseArgs, MAX_FINDINGS };
