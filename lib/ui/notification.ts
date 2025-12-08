import type { Logger } from "../logger"
import type { SessionStats, GCStats } from "../core/janitor"
import type { ToolMetadata } from "../fetch-wrapper/types"
import { formatTokenCount } from "../tokenizer"
import { formatPrunedItemsList } from "./display-utils"

export type PruningSummaryLevel = "off" | "minimal" | "detailed"

export interface NotificationConfig {
    pruningSummary: PruningSummaryLevel
    workingDirectory?: string
}

export interface NotificationContext {
    client: any
    logger: Logger
    config: NotificationConfig
}

export interface NotificationData {
    aiPrunedCount: number
    aiTokensSaved: number
    aiPrunedIds: string[]
    toolMetadata: Map<string, ToolMetadata>
    gcPending: GCStats | null
    sessionStats: SessionStats | null
}

export async function sendUnifiedNotification(
    ctx: NotificationContext,
    sessionID: string,
    data: NotificationData,
    agent?: string
): Promise<boolean> {
    const hasAiPruning = data.aiPrunedCount > 0
    const hasGcActivity = data.gcPending && data.gcPending.toolsDeduped > 0

    if (!hasAiPruning && !hasGcActivity) {
        return false
    }

    if (ctx.config.pruningSummary === 'off') {
        return false
    }

    const message = ctx.config.pruningSummary === 'minimal'
        ? buildMinimalMessage(data)
        : buildDetailedMessage(data, ctx.config.workingDirectory)

    await sendIgnoredMessage(ctx, sessionID, message, agent)
    return true
}

export async function sendIgnoredMessage(
    ctx: NotificationContext,
    sessionID: string,
    text: string,
    agent?: string
): Promise<void> {
    try {
        await ctx.client.session.prompt({
            path: { id: sessionID },
            body: {
                noReply: true,
                agent: agent,
                parts: [{
                    type: 'text',
                    text: text,
                    ignored: true
                }]
            }
        })
    } catch (error: any) {
        ctx.logger.error("notification", "Failed to send notification", { error: error.message })
    }
}

function buildMinimalMessage(data: NotificationData): string {
    const { justNowTokens, totalTokens } = calculateStats(data)
    return formatStatsHeader(totalTokens, justNowTokens)
}

function buildDetailedMessage(data: NotificationData, workingDirectory?: string): string {
    const { justNowTokens, totalTokens } = calculateStats(data)

    let message = formatStatsHeader(totalTokens, justNowTokens)

    if (data.aiPrunedCount > 0) {
        const justNowTokensStr = `~${formatTokenCount(justNowTokens)}`
        message += `\n\n▣ Pruned tools (${justNowTokensStr})`

        const itemLines = formatPrunedItemsList(data.aiPrunedIds, data.toolMetadata, workingDirectory)
        message += '\n' + itemLines.join('\n')
    }

    return message.trim()
}

function calculateStats(data: NotificationData): {
    justNowTokens: number
    totalTokens: number
} {
    const justNowTokens = data.aiTokensSaved + (data.gcPending?.tokensCollected ?? 0)

    const totalTokens = data.sessionStats
        ? data.sessionStats.totalTokensSaved + data.sessionStats.totalGCTokens
        : justNowTokens

    return { justNowTokens, totalTokens }
}

function formatStatsHeader(
    totalTokens: number,
    justNowTokens: number
): string {
    const totalTokensStr = `~${formatTokenCount(totalTokens)}`
    const justNowTokensStr = `~${formatTokenCount(justNowTokens)}`

    const maxTokenLen = Math.max(totalTokensStr.length, justNowTokensStr.length)
    const totalTokensPadded = totalTokensStr.padStart(maxTokenLen)

    return [
        `▣ DCP | ${totalTokensPadded} saved total`,
    ].join('\n')
}
