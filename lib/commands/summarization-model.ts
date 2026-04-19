import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { parseModelString } from "../summarization/generate"
import type { PluginConfig } from "../config"

export interface SummarizationModelCommandContext {
    client: any
    state: SessionState
    config: PluginConfig
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

export async function handleSummarizationModelCommand(
    ctx: SummarizationModelCommandContext,
    args: string[],
): Promise<{ output?: string }> {
    const { client, config, logger, sessionId } = ctx

    if (args.length === 0) {
        const current = config.compress.summarizationModel
        if (current) {
            return { output: `Summarization model: ${current}` }
        } else {
            return { output: "Summarization model: not configured (using main conversation model)" }
        }
    }

    const modelString = args[0]
    const parsed = parseModelString(modelString)

    if (!parsed) {
        return {
            output: `Invalid model format: ${modelString}. Use provider/model format (e.g., 'anthropic/claude-haiku-3.5-20250514')`,
        }
    }

    config.compress.summarizationModel = modelString

    logger.info("Summarization model set", { model: modelString })

    return {
        output: `Summarization model set to: ${modelString}`,
    }
}
