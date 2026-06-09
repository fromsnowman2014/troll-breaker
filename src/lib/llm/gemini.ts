import { AppError } from "../schemas/errors.js";
import type {
  LlmChatRequest,
  LlmChatResponse,
  LlmClient,
  LlmToolCall,
  LlmToolDef,
} from "./types.js";

export interface GeminiConfig {
  apiKey: string;
  defaultModel?: string;
  /** Override for tests / proxies. Defaults to Google's v1beta endpoint. */
  baseUrl?: string;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: unknown };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  error?: { message?: string };
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";

export class GeminiLlm implements LlmClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: GeminiConfig) {
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
    if (!this.cfg.apiKey) {
      throw new AppError("no_api_key", "Gemini API key is not configured");
    }

    const model = req.model ?? this.cfg.defaultModel ?? DEFAULT_MODEL;
    const base = this.cfg.baseUrl ?? DEFAULT_BASE;
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;

    const body = buildRequestBody(req);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.cfg.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AppError("llm_unreachable", `Gemini fetch failed: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new AppError(
        "llm_unreachable",
        `Gemini returned ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error) {
      throw new AppError("llm_unreachable", `Gemini error: ${json.error.message ?? "unknown"}`);
    }

    return mapResponse(json);
  }
}

// ---------- request mapping ----------

function buildRequestBody(req: LlmChatRequest): Record<string, unknown> {
  const contents: GeminiContent[] = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: req.system }] },
  };

  if (req.max_tokens !== undefined) {
    body.generationConfig = { maxOutputTokens: req.max_tokens };
  }

  if (req.tools && req.tools.length > 0) {
    body.tools = [{ functionDeclarations: req.tools.map(toFunctionDeclaration) }];
  }

  if (req.tool_choice) {
    if (req.tool_choice.type === "tool") {
      body.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [req.tool_choice.name],
        },
      };
    } else {
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }
  }

  return body;
}

function toFunctionDeclaration(t: LlmToolDef): Record<string, unknown> {
  return {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  };
}

// ---------- response mapping ----------

function mapResponse(json: GeminiResponse): LlmChatResponse {
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const textChunks: string[] = [];
  const tool_calls: LlmToolCall[] = [];
  let i = 0;
  for (const p of parts) {
    if (typeof p.text === "string") textChunks.push(p.text);
    if (p.functionCall) {
      tool_calls.push({
        id: `gemini_${p.functionCall.name}_${i++}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
      });
    }
  }

  return {
    text: textChunks.join(""),
    tool_calls,
    stop_reason: mapStopReason(candidate?.finishReason, tool_calls.length > 0),
  };
}

function mapStopReason(
  finish: string | undefined,
  hadToolCall: boolean,
): LlmChatResponse["stop_reason"] {
  if (hadToolCall) return "tool_use";
  switch (finish) {
    case "STOP":
      return "end_turn";
    case "MAX_TOKENS":
      return "max_tokens";
    default:
      return "other";
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
