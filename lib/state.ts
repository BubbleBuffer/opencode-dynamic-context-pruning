import type { SessionStats } from "./janitor"

/**
 * Centralized state management for the DCP plugin.
 * All mutable state is stored here and shared across modules.
 */
export interface PluginState {
    /** Map of session IDs to arrays of pruned tool call IDs */
    prunedIds: Map<string, string[]>
    /** Map of session IDs to session statistics */
    stats: Map<string, SessionStats>
    /** Cache of tool call IDs to their parameters */
    toolParameters: Map<string, ToolParameterEntry>
    /** Cache of session IDs to their model info */
    model: Map<string, ModelInfo>
    /** 
     * Maps Google/Gemini tool positions to OpenCode tool call IDs for correlation.
     * Key: sessionID, Value: Map<positionKey, toolCallId> where positionKey is "toolName:index"
     */
    googleToolCallMapping: Map<string, Map<string, string>>
}

export interface ToolParameterEntry {
    tool: string
    parameters: any
}

export interface ModelInfo {
    providerID: string
    modelID: string
}

/**
 * Creates a fresh plugin state instance.
 */
export function createPluginState(): PluginState {
    return {
        prunedIds: new Map(),
        stats: new Map(),
        toolParameters: new Map(),
        model: new Map(),
        googleToolCallMapping: new Map(),
    }
}
