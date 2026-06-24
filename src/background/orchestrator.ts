import { verifyFactWithLinks, type FactDeps } from "../agents/fact.js";
import { detectFallacies, type LogicDeps } from "../agents/logic.js";
import {
  finalizeConceptPost,
  getSiteVibe,
  rewriteInVibe,
  type VibeDeps,
} from "../agents/vibe.js";
import { scoreAndCritique, type EvaluatorDeps } from "../agents/evaluator.js";
import type { FactResult, Source } from "../lib/schemas/fact.js";
import type { Fallacy } from "../lib/schemas/fallacy.js";
import type { Pipeline, ShieldResult, SwordResult } from "../lib/schemas/results.js";
import type { VibeProfile } from "../lib/schemas/vibe.js";
import { AppError } from "../lib/schemas/errors.js";

export interface OrchestratorDeps extends FactDeps, LogicDeps, VibeDeps, EvaluatorDeps {}

export interface ShieldRequest {
  request_id: string;
  selected_text: string;
  page_url: string;
  pipeline?: Pipeline;
}

export interface SwordRequest {
  request_id: string;
  draft: string;
  page_url: string;
  pipeline?: Pipeline;
}

export interface RefineRequest {
  mode: "shield" | "sword";
  prior_text: string;
  vibe: VibeProfile;
  user_instruction: string;
  conversation_history?: { role: "user" | "assistant"; content: string }[];
}

// ---------- Shield ----------

export async function runShield(
  deps: OrchestratorDeps,
  req: ShieldRequest,
): Promise<ShieldResult> {
  const pipeline = req.pipeline ?? pickPipeline(req.selected_text);
  const vibe = await getSiteVibe(deps, req.page_url);

  // Extract any HTTPS URLs embedded in the selected text to use as known sources.
  const inlineUrls = extractHttpsUrls(req.selected_text);
  const inlineSources = inlineUrlsToSources(inlineUrls);

  // Build a short search query: first sentence or first 120 chars of non-URL text.
  const searchQuery = buildSearchQuery(req.selected_text);

  const factPromise = safeFact(deps, req.selected_text, searchQuery, inlineSources);
  const fallaciesPromise = pipeline === "fast"
    ? Promise.resolve<Fallacy[]>([])
    : safeFallacies(deps, req.selected_text, vibe);

  const [fact, fallacies] = await Promise.all([factPromise, fallaciesPromise]);

  const compose = composeShieldNarrative(fact, fallacies);
  const vibeAdjusted = await rewriteInVibe(deps, compose, vibe);

  return {
    request_id: req.request_id,
    pipeline,
    vibe_used: { site_id: vibe.site_id, display_name: vibe.display_name },
    claim_excerpt: req.selected_text.slice(0, 200),
    fact,
    fallacies,
    vibe_adjusted_summary: vibeAdjusted,
    generated_at: new Date().toISOString(),
  };
}

/** Extract all HTTPS URLs from arbitrary text. */
function extractHttpsUrls(text: string): string[] {
  const re = /https:\/\/[^\s"'<>)\]]+/g;
  return [...new Set(text.match(re) ?? [])];
}

/** Turn raw URLs into minimal Source objects so they appear in candidate_sources. */
function inlineUrlsToSources(urls: string[]): Source[] {
  return urls.map((url) => {
    // Derive a readable title from the URL hostname + path.
    try {
      const u = new URL(url);
      const title = `${u.hostname}${u.pathname.replace(/\/$/, "") || ""}`;
      return { title, url, snippet: `본문에 포함된 링크: ${url}` };
    } catch {
      return { title: url, url, snippet: `본문에 포함된 링크: ${url}` };
    }
  });
}

/**
 * Build a short search query from the selected text.
 * Strategy: strip URLs, take the first 120 chars of the remaining text.
 */
function buildSearchQuery(text: string): string {
  const stripped = text.replace(/https?:\/\/[^\s]+/g, "").trim();
  // Use the first sentence if it's short enough, otherwise truncate.
  const firstSentence = stripped.split(/[.。!\n]/)[0]?.trim() ?? "";
  if (firstSentence.length >= 10 && firstSentence.length <= 120) return firstSentence;
  return stripped.slice(0, 120);
}

async function safeFact(
  deps: OrchestratorDeps,
  claim: string,
  searchQuery: string,
  additionalSources: Source[],
): Promise<FactResult> {
  try {
    return await verifyFactWithLinks(deps, { claim, searchQuery, additionalSources });
  } catch (e) {
    if (e instanceof AppError) {
      return unverifiedFactStub(claim, e.message);
    }
    return unverifiedFactStub(claim, "fact-check unavailable");
  }
}

async function safeFallacies(
  deps: OrchestratorDeps,
  text: string,
  vibe: VibeProfile,
): Promise<Fallacy[]> {
  try {
    return await detectFallacies(deps, { text, vibe });
  } catch {
    return [];
  }
}

function unverifiedFactStub(claim: string, reason: string): FactResult {
  return {
    claim,
    verdict: "unverified",
    summary: `사실 확인 불가: ${reason}`,
    sources: [],
    confidence: 0,
    needs_followup: [],
  };
}

function composeShieldNarrative(fact: FactResult, fallacies: Fallacy[]): string {
  const factBlock = `verdict: ${fact.verdict}\nsummary: ${fact.summary}\nsources:\n${fact.sources
    .map((s, i) => `  [${i + 1}] ${s.title} — ${s.url}`)
    .join("\n")}`;
  const fallacyBlock = fallacies.length
    ? `\n\nfallacies:\n${fallacies
        .map((f) => `- ${f.type}: ${f.explanation}\n  counter: ${f.counter_punch}`)
        .join("\n")}`
    : "";
  return factBlock + fallacyBlock;
}

// ---------- Sword ----------

export async function runSword(
  deps: OrchestratorDeps,
  req: SwordRequest,
): Promise<SwordResult> {
  const pipeline = req.pipeline ?? pickPipeline(req.draft);
  const vibe = await getSiteVibe(deps, req.page_url);

  const score = await scoreAndCritique(deps, { draft: req.draft, vibe });

  // The evaluator already emits final_post. For Standard/Deep, run a finalize pass
  // that consumes its line_critique notes as explicit eval_notes.
  let finalPost = score.final_post;
  if (pipeline !== "fast" && score.line_critique.length > 0) {
    const notes = score.line_critique
      .map((n) => `- ${n.span} → ${n.note}`)
      .join("\n");
    finalPost = await finalizeConceptPost(deps, {
      draft: req.draft,
      evalNotes: notes,
      vibe,
    });
  }

  return {
    request_id: req.request_id,
    pipeline,
    vibe_used: { site_id: vibe.site_id, display_name: vibe.display_name },
    score: { ...score, final_post: finalPost },
    generated_at: new Date().toISOString(),
  };
}

// ---------- Chat refinement ----------

export async function runRefine(
  deps: OrchestratorDeps,
  req: RefineRequest,
): Promise<string> {
  return await rewriteInVibe(deps, req.prior_text, req.vibe, {
    extraInstruction: req.user_instruction,
    ...(req.conversation_history && { conversationHistory: req.conversation_history }),
  });
}

// ---------- Pipeline selection ----------

const STANDARD_THRESHOLD_CHARS = 500;

export function pickPipeline(text: string): Pipeline {
  return text.length > STANDARD_THRESHOLD_CHARS ? "standard" : "fast";
}
