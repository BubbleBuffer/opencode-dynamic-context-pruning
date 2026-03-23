import assert from "node:assert/strict"
import test from "node:test"
import { assignMessageRefs } from "../lib/message-ids"
import { buildPriorityMap } from "../lib/messages/priority"
import { injectMessageIds } from "../lib/messages/inject/inject"
import { applyAnchoredNudges } from "../lib/messages/inject/utils"
import { stripHallucinationsFromString } from "../lib/messages/utils"
import { createSessionState, type WithParts } from "../lib/state"
import type { PluginConfig } from "../lib/config"
import { createTextCompleteHandler } from "../lib/hooks"

function buildConfig(): PluginConfig {
    return {
        enabled: true,
        debug: false,
        pruneNotification: "off",
        pruneNotificationType: "chat",
        commands: {
            enabled: true,
            protectedTools: [],
        },
        manualMode: {
            enabled: false,
            automaticStrategies: true,
        },
        turnProtection: {
            enabled: false,
            turns: 4,
        },
        experimental: {
            allowSubAgents: false,
            customPrompts: false,
        },
        protectedFilePatterns: [],
        compress: {
            mode: "message",
            permission: "allow",
            showCompression: false,
            maxContextLimit: 150000,
            minContextLimit: 50000,
            nudgeFrequency: 5,
            iterationNudgeThreshold: 15,
            nudgeForce: "soft",
            protectedTools: ["task"],
            protectUserMessages: false,
        },
        strategies: {
            deduplication: {
                enabled: true,
                protectedTools: [],
            },
            purgeErrors: {
                enabled: true,
                turns: 4,
                protectedTools: [],
            },
        },
    }
}

function textPart(messageID: string, sessionID: string, id: string, text: string) {
    return {
        id,
        messageID,
        sessionID,
        type: "text" as const,
        text,
    }
}

function buildMessage(
    id: string,
    role: "user" | "assistant",
    sessionID: string,
    text: string,
    created: number,
): WithParts {
    const info =
        role === "user"
            ? {
                  id,
                  role,
                  sessionID,
                  agent: "assistant",
                  model: {
                      providerID: "anthropic",
                      modelID: "claude-test",
                  },
                  time: { created },
              }
            : {
                  id,
                  role,
                  sessionID,
                  agent: "assistant",
                  time: { created },
              }

    return {
        info: info as WithParts["info"],
        parts: [textPart(id, sessionID, `${id}-part`, text)],
    }
}

function repeatedWord(word: string, count: number): string {
    return Array.from({ length: count }, () => word).join(" ")
}

test("injectMessageIds adds priority attributes in message mode", () => {
    const sessionID = "ses_message_priority_tags"
    const messages: WithParts[] = [
        buildMessage("msg-user-1", "user", sessionID, repeatedWord("investigate", 6000), 1),
        buildMessage("msg-assistant-1", "assistant", sessionID, "Short follow-up note.", 2),
    ]
    const state = createSessionState()
    const config = buildConfig()

    assignMessageRefs(state, messages)
    const compressionPriorities = buildPriorityMap(config, state, messages)

    injectMessageIds(state, config, messages, compressionPriorities)

    const userTag = messages[0]?.parts[messages[0].parts.length - 1]
    const assistantTag = messages[1]?.parts[messages[1].parts.length - 1]

    assert.equal(userTag?.type, "text")
    assert.equal(assistantTag?.type, "text")
    assert.match((userTag as any).text, /<dcp-message-id priority="high">m0001<\/dcp-message-id>/)
    assert.match(
        (assistantTag as any).text,
        /<dcp-message-id priority="low">m0002<\/dcp-message-id>/,
    )
})

test("message-mode nudges list only earlier visible high-priority message IDs", () => {
    const sessionID = "ses_message_priority_nudges"
    const messages: WithParts[] = [
        buildMessage("msg-user-1", "user", sessionID, repeatedWord("alpha", 6000), 1),
        buildMessage("msg-assistant-1", "assistant", sessionID, repeatedWord("beta", 6000), 2),
        buildMessage("msg-user-2", "user", sessionID, repeatedWord("gamma", 6000), 3),
        buildMessage("msg-assistant-2", "assistant", sessionID, repeatedWord("delta", 6000), 4),
    ]
    const state = createSessionState()
    const config = buildConfig()

    assignMessageRefs(state, messages)
    state.prune.messages.byMessageId.set("msg-assistant-1", {
        tokenCount: 999,
        allBlockIds: [1],
        activeBlockIds: [1],
    })
    state.nudges.contextLimitAnchors.add("msg-user-2")

    const compressionPriorities = buildPriorityMap(config, state, messages)

    applyAnchoredNudges(
        state,
        config,
        messages,
        {
            system: "",
            compressRange: "",
            compressMessage: "",
            contextLimitNudge: "<dcp-system-reminder>Base context nudge</dcp-system-reminder>",
            turnNudge: "<dcp-system-reminder>Base turn nudge</dcp-system-reminder>",
            iterationNudge: "<dcp-system-reminder>Base iteration nudge</dcp-system-reminder>",
        },
        compressionPriorities,
    )

    const injectedNudge = messages[2]?.parts[messages[2].parts.length - 1]
    assert.equal(injectedNudge?.type, "text")
    assert.match((injectedNudge as any).text, /Message priority context:/)
    assert.match((injectedNudge as any).text, /High-priority message IDs before this point: m0001/)
    assert.doesNotMatch((injectedNudge as any).text, /m0002/)
    assert.doesNotMatch((injectedNudge as any).text, /m0003/)
    assert.doesNotMatch((injectedNudge as any).text, /m0004/)
})

test("hallucination stripping removes exact metadata tags and preserves lookalikes", async () => {
    const text =
        'alpha<dcp-message-id priority="high">m0007</dcp-message-id>' +
        '<dcp-message-id-extra priority="high">m0008</dcp-message-id-extra>' +
        '<dcp-system-reminder kind="nudge">remove this</dcp-system-reminder>' +
        "<dcp-system-reminder-extra>keep this</dcp-system-reminder-extra>" +
        "omega"

    assert.equal(
        stripHallucinationsFromString(text),
        'alpha<dcp-message-id-extra priority="high">m0008</dcp-message-id-extra><dcp-system-reminder-extra>keep this</dcp-system-reminder-extra>omega',
    )

    const handler = createTextCompleteHandler()
    const output = { text }
    await handler({ sessionID: "session", messageID: "message", partID: "part" }, output)
    assert.equal(
        output.text,
        'alpha<dcp-message-id-extra priority="high">m0008</dcp-message-id-extra><dcp-system-reminder-extra>keep this</dcp-system-reminder-extra>omega',
    )
})
