import type { PluginState } from "./state"
import type { Logger } from "./logger"
import type { Janitor } from "./janitor"
import type { PluginConfig } from "./config"

/**
 * Checks if a session is a subagent session.
 */
export async function isSubagentSession(client: any, sessionID: string): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        return !!result.data?.parentID
    } catch (error: any) {
        return false
    }
}

/**
 * Creates the event handler for session status changes.
 */
export function createEventHandler(
    client: any,
    janitor: Janitor,
    logger: Logger,
    config: PluginConfig
) {
    return async ({ event }: { event: any }) => {
        if (event.type === "session.status" && event.properties.status.type === "idle") {
            if (await isSubagentSession(client, event.properties.sessionID)) return
            if (config.strategies.onIdle.length === 0) return

            janitor.runOnIdle(event.properties.sessionID, config.strategies.onIdle).catch(err => {
                logger.error("janitor", "Failed", { error: err.message })
            })
        }
    }
}

/**
 * Creates the chat.params hook for model caching and Google tool call mapping.
 */
export function createChatParamsHandler(
    client: any,
    state: PluginState,
    logger: Logger
) {
    return async (input: any, _output: any) => {
        const sessionId = input.sessionID
        let providerID = (input.provider as any)?.info?.id || input.provider?.id
        const modelID = input.model?.id

        if (!providerID && input.message?.model?.providerID) {
            providerID = input.message.model.providerID
        }

        // Cache model info for the session
        if (providerID && modelID) {
            state.model.set(sessionId, {
                providerID: providerID,
                modelID: modelID
            })
        }

        // Build Google/Gemini tool call mapping for position-based correlation
        // This is needed because Google's native format loses tool call IDs
        if (providerID === 'google' || providerID === 'google-vertex') {
            try {
                const messagesResponse = await client.session.messages({
                    path: { id: sessionId },
                    query: { limit: 100 }
                })
                const messages = messagesResponse.data || messagesResponse

                if (Array.isArray(messages)) {
                    // Build position mapping: track tool calls by name and occurrence index
                    const toolCallsByName = new Map<string, string[]>()

                    for (const msg of messages) {
                        if (msg.parts) {
                            for (const part of msg.parts) {
                                if (part.type === 'tool' && part.callID && part.tool) {
                                    const toolName = part.tool.toLowerCase()
                                    if (!toolCallsByName.has(toolName)) {
                                        toolCallsByName.set(toolName, [])
                                    }
                                    toolCallsByName.get(toolName)!.push(part.callID.toLowerCase())
                                }
                            }
                        }
                    }

                    // Create position mapping: "toolName:index" -> toolCallId
                    const positionMapping = new Map<string, string>()
                    for (const [toolName, callIds] of toolCallsByName) {
                        callIds.forEach((callId, index) => {
                            positionMapping.set(`${toolName}:${index}`, callId)
                        })
                    }

                    state.googleToolCallMapping.set(sessionId, positionMapping)
                    logger.info("chat.params", "Built Google tool call mapping", {
                        sessionId: sessionId.substring(0, 8),
                        toolCount: positionMapping.size
                    })
                }
            } catch (error: any) {
                logger.error("chat.params", "Failed to build Google tool call mapping", {
                    error: error.message
                })
            }
        }
    }
}
