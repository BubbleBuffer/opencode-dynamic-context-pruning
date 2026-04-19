export function parseSummariesFromResponse(response: any): string[] {
    try {
        const data = response?.data || response

        const parts = data?.parts || data?.content || []

        if (!Array.isArray(parts) || parts.length === 0) {
            return []
        }

        const textPart = parts.find((p: any) => p.type === "text")

        if (!textPart?.text) {
            return []
        }

        const summaries = textPart.text
            .split(/\n\n+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)

        return summaries
    } catch {
        return []
    }
}
