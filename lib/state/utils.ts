import type { PruneOrigin, SessionState, WithParts } from "./types"
import { isMessageCompacted } from "../shared-utils"

export async function isSubAgentSession(client: any, sessionID: string): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        return !!result.data?.parentID
    } catch (error: any) {
        return false
    }
}

export function findLastCompactionTimestamp(messages: WithParts[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role === "assistant" && msg.info.summary === true) {
            return msg.info.time.created
        }
    }
    return 0
}

export function countTurns(state: SessionState, messages: WithParts[]): number {
    let turnCount = 0
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type === "step-start") {
                turnCount++
            }
        }
    }
    return turnCount
}

export function loadPruneMap(
    obj?: Record<string, number>,
    legacyArr?: string[],
): Map<string, number> {
    if (obj) return new Map(Object.entries(obj))
    if (legacyArr) return new Map(legacyArr.map((id) => [id, 0]))
    return new Map()
}

export function loadPruneOriginMap(obj?: Record<string, PruneOrigin>): Map<string, PruneOrigin> {
    if (!obj || typeof obj !== "object") {
        return new Map()
    }

    const entries: [string, PruneOrigin][] = []
    for (const [toolId, origin] of Object.entries(obj)) {
        if (
            origin &&
            typeof origin === "object" &&
            typeof origin.source === "string" &&
            typeof origin.originMessageId === "string" &&
            origin.originMessageId.length > 0
        ) {
            entries.push([toolId, origin])
        }
    }

    return new Map(entries)
}

export function resetOnCompaction(state: SessionState): void {
    state.toolParameters.clear()
    state.prune.tools = new Map<string, number>()
    state.prune.messages = new Map<string, number>()
    state.prune.origins = new Map()
    state.compressSummaries = []
    state.messageIds = {
        byRawId: new Map<string, string>(),
        byRef: new Map<string, string>(),
        nextRef: 0,
    }
    state.nudgeCounter = 0
    state.lastToolPrune = false
}
