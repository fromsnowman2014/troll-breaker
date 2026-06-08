import type { LlmClient } from "../lib/llm/types.js";
import { structuredChat } from "../lib/llm/structured.js";
import type { SearchClient } from "../lib/search/types.js";
import type { KvStore } from "../lib/storage/types.js";
import { StorageKeys, TTL } from "../lib/storage/keys.js";
import { FactResultSchema, type FactResult, type Source } from "../lib/schemas/fact.js";
import { withTimeout, fingerprint, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";

export interface FactDeps {
  llm: LlmClient;
  search: SearchClient;
  storage: KvStore;
}

export interface FactInput {
  claim: string;
  locale?: "ko" | "en";
  timeoutMs?: number;
  /** Skip cache read+write. Used by orchestrator when a fresh check is requested. */
  bypassCache?: boolean;
}

const FACT_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    claim: { type: "string" },
    verdict: { type: "string", enum: ["true", "false", "partial", "unverified"] },
    summary: { type: "string", maxLength: 400 },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string", pattern: "^https://" },
          publisher: { type: "string" },
          published_at: { type: "string" },
          snippet: { type: "string", maxLength: 280 },
        },
        required: ["title", "url", "snippet"],
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_followup: { type: "array", items: { type: "string" } },
  },
  required: ["claim", "verdict", "summary", "sources", "confidence"],
};

const SYSTEM_PROMPT = `You are a fact-check agent.

# Goal
Verify ONE claim. Return a verdict grounded only in the candidate sources provided in the user message.

# Constraints
- Output MUST be a tool call to emit_result. No prose outside the call.
- Cite ONLY URLs that appear in the candidate sources. Do not invent URLs.
- If candidates do not support a confident verdict, set verdict="unverified" and sources=[].
- summary <= 400 chars. snippet <= 280 chars.
- Korean output by default; English if locale="en".
`;

export async function verifyFactWithLinks(
  deps: FactDeps,
  input: FactInput,
): Promise<FactResult> {
  const locale = input.locale ?? "ko";
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const cacheKey = StorageKeys.factMemo(fingerprint(`${locale}|${input.claim}`));

  if (!input.bypassCache) {
    const cached = await deps.storage.get<FactResult>(cacheKey);
    if (cached) return cached;
  }

  const result = await withTimeout(
    "fact",
    timeoutMs,
    runFactCheck(deps, input.claim, locale),
  );

  await deps.storage.set(cacheKey, result, { ttlMs: TTL.factMemo });
  return result;
}

async function runFactCheck(
  deps: FactDeps,
  claim: string,
  locale: "ko" | "en",
): Promise<FactResult> {
  let candidates: Source[] = [];
  try {
    candidates = await deps.search.searchWeb(claim, 5);
  } catch {
    candidates = [];
  }

  const userMsg = renderUserMessage(claim, locale, candidates);

  const raw = await structuredChat(
    deps.llm,
    FactResultSchema,
    FACT_RESULT_JSON_SCHEMA,
    {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    },
    "fact",
  );

  // Guard: if model returned a non-"unverified" verdict but no sources, downgrade.
  // (The zod schema would have rejected this, but be defensive against future schema edits.)
  if (raw.verdict !== "unverified" && raw.sources.length === 0) {
    return { ...raw, verdict: "unverified", confidence: Math.min(raw.confidence, 0.3) };
  }
  return raw;
}

function renderUserMessage(claim: string, locale: "ko" | "en", candidates: Source[]): string {
  const candidatesBlock = candidates.length
    ? candidates
        .map(
          (s, i) =>
            `[${i + 1}] ${s.title}\n    url: ${s.url}\n    snippet: ${s.snippet}`,
        )
        .join("\n")
    : "(no candidate sources available)";

  return `claim: ${claim}
locale: ${locale}

candidate_sources:
${candidatesBlock}

Emit a FactResult. If the candidate sources do not support a confident verdict, use verdict="unverified" and an empty sources list.`;
}
