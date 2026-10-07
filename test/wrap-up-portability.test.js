// ═══════════════════════════════════════════════════════════════════════
// `wrapUp` ON A FICTIONAL HARNESS — another sensor, another forcing dialect,
// another wiring syntax, and ZERO line of the core.
// ═══════════════════════════════════════════════════════════════════════
//
// 🎯 THE CRITERION: the option was built for Claude Code first, but the core
//    (`src/wrap-up-pure.js`) must read ONE normalised observation and know NO
//    harness. If porting it to a harness that reports its fill in a hook field
//    and refuses an end of turn with its own words ever needs an edit to
//    `src/wrap-up-pure.js`, `src/wiring-plan.js` or `src/wiring-dialect.js`,
//    the design has failed — and saying so is the deliverable.
//
// ⚠️ THE FICTIONAL ADOPTER'S SHELL IS WRITTEN HERE, ON PURPOSE: it is what an
//    adopter writes to port the option (a sensor mapping + a dialect), and it
//    uses ONLY the core's public exports.
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import wrapUp from '../src/wrap-up-pure.js';

const REPO = path.resolve(import.meta.dirname, '..');
const posix = (p) => p.split(path.sep).join('/');

// ── The fictional harness, declared as DATA by its adopter ─────────────
const FICTIONAL = {
  // Its hooks carry the fill in a field: `{ usage: { used, limit } }`.
  sensor: (payload) => wrapUp.observationOf({ tokens: payload.usage && payload.usage.used, window: payload.usage && payload.usage.limit }),
  // It refuses an end of turn with `{ verdict: "keep-working", why }`.
  forcing: { decisionField: 'verdict', blockValue: 'keep-working', reasonField: 'why', noticeField: 'note' },
  endEvent: 'turn_finished',
};

/** The adopter's end-of-turn shell, in memory: the core decides, the dialect speaks. */
function fictionalTurnEnd(settings, state, payload, verdictsFor) {
  const observed = FICTIONAL.sensor(payload);
  const s = observed === null ? state : wrapUp.withObservation(state, observed);
  if (!wrapUp.isDue(settings, s)) return { out: null, state: s };
  const judges = wrapUp.judgesFor(settings.judges, payload.cwd, FICTIONAL.endEvent);
  const d = wrapUp.decide(settings, s, verdictsFor(judges));
  const out = {};
  if (d.action === 'block') {
    const { reason } = wrapUp.reasonOf(wrapUp.defaultMessage(), observed.percent, d.failing, d.broken, 4000, '/r.md');
    out[FICTIONAL.forcing.decisionField] = FICTIONAL.forcing.blockValue;
    out[FICTIONAL.forcing.reasonField] = reason;
  }
  if (d.notice) out[FICTIONAL.forcing.noticeField] = d.notice;
  return { out: Object.keys(out).length ? out : null, state: d.nextState };
}

test('ANOTHER SENSOR AND ANOTHER DIALECT drive the SAME core, unchanged', () => {
  const settings = wrapUp.settingsOf({ enabled: true, atPercent: 60, maxNudges: 2, judges: { docs: { command: ['x'], match: ['acme'] } } });
  const red = (judges) => judges.map((j) => ({ name: j.name, status: 'fail', text: 'a.js lacks a doc' }));
  const green = (judges) => judges.map((j) => ({ name: j.name, status: 'pass', text: '' }));
  const payload = (used) => ({ cwd: '/srv/acme', usage: { used, limit: 1000 } });

  let r = fictionalTurnEnd(settings, {}, payload(500), red);
  expect(r.out).toBeNull(); // 50 % < 60 %
  r = fictionalTurnEnd(settings, r.state, payload(650), red);
  expect(r.out.verdict).toBe('keep-working');
  expect(r.out.why).toContain('65% full');
  expect(r.out.why).toContain('a.js lacks a doc');
  r = fictionalTurnEnd(settings, r.state, payload(700), green);
  expect(r.out).toBeNull();
  expect(r.state.settled).toBe(true);
});

test('the core imports NO harness dialect (its only dependency is the perimeter engine)', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'wrap-up-pure.js'), 'utf8');
  const requires = [...src.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  expect(requires).toEqual(['./sources/skill']);
});

function generate(manifestPath, wrapUpCfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-port-'));
  const cfg = path.join(dir, 'ctxroute-config.json');
  fs.writeFileSync(cfg, JSON.stringify({ enabled: true, frames: 2, ...(wrapUpCfg === undefined ? {} : { wrapUp: wrapUpCfg }) }));
  const out = path.join(dir, 'document.out');
  const r = spawnSync(process.execPath, ['tools/wiring-generate.js', '--quiet', '--document', posix(out),
    '--settings', 'C:/fixture/settings.json', '--root', 'C:/fixture/ctxroute', '--manifest', manifestPath], {
    cwd: REPO, encoding: 'utf8', env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg },
  });
  const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, text };
}

test('the fictional WIRING carries the end-of-turn shell under ITS event name, only when switched on', () => {
  const real = JSON.parse(fs.readFileSync(path.join(REPO, 'wiring.json'), 'utf8'));
  const stop = real.consumers.find((c) => c.module === 'src/hooks/wrap-up-stop.js');
  const fictional = JSON.parse(fs.readFileSync(path.join(REPO, 'test', 'fixtures', 'wiring-fictional.json'), 'utf8'));
  fictional.harness.events.Stop = 'turn_finished';
  fictional.consumers.push(stop);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-port-manifest-'));
  const manifestPath = posix(path.join(dir, 'fictional.json'));
  fs.writeFileSync(manifestPath, JSON.stringify(fictional));
  try {
    const on = generate(manifestPath, { enabled: true });
    expect(on.status, on.stderr).toBe(0);
    expect(on.text).toMatch(/^when = "turn_finished"$/m);
    expect(on.text).toMatch(/^exec = "node C:\/fixture\/ctxroute\/src\/hooks\/wrap-up-stop\.js"$/m);
    const off = generate(manifestPath, { enabled: false });
    expect(off.status, off.stderr).toBe(0);
    expect(off.text.includes('wrap-up-stop.js')).toBe(false);
    expect(off.text.includes('turn_finished')).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a harness with NO end-of-turn event: the consumer is skipped and NAMED, never bodged', () => {
  const real = JSON.parse(fs.readFileSync(path.join(REPO, 'wiring.json'), 'utf8'));
  const stop = real.consumers.find((c) => c.module === 'src/hooks/wrap-up-stop.js');
  const fictional = JSON.parse(fs.readFileSync(path.join(REPO, 'test', 'fixtures', 'wiring-fictional.json'), 'utf8'));
  fictional.consumers.push(stop); // no `Stop` in its events
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-port-manifest-'));
  const manifestPath = posix(path.join(dir, 'fictional.json'));
  fs.writeFileSync(manifestPath, JSON.stringify(fictional));
  try {
    const dirOut = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-up-port-'));
    const cfg = path.join(dirOut, 'c.json');
    fs.writeFileSync(cfg, JSON.stringify({ enabled: true, frames: 2, wrapUp: { enabled: true } }));
    const out = posix(path.join(dirOut, 'doc.out'));
    const r = spawnSync(process.execPath, ['tools/wiring-generate.js', '--document', out,
      '--settings', 'C:/fixture/settings.json', '--root', 'C:/fixture/ctxroute', '--manifest', manifestPath], {
      cwd: REPO, encoding: 'utf8', env: { ...process.env, CTXROUTE_CONFIG_PATH: cfg },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('wrap-up-stop.js');
    expect(fs.readFileSync(out, 'utf8').includes('wrap-up-stop.js')).toBe(false);
    fs.rmSync(dirOut, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
