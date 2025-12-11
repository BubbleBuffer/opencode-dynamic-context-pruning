import type { SessionState, ToolParameterEntry } from "./types"
import type { Logger } from "../logger"
import { loadSessionState } from "./persistence"

export function createSessionState(): SessionState {
    return {
        sessionId: null,
        prunedIds: [],
        stats: {
            totalToolsPruned: 0,
            totalTokensSaved: 0,
            totalGCTokens: 0,
            totalGCTools: 0
        },
        gcPending: {
            tokensCollected: 0,
            toolsDeduped: 0
        },
        toolParameters: new Map<string, ToolParameterEntry>()
    }
}

export function resetSessionState(state: SessionState): void {
    state.sessionId = null
    state.prunedIds = []
    state.stats = {
        totalToolsPruned: 0,
        totalTokensSaved: 0,
        totalGCTokens: 0,
        totalGCTools: 0
    }
    state.gcPending = {
        tokensCollected: 0,
        toolsDeduped: 0
    }
    state.toolParameters.clear()
}

export async function ensureSessionInitialized(
    state: SessionState,
    sessionId: string,
    logger: Logger
): Promise<void> {
    if (state.sessionId === sessionId) {
        return;
    }

    // Clear previous session data
    resetSessionState(state)
    state.sessionId = sessionId

    // Load session data from storage
    const persisted = await loadSessionState(sessionId, logger)
    if (persisted === null) {
        return;
    }

    // Populate state with loaded data
    state.prunedIds = persisted.prunedIds || []
    state.stats = {
        totalToolsPruned: persisted.stats.totalToolsPruned || 0,
        totalTokensSaved: persisted.stats.totalTokensSaved || 0,
        totalGCTokens: persisted.stats.totalGCTokens || 0,
        totalGCTools: persisted.stats.totalGCTools || 0
    }
}
