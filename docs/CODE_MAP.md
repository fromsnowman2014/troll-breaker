# Code Map

> Last updated: 2026-06-23 (Phase 0+1 extension shell)
> Update protocol: see CLAUDE.md → "Source Code Map".

## Module tree

- `src/lib/schemas/` — zod schemas, source of truth for cross-module contracts
  - `vibe.ts` — `VibeProfileSchema`, `VibePostSchema`, `SiteIdSchema`; types `VibeProfile`, `VibePost`
  - `fact.ts` — `FactResultSchema`, `SourceSchema`; types `FactResult`, `Source`
  - `fallacy.ts` — `FallacySchema`, `FallacyTypeSchema`; types `Fallacy`, `FallacyType`
  - `evaluator.ts` — `EvalScoreSchema`; type `EvalScore` (axes / line_critique / final_post / needs_verification)
  - `results.ts` — `ShieldResultSchema`, `SwordResultSchema`; types `Pipeline`, `ShieldResult`, `SwordResult`
  - `errors.ts` — `AppError`, `AgentTimeoutError`, `SchemaValidationError`; type `AppErrorCode`
  - `index.ts` — re-exports
- `src/lib/llm/` — chat adapter (hits Vercel proxy that holds `THEGRID_API_KEY`)
  - `types.ts` — `LlmClient`, `LlmChatRequest`, `LlmChatResponse`, `LlmToolDef`, `LlmToolCall`, `LlmToolChoice`
  - `mock.ts` — `MockLlm` (queue of responders), `emitToolCall(name, input)`
  - `thegrid.ts` — `TheGridLlm` (fetch-based; OpenAI-compatible body; no apiKey in client — proxy adds Bearer server-side)
  - `structured.ts` — `structuredChat(llm, schema, inputSchema, req, agentName)` — tool-use w/ 1 retry
- `api/` — Vercel serverless functions (deployed to troll-breaker.vercel.app)
  - `chat.ts` — `POST /api/chat` proxy; whitelists fields, caps max_tokens, adds `Authorization: Bearer $THEGRID_API_KEY` to outbound THEGRID call
- `src/lib/search/` — search adapter
  - `types.ts` — `SearchClient.searchWeb(query, max?) → Source[]`
  - `mock.ts` — `MockSearch(canned)`
  - `brave.ts` — `BraveSearch` (fetch-based; `X-Subscription-Token`)
- `src/lib/storage/` — KV abstraction (vibe cache, fact memo)
  - `types.ts` — `KvStore { get, set(opts.ttlMs), delete, clear }`
  - `memory.ts` — `InMemoryKv(now?)` with TTL eviction on read
  - `keys.ts` — `StorageKeys.{vibe,vibeOverride,factMemo}`, `TTL.{vibeStructured: 7d, factMemo: 24h}`
- `src/lib/seeds/` — bundled VibeProfile loader
  - `index.ts` — `makeSeedLoader(raw)`, `isSkeleton(profile)`, `RawSeedLoader` type
  - `node.ts` — `nodeFsRawLoader(seedsDir)` — fs.readFile-based, used by smoke runner (NOT re-exported from index to avoid browser bundle pollution)
  - `extension.ts` — `extensionRawLoader()` — fetch-based via `chrome.runtime.getURL`, used by service worker
- `extension/seeds/<site_id>.json` — bundled corpora (currently skeletons; USER_ACTION_ITEMS.md §2)
  - fmkorea.com, dcinside.com, theqoo.net, ruliweb.com, ilbe.com
- `scripts/smoke.ts` — end-to-end runner; calls the deployed Vercel proxy (or `PROXY_URL` override) for LLM
- `docs/site-extractors/<site_id>.md` — owner-curated CSS selector specs (USER_ACTION_ITEMS.md §3)
- `src/agents/` — agent functions; each returns structured data, never UI strings
  - `_util.ts` — `withTimeout(agent, ms, p)`, `fingerprint(s)`, `DEFAULT_AGENT_TIMEOUT_MS=30_000`
  - `_vibe_fallback.ts` — `GENERIC_KO_CYNICAL` profile (last-resort)
  - `tools.ts` — `TOOL_NAMES`, `toolDefs` (MCP-style — get_site_vibe, verify_fact_with_links, search_web)
  - `fact.ts` — `verifyFactWithLinks(deps, {claim, locale?, bypassCache?}) → FactResult`; caches 24h
  - `logic.ts` — `detectFallacies(deps, {text, vibe?}) → Fallacy[]`; filters hallucinated spans
  - `vibe.ts` — `getSiteVibe(deps, url)`, `rewriteInVibe(deps, text, vibe, opts)`, `finalizeConceptPost(deps, input)`, `urlToSiteId(url)`
  - `evaluator.ts` — `scoreAndCritique(deps, {draft, vibe}) → EvalScore`; PRD §5 4-axis rubric
- `src/background/`
  - `service_worker.ts` — MV3 service worker entry; registers "Truth Check" context menu; calls `runShield` on click; opens side panel; routes result via `chrome.tabs.sendMessage`
  - `orchestrator.ts` — `runShield`, `runSword`, `runRefine`, `pickPipeline(text)`; threshold `STANDARD_THRESHOLD_CHARS=500`
- `src/content/`
  - `content_script.ts` — skeleton (Phase 2: floating button for Sword mode)
- `src/sidepanel/`
  - `index.html` — React root HTML
  - `index.css` — Tailwind base styles
  - `app.tsx` — Zustand store (`PanelState`); `chrome.runtime.onMessage` listener; renders `ResultCard` / `LoadingCard` / `ErrorCard`
  - `ResultCard.tsx` — `ResultCard({result: ShieldResult})`, `LoadingCard()`, `ErrorCard({error})`
- `src/options/`
  - `index.html` — options HTML
  - `app.tsx` — minimal options page (no key entry UI)
- `src/lib/storage/`
  - `chrome.ts` — `ChromeKvStore implements KvStore`; wraps `chrome.storage.local` with TTL eviction on `get()`
- `tests/` — vitest unit tests; all mocked, no real LLM calls
  - `_fixtures.ts` — `fixtureVibe`, `fixtureSources`
  - `schemas.test.ts`, `fact.test.ts`, `logic.test.ts`, `vibe.test.ts`, `evaluator.test.ts`, `orchestrator.test.ts`, `seeds.test.ts`, `brave.test.ts`, `thegrid.test.ts`

## Key types

- `VibeProfile { site_id, display_name, source, last_refreshed, lexicon, sentence_shape, tonality, few_shot_posts[2..5] }`
- `FactResult { claim, verdict: "true"|"false"|"partial"|"unverified", summary, sources: Source[], confidence, needs_followup }` — invariant: verdict ≠ "unverified" ⇒ sources ≥ 1
- `Source { title, url (HTTPS only), publisher?, published_at?, snippet }`
- `Fallacy { type: FallacyType, span (verbatim), explanation, counter_punch }`
- `EvalScore { axes: {cynicism, fact, punchline, vibe}, line_critique: LineNote[], final_post, needs_verification }`
- `ShieldResult { request_id, pipeline, vibe_used, claim_excerpt, fact, fallacies, vibe_adjusted_summary, generated_at }`
- `SwordResult { request_id, pipeline, vibe_used, score, generated_at }`
- `Pipeline = "fast" | "standard" | "deep"`

## Cross-module contracts

- Shield flow: `orchestrator.runShield → vibe.getSiteVibe → parallel(fact.verifyFactWithLinks, logic.detectFallacies) → vibe.rewriteInVibe`
  - Fast mode skips `logic.detectFallacies`.
  - Fact failure → `unverifiedFactStub` in `orchestrator.ts`; rewrite still proceeds.
- Sword flow: `orchestrator.runSword → vibe.getSiteVibe → evaluator.scoreAndCritique → (standard+) vibe.finalizeConceptPost`
- Refine flow: `orchestrator.runRefine → vibe.rewriteInVibe(extraInstruction, conversationHistory)`
- Pipeline selection: `pickPipeline(text)` — `length > 500 chars → standard`, else `fast`. `deep` is callers-opt-in only.
- MCP-style tools exposed to model (definitions only): `agents/tools.ts → toolDefs`. Handlers are wired by orchestrator at call time (see AGENT_DESIGN.md §4).
- Structured-output contract: every agent that emits structured data calls `lib/llm/structured.structuredChat(schema, inputSchema, ...)`. zod-output validation; 1 retry with error-injection.
- Agent isolation rules (AGENT_DESIGN.md §6): agents do not call each other; they do not touch `chrome.storage` directly (go through `lib/storage`); they return data, not UI strings.

## Build

- Build tool: Vite + `@crxjs/vite-plugin` (MV3, HMR). Config: `vite.config.ts`.
- `npm run build` → `dist/` (unpacked extension ready to load in Chrome).
- `npm run dev` → Vite dev server with HMR.
- `extension/` is `publicDir` → copied to `dist/` at build time (seeds, icons).

## Known gaps / TODO

- All LLM calls go through `api/chat.ts` → THEGRID. No client-side apiKey. (`BraveSearch` is still BYOK for dev smoke runner only.)
- No `/api/search` proxy yet — Brave is dev-only. Production extension fact-check is LLM-only until that lands (search dep uses `MockSearch([])` in service worker).
- No rate-limiting on `/api/chat`. Add Vercel KV / Upstash when traffic warrants (TODO comment in `api/chat.ts`).
- `fmkorea.com` seed is curated; `dcinside.com`, `theqoo.net`, `ruliweb.com`, `ilbe.com` still have `__TODO__` markers.
- Per-site DOM extractor specs (`docs/site-extractors/*.md`) are skeletons (USER_ACTION_ITEMS.md §3); `src/content/extractors/` not yet created.
- Content script is empty — Sword mode floating button (Phase 2) not yet implemented.
- "Deep Analyze" pipeline currently behaves like "Standard" — multi-claim splitter not implemented.
- No `chrome.storage` migration / `schema_version` plumbing (DATA_SCHEMAS.md §5) — needed only when persistence lands.
- No `evals/` harness. Deferred (PROMPT_GUIDELINES.md §6).
- Side panel sends messages to side panel via `chrome.tabs.sendMessage` — side panel must be open before the message arrives. If race occurs, messages are lost. Phase 2: use `chrome.runtime.sendMessage` + retry logic.
