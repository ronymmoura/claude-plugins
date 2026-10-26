export type ModelRouterEffort = 'inherit' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ModelRouterConfig = {
  /** The model every main-loop request is sent to, or `inherit` for the session's own. */
  mainModel: string
  mainEffort: ModelRouterEffort
  /** Whether subagents run on a model of their own. */
  subEnabled: boolean
  subModel: string
  subEffort: ModelRouterEffort
  /** How many subagents may run at once; 0 for no cap. */
  maxSubagents: number
  /** Whether the main agent is told to plan, delegate and review rather than do the work. */
  orchestrator: boolean
  /** Whether the picker lists the previous model generations. */
  showLegacy: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      config: ModelRouterConfig
    }
  }
}
