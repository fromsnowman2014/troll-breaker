import type {
  LlmChatRequest,
  LlmChatResponse,
  LlmClient,
  LlmToolCall,
} from "./types.js";

export type MockResponder = (req: LlmChatRequest) => LlmChatResponse | Promise<LlmChatResponse>;

export class MockLlm implements LlmClient {
  readonly calls: LlmChatRequest[] = [];
  private queue: MockResponder[] = [];

  constructor(initial: MockResponder[] = []) {
    this.queue = [...initial];
  }

  enqueue(responder: MockResponder): void {
    this.queue.push(responder);
  }

  enqueueToolResult(toolName: string, input: unknown): void {
    this.enqueue(() => emitToolCall(toolName, input));
  }

  enqueueText(text: string): void {
    this.enqueue(() => ({ text, tool_calls: [], stop_reason: "end_turn" }));
  }

  async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
    this.calls.push(req);
    const responder = this.queue.shift();
    if (!responder) {
      throw new Error(`MockLlm: no responder queued for call #${this.calls.length}`);
    }
    return await responder(req);
  }
}

export function emitToolCall(name: string, input: unknown): LlmChatResponse {
  const call: LlmToolCall = {
    id: `mock_${name}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    input,
  };
  return { text: "", tool_calls: [call], stop_reason: "tool_use" };
}
