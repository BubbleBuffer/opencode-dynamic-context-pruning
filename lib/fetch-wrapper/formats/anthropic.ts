import type { FormatDescriptor, ToolOutput } from "../types"
import type { PluginState } from "../../state"

/**
 * Anthropic Messages API format with top-level `system` array.
 * Tool calls: `tool_use` blocks in assistant content with `id`
 * Tool results: `tool_result` blocks in user content with `tool_use_id`
 */
export const anthropicFormat: FormatDescriptor = {
    name: 'anthropic',

    detect(body: any): boolean {
        // Anthropic has top-level `system` field (can be string or array) AND messages array
        // This distinguishes it from OpenAI (no top-level system) and Bedrock (has inferenceConfig)
        return (
            body.system !== undefined &&
            Array.isArray(body.messages)
        )
    },

    getDataArray(body: any): any[] | undefined {
        return body.messages
    },

    injectSystemMessage(body: any, injection: string): boolean {
        if (!injection) return false
        
        // Anthropic system can be:
        // 1. A string: "You are a helpful assistant"
        // 2. An array of blocks: [{"type": "text", "text": "...", "cache_control": {...}}]
        
        // Convert to array if needed
        if (typeof body.system === 'string') {
            body.system = [{ type: 'text', text: body.system }]
        } else if (!Array.isArray(body.system)) {
            body.system = []
        }
        
        // Append the injection as a text block
        body.system.push({ type: 'text', text: injection })
        return true
    },

    extractToolOutputs(data: any[], state: PluginState): ToolOutput[] {
        const outputs: ToolOutput[] = []

        for (const m of data) {
            // Tool results are in user messages with type='tool_result'
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.type === 'tool_result' && block.tool_use_id) {
                        const toolUseId = block.tool_use_id.toLowerCase()
                        const metadata = state.toolParameters.get(toolUseId)
                        outputs.push({
                            id: toolUseId,
                            toolName: metadata?.tool
                        })
                    }
                }
            }
        }

        return outputs
    },

    replaceToolOutput(data: any[], toolId: string, prunedMessage: string, _state: PluginState): boolean {
        const toolIdLower = toolId.toLowerCase()
        let replaced = false

        for (let i = 0; i < data.length; i++) {
            const m = data[i]

            if (m.role === 'user' && Array.isArray(m.content)) {
                let messageModified = false
                const newContent = m.content.map((block: any) => {
                    if (block.type === 'tool_result' && block.tool_use_id?.toLowerCase() === toolIdLower) {
                        messageModified = true
                        // Anthropic tool_result content can be string or array of content blocks
                        // Replace with simple string
                        return {
                            ...block,
                            content: prunedMessage
                        }
                    }
                    return block
                })
                if (messageModified) {
                    data[i] = { ...m, content: newContent }
                    replaced = true
                }
            }
        }

        return replaced
    },

    hasToolOutputs(data: any[]): boolean {
        for (const m of data) {
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.type === 'tool_result') return true
                }
            }
        }
        return false
    },

    getLogMetadata(data: any[], replacedCount: number, inputUrl: string): Record<string, any> {
        return {
            url: inputUrl,
            replacedCount,
            totalMessages: data.length,
            format: 'anthropic'
        }
    }
}
