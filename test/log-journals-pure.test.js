// ═══════════════════════════════════════════════════════════════════════
// log-journals-pure — the CLOSED registry of journals, and the worst case it allows.
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTED DIRECTLY; fixtures inside each `test()`; expected values LITERAL.
// ═══════════════════════════════════════════════════════════════════════

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { journals, worstCase, journalOf, severityOf } from '../src/log-journals-pure.js';
import { EVENTS } from '../src/lifecycle-log-pure.js';

test('exactly two journals, with fixed file names, frozen', () => {
  const JOURNALS = journals();
  assert.deepEqual(Object.keys(JOURNALS), ['daemon', 'hooks']);
  assert.equal(JOURNALS.daemon.file, 'ctxroute-daemon.log');
  assert.equal(JOURNALS.hooks.file, 'ctxroute-hooks.log');
  assert.ok(Object.isFrozen(JOURNALS));
  assert.ok(Object.isFrozen(JOURNALS.daemon));
  assert.ok(Object.isFrozen(JOURNALS.daemon.events));
  assert.ok(Object.isFrozen(JOURNALS.hooks));
  assert.ok(Object.isFrozen(JOURNALS.hooks.events));
});

test('the daemon journal = every life event (always) + request (debug) + daemon-error and logging-refused (error)', () => {
  const JOURNALS = journals();
  const expected = {};
  for (const e of EVENTS) expected[e] = 'event';
  expected.request = 'debug';
  expected['daemon-error'] = 'error';
  expected['logging-refused'] = 'error';
  assert.deepEqual({ ...JOURNALS.daemon.events }, expected);
  assert.equal(Object.keys(JOURNALS.daemon.events).length, EVENTS.length + 3);
});

test('🛑 `request` is NOT a life event — the always-on vocabulary stays free of per-request names', () => {
  assert.equal(EVENTS.includes('request'), false);
  assert.equal(severityOf('daemon', 'request'), 'debug');
});

test('the hooks journal = hook-error (error) + hook-trace (debug) + logging-refused (error)', () => {
  assert.deepEqual({ ...journals().hooks.events }, { 'hook-error': 'error', 'hook-trace': 'debug', 'logging-refused': 'error' });
});

test('the worst case every journal can reach, at the widest setting: 20 files, 160 MB', () => {
  assert.deepEqual(worstCase(), { files: 20, bytes: 167772160 });
});

test('journalOf answers the entry, or null for anything outside the registry', () => {
  assert.equal(journalOf('daemon').file, 'ctxroute-daemon.log');
  assert.equal(journalOf('hooks').file, 'ctxroute-hooks.log');
  // ⚠️ `['daemon']` is the case the type guard exists for: `Object.hasOwn`
  //    coerces its key, so an array holding the name would otherwise pass.
  for (const j of ['other', '', undefined, null, 42, 'toString', '__proto__', ['daemon'], ['hooks']]) {
    assert.equal(journalOf(j), null, String(j));
  }
});

test('severityOf answers the class, or null when the journal or the event is unknown', () => {
  assert.equal(severityOf('daemon', 'start'), 'event');
  assert.equal(severityOf('hooks', 'hook-error'), 'error');
  assert.equal(severityOf('hooks', 'hook-trace'), 'debug');
  assert.equal(severityOf('hooks', 'start'), null, 'a daemon event is not a hooks event');
  assert.equal(severityOf('daemon', 'hook-error'), null, 'a hooks event is not a daemon event');
  assert.equal(severityOf('nope', 'start'), null);
  assert.equal(severityOf('daemon', 'toString'), null, 'an inherited name is not an event');
  assert.equal(severityOf('daemon', 42), null);
  assert.equal(severityOf('daemon', undefined), null);
  assert.equal(severityOf('daemon', ['start']), null, 'an array holding the name is not the name');
  assert.equal(severityOf(['hooks'], 'hook-error'), null);
});
