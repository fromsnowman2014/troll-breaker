import type { LlmClient } from "../lib/llm/types.js";
import { structuredChat } from "../lib/llm/structured.js";
import { InterpretResultSchema, type InterpretResult } from "../lib/schemas/interpret.js";
import type { VibeProfile } from "../lib/schemas/vibe.js";
import { withTimeout, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";

export interface InterpretDeps {
  llm: LlmClient;
}

export interface InterpretInput {
  text: string;
  vibe?: VibeProfile;
  timeoutMs?: number;
}

const INTERPRET_JSON_SCHEMA = {
  type: "object",
  properties: {
    plain_text: { type: "string" },
    glossary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          normalized: { type: "string" },
          note: { type: "string" },
        },
        required: ["original", "normalized"],
      },
    },
  },
  required: ["plain_text", "glossary"],
};

const SYSTEM = `당신은 한국 인터넷 커뮤니티 언어 전문가입니다.

# 목표
주어진 글의 속어·줄임말·밈·신조어를 표준 한국어로 해석하세요.

# 제약
- Output MUST be a tool call to emit_result. No prose outside.
- plain_text: 원문의 의미를 유지하면서 속어·줄임말을 표준어로 치환한 전체 문장.
  - 속어가 없는 부분은 그대로 유지.
  - 문장 구조를 바꾸지 말 것. 의미만 명확하게.
- glossary: 치환한 단어/구의 목록. 원문에 없는 항목은 포함하지 말 것.
  - original: 원문의 속어/줄임말 (정확히 원문에서 복사)
  - normalized: 표준 한국어 표현
  - note: 해당 표현의 유래나 뉘앙스 (선택, 1문장 이내)
- 속어나 줄임말이 없으면 plain_text = 원문 그대로, glossary = [].
`;

export async function interpretText(
  deps: InterpretDeps,
  input: InterpretInput,
): Promise<InterpretResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return withTimeout("interpret", timeoutMs, run(deps, input));
}

async function run(deps: InterpretDeps, input: InterpretInput): Promise<InterpretResult> {
  const siteHint = input.vibe ? `\nsite: ${input.vibe.display_name}` : "";
  const userMsg = `text:${siteHint}\n${input.text}\n\nEmit the InterpretResult.`;

  return structuredChat(
    deps.llm,
    InterpretResultSchema,
    INTERPRET_JSON_SCHEMA,
    { system: SYSTEM, messages: [{ role: "user", content: userMsg }] },
    "interpret",
  );
}
