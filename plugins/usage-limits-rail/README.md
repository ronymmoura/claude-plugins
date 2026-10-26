# usage-limits-rail

A pane beside the chat with the account's rate-limit windows: how much of each is used, and when it resets.

```
5-hour window 68%
████████████████░░░░░░░
resets in 1h 12m · 26/10/2026, 14:30

Weekly 41%
█████████░░░░░░░░░░░░░░
resets in 6d 4h · 02/11/2026, 09:00

Updated just now
```

## How it works

- `$.session.usage()` on start and every 30 seconds, and the `session.measure` event whenever a window moves, feed `$.state`.
- The pane is a `ui.render` hook on `{ component: 'Pane', requestId: 'usage-limits' }`.
- Windows are drawn as the engine reports them (`five_hour`, `seven_day`, a gateway's `spend_limit`, …); a kind with no friendly name is drawn by its own.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `warnPercent` | `85` | Percentage from which a window is drawn as a warning (amber, then red at 100). |
| `openOnStart` | `true` | Open the pane when the session starts. |

## Command

`/usage-limits` re-reads the figures and opens the pane.

## Limits

The list is empty off a subscription and until the first model response of the session reports a window — the engine has nothing to report before then.
