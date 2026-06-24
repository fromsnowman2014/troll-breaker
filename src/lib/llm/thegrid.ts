import { AppError } from "../schemas/errors.js";
import type {
  LlmChatRequest,
  LlmChatResponse,
  LlmClient,
  LlmToolCall,
  LlmToolDef,
} from "./types.js";

export interface TheGridConfig {
  /** Full URL to the proxy endpoint, e.g. https://troll-breaker-browser.vercel.app/api/chat */
  proxyUrl: string;
  defaultModel?: string;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

interface OpenAiToolCall {
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

interface OpenAiMessage {
  role?: string;
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}

interface OpenAiChoice {
  message?: OpenAiMessage;
  finish_reason?: string;
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
  error?: { message?: string };
}

const DEFAULT_MODEL = "text-prime";

export class TheGridLlm implements LlmClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: TheGridConfig) {
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
    const body = buildRequestBody(req, this.cfg.defaultModel ?? DEFAULT_MODEL);

    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AppError("llm_unreachable", `TheGrid proxy fetch failed: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new AppError(
        "llm_unreachable",
        `TheGrid proxy returned ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as OpenAiResponse;
    if (json.error) {
      throw new AppError("llm_unreachable", `TheGrid error: ${json.error.message ?? "unknown"}`);
    }

    return mapResponse(json, requestedToolName(req));
  }
}

function buildRequestBody(req: LlmChatRequest, defaultModel: string): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: req.system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const body: Record<string, unknown> = {
    model: req.model ?? defaultModel,
    messages,
  };

  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map(toOpenAiTool);
    if (req.tool_choice) {
      body.tool_choice =
        req.tool_choice.type === "tool"
          ? { type: "function", function: { name: req.tool_choice.name } }
          : "auto";
    }
  }

  return body;
}

function toOpenAiTool(t: LlmToolDef): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  };
}

function requestedToolName(req: LlmChatRequest): string | undefined {
  if (req.tool_choice?.type === "tool") return req.tool_choice.name;
  return undefined;
}

function mapResponse(json: OpenAiResponse, forcedToolName: string | undefined): LlmChatResponse {
  const choice = json.choices?.[0];
  const message = choice?.message;
  const text = message?.content ?? "";
  const tool_calls: LlmToolCall[] = [];

  const rawCalls = message?.tool_calls ?? [];
  for (let i = 0; i < rawCalls.length; i++) {
    const c = rawCalls[i];
    const name = c?.function?.name;
    if (!name) continue;
    tool_calls.push({
      id: c?.id ?? `thegrid_${name}_${i}`,
      name,
      input: safeParseJson(c?.function?.arguments) ?? {},
    });
  }

  // Defensive fallback: if a tool was forced but the model returned JSON in `content` instead,
  // synthesize one tool call so structuredChat doesn't see this as a malformed response.
  if (forcedToolName && tool_calls.length === 0 && text) {
    const parsed = safeParseJson(text);
    if (parsed && typeof parsed === "object") {
      tool_calls.push({
        id: `thegrid_${forcedToolName}_fallback`,
        name: forcedToolName,
        input: parsed,
      });
    }
  }

  return {
    text,
    tool_calls,
    stop_reason: mapStopReason(choice?.finish_reason, tool_calls.length > 0),
  };
}

function mapStopReason(
  finish: string | undefined,
  hadToolCall: boolean,
): LlmChatResponse["stop_reason"] {
  if (hadToolCall) return "tool_use";
  switch (finish) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    default:
      return "other";
  }
}

function safeParseJson(s: string | undefined): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
