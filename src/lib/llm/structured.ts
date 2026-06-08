import type { z } from "zod";
import { SchemaValidationError } from "../schemas/errors.js";
import type { LlmChatRequest, LlmClient, LlmToolDef } from "./types.js";

const EMIT_TOOL_NAME = "emit_result";

/**
 * Force structured output via tool-use, per PROMPT_GUIDELINES.md §4.
 *
 * On first parse failure, retry once with the validation error appended as an
 * assistant correction message. On second failure, throw SchemaValidationError.
 */
export async function structuredChat<S extends z.ZodTypeAny>(
  llm: LlmClient,
  schema: S,
  inputSchema: Record<string, unknown>,
  req: Omit<LlmChatRequest, "tools" | "tool_choice">,
  agentName: string,
): Promise<z.output<S>> {
  const emitTool: LlmToolDef = {
    name: EMIT_TOOL_NAME,
    description: `Emit the final ${agentName} result conforming to the schema.`,
    input_schema: inputSchema,
  };

  const baseReq: LlmChatRequest = {
    ...req,
    tools: [emitTool],
    tool_choice: { type: "tool", name: EMIT_TOOL_NAME },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.chat(baseReq);
    const call = res.tool_calls.find((c) => c.name === EMIT_TOOL_NAME);
    if (!call) {
      lastError = new Error("model did not emit the result tool");
      baseReq.messages = [
        ...baseReq.messages,
        {
          role: "assistant",
          content: `You must call the ${EMIT_TOOL_NAME} tool with structured input. Try again.`,
        },
      ];
      continue;
    }
    const parsed = schema.safeParse(call.input);
    if (parsed.success) {
      return parsed.data;
    }
    lastError = parsed.error;
    baseReq.messages = [
      ...baseReq.messages,
      {
        role: "assistant",
        content: `Previous output failed schema validation: ${parsed.error.message}. Re-emit with valid shape.`,
      },
    ];
  }

  throw new SchemaValidationError(agentName, lastError);
}
