# model-router

Pick the model and the reasoning effort for the main agent and, separately, for the subagents it spawns. Cap how many subagents run at once, and put the main agent in orchestrator mode.

A band above the prompt shows what is in force, as one rounded chip:

```
● Opus 5.5 med → ● Sonnet 5.5 high ×3  ORQ  [ Models ]
```

The clay dot is the main agent, the blue one its subagents (`×3` is the cap, `×∞` for none); `ORQ` appears while orchestrator mode is on. The terminal draws the same on one plain row.

**Models**, or `/models`, opens the picker as a dialog pane: it takes the keyboard (Tab and the arrows walk its buttons), Escape or **Done** closes it, and notifications wait until it closes. It holds two cards and a row:

- **Main agent** (clay) — a 2-column grid of model tiles (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1, and the previous models when expanded) with **Session default** beside the heading (a press anywhere on a tile picks it), and the reasoning effort as a slider you can press on any stop or drag: auto, low, med, high, xhigh, max.
- **Subagents** (blue) — a switch for a model of their own; when on, the same model tiles in blue and an effort slider; when off, a line saying they inherit the main model. A **Concurrent** stepper (− / ＋, ∞ for no cap) is always there, since the cap applies either way.
- **Orchestrator** — a switch for orchestrator mode.

The tiles, sliders and switches are driven by surface modules (`hooks/tiles.tsx`, `hooks/slider.tsx`, `hooks/switch.tsx`) drawn with a `Client`. On the desktop each switch is a 44×24 pill drawn as an `Svg`, animated with SMIL over about 160 ms, with a transparent `Client` laid over it that takes the press; on the terminal the switch module draws the pill with cells. The slider is the `Client`'s own drawing on every surface, at rest and while dragged, since the desktop holds the pane's redraws during a press; it saves on release. Where there is no `Client` (vscode, mobile) the pane draws plain buttons instead. `hooks/picker.test.tsx` runs with `claude plugin test`.

Every choice is written to `$.store`, so it comes back in the next session.

## How it works

| What | Hook |
| --- | --- |
| The model and effort of each request | `turn.step`, which carries `agentId` for a subagent's loop and nothing for the main one, so the two are routed apart. |
| The subagent's model at spawn time | `agent.spawn`, rewriting `model`. |
| The cap | `agent.spawn`, denying a spawn while `$.agent.list()` already shows that many running or pending agents. The model reads the refusal and waits. |
| Orchestrator mode | `prompt.submit`, adding the instructions to the prompt's `context`: blocks the model reads beside the prompt and the user never sees. |
| The band | `ui.render` on `AbovePrompt`, drawing whatever the band beneath it holds first, so another plugin's band stays. |
| The picker | `ui.render` on `{ component: 'Pane' }`, opened with `focus`, `closeOnEscape` and `holdToasts`. |

`session default` leaves the engine's own choice alone — nothing is rewritten. A fork (`subagent_type: "fork"`) always inherits the parent's model, so the cap applies to it but the model does not.

## Orchestrator mode

The added block tells the main agent to plan, split the work, delegate each piece with the Agent tool, and verify each result against the files or output it claims rather than trusting the report. It names the current cap, and it ends by telling a subagent that reads it to do the work rather than delegate onward.

It rides on each prompt's `context` rather than on the system prompt. `prompt.compose` is the natural site, but a security plugin seated above this one sends that event on past the hook, so nothing registered there runs. `prompt.submit` is raised by the main loop alone, which also keeps the block off every subagent.

The cost of that choice: the block is attached to every prompt while the mode is on — roughly 400 tokens a turn, and it sits after the prompt, so prompt caching does not absorb it. In exchange the instructions survive compaction and long sessions, which a one-time row would not.

## Options

These seed a new session; the picker overrides them and persists.

| Option | Default |
| --- | --- |
| `subModel` | `claude-sonnet-5-5` |
| `subEnabled` | `false` |
| `maxSubagents` | `3` (0 for no cap) |
| `orchestrator` | `false` |

## Limits

- Claude Code has no hookable component for the composer's own model button, no floating popover (a Box drawn `position: "absolute"` is clipped to its own band) and no modal. A pane opened as a dialog is the nearest thing: it behaves as one, but the desktop app seats it as a side panel.
- Picking a model here does not move the session's `/model` setting; it rewrites each request as it is sent. `/model` still shows the session's own choice.
- The model ids under **previous models** are the ones this build names; a model your account cannot reach fails the request, and the engine says so.
