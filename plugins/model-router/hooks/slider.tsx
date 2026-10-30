import type { ClientModule } from 'claude-code'

type Props = {
  stops: string[]
  index: number
  color: string
  track: string
  ink: string
}

// `drag` is the stop under the pointer; `base` the prop index it started from,
// so a drag is shown until the saved value arrives and replaces it.
type State = { drag?: number; base: number; held: boolean; commit?: number }

// A line filled up to a round thumb on the chosen stop, the stop labels under
// it, drawn the same at rest and while dragged. The region is cut into one cell
// per stop: a press, a drag (held past the edges too) or a press on a label
// lands on that stop. The drag lives in local state, since the desktop holds the
// pane's redraws during a press, and is posted once, on release.
const Slider: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const columns = surface.columns || 40
  const count = props.stops.length
  const bounds = Array.from({ length: count + 1 }, (_, i) => Math.round((i * columns) / count))
  const centers = props.stops.map((_, i) => Math.floor(((bounds[i] ?? 0) + (bounds[i + 1] ?? 0) - 1) / 2))
  const state = surface.state
  const isDragged = state?.drag !== undefined && (state.held || props.index === state.base)
  const shown = isDragged ? (state?.drag ?? props.index) : props.index

  const stopAt = (x: number) => {
    let i = 0

    while (i < count - 1 && x >= (bounds[i + 1] ?? 0)) i++

    return i
  }

  surface.onPointer(e => {
    const now = surface.state

    // A post replaces any other of the same frame, so once the drag ends the
    // stop rides on every post until it is saved: an `up` and a `leave` in one
    // frame keep it.
    const ends = now?.held === true && (e.type === 'up' || e.type === 'leave')
    const owed = now?.commit !== undefined && now.commit !== props.index ? now.commit : undefined

    if (e.type === 'down') {
      if (e.button !== undefined && e.button !== 'left') return

      surface.setState({ drag: stopAt(e.x), base: props.index, held: true })
    } else if (now?.held === true && e.type === 'move') {
      if (now.drag !== stopAt(e.x)) surface.setState({ ...now, drag: stopAt(e.x) })
    } else if (ends) {
      surface.setState({ ...now, drag: stopAt(e.x), held: false, commit: stopAt(e.x) })
      surface.post({ index: stopAt(e.x) })
    } else if (owed !== undefined) {
      surface.post({ index: owed })
    }
  })

  surface.onKey(e => {
    const step: Record<string, number> = { left: -1, right: 1, home: -count, end: count }
    const by = step[e.key]

    if (by !== undefined) surface.post({ index: Math.min(count - 1, Math.max(0, shown + by)) })
  })

  const start = centers[0] ?? 0
  const end = centers[count - 1] ?? columns - 1
  const at = centers[shown] ?? start

  return (
    <Box flexDirection="column">
      <Box alignItems="center">
        {start > 0 && <Box width={start} />}
        <Text mono color={props.color}>
          {'━'.repeat(Math.max(0, at - start))}
        </Text>
        <Text color={props.ink}>⬤</Text>
        <Text mono color={props.track}>
          {'─'.repeat(Math.max(0, end - at))}
        </Text>
      </Box>
      <Box>
        {props.stops.map((stop, i) => (
          <Box key={`label-${i}`} width={(bounds[i + 1] ?? 0) - (bounds[i] ?? 0)} justifyContent="center">
            <Text
              mono
              wrap="truncate"
              weight={i === shown ? 'semibold' : 'regular'}
              color={i === shown ? props.color : undefined}
              dimColor={i !== shown}
            >
              {stop}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default Slider
