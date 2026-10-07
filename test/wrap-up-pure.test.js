// Deterministic cells of `src/wrap-up-pure.js` (option `wrapUp`, EXPERIMENTAL).
// Run by Stryker: every rule of the decision is pinned by a case here.
import { describe, test, expect } from 'vitest';
import wrapUp from '../src/wrap-up-pure.js';

const ON = (extra) => wrapUp.settingsOf({ enabled: true, ...(extra || {}) });
const obs = (percent, window = 200000) => ({ tokens: Math.floor((percent * window) / 100), window, percent });

describe('settingsOf — the option is OFF unless asked, and a malformed value is NAMED', () => {
  test('absent or null ⇒ off, no problem', () => {
    for (const raw of [undefined, null]) {
      const s = wrapUp.settingsOf(raw);
      expect(s.enabled).toBe(false);
      expect(s.problems).toEqual([]);
      expect(s.judges).toEqual({});
    }
  });
  test('not an object ⇒ off, named', () => {
    for (const raw of [true, 'on', 3, []]) {
      const s = wrapUp.settingsOf(raw);
      expect(s.enabled).toBe(false);
      expect(s.problems).toEqual(['`wrapUp` must be an object']);
    }
  });
  test('empty object ⇒ off with the documented defaults', () => {
    const s = wrapUp.settingsOf({});
    expect(s).toEqual({
      enabled: false, atPercent: 70, maxNudges: 3, judgeTimeoutSeconds: 120,
      message: null, messageFile: null, judges: {}, problems: [],
    });
  });
  test('a valid declaration is kept as written', () => {
    const judges = { docs: { command: ['node', 'judge.js'], match: ['proj'] } };
    const s = wrapUp.settingsOf({ enabled: true, atPercent: 60, maxNudges: 5, judgeTimeoutSeconds: 540, message: 'm', judges });
    expect(s).toEqual({
      enabled: true, atPercent: 60, maxNudges: 5, judgeTimeoutSeconds: 540,
      message: 'm', messageFile: null, judges, problems: [],
    });
  });
  test('bounds are inclusive at both ends', () => {
    expect(wrapUp.settingsOf({ enabled: true, atPercent: 1 }).atPercent).toBe(1);
    expect(wrapUp.settingsOf({ enabled: true, atPercent: 99 }).atPercent).toBe(99);
    expect(wrapUp.settingsOf({ enabled: true, maxNudges: 1 }).maxNudges).toBe(1);
    expect(wrapUp.settingsOf({ enabled: true, maxNudges: 20 }).maxNudges).toBe(20);
    expect(wrapUp.settingsOf({ enabled: true, judgeTimeoutSeconds: 1 }).judgeTimeoutSeconds).toBe(1);
    expect(wrapUp.settingsOf({ enabled: true, judgeTimeoutSeconds: 540 }).enabled).toBe(true);
  });
  test.each([
    [{ enabled: 'yes' }, '`wrapUp.enabled` must be true or false, got "yes"'],
    [{ enabled: true, atPercent: 0 }, '`wrapUp.atPercent` must be an integer from 1 to 99, got 0'],
    [{ enabled: true, atPercent: 100 }, '`wrapUp.atPercent` must be an integer from 1 to 99, got 100'],
    [{ enabled: true, atPercent: 70.5 }, '`wrapUp.atPercent` must be an integer from 1 to 99, got 70.5'],
    [{ enabled: true, atPercent: '70' }, '`wrapUp.atPercent` must be an integer from 1 to 99, got "70"'],
    [{ enabled: true, maxNudges: 0 }, '`wrapUp.maxNudges` must be an integer from 1 to 20, got 0'],
    [{ enabled: true, maxNudges: 21 }, '`wrapUp.maxNudges` must be an integer from 1 to 20, got 21'],
    [{ enabled: true, judgeTimeoutSeconds: 0 }, '`wrapUp.judgeTimeoutSeconds` must be an integer from 1 to 540, got 0'],
    [{ enabled: true, judgeTimeoutSeconds: 541 }, '`wrapUp.judgeTimeoutSeconds` must be an integer from 1 to 540, got 541'],
    [{ enabled: true, message: '   ' }, '`wrapUp.message` must be a non-empty string, got "   "'],
    [{ enabled: true, messageFile: '' }, '`wrapUp.messageFile` must be a non-empty path, got ""'],
    [{ enabled: true, message: 'a', messageFile: 'b' }, '`wrapUp.message` and `wrapUp.messageFile` are exclusive: one message, one source'],
    [{ enabled: true, judges: [] }, '`wrapUp.judges` must be an object of named judges, got []'],
    [{ enabled: true, judges: { j: { command: 'node judge.js' } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: { command: [] } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: { command: ['node', ''] } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: { command: ['node', 1] } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: { command: ['node', ['x']] } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: null } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
    [{ enabled: true, judges: { j: { match: ['x'] } } }, 'judge `j` needs a `command`: a non-empty list of non-empty strings, the program then its arguments'],
  ])('malformed %j ⇒ OFF and named, never a guessed default', (raw, problem) => {
    const s = wrapUp.settingsOf(raw);
    expect(s.enabled).toBe(false);
    expect(s.problems).toEqual([problem]);
  });
  test('a non-string message is NAMED, never a crash (the type check comes first)', () => {
    expect(wrapUp.settingsOf({ enabled: true, message: 42 }).problems).toEqual(['`wrapUp.message` must be a non-empty string, got 42']);
    expect(wrapUp.settingsOf({ enabled: true, messageFile: ['a'] }).problems).toEqual(['`wrapUp.messageFile` must be a non-empty path, got ["a"]']);
  });
  test('a message FILE alone is valid (the exclusivity bites only on both)', () => {
    const s = wrapUp.settingsOf({ enabled: true, messageFile: 'msg.md' });
    expect(s.enabled).toBe(true);
    expect(s.messageFile).toBe('msg.md');
    expect(s.message).toBeNull();
    expect(s.problems).toEqual([]);
  });
  test('the config SCHEMA states the same bounds as the module (two declarations, one truth)', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = JSON.parse(readFileSync(new URL('../ctxroute-config.schema.json', import.meta.url), 'utf8'));
    const p = schema.properties.wrapUp.properties;
    expect([p.atPercent.minimum, p.atPercent.maximum]).toEqual([1, 99]);
    expect([p.maxNudges.minimum, p.maxNudges.maximum]).toEqual([1, 20]);
    expect([p.judgeTimeoutSeconds.minimum, p.judgeTimeoutSeconds.maximum]).toEqual([1, wrapUp.MAX_JUDGE_TIMEOUT_SECONDS]);
    expect(schema.properties.wrapUp.additionalProperties).toBe(false);
    expect(Object.keys(p).sort()).toEqual(['atPercent', 'enabled', 'judgeTimeoutSeconds', 'judges', 'maxNudges', 'message', 'messageFile']);
    expect(p.judges.additionalProperties.required).toEqual(['command']);
    expect(schema.properties.wrapUp.not).toEqual({ required: ['message', 'messageFile'] });
  });
  test('the judges ceiling sits below the hook bound declared in wiring.json', async () => {
    const { readFileSync } = await import('node:fs');
    const manifest = JSON.parse(readFileSync(new URL('../wiring.json', import.meta.url), 'utf8'));
    const stop = manifest.consumers.find((c) => c.module === 'src/hooks/wrap-up-stop.js');
    expect(stop.optIn).toBe('wrapUp');
    expect(wrapUp.MAX_JUDGE_TIMEOUT_SECONDS).toBeLessThan(stop.timeout);
  });
});

describe('observationOf — one normalised fact, whatever the sensor', () => {
  test('percent given ⇒ kept (floored), tokens kept when valid', () => {
    expect(wrapUp.observationOf({ tokens: 100, window: 1000, percent: 42.9 })).toEqual({ tokens: 100, window: 1000, percent: 42 });
    expect(wrapUp.observationOf({ window: 1000, percent: 0 })).toEqual({ tokens: null, window: 1000, percent: 0 });
  });
  test('no percent ⇒ derived from tokens / window', () => {
    expect(wrapUp.observationOf({ tokens: 750, window: 1000 })).toEqual({ tokens: 750, window: 1000, percent: 75 });
    expect(wrapUp.observationOf({ tokens: 0, window: 1000 })).toEqual({ tokens: 0, window: 1000, percent: 0 });
  });
  test.each([
    [null], [undefined], [[]], ['x'], [{}],
    [{ window: 0, percent: 50 }], [{ window: -1, percent: 50 }], [{ window: Infinity, percent: 50 }],
    [{ window: 1000 }], [{ window: 1000, tokens: -1 }], [{ window: 1000, percent: -1 }],
    [{ window: '1000', percent: 50 }],
  ])('unusable %j ⇒ null', (raw) => {
    expect(wrapUp.observationOf(raw)).toBeNull();
  });
  test('a negative token count is dropped but a valid percent still stands', () => {
    expect(wrapUp.observationOf({ tokens: -5, window: 1000, percent: 30 })).toEqual({ tokens: null, window: 1000, percent: 30 });
  });
});

describe('withObservation — PROPAGATES the record', () => {
  test('keeps every other field', () => {
    const s = wrapUp.withObservation({ nudges: 2, settled: false, future: 'kept' }, obs(80));
    expect(s).toEqual({ nudges: 2, settled: false, future: 'kept', observation: obs(80) });
  });
  test('a missing or malformed record starts empty', () => {
    expect(wrapUp.withObservation(undefined, obs(10))).toEqual({ observation: obs(10) });
    expect(wrapUp.withObservation([], obs(10))).toEqual({ observation: obs(10) });
  });
});

describe('isDue — decided before any process is spawned', () => {
  test('off ⇒ never due', () => {
    expect(wrapUp.isDue(wrapUp.settingsOf({}), { observation: obs(99) })).toBe(false);
  });
  test('below the threshold ⇒ not due; at or above ⇒ due', () => {
    const s = ON({ atPercent: 70 });
    expect(wrapUp.isDue(s, { observation: obs(69) })).toBe(false);
    expect(wrapUp.isDue(s, { observation: obs(70) })).toBe(true);
    expect(wrapUp.isDue(s, { observation: obs(71) })).toBe(true);
  });
  test('settled ⇒ not due, whatever the fill', () => {
    expect(wrapUp.isDue(ON(), { observation: obs(95), settled: true })).toBe(false);
  });
  test('no usable observation ⇒ not due', () => {
    expect(wrapUp.isDue(ON(), {})).toBe(false);
    expect(wrapUp.isDue(ON(), undefined)).toBe(false);
    expect(wrapUp.isDue(ON(), { observation: { window: 0, percent: 90 } })).toBe(false);
  });
});

describe('judgesFor — the SAME perimeter engine as skills, on the session cwd', () => {
  const judges = {
    here: { command: ['a'], match: ['acme-repo'] },
    elsewhere: { command: ['b'], match: ['other-repo'] },
    narrowed: { command: ['c'], match: ['work'], exclude: ['acme-repo'] },
    everywhere: { command: ['d', '--x'], match: ['/'] },
  };
  test('declaration order, only the covering perimeters', () => {
    expect(wrapUp.judgesFor(judges, '/home/u/work/acme-repo', 'Stop')).toEqual([
      { name: 'here', command: ['a'], touched: null },
      { name: 'everywhere', command: ['d', '--x'], touched: null },
    ]);
    expect(wrapUp.judgesFor(judges, '/home/u/work/zeta', 'Stop')).toEqual([
      { name: 'narrowed', command: ['c'], touched: null },
      { name: 'everywhere', command: ['d', '--x'], touched: null },
    ]);
  });
  test('a Windows cwd is matched like a POSIX one', () => {
    expect(wrapUp.judgesFor(judges, 'C:\\Users\\u\\acme-repo', 'Stop').map((j) => j.name)).toEqual(['here', 'everywhere']);
  });
  test('no judge declared ⇒ none', () => {
    expect(wrapUp.judgesFor({}, '/x', 'Stop')).toEqual([]);
  });
});

describe('judgesFor — the perimeter is ALSO read on every file the session wrote', () => {
  const judges = {
    a: { command: ['a'], match: ['proj-a'] },
    b: { command: ['b'], match: ['proj-b'] },
    none: { command: ['n'], match: ['proj-z'] },
  };
  const written = (files, complete = true) => ({ files, complete });
  test('a session started ELSEWHERE meets the judge of every project it wrote in, each with its own files', () => {
    expect(wrapUp.judgesFor(judges, '/home/u', 'Stop', written(['/w/proj-a/x.js', '/w/proj-b/y.js', '/w/proj-a/z.js', '/w/other/q.js']), 'file_path')).toEqual([
      { name: 'a', command: ['a'], touched: { files: ['/w/proj-a/x.js', '/w/proj-a/z.js'], complete: true } },
      { name: 'b', command: ['b'], touched: { files: ['/w/proj-b/y.js'], complete: true } },
    ]);
  });
  test('a judge covering the cwd runs even when nothing was written, with an EMPTY complete list', () => {
    expect(wrapUp.judgesFor(judges, '/w/proj-a', 'Stop', written([]), 'file_path')).toEqual([
      { name: 'a', command: ['a'], touched: { files: [], complete: true } },
    ]);
  });
  test('the cwd is part of every edit, as for the injection: covering the cwd covers each written file', () => {
    expect(wrapUp.judgesFor(judges, '/w/proj-a', 'Stop', written(['/tmp/scratch.txt']), 'file_path')[0].touched.files).toEqual(['/tmp/scratch.txt']);
  });
  test('an incomplete list says so to the judge', () => {
    expect(wrapUp.judgesFor(judges, '/home/u', 'Stop', written(['/w/proj-b/y.js'], false), 'file_path')).toEqual([
      { name: 'b', command: ['b'], touched: { files: ['/w/proj-b/y.js'], complete: false } },
    ]);
  });
  test('the file is matched on the path parameter the SHELL names — an edit the engine would really see', () => {
    // Under an unknown parameter name the matcher sees no path: only the cwd decides.
    expect(wrapUp.judgesFor(judges, '/home/u', 'Stop', written(['/w/proj-a/x.js']), 'not_a_path_key')).toEqual([]);
  });
  test('no path parameter, or no usable record ⇒ the files are unknown (null), never an empty list', () => {
    for (const key of [undefined, '', 7]) {
      expect(wrapUp.judgesFor(judges, '/w/proj-a', 'Stop', written(['/w/proj-a/x.js']), key)).toEqual([
        { name: 'a', command: ['a'], touched: null },
      ]);
    }
    expect(wrapUp.judgesFor(judges, '/w/proj-a', 'Stop', { files: 'x' }, 'file_path')[0].touched).toBe(null);
  });
});

describe('touchedOf — the record read back, total', () => {
  test('a usable record', () => {
    expect(wrapUp.touchedOf({ files: ['/a', '/b'], complete: true })).toEqual({ files: ['/a', '/b'], complete: true });
  });
  test('ONLY an explicit true is complete: a missing or odd flag is read as incomplete', () => {
    expect(wrapUp.touchedOf({ files: [] }).complete).toBe(false);
    expect(wrapUp.touchedOf({ files: [], complete: 'yes' }).complete).toBe(false);
    expect(wrapUp.touchedOf({ files: [], complete: false }).complete).toBe(false);
  });
  test('entries that are not non-empty strings are dropped', () => {
    expect(wrapUp.touchedOf({ files: ['/a', '', 3, null, '/b'], complete: true }).files).toEqual(['/a', '/b']);
  });
  test('no usable record ⇒ null', () => {
    for (const raw of [undefined, null, 'x', [], {}, { files: 'x' }, { files: null }]) expect(wrapUp.touchedOf(raw)).toBe(null);
  });
});

describe('withTouched — the record after a write, PROPAGATED, bounded', () => {
  test('a first write starts a complete list', () => {
    expect(wrapUp.withTouched({}, ['/a'])).toEqual({ files: ['/a'], complete: true });
    expect(wrapUp.withTouched(undefined, ['/a'])).toEqual({ files: ['/a'], complete: true });
  });
  test('a new file is appended, the other fields survive', () => {
    expect(wrapUp.withTouched({ files: ['/a'], complete: true, extra: 1 }, ['/b'])).toEqual({ files: ['/a', '/b'], complete: true, extra: 1 });
  });
  test('the stored record is not mutated', () => {
    const s = { files: ['/a'], complete: true };
    wrapUp.withTouched(s, ['/b']);
    expect(s.files).toEqual(['/a']);
  });
  test('a file already recorded, or nothing usable, changes NOTHING (no disk write)', () => {
    expect(wrapUp.withTouched({ files: ['/a'], complete: true }, ['/a'])).toBe(null);
    expect(wrapUp.withTouched({ files: ['/a'], complete: true }, ['', 3, null])).toBe(null);
    expect(wrapUp.withTouched({ files: ['/a'], complete: true }, 'x')).toBe(null);
    expect(wrapUp.withTouched({}, [])).toBe(null);
    expect(wrapUp.withTouched({}, ['/a', '/a'])).toEqual({ files: ['/a'], complete: true });
  });
  test('an incomplete record STAYS incomplete', () => {
    expect(wrapUp.withTouched({ files: ['/a'] }, ['/b'])).toEqual({ files: ['/a', '/b'], complete: false });
  });
  test('the bound: the list stops at MAX_TOUCHED and is declared incomplete ONCE', () => {
    const full = { files: Array.from({ length: wrapUp.MAX_TOUCHED }, (_, i) => `/f${i}`), complete: true };
    const over = wrapUp.withTouched(full, ['/new']);
    expect(over.files).toHaveLength(wrapUp.MAX_TOUCHED);
    expect(over.files).not.toContain('/new');
    expect(over.complete).toBe(false);
    expect(wrapUp.withTouched(over, ['/newer'])).toBe(null);
    expect(wrapUp.withTouched(over, [`/f${wrapUp.MAX_TOUCHED - 1}`])).toBe(null);
    const almost = { files: full.files.slice(1), complete: true };
    expect(wrapUp.withTouched(almost, ['/last'])).toEqual({ files: [...almost.files, '/last'], complete: true });
    expect(wrapUp.MAX_TOUCHED).toBe(1000);
  });
});

describe('judgeInput — the versioned public contract', () => {
  test('shape and version: 2 = 1 plus `touched`', () => {
    expect(wrapUp.judgeInput({ sessionId: 's', cwd: '/c', observation: obs(80), atPercent: 70, nudges: 1 })).toEqual({
      version: 2, sessionId: 's', cwd: '/c', context: obs(80), atPercent: 70, nudges: 1, touched: null,
    });
    expect(wrapUp.judgeInput({ sessionId: 's', cwd: '/c', observation: obs(80), atPercent: 70, nudges: 1, touched: { files: ['/a'], complete: true } }).touched)
      .toEqual({ files: ['/a'], complete: true });
    expect(wrapUp.JUDGE_CONTRACT_VERSION).toBe(2);
  });
});

describe('verdictOf — a run read as a verdict', () => {
  const run = (o) => ({ name: 'j', exitCode: 0, stdout: '', stderr: '', timedOut: false, spawnError: null, ...o });
  test('exit 0 ⇒ pass', () => {
    expect(wrapUp.verdictOf(run({}))).toEqual({ name: 'j', status: 'pass', text: '' });
  });
  test('could not start ⇒ broken, never fail', () => {
    expect(wrapUp.verdictOf(run({ exitCode: null, spawnError: 'ENOENT' }))).toEqual({ name: 'j', status: 'broken', text: 'could not start: ENOENT' });
  });
  test('overran ⇒ broken, even with an exit code', () => {
    expect(wrapUp.verdictOf(run({ exitCode: 1, timedOut: true }))).toEqual({ name: 'j', status: 'broken', text: 'overran its time bound and was stopped' });
  });
  test('non-zero ⇒ fail with the raw stdout', () => {
    expect(wrapUp.verdictOf(run({ exitCode: 1, stdout: '  3 files lack a doc \n' }))).toEqual({ name: 'j', status: 'fail', text: '3 files lack a doc' });
  });
  test('non-zero, empty stdout ⇒ stderr', () => {
    expect(wrapUp.verdictOf(run({ exitCode: 2, stderr: 'boom\n' })).text).toBe('boom');
  });
  test('non-zero, nothing said ⇒ the exit code is named', () => {
    expect(wrapUp.verdictOf(run({ exitCode: 7 })).text).toBe('exited with code 7');
  });
  test('structured findings ⇒ one line each', () => {
    const stdout = JSON.stringify({ ok: false, findings: [
      { file: 'src/a.js', message: 'no doc', severity: 'error' },
      { message: 'memory not updated' },
      'junk',
      { file: 'b.js' },
    ] });
    expect(wrapUp.verdictOf(run({ exitCode: 1, stdout })).text).toBe('- [error] src/a.js: no doc\n- memory not updated\n- b.js: ');
  });
  test('JSON without findings is read as raw text', () => {
    expect(wrapUp.verdictOf(run({ exitCode: 1, stdout: '{"ok":false}' })).text).toBe('{"ok":false}');
    expect(wrapUp.verdictOf(run({ exitCode: 1, stdout: '[1]' })).text).toBe('[1]');
  });
});

describe('decide — the refusal, the release, the bound', () => {
  const pass = { name: 'p', status: 'pass', text: '' };
  const fail = { name: 'f', status: 'fail', text: 'missing docs' };
  const broken = { name: 'b', status: 'broken', text: 'could not start: ENOENT' };
  test('a failing judge ⇒ block, one nudge spent, record propagated', () => {
    const d = wrapUp.decide(ON(), { nudges: 1, observation: obs(80), keep: 1 }, [pass, fail]);
    expect(d.action).toBe('block');
    expect(d.nextState).toEqual({ nudges: 2, observation: obs(80), keep: 1 });
    expect(d.failing).toEqual([fail]);
    expect(d.notice).toBeNull();
  });
  test('every judge passes ⇒ allow and settled, silently', () => {
    const d = wrapUp.decide(ON(), { nudges: 2 }, [pass]);
    expect(d).toEqual({ action: 'allow', nextState: { nudges: 2, settled: true }, failing: [], broken: [], notice: null });
  });
  test('the bound is reached ⇒ released loudly, naming who still fails', () => {
    const d = wrapUp.decide(ON({ maxNudges: 2 }), { nudges: 2 }, [fail]);
    expect(d.action).toBe('allow');
    expect(d.nextState.settled).toBe(true);
    expect(d.notice).toBe('ctxroute wrapUp: released after 2 nudge(s) without a passing verdict (still failing: f).');
  });
  test('every still-failing judge is named, comma-separated; every broken one, semicolon-separated', () => {
    const g = { name: 'g', status: 'fail', text: 'x' };
    expect(wrapUp.decide(ON({ maxNudges: 1 }), { nudges: 1 }, [fail, g]).notice)
      .toBe('ctxroute wrapUp: released after 1 nudge(s) without a passing verdict (still failing: f, g).');
    const c = { name: 'c', status: 'broken', text: 'overran' };
    expect(wrapUp.decide(ON(), {}, [broken, c]).notice)
      .toBe('ctxroute wrapUp: judge(s) could not answer, session not held: b (could not start: ENOENT); c (overran).');
  });
  test('the bound is reached with nothing failing ⇒ released, no list', () => {
    expect(wrapUp.decide(ON({ maxNudges: 1 }), { nudges: 1 }, []).notice).toBe('ctxroute wrapUp: released after 1 nudge(s) without a passing verdict.');
  });
  test('a broken judge never holds the session, and is named', () => {
    const d = wrapUp.decide(ON(), {}, [pass, broken]);
    expect(d.action).toBe('allow');
    expect(d.nextState.settled).toBe(true);
    expect(d.notice).toBe('ctxroute wrapUp: judge(s) could not answer, session not held: b (could not start: ENOENT).');
  });
  test('a failing judge still blocks beside a broken one', () => {
    const d = wrapUp.decide(ON(), {}, [broken, fail]);
    expect(d.action).toBe('block');
    expect(d.broken).toEqual([broken]);
  });
  test('no judge for the project ⇒ exactly ONE nudge, then settled', () => {
    const first = wrapUp.decide(ON(), {}, []);
    expect(first.action).toBe('block');
    expect(first.nextState).toEqual({ nudges: 1 });
    const second = wrapUp.decide(ON(), first.nextState, []);
    expect(second).toEqual({ action: 'allow', nextState: { nudges: 1, settled: true }, failing: [], broken: [], notice: null });
  });
  test('a malformed nudge count is read as zero', () => {
    for (const nudges of [-1, 1.5, '2', null]) {
      expect(wrapUp.decide(ON(), { nudges }, [fail]).nextState.nudges).toBe(1);
    }
    expect(wrapUp.decide(ON(), undefined, [fail]).nextState).toEqual({ nudges: 1 });
  });
});

describe('reasonOf — bounded, and the surplus is never thrown away', () => {
  const failing = [{ name: 'docs', text: 'a.js has no doc' }];
  const broken = [{ name: 'tests', text: 'overran' }];
  test('fits ⇒ the whole text, percent substituted everywhere', () => {
    const r = wrapUp.reasonOf('at {percent}% ({percent})', 81, failing, broken, 10000, '/r.md');
    expect(r.overflow).toBeNull();
    expect(r.reason).toBe('at 81% (81)\n\n## Judge `docs` says the work is not done\na.js has no doc\n\n## Judge `tests` could not answer\noverran');
  });
  test('exactly at the budget ⇒ still whole', () => {
    const r = wrapUp.reasonOf('x', 1, [], [], 1, '/r.md');
    expect(r).toEqual({ reason: 'x', overflow: null });
  });
  test('overflows ⇒ head + the report path, full text handed back for the file', () => {
    const long = 'L'.repeat(500);
    const r = wrapUp.reasonOf(long, 90, [], [], 300, '/state/r.md');
    expect(r.overflow).toBe(long);
    expect(r.reason.length).toBe(300);
    expect(r.reason.endsWith('[The full report (500 characters) is in /state/r.md — read it before going on.]')).toBe(true);
    expect(r.reason.startsWith('LLL')).toBe(true);
  });
  test('a budget smaller than the pointer still names the file', () => {
    const r = wrapUp.reasonOf('L'.repeat(50), 1, [], [], 10, '/r.md');
    expect(r.reason.startsWith('\n\n[The full report (50 characters) is in /r.md')).toBe(true);
  });
  test('the default message, word for word (a CONTRACT, written by hand, never read back from the module)', () => {
    expect(wrapUp.defaultMessage()).toBe([
      'Your context window is {percent}% full: it will be compacted soon, and what you learned in this session will be summarised away.',
      'Before stopping, write that knowledge down where the next context will find it:',
      '- the injectable docs of every file you created or changed (an invariant, a trap, a contract),',
      "- every skill that covers what you changed (the project's and its components'), when it moves their structure, contracts or rules,",
      '- the memory of what you did, decided and left open,',
      '- the regression tests for every behaviour you built or fixed.',
      'Check every claim against the code before you write it: a wrong doc is re-injected for months.',
    ].join('\n'));
  });
  test('the default message names the four things to write and the check against the code', () => {
    expect(wrapUp.defaultMessage()).toContain('{percent}');
    expect(wrapUp.defaultMessage()).toContain('injectable docs');
    expect(wrapUp.defaultMessage()).toContain('every skill');
    expect(wrapUp.defaultMessage()).toContain('memory');
    expect(wrapUp.defaultMessage()).toContain('regression tests');
    expect(wrapUp.defaultMessage()).toContain('Check every claim against the code');
  });
});

describe('reportsToEvict — proven by what it deletes', () => {
  test('keeps the N most recent, returns the others coldest first', () => {
    const entries = [
      { name: 'a.md', mtimeMs: 1 }, { name: 'b.md', mtimeMs: 4 },
      { name: 'c.md', mtimeMs: 2 }, { name: 'd.md', mtimeMs: 3 },
    ];
    expect(wrapUp.reportsToEvict(entries, 2)).toEqual(['a.md', 'c.md']);
    expect(wrapUp.reportsToEvict(entries, 4)).toEqual([]);
    expect(wrapUp.reportsToEvict(entries, 0)).toEqual(['a.md', 'c.md', 'd.md', 'b.md']);
  });
  test('ties are broken by name, deterministically', () => {
    const entries = [{ name: 'b.md', mtimeMs: 1 }, { name: 'a.md', mtimeMs: 1 }, { name: 'c.md', mtimeMs: 1 }];
    expect(wrapUp.reportsToEvict(entries, 1)).toEqual(['c.md', 'b.md']);
  });
  test('the input is not reordered', () => {
    const entries = [{ name: 'a.md', mtimeMs: 1 }, { name: 'b.md', mtimeMs: 2 }];
    wrapUp.reportsToEvict(entries, 1);
    expect(entries.map((e) => e.name)).toEqual(['a.md', 'b.md']);
  });
  test('the ceiling is declared', () => {
    expect(wrapUp.MAX_REPORTS).toBe(64);
  });
});

describe('sensorSilent — the option never dies in silence', () => {
  const on = { enabled: true };
  test('the bound is declared', () => {
    expect(wrapUp.SILENT_SENSOR_TURNS).toBe(3);
  });
  test('option on, no observation, enough turns: said', () => {
    expect(wrapUp.sensorSilent(on, undefined, 3)).toBe(true);
    expect(wrapUp.sensorSilent(on, {}, 4)).toBe(true);
  });
  test('one turn short of the bound: not yet', () => {
    expect(wrapUp.sensorSilent(on, {}, 2)).toBe(false);
  });
  test('option off: never', () => {
    expect(wrapUp.sensorSilent({ enabled: false }, {}, 10)).toBe(false);
  });
  test('an observation arrived: the sensor is alive', () => {
    expect(wrapUp.sensorSilent(on, { observation: { tokens: 10, window: 100, percent: 10 } }, 10)).toBe(false);
  });
  test('a malformed observation is no observation', () => {
    expect(wrapUp.sensorSilent(on, { observation: { percent: 'x' } }, 3)).toBe(true);
  });
  test('already said in this context: once only', () => {
    expect(wrapUp.sensorSilent(on, { sensorSilenceSaid: true }, 9)).toBe(false);
    expect(wrapUp.sensorSilent(on, { sensorSilenceSaid: 'yes' }, 9)).toBe(true);
  });
  test('an unknown turn count says nothing', () => {
    expect(wrapUp.sensorSilent(on, {}, undefined)).toBe(false);
    expect(wrapUp.sensorSilent(on, {}, 3.5)).toBe(false);
    expect(wrapUp.sensorSilent(on, {}, '9')).toBe(false);
  });
  test('a record that is not an object reads as empty', () => {
    expect(wrapUp.sensorSilent(on, 'junk', 3)).toBe(true);
    expect(wrapUp.sensorSilent(on, ['sensorSilenceSaid'], 3)).toBe(true);
  });
  test('the notice names the count and the doctor, never a harness', () => {
    expect(wrapUp.sensorSilenceNotice(5)).toBe(
      'ctxroute wrapUp: the option is on, but no context measure has arrived in 5 turns, so it cannot fire. '
      + 'Its sensor is missing or no longer reports: `node tools/doctor.js --harness <payload.json>` names the sensor this harness needs.',
    );
  });
});
