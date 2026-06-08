# Code Map

> Last updated: 2026-06-07 (commit bda96ba)
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
- `src/lib/llm/` — provider-agnostic chat adapter
  - `types.ts` — `LlmClient`, `LlmChatRequest`, `LlmChatResponse`, `LlmToolDef`, `LlmToolCall`, `LlmToolChoice`
  - `mock.ts` — `MockLlm` (queue of responders), `emitToolCall(name, input)`
  - `anthropic.ts` — `AnthropicLlm` (stub; throws until wired to real API)
  - `structured.ts` — `structuredChat(llm, schema, inputSchema, req, agentName)` — tool-use w/ 1 retry
- `src/lib/search/` — search adapter
  - `types.ts` — `SearchClient.searchWeb(query, max?) → Source[]`
  - `mock.ts` — `MockSearch(canned)`
  - `brave.ts` — `BraveSearch` (stub)
- `src/lib/storage/` — KV abstraction (vibe cache, fact memo)
  - `types.ts` — `KvStore { get, set(opts.ttlMs), delete, clear }`
  - `memory.ts` — `InMemoryKv(now?)` with TTL eviction on read
  - `keys.ts` — `StorageKeys.{vibe,vibeOverride,factMemo}`, `TTL.{vibeStructured: 7d, factMemo: 24h}`
- `src/agents/` — agent functions; each returns structured data, never UI strings
  - `_util.ts` — `withTimeout(agent, ms, p)`, `fingerprint(s)`, `DEFAULT_AGENT_TIMEOUT_MS=30_000`
  - `_vibe_fallback.ts` — `GENERIC_KO_CYNICAL` profile (last-resort)
  - `tools.ts` — `TOOL_NAMES`, `toolDefs` (MCP-style — get_site_vibe, verify_fact_with_links, search_web)
  - `fact.ts` — `verifyFactWithLinks(deps, {claim, locale?, bypassCache?}) → FactResult`; caches 24h
  - `logic.ts` — `detectFallacies(deps, {text, vibe?}) → Fallacy[]`; filters hallucinated spans
  - `vibe.ts` — `getSiteVibe(deps, url)`, `rewriteInVibe(deps, text, vibe, opts)`, `finalizeConceptPost(deps, input)`, `urlToSiteId(url)`
  - `evaluator.ts` — `scoreAndCritique(deps, {draft, vibe}) → EvalScore`; PRD §5 4-axis rubric
- `src/background/`
  - `orchestrator.ts` — `runShield`, `runSword`, `runRefine`, `pickPipeline(text)`; threshold `STANDARD_THRESHOLD_CHARS=500`
- `tests/` — vitest unit tests; all mocked, no real LLM calls
  - `_fixtures.ts` — `fixtureVibe`, `fixtureSources`
  - `schemas.test.ts`, `fact.test.ts`, `logic.test.ts`, `vibe.test.ts`, `evaluator.test.ts`, `orchestrator.test.ts`

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

## Known gaps / TODO

- `AnthropicLlm.chat` and `BraveSearch.searchWeb` are stubs — throw until wired to real APIs.
- No `chrome.storage`-backed `KvStore` yet; only `InMemoryKv`. Add when extension shell lands.
- No bundled seed-corpus loader yet. `VibeDeps.loadSeed` is an injectable hook; owner provides per-site JSON per USER_ACTION_ITEMS.md §2.
- No prompt file extraction. All prompts are inline strings in agent files; PROMPT_GUIDELINES.md §1 calls for `prompts/*.md` per agent — defer until prompts grow.
- No `evals/` harness. Property-based fixtures (PROMPT_GUIDELINES.md §6) deferred.
- "Deep Analyze" pipeline currently behaves like "Standard" — multi-claim splitter (AGENT_DESIGN.md §8 open question) not implemented.
- No content script, background service-worker entry, side panel, or options page (outside AGENT_DESIGN.md scope; see ROADMAP.md Phase 0–1).
- No `chrome.storage` migration / `schema_version` plumbing (DATA_SCHEMAS.md §5) — needed only when persistence lands.
