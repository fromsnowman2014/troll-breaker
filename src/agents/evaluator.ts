import type { LlmClient } from "../lib/llm/types.js";
import { structuredChat } from "../lib/llm/structured.js";
import { EvalScoreSchema, type EvalScore } from "../lib/schemas/evaluator.js";
import type { VibeProfile } from "../lib/schemas/vibe.js";
import { withTimeout, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";

export interface EvaluatorDeps {
  llm: LlmClient;
}

export interface EvaluatorInput {
  draft: string;
  vibe: VibeProfile;
  timeoutMs?: number;
}

const axisScore = {
  type: "object",
  properties: {
    value: { type: "integer", minimum: 0, maximum: 10 },
    rationale: { type: "string", maxLength: 150 },
  },
  required: ["value", "rationale"],
};

const EVAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    axes: {
      type: "object",
      properties: {
        cynicism: axisScore,
        fact: axisScore,
        punchline: axisScore,
        vibe: axisScore,
      },
      required: ["cynicism", "fact", "punchline", "vibe"],
    },
    line_critique: {
      type: "array",
      items: {
        type: "object",
        properties: {
          span: { type: "string" },
          note: { type: "string", maxLength: 200 },
        },
        required: ["span", "note"],
      },
    },
    final_post: { type: "string" },
    needs_verification: { type: "array", items: { type: "string" } },
  },
  required: ["axes", "line_critique", "final_post"],
};

const SYSTEM = `You are the senior editor of the community at the given URL.

# Goal
Score the user's draft on four axes and produce a rewritten "concept post" that would top this community's front page.

# Constraints
- Output MUST be a tool call to emit_result. No prose outside.
- Each axis score is an integer 0..10 with a one-sentence rationale (<= 150 chars).
- line_critique entries: span MUST be a verbatim substring of the draft.
- The final_post uses the lexicon, sentence length, and cadence from the style block — NOT generic Korean.
- Do NOT invent facts. Claims you cannot substantiate go into needs_verification, not final_post assertions.
- The final_post ends with a punchline. Always.

# Scoring rubric (PRD §5)
1. Cynicism — calm, mocking, not emotional?
2. Fact — irrefutable fact or statistic present?
3. Punchline — fatal closer at the end?
4. Vibe — community lexicon and sentence shape respected?
`;

export async function scoreAndCritique(
  deps: EvaluatorDeps,
  input: EvaluatorInput,
): Promise<EvalScore> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return await withTimeout("evaluator", timeoutMs, run(deps, input));
}

async function run(deps: EvaluatorDeps, input: EvaluatorInput): Promise<EvalScore> {
  const system = SYSTEM + renderStyle(input.vibe);
  const userMsg = `draft:\n${input.draft}\n\nEmit the EvalScore.`;

  const result = await structuredChat(
    deps.llm,
    EvalScoreSchema,
    EVAL_JSON_SCHEMA,
    { system, messages: [{ role: "user", content: userMsg }] },
    "evaluator",
  );

  // Defensive: drop hallucinated line_critique spans.
  return {
    ...result,
    line_critique: result.line_critique.filter((n) => input.draft.includes(n.span)),
  };
}

function renderStyle(vibe: VibeProfile): string {
  const examples = vibe.few_shot_posts
    .slice(0, 3)
    .map(
      (p, i) =>
        `[${i + 1}] title: ${p.title}\n    body: ${p.body}\n    comments: ${p.top_comments.join(" / ")}`,
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
