import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageWindow } from '../types'

const PANE = 'usage-limits'
const TITLE = 'Usage limits'
const TICK_MS = 30_000

const windows = atom(
  { plugin: 'usage-limits-rail', key: 'windows' } as const,
  [] as UsageWindow[],
)
const updatedAt = atom({ plugin: 'usage-limits-rail', key: 'updatedAt' } as const, 0)
const tick = atom({ plugin: 'usage-limits-rail', key: 'tick' } as const, 0)

const NAMES: Record<string, string> = {
  five_hour: '5-hour window',
  seven_day: 'Weekly',
  seven_day_opus: 'Weekly · Opus',
  spend_limit: 'Spend limit',
}

const nameOf = (kind: string) =>
  NAMES[kind] ?? kind.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

const colorOf = (percent: number, warnAt: number) =>
  percent >= 100 ? 'red' : percent >= warnAt ? 'yellow' : 'green'

const barOf = (percent: number, width: number) => {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const agoOf = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  return `${Math.floor(minutes / 60)}h ago`
}

const resetTextOf = (window: UsageWindow, now: number) => {
  if (window.resetsAt === undefined) return 'reset time unknown'

  const at = Date.parse(window.resetsAt)

  if (Number.isNaN(at)) return 'reset time unknown'

  const left = at - now
  const clock = clockOf(at)

  if (left <= 0) return `resets now${clock}`

  const minutes = Math.round(left / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days >= 1) return `resets in ${days}d ${hours % 24}h${clock}`
  if (hours >= 1) return `resets in ${hours}h ${minutes % 60}m${clock}`

  return `resets in ${minutes}m${clock}`
}

const clockOf = (at: number) => {
  try {
    return ` · ${new Date(at).toLocaleString()}`
  } catch {
    return ''
  }
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const now = await $.clock.now()

  await update($, windows, () => usage.rateLimits.map(one => ({ ...one })))
  await update($, updatedAt, () => now)
}

export const register: Register = (on, options) => {
  const warnAt = Number(options?.warnPercent ?? 85)
  const opensOnStart = options?.openOnStart !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-limits',
      description: 'Show the account usage limits in a pane',
    })

    void refresh($).catch(() => undefined)

    if (opensOnStart) {
      void $.ui.open({ id: PANE, title: TITLE })
    }

    void $.clock.every(TICK_MS, async () => {
      await update($, tick, n => n + 1)
      await refresh($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'usage-limits' }, async $ => {
    await refresh($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Usage limits pane opened.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const now = await $.clock.now()

      await update($, windows, () => e.rateLimits.map(one => ({ ...one })))
      await update($, updatedAt, () => now)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, windows)
    const seenAt = await read($, updatedAt)

    await read($, tick)

    const now = await $.clock.now()
    const width = Math.max(8, Math.min(32, (e.props.bodyColumns ?? 40) - 8))

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No rate-limit window reported yet.</Text>
          <Text dimColor>They appear after the first model response.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {list.map(one => (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Text>{nameOf(one.kind)} </Text>
              <Text color={colorOf(one.percentUsed, warnAt)} bold>
                {one.percentUsed}%
              </Text>
            </Box>
            <Text color={colorOf(one.percentUsed, warnAt)}>
              {barOf(one.percentUsed, width)}
            </Text>
            <Text dimColor>{resetTextOf(one, now)}</Text>
          </Box>
        ))}
        <Text dimColor>Updated {agoOf(now - seenAt)}</Text>
      </Box>
    )
  })
}
