import type { VercelRequest, VercelResponse } from "@vercel/node";

const THEGRID_URL = "https://api.thegrid.ai/v1/chat/completions";
const MAX_TOKENS_CEILING = 4000;
const ALLOWED_FIELDS = new Set(["model", "messages", "max_tokens", "tools", "tool_choice"]);

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

  const apiKey = process.env.THEGRID_API_KEY;
  if (!apiKey) {
    console.error("THEGRID_API_KEY is not set in Vercel env vars");
    res.status(500).json({ error: { message: "server_misconfigured" } });
    return;
  }

  const raw = (req.body ?? {}) as Record<string, unknown>;
  const forward: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (ALLOWED_FIELDS.has(k)) forward[k] = raw[k];
  }
  if (typeof forward.max_tokens === "number" && forward.max_tokens > MAX_TOKENS_CEILING) {
    forward.max_tokens = MAX_TOKENS_CEILING;
  }
  if (!forward.model) forward.model = "text-prime";

  let upstream: Response;
  try {
    upstream = await fetch(THEGRID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(forward),
    });
  } catch (e) {
    console.error("thegrid fetch failed", e);
    res.status(502).json({ error: { message: "upstream_unreachable" } });
    return;
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    res.status(502).json({ error: { message: "upstream_invalid_json", raw: text.slice(0, 500) } });
    return;
  }

  // Normalize THEGRID's `{ errors: { detail } }` to OpenAI-style `{ error: { message } }`.
  if (!upstream.ok && body && typeof body === "object" && "errors" in body) {
    const errs = (body as { errors: { detail?: string } }).errors;
    res.status(upstream.status).json({ error: { message: errs?.detail ?? "upstream_error" } });
    return;
  }

  res.status(upstream.status).json(body);
}
