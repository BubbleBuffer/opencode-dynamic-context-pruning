# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build        # Clean, compile TypeScript, copy prompts to dist/
npm run dev          # Run plugin in development mode (opencode plugin dev)
npm run typecheck    # Type check without emitting files
npm run test         # Run tests (node --import tsx --test tests/*.test.ts)
npm run clean        # Remove dist directory

# Publishing
npm version patch    # Bump version before publishing
npm publish          # Publish to npm
```

## Architecture Overview

This is an OpenCode plugin that reduces token usage by pruning obsolete tool outputs from conversation history. The plugin intercepts API requests via a global fetch wrapper and replaces pruned tool outputs with placeholder text.

### Core Flow

1. **Entry Point** (`index.ts`): Initializes the plugin, creates state, installs the fetch wrapper, and registers hooks
2. **Fetch Wrapper** (`lib/fetch-wrapper/`): Intercepts outgoing LLM API calls to replace pruned tool outputs. Supports multiple API formats:
   - OpenAI Chat Completions / Anthropic (`openai-chat.ts`)
   - Google/Gemini (`gemini.ts`)
   - OpenAI Responses API (`openai-responses.ts`)
3. **Janitor** (`lib/janitor.ts`): Core pruning logic that orchestrates analysis and tracks pruned IDs

### Pruning Strategies

Two complementary strategies in `lib/`:
- **Deduplication** (`deduplicator.ts`): Fast, zero-cost removal of duplicate tool calls by matching tool name + parameters
- **AI Analysis**: Uses an LLM to semantically identify obsolete tool outputs (prompts in `lib/prompts/`)

### State Management

`lib/state.ts` defines `PluginState` with Maps for:
- `prunedIds`: Session → pruned tool call IDs
- `stats`: Session → token savings statistics
- `toolParameters`: Tool call ID → parameters (for display and deduplication)
- `model`: Session → model info cache
- `googleToolCallMapping`: Session → position-based ID mapping for Google/Gemini

### Hook System

`lib/hooks.ts` provides two hooks:
- `event`: Triggers pruning when session goes idle
- `chat.params`: Caches model info and builds Google tool call mappings

### Model Selection

`lib/model-selector.ts` handles dynamic model selection with fallback chain:
1. Config-specified model (`dcp.jsonc`)
2. Current session model
3. Provider fallback models (OpenAI → Anthropic → Google → etc.)

### Configuration

`lib/config.ts` loads config from:
1. `~/.config/opencode/dcp.jsonc` (global)
2. `.opencode/dcp.jsonc` (project, overrides global)

Key config options: `enabled`, `debug`, `model`, `strategies.onIdle`, `strategies.onTool`, `protectedTools`, `nudge_freq`

### Synthetic Instructions

`lib/synth-instruction.ts` and `lib/prompt.ts` inject nudge reminders into conversations prompting the AI to call the `context_pruning` tool.

## Key Implementation Details

- Session history is never modified; pruning happens only in outgoing API requests
- Tool outputs are replaced with: `[Output removed to save context - information superseded or no longer needed]`
- Protected tools (task, todowrite, todoread, context_pruning) are never pruned
- Google/Gemini requires position-based correlation since native format loses tool call IDs
- When working on this plugin, reference the OpenCode source code to understand the plugin API and hook system
- Debug logs are written to `~/.config/opencode/logs/dcp/` when `debug: true` in config