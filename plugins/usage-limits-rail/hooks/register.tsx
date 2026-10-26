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

const colorOf = (percent: number, warnAt: number) =>
  percent >= 100 ? 'red' : percent >= warnAt ? 'yellow' : 'green'

// The mockup's palette: each window keeps its own accent until it nears the
// limit (amber) or reaches it (red).
const ACCENTS: Record<string, string> = {
  five_hour: '#D97757',
  seven_day: '#93B3DD',
  seven_day_opus: '#E0B45C',
}
const NEAR = '#E0B45C'
const REACHED = '#E08062'
const TRACK = '#3C3A36'
const METER_WIDTH = 220
const METER_HEIGHT = 8

const accentOf = (window: UsageWindow, warnAt: number) => {
  if (window.percentUsed >= 100) return REACHED
  if (window.percentUsed >= warnAt) return NEAR

  return ACCENTS[window.kind] ?? '#93B3DD'
}

const meterOf = (percent: number, color: string) => {
  const fill = Math.max(0, Math.min(METER_WIDTH, (percent / 100) * METER_WIDTH))
  const radius = METER_HEIGHT / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${METER_WIDTH}" height="${METER_HEIGHT}" viewBox="0 0 ${METER_WIDTH} ${METER_HEIGHT}"><rect width="${METER_WIDTH}" height="${METER_HEIGHT}" rx="${radius}" fill="${TRACK}"/>${fill > 0 ? `<rect width="${Math.max(fill, METER_HEIGHT)}" height="${METER_HEIGHT}" rx="${radius}" fill="${color}"/>` : ''}</svg>`
}

// ` · 20:10` for a reset within a day, ` · Wed 10:00` past that.
const shortClockOf = (window: UsageWindow, now: number) => {
  if (window.resetsAt === undefined) return ''

  try {
    const at = new Date(window.resetsAt)
    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (at.getTime() - now < 24 * 60 * 60_000) return ` · ${time}`

    return ` · ${at.toLocaleDateString([], { weekday: 'short' })} ${time}`
  } catch {
    return ''
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
  const warnAt = Number(options?.warnPercent ?? 85)

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
              const left = leftOf(one, now)

              return (
                <Box columnGap={1}>
                  <Text dimColor>{shortNameOf(one.kind)}</Text>
                  <Text color={colorOf(one.percentUsed, warnAt)}>
                    {barOf(one.percentUsed, BAR_WIDTH)}
                  </Text>
                  <Text color={colorOf(one.percentUsed, warnAt)} bold>
                    {one.percentUsed}%
                  </Text>
                  {left !== undefined && <Text dimColor>↻ {left}</Text>}
                </Box>
              )
            })}
          </Box>
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" rowGap="sm">
        {beneath}
        <Box columnGap="xl" rowGap="sm" flexWrap="wrap">
          {list.map(one => {
            const color = accentOf(one, warnAt)
            const left = leftOf(one, now)
            const isNear = one.percentUsed >= warnAt

            return (
              <Box flexDirection="column" rowGap="xs">
                <Box justifyContent="space-between" columnGap="md">
                  <Text size="footnote">{nameOf(one.kind)}</Text>
                  <Text size="footnote" weight="semibold" color={color} tabular>
                    {one.percentUsed}%
                  </Text>
                </Box>
                <Svg
                  source={meterOf(one.percentUsed, color)}
                  alt={`${nameOf(one.kind)}: ${one.percentUsed}% used`}
                  width={METER_WIDTH}
                  height={METER_HEIGHT}
                />
                {isNear && (
                  <Text size="caption" color={color}>
                    {one.percentUsed >= 100
                      ? `Limit reached${left === undefined ? '' : ` — resets in ${left}`}`
                      : `Nearing the limit${left === undefined ? '' : ` — resets in ${left}`}`}
                  </Text>
                )}
                {!isNear && (
                  <Text size="caption" dimColor>
                    {left === undefined
                      ? 'Reset time unknown'
                      : `Resets in ${left}${shortClockOf(one, now)}`}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
