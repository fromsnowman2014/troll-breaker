import type { LlmClient } from "../lib/llm/types.js";
import { structuredChat } from "../lib/llm/structured.js";
import { ReplyResultSchema, type ReplyResult, type ReplyMode } from "../lib/schemas/reply.js";
import type { VibeProfile } from "../lib/schemas/vibe.js";
import type { Source } from "../lib/schemas/fact.js";
import { withTimeout, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";

export interface ReplyDeps {
  llm: LlmClient;
}

export interface ReplyInput {
  original_text: string;
  fact_summary?: string;
  sources?: Source[];
  reply_mode: ReplyMode;
  vibe: VibeProfile;
  timeoutMs?: number;
}

const REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply_mode: {
      type: "string",
      enum: ["attack", "defend", "agree", "mock", "humor"],
    },
    post: { type: "string" },
    cited_urls: { type: "array", items: { type: "string" } },
  },
  required: ["reply_mode", "post", "cited_urls"],
};

const MODE_INSTRUCTION: Record<ReplyMode, string> = {
  attack:
    "원글 주장을 정면으로 반박하는 댓글을 써라. 팩트와 출처를 근거로 사용하고, 감정 없이 논리로만 공격하라.",
  defend:
    "원글의 주장을 옹호하고 반론을 사전에 차단하는 논리 댓글을 써라. 가능하면 근거를 덧붙여라.",
  agree:
    "원글에 공감하며 추가 관점이나 보조 근거를 덧붙이는 댓글을 써라. 원글의 흐름을 이어가라.",
  mock:
    "원글을 냉소적으로 비꼬는 댓글을 써라. 직접 욕설 금지. 감정을 드러내지 말고 건조하게 비틀어라.",
  humor:
    "원글의 맥락을 이해한 유머 댓글을 써라. 커뮤니티 밈과 어투를 활용하되 내용과 동떨어지지 않게 하라.",
};

const SYSTEM_BASE = `당신은 이 커뮤니티의 베테랑 유저입니다.

# 목표
원글에 대한 댓글을 작성하라.

# 제약
- Output MUST be a tool call to emit_result. No prose outside.
- post: 실제 올릴 댓글 본문. 커뮤니티 vibe 스타일 필수 적용.
- cited_urls: 댓글 내 인용한 URL 목록. 없으면 빈 배열.
- 사실을 지어내지 말 것. 불확실한 주장은 쓰지 말 것.
- 댓글은 2~6문장 이내. 너무 길면 효과 없음.
`;

export async function generateReply(
  deps: ReplyDeps,
  input: ReplyInput,
): Promise<ReplyResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return withTimeout("reply", timeoutMs, run(deps, input));
}

async function run(deps: ReplyDeps, input: ReplyInput): Promise<ReplyResult> {
  const system = SYSTEM_BASE + renderStyle(input.vibe);

  const sourcesBlock = input.sources?.length
    ? `\n팩트체크 출처:\n${input.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`
    : "";
  const factBlock = input.fact_summary ? `\n팩트체크 요약: ${input.fact_summary}` : "";

  const userMsg = `원글:
${input.original_text}
${factBlock}${sourcesBlock}

댓글 모드: ${input.reply_mode}
지시: ${MODE_INSTRUCTION[input.reply_mode]}

Emit the ReplyResult.`;

  return structuredChat(
    deps.llm,
    ReplyResultSchema,
    REPLY_JSON_SCHEMA,
    { system, messages: [{ role: "user", content: userMsg }] },
    "reply",
  );
}

function renderStyle(vibe: VibeProfile): string {
  const examples = vibe.few_shot_posts
    .slice(0, 2)
    .map(
      (p, i) =>
        `[${i + 1}] title: ${p.title}\n    body: ${p.body.slice(0, 300)}\n    comments: ${p.top_comments.slice(0, 3).join(" / ")}`,
    )
    .join("\n");
  return `
# Style (this community's voice)
site: ${vibe.display_name}
sarcasm_style: ${vibe.tonality.sarcasm_style}
cynicism_level: ${vibe.tonality.cynicism_level}/10
high_signal_words: ${vibe.lexicon.high_signal_words.join(", ")}
forbidden_words: ${vibe.lexicon.forbidden_words.join(", ")}
opener_patterns: ${vibe.sentence_shape.opener_patterns.join(" | ")}
closer_patterns: ${vibe.sentence_shape.closer_patterns.join(" | ")}

# Recent top posts (match this voice)
${examples}
`;
}
