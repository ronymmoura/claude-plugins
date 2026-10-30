import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModelRouterConfig, ModelRouterEffort } from '../types'

const PANE = 'model-router'
const STORE_KEY = 'config'
const INHERIT = 'inherit'

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
]

const LEGACY = [
  { id: 'claude-opus-4-1', label: 'Opus 4.1' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

const HINTS: Record<string, string> = {
  'claude-opus-5-5': 'Most capable',
  'claude-sonnet-5-5': 'Balanced',
  'claude-haiku-5-5': 'Fastest',
  'claude-fable-5-1': 'Writing',
}

const EFFORTS: ModelRouterEffort[] = [INHERIT, 'low', 'medium', 'high', 'xhigh', 'max']

const EFFORT_LABELS: Record<ModelRouterEffort, string> = {
  inherit: 'Default',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
}

const SHORT_EFFORTS: Record<ModelRouterEffort, string> = {
  inherit: 'auto',
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

// The mockup's accents: clay for the main agent, blue for its subagents, each
// with the tint of a selected tile and the edge of its card.
const MAIN_COLOR = '#D97757'
const MAIN_SELECTED = '#3a2a22'
const MAIN_EDGE = '#5a3a2c'
const SUB_COLOR = '#93B3DD'
const SUB_SELECTED = '#232c38'
const SUB_EDGE = '#34465c'
const CARD = '#232321'
const INSET = '#141413'
const CHIP = '#1d1c1a'
const TILE = '#2b2a27'
const TRACK = '#3C3A36'
const STOP_OFF = '#6f6b63'
const THUMB = '#ECEAE3'

const DEFAULTS: ModelRouterConfig = {
  mainModel: INHERIT,
  mainEffort: INHERIT,
  subEnabled: false,
  subModel: 'claude-sonnet-5-5',
  subEffort: INHERIT,
  maxSubagents: 3,
  orchestrator: false,
  showLegacy: false,
}

const config = atom({ plugin: 'model-router', key: 'config' } as const, DEFAULTS)

const labelOf = (id: string) => {
  if (id === INHERIT) return 'Session default'

  return [...MODELS, ...LEGACY].find(one => one.id === id)?.label ?? id
}

const capOf = (n: number) => `×${n === 0 ? '∞' : n}`

const levelsOf = () => EFFORTS.map(level => SHORT_EFFORTS[level])

const modelsOf = (one: ModelRouterConfig) =>
  [...MODELS, ...(one.showLegacy ? LEGACY : [])].map(model => ({
    id: model.id,
    label: model.label,
    hint: HINTS[model.id] ?? '',
  }))

// What each surface module is handed, by its `Client` key: the same function
// draws the pane and answers a `ui.message`, so a post redraws it at once.
const clientPropsOf = (key: string, one: ModelRouterConfig, overlay = false) => {
  const tiles = (selected: string, accent: string, selectedBg: string) => ({
    items: modelsOf(one),
    selected,
    accent,
    selectedBg,
    tile: TILE,
    ink: THUMB,
  })
  const slider = (level: ModelRouterEffort, color: string) => ({
    stops: levelsOf(),
    index: EFFORTS.indexOf(level),
    color,
    track: TRACK,
    ink: THUMB,
  })
  const toggle = (isOn: boolean, color: string) => ({
    on: isOn,
    color,
    track: TRACK,
    ink: THUMB,
    overlay,
  })

  if (key === 'main-tiles') return tiles(one.mainModel, MAIN_COLOR, MAIN_SELECTED)
  if (key === 'sub-tiles') return tiles(one.subModel, SUB_COLOR, SUB_SELECTED)
  if (key === 'main-effort') return slider(one.mainEffort, MAIN_COLOR)
  if (key === 'sub-effort') return slider(one.subEffort, SUB_COLOR)
  if (key === 'sub-switch') return toggle(one.subEnabled, SUB_COLOR)
  if (key === 'orch-switch') return toggle(one.orchestrator, MAIN_COLOR)

  return undefined
}

// What each Svg last showed, by its `Client` key, so a redraw can animate from
// there to the new value; a move stays drawn as an animation for a moment, so
// a second redraw of the same change does not cut it short.

const SHOWN = new Map<string, { from: number; to: number; at: number }>()
const SETTLE_MS = 600

const moveOf = (key: string, value: number) => {
  const seen = SHOWN.get(key)

  if (seen === undefined || seen.to === value) {
    const held = seen ?? { from: value, to: value, at: 0 }

    SHOWN.set(key, held)

    return { from: held.from, to: held.to, isMoving: Date.now() - held.at < SETTLE_MS }
  }

  SHOWN.set(key, { from: seen.to, to: value, at: Date.now() })

  return { from: seen.to, to: value, isMoving: true }
}

type Move = ReturnType<typeof moveOf>

// A SMIL `animate` from the previous value to the new one, frozen there.
const animate = (move: Move, attribute: string, from: string | number, to: string | number) =>
  move.isMoving && from !== to
    ? `<animate attributeName="${attribute}" from="${from}" to="${to}" dur="0.16s" begin="0s" fill="freeze"/>`
    : ''

// A 44 by 24 pill: a dark track and a thumb on the left, or the accent and the
// thumb on the right; both ease over the move.
const switchSource = (move: Move, color: string) => {
  const fill = (isOn: number) => (isOn === 1 ? color : TRACK)
  const at = (isOn: number) => (isOn === 1 ? 32 : 12)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="24" viewBox="0 0 44 24"><rect width="44" height="24" rx="12" fill="${fill(move.to)}">${animate(move, 'fill', fill(move.from), fill(move.to))}</rect><circle cx="${at(move.to)}" cy="12" r="10" fill="${THUMB}">${animate(move, 'cx', at(move.from), at(move.to))}</circle></svg>`
}


const summaryOf = (one: ModelRouterConfig) => {
  const main = `${labelOf(one.mainModel)}${one.mainEffort === INHERIT ? '' : ` · ${one.mainEffort}`}`

  if (!one.subEnabled) return main

  const sub = `${labelOf(one.subModel)}${one.subEffort === INHERIT ? '' : ` · ${one.subEffort}`}`

  return `${main} › ${sub}`
}

const orchestratorTextOf = (one: ModelRouterConfig) => `# Orchestration mode

You are the orchestrator of this session. Plan the work, split it, delegate it and review what comes back; do not carry out the heavy work yourself.

- Read only as much as you need to understand the request and to write a brief. Leave the wide reading, the searching and the editing to subagents.
- Split the request into pieces that can be worked on independently, and delegate each one with the Agent tool. The brief is the subagent's only context: name the files and the area, say what done looks like, and say what you have already ruled out.
- ${one.maxSubagents > 0 ? `At most ${one.maxSubagents} subagents may run at once; a spawn past that is refused, so wait for one to finish rather than retrying.` : 'There is no cap on how many subagents run at once; still keep the number to what the work needs.'}
- Review every result before you rely on it: look at the files, the diff or the command output it claims, since a subagent's report is a claim and not proof. Where a result is wrong or short, send that subagent back with precise corrections instead of fixing it yourself.
- Do the work yourself only where delegating it cannot work: a single edit a brief would be longer than, or a step that needs what you alone know.
- Report to the user in your own words, naming what was delegated and what you verified.

If you are yourself a subagent — another agent gave you this task — this section is not for you: do the work you were given and do not delegate it onward.`

const save = async (
  $: EngineInterface,
  change: (one: ModelRouterConfig) => ModelRouterConfig,
) => {
  const next = change(await read($, config))

  await update($, config, () => next)
  await $.store.set(STORE_KEY, next)
}

const fieldOf = (data: unknown, name: string) =>
  typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[name] : undefined

// What a surface module posted, as a change to the config; posted data is
// input, so a model must be one listed and an effort one of the stops.
const changeOf = (key: string, data: unknown) => {
  const pick = fieldOf(data, 'pick')
  const index = fieldOf(data, 'index')
  const level = typeof index === 'number' ? EFFORTS[index] : undefined
  const isModel = typeof pick === 'string' && [...MODELS, ...LEGACY].some(one => one.id === pick)
  const isToggle = fieldOf(data, 'toggle') === true

  const set = (patch: Partial<ModelRouterConfig>) => (c: ModelRouterConfig) => ({ ...c, ...patch })
  if (key === 'main-tiles' && isModel) return set({ mainModel: pick })
  if (key === 'sub-tiles' && isModel) return set({ subModel: pick })
  if (key === 'main-effort' && level !== undefined) return set({ mainEffort: level })
  if (key === 'sub-effort' && level !== undefined) return set({ subEffort: level })
  if (key === 'sub-switch' && isToggle) return (c: ModelRouterConfig) => ({ ...c, subEnabled: !c.subEnabled })
  if (key === 'orch-switch' && isToggle) return (c: ModelRouterConfig) => ({ ...c, orchestrator: !c.orchestrator })

  return undefined
}

const apply = async ($: EngineInterface, key: string, data: unknown) => {
  const change = changeOf(key, data)

  if (change !== undefined) await save($, change)
}

// Claude Code has no modal: a pane opened with focus, Escape to close and the
// toasts held is its dialog. The desktop app still seats it as a side panel.
const openPicker = ($: EngineInterface) =>
  $.ui.open({
    id: PANE,
    title: 'Models',
    focus: true,
    closeOnEscape: true,
    holdToasts: true,
  })

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'models',
      description: 'Pick the model and effort for this agent and its subagents',
    })

    // 0.4.0's slider diagnostic wrote the status line; clear what it left.
    $.ui.status(undefined)

    const stored = (await $.store.get(STORE_KEY)) as Partial<ModelRouterConfig> | undefined

    await update($, config, () => ({
      ...DEFAULTS,
      subModel: String(options?.subModel ?? DEFAULTS.subModel),
      subEnabled: options?.subEnabled === true,
      maxSubagents: Number(options?.maxSubagents ?? DEFAULTS.maxSubagents),
      orchestrator: options?.orchestrator === true,
      ...(stored ?? {}),
    }))

    return next(e)
  })

  on('command.run', { command: 'models' }, async $ => {
    await openPicker($)

    return { text: `Models: ${summaryOf(await read($, config))}` }
  })

  // Every model request of the turn: the main loop's, or a subagent's (e.agentId).
  on('turn.step', async function* ($, e, next) {
    const one = await read($, config)
    const isSub = e.agentId !== undefined
    const model = isSub && one.subEnabled ? one.subModel : one.mainModel
    const effort = isSub && one.subEnabled ? one.subEffort : one.mainEffort

    return yield* next({
      ...e,
      model: model === INHERIT ? e.model : model,
      effort: effort === INHERIT ? e.effort : effort,
    })
  })

  // The agents this module counts against the cap: `live` by agent id once
  // started, `reserved` by tool_use_id while a spawn is on its way. Several
  // Agent calls in one response spawn at once, so `$.agent.list()` alone lets
  // them all through: each would read the list before the others are on it.
  const live = new Set<string>()
  const reserved = new Set<string>()

  // The subagent's model, and the cap on how many run at once.
  on('agent.spawn', async ($, e, next) => {
    const one = await read($, config)

    if (one.maxSubagents > 0 && e.resume === undefined) {
      // Settle `live` against the engine's record: drop the ones that ended,
      // take in any started before this module (re)loaded.
      for (const agent of await $.agent.list()) {
        const isRunning = agent.status === 'running' || agent.status === 'pending'

        if (isRunning) live.add(agent.id)
        else live.delete(agent.id)
      }

      // From here to the reservation nothing awaits, so concurrent spawns
      // check and reserve one at a time.
      const inFlight = live.size + reserved.size

      if (inFlight >= one.maxSubagents) {
        return {
          deny: `model-router: at most ${one.maxSubagents} subagents at a time, and ${inFlight} are running. Wait for one to finish before spawning another.`,
        }
      }

      reserved.add(e.tool_use_id)
    }

    try {
      const started = await next(
        one.subEnabled && one.subModel !== INHERIT && !e.fork ? { ...e, model: one.subModel } : e,
      )

      if ('agentId' in started && typeof started.agentId === 'string') live.add(started.agentId)

      return started
    } finally {
      reserved.delete(e.tool_use_id)
    }
  }).catch(($, e, next) => next(e))

  // A subagent's turn ending frees its seat.
  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) live.delete(e.agentId)

    return next(e)
  })

  // Orchestrator mode rides on the prompt's own context blocks: what the model
  // reads beside the prompt and the user never sees. `prompt.compose` would be
  // the natural site, but a security plugin above this one sends that event on
  // past our hook. Only the main loop raises `prompt.submit`, so no subagent
  // reads this. A background task's notification, a peer's message or a
  // scheduled prompt is raised here too; only what the person sends carries it.
  on('prompt.submit', async ($, e, next) => {
    const one = await read($, config)
    const isPersons =
      e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'

    if (!one.orchestrator || !isPersons || e.isMeta) return next(e)

    return next({
      ...e,
      context: [...(e.context ?? []), orchestratorTextOf(one)],
    })
  }).catch(($, e, next) => next(e))

  // What a `Client` of the picker posts: a pick, a stop, a toggle. The answer
  // hands that instance its new props at once; the pane is drawn again so the
  // Svg beside it shows the change.
  on('ui.message', async ($, e) => {
    await apply($, e.element, e.data)
    $.ui.invalidate('ui.render')

    const props = clientPropsOf(e.element, await read($, config), e.surface === 'desktop')

    return props === undefined ? {} : { props }
  })

  // The band above the prompt: what is in force, in one chip, and the button
  // that opens the picker. The terminal draws the same on a single row.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const beneath = await next(e)
    const one = await read($, config)
    const { Box, Button, Text } = $.ui.resolve(e)
    const chip =
      e.surface === 'terminal'
        ? {}
        : {
            backgroundColor: CHIP,
            borderStyle: 'round',
            borderColor: TILE,
            paddingX: 'sm' as const,
          }

    const row = (
      <Box columnGap="sm" alignItems="center" {...chip}>
        <Text color={MAIN_COLOR}>●</Text>
        <Text weight="semibold">{labelOf(one.mainModel)}</Text>
        {one.mainEffort !== INHERIT && <Text dimColor>{SHORT_EFFORTS[one.mainEffort]}</Text>}
        {one.subEnabled && <Text dimColor>→</Text>}
        {one.subEnabled && <Text color={SUB_COLOR}>●</Text>}
        {one.subEnabled && <Text weight="semibold">{labelOf(one.subModel)}</Text>}
        {one.subEnabled && (
          <Text dimColor>
            {one.subEffort === INHERIT ? '' : `${SHORT_EFFORTS[one.subEffort]} `}
            {capOf(one.maxSubagents)}
          </Text>
        )}
        {one.orchestrator && (
          <Text size="caption" weight="semibold" color={MAIN_COLOR} backgroundColor={MAIN_SELECTED}>
            {' ORQ '}
          </Text>
        )}
        <Button key="open-models" label="Models" onPress={() => openPicker($)} />
      </Box>
    )

    if (beneath === null || beneath === undefined) return row

    // The other mods' bars first, the chip at the far end of the same row; they
    // wrap onto a second line only when the row is full.
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column" rowGap="sm">
          {beneath}
          {row}
        </Box>
      )
    }

    return (
      <Box flexWrap="wrap" columnGap="md" rowGap="sm" alignItems="center">
        {beneath}
        <Box flexGrow={1} />
        {row}
      </Box>
    )
  })

  // The picker, drawn in its dialog pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const one = await read($, config)
    const { Box, Button, Text } = $.ui.resolve(e)
    // The tiles, sliders and switches are surface modules; vscode and mobile
    // have no `Client`, and draw buttons instead. The desktop draws a switch
    // and a slider as an `Svg` with a `Client` laid over it for the pointer;
    // the terminal's `Client` draws them itself.
    const Client =
      e.surface === 'vscode' || e.surface === 'mobile' ? undefined : $.ui.resolve(e).Client
    const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined

    const caption = (text: string, color?: string) => (
      <Text size="caption" weight="semibold" color={color} dimColor={color === undefined}>
        {text}
      </Text>
    )

    const dot = (color: string) => <Text color={color}>●</Text>

    // A plain Button holding one Text: Buttons take no color, their Text does.
    const choice = (
      key: string,
      text: string,
      isSelected: boolean,
      pick: () => void,
      options: { color?: string; size?: 'caption'; autoFocus?: true } = {},
    ) => (
      <Button key={key} plain autoFocus={options.autoFocus} onPress={pick}>
        <Text
          size={options.size}
          weight={isSelected ? 'semibold' : 'regular'}
          color={isSelected ? options.color : undefined}
          dimColor={!isSelected}
        >
          {text}
        </Text>
      </Button>
    )

    // Each `module` is a string literal: the engine reads it off the source.
    const modelTiles = (key: string, selected: string, color: string) =>
      Client !== undefined ? (
        <Client key={key} module="./tiles.tsx" props={clientPropsOf(key, one)} width="100%" />
      ) : (
        <Box columnGap="sm" rowGap="xs" flexWrap="wrap">
          {modelsOf(one).map(model =>
            choice(
              `${key}-${model.id}`,
              model.label,
              model.id === selected,
              () => apply($, key, { pick: model.id }),
              { color },
            ),
          )}
        </Box>
      )

    const switchOf = (key: string, isOn: boolean, color: string) =>
      Client !== undefined && Svg !== undefined ? (
        <Box position="relative">
          <Svg
            source={switchSource(moveOf(key, isOn ? 1 : 0), color)}
            alt={isOn ? 'On' : 'Off'}
            width={44}
            height={24}
            isInteractive
          />
          <Box position="absolute" top={0} left={0} width="100%" height="100%">
            <Client
              key={key}
              module="./switch.tsx"
              props={clientPropsOf(key, one, true)}
              width="100%"
              height="100%"
            />
          </Box>
        </Box>
      ) : Client !== undefined ? (
        <Client key={key} module="./switch.tsx" props={clientPropsOf(key, one)} width={9} height={3} />
      ) : (
        <Button
          key={key}
          label={isOn ? 'On' : 'Off'}
          variant={isOn ? 'primary' : 'secondary'}
          onPress={() => apply($, key, { toggle: true })}
        />
      )

    // The slider is the surface module's alone, at rest and while dragged: the
    // desktop holds the pane's redraws during a press, so an Svg drawn here
    // could not follow the drag, and two drawings would not match.
    const effortSlider = (key: string, selected: ModelRouterEffort, color: string) => (
      <Box flexDirection="column" rowGap="xs">
        <Box justifyContent="space-between" alignItems="center">
          {caption('EFFORT')}
          <Text weight="semibold">{EFFORT_LABELS[selected]}</Text>
        </Box>
        {Client !== undefined ? (
          <Client key={key} module="./slider.tsx" props={clientPropsOf(key, one)} width="100%" />
        ) : (
          <Box justifyContent="space-between">
            {EFFORTS.map((level, index) =>
              choice(
                `${key}-${level}`,
                SHORT_EFFORTS[level],
                level === selected,
                () => apply($, key, { index }),
                { color, size: 'caption' },
              ),
            )}
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap="md" padding="sm">
        <Box
          flexDirection="column"
          rowGap="sm"
          padding="sm"
          borderStyle="round"
          borderColor={MAIN_EDGE}
          backgroundColor={CARD}
        >
          <Box justifyContent="space-between" alignItems="center">
            <Box columnGap="sm" alignItems="center">
              {dot(MAIN_COLOR)}
              {caption('MAIN AGENT', MAIN_COLOR)}
            </Box>
            {choice(
              'main-inherit',
              'Session default',
              one.mainModel === INHERIT,
              () => save($, c => ({ ...c, mainModel: INHERIT })),
              { color: MAIN_COLOR, size: 'caption', autoFocus: true },
            )}
          </Box>
          {modelTiles('main-tiles', one.mainModel, MAIN_COLOR)}
          {effortSlider('main-effort', one.mainEffort, MAIN_COLOR)}
        </Box>

        <Box
          flexDirection="column"
          rowGap="sm"
          padding="sm"
          borderStyle="round"
          borderColor={SUB_EDGE}
          backgroundColor={CARD}
        >
          <Box justifyContent="space-between" alignItems="center">
            <Box columnGap="sm" alignItems="center">
              {dot(SUB_COLOR)}
              {caption('SUBAGENTS', SUB_COLOR)}
            </Box>
            {switchOf('sub-switch', one.subEnabled, SUB_COLOR)}
          </Box>
          {one.subEnabled ? (
            <Box flexDirection="column" rowGap="sm">
              {modelTiles('sub-tiles', one.subModel, SUB_COLOR)}
              {effortSlider('sub-effort', one.subEffort, SUB_COLOR)}
            </Box>
          ) : (
            <Text size="caption" dimColor>
              {`Subagents inherit ${labelOf(one.mainModel)}`}
            </Text>
          )}
          <Box justifyContent="space-between" alignItems="center">
            <Text>Concurrent</Text>
            <Box columnGap="sm" alignItems="center" paddingX="sm" backgroundColor={INSET}>
              <Button
                key="cap-down"
                plain
                label="−"
                onPress={() =>
                  save($, c => ({ ...c, maxSubagents: Math.max(0, c.maxSubagents - 1) }))
                }
              />
              <Text weight="semibold" tabular>
                {one.maxSubagents === 0 ? '∞' : String(one.maxSubagents)}
              </Text>
              <Button
                key="cap-up"
                plain
                label="＋"
                onPress={() =>
                  save($, c => ({ ...c, maxSubagents: Math.min(20, c.maxSubagents + 1) }))
                }
              />
            </Box>
          </Box>
        </Box>

        <Box justifyContent="space-between" alignItems="center" paddingX="sm">
          <Box flexDirection="column">
            <Text>Orchestrator</Text>
            <Text size="caption" dimColor>
              Plans, delegates and reviews
            </Text>
          </Box>
          {switchOf('orch-switch', one.orchestrator, MAIN_COLOR)}
        </Box>

        <Box justifyContent="space-between" alignItems="center">
          <Button
            key="legacy"
            plain
            label={`${one.showLegacy ? '▾' : '▸'} Previous models`}
            onPress={() => save($, c => ({ ...c, showLegacy: !c.showLegacy }))}
          />
          <Button
            key="done"
            label="Done"
            variant="primary"
            role="dismiss"
            onPress={() => $.ui.close({ id: PANE })}
          />
        </Box>
      </Box>
    )
  })
}
