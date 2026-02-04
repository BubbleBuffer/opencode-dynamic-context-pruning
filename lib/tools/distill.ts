import { tool } from "@opencode-ai/plugin"
import type { PruneToolContext } from "./types"
import { executePruneOperation } from "./prune-shared"
import { PruneReason } from "../ui/notification"
import { loadPrompt } from "../prompts"

const DISTILL_TOOL_DESCRIPTION = loadPrompt("distill-tool-spec")

export function createDistillTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: DISTILL_TOOL_DESCRIPTION,
        args: {
            items: tool.schema
                .array(
                    tool.schema.object({
                        id: tool.schema
                            .string()
                            .describe("Numeric ID from the <prunable-tools> list"),
                        distillation: tool.schema
                            .string()
                            .describe("Complete technical distillation for this tool output"),
                    }),
                )
                .describe(
                    "Array of distillation entries, each pairing an ID with its distillation",
                ),
        },
        async execute(args, toolCtx) {
            if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
                ctx.logger.debug("Distill tool called without items: " + JSON.stringify(args))
                throw new Error("Missing items. Provide at least one { id, distillation } entry.")
            }

            for (const item of args.items) {
                if (!item.id || typeof item.id !== "string" || item.id.trim() === "") {
                    ctx.logger.debug("Distill item missing id: " + JSON.stringify(item))
                    throw new Error(
                        "Each item must have an id (numeric string from <prunable-tools>).",
                    )
                }
                if (!item.distillation || typeof item.distillation !== "string") {
                    ctx.logger.debug("Distill item missing distillation: " + JSON.stringify(item))
                    throw new Error("Each item must have a distillation string.")
                }
            }

            const ids = args.items.map((item) => item.id)
            const distillations = args.items.map((item) => item.distillation)

            return executePruneOperation(
                ctx,
                toolCtx,
                ids,
                "extraction" as PruneReason,
                "Distill",
                distillations,
            )
        },
    })
}
