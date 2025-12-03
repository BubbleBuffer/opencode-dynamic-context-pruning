import type { PluginState } from "./index"

/**
 * Cache tool parameters from OpenAI Chat Completions style messages.
 * Extracts tool call IDs and their parameters from assistant messages with tool_calls.
 */
export function cacheToolParametersFromMessages(
    messages: any[],
    state: PluginState
): void {
    for (const message of messages) {
        if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) {
            continue
        }

        for (const toolCall of message.tool_calls) {
            if (!toolCall.id || !toolCall.function) {
                continue
            }

            try {
                const params = typeof toolCall.function.arguments === 'string'
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function.arguments
                state.toolParameters.set(toolCall.id, {
                    tool: toolCall.function.name,
                    parameters: params
                })
            } catch (error) {
                // Silently ignore parse errors
            }
        }
    }
}

/**
 * Cache tool parameters from OpenAI Responses API format.
 * Extracts from input array items with type='function_call'.
 */
export function cacheToolParametersFromInput(
    input: any[],
    state: PluginState
): void {
    for (const item of input) {
        if (item.type !== 'function_call' || !item.call_id || !item.name) {
            continue
        }

        try {
            const params = typeof item.arguments === 'string'
                ? JSON.parse(item.arguments)
                : item.arguments
            state.toolParameters.set(item.call_id, {
                tool: item.name,
                parameters: params
            })
        } catch (error) {
            // Silently ignore parse errors
        }
    }
}

/** Maximum number of entries to keep in the tool parameters cache */
const MAX_TOOL_CACHE_SIZE = 500

/**
 * Trim the tool parameters cache to prevent unbounded memory growth.
 * Uses FIFO eviction - removes oldest entries first.
 */
export function trimToolParametersCache(state: PluginState): void {
    if (state.toolParameters.size <= MAX_TOOL_CACHE_SIZE) {
        return
    }

    const keysToRemove = Array.from(state.toolParameters.keys())
        .slice(0, state.toolParameters.size - MAX_TOOL_CACHE_SIZE)

    for (const key of keysToRemove) {
        state.toolParameters.delete(key)
    }
}
