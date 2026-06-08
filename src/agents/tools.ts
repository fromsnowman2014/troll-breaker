import type { LlmToolDef } from "../lib/llm/types.js";

export const TOOL_NAMES = {
  getSiteVibe: "get_site_vibe",
  verifyFactWithLinks: "verify_fact_with_links",
  searchWeb: "search_web",
} as const;

export const toolDefs: LlmToolDef[] = [
  {
    name: TOOL_NAMES.getSiteVibe,
    description:
      "Return the VibeProfile for the given URL — lexicon, sentence shape, tonality, and recent best-post few-shots.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
  },
  {
    name: TOOL_NAMES.verifyFactWithLinks,
    description:
      "Verify a single factual claim and return a verdict with at least one cited HTTPS source (unless verdict='unverified').",
    input_schema: {
      type: "object",
      properties: {
        claim: { type: "string" },
        locale: { type: "string", enum: ["ko", "en"] },
      },
      required: ["claim"],
    },
  },
  {
    name: TOOL_NAMES.searchWeb,
    description:
      "Primitive web search. Returns title/url/snippet results. Prefer verify_fact_with_links when verifying a claim.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
  },
];

export type ToolHandler = (input: unknown) => Promise<unknown>;
export type ToolHandlerMap = Partial<Record<(typeof TOOL_NAMES)[keyof typeof TOOL_NAMES], ToolHandler>>;
