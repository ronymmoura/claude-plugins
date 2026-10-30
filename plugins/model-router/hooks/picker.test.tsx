import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// Nothing sits beneath the plugin: this hook stands for the store, and keeps
// what the picker last saved.
const keep = (on: On) => {
  let saved: unknown

  on('store.set', (_, e) => {
    if (e.key === 'config') saved = e.value

    return { value: undefined }
  })

  return () => saved
}

const PANE = {
  plugin: 'model-router',
  component: 'Pane',
  requestId: 'model-router',
  props: {
    title: 'Models',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('a pick, a stop and a toggle posted by the modules change the config, on every surface', async ($, on) => {
  const config = keep(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.post({ pick: 'claude-opus-5-5' }, { in: 'main-tiles' })
    await ui.post({ index: 4 }, { in: 'main-effort' })
    await ui.post({ toggle: true }, { in: 'sub-switch' })
    await ui.post({ pick: 'claude-haiku-5-5' }, { in: 'sub-tiles' })
    await ui.post({ index: 2 }, { in: 'sub-effort' })
    await ui.post({ toggle: true }, { in: 'orch-switch' })

    expect(config()).toMatchObject({
      mainModel: 'claude-opus-5-5',
      mainEffort: 'xhigh',
      subEnabled: true,
      subModel: 'claude-haiku-5-5',
      subEffort: 'medium',
      orchestrator: true,
    })

    // What a module posts is input: a model not listed and a stop out of range change nothing.
    await ui.post({ pick: 'gpt-4' }, { in: 'main-tiles' })
    await ui.post({ index: 9 }, { in: 'main-effort' })
    await ui.post('nonsense', { in: 'sub-switch' })

    expect(config()).toMatchObject({
      mainModel: 'claude-opus-5-5',
      mainEffort: 'xhigh',
      subEnabled: true,
    })

    await ui.post({ toggle: true }, { in: 'sub-switch' })
    await ui.post({ toggle: true }, { in: 'orch-switch' })
    await ui.unmount()
  }
})

test('a press anywhere on a tile picks it', async ($, on) => {
  const config = keep(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.resize({ columns: 40, rows: 9, in: 'main-tiles' })

  // The second row's left tile, on its last row; then the first row's right tile.
  await ui.pointer({ type: 'down', x: 3, y: 8, button: 'left', in: 'main-tiles' })
  expect(config()).toMatchObject({ mainModel: 'claude-haiku-5-5' })

  await ui.pointer({ type: 'down', x: 35, y: 1, button: 'left', in: 'main-tiles' })
  expect(config()).toMatchObject({ mainModel: 'claude-sonnet-5-5' })

  await ui.unmount()
})

test('the slider is picked by a press, and followed by a drag past its edges', async ($, on) => {
  const config = keep(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.resize({ columns: 36, rows: 2, in: 'main-effort' })

  // A press on the label of the fourth stop lands on it when the pointer comes up.
  await ui.pointer({ type: 'down', x: 20, y: 1, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'up', x: 20, y: 1, button: 'left', in: 'main-effort' })
  expect(config()).toMatchObject({ mainEffort: 'high' })

  // Drag from the first stop to well past the last one: the last stop.
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'move', x: 12, y: 0, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'move', x: 90, y: 3, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'up', x: 90, y: 3, button: 'left', in: 'main-effort' })
  expect(config()).toMatchObject({ mainEffort: 'max' })

  // And back down to the first.
  await ui.pointer({ type: 'down', x: 35, y: 0, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'move', x: -8, y: 0, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'up', x: -8, y: 0, button: 'left', in: 'main-effort' })
  expect(config()).toMatchObject({ mainEffort: 'inherit' })

  await ui.key({ key: 'right', in: 'main-effort' })
  expect(config()).toMatchObject({ mainEffort: 'low' })

  await ui.unmount()
})

test('on the terminal a press on a switch toggles it, and its thumb slides over a few frames', async ($, on) => {
  const config = keep(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const before = JSON.stringify(await ui.drawn({ in: 'orch-switch' }))

  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'orch-switch' })
  expect(config()).toMatchObject({ orchestrator: true })

  await ui.advance(40)
  const middle = JSON.stringify(await ui.drawn({ in: 'orch-switch' }))

  await ui.advance(400)
  const after = JSON.stringify(await ui.drawn({ in: 'orch-switch' }))

  expect(middle).not.toBe(before)
  expect(after).not.toBe(middle)

  // Settled, a later tick draws nothing new.
  await ui.advance(400)
  expect(JSON.stringify(await ui.drawn({ in: 'orch-switch' }))).toBe(after)

  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'orch-switch' })
  expect(config()).toMatchObject({ orchestrator: false })

  await ui.unmount()
})

// The desktop draws the switch and the slider as an Svg, with a Client over it
// that only takes the pointer.
const sources = async (ui: { findAll: (query: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.source))

test('on the desktop the switches are Svgs, and a drag on the slider is saved on release', async ($, on) => {
  const config = keep(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The subagents switch, the orchestrator switch.
  const [, pill] = await sources(ui)

  // Drawn first, nothing has moved: no animation, a 44 by 24 pill and a thumb of 20.
  expect(pill).toContain('width="44" height="24"')
  expect(pill).toContain('r="10"')
  expect(pill).not.toContain('<animate')

  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'orch-switch' })
  expect(config()).toMatchObject({ orchestrator: true })

  // The thumb slides from the left to the right while the track takes the accent.
  const moved = (await sources(ui))[1]

  expect(moved).toContain('<animate attributeName="cx" from="12" to="32"')
  expect(moved).toContain('<animate attributeName="fill"')
  expect(moved).toContain('fill="freeze"')

  // A redraw of the same change keeps the same animation.
  await ui.redraw()
  expect((await sources(ui))[1]).toBe(moved)

  await ui.resize({ columns: 36, rows: 3, in: 'main-effort' })

  // A press and a drag across the stops post nothing, since the desktop holds
  // the pane's redraws mid-press; the value is saved once, on release.
  await ui.pointer({ type: 'down', x: 20, y: 1, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'move', x: 26, y: 1, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'move', x: 90, y: 5, button: 'left', in: 'main-effort' })
  await ui.redraw()
  expect(config()).toMatchObject({ mainEffort: 'inherit' })
  await ui.pointer({ type: 'move', x: 14, y: 5, button: 'left', in: 'main-effort' })
  await ui.pointer({ type: 'up', x: 14, y: 5, button: 'left', in: 'main-effort' })
  expect(config()).toMatchObject({ mainEffort: 'medium' })

  expect(await ui.drawn({ in: 'main-effort' })).toMatchObject({ type: 'Box' })

  await ui.unmount()
})

test('a surface with no Client draws buttons that change the same config', async ($, on) => {
  const config = keep(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })

  await ui.press({ key: 'main-tiles-claude-fable-5-1' })
  await ui.press({ key: 'main-effort-max' })
  await ui.press({ key: 'orch-switch' })

  expect(config()).toMatchObject({
    mainModel: 'claude-fable-5-1',
    mainEffort: 'max',
    orchestrator: true,
  })

  await ui.unmount()
})

const BAND = {
  plugin: 'model-router',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

test('the band is one wrapping row on the desktop: the other mods first, the chip at the end', async ($, on) => {
  // The other mods' bars, as the engine hands them up from beneath.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>limits</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = JSON.stringify(await ui.drawn())

  expect(drawn).toContain('"flexWrap":"wrap"')
  expect(drawn).toContain('"flexGrow":1')
  expect(drawn.indexOf('limits')).toBeLessThan(drawn.indexOf('Session default'))

  await ui.unmount()
})
