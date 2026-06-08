import { AppError } from "../schemas/errors.js";
import type { LlmChatRequest, LlmChatResponse, LlmClient } from "./types.js";

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * Anthropic adapter — wire-format stub.
 *
 * Real implementation must:
 *   - POST to {baseUrl}/v1/messages with the official message + tool_use shapes.
 *   - Map cache_control markers per PROMPT_GUIDELINES.md §5.
 *   - Surface 429 / 5xx as `AppError("llm_unreachable", ...)`.
 *
 * Left as a stub here so the rest of the agent code is exercisable via MockLlm.
 */
export class AnthropicLlm implements LlmClient {
  constructor(private readonly cfg: AnthropicConfig) {}

  async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
    if (!this.cfg.apiKey) {
      throw new AppError("no_api_key", "Anthropic API key is not configured");
    }
    throw new AppError(
      "llm_unreachable",
      "AnthropicLlm.chat is not implemented; wire the real Anthropic SDK call here",
    );
  }
}
