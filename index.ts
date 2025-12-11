import type { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./lib/config"
import { Logger } from "./lib/logger"
import { createSessionState } from "./lib/state"
import { createPruningTool } from "./lib/pruning-tool"
import { createChatMessageTransformHandler } from "./lib/hooks"

const plugin: Plugin = (async (ctx) => {
    const { config, migrations } = getConfig(ctx)

    if (!config.enabled) {
        return {}
    }

    // Suppress AI SDK warnings
    if (typeof globalThis !== 'undefined') {
        (globalThis as any).AI_SDK_LOG_WARNINGS = false
    }

    // Initialize core components
    const logger = new Logger(config.debug)
    const state = createSessionState()

    // Log initialization
    logger.info("plugin", "DCP initialized", {
        strategies: config.strategies,
        model: config.model || "auto"
    })

    // Show migration toast if there were config migrations
    if (migrations.length > 0) {
        setTimeout(async () => {
            try {
                await ctx.client.tui.showToast({
                    body: {
                        title: "DCP: Config upgraded",
                        message: migrations.join('\n'),
                        variant: "info",
                        duration: 8000
                    }
                })
            } catch {
                // Silently ignore toast errors
            }
        }, 7000)
    }

    return {
        "experimental.chat.messages.transform": createChatMessageTransformHandler(),
        tool: config.strategies.onTool.length > 0 ? {
            prune: createPruningTool({
                client: ctx.client,
                state,
                logger,
                config,
                workingDirectory: ctx.directory
            }),
        } : undefined,
    }
}) satisfies Plugin

export default plugin
