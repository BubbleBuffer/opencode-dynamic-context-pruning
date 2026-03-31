import type { CompressionTimingState, SessionState, ToolParameterEntry, WithParts } from "./types"
import type { Logger } from "../logger"
import { attachCompressionDuration } from "../compress/state"
import { loadSessionState, saveSessionState } from "./persistence"
import {
    isSubAgentSession,
    findLastCompactionTimestamp,
    countTurns,
    resetOnCompaction,
    createPruneMessagesState,
    loadPruneMessagesState,
    loadPruneMap,
    collectTurnNudgeAnchors,
} from "./utils"
import { getLastUserMessage } from "../messages/query"

function createCompressionTimingState(): CompressionTimingState {
    return {
        startsByCallId: new Map(),
        pendingBySessionId: new Map(),
    }
}

export const checkSession = async (
    client: any,
    state: SessionState,
    logger: Logger,
    messages: WithParts[],
    manualModeDefault: boolean,
): Promise<void> => {
    const lastUserMessage = getLastUserMessage(messages)
    if (!lastUserMessage) {
        return
    }

    const lastSessionId = lastUserMessage.info.sessionID

    if (state.sessionId === null || state.sessionId !== lastSessionId) {
        logger.info(`Session changed: ${state.sessionId} -> ${lastSessionId}`)
        try {
            await ensureSessionInitialized(
                client,
                state,
                lastSessionId,
                logger,
                messages,
                manualModeDefault,
            )
        } catch (err: any) {
            logger.error("Failed to initialize session state", { error: err.message })
        }
    }

    if (state.sessionId === lastSessionId) {
        const applied = applyPendingCompressionDurations(state, lastSessionId)
        if (applied > 0) {
            saveSessionState(state, logger).catch((error) => {
                logger.warn("Failed to persist queued compression time updates", {
                    error: error instanceof Error ? error.message : String(error),
                })
            })
        }
    }

    const lastCompactionTimestamp = findLastCompactionTimestamp(messages)
    if (lastCompactionTimestamp > state.lastCompaction) {
        state.lastCompaction = lastCompactionTimestamp
        resetOnCompaction(state)
        logger.info("Detected compaction - reset stale state", {
            timestamp: lastCompactionTimestamp,
        })

        saveSessionState(state, logger).catch((error) => {
            logger.warn("Failed to persist state reset after compaction", {
                error: error instanceof Error ? error.message : String(error),
            })
        })
    }

    state.currentTurn = countTurns(state, messages)
}

export function createSessionState(): SessionState {
    return {
        sessionId: null,
        isSubAgent: false,
        manualMode: false,
        compressPermission: undefined,
        pendingManualTrigger: null,
        prune: {
            tools: new Map<string, number>(),
            messages: createPruneMessagesState(),
        },
        nudges: {
            contextLimitAnchors: new Set<string>(),
            turnNudgeAnchors: new Set<string>(),
            iterationNudgeAnchors: new Set<string>(),
        },
        stats: {
            pruneTokenCounter: 0,
            totalPruneTokens: 0,
        },
        compressionTiming: createCompressionTimingState(),
        toolParameters: new Map<string, ToolParameterEntry>(),
        subAgentResultCache: new Map<string, string>(),
        toolIdList: [],
        messageIds: {
            byRawId: new Map<string, string>(),
            byRef: new Map<string, string>(),
            nextRef: 1,
        },
        lastCompaction: 0,
        currentTurn: 0,
        variant: undefined,
        modelContextLimit: undefined,
        systemPromptTokens: undefined,
    }
}

export function resetSessionState(state: SessionState): void {
    state.sessionId = null
    state.isSubAgent = false
    state.manualMode = false
    state.compressPermission = undefined
    state.pendingManualTrigger = null
    state.prune = {
        tools: new Map<string, number>(),
        messages: createPruneMessagesState(),
    }
    state.nudges = {
        contextLimitAnchors: new Set<string>(),
        turnNudgeAnchors: new Set<string>(),
        iterationNudgeAnchors: new Set<string>(),
    }
    state.stats = {
        pruneTokenCounter: 0,
        totalPruneTokens: 0,
    }
    state.toolParameters.clear()
    state.subAgentResultCache.clear()
    state.toolIdList = []
    state.messageIds = {
        byRawId: new Map<string, string>(),
        byRef: new Map<string, string>(),
        nextRef: 1,
    }
    state.lastCompaction = 0
    state.currentTurn = 0
    state.variant = undefined
    state.modelContextLimit = undefined
    state.systemPromptTokens = undefined
}

export async function ensureSessionInitialized(
    client: any,
    state: SessionState,
    sessionId: string,
    logger: Logger,
    messages: WithParts[],
    manualModeEnabled: boolean,
): Promise<void> {
    if (state.sessionId === sessionId) {
        return
    }

    // logger.info("session ID = " + sessionId)
    // logger.info("Initializing session state", { sessionId: sessionId })

    resetSessionState(state)
    state.manualMode = manualModeEnabled ? "active" : false
    state.sessionId = sessionId

    const isSubAgent = await isSubAgentSession(client, sessionId)
    state.isSubAgent = isSubAgent
    // logger.info("isSubAgent = " + isSubAgent)

    state.lastCompaction = findLastCompactionTimestamp(messages)
    state.currentTurn = countTurns(state, messages)
    state.nudges.turnNudgeAnchors = collectTurnNudgeAnchors(messages)

    const persisted = await loadSessionState(sessionId, logger)
    if (persisted === null) {
        return
    }

    state.prune.tools = loadPruneMap(persisted.prune.tools)
    state.prune.messages = loadPruneMessagesState(persisted.prune.messages)
    state.nudges.contextLimitAnchors = new Set<string>(persisted.nudges.contextLimitAnchors || [])
    state.nudges.turnNudgeAnchors = new Set<string>([
        ...state.nudges.turnNudgeAnchors,
        ...(persisted.nudges.turnNudgeAnchors || []),
    ])
    state.nudges.iterationNudgeAnchors = new Set<string>(
        persisted.nudges.iterationNudgeAnchors || [],
    )
    state.stats = {
        pruneTokenCounter: persisted.stats?.pruneTokenCounter || 0,
        totalPruneTokens: persisted.stats?.totalPruneTokens || 0,
    }

    const applied = applyPendingCompressionDurations(state, sessionId)
    if (applied > 0) {
        await saveSessionState(state, logger)
    }
}

export function queueCompressionDuration(
    state: SessionState,
    sessionId: string,
    callId: string,
    messageId: string,
    durationMs: number,
): void {
    const queued = state.compressionTiming.pendingBySessionId.get(sessionId) || []
    const filtered = queued.filter((entry) => entry.callId !== callId)
    filtered.push({ callId, messageId, durationMs })
    state.compressionTiming.pendingBySessionId.set(sessionId, filtered)
}

export function applyPendingCompressionDurations(state: SessionState, sessionId: string): number {
    const queued = state.compressionTiming.pendingBySessionId.get(sessionId)
    if (!queued || queued.length === 0) {
        return 0
    }

    let updates = 0
    const remaining = []
    for (const entry of queued) {
        const applied = attachCompressionDuration(
            state.prune.messages,
            entry.callId,
            entry.messageId,
            entry.durationMs,
        )
        if (applied > 0) {
            updates += applied
            continue
        }
        remaining.push(entry)
    }

    if (remaining.length > 0) {
        state.compressionTiming.pendingBySessionId.set(sessionId, remaining)
    } else {
        state.compressionTiming.pendingBySessionId.delete(sessionId)
    }

    return updates
}
