# usage-limits-rail

The account's rate-limit windows in one compact row above the prompt: how much of each is used, how long until it resets, and whether you are ahead of the pace.

```
5h                37%     week              65%
[=====|-----------]       [=========|------]
↻ 3h 54m · 18:00          ahead of pace · Tue 04:00
```

On desktop each window is a 150px column: its short name (`5h`, `week`, `week·opus`, `spend`) and the percentage on one line, a progress bar, and a caption. The bar carries a pace tick at the share of the window that has already elapsed (5 hours for `five_hour`, 7 days for `seven_day` and `seven_day_opus`; other kinds have no tick). The caption is `↻ <time left> · <reset time>`, switches to `ahead of pace · <reset time>` when usage is more than 5 points past the tick, and reads `Limit reached · resets in <time left>` at 100%.

The colour follows the level, not the window: blue up to `warnPercent`, amber above it, red above `dangerPercent`. The terminal draws glyph bars with the same levels and caption.

## Command

`/usage-limits` prints the detail: each window's name, the percentage used, the time left and the reset's local date and time.

## How it works

- `$.session.usage()` on start and every 30 seconds, and the `session.measure` event whenever a window moves, feed `$.state`.
- The line is a `ui.render` hook on `AbovePrompt`. It draws whatever the band beneath it holds first, so another plugin's band (model-router's, say) stays.
- Windows are drawn as the engine reports them (`five_hour`, `seven_day`, a gateway's `spend_limit`, …); a kind with no short name is drawn by its own.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `warnPercent` | `75` | Percentage above which a window is drawn in amber. |
| `dangerPercent` | `90` | Percentage above which a window is drawn in red. |

## Limits

- Claude Code gives plugins no site in the desktop app's session rail, beside the context panel. The band above the prompt is the nearest place that is always on screen.
- The line is empty off a subscription and until the first model response of the session reports a window: the engine has nothing to report before then.
