import type { LlmClient } from "../lib/llm/types.js";
import type { KvStore } from "../lib/storage/types.js";
import { StorageKeys, TTL } from "../lib/storage/keys.js";
import { VibeProfileSchema, type VibeProfile } from "../lib/schemas/vibe.js";
import { withTimeout, DEFAULT_AGENT_TIMEOUT_MS } from "./_util.js";
import { GENERIC_KO_CYNICAL } from "./_vibe_fallback.js";

export interface VibeDeps {
  llm: LlmClient;
  storage: KvStore;
  /** Loader for bundled seed corpora. Returns undefined if no seed exists for the site. */
  loadSeed?: (siteId: string) => Promise<VibeProfile | undefined>;
}

export interface RewriteOptions {
  extraInstruction?: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  timeoutMs?: number;
}

// ---------- getSiteVibe ----------

export async function getSiteVibe(
  deps: VibeDeps,
  url: string,
): Promise<VibeProfile> {
  const siteId = urlToSiteId(url);

  const cached = await deps.storage.get<VibeProfile>(StorageKeys.vibe(siteId));
  if (cached) {
    const parsed = VibeProfileSchema.safeParse(cached);
    if (parsed.success) return parsed.data;
    // Bad cache — fall through.
    await deps.storage.delete(StorageKeys.vibe(siteId));
  }

  if (deps.loadSeed) {
    const seed = await deps.loadSeed(siteId);
    if (seed) {
      await deps.storage.set(StorageKeys.vibe(siteId), seed, {
        ttlMs: TTL.vibeStructured,
      });
      return seed;
    }
  }

  return GENERIC_KO_CYNICAL;
}

export function urlToSiteId(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "generic";
  }
}

// ---------- rewriteInVibe ----------

const REWRITE_SYSTEM = `You are a rewrite agent.

# Goal
Rewrite the user's text in the community's voice. Preserve facts and source URLs verbatim.

# Constraints
- Output plain text only. No JSON, no markdown wrappers, no commentary.
- Keep all explicit URLs unchanged.
- Use lexicon and sentence shape from the style block below.
- Do not invent facts. If the input claims X, the output claims X.
- Korean output, unless input is clearly English.
`;

export async function rewriteInVibe(
  deps: VibeDeps,
  text: string,
  vibe: VibeProfile,
  opts: RewriteOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return await withTimeout(
    "vibe.rewrite",
    timeoutMs,
    runRewrite(deps, text, vibe, opts),
  );
}

async function runRewrite(
  deps: VibeDeps,
  text: string,
  vibe: VibeProfile,
  opts: RewriteOptions,
): Promise<string> {
  const system = REWRITE_SYSTEM + renderStyleBlock(vibe);
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (opts.conversationHistory) {
    messages.push(...opts.conversationHistory.slice(-6));
  }
  const tail = opts.extraInstruction
    ? `\n\nadditional instruction: ${opts.extraInstruction}`
    : "";
  messages.push({ role: "user", content: `text:\n${text}${tail}` });

  const res = await deps.llm.chat({ system, messages });
  const out = res.text.trim();
  if (!out) {
    throw new Error("vibe.rewrite: empty model output");
  }
  return out;
}

// ---------- finalizeConceptPost ----------

export interface FinalizeInput {
  draft: string;
  evalNotes: string;
  vibe: VibeProfile;
  timeoutMs?: number;
}

const FINALIZE_SYSTEM = `You are a finishing editor.

# Goal
Rewrite the draft into a "concept post" that would top this community's best/popular page.
Address every weakness in the eval notes. End with a punchline.

# Constraints
- Output plain text only.
- Preserve every factual claim and source URL in the draft.
- Use the style block below verbatim — lexicon, opener and closer patterns, sentence shape.
- The post MUST end with a punchline (closer_patterns are good models).
`;

export async function finalizeConceptPost(
  deps: VibeDeps,
  input: FinalizeInput,
): Promise<string> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return await withTimeout(
    "vibe.finalize",
    timeoutMs,
    runFinalize(deps, input),
  );
}

async function runFinalize(deps: VibeDeps, input: FinalizeInput): Promise<string> {
  const system = FINALIZE_SYSTEM + renderStyleBlock(input.vibe);
  const userMsg = `draft:\n${input.draft}\n\neval_notes:\n${input.evalNotes}\n\nEmit the final post.`;
  const res = await deps.llm.chat({
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const out = res.text.trim();
  if (!out) throw new Error("vibe.finalize: empty model output");
  return out;
}

// ---------- shared style block ----------

function renderStyleBlock(vibe: VibeProfile): string {
  const examples = vibe.few_shot_posts
    .slice(0, 2)
    .map(
      (p) =>
        `--- example ---\ntitle: ${p.title}\nbody: ${p.body}\ncomments: ${p.top_comments.join(" / ")}`,
    )
    .join("\n");
  return `

# Style
site: ${vibe.display_name}
sarcasm_style: ${vibe.tonality.sarcasm_style}
cynicism_level: ${vibe.tonality.cynicism_level}/10
political_lean: ${vibe.tonality.political_lean}
paragraph_style: ${vibe.sentence_shape.paragraph_style}
avg_sentence_length: ${vibe.sentence_shape.avg_length}
high_signal_words: ${vibe.lexicon.high_signal_words.join(", ")}
forbidden_words: ${vibe.lexicon.forbidden_words.join(", ")}
opener_patterns: ${vibe.sentence_shape.opener_patterns.join(" | ")}
closer_patterns: ${vibe.sentence_shape.closer_patterns.join(" | ")}

# Examples (verbatim — match this voice)
${examples}
`;
}
