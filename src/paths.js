#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// SINGLE SOURCE of the framework's paths (config / docs / state)
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ EVERY path read or WRITTEN at runtime is declared HERE, only once.
// NEVER redo an ad-hoc `path.join(__dirname, '..', 'state')` in a hook:
// `stateDir` was hardcoded identically in legacy-mcp-inject.js AND
// ctxroute-reset.js — two copies of one and the same truth that diverge silently
// as soon as one of them changes (exactly the class of bug that sanitizeSessionId()
// already avoids for the FORMAT of the file name; here it is its DIRECTORY).
//
// ⚠️ The 3 env vars are RESERVED FOR TESTS AND FOR doctor.js — never a
// user setting (the user config is ctxroute-config.json).
// They exist so that a test/probe runs in TOTAL isolation
// (throwaway tmpdir) without ever touching the repo's shipped files. Bug experienced
// (15/07/2026): the integration tests wrote into the REAL
// ctxroute-config.json → framework left disabled in prod, silently.
//
// ⚠️ I/O-adjacent module (path + process.env): NEVER import it from
// lib-pure.js, which must stay pure (cf .dependency-cruiser.json).
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const os = require('os');

// This file lives in src/: the repo root is ONE level above.
const ROOT = path.join(__dirname, '..');

function configPath() {
  return process.env.CTXROUTE_CONFIG_PATH || path.join(ROOT, 'ctxroute-config.json');
}

function docsDir() {
  return process.env.CTXROUTE_DOCS_DIR || path.join(ROOT, 'docs', 'mcp');
}

function stateDir() {
  return process.env.CTXROUTE_STATE_DIR || path.join(ROOT, 'state');
}

// Corpus of the FILE docs (frontmatters migrated on 16/07/2026) — consumed by the
// shadow (then by the unified engine after the switch). Env var RESERVED for tests.
function fileDocsDir() {
  return process.env.CTXROUTE_FILEDOCS_DIR || path.join(os.homedir(), '.claude', 'hooks', 'docs');
}

// Corpus of the SESSION docs (injected at EVERY SessionStart: startup/resume/
// clear/compact — knowledge "like CLAUDE.md" but managed by the framework).
// Env var RESERVED for tests and for doctor.js.
function sessionDocsDir() {
  return process.env.CTXROUTE_SESSIONDOCS_DIR || path.join(ROOT, 'docs', 'session');
}

// Store of the harness SKILLS (Claude Code: ~/.claude/commands/{name}.md).
// READ ONLY (the skill's body is injected as is) — we NEVER write
// into a harness file. Env var RESERVED for tests and for doctor.js.
function skillsDir() {
  return process.env.CTXROUTE_SKILLS_DIR || path.join(os.homedir(), '.claude', 'commands');
}

module.exports = { configPath, docsDir, stateDir, fileDocsDir, sessionDocsDir, skillsDir, ROOT };
