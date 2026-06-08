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

**Choice for v0:** Anthropic (Claude). Adapter pattern so we can add OpenAI / Gemini later without rewriting agent code.

| Why Claude as default | Tradeoff |
|---|---|
| Strong Korean output quality; competitive at sarcasm/tone matching. | Slightly higher latency than GPT-4o-mini on small prompts. |
| Tool use is well-specified — fits the MCP-style tool pattern in PRD §4. | Caching API requires care (5-min TTL); design prompts to maximize cache hits — see [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) §5. |
| Structured output via tool-calling is reliable. | We pay per-token. BYOK means the user pays, so the design constraint is to *minimize token waste*, not raw cost. |

**Adapter layer:** `src/lib/llm/` exposes a single `chat({ system, messages, tools?, schema? })` interface. Provider-specific code is behind it.

**Decision required:** confirm Anthropic as default. If owner prefers a multi-provider chooser in v0, scope grows ~1 sprint.

**Model defaults (proposed):**
- Fast tier (vibe rewrite, chat refinement): `claude-haiku-4-5` — cheap, fast, good Korean.
- Reasoning tier (logic critique, evaluator, fact summarize): `claude-sonnet-4-6`.
- Power mode opt-in: `claude-opus-4-7` for "deep analyze".

User can override per-tier in the options page.

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

- `chrome.storage.local` for: API keys, user preferences, vibe profile cache, seed-corpus overrides.
- `IndexedDB` (via `idb-keyval` — tiny wrapper) for: fact-check memo, larger best-post samples.
- **Never `chrome.storage.sync`** for any field — sync would replicate secrets across the user's devices via Google's cloud.

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

- **No backend server.** All API calls are direct from the extension. Adding a backend means provisioning, secrets, ops, and an abuse vector. Worth it only if we add shared features (community-curated vibe profiles, paid tier).
- **No analytics SDK.** Privacy default. If we add anything, it's opt-in and self-hosted (Plausible or Umami).
- **No CRDT / sync.** Single-device per install. Revisit if users ask.
- **No vector DB.** Vibe profiles are small; few-shot examples fit in a prompt directly. Don't introduce embeddings until they pay for themselves.

## 10. Open tech questions

1. Does the Anthropic SDK work cleanly from a Manifest V3 service worker (no `XMLHttpRequest`, fetch-only, no streaming via EventSource)? **Need to verify** before committing.
2. Does Brave Search API respond fast enough from Korea? **Need to measure** with a smoke test.
3. Side panel API quirks: does it survive tab switches without losing chat state? **Need to verify** on Chrome stable.

All three are 30-minute spikes before locking the stack.
