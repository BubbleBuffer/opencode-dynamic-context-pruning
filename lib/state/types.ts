export interface ToolParameterEntry {
    tool: string
    parameters: any
    status?: "pending" | "running" | "completed" | "error"
    error?: string
}

export interface GCStats {
    tokensCollected: number
    toolsDeduped: number
}

export interface SessionStats {
    totalToolsPruned: number
    totalTokensSaved: number
    totalGCTokens: number
    totalGCTools: number
}

export interface SessionState {
    sessionId: string | null
    prunedIds: string[]
    stats: SessionStats
    gcPending: GCStats
    toolParameters: Map<string, ToolParameterEntry>
}
