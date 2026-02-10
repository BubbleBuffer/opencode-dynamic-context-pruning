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

const HELP_COMMANDS: [string, string][] = [
    ["/dcp context", "Show token usage breakdown for current session"],
    ["/dcp stats", "Show DCP pruning statistics"],
    ["/dcp sweep [n]", "Prune tools since last user message, or last n tools"],
    ["/dcp manual [on|off]", "Toggle manual mode or set explicit state"],
    ["/dcp prune [focus]", "Trigger manual prune tool execution"],
    ["/dcp distill [focus]", "Trigger manual distill tool execution"],
    ["/dcp compress [focus]", "Trigger manual compress tool execution"],
]

function formatHelpMessage(manualMode: boolean): string {
    const colWidth = Math.max(...HELP_COMMANDS.map(([cmd]) => cmd.length)) + 4
    const lines: string[] = []

    lines.push("╭─────────────────────────────────────────────────────────────────────────╮")
    lines.push("│                              DCP Commands                               │")
    lines.push("╰─────────────────────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push(`  ${"Manual mode:".padEnd(colWidth)}${manualMode ? "ON" : "OFF"}`)
    lines.push("")
    for (const [cmd, desc] of HELP_COMMANDS) {
        lines.push(`  ${cmd.padEnd(colWidth)}${desc}`)
    }
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
