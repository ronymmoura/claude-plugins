import type { ClientModule } from 'claude-code'

type Item = { id: string; label: string; hint: string }

type Props = {
  items: Item[]
  selected: string
  accent: string
  selectedBg: string
  tile: string
  ink: string
}

type State = { cursor: number }

// A tile is its border, a name and a hint; a blank row sits between two rows.
const TILE_ROWS = 4
const STRIDE = TILE_ROWS + 1

// A grid of two-column tiles in one region: a press anywhere on a tile, its
// border and hint as much as its name, picks it. Arrows and Return do too.
const Tiles: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const columns = surface.columns || 40
  const left = Math.floor((columns - 1) / 2)
  const widths = [left, columns - 1 - left]
  const cursor = surface.state?.cursor

  surface.onPointer(e => {
    if (e.type !== 'down' || (e.button !== undefined && e.button !== 'left')) return

    const item = props.items[Math.floor(e.y / STRIDE) * 2 + (e.x <= left ? 0 : 1)]

    if (item !== undefined) surface.post({ pick: item.id })
  })

  surface.onKey(e => {
    const last = props.items.length - 1
    const at = cursor ?? Math.max(0, props.items.findIndex(item => item.id === props.selected))
    const step: Record<string, number> = { left: -1, right: 1, up: -2, down: 2 }

    if (e.key === 'return' || e.key === ' ') {
      const item = props.items[at]

      if (item !== undefined) surface.post({ pick: item.id })
    } else if (step[e.key] !== undefined) {
      surface.setState({ cursor: Math.min(last, Math.max(0, at + (step[e.key] ?? 0))) })
    }
  })

  const rows = Array.from({ length: Math.ceil(props.items.length / 2) }, (_, r) =>
    props.items.slice(r * 2, r * 2 + 2),
  )

  return (
    <Box flexDirection="column">
      {rows.map((pair, r) => (
        <Box key={`row-${r}`} flexDirection="column">
          {r > 0 && <Box height={1} />}
          <Box>
            {[0, 1].map(c => {
              const item = pair[c]
              const isSelected = item?.id === props.selected
              const isCursor = cursor !== undefined && cursor === r * 2 + c

              return (
                <Box key={`tile-${c}`} flexDirection="row">
                  {c === 1 && <Box width={1} />}
                  {item !== undefined && (
                    <Box
                      width={widths[c]}
                      height={TILE_ROWS}
                      flexDirection="column"
                      paddingX="sm"
                      borderStyle="round"
                      borderColor={isSelected ? props.accent : isCursor ? props.ink : props.tile}
                      backgroundColor={isSelected ? props.selectedBg : props.tile}
                    >
                      <Text
                        weight={isSelected ? 'semibold' : 'regular'}
                        color={isSelected ? props.ink : undefined}
                        dimColor={!isSelected}
                      >
                        {item.label}
                      </Text>
                      <Text size="caption" dimColor>
                        {item.hint}
                      </Text>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default Tiles
