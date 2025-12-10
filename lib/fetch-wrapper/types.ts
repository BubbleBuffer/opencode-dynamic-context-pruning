import type { PluginState } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import type { ToolTracker } from "./tool-tracker"
export type { ToolTracker } from "./tool-tracker"

export interface ToolOutput {
    id: string
    toolName?: string
}

export interface ToolMetadata {
    tool: string
    parameters?: any
}

export interface FormatDescriptor {
    name: string
    detect(body: any): boolean
    getDataArray(body: any): any[] | undefined
    injectSystemMessage(body: any, injection: string): boolean
    appendUserMessage?(body: any, injection: string): boolean
    extractToolOutputs(data: any[], state: PluginState): ToolOutput[]
    replaceToolOutput(data: any[], toolId: string, prunedMessage: string, state: PluginState): boolean
    hasToolOutputs(data: any[]): boolean
    getLogMetadata(data: any[], replacedCount: number, inputUrl: string): Record<string, any>
}

export interface FetchHandlerContext {
    state: PluginState
    logger: Logger
    client: any
    config: PluginConfig
    toolTracker: ToolTracker
}

export interface FetchHandlerResult {
    modified: boolean
    body: any
}

export interface PrunedIdData {
    allSessions: any
    allPrunedIds: Set<string>
}

/** The 3 scenarios that trigger explicit LLM pruning */
export type PruneReason = "completion" | "noise" | "consolidation"

/** Human-readable labels for prune reasons */
export const PRUNE_REASON_LABELS: Record<PruneReason, string> = {
    completion: "Task Complete",
    noise: "Noise Removal",
    consolidation: "Consolidation"
}

export interface SessionStats {
    totalToolsPruned: number
    totalTokensSaved: number
    totalGCTokens: number
    totalGCTools: number
}

export interface GCStats {
    tokensCollected: number
    toolsDeduped: number
}

export interface PruningResult {
    prunedCount: number
    tokensSaved: number
    llmPrunedIds: string[]
    toolMetadata: Map<string, ToolMetadata>
    sessionStats: SessionStats
    reason?: PruneReason
}
