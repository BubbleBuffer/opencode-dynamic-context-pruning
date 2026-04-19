import type { WithParts } from "../state"
import { filterMessages } from "../messages/shape"

export async function fetchMessagesUpToRange(
    client: any,
    sessionID: string,
    endId: string,
): Promise<WithParts[]> {
    const messagesResponse = await client.session.messages({
        path: { id: sessionID },
    })

    const allMessages: WithParts[] = filterMessages(messagesResponse.data || messagesResponse)

    const endIndex = allMessages.findIndex(
        (m: WithParts) =>
            m?.info?.id &&
            (m.info.id === endId ||
                m.info.id === `msg_${endId}` ||
                m.info.id === endId.replace("msg_", "")),
    )

    if (endIndex === -1) {
        return allMessages
    }

    return allMessages.slice(0, endIndex + 1)
}

export function formatMessagesForSummarization(messages: WithParts[]): string {
    return messages
        .map((msg) => {
            const role = msg.info?.role?.toUpperCase() || "UNKNOWN"
            const parts = (msg.parts || [])
                .filter((p: any) => p.type === "text" && !p.ignored)
                .map((p: any) => p.text)
                .join("\n")
            return `[${role}]\n${parts}`
        })
        .join("\n\n---\n\n")
}
