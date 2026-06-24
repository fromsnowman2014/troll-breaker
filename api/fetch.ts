import type { VercelRequest, VercelResponse } from "@vercel/node";

// Snippet length cap — enough context for fact-check without blowing token budget.
const SNIPPET_MAX = 1200;
// Fetch timeout
const FETCH_TIMEOUT_MS = 8000;
// Domains we won't attempt to fetch (login walls, paywalls, anti-bot).
const BLOCKED_DOMAINS = new Set(["youtube.com", "twitter.com", "x.com", "instagram.com", "facebook.com"]);

// TODO: rate-limit (per-IP, Vercel KV / Upstash) when traffic warrants.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const raw = (req.body ?? {}) as Record<string, unknown>;
  const url = raw.url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  if (BLOCKED_DOMAINS.has(hostname)) {
    res.status(200).json({ snippet: null, title: null, reason: "blocked_domain" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrollBreaker/1.0; +https://troll-breaker.vercel.app)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.status(200).json({ snippet: null, title: null, reason: `upstream_${upstream.status}` });
      return;
    }

    const html = await upstream.text();
    const { title, snippet } = extractText(html, SNIPPET_MAX);
    res.status(200).json({ title, snippet });
  } catch (e) {
    clearTimeout(timer);
    const reason = (e as Error).name === "AbortError" ? "timeout" : "fetch_failed";
    res.status(200).json({ snippet: null, title: null, reason });
  }
}

function extractText(html: string, maxLen: number): { title: string | null; snippet: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1]?.trim() ?? null : null;

  // Remove scripts, styles, nav, header, footer, aside blocks.
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Strip remaining tags.
  clean = clean.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities.
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace.
  clean = clean.replace(/\s+/g, " ").trim();

  // Return up to maxLen chars.
  const snippet = clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
  return { title, snippet };
}
