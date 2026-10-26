# usage-limits-rail

The account's rate-limit windows in one compact line above the prompt: how much of each is used, and how long until it resets.

```
5h ███████░░░ 68% ↻ 1h 12m   week ████░░░░░░ 41% ↻ 6d 4h
```

Each bar is green, then amber from `warnPercent`, then red at 100%.

## Command

`/usage-limits` prints the detail: each window's name, the percentage used, the time left and the reset's local date and time.

## How it works

- `$.session.usage()` on start and every 30 seconds, and the `session.measure` event whenever a window moves, feed `$.state`.
- The line is a `ui.render` hook on `AbovePrompt`. It draws whatever the band beneath it holds first, so another plugin's band (model-router's, say) stays.
- Windows are drawn as the engine reports them (`five_hour`, `seven_day`, a gateway's `spend_limit`, …); a kind with no short name is drawn by its own.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `warnPercent` | `85` | Percentage from which a window is drawn as a warning. |

## Limits

- Claude Code gives plugins no site in the desktop app's session rail, beside the context panel. The band above the prompt is the nearest place that is always on screen.
- The line is empty off a subscription and until the first model response of the session reports a window: the engine has nothing to report before then.
