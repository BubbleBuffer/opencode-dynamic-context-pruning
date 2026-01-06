import { SessionState, WithParts } from "./state"

export const isMessageCompacted = (state: SessionState, msg: WithParts): boolean => {
    return msg.info.time.created < state.lastCompaction
}

export const getLastUserMessage = (messages: WithParts[]): WithParts | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role === "user") {
            return msg
        }
    }
    return null
}

export const findUserVariant = (messages: WithParts[]): string | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role === "user") {
            const variant = (msg.info as any).variant
            if (variant !== undefined && variant !== null) {
                return variant
            }
        }
    }
    return undefined
}
