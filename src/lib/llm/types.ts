export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type LlmToolChoice =
  | { type: "auto" }
  | { type: "tool"; name: string };

export interface LlmChatRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  tool_choice?: LlmToolChoice;
  model?: string;
  max_tokens?: number;
  metadata?: Record<string, string>;
}

export interface LlmChatResponse {
  text: string;
  tool_calls: LlmToolCall[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "other";
}

export interface LlmClient {
  chat(req: LlmChatRequest): Promise<LlmChatResponse>;
}
