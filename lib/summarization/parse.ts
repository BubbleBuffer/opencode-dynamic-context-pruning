export function parseSummariesFromResponse(response: any): string[] {
    const data = response?.data || response

    const parts = data?.parts || data?.content || []

    if (!Array.isArray(parts) || parts.length === 0) {
        throw new Error("No content in summarization response")
    }

    const textPart = parts.find((p: any) => p.type === "text")

    if (!textPart?.text) {
        throw new Error("No text content in summarization response")
    }

    const summaries = textPart.text
        .split(/\n\n+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)

    return summaries
}
