import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'hooks', 'http-server.js',
);

// ═══════════════════════════════════════════════════════════════════════
// N SOCKETS, ONE SEQUENCER — the daemon's premise, made mechanical
// ═══════════════════════════════════════════════════════════════════════
// 🔴 THIS GATE EXISTS BECAUSE ITS ABSENCE SHIPPED A SILENT DATA LOSS TO A LIVE
//    FLEET (2026-09-18). `http.listeners` was raised above 1 for the first time
//    and every extra socket was built WITHOUT the per-invocation tables, so
//    `createServer` default-created one PER SOCKET. `frame-sequencer-pure`
//    decides which content index a connecting frame serves by counting arrivals
//    for one `tool_use_id`; its whole premise, written in its own doc, is that
//    "the daemon is a SINGLE PROCESS that sees every connecting request of one
//    invocation". One process holding N tables satisfies the letter and breaks
//    the premise.
// 📐 MEASURED on a bench — one document of 17 chunks over 32 frames, 4 sockets:
//    chunks 1..8 delivered FOUR TIMES EACH, chunks 9..17 delivered NEVER. The
//    operator SAW the duplication. Nothing showed the loss.
// 🛑 WHY A STRUCTURAL JUDGE AND NOT ONLY A BEHAVIOURAL ONE: the defect lives in
//    a CALL SITE, and a call site is added by whoever opens the next socket —
//    months from now, in a branch nobody replays a 4-socket bench on. This reads
//    the shell's own source, so a fifth socket is red the moment it is written.

const TABLES = ['frameSequencerState', 'deliveryNoticeState', 'carryoverState'];

/**
 * Every `createServer({ … })` call written in the shell, with its option body.
 *
 * ⚠️ DERIVED FROM THE SOURCE, never a hand-written list of line numbers: a list
 *    only knows the call sites that existed the day it was typed, which is the
 *    exact failure this gate exists to prevent.
 * @param {string} source
 * @returns {{index: number, body: string}[]}
 */
function callSites(source) {
  const sites = [];
  const needle = 'createServer({';
  let at = source.indexOf(needle);
  while (at !== -1) {
    let depth = 0;
    let i = at + needle.length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
    }
    sites.push({ index: at, body: source.slice(at, i + 1) });
    at = source.indexOf(needle, i);
  }
  return sites;
}

/** The sites that hand the three shared tables down, and those that do not. */
function split(source) {
  const sites = callSites(source);
  const sharing = sites.filter((s) => TABLES.every((t) => s.body.includes(t)));
  const alone = sites.filter((s) => !TABLES.every((t) => s.body.includes(t)));
  return { sites, sharing, alone };
}

test('① every socket the PORT lane opens is handed the three shared tables', () => {
  const source = fs.readFileSync(SHELL, 'utf8');
  const { sites, sharing, alone } = split(source);

  // ANTI-VACUITY: a scanner that finds nothing would pass every assertion below
  // while measuring precisely nothing. The shell opens the first port socket,
  // the inherited-descriptor loop, the extra-endpoint loop and the rendezvous.
  assert.ok(sites.length >= 4,
    `the scanner found ${sites.length} createServer call site(s) in ${SHELL}. `
    + 'Fewer than 4 means it stopped parsing, not that the shell shrank — a judge '
    + 'that analyses nothing is worse than no judge.');
  for (const site of sites) {
    assert.ok(site.body.length > 50 && site.body.length < 6000,
      `a call site body of ${site.body.length} chars means the brace scanner lost `
      + 'its balance; the verdict below would be arbitrary.');
  }

  assert.equal(alone.length, 1,
    'EVERY socket that serves frames must share `frameSequencerState`, '
    + '`deliveryNoticeState` and `carryoverState` with the others. '
    + `${alone.length} call site(s) build their own instead of one — that is the `
    + '2026-09-18 defect: at 4 sockets, half the document was delivered four '
    + 'times and the other half never. Pass the three tables built in `main`.');
  assert.ok(sharing.length >= 3,
    `only ${sharing.length} call site(s) share the tables; the port lane alone has three.`);
});

test('② the ONE site without them is the RENDEZVOUS lane, and that is DECLARED', () => {
  // 🛑 THIS IS AN EXEMPTION WITH A REASON, never an oversight tolerated by a
  //    lenient count. The rendezvous serves the SPAWNED clients, and
  //    `frame-sequencer.md` states that the `command` lane keeps the old
  //    index-by-URL split OBLIGATORILY — N independent OS processes cannot
  //    coordinate "who already got what". Handing it the port lane's tables
  //    would change a documented policy in silence, which is the class of
  //    change this repository refuses above all others.
  // ⚠️ IF THAT POLICY EVER CHANGES, THIS CELL IS WHERE IT IS RE-DECIDED — not in
  //    a call site edited quietly.
  const source = fs.readFileSync(SHELL, 'utf8');
  const { alone } = split(source);
  assert.equal(alone.length, 1);
  const before = source.slice(Math.max(0, alone[0].index - 1500), alone[0].index);
  assert.ok(before.includes('bind('),
    'the only call site allowed to build its own tables is the one passed to '
    + '`bind(` — the rendezvous lane. The site found is somewhere else, so either '
    + 'a new socket was opened without the shared tables, or the rendezvous moved '
    + 'and this exemption now points at the wrong thing.');
});

test('③ CONTROL: with the tables removed, cell ① FAILS', () => {
  // 🛑 A GATE NEVER SEEN RED IS A GATE ASSUMED TO WORK. The sabotage is the REAL
  //    defect — the call sites stripped of their shared tables — replayed IN
  //    MEMORY, so this control can never go stale against the file it judges.
  const source = fs.readFileSync(SHELL, 'utf8');
  const sabotaged = source.replace(/\n\s*frameSequencerState,/g, '');
  assert.notEqual(sabotaged, source, 'the sabotage changed nothing: it no longer '
    + 'reproduces the defect, so the control proves nothing.');

  const { alone } = split(sabotaged);
  assert.ok(alone.length > 1,
    'the analyser still reports a single unshared call site AFTER the tables were '
    + 'stripped. It is blind to the very defect it exists for.');
});
