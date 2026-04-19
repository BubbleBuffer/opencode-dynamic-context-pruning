import type { WithParts } from "../state"
import { formatMessagesForSummarization } from "./fetch"

export function buildSummarizationPrompt(messages: WithParts[], topic: string): string {
    const formattedMessages = formatMessagesForSummarization(messages)

    return `Given the following conversation context:

${formattedMessages}

Provide a concise technical summary (2-3 sentences) that captures the key information, decisions, and outcomes. Focus on what would be needed to understand this segment's contribution to the overall task.

Topic: ${topic}

Respond with ONLY the summary text, no prefixes or explanations.`
}
