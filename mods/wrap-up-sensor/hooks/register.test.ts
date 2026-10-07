// Cells of the wrapUp sensor mod, run by `claude plugin test mods/wrap-up-sensor`.
// Zero model call, zero token: the engine's `session.measure` is raised by hand
// and the hand-off to ctxroute is caught at `process.run`.
import { test, expect } from 'claude-code/testing'

type Run = { argv: readonly string[]; init?: { stdin?: string } }

function catchRuns(on: any): { runs: Run[]; next: () => Promise<Run> } {
  const runs: Run[] = []
  let wake: ((r: Run) => void) | null = null
  // The engine's own answer beneath the plugin: it echoes what moved.
  on('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/work/project' }))
  on('process.run', (_$: unknown, e: Run) => {
    runs.push(e)
    if (wake) wake(e)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  return { runs, next: () => new Promise<Run>((resolve) => { wake = resolve }) }
}

test('hands the fill to the ctxroute door when the context moved', async ($, on) => {
  const caught = catchRuns(on)
  const handed = caught.next()
  await $.session.measure({
    context: { tokens: 140000, window: 200000, percent: 70 },
    rateLimits: [],
    changed: ['context'],
  })
  const run = await handed
  expect(run.argv[0]).toBe('node')
  expect(run.argv[1].endsWith('/../../src/hooks/wrap-up-observe.js')).toBe(true)
  expect(JSON.parse(run.init!.stdin!)).toEqual({
    session_id: 'sess-1',
    cwd: '/work/project',
    context: { tokens: 140000, window: 200000, percent: 70 },
  })
})

test('stays silent when only the rate limits moved', async ($, on) => {
  const caught = catchRuns(on)
  await $.session.measure({
    context: { tokens: 140000, window: 200000, percent: 70 },
    rateLimits: [],
    changed: ['rateLimits'],
  })
  expect(caught.runs.length).toBe(0)
})

test('stays silent before the first response of a window (no percent yet)', async ($, on) => {
  const caught = catchRuns(on)
  await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'] })
  expect(caught.runs.length).toBe(0)
})

test('never changes the event it observes', async ($, on) => {
  catchRuns(on)
  const result = await $.session.measure({
    context: { tokens: 10, window: 100, percent: 10 },
    rateLimits: [],
    changed: ['context'],
  })
  expect(result).toEqual({ changed: ['context'] })
})
