import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import type { ModelInfo } from "../summarization/types"
import { generateSummariesForRanges, parseModelString } from "../summarization/generate"

export function createSummarizationHook(client: any, config: PluginConfig, logger: Logger) {
    return async (
        input: { tool: string; sessionID: string; callID: string },
        output: { args: any },
    ) => {
        if (input.tool !== "compress") {
            return
        }

        let model: ModelInfo | null = null

        if (config.compress.summarizationModel) {
            model = parseModelString(config.compress.summarizationModel)
        }

        if (!model) {
            logger.debug("No summarization model configured, using main model")
            return
        }

        const ranges = output.args.content as Array<{ startId: string; endId: string }>
        const topic = output.args.topic as string

        if (!ranges || ranges.length === 0) {
            logger.debug("No ranges to summarize")
            return
        }

        logger.info("Generating summaries via subagent", {
            model: config.compress.summarizationModel,
            rangeCount: ranges.length,
        })

        try {
            const summaries = await generateSummariesForRanges(
                client,
                input.sessionID,
                model,
                ranges,
                topic,
            )

            for (let i = 0; i < ranges.length; i++) {
                output.args.content[i].summary = summaries[i] || "Summary unavailable"
            }

            const modelDisplay = model.modelID.includes("haiku")
                ? "Haiku"
                : model.modelID.split("-")[0]

            await client.session.prompt({
                path: { id: input.sessionID },
                body: {
                    noReply: true,
                    parts: [
                        {
                            type: "text",
                            text: `[Compression completed using ${modelDisplay} model]`,
                        },
                    ],
                },
            })
        } catch (error) {
            logger.error("Summarization failed", { error })
            throw new Error(`Summarization failed: ${(error as Error).message}`)
        }
    }
}
