import { AppError } from "../schemas/errors.js";
import type { Source } from "../schemas/fact.js";
import type { SearchClient } from "./types.js";

export interface BraveConfig {
  apiKey: string;
  baseUrl?: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  meta_url?: { hostname?: string };
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

const DEFAULT_BASE_URL = "https://api.search.brave.com";
const MAX_COUNT = 20;
const SNIPPET_MAX = 280;

export class BraveSearch implements SearchClient {
  constructor(private readonly cfg: BraveConfig) {}

  async searchWeb(query: string, max = 5): Promise<Source[]> {
    if (!this.cfg.apiKey) {
      throw new AppError("no_api_key", "Brave Search API key is not configured");
    }

    const baseUrl = this.cfg.baseUrl ?? DEFAULT_BASE_URL;
    const count = Math.min(Math.max(1, max), MAX_COUNT);
    const url = `${baseUrl}/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "X-Subscription-Token": this.cfg.apiKey,
          Accept: "application/json",
        },
      });
    } catch (e) {
      throw new AppError(
        "search_unreachable",
        `Brave Search fetch failed: ${(e as Error).message}`,
      );
    }

    if (!res.ok) {
      throw new AppError("search_unreachable", `Brave Search returned HTTP ${res.status}`);
    }

    const body = (await res.json()) as BraveResponse;
    const raw = body.web?.results ?? [];
    const out: Source[] = [];
    for (const r of raw) {
      const src = toSource(r);
      if (src) out.push(src);
    }
    return out;
  }
}

function toSource(r: BraveWebResult): Source | null {
  if (!r.title || !r.url) return null;
  if (!r.url.startsWith("https://")) return null;
  const snippet = (r.description ?? "").slice(0, SNIPPET_MAX);
  const src: Source = { title: r.title, url: r.url, snippet };
  if (r.meta_url?.hostname) src.publisher = r.meta_url.hostname;
  return src;
}
