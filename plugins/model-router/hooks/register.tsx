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

// The mockup's accents: clay for the main agent, blue for its subagents.
const MAIN_COLOR = '#D97757'
const SUB_COLOR = '#93B3DD'

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

  // The band above the prompt: what is in force, and the button that opens
  // the picker.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const beneath = await next(e)
    const one = await read($, config)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" rowGap="sm">
        {beneath}
        <Box columnGap="sm" alignItems="center">
          <Text color={MAIN_COLOR}>●</Text>
          <Text weight="semibold">{labelOf(one.mainModel)}</Text>
          {one.mainEffort !== INHERIT && <Text dimColor>{one.mainEffort}</Text>}
          {one.subEnabled && <Text dimColor>›</Text>}
          {one.subEnabled && <Text color={SUB_COLOR}>●</Text>}
          {one.subEnabled && <Text weight="semibold">{labelOf(one.subModel)}</Text>}
          {one.subEnabled && one.subEffort !== INHERIT && <Text dimColor>{one.subEffort}</Text>}
          {one.orchestrator && <Text dimColor>· orchestrator</Text>}
          <Button key="open-models" label="Models" onPress={() => openPicker($)} />
        </Box>
      </Box>
    )
  })

  // The picker, drawn in its dialog pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const one = await read($, config)
    const { Box, Button, Text } = $.ui.resolve(e)

    const caption = (text: string) => (
      <Text size="caption" weight="semibold" dimColor>
        {text}
      </Text>
    )

    const switchOf = (key: string, isOn: boolean, flip: () => void) => (
      <Button
        key={key}
        label={isOn ? 'On' : 'Off'}
        variant={isOn ? 'primary' : 'secondary'}
        onPress={flip}
      />
    )

    const modelButtons = (
      prefix: string,
      selected: string,
      pick: (id: string) => void,
      hasHints: boolean,
    ) =>
      [...MODELS, ...(one.showLegacy ? LEGACY : [])].map(model => (
        <Button
          key={`${prefix}-${model.id}`}
          label={model.label}
          variant={selected === model.id ? 'primary' : 'secondary'}
          onPress={() => pick(model.id)}
        >
          {model.label}
          {hasHints && HINTS[model.id] !== undefined && (
            <Text size="caption" dimColor>
              {' '}
              {HINTS[model.id]}
            </Text>
          )}
        </Button>
      ))

    const effortButtons = (
      prefix: string,
      selected: ModelRouterEffort,
      pick: (level: ModelRouterEffort) => void,
    ) =>
      EFFORTS.map(level => (
        <Button
          key={`${prefix}-${level}`}
          label={EFFORT_LABELS[level]}
          variant={selected === level ? 'primary' : 'secondary'}
          onPress={() => pick(level)}
        />
      ))

    return (
      <Box flexDirection="column" rowGap="md" padding="sm">
        <Box flexDirection="column" rowGap="sm">
          {caption('MAIN AGENT')}
          <Box columnGap="sm" rowGap="sm" flexWrap="wrap">
            <Button
              key="main-inherit"
              label="Default"
              autoFocus
              variant={one.mainModel === INHERIT ? 'primary' : 'secondary'}
              onPress={() => save($, c => ({ ...c, mainModel: INHERIT }))}
            />
            {modelButtons('main', one.mainModel, id => save($, c => ({ ...c, mainModel: id })), true)}
          </Box>
          {caption('REASONING EFFORT')}
          <Box columnGap="sm" rowGap="sm" flexWrap="wrap">
            {effortButtons('me', one.mainEffort, level =>
              save($, c => ({ ...c, mainEffort: level })),
            )}
          </Box>
        </Box>

        <Box flexDirection="column" rowGap="sm">
          {caption('SUBAGENTS')}
          <Box justifyContent="space-between" alignItems="center" columnGap="md">
            <Box flexDirection="column">
              <Text weight="medium">Different model for subagents</Text>
              <Text size="caption" dimColor>
                {one.subEnabled
                  ? 'Agents spawned by the main agent use this instead'
                  : `Subagents inherit ${labelOf(one.mainModel)}`}
              </Text>
            </Box>
            {switchOf('sub-toggle', one.subEnabled, () =>
              save($, c => ({ ...c, subEnabled: !c.subEnabled })),
            )}
          </Box>
          {one.subEnabled && (
            <Box
              flexDirection="column"
              rowGap="sm"
              padding="sm"
              borderStyle="round"
              borderColor={SUB_COLOR}
            >
              <Box columnGap="sm" rowGap="sm" flexWrap="wrap">
                {modelButtons('sub', one.subModel, id => save($, c => ({ ...c, subModel: id })), false)}
              </Box>
              <Box columnGap="sm" rowGap="sm" flexWrap="wrap" alignItems="center">
                <Text size="caption" dimColor>
                  Effort
                </Text>
                {effortButtons('se', one.subEffort, level =>
                  save($, c => ({ ...c, subEffort: level })),
                )}
              </Box>
            </Box>
          )}

          <Box justifyContent="space-between" alignItems="center" columnGap="md">
            <Box flexDirection="column">
              <Text weight="medium">Max concurrent subagents</Text>
              <Text size="caption" dimColor>
                Spawns past the cap are refused
              </Text>
            </Box>
            <Box columnGap="xs" alignItems="center">
              <Button
                key="cap-down"
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
                label="+"
                onPress={() =>
                  save($, c => ({ ...c, maxSubagents: Math.min(20, c.maxSubagents + 1) }))
                }
              />
            </Box>
          </Box>

          <Box justifyContent="space-between" alignItems="center" columnGap="md">
            <Box flexDirection="column">
              <Text weight="medium">Orchestrator mode</Text>
              <Text size="caption" dimColor>
                Main agent plans, delegates and reviews — it does not do the heavy work
              </Text>
            </Box>
            {switchOf('orchestrator', one.orchestrator, () =>
              save($, c => ({ ...c, orchestrator: !c.orchestrator })),
            )}
          </Box>
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
