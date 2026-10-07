// ctxroute `wrapUp` SENSOR for Claude Code (EXPERIMENTAL).
//
// What it does: after each main-thread turn the engine raises `session.measure`
// with the live context fill (`context.percent`, documented in the mod API as
// "compare them with your own threshold here"). When the fill moved, this mod
// hands it to ctxroute's sensor door, `src/hooks/wrap-up-observe.js`, which
// records it for the end-of-turn judge (`src/hooks/wrap-up-stop.js`).
//
// Rules this file keeps:
// - It OBSERVES and never changes the event: `next(e)` is always returned.
// - It never waits for ctxroute: the hand-off runs unawaited, so a slow or
//   absent ctxroute costs one observation, never a turn.
// - It decides nothing. The threshold, the judges and the option's switch live
//   in ctxroute; this file only carries the fact. A threshold read here would be
//   a second copy of a setting, and two copies drift.
// - The door is found from this plugin's own folder (`$.plugin.root`), never
//   from a path typed elsewhere: the plugin lives at `<ctxroute>/mods/wrap-up-sensor`.
import type { Register } from 'claude-code'

export const register: Register = (on) => {
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    const context = e.context
    if (!e.changed.includes('context') || context.percent === undefined) return result
    const door = `${$.plugin.root}/../../src/hooks/wrap-up-observe.js`
    void (async () => {
      const session_id = await $.session.id()
      const cwd = await $.session.cwd()
      await $.process.run(['node', door], {
        stdin: JSON.stringify({
          session_id,
          cwd,
          context: { tokens: context.tokens, window: context.window, percent: context.percent },
        }),
        timeoutMs: 30000,
      })
    })().catch(() => undefined)
    return result
  })
}
