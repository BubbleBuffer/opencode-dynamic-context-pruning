import type { FetchHandlerContext, FetchHandlerResult } from "./types"
import {
    PRUNED_CONTENT_MESSAGE,
    getAllPrunedIds,
    fetchSessionMessages,
    getMostRecentActiveSession
} from "./types"
import { cacheToolParametersFromInput } from "../state/tool-cache"
import { injectSynthResponses, trackNewToolResultsResponses } from "../api-formats/synth-instruction"
import { buildPrunableToolsList, buildEndInjection, injectPrunableListResponses } from "../api-formats/prunable-list"

/**
 * Handles OpenAI Responses API format (body.input array with function_call_output items).
 * Used by GPT-5 models via sdk.responses().
 */
export async function handleOpenAIResponses(
    body: any,
    ctx: FetchHandlerContext,
    inputUrl: string
): Promise<FetchHandlerResult> {
    if (!body.input || !Array.isArray(body.input)) {
        return { modified: false, body }
    }

    cacheToolParametersFromInput(body.input, ctx.state, ctx.logger)

    let modified = false

    if (ctx.config.strategies.onTool.length > 0) {
        if (injectSynthResponses(body.input, ctx.prompts.synthInstruction, ctx.prompts.nudgeInstruction)) {
            modified = true
        }

        const sessionId = ctx.state.lastSeenSessionId
        if (sessionId) {
            const toolIds = Array.from(ctx.state.toolParameters.keys())
            const alreadyPruned = ctx.state.prunedIds.get(sessionId) ?? []
            const alreadyPrunedLower = new Set(alreadyPruned.map(id => id.toLowerCase()))
            const unprunedIds = toolIds.filter(id => !alreadyPrunedLower.has(id.toLowerCase()))

            const { list: prunableList, numericIds } = buildPrunableToolsList(
                sessionId,
                unprunedIds,
                ctx.state.toolParameters,
                ctx.config.protectedTools
            )

            if (prunableList) {
                const protectedSet = new Set(ctx.config.protectedTools)
                trackNewToolResultsResponses(body.input, ctx.toolTracker, protectedSet)
                const includeNudge = ctx.config.nudge_freq > 0 && ctx.toolTracker.toolResultCount > ctx.config.nudge_freq

                const endInjection = buildEndInjection(prunableList, includeNudge)
                if (injectPrunableListResponses(body.input, endInjection)) {
                    ctx.logger.debug("fetch", "Injected prunable tools list (Responses API)", {
                        ids: numericIds,
                        nudge: includeNudge,
                        toolsSincePrune: ctx.toolTracker.toolResultCount
                    })
                    modified = true
                }
            }
        }
    }

    const functionOutputs = body.input.filter((item: any) => item.type === 'function_call_output')

    if (functionOutputs.length === 0) {
        return { modified, body }
    }

    const { allSessions, allPrunedIds } = await getAllPrunedIds(ctx.client, ctx.state, ctx.logger)

    if (allPrunedIds.size === 0) {
        return { modified, body }
    }

    const protectedToolsLower = new Set(ctx.config.protectedTools.map(t => t.toLowerCase()))
    let prunableFunctionOutputCount = 0
    for (const item of functionOutputs) {
        const toolName = item.name?.toLowerCase()
        if (!toolName || !protectedToolsLower.has(toolName)) {
            prunableFunctionOutputCount++
        }
    }

    let replacedCount = 0

    body.input = body.input.map((item: any) => {
        if (item.type === 'function_call_output' && allPrunedIds.has(item.call_id?.toLowerCase())) {
            replacedCount++
            return {
                ...item,
                output: PRUNED_CONTENT_MESSAGE
            }
        }
        return item
    })

    if (replacedCount > 0) {
        ctx.logger.info("fetch", "Replaced pruned tool outputs (Responses API)", {
            replaced: replacedCount,
            total: prunableFunctionOutputCount
        })

        if (ctx.logger.enabled) {
            const mostRecentSession = getMostRecentActiveSession(allSessions)
            const sessionMessages = mostRecentSession
                ? await fetchSessionMessages(ctx.client, mostRecentSession.id)
                : undefined

            await ctx.logger.saveWrappedContext(
                "global",
                body.input,
                {
                    url: inputUrl,
                    replacedCount,
                    totalItems: body.input.length,
                    format: 'openai-responses-api'
                },
                sessionMessages
            )
        }

        return { modified: true, body }
    }

    return { modified, body }
}
