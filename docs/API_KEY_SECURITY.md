# Server-Side Key Architecture

How the LLM API key is held, used, and protected. Replaces the previous BYOK model.

The project operator (you) holds a single `THEGRID_API_KEY` in Vercel environment variables. A small serverless proxy at `/api/chat` adds the key to outbound requests so that **the extension and end users never see, store, or supply a key**.

## 1. Why server-side

| Pro | Con |
|---|---|
| Zero onboarding friction — install and use immediately. | Operator (you) pays all token costs. Real ongoing expense. |
| User never handles secrets. No key-entry UI, no encryption-at-rest concerns. | Proxy is publicly callable → cost-exhaustion attack surface. Rate-limit when traffic warrants. |
| Single key to rotate if compromised. | User prompts pass through *our* infrastructure. Privacy disclosures must reflect that. |
| Simpler Chrome Web Store review (`storage` permission no longer holds secrets). | We are now a data processor under most privacy regimes for the proxy hop. |

The previous BYOK trade-off (privacy + cost-transparency, at the price of friction) is reversed. We now optimize for adoption.

## 2. What gets sent

This is the data-egress moment users should understand and that the privacy policy must disclose.

| Sent | Not sent |
|---|---|
| The selected/draft text the user explicitly triggered on | Browsing history |
| The page URL (to look up vibe profile) | Anything from other tabs |
| The vibe few-shots for that URL | Cookies, form values not explicitly invoked on |
| Search snippets the fact agent retrieved | Identifiers tied to the user account or device |

Destination chain: `extension service_worker → our Vercel proxy → https://api.thegrid.ai/v1/chat/completions`.

The side panel first-run consent screen states this in plain language: "When you invoke Truth Check or Strike Enhance, the selected text and current page URL travel through our server to the underlying language model."

## 3. Storage

The extension stores **no secrets**. `chrome.storage.local` is used only for:

- User preferences (mode, model tier override, whitelisted hosts)
- Vibe profile cache (TTL: 7 days)
- Fact-check memo (TTL: 24h)

No key, token, or proxy URL is encrypted — there's nothing to encrypt. The proxy URL is hard-coded in the bundled extension.

## 4. Transmission

```
service_worker → https://troll-breaker-browser.vercel.app/api/chat   [no auth header]
proxy          → https://api.thegrid.ai/v1/chat/completions          [Authorization: Bearer $THEGRID_API_KEY]
```

Rules:
- All transport is HTTPS.
- The extension sets only `Content-Type: application/json` — never an auth header.
- The proxy whitelists request fields (`model`, `messages`, `max_tokens`, `tools`, `tool_choice`) and drops everything else, so callers cannot smuggle params we haven't approved.
- `max_tokens` is capped at 4000 server-side.
- The proxy responds with `Access-Control-Allow-Origin: *` (no cookies traverse this boundary; the key is server-side; CORS lockdown gives no real defense beyond rate-limiting).
- Brave Search currently has no proxy. The production extension will not call search until a separate task adds `/api/search`. The dev smoke runner reads `BRAVE_API_KEY` from `.env` for now.

## 5. Threat model

| Threat | Mitigation |
|---|---|
| Anyone can hit `/api/chat` → cost-exhaustion attack | Monitor Vercel function invocations + THEGRID usage dashboard weekly. Add per-IP rate-limit (Vercel KV or Upstash) when invocations exceed a daily budget. Currently unlimited (acceptable for early operation). |
| THEGRID key compromised (Vercel logs leak, repo leak) | Revoke at THEGRID dashboard; issue new key; update Vercel env var; redeploy. No client-side change required. |
| Vercel function logs contain user prompts | Vercel retains function logs by default. Disable verbose request-body logging in `api/chat.ts` (do not `console.log(req.body)`). Disclose retention in the privacy policy. |
| Malicious request body manipulates THEGRID call | Field whitelist + `max_tokens` cap. No model override beyond `text-*` family (callers can pass `model`, but THEGRID itself only honors valid model IDs). |
| Extension impersonator points users at a phishing UI | Out of scope. Users should install only from the Chrome Web Store listing. |
| Malicious page tricks the user into invoking Shield on attacker-crafted text | Worst case: the *operator* spends tokens on garbage. Same blast radius as a normal user invoking it many times. No privilege escalation, no data leak. |
| Network adversary (untrusted Wi-Fi) | HTTPS only. The proxy is a single hop and uses HSTS via Vercel. |

## 6. Revocation

If `THEGRID_API_KEY` is compromised:

1. Revoke at https://app.thegrid.ai/profile/api-keys — kills usage immediately.
2. Issue a new key, paste into Vercel project Settings → Environment Variables for Production / Preview / Development.
3. Trigger a redeploy (push a new commit, or click "Redeploy" on the dashboard). Env var changes apply to new deployments only.

End-user installations require no action — they're calling our stable proxy URL, which now holds the new key.

## 7. Privacy policy elements (must exist on store listing)

The Chrome Web Store requires a privacy policy URL. The policy must state, at minimum:

1. We operate a small backend (a Vercel-hosted proxy that holds our LLM API key). It does not persist user content beyond Vercel's standard function logs.
2. When the user invokes Truth Check or Strike Enhance, the selected text and current page URL are sent to our proxy and forwarded to the upstream language model (TheGrid, https://thegrid.ai).
3. We store on the user's device: preferences and vibe profile cache. No personal data, no analytics, no telemetry.
4. We do not associate requests with user identity. The proxy does not require sign-in.
5. Users can clear all locally stored data via the options page or by uninstalling the extension. They cannot delete server-side request logs (the proxy holds no user identifier to delete against).

Operator must publish this at a stable URL before store submission. See `USER_ACTION_ITEMS.md`.

## 8. Chrome Web Store policy compliance

- **Single Purpose:** Truth & Strike is a debate helper. Defensible.
- **Permissions justification (one-liners for the listing):**
  - `contextMenus` — register the "Truth Check" right-click action.
  - `storage` — persist user preferences and the vibe profile cache locally. **No secrets.**
  - `sidePanel` — render the result UI.
  - `activeTab` — read the user's selected text only when they invoke.
  - `host_permissions` for `troll-breaker-browser.vercel.app` — call our proxy.
  - `host_permissions` for whitelisted community sites — inject the floating button and read DOM for vibe sampling.
- **Remote code:** we ship no remote JS. All code is bundled.
- **User data disclosure:** declare in the listing exactly what §7 says.

## 9. Open questions

1. **Rate-limit policy.** Per-IP daily quota? Per-install token? Decide once we see real traffic.
2. **Search proxy.** Add `/api/search` for Brave so the production extension can fact-check? Or keep search BYOK-style (user enters their own Brave key) for now?
3. **Operator cost budget.** Set a monthly spend cap on the THEGRID account before MVP launch. Decide what to do when the cap is hit (degrade to error message vs queue).
