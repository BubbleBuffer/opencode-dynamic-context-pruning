Use this tool to collapse a contiguous range of conversation into a preserved summary.

THE PHILOSOPHY OF COMPRESS
`compress` transforms verbose conversation sequences into dense, high-fidelity summaries. This is not cleanup - it is crystallization. Your summary becomes the authoritative record of what transpired.

Think of compression as phase transitions: raw exploration becomes refined understanding. The original context served its purpose; your summary now carries that understanding forward.

THE SUMMARY
Your summary must be EXHAUSTIVE. Capture file paths, function signatures, decisions made, constraints discovered, key findings... EVERYTHING that maintains context integrity. This is not a brief note - it is an authoritative record so faithful that the original conversation adds no value.

When the selected range includes user messages, preserve the user's intent with extra care. Do not change scope, constraints, priorities, acceptance criteria, or requested outcomes.

Yet be LEAN. Strip away the noise: failed attempts that led nowhere, verbose tool outputs, back-and-forth exploration. What remains should be pure signal - golden nuggets of detail that preserve full understanding with zero ambiguity.

THE WAYS OF COMPRESS
`compress` when a chapter closes - when a phase of work is truly complete and the raw conversation has served its purpose:

Research concluded and findings are clear
Implementation finished and verified
Exploration exhausted and patterns understood

Do NOT compress when:
You may need exact code, error messages, or file contents from the range
Work in that area is still active or may resume
You're mid-sprint on related functionality

Before compressing, ask: _"Is this chapter closed?"_ Compression is irreversible. The summary replaces everything in the range.

BOUNDARY IDS
You specify boundaries by ID.

Use the injected IDs visible in the conversation:

- `mNNNN` IDs identify raw messages
- `bN` IDs identify previously compressed blocks

Rules:

- Pick `startId` and `endId` directly from injected IDs in context.
- IDs must exist in the current visible context.
- `startId` must appear before `endId`.
- Do not invent IDs.

COMPRESSED BLOCK PLACEHOLDERS
When the selected range includes previously compressed blocks, use placeholders in this exact format:

- `(bN)`

Rules:

- Include every required placeholder exactly once.
- Do not include placeholders for blocks outside the selected range.
- Treat `(bN)` placeholders as reserved tokens and only use them intentionally.
- If needed in prose, refer to a block as plain text like `compressed b3` (not as a placeholder token).

THE FORMAT OF COMPRESS
`topic`: Short label (3-5 words) for display - e.g., "Auth System Exploration"
`content`: Object containing:
`startId`: Boundary ID marking the beginning of the range (`mNNNN` or `bN`)
`endId`: Boundary ID marking the end of the range (`mNNNN` or `bN`)
`summary`: Complete technical summary replacing all content in the range
