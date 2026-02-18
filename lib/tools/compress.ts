import { tool } from "@opencode-ai/plugin"
import type { BoundaryReference, CompressToolArgs } from "./compress-utils"
import type { PruneToolContext } from "./types"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import { loadPrompt } from "../prompts"
import { getCurrentParams, getTotalToolTokens } from "../strategies/utils"
import { sendCompressNotification } from "../ui/notification"
import { assignMessageRefs } from "../message-ids"
import {
    addCompressedBlockHeader,
    allocateBlockId,
    buildSearchContext,
    fetchSessionMessages,
    injectBlockPlaceholders,
    parseBlockPlaceholders,
    resolveAnchorMessageId,
    resolveBoundaryIds,
    resolveRange,
    upsertCompressedSummary,
    validateCompressArgs,
    validateSummaryPlaceholders,
} from "./compress-utils"

const COMPRESS_TOOL_DESCRIPTION = loadPrompt("compress-tool-spec")

export function createCompressTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: COMPRESS_TOOL_DESCRIPTION,
        args: {
            topic: tool.schema
                .string()
                .describe("Short label (3-5 words) for display - e.g., 'Auth System Exploration'"),
            content: tool.schema
                .object({
                    startId: tool.schema
                        .string()
                        .describe(
                            "Message or block ID marking the beginning of range (e.g. m0000, b2)",
                        ),
                    endId: tool.schema
                        .string()
                        .describe("Message or block ID marking the end of range (e.g. m0012, b5)"),
                    summary: tool.schema
                        .string()
                        .describe("Complete technical summary replacing all content in range"),
                })
                .describe("Compression details: ID boundaries and replacement summary"),
        },
        async execute(args, toolCtx) {
            const { client, state, logger } = ctx
            const sessionId = toolCtx.sessionID

            await toolCtx.ask({
                permission: "compress",
                patterns: ["*"],
                always: ["*"],
                metadata: {},
            })

            const compressArgs = args as CompressToolArgs
            validateCompressArgs(compressArgs)

            const rawMessages = await fetchSessionMessages(client, sessionId)

            await ensureSessionInitialized(
                client,
                state,
                sessionId,
                logger,
                rawMessages,
                ctx.config.manualMode.enabled,
            )

            assignMessageRefs(state, rawMessages)

            const searchContext = buildSearchContext(state, rawMessages)

            const { startReference, endReference } = resolveBoundaryIds(
                searchContext,
                state,
                compressArgs.content.startId,
                compressArgs.content.endId,
            )

            const range = resolveRange(searchContext, startReference, endReference)
            const anchorMessageId = resolveAnchorMessageId(range.startReference)

            const parsedPlaceholders = parseBlockPlaceholders(compressArgs.content.summary)
            validateSummaryPlaceholders(
                parsedPlaceholders,
                range.requiredBlockIds,
                range.startReference,
                range.endReference,
                searchContext.summaryByBlockId,
            )

            const injected = injectBlockPlaceholders(
                compressArgs.content.summary,
                parsedPlaceholders,
                searchContext.summaryByBlockId,
                range.startReference,
                range.endReference,
            )

            const blockId = allocateBlockId(state.compressSummaries)
            const storedSummary = addCompressedBlockHeader(blockId, injected.expandedSummary)

            state.compressSummaries = upsertCompressedSummary(
                state.compressSummaries,
                blockId,
                anchorMessageId,
                storedSummary,
                injected.consumedBlockIds,
            )

            const compressedMessageIds = range.messageIds.filter(
                (id) => !state.prune.messages.has(id),
            )
            let textTokens = 0
            for (const messageId of compressedMessageIds) {
                const tokenCount = range.messageTokenById.get(messageId) || 0
                textTokens += tokenCount
                state.prune.messages.set(messageId, tokenCount)
            }

            const compressedToolIds = range.toolIds.filter((id) => !state.prune.tools.has(id))
            const toolTokens = getTotalToolTokens(state, compressedToolIds)
            for (const id of compressedToolIds) {
                const entry = state.toolParameters.get(id)
                state.prune.tools.set(id, entry?.tokenCount ?? 0)
            }

            const estimatedCompressedTokens = textTokens + toolTokens
            state.stats.pruneTokenCounter += estimatedCompressedTokens

            const rawStartResult = {
                messageId: getBoundaryMessageId(startReference),
                messageIndex: startReference.rawIndex,
            }
            const rawEndResult = {
                messageId: getBoundaryMessageId(endReference),
                messageIndex: endReference.rawIndex,
            }

            const currentParams = getCurrentParams(state, rawMessages, logger)
            await sendCompressNotification(
                client,
                logger,
                ctx.config,
                state,
                sessionId,
                compressedToolIds,
                compressedMessageIds,
                compressArgs.topic,
                injected.expandedSummary,
                rawStartResult,
                rawEndResult,
                rawMessages.length,
                currentParams,
            )

            state.stats.totalPruneTokens += state.stats.pruneTokenCounter
            state.stats.pruneTokenCounter = 0
            state.nudgeCounter = 0

            await saveSessionState(state, logger)

            return `Compressed ${compressedMessageIds.length} messages (${compressedToolIds.length} tool calls) into summary. The content will be replaced with your summary.`
        },
    })
}

function getBoundaryMessageId(reference: BoundaryReference): string {
    if (reference.kind === "message") {
        if (!reference.messageId) {
            throw new Error("Failed to map boundary matches back to raw messages")
        }
        return reference.messageId
    }

    if (!reference.anchorMessageId) {
        throw new Error("Failed to map boundary matches back to raw messages")
    }
    return reference.anchorMessageId
}
