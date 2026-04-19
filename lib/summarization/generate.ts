import type { ModelInfo } from "./types"
import { fetchMessagesUpToRange } from "./fetch"
import { buildSummarizationPrompt } from "./prompt"
import { parseSummariesFromResponse } from "./parse"

export async function generateSummariesForRanges(
    client: any,
    sessionID: string,
    model: ModelInfo,
    ranges: Array<{ startId: string; endId: string }>,
    topic: string,
): Promise<string[]> {
    const summaries: string[] = []

    for (const range of ranges) {
        const messages = await fetchMessagesUpToRange(client, sessionID, range.endId)

        const prompt = buildSummarizationPrompt(messages, topic)

        const response = await client.session.prompt({
            path: { id: sessionID },
            body: {
                model: {
                    providerID: model.providerID,
                    modelID: model.modelID,
                },
                parts: [{ type: "text", text: prompt }],
                noReply: true,
            },
        })

        const parsed = parseSummariesFromResponse(response)
        summaries.push(parsed[0] || "")
    }

    return summaries
}

export function parseModelString(modelString: string): ModelInfo | null {
    const parts = modelString.split("/")
    if (parts.length !== 2) {
        return null
    }

    return {
        providerID: parts[0],
        modelID: parts[1],
    }
}
