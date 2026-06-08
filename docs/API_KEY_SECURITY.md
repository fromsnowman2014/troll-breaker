# API Key Security & BYOK

How API keys are entered, stored, transmitted, and revoked. Threat model included.

We use **BYOK** (Bring Your Own Key) — no backend, no shared secrets, no rate limiting we have to enforce. Every user supplies their own LLM and Search API keys.

## 1. Why BYOK

| Pro | Con |
|---|---|
| Zero backend ops, zero cost for us. | Onboarding friction — users must obtain a key first. |
| User pays only for what they use, transparently. | We can't offer a "free trial" without becoming the payer. |
| User's content never traverses our servers — strong privacy story. | We can't enforce rate limits or detect abuse on our side. |
| Compliance is the user's relationship with the LLM provider. | If the LLM provider's TOS conflicts with our use case, the user (not us) is in violation. |

For a debate-helper aimed at heavy users, the privacy + cost-transparency wins. Friction is real but addressable via great onboarding (see [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §9).

## 2. Supported keys

| Key | Purpose | Default provider | Where to obtain |
|---|---|---|---|
| LLM key | All agent calls | Anthropic | console.anthropic.com → API Keys |
| Search key | Fact agent's source lookup | Brave Search | api.search.brave.com |
| (future) Custom OpenAI key | Provider override | optional | platform.openai.com |

Owner must document how to obtain each key in the first-run flow. See [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §4.

## 3. Storage

```
chrome.storage.local["secrets"] = {
  llm: { provider: "anthropic", key: "<encrypted>" }
  search: { provider: "brave", key: "<encrypted>" }
}
```

Rules:
- **`chrome.storage.local` only.** Never `chrome.storage.sync` — that replicates secrets through Google's cloud across the user's devices.
- **Encrypted at rest using a key derived from `chrome.runtime.id` + a per-install random salt.** This is *not* strong cryptography (the same code can derive it back), but it stops casual disk inspection and ensures keys can't be lifted from a backup of `chrome.storage` JSON in plaintext. Mention this honestly in the privacy policy.
- **Never logged.** A linter rule forbids `console.log(secrets.*)`. Service worker never serializes the secrets object into errors or telemetry.

## 4. Transmission

Every outbound call is **directly** from the service worker to the third-party API. No proxy, no analytics tap, no intermediate.

```
service_worker → https://api.anthropic.com/v1/messages    [Authorization: Bearer <key>]
service_worker → https://api.search.brave.com/...         [X-Subscription-Token: <key>]
```

Rules:
- All transport is HTTPS.
- The key is set in headers only. Never in query strings, never in request bodies.
- The `host_permissions` in `manifest.json` is the **narrowest set** of API hosts we actually call. Reviewers can audit it.
- We **do not** make calls to any other domain from the service worker, ever. Content scripts may read DOM but do not make outbound network calls.

## 5. What gets sent to the LLM

This is the data-egress moment users should understand.

| Sent | Not sent |
|---|---|
| The selected/draft text the user explicitly triggered on | Browsing history |
| The page URL (to look up vibe profile) | Anything from other tabs |
| The vibe few-shots for that URL | API keys for other providers |
| Search snippets the fact agent retrieved | Cookies, form values not explicitly invoked on |

The side panel makes this visible. First-run shows a one-screen consent: "When you invoke Truth Check or Strike Enhance, the selected text + the current page URL go to your configured LLM provider. Nothing else."

## 6. Threat model

| Threat | Mitigation |
|---|---|
| Malicious page reads the API key via shared `chrome.storage` | Not possible — `chrome.storage.local` is scoped to the extension. Pages have no access. |
| Malicious page tricks the user into invoking Shield on attacker-crafted text | Worst case: the user spends their own tokens. No privilege escalation. Documented behavior. |
| Extension update is compromised (supply chain) | Code review on every PR; lock dependencies via `pnpm-lock.yaml`; pin all CDN-like deps. See [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §5. |
| User shares their Chrome profile / a backup leaks `chrome.storage` | Keys are not plaintext; user is informed in the privacy policy. Recommend rotating API keys if a profile is leaked. |
| Network adversary (untrusted Wi-Fi) | HTTPS only; refuse to call APIs over plain HTTP. |
| Logging/printing secrets in dev builds | Lint rule + code review. Dev build banner reminds the dev. |
| User pastes a key into the wrong field (e.g., a chat input) | Options page key field is `type=password` and never auto-fills outside that field. Side panel chat input is plain text — risk is on the user. Add an inline warning if a string matching `sk-…` is detected in chat input. |
| Phishing extension impersonates us | Out of scope, but: we own a unique store listing, signed by us; users should install only from the Chrome Web Store listing in the README. |

## 7. Revocation

If a user's key is compromised:

1. They revoke the key at the provider's dashboard (Anthropic / Brave). That kills usage immediately.
2. They open the extension's options page → API Keys → "Clear" and enter a new one.

We do not need a "remote kill switch" — provider revocation is the source of truth.

## 8. Privacy policy elements (must exist on store listing)

The Chrome Web Store requires a privacy policy URL. The policy must state, at minimum:

1. We do not operate any server. All processing happens in the extension and at third-party APIs the user configures.
2. The user's selected text, draft text, and current page URL are sent to the user-configured LLM and Search APIs at the moment of explicit invocation.
3. We store: API keys (encrypted, local only), preferences, vibe profile cache. We do not store user content.
4. We do not collect analytics or telemetry.
5. Users can clear all stored data via the options page or by uninstalling the extension.

Owner must publish this at a stable URL before store submission. See [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §6.

## 9. Chrome Web Store policy compliance

CWS policies require:

- **Single Purpose:** the extension does one thing. Truth & Strike is a "debate helper" — single purpose, defensible.
- **Permissions Justification:** every permission must have a one-line justification in the listing. Prepare this in advance:
  - `contextMenus` — to register the "Truth Check" right-click action.
  - `storage` — to persist API keys and preferences locally.
  - `sidePanel` — to render the result UI.
  - `activeTab` — to read the user's selected text only when they invoke.
  - `host_permissions` for API hosts — to call the user's configured LLM and Search.
  - `host_permissions` for whitelisted community sites — to inject the floating button and read DOM for vibe sampling.
- **Remote code:** we ship no remote JS. All code is bundled.
- **User data disclosure:** declare in the listing exactly what §5 says.

## 10. Open security questions

1. **Do we sign requests** with anything beyond the bearer token? Anthropic and Brave don't support request signing, so no.
2. **Should we offer a "memory-only" mode** where the key isn't persisted at all and must be re-entered each session? Useful for shared computers. Cheap to add post-MVP.
3. **Hardware-backed key storage** via WebAuthn / passkeys for the encryption key derivation? Overkill for v0; revisit if we get enterprise-style requests.
