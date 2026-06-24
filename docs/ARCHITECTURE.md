# Architecture

System design for the Truth & Strike Chrome extension. Read [`PRD.md`](./PRD.md) first for product intent.

## 1. High-level shape

```
┌──────────────────────────────────────────────────────────────────┐
│                          Chrome Browser                          │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐   ┌──────────────┐  │
│  │ Content Script  │◄──►│ Service Worker   │◄─►│ Side Panel   │  │
│  │ (per-tab DOM)   │    │ (background)     │   │ (chat / UI)  │  │
│  └────────┬────────┘    └────────┬─────────┘   └──────┬───────┘  │
│           │                      │                    │          │
│           │ DOM read,            │ orchestration,     │ user     │
│           │ floating btn,        │ agent calls,       │ chat,    │
│           │ selection capture    │ caching            │ edits    │
│           ▼                      ▼                    ▼          │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ Vercel proxy     │
                        │ /api/chat        │  ──► THEGRID (LLM)
                        │ (holds key)      │
                        └──────────────────┘
                                  │
                              (search:
                               BraveSearch — dev smoke only,
                               not yet wired through proxy)
```

**Minimal backend (key-holding proxy only).** The Vercel proxy at `troll-breaker-browser.vercel.app/api/chat` holds `THEGRID_API_KEY` and forwards chat-completions requests to TheGrid. The extension itself stores no secrets and does not call provider APIs directly. No user data is persisted server-side. See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md).

## 2. Extension surfaces (Manifest V3)

| Surface | Purpose | Lifetime |
|---|---|---|
| `background/service_worker.ts` | Orchestrator. Owns API calls, caches, agent pipeline. | Event-driven; suspended when idle. |
| `content/content_script.ts` | Per-tab DOM access. Captures user selection, injects floating button on textareas, reads page-visible best-posts for opportunistic vibe sampling. | Lives with the tab. |
| `sidepanel/index.html` + `sidepanel/app.tsx` | Primary result UI + chat-style refinement. Uses Chrome `sidePanel` API. | Open per-tab on demand. |
| `options/index.html` | Preferences, model tier, per-site overrides, seed-corpus management. No key entry. | User-opened. |
| `manifest.json` | Permissions, MV3 declarations. | Static. |

**Why side panel over popup:** popups close on focus loss, breaking the chat/edit loop. Side panel persists alongside the page the user is debating on. See [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §2.

## 3. Module tree (planned — not yet implemented)

```
src/
├── background/
│   ├── service_worker.ts        # entry; wires listeners
│   ├── router.ts                # message router: context-menu, floating-btn, sidepanel
│   ├── orchestrator.ts          # runs Shield / Sword pipelines
│   └── cache.ts                 # vibe profile cache, fact-check memo
├── agents/
│   ├── fact.ts                  # verifyFactWithLinks(claim, url)
│   ├── logic.ts                 # detectFallacies(text)
│   ├── vibe.ts                  # getSiteVibe(url), rewriteInVibe(draft, vibe)
│   ├── evaluator.ts             # 4-axis concept-post scorer (PRD §5)
│   └── tools.ts                 # MCP-style tool registry exposed to LLM
├── content/
│   ├── content_script.ts        # selection capture, floating button mount
│   ├── floating_button.tsx      # in-page action affordance
│   └── page_sampler.ts          # opportunistic best-post DOM scrape
├── sidepanel/
│   ├── index.html
│   ├── app.tsx                  # root
│   ├── ResultCard.tsx           # Shield/Sword result view
│   ├── ChatRefine.tsx           # follow-up chat
│   └── InsertBack.tsx           # "replace selection" affordance
├── options/
│   ├── index.html
│   ├── ApiKeySetup.tsx
│   └── SeedCorpusManager.tsx
├── lib/
│   ├── llm/                     # provider adapters (anthropic, openai, gemini)
│   ├── search/                  # search-API adapter
│   ├── storage/                 # typed wrapper over chrome.storage
│   └── schemas/                 # zod schemas — see DATA_SCHEMAS.md
└── manifest.json
```

This is the **target** layout. The first feature should land enough of this to be useful; subsequent features fill in the rest. When the first code lands, mirror this into `docs/CODE_MAP.md` per [`CLAUDE.md`](../CLAUDE.md) protocol.

## 4. Message flow

### 4a. Shield (defend / fact-check)

```
user selects text on page
  └─► right-click → "Truth Check" (context menu, registered in service_worker)
       └─► service_worker.router.handleContextMenu(info, tab)
            ├─► content_script returns { selection, pageUrl, pageTitle, visibleBestPosts[] }
            ├─► orchestrator.runShield({ claim, url })
            │     ├─► vibe.getSiteVibe(url)              [cache hit OR refresh]
            │     ├─► fact.verifyFactWithLinks(claim)    [search + LLM summarize]
            │     ├─► logic.detectFallacies(claim)       [LLM]
            │     └─► vibe.rewriteInVibe(combined, vibe) [LLM with few-shot]
            └─► sidepanel.open(tab) + post ShieldResult
```

### 4b. Sword (attack / draft enhance)

```
user types draft in a textarea
  └─► floating button (injected by content_script) → "Strike Enhance"
       └─► content_script captures { draft, textareaRef, pageUrl }
            └─► service_worker.router.handleStrikeRequest(payload)
                 ├─► vibe.getSiteVibe(url)
                 ├─► evaluator.score(draft, vibe)        [4-axis scoring]
                 ├─► evaluator.lineCritique(draft, vibe) [per-sentence notes]
                 └─► vibe.finalizeConceptPost(draft, evalNotes, vibe)
            └─► sidepanel posts SwordResult
            └─► user can "Insert back" → content_script writes to textareaRef
```

### 4c. Chat refinement (both modes)

After either result is shown, the side panel hosts a short conversation:
- "make it shorter" / "더 비꼬는 톤으로" / "remove the second source" / "add a punchline about X"
- Each turn re-invokes a lightweight `vibe.rewriteInVibe` with the conversation as context.
- Keeps the original analysis (facts, fallacies, score) in panel state — only the rendered text mutates.

## 5. State & caching

| State | Where it lives | TTL | Notes |
|---|---|---|---|
| `THEGRID_API_KEY` | Vercel env var (server-side) | persistent | never stored client-side; rotated via Vercel dashboard |
| User preferences | `chrome.storage.local` | persistent | mode, model tier, whitelist. **No secrets.** |
| Vibe profile per site | `chrome.storage.local` | 7 days default, user-tunable | see [`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §5 |
| Fact-check memo | in-memory + IndexedDB | 24h | keyed by normalized claim hash |
| Conversation history | side panel state only | session | discarded on panel close — privacy default |
| Seed corpus (per site) | bundled JSON + user-editable overrides | persistent | shipped in extension, override via options page |

## 6. Trust & data boundaries

- The user's **selected text** and **draft** are sent to our Vercel proxy and forwarded to TheGrid. This is the primary data egress. Make it obvious in UI before first send. See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §4.
- The user's prompts pass through *our* Vercel function logs (default retention applies). The proxy itself does not persist user data.
- The user's **browsing history** is not collected. The extension only knows the URL of the active tab at moments of explicit invocation.
- No telemetry by default. If we ever add it, opt-in only.

## 7. Failure modes & degradation

| Failure | Behavior |
|---|---|
| Proxy returns 500 `server_misconfigured` | Operator hasn't set `THEGRID_API_KEY` in Vercel. Side panel shows "Service unavailable — try again later". |
| Proxy returns 502 `upstream_error` | THEGRID-side error (rate-limited, balance exhausted, model issue). Side panel surfaces the error message verbatim. |
| LLM API 5xx / timeout | Retry once with backoff; surface clear error in side panel ("Language model unreachable"). |
| Search API quota exhausted | Fall back to LLM-only fact assertion with a visible "⚠ unverified — no live search" badge. |
| Site DOM scrape returns nothing | Use bundled seed corpus only; do not block. |
| User on `chrome://` or extension page | Context menu hidden; floating button not injected. |

## 8. Open architectural questions

These need a decision before implementation; flagged so we don't paper over them.

1. **Single-call vs multi-agent.** Multi-agent (PRD §4) is cleaner conceptually but 3–5× the latency and cost. Proposed default: one structured-output call with role sections; multi-agent reserved for "deep analyze" power mode. See [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) §3.
2. **Model tier policy on THEGRID.** Single `text-prime` for everything vs task-specific routing (`text-standard` for vibe rewrites, `agent-prime` for tool-heavy structured calls). Cost vs quality trade-off.
3. **Search provider.** Brave is wired for the dev smoke runner. Decide whether to add `/api/search` proxy for the production extension or keep Fact mode LLM-only initially.
4. **Korean site DOM stability.** fmkorea / dcinside / theqoo / ruliweb each have unique markup and anti-bot quirks. Owner needs to capture per-site selector kits — see [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §3.

## 9. Performance targets (informational, pre-MVP)

- Shield context-menu → first paint of result card: **< 4 s p50, < 8 s p95**.
- Sword "Strike Enhance" → result: **< 6 s p50, < 12 s p95**.
- Side panel chat turn: **< 3 s p50**.
- Vibe profile cache hit rate after 1 week of normal use: **> 80 %**.

These are targets, not contracts. Revisit after first measured runs.
