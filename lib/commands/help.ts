/**
 * DCP Help command handler.
 * Shows available DCP commands and their descriptions.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../strategies/utils"

export interface HelpCommandContext {
    client: any
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

function formatHelpMessage(manualMode: boolean): string {
    const lines: string[] = []

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                      DCP Commands                         │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push(`  Manual mode:      ${manualMode ? "ON" : "OFF"}`)
    lines.push("")
    lines.push("  /dcp context      Show token usage breakdown for current session")
    lines.push("  /dcp stats        Show DCP pruning statistics")
    lines.push("  /dcp sweep [n]    Prune tools since last user message, or last n tools")
    lines.push("  /dcp manual [on|off]  Toggle manual mode or set explicit state")
    lines.push("  /dcp prune        Trigger manual prune tool execution")
    lines.push("  /dcp distill      Trigger manual distill tool execution")
    lines.push("  /dcp compress     Trigger manual compress tool execution")
    lines.push("")

    return lines.join("\n")
}

export async function handleHelpCommand(ctx: HelpCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const message = formatHelpMessage(state.manualMode)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Help command executed")
}
