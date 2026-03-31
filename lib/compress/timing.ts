import type { SessionState } from "../state/types"
import { attachCompressionDuration } from "./state"

export interface PendingCompressionDuration {
    callId: string
    durationMs: number
}

export interface CompressionTimingState {
    startsByCallId: Map<string, number>
    pendingByCallId: Map<string, PendingCompressionDuration>
}

export function createCompressionTimingState(): CompressionTimingState {
    return {
        startsByCallId: new Map(),
        pendingByCallId: new Map(),
    }
}

export function recordCompressionStart(
    state: SessionState,
    callId: string,
    startedAt: number,
): boolean {
    if (state.compressionTiming.startsByCallId.has(callId)) {
        return false
    }

    state.compressionTiming.startsByCallId.set(callId, startedAt)
    return true
}

export function consumeCompressionStart(state: SessionState, callId: string): number | undefined {
    const start = state.compressionTiming.startsByCallId.get(callId)
    state.compressionTiming.startsByCallId.delete(callId)
    return start
}

export function clearCompressionStart(state: SessionState, callId: string): void {
    state.compressionTiming.startsByCallId.delete(callId)
}

export function resolveCompressionDuration(
    startedAt: number | undefined,
    eventTime: number | undefined,
    partTime: { start?: unknown; end?: unknown } | undefined,
): number | undefined {
    const runningAt =
        typeof partTime?.start === "number" && Number.isFinite(partTime.start)
            ? partTime.start
            : eventTime
    const pendingToRunningMs =
        typeof startedAt === "number" && typeof runningAt === "number"
            ? Math.max(0, runningAt - startedAt)
            : undefined

    const toolStart = partTime?.start
    const toolEnd = partTime?.end
    const runtimeMs =
        typeof toolStart === "number" &&
        Number.isFinite(toolStart) &&
        typeof toolEnd === "number" &&
        Number.isFinite(toolEnd)
            ? Math.max(0, toolEnd - toolStart)
            : undefined

    return typeof pendingToRunningMs === "number" ? pendingToRunningMs : runtimeMs
}

export function queueCompressionDuration(
    state: SessionState,
    callId: string,
    durationMs: number,
): void {
    state.compressionTiming.pendingByCallId.set(callId, { callId, durationMs })
}

export function applyPendingCompressionDurations(state: SessionState): number {
    if (state.compressionTiming.pendingByCallId.size === 0) {
        return 0
    }

    let updates = 0
    for (const [callId, entry] of state.compressionTiming.pendingByCallId) {
        const applied = attachCompressionDuration(
            state.prune.messages,
            entry.callId,
            entry.durationMs,
        )
        if (applied > 0) {
            updates += applied
            state.compressionTiming.pendingByCallId.delete(callId)
        }
    }

    return updates
}
