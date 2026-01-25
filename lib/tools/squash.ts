import { tool } from "@opencode-ai/plugin"
import type { SessionState, WithParts, SquashSummary } from "../state"
import type { PruneToolContext } from "./types"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import type { Logger } from "../logger"
import { loadPrompt } from "../prompts"
import { countTokens, estimateTokensBatch, getCurrentParams } from "../strategies/utils"
import { collectContentInRange } from "./utils"
import { sendSquashNotification } from "../ui/notification"
import { ToolParameterEntry } from "../state"

const SQUASH_TOOL_DESCRIPTION = loadPrompt("squash-tool-spec")

/**
 * Searches messages for a string and returns the message ID where it's found.
 * Searches in text parts, tool outputs, tool inputs, and other textual content.
 * Throws an error if the string is not found or found more than once.
 */
function findStringInMessages(
    messages: WithParts[],
    searchString: string,
    logger: Logger,
): { messageId: string; messageIndex: number } {
    const matches: { messageId: string; messageIndex: number }[] = []

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (const part of parts) {
            let content = ""

            // Check different part types for text content
            if (part.type === "text" && typeof part.text === "string") {
                content = part.text
            } else if (part.type === "tool" && part.state?.status === "completed") {
                // Search in tool output
                if (typeof part.state.output === "string") {
                    content = part.state.output
                }
                // Also search in tool input
                if (part.state.input) {
                    const inputStr =
                        typeof part.state.input === "string"
                            ? part.state.input
                            : JSON.stringify(part.state.input)
                    content += " " + inputStr
                }
            }

            if (content.includes(searchString)) {
                logger.debug("Found search string in message", {
                    messageId: msg.info.id,
                    messageIndex: i,
                    partType: part.type,
                })
                // Only add if this message isn't already in matches
                if (!matches.some((m) => m.messageId === msg.info.id)) {
                    matches.push({ messageId: msg.info.id, messageIndex: i })
                }
            }
        }
    }

    if (matches.length === 0) {
        throw new Error(
            `String not found in conversation. Make sure the string exists in the conversation.`,
        )
    }

    if (matches.length > 1) {
        throw new Error(
            `String found in ${matches.length} messages. Please use a more unique string to identify the range boundary.`,
        )
    }

    return matches[0]
}

/**
 * Collects all tool callIDs from messages between start and end indices (inclusive).
 */
function collectToolIdsInRange(
    messages: WithParts[],
    startIndex: number,
    endIndex: number,
    logger: Logger,
): string[] {
    const toolIds: string[] = []

    for (let i = startIndex; i <= endIndex; i++) {
        const msg = messages[i]
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (const part of parts) {
            if (part.type === "tool" && part.callID) {
                if (!toolIds.includes(part.callID)) {
                    toolIds.push(part.callID)
                    logger.debug("Collected tool ID from squashed range", {
                        callID: part.callID,
                        messageIndex: i,
                    })
                }
            }
        }
    }

    return toolIds
}

/**
 * Collects all message IDs from messages between start and end indices (inclusive).
 */
function collectMessageIdsInRange(
    messages: WithParts[],
    startIndex: number,
    endIndex: number,
): string[] {
    const messageIds: string[] = []

    for (let i = startIndex; i <= endIndex; i++) {
        const msgId = messages[i].info.id
        if (!messageIds.includes(msgId)) {
            messageIds.push(msgId)
        }
    }

    return messageIds
}

export function createSquashTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: SQUASH_TOOL_DESCRIPTION,
        args: {
            input: tool.schema
                .array(tool.schema.string())
                .length(4)
                .describe(
                    "[startString, endString, topic, summary] - 4 required strings: (1) startString: unique text from conversation marking range start, (2) endString: unique text marking range end, (3) topic: short 3-5 word label for UI, (4) summary: comprehensive text replacing all squashed content",
                ),
        },
        async execute(args, toolCtx) {
            const { client, state, logger } = ctx
            const sessionId = toolCtx.sessionID

            // Extract values from array
            const input = args.input || []

            // Validate array length
            if (input.length !== 4) {
                throw new Error(
                    `Expected exactly 4 strings [startString, endString, topic, summary], but received ${input.length}. Format: input: [startString, endString, topic, summary]`,
                )
            }

            const [startString, endString, topic, summary] = input

            logger.info("Squash tool invoked")
            logger.info(
                JSON.stringify({
                    startString: startString?.substring(0, 50) + "...",
                    endString: endString?.substring(0, 50) + "...",
                    topic: topic,
                    summaryLength: summary?.length,
                }),
            )

            // Validate inputs
            if (!startString || startString.trim() === "") {
                throw new Error(
                    "startString is required. Format: input: [startString, endString, topic, summary]",
                )
            }
            if (!endString || endString.trim() === "") {
                throw new Error(
                    "endString is required. Format: input: [startString, endString, topic, summary]",
                )
            }
            if (!topic || topic.trim() === "") {
                throw new Error(
                    "topic is required. Format: input: [startString, endString, topic, summary]",
                )
            }
            if (!summary || summary.trim() === "") {
                throw new Error(
                    "summary is required. Format: input: [startString, endString, topic, summary]",
                )
            }

            // Fetch messages
            const messagesResponse = await client.session.messages({
                path: { id: sessionId },
            })
            const messages: WithParts[] = messagesResponse.data || messagesResponse

            await ensureSessionInitialized(client, state, sessionId, logger, messages)

            // Find start and end strings in messages
            const startResult = findStringInMessages(messages, startString, logger)
            const endResult = findStringInMessages(messages, endString, logger)

            // Validate order
            if (startResult.messageIndex > endResult.messageIndex) {
                throw new Error(
                    `startString appears after endString in the conversation. Start must come before end.`,
                )
            }

            // Collect all tool IDs in the range
            const containedToolIds = collectToolIdsInRange(
                messages,
                startResult.messageIndex,
                endResult.messageIndex,
                logger,
            )

            // Collect all message IDs in the range
            const containedMessageIds = collectMessageIdsInRange(
                messages,
                startResult.messageIndex,
                endResult.messageIndex,
            )

            // Add tool IDs to prune list (prevents them from appearing in <prunable-tools>)
            state.prune.toolIds.push(...containedToolIds)

            // Add message IDs to prune list
            state.prune.messageIds.push(...containedMessageIds)

            // Store summary with anchor (first message in range)
            const squashSummary: SquashSummary = {
                anchorMessageId: startResult.messageId,
                summary: summary,
            }
            state.prune.squashSummaries.push(squashSummary)

            // Calculate estimated tokens for squashed messages
            const contentsToTokenize = collectContentInRange(
                messages,
                startResult.messageIndex,
                endResult.messageIndex,
            )
            const estimatedSquashedTokens = estimateTokensBatch(contentsToTokenize)

            // Add to prune stats for notification
            state.stats.pruneTokenCounter += estimatedSquashedTokens

            // Send notification
            const currentParams = getCurrentParams(state, messages, logger)
            await sendSquashNotification(
                client,
                logger,
                ctx.config,
                state,
                sessionId,
                containedToolIds,
                containedMessageIds,
                topic,
                summary,
                startResult,
                endResult,
                messages.length,
                currentParams,
            )

            // Update total prune stats and reset counter
            state.stats.totalPruneTokens += state.stats.pruneTokenCounter
            state.stats.pruneTokenCounter = 0
            state.nudgeCounter = 0

            logger.info("Squash range created", {
                startMessageId: startResult.messageId,
                endMessageId: endResult.messageId,
                toolIdsRemoved: containedToolIds.length,
                messagesInRange: containedMessageIds.length,
                estimatedTokens: estimatedSquashedTokens,
            })

            // Persist state
            saveSessionState(state, logger).catch((err) =>
                logger.error("Failed to persist state", { error: err.message }),
            )

            const messagesSquashed = endResult.messageIndex - startResult.messageIndex + 1
            return `Squashed ${messagesSquashed} messages (${containedToolIds.length} tool calls) into summary. The content will be replaced with your summary.`
        },
    })
}
