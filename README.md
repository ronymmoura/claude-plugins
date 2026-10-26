# claude-plugins

A Claude Code plugin marketplace.

## Install

At the prompt of a terminal session:

```bash
/plugin install usage-limits-rail --marketplace ronymmoura/claude-plugins
```

```bash
/plugin install model-router --marketplace ronymmoura/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope. From a shell, `claude plugin install …` takes the same arguments. In the desktop app, where `/plugin` does not run: **+** next to the prompt box → **Plugins** → **Add marketplace** with `ronymmoura/claude-plugins` → **Add plugin**.

## Plugins

| Plugin | What it does |
| --- | --- |
| [usage-limits-rail](plugins/usage-limits-rail) | A pane beside the chat with the account's rate-limit windows: how much of each is used and when it resets. |
| [model-router](plugins/model-router) | Model and effort for the main agent and, separately, for its subagents; a cap on how many run at once; orchestrator mode. |

## Developing

Both plugins are function-hook mods: a manifest, `hooks/hooks.json`, one TypeScript module and a `$.state` contract. To run one from this checkout without installing it:

```bash
claude --plugin-dir plugins/model-router
```

Saving a file reloads the module in that session. `claude plugin validate plugins/<name>` checks the manifest.
