# Dynamic Context Pruning Plugin

[![npm version](https://img.shields.io/npm/v/@tarquinen/opencode-dcp.svg)](https://www.npmjs.com/package/@tarquinen/opencode-dcp)

Automatically reduces token usage in OpenCode by removing obsolete tool outputs from conversation history.

![DCP in action](dcp-demo.png)

## Installation

Add to your OpenCode config (`~/.config/opencode/opencode.json` or `.opencode/opencode.json`):

```json
{
  "plugin": ["@tarquinen/opencode-dcp"]
}
```

Restart OpenCode. The plugin will automatically start optimizing your sessions.

> **Note:** Project `plugin` arrays override global completely—include all desired plugins in project config if using both.

## How It Works

DCP is **non-destructive**—pruning state is kept in memory only. When requests go to your LLM, DCP replaces pruned outputs with a placeholder; original session data stays intact.

## Configuration

DCP uses its own config file (`~/.config/opencode/dcp.jsonc` or `.opencode/dcp.jsonc`), created automatically on first run.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable the plugin |
| `debug` | `false` | Log to `~/.config/opencode/logs/dcp/` |
| `model` | (session) | Model for analysis (e.g., `"anthropic/claude-haiku-4-5"`) |
| `showModelErrorToasts` | `true` | Show notifications on model fallback |
| `pruning_summary` | `"detailed"` | `"off"`, `"minimal"`, or `"detailed"` |
| `protectedTools` | `["task", "todowrite", "todoread", "context_pruning"]` | Tools that are never pruned |
| `strategies.onIdle` | `["deduplication", "ai-analysis"]` | Strategies for automatic pruning |
| `strategies.onTool` | `["deduplication"]` | Strategies when AI calls `context_pruning` |

**Strategies:** `"deduplication"` (fast, zero LLM cost) and `"ai-analysis"` (maximum savings). Empty array disables that trigger.

```jsonc
{
  "enabled": true,
  "strategies": {
    "onIdle": ["deduplication", "ai-analysis"],
    "onTool": ["deduplication"]
  },
  "protectedTools": ["task", "todowrite", "todoread", "context_pruning"]
}
```

Settings merge: **Defaults** → **Global** → **Project**. Restart OpenCode after changes.

### Version Pinning

```json
{ "plugin": ["@tarquinen/opencode-dcp@0.3.16"] }
```

## License

MIT
