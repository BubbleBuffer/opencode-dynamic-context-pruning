import type { SessionState, WithParts } from "./state"
import type { Logger } from "./logger"
import type { PluginConfig } from "./config"
import { syncToolCache } from "./state/tool-cache"
import { deduplicate } from "./strategies"
import { prune, insertPruneToolContext } from "./messages"
import { checkSession } from "./state"


export function createChatMessageTransformHandler(
    client: any,
    state: SessionState,
    logger: Logger,
    config: PluginConfig
) {
    return async(
        input: {},
        output: { messages: WithParts[] }
    ) => {
        checkSession(client, state, logger, output.messages);
        if (state.isSubAgent) {
            return
        }

        syncToolCache(state, config, logger, output.messages);

        deduplicate(state, logger, config, output.messages)

        prune(state, logger, config, output.messages)

        insertPruneToolContext(state, config, logger, output.messages)
    }
}

export function createEventHandler(
    client: any,
    config: PluginConfig,
    state: SessionState,
    logger: Logger
) {
    return async (
        { event }: { event: any }
    ) => {
        if (state.sessionId === null || state.isSubAgent) {
            return
        }

        if (event.type === "session.status" && event.properties.status.type === "idle") {
            if (!config.strategies.onIdle.enabled) {
                return
            }
        }
    }
}
