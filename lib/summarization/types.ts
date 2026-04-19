export interface SummarizationRange {
    startId: string
    endId: string
}

export interface SummarizationResult {
    summary: string
    range: SummarizationRange
}

export interface SummarizationContext {
    sessionID: string
    model: {
        providerID: string
        modelID: string
    }
    topic: string
    ranges: SummarizationRange[]
}

export interface ModelInfo {
    providerID: string
    modelID: string
}
