# model-router

Pick the model and the reasoning effort for the main agent and, separately, for the subagents it spawns. Cap how many subagents run at once, and put the main agent in orchestrator mode.

A band above the prompt shows what is in force and opens the pane:

```
Opus 5.5 · high › Sonnet 5.5 · medium · orchestrator  [ Models ]
```

## The pane

`/models`, or the **Models** button in the band.

```
Main agent
○ session default
● Opus 5.5
○ Sonnet 5.5
○ Haiku 5.5
○ Fable 5.1
▸ previous models

Effort
○ default  ○ low  ○ medium  ● high  ○ xhigh  ○ max

[x] different model for subagents
  ○ Opus 5.5  ● Sonnet 5.5  ○ Haiku 5.5  ○ Fable 5.1
  effort ○ default ○ low ● medium ○ high ○ xhigh ○ max

Max subagents  [-] 3 [+]

[x] orchestrator mode
```

Every choice is written to `$.store`, so it comes back in the next session.

## How it works

| What | Hook |
| --- | --- |
| The model and effort of each request | `turn.step`, which carries `agentId` for a subagent's loop and nothing for the main one, so the two are routed apart. |
| The subagent's model at spawn time | `agent.spawn`, rewriting `model`. |
| The cap | `agent.spawn`, denying a spawn while `$.agent.list()` already shows that many running or pending agents. The model reads the refusal and waits. |
| Orchestrator mode | `prompt.submit`, adding the instructions to the prompt's `context`: blocks the model reads beside the prompt and the user never sees. |
| The band and the pane | `ui.render` on `AbovePrompt` and on `{ component: 'Pane' }`. |

`session default` leaves the engine's own choice alone — nothing is rewritten. A fork (`subagent_type: "fork"`) always inherits the parent's model, so the cap applies to it but the model does not.

## Orchestrator mode

The added block tells the main agent to plan, split the work, delegate each piece with the Agent tool, and verify each result against the files or output it claims rather than trusting the report. It names the current cap, and it ends by telling a subagent that reads it to do the work rather than delegate onward.

It rides on each prompt's `context` rather than on the system prompt. `prompt.compose` is the natural site, but a security plugin seated above this one sends that event on past the hook, so nothing registered there runs. `prompt.submit` is raised by the main loop alone, which also keeps the block off every subagent.

The cost of that choice: the block is attached to every prompt while the mode is on — roughly 400 tokens a turn, and it sits after the prompt, so prompt caching does not absorb it. In exchange the instructions survive compaction and long sessions, which a one-time row would not.

## Options

These seed a new session; the pane overrides them and persists.

| Option | Default |
| --- | --- |
| `subModel` | `claude-sonnet-5-5` |
| `subEnabled` | `false` |
| `maxSubagents` | `3` (0 for no cap) |
| `orchestrator` | `false` |

## Limits

- Claude Code has no hookable component for the composer's own model button, so this replaces it with a band above the prompt rather than changing that button.
- Picking a model here does not move the session's `/model` setting; it rewrites each request as it is sent. `/model` still shows the session's own choice.
- The model ids under **previous models** are the ones this build names; a model your account cannot reach fails the request, and the engine says so.
