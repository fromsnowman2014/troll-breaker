import { AppError } from "../schemas/errors.js";
import type { Source } from "../schemas/fact.js";
import type { SearchClient } from "./types.js";

export interface ProxyConfig {
  proxyUrl: string;
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

const SNIPPET_MAX = 280;

function toSource(r: BraveWebResult): Source | null {
  if (!r.title || !r.url) return null;
  if (!r.url.startsWith("https://")) return null;
  const snippet = (r.description ?? "").slice(0, SNIPPET_MAX);
  const src: Source = { title: r.title, url: r.url, snippet };
  if (r.meta_url?.hostname) src.publisher = r.meta_url.hostname;
  return src;
}

export class ProxySearch implements SearchClient {
  constructor(private readonly cfg: ProxyConfig) {}

  async searchWeb(query: string, max = 5): Promise<Source[]> {
    let res: Response;
    try {
      res = await fetch(this.cfg.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, max }),
      });
    } catch (e) {
      throw new AppError("search_unreachable", `Proxy fetch failed: ${(e as Error).message}`);
    }

    if (!res.ok) {
      throw new AppError("search_unreachable", `Proxy returned HTTP ${res.status}`);
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
