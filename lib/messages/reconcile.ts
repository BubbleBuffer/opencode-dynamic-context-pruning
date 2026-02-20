import type { SessionState, WithParts } from "../state"
import type { Logger } from "../logger"

export const reconcilePruneOrigins = (
    state: SessionState,
    logger: Logger,
    messages: WithParts[],
): void => {
    if (!state.prune.origins?.size) {
        return
    }

    const messageIds = new Set(messages.map((msg) => msg.info.id))
    let removedToolCount = 0
    let removedOriginCount = 0

    for (const [toolId, origin] of state.prune.origins.entries()) {
        if (!state.prune.tools.has(toolId)) {
            state.prune.origins.delete(toolId)
            removedOriginCount++
            continue
        }

        if (!messageIds.has(origin.originMessageId)) {
            state.prune.origins.delete(toolId)
            removedOriginCount++
            if (state.prune.tools.delete(toolId)) {
                removedToolCount++
            }
        }
    }

    if (removedToolCount > 0 || removedOriginCount > 0) {
        logger.info("Reconciled prune origins", {
            removedToolCount,
            removedOriginCount,
        })
    }
}
