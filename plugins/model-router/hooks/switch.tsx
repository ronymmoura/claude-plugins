import type { ClientModule } from 'claude-code'

// `overlay`: an Svg drawn beneath draws the switch; this region only takes the press.
type Props = { on: boolean; color: string; track: string; ink: string; overlay?: boolean }

// `target` is the side the thumb is heading for, `step` how far along it is.
type State = { target: boolean; step: number }

const FRAMES = 4
const FRAME_MS = 40
// The pill is 9 cells across and 3 down: 1 of border each side, 7 inside; the
// thumb's left offset runs from 1 (off) to 4 (on).
const OFF_AT = 1
const ON_AT = 4

const channels = (hex: string) =>
  [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))

// The color a fraction of the way from one hex color to another.
const mix = (from: string, to: string, t: number) => {
  const a = channels(from)
  const b = channels(to)

  return `#${a
    .map((x, i) => Math.round(x + ((b[i] ?? x) - x) * t).toString(16).padStart(2, '0'))
    .join('')}`
}

// On the terminal, a round-bordered pill with a thumb: a press on it posts
// `{ toggle: true }`, and when the `on` prop changes the thumb slides over and
// the track eases to its new color in a few frames. The timer runs from the
// first draw and does nothing while no slide is under way, so it never draws
// on its own.
const Switch: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  surface.onPointer(e => {
    if (e.type === 'down' && (e.button === undefined || e.button === 'left')) {
      surface.post({ toggle: true })
    }
  })

  surface.onKey(e => {
    if (e.key === 'return' || e.key === ' ') surface.post({ toggle: true })
  })

  if (props.overlay === true) return <Box />

  let state = surface.state ?? { target: props.on, step: FRAMES }

  if (surface.state === undefined) {
    surface.every(FRAME_MS, () => {
      const now = surface.state

      if (now !== undefined && now.step < FRAMES) surface.setState({ ...now, step: now.step + 1 })
    })
    surface.setState(state)
  } else if (state.target !== props.on) {
    state = { target: props.on, step: 0 }
    surface.setState(state)
  }

  const t = state.step / FRAMES
  const from = state.target ? props.track : props.color
  const to = state.target ? props.color : props.track
  const background = mix(from, to, t)
  const fromAt = state.target ? OFF_AT : ON_AT
  const toAt = state.target ? ON_AT : OFF_AT
  const thumb = Math.round(fromAt + (toAt - fromAt) * t)

  return (
    <Box
      width={9}
      height={3}
      alignItems="center"
      paddingLeft={thumb}
      borderStyle="round"
      borderColor={background}
      backgroundColor={background}
    >
      <Text color={props.ink} size="heading">
        ●
      </Text>
    </Box>
  )
}

export default Switch
