import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageWindow } from '../types'

const TICK_MS = 30_000
const BAR_WIDTH = 10

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

const SHORT_NAMES: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'week',
  seven_day_opus: 'week·opus',
  spend_limit: 'spend',
}

const nameOf = (kind: string) =>
  NAMES[kind] ?? kind.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

const shortNameOf = (kind: string) => SHORT_NAMES[kind] ?? kind.replace(/_/g, ' ')

const LEVELS = {
  ok: { hex: '#93B3DD', named: 'blue' },
  warn: { hex: '#E0B45C', named: 'yellow' },
  danger: { hex: '#E5484D', named: 'red' },
} as const

const TRACK = '#3C3A36'
const PACE = '#ECEAE3'
const METER_WIDTH = 150
const METER_HEIGHT = 10
const TRACK_HEIGHT = 6
const PACE_WIDTH = 2

const DURATIONS: Record<string, number> = {
  five_hour: 5 * 60 * 60_000,
  seven_day: 7 * 24 * 60 * 60_000,
  seven_day_opus: 7 * 24 * 60 * 60_000,
}

const AHEAD_MARGIN = 0.05

const levelOf = (percent: number, warnAt: number, dangerAt: number) =>
  percent > dangerAt ? LEVELS.danger : percent > warnAt ? LEVELS.warn : LEVELS.ok

// The fraction of the window's duration already elapsed, or undefined when
// the kind has no known duration or the reset time is missing.
const elapsedOf = (window: UsageWindow, now: number) => {
  const duration = DURATIONS[window.kind]

  if (duration === undefined || window.resetsAt === undefined) return undefined

  const at = Date.parse(window.resetsAt)

  if (Number.isNaN(at)) return undefined

  return Math.max(0, Math.min(1, 1 - (at - now) / duration))
}

const meterOf = (percent: number, color: string, elapsed: number | undefined) => {
  const fill = Math.max(0, Math.min(METER_WIDTH, (percent / 100) * METER_WIDTH))
  const top = (METER_HEIGHT - TRACK_HEIGHT) / 2
  const radius = TRACK_HEIGHT / 2
  const pace =
    elapsed === undefined
      ? ''
      : `<rect x="${Math.min(METER_WIDTH - PACE_WIDTH, elapsed * METER_WIDTH).toFixed(1)}" y="0" width="${PACE_WIDTH}" height="${METER_HEIGHT}" fill="${PACE}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${METER_WIDTH}" height="${METER_HEIGHT}" viewBox="0 0 ${METER_WIDTH} ${METER_HEIGHT}"><rect y="${top}" width="${METER_WIDTH}" height="${TRACK_HEIGHT}" rx="${radius}" fill="${TRACK}"/>${fill > 0 ? `<rect y="${top}" width="${Math.max(fill, TRACK_HEIGHT).toFixed(1)}" height="${TRACK_HEIGHT}" rx="${radius}" fill="${color}"/>` : ''}${pace}</svg>`
}

// `20:10` for a reset within a day, `Wed 10:00` past that.
const shortClockOf = (window: UsageWindow, now: number) => {
  if (window.resetsAt === undefined) return undefined

  try {
    const at = new Date(window.resetsAt)
    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (at.getTime() - now < 24 * 60 * 60_000) return time

    return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`
  } catch {
    return undefined
  }
}

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

// How long until the window resets, as `1h 12m`, or undefined when unknown.
const leftOf = (window: UsageWindow, now: number) => {
  if (window.resetsAt === undefined) return undefined

  const at = Date.parse(window.resetsAt)

  if (Number.isNaN(at)) return undefined

  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days >= 1) return `${days}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h ${minutes % 60}m`

  return `${minutes}m`
}

// `↻ 3h 54m · 18:00`; `ahead of pace · 18:00` when usage outruns the elapsed
// share of the window; `Limit reached · resets in 3h 54m` at 100%.
const captionOf = (window: UsageWindow, now: number) => {
  const left = leftOf(window, now)
  const clock = shortClockOf(window, now)

  if (window.percentUsed >= 100) {
    return left === undefined ? 'Limit reached' : `Limit reached · resets in ${left}`
  }

  if (left === undefined) return 'Reset time unknown'

  const elapsed = elapsedOf(window, now)
  const ahead = elapsed !== undefined && window.percentUsed / 100 > elapsed + AHEAD_MARGIN
  const lead = ahead ? 'ahead of pace' : `↻ ${left}`

  return clock === undefined ? lead : `${lead} · ${clock}`
}

const clockOf = (window: UsageWindow) => {
  if (window.resetsAt === undefined) return ''

  try {
    return ` (${new Date(window.resetsAt).toLocaleString()})`
  } catch {
    return ''
  }
}

const detailOf = (list: UsageWindow[], now: number, seenAt: number) => {
  if (list.length === 0) {
    return 'No rate-limit window reported yet. They appear after the first model response, on a subscription.'
  }

  const rows = list.map(one => {
    const left = leftOf(one, now)
    const reset = left === undefined ? 'reset time unknown' : `resets in ${left}${clockOf(one)}`

    return `${nameOf(one.kind)}: ${one.percentUsed}% used, ${reset}`
  })

  return [...rows, `Updated ${agoOf(now - seenAt)}.`].join('\n')
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const now = await $.clock.now()

  await update($, windows, () => usage.rateLimits.map(one => ({ ...one })))
  await update($, updatedAt, () => now)
}

export const register: Register = (on, options) => {
  const warnAt = Number(options?.warnPercent ?? 75)
  const dangerAt = Number(options?.dangerPercent ?? 90)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-limits',
      description: 'Show the account usage limits and when each resets',
    })

    // 0.1.0 drew a side pane under this id; close it if a session still has it.
    void $.ui.close({ id: 'usage-limits' }).catch(() => undefined)
    void refresh($).catch(() => undefined)

    void $.clock.every(TICK_MS, async () => {
      await update($, tick, n => n + 1)
      await refresh($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'usage-limits' }, async $ => {
    await refresh($).catch(() => undefined)

    const now = await $.clock.now()

    return { text: detailOf(await read($, windows), now, await read($, updatedAt)) }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const now = await $.clock.now()

      await update($, windows, () => e.rateLimits.map(one => ({ ...one })))
      await update($, updatedAt, () => now)
    }

    return next(e)
  })

  // The meters sit in the band above the prompt. Claude Code exposes no site
  // in the desktop app's session rail, so this is the nearest always-visible
  // place; `/usage-limits` has the detail.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const beneath = await next(e)
    const list = await read($, windows)

    await read($, tick)

    if (list.length === 0) return beneath

    const now = await $.clock.now()

    // The terminal has no Svg: one line of glyph bars there.
    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          {beneath}
          <Box columnGap={3} flexWrap="wrap">
            {list.map(one => {
              const color = levelOf(one.percentUsed, warnAt, dangerAt).named

              return (
                <Box columnGap={1}>
                  <Text dimColor>{shortNameOf(one.kind)}</Text>
                  <Text color={color}>{barOf(one.percentUsed, BAR_WIDTH)}</Text>
                  <Text color={color} bold>
                    {one.percentUsed}%
                  </Text>
                  <Text dimColor>{captionOf(one, now)}</Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    // One wrapping row: the windows first, then whatever the other mods drew
    // beneath (the model chip), so they share a line.
    return (
      <Box flexWrap="wrap" columnGap="xl" rowGap="sm" alignItems="center">
        {list.map(one => {
          const color = levelOf(one.percentUsed, warnAt, dangerAt).hex
          const elapsed = elapsedOf(one, now)

          // No Box width: its numbers are cells, not pixels, so the column
          // sizes to the Svg (CSS pixels) and the header follows the bar.
          return (
            <Box flexDirection="column" rowGap="xs">
              <Box columnGap="md">
                <Text size="footnote" dimColor>
                  {shortNameOf(one.kind)}
                </Text>
                <Text size="footnote" weight="semibold" color={color} tabular>
                  {one.percentUsed}%
                </Text>
              </Box>
              <Svg
                source={meterOf(one.percentUsed, color, elapsed)}
                alt={`${nameOf(one.kind)}: ${one.percentUsed}% used`}
                width={METER_WIDTH}
                height={METER_HEIGHT}
              />
              <Text size="caption" dimColor>
                {captionOf(one, now)}
              </Text>
            </Box>
          )
        })}
        {beneath}
      </Box>
    )
  })
}
