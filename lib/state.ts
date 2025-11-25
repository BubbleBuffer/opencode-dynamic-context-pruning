// lib/state.ts

export interface SessionStats {
    totalToolsPruned: number
    totalTokensSaved: number
}

export class StateManager {
    private state: Map<string, string[]> = new Map()
    private stats: Map<string, SessionStats> = new Map()

    async get(sessionID: string): Promise<string[]> {
        return this.state.get(sessionID) ?? []
    }

    async set(sessionID: string, prunedIds: string[]): Promise<void> {
        this.state.set(sessionID, prunedIds)
    }

    async getStats(sessionID: string): Promise<SessionStats> {
        return this.stats.get(sessionID) ?? { totalToolsPruned: 0, totalTokensSaved: 0 }
    }

    async addStats(sessionID: string, toolsPruned: number, tokensSaved: number): Promise<SessionStats> {
        const current = await this.getStats(sessionID)
        const updated: SessionStats = {
            totalToolsPruned: current.totalToolsPruned + toolsPruned,
            totalTokensSaved: current.totalTokensSaved + tokensSaved
        }
        this.stats.set(sessionID, updated)
        return updated
    }
}
