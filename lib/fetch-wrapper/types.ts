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
