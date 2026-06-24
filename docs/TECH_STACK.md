# Tech Stack

Concrete tech choices, rationale, and the alternatives we considered. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first.

This is a **proposal**. Each choice has a "decision required" flag where the owner needs to confirm before code is written.

## 1. Extension platform

**Choice:** Chrome Manifest V3, TypeScript, built with **Vite + `@crxjs/vite-plugin`** (or Plasmo).

| Why | Tradeoff |
|---|---|
| MV3 is the only path forward — MV2 is sunset. | Service worker is event-driven; can't hold long-lived in-memory state. Use `chrome.storage` and IndexedDB. |
| `@crxjs/vite-plugin` gives HMR for content scripts + side panel, dramatically faster iteration. | Less mature than webpack, occasional rough edges with the side panel API. |
| Plasmo is an alternative — more opinionated, batteries-included routing. | Heavier; more lock-in. Worth considering if we want zero config. |

**Decision required:** pick `@crxjs/vite-plugin` or Plasmo. Recommendation: **`@crxjs/vite-plugin`** for flexibility, since we'll have unusual surfaces (floating button, side panel chat).

**Browser scope:** Chrome + Edge (Chromium) from day one. Firefox is a port (different sidebar API, different manifest); defer to post-MVP.

## 2. LLM provider

**Choice for v0:** **TheGrid** (https://thegrid.ai) accessed via our Vercel proxy. TheGrid is an OpenAI-compatible gateway that routes to multiple frontier providers based on `model` name ("instrument"). One key, one billing relationship, many underlying providers.

| Why TheGrid | Tradeoff |
|---|---|
| OpenAI-compatible Chat Completions API — adapter is small. | Tool-calling support depends on the underlying provider TheGrid routes to; our adapter has a JSON-content fallback. |
| Multiple instrument tiers (`text-standard` / `text-prime` / `text-max` / `agent-prime`) for cost/quality trade-off. | Pricing changes as TheGrid adjusts routing — monitor monthly. |
| Single key held by us; no BYOK friction for end users. | We pay every token. Abuse risk if proxy is unrate-limited. |

**Adapter layer:** `src/lib/llm/` exposes a single `chat({ system, messages, tools?, schema? })` interface. `TheGridLlm` is the only concrete implementation today (besides `MockLlm` for tests).

**Key holding:** the secret (`THEGRID_API_KEY`) lives in Vercel env vars. The extension calls `/api/chat` on `troll-breaker-browser.vercel.app` and never sees the key. See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md).

**Model defaults (proposed):**
- All tiers: `text-prime` initially (matches the THEGRID curl example; quality≥38).
- Future: route vibe rewrites to `text-standard` (~3× cheaper) and force-tool agents to `agent-prime` once we measure quality on each.

## 3. Search / fact-check provider

The fact agent needs a way to ground claims in citable sources. Options ranked:

| Option | Pros | Cons |
|---|---|---|
| **Brave Search API** (recommended) | Independent index, returns clean URLs + snippets, generous free tier, no Google policy entanglement. | Quality varies on Korean queries — needs measurement. |
| Google Custom Search (CSE) | Best result quality for Korean. | 100 queries/day free, then paid. CSE is technically restricted to specific sites unless configured carefully. |
| Perplexity API | Returns synthesized answer + citations in one call — replaces fact agent partially. | Costs more; less control over the synthesis prompt. |
| LLM-native web search (Claude `web_search` tool, GPT browsing) | No second vendor. | Less transparency on which sources were consulted; usage limits. |

**Decision required:** pick one. Recommendation: **Brave Search** for v0, with the option to swap to LLM-native search via a feature flag once measured.

## 4. Frontend / UI

- **React 18** (side panel + options page). Familiar, mature, plays well with `@crxjs`.
- **Tailwind CSS** for utility-first styling. Lightweight, no design system to maintain.
- **shadcn/ui** components only where useful (button, dialog, tabs) — copy-paste, no dependency.
- **Zustand** for side-panel state. Redux is overkill; React Context is fine but Zustand makes the chat-refinement state machine simpler.

No animations library, no router (single-page panel), no i18n framework yet (Korean-first; English copy added when needed).

## 5. Schemas / validation

- **Zod** for all structured-output schemas, message-passing payloads, and `chrome.storage` accessors.
- One source of truth in `src/lib/schemas/` — re-exported into agent code and UI. See [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md).
- LLM structured output validated against the same zod schemas before reaching UI.

## 6. Storage

- `chrome.storage.local` for: user preferences, vibe profile cache, seed-corpus overrides. **No secrets.**
- `IndexedDB` (via `idb-keyval` — tiny wrapper) for: fact-check memo, larger best-post samples.
- `chrome.storage.sync` is unused. No secrets means no sync-leak risk, but we also don't need cross-device sync for preferences yet.

## 7. Build / dev / test

- **Package manager:** `pnpm`. Smaller node_modules, deterministic.
- **Linting:** ESLint + `@typescript-eslint`. Prettier for format.
- **Testing:**
  - Unit: **Vitest** (matches Vite). Cover agent input/output shape, prompt template rendering, schema validation.
  - Integration: a small **Playwright** suite that loads the extension into a Chromium and exercises the context menu + floating button. Defer until v0.1.
  - **Eval:** a separate `evals/` folder with frozen prompt → expected-property fixtures, run via Vitest. See [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) §6.

## 8. CI / release

- GitHub Actions: lint + typecheck + unit tests on PR.
- Manual release: `pnpm build` → upload zip to Chrome Web Store dashboard. No auto-publish until the store listing exists.
- **Decision required:** create the Chrome Web Store developer account ($5 one-time). Tracked in [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §1.

## 9. What we are explicitly NOT using (yet)

- **Minimal backend (Vercel proxy only).** Single `/api/chat` function that forwards to TheGrid with the operator's key. No database, no auth, no analytics. Stateless. Anything beyond key-holding gets reconsidered case-by-case.
- **No analytics SDK.** Privacy default. If we add anything, it's opt-in and self-hosted (Plausible or Umami).
- **No CRDT / sync.** Single-device per install. Revisit if users ask.
- **No vector DB.** Vibe profiles are small; few-shot examples fit in a prompt directly. Don't introduce embeddings until they pay for themselves.

## 10. Open tech questions

1. Does fetch from a Manifest V3 service worker to our Vercel proxy work end-to-end with CORS? **Need to verify** once the extension shell lands.
2. Does Brave Search API respond fast enough from Korea? **Need to measure** if/when search is wired through `/api/search`.
3. Side panel API quirks: does it survive tab switches without losing chat state? **Need to verify** on Chrome stable.
4. Does TheGrid's `text-prime` reliably honor OpenAI-style `tools` + `tool_choice`? Our `TheGridLlm` adapter has a JSON-content fallback, but we should measure the hit rate on real traffic to decide whether to switch to `agent-prime` for tool-heavy agents.

All three are 30-minute spikes before locking the stack.
