import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModelRouterConfig, ModelRouterEffort } from '../types'

const PANE = 'model-router'
const TITLE = 'Models'
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

const EFFORTS: ModelRouterEffort[] = [INHERIT, 'low', 'medium', 'high', 'xhigh', 'max']

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
  if (id === INHERIT) return 'session default'

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
    await $.ui.open({ id: PANE, title: TITLE })

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

  // The subagent's model, and the cap on how many run at once.
  on('agent.spawn', async ($, e, next) => {
    const one = await read($, config)

    if (e.fork) return next(e)

    if (one.maxSubagents > 0) {
      const running = (await $.agent.list()).filter(
        agent => agent.status === 'running' || agent.status === 'pending',
      ).length

      if (running >= one.maxSubagents) {
        return {
          deny: `model-router: at most ${one.maxSubagents} subagents at a time, and ${running} are running. Wait for one to finish before spawning another.`,
        }
      }
    }

    if (!one.subEnabled || one.subModel === INHERIT) return next(e)

    return next({ ...e, model: one.subModel })
  }).catch(($, e, next) => next(e))

  // Orchestrator mode rides on the prompt's own context blocks: what the model
  // reads beside the prompt and the user never sees. `prompt.compose` would be
  // the natural site, but a security plugin above this one sends that event on
  // past our hook. Only the main loop raises `prompt.submit`, so no subagent
  // reads this.
  on('prompt.submit', async ($, e, next) => {
    const one = await read($, config)

    if (!one.orchestrator) return next(e)

    return next({
      ...e,
      context: [...(e.context ?? []), orchestratorTextOf(one)],
    })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const one = await read($, config)

    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{summaryOf(one)} </Text>
        {one.orchestrator && <Text dimColor>· orchestrator </Text>}
        <Button
          key="open-models"
          label="Models"
          onPress={() => $.ui.open({ id: PANE, title: TITLE })}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const one = await read($, config)

    const mark = (isOn: boolean) => (isOn ? '●' : '○')

    const modelRow = (
      prefix: string,
      list: typeof MODELS,
      selected: string,
      pick: (id: string) => void,
    ) =>
      list.map(model => (
        <Button
          key={`${prefix}-${model.id}`}
          plain
          label={`${mark(selected === model.id)} ${model.label}`}
          onPress={() => pick(model.id)}
        />
      ))

    const effortRow = (
      prefix: string,
      selected: ModelRouterEffort,
      pick: (level: ModelRouterEffort) => void,
    ) =>
      EFFORTS.map(level => (
        <Button
          key={`${prefix}-${level}`}
          plain
          label={`${mark(selected === level)} ${level === INHERIT ? 'default' : level}`}
          onPress={() => pick(level)}
        />
      ))

    return (
      <Box flexDirection="column">
        <Text bold>Main agent</Text>
        <Box flexDirection="column" marginBottom={1}>
          <Button
            key="main-inherit"
            plain
            label={`${mark(one.mainModel === INHERIT)} session default`}
            onPress={() => save($, c => ({ ...c, mainModel: INHERIT }))}
          />
          {modelRow('main', MODELS, one.mainModel, id =>
            save($, c => ({ ...c, mainModel: id })),
          )}
          {one.showLegacy &&
            modelRow('main', LEGACY, one.mainModel, id =>
              save($, c => ({ ...c, mainModel: id })),
            )}
          <Button
            key="legacy"
            plain
            label={`${one.showLegacy ? '▾' : '▸'} previous models`}
            onPress={() => save($, c => ({ ...c, showLegacy: !c.showLegacy }))}
          />
        </Box>

        <Text bold>Effort</Text>
        <Box marginBottom={1}>
          {effortRow('me', one.mainEffort, level =>
            save($, c => ({ ...c, mainEffort: level })),
          )}
        </Box>

        <Button
          key="sub-toggle"
          plain
          label={`[${one.subEnabled ? 'x' : ' '}] different model for subagents`}
          onPress={() => save($, c => ({ ...c, subEnabled: !c.subEnabled }))}
        />
        {one.subEnabled && (
          <Box flexDirection="column" marginBottom={1}>
            {modelRow('sub', MODELS, one.subModel, id =>
              save($, c => ({ ...c, subModel: id })),
            )}
            {one.showLegacy &&
              modelRow('sub', LEGACY, one.subModel, id =>
                save($, c => ({ ...c, subModel: id })),
              )}
            <Box>
              <Text dimColor>effort </Text>
              {effortRow('se', one.subEffort, level =>
                save($, c => ({ ...c, subEffort: level })),
              )}
            </Box>
          </Box>
        )}
        {!one.subEnabled && (
          <Text dimColor>Subagents inherit {labelOf(one.mainModel)}.</Text>
        )}

        <Box marginTop={1}>
          <Text>Max subagents </Text>
          <Button
            key="cap-down"
            label="-"
            onPress={() =>
              save($, c => ({ ...c, maxSubagents: Math.max(0, c.maxSubagents - 1) }))
            }
          />
          <Text bold>
            {' '}
            {one.maxSubagents === 0 ? 'no cap' : String(one.maxSubagents)}{' '}
          </Text>
          <Button
            key="cap-up"
            label="+"
            onPress={() =>
              save($, c => ({ ...c, maxSubagents: Math.min(20, c.maxSubagents + 1) }))
            }
          />
        </Box>

        <Button
          key="orchestrator"
          plain
          label={`[${one.orchestrator ? 'x' : ' '}] orchestrator mode`}
          onPress={() => save($, c => ({ ...c, orchestrator: !c.orchestrator }))}
        />
        <Text dimColor>Main agent plans, delegates and reviews.</Text>
      </Box>
    )
  })
}
