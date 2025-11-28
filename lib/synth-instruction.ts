export function isIgnoredUserMessage(msg: any): boolean {
    if (!msg || msg.role !== 'user') {
        return false
    }

    if (msg.ignored || msg.info?.ignored) {
        return true
    }

    if (Array.isArray(msg.content) && msg.content.length > 0) {
        const allPartsIgnored = msg.content.every((part: any) => part?.ignored)
        if (allPartsIgnored) {
            return true
        }
    }

    return false
}

export function injectSynthInstruction(messages: any[], instruction: string): boolean {
    // Find the last user message that is not ignored
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.role === 'user' && !isIgnoredUserMessage(msg)) {
            // Avoid double-injecting the same instruction
            if (typeof msg.content === 'string') {
                if (msg.content.includes(instruction)) {
                    return false
                }
                msg.content = msg.content + '\n\n' + instruction
            } else if (Array.isArray(msg.content)) {
                const alreadyInjected = msg.content.some(
                    (part: any) => part?.type === 'text' && typeof part.text === 'string' && part.text.includes(instruction)
                )
                if (alreadyInjected) {
                    return false
                }
                msg.content.push({
                    type: 'text',
                    text: instruction
                })
            }
            return true
        }
    }
    return false
}
