import { z } from "zod";
import type { LlmClient } from "../lib/llm/types.js";
import { structuredChat } from "../lib/llm/structured.js";
import { FallacySchema, type Fallacy } from "../lib/schemas/fallacy.js";
import type { VibeProfile } from "../lib/schemas/vibe.js";
import { withTimeout, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";

export interface LogicDeps {
  llm: LlmClient;
}

export interface LogicInput {
  text: string;
  vibe?: VibeProfile;
  timeoutMs?: number;
}

const LogicResultSchema = z.object({
  fallacies: z.array(FallacySchema),
});

const LOGIC_JSON_SCHEMA = {
  type: "object",
  properties: {
    fallacies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "ad_hominem",
              "red_herring",
              "strawman",
              "slippery_slope",
              "false_dilemma",
              "appeal_to_authority",
              "appeal_to_emotion",
              "tu_quoque",
              "moving_the_goalposts",
              "other",
            ],
          },
          span: { type: "string" },
          explanation: { type: "string", maxLength: 200 },
          counter_punch: { type: "string", maxLength: 300 },
        },
        required: ["type", "span", "explanation", "counter_punch"],
      },
    },
  },
  required: ["fallacies"],
};

const SYSTEM_BASE = `You are a logic agent.

# Goal
Detect logical fallacies in the user's text and emit a cynical-tone counter-punch for each.

# Constraints
- Output MUST be a tool call to emit_result. No prose outside.
- span MUST be a verbatim substring of the input text.
- explanation <= 200 chars, vibe-agnostic, factual.
- counter_punch <= 300 chars, in the community vibe if provided, else generic Korean cynical.
- Use type="other" if a fallacy doesn't fit the taxonomy; put the real name in explanation.
- If no fallacies are present, emit fallacies: [].
`;

export async function detectFallacies(
  deps: LogicDeps,
  input: LogicInput,
): Promise<Fallacy[]> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return await withTimeout("logic", timeoutMs, run(deps, input));
}

async function run(deps: LogicDeps, input: LogicInput): Promise<Fallacy[]> {
  const system = input.vibe ? SYSTEM_BASE + renderVibeBlock(input.vibe) : SYSTEM_BASE;
  const userMsg = `text:\n${input.text}\n\nEmit fallacies with verbatim spans.`;

  const res = await structuredChat(
    deps.llm,
    LogicResultSchema,
    LOGIC_JSON_SCHEMA,
    { system, messages: [{ role: "user", content: userMsg }] },
    "logic",
  );

  return res.fallacies.filter((f) => input.text.includes(f.span));
}

function renderVibeBlock(vibe: VibeProfile): string {
  const examples = vibe.few_shot_posts
    .slice(0, 2)
    .map((p) => `- "${p.title}" :: ${p.body.slice(0, 200)}`)
    .join("\n");
  return `

# Style for counter_punch
site: ${vibe.display_name}
sarcasm_style: ${vibe.tonality.sarcasm_style}
cynicism_level: ${vibe.tonality.cynicism_level}/10
high_signal_words: ${vibe.lexicon.high_signal_words.slice(0, 10).join(", ")}
avoid: ${vibe.lexicon.forbidden_words.join(", ")}

few_shot_examples:
${examples}
`;
}
