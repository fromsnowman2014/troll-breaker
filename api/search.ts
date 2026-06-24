import type { VercelRequest, VercelResponse } from "@vercel/node";

const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_COUNT = 10;

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
    res.status(405).json({ error: { message: "method_not_allowed" } });
    return;
  }

  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.error("BRAVE_API_KEY is not set in Vercel env vars");
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const raw = (req.body ?? {}) as Record<string, unknown>;
  const query = raw.query;
  if (typeof query !== "string" || query.trim() === "") {
    res.status(400).json({ error: "invalid_request", message: "query must be a non-empty string" });
    return;
  }

  const rawMax = typeof raw.max === "number" ? raw.max : 5;
  const count = Math.min(Math.max(1, rawMax), MAX_COUNT);

  const url = `${BRAVE_URL}?q=${encodeURIComponent(query.trim())}&count=${count}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    });
  } catch (e) {
    console.error("brave fetch failed", e);
    res.status(502).json({ error: "search_unreachable" });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: "search_upstream_error", status: upstream.status });
    return;
  }

  const body = await upstream.json();
  res.status(200).json(body);
}
