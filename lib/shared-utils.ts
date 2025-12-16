import { WithParts } from "./state"

export const getLastUserMessage = (
    messages: WithParts[]
): WithParts | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role === 'user') {
            return msg
        }
    }
    return null
}
