export async function estimateTokensBatch(texts: string[]): Promise<number[]> {
    try {
        const { encode } = await import('gpt-tokenizer')
        return texts.map(text => encode(text).length)
    } catch {
        return texts.map(text => Math.round(text.length / 4))
    }
}

export function formatTokenCount(tokens: number): string {
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`.replace('.0K', 'K')
    }
    return tokens.toString()
}
