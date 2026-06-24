# Architecture — Native Browser

> Read [`PRD.md`](./PRD.md) first for product intent. This doc is the shell + process model + IPC + module tree.

---

## 1. High-level shape

```
┌────────────────────────────────────────────────────────────────────┐
│                       Truth & Strike (native app)                  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Main process (Node.js)                    │  │
│  │                                                              │  │
│  │  • Window + tab manager     • Settings + keychain access     │  │
│  │  • IPC router               • Orchestrator (agent pipeline)  │  │
│  │  • Network: LLM + Search    • Vibe / fact caches             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                  ▲                              ▲                  │
│                  │ IPC (typed)                  │ IPC (typed)      │
│                  ▼                              ▼                  │
│  ┌────────────────────────────┐    ┌─────────────────────────────┐ │
│  │   Chrome renderer (React)  │    │   WebContentsView per tab   │ │
│  │   — browser chrome:        │    │   — page renderer (web)     │ │
│  │     tab bar, URL bar,      │    │   — sandboxed, no Node      │ │
│  │     output frame,          │    │   — one tiny preload script │ │
│  │     chat frame,            │    │     for selection + insert  │ │
│  │     settings drawer        │    └─────────────────────────────┘ │
│  └────────────────────────────┘                                    │
└────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  External APIs     │
        │  • LLM (BYOK)      │
        │  • Search (BYOK)   │
        └────────────────────┘
```

Two key points the diagram makes:

1. **All sensitive work — keychain access, LLM calls, orchestration, caches — runs in the main process.** Renderers never see the API key, never make outbound LLM calls. The renderer can only ask the main process to run a pipeline; it receives results, not credentials.
2. **The chrome (our UI) and the page (the user's content) are two different renderers.** The chrome is a React app we control. Each tab is a separate `WebContentsView` rendering arbitrary web content with no Node integration, no preload of our IPC surface, no access to our schemas.

## 2. Why a native browser, recap

See [`README.md`](./README.md) §1 and [`PRD.md`](./PRD.md) §2. Architecture follows from that decision: we need a long-lived main process that owns secrets and orchestration, while the actual web rendering remains stock Chromium.

## 3. Shell choice — Electron, with Tauri as the documented alternative

**Choice (proposed): Electron.**

| Option | Why we'd pick it | Why we wouldn't |
|---|---|---|
| **Electron** *(recommended)* | Mature multi-renderer model. First-class `BrowserWindow` / `WebContentsView` for "browser inside a browser." `safeStorage` for OS-keychain encryption. Massive ecosystem (`electron-builder`, signing, auto-update). | Big binary (~150 MB). Chromium upgrade cadence is ours to ride. |
| **Tauri 2** | Tiny binary, Rust core, OS-native webview. | The OS webview is **not Chromium** on macOS (WebKit) and Windows (WebView2 ≈ Edge). Inconsistent rendering across platforms is hostile to "act like Chrome." Would need to bundle Chromium ourselves — defeats the size win. |
| **Raw CEF (Chromium Embedded Framework) + custom shell** | Maximum control. | Months of plumbing for window/tab/process management we'd write by hand. Not worth it for v0. |

**Decision required:** confirm Electron as the shell for MVP. Tauri stays in the back pocket if Electron's resource footprint becomes a real complaint post-MVP.

Rest of this doc assumes Electron terminology (`BrowserWindow`, `WebContentsView`, `ipcMain`, `ipcRenderer`, `contextBridge`, `safeStorage`). The shape would be the same in any framework that has main/renderer separation.

## 4. Process model

| Process | Count | Owns | Cannot access |
|---|---|---|---|
| **Main** | 1 | Window + tab manager, IPC router, orchestrator, agent pipelines, LLM / Search adapters, settings store, vibe cache, fact memo, keychain access. | DOM. |
| **Chrome renderer** | 1 per window | The React app that renders our chrome (tab strip, URL bar, output frame, chat frame, settings drawer). Talks to main only via the exposed IPC surface. | Direct disk, direct network — must go through main. Page DOM (it's a different renderer). |
| **Page renderer** (`WebContentsView`) | 1 per tab | Web page rendering. Standard Chromium with sandbox on. Loads one tiny **page preload** script we ship. | Node APIs. Our schemas. The agent pipeline. Other tabs. |
| **Utility renderers** (Chromium internals) | as Chromium decides | Network, GPU, audio. Not ours to think about. | — |

The chrome renderer is our UI. The page renderer is the user's content. We deliberately keep them isolated — our UI does not know how to read a page's DOM directly, and a malicious page cannot read our React state.

## 5. IPC surface

All IPC is **typed**. We share zod schemas between main and renderer (compile-time TS types + runtime validation). Every channel name is namespaced; the router is a flat dispatcher.

```
chrome.renderer  ↔  main
─────────────────────────────────────────────
ui:tab:open      → { url? }                      → { tab_id }
ui:tab:close     → { tab_id }                    → ok
ui:tab:switch    → { tab_id }                    → ok
ui:tab:navigate  → { tab_id, url }               → ok
ui:tab:reload    → { tab_id }                    → ok
ui:tab:back      → { tab_id }                    → ok
ui:tab:forward   → { tab_id }                    → ok

ui:drawer:open   → {}                            → ok
ui:drawer:close  → {}                            → ok
ui:settings:get  → {}                            → Settings (no secrets)
ui:settings:set  → Partial<Settings>             → Settings
ui:settings:put_key  → { which: "llm"|"search", key: string } → ok    (writes via safeStorage)
ui:settings:clear_key → { which: "llm"|"search" }                → ok
ui:settings:test_llm → {}                        → { ok: boolean, error?: string }

ui:agent:defense → DefenseRequest                → { request_id }
ui:agent:attack  → AttackRequest                 → { request_id }
ui:agent:refine  → RefineRequest                 → { request_id }
ui:agent:cancel  → { request_id }                → ok

main → chrome.renderer  (events)
─────────────────────────────────────────────
evt:agent:progress  { request_id, stage, label }
evt:agent:result    { request_id, payload: DefenseResult | AttackResult | RefineResult }
evt:agent:error     { request_id, error: AppError }

evt:tab:title      { tab_id, title }
evt:tab:url        { tab_id, url }
evt:tab:loading    { tab_id, isLoading }
evt:tab:favicon    { tab_id, url }
evt:tab:focus_changed { tab_id }

page.preload  ↔  main
─────────────────────────────────────────────
page:selection:get   → {}                        → { text: string, url: string }
page:textarea:focused → {}                       → { has_focus: boolean, token?: string }
page:textarea:insert → { token: string, text }   → ok
```

Discriminated unions for the agent payloads live in [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md).

Rules:

- **No magic strings.** Every channel is exported as a const from `src/shared/ipc-channels.ts`.
- **Validate at the boundary.** Main parses every request through a zod schema before dispatch. Renderer parses every response/event. A schema mismatch is a hard error, surfaced to the user.
- **No promises across `webContents` after destruction.** Tab close cancels outstanding requests for that tab.
- **Renderer is dumb.** It does not call LLM APIs. It does not read the keychain. It does not write to the cache. It posts requests and renders responses.

## 6. Page interaction — the "selection" and "insert back" surface

Two things require touching page renderers:

1. Reading the user's selected text on the active page (for Defense input source rule, PRD §6.1).
2. Writing rewritten text back into a focused textarea (for Attack "Insert back," PRD §6.2).

These are done through a single **page preload script** loaded into every `WebContentsView`. It is small, ours, and bundled — no remote code, no per-site rules.

```
src/page-preload/preload.ts
─────────────────────────────
• Exposes ONLY:
   - "page:selection:get"  responder
   - "page:textarea:focused" responder
   - "page:textarea:insert" responder
• Does NOT expose Node, fs, or any orchestrator API.
• Uses contextBridge.exposeInMainWorld with a single namespaced object
  on which we only mount the three responders above.
• Re-derives a per-focused-textarea opaque token on focus; "insert" rejects
  if the token is stale or the element is gone.
```

Why a preload at all (rather than executing JS via `webContents.executeJavaScript` per request): predictable timing, predictable security review, easier to reason about which DOM APIs are touched.

What the preload **never** does:

- Read cookies, form values not in the focused element, page localStorage.
- Make network calls.
- Mutate the DOM beyond writing into the explicitly-focused textarea on user click.

This is the equivalent of the extension's content script, but radically smaller in surface: three messages, one direction, opaque tokens.

## 7. Module tree (planned)

```
src/
├── main/                       # Electron main process
│   ├── index.ts                # entry; create window, register IPC, install menus
│   ├── window.ts               # createMainWindow(): builds chrome + tab container
│   ├── tabs/
│   │   ├── tab_manager.ts      # WebContentsView lifecycle, focus tracking
│   │   ├── tab.ts              # Tab object: id, url, title, history index
│   │   └── omnibox.ts          # parseOmnibox(input): URL vs search-query heuristic
│   ├── ipc/
│   │   ├── router.ts           # flat switch on channel name
│   │   ├── handlers.tab.ts     # ui:tab:* handlers
│   │   ├── handlers.agent.ts   # ui:agent:* handlers → orchestrator
│   │   ├── handlers.settings.ts# ui:settings:* handlers (+ safeStorage)
│   │   └── handlers.page.ts    # page:* handlers (preload bridge)
│   ├── orchestrator/
│   │   ├── orchestrator.ts     # runDefense, runAttack, runRefine, pickPipeline
│   │   └── cancellation.ts     # request_id → AbortController map
│   ├── agents/                 # inherited shape from ../docs
│   │   ├── _util.ts            # withTimeout, fingerprint
│   │   ├── _vibe_fallback.ts   # generic Korean-cynical baseline
│   │   ├── tools.ts            # MCP-style tool registry
│   │   ├── fact.ts             # verifyFactWithLinks
│   │   ├── logic.ts            # detectFallacies
│   │   ├── vibe.ts             # getSiteVibe, rewriteInVibe, finalizeConceptPost
│   │   └── evaluator.ts        # scoreAndCritique
│   ├── lib/
│   │   ├── llm/                # provider adapters (anthropic, openai, gemini)
│   │   │   ├── types.ts
│   │   │   ├── structured.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   └── gemini.ts
│   │   ├── search/             # brave + mock
│   │   ├── storage/            # disk + safeStorage wrapper
│   │   │   ├── kv.ts           # KvStore interface (TTL-aware)
│   │   │   ├── disk.ts         # disk-backed KV at userData/cache
│   │   │   └── secrets.ts      # safeStorage encrypt/decrypt of API keys
│   │   └── seeds/              # bundled vibe corpora loader (re-uses ../docs format)
│   ├── menus/
│   │   ├── app_menu.ts         # macOS menubar, Windows menu
│   │   └── shortcuts.ts        # globalShortcut registry
│   └── shared/                 # imported by main AND renderer
│       ├── ipc-channels.ts     # channel name consts (single source of truth)
│       ├── schemas/            # zod schemas
│       │   ├── settings.ts
│       │   ├── ipc.ts          # discriminated union of IPC payloads
│       │   ├── agents.ts       # re-exported subset of agent types
│       │   └── index.ts
│       └── types.ts            # pure-TS types derived from schemas
│
├── chrome-renderer/            # the React UI for our chrome
│   ├── index.html
│   ├── main.tsx                # React entry
│   ├── ipc.ts                  # contextBridge'd client; one fn per channel
│   ├── state/
│   │   ├── store.ts            # zustand
│   │   ├── tabs.ts             # tab list + active id
│   │   ├── agent.ts            # current session (defense | attack | null)
│   │   ├── chat.ts             # refinement history + revert stack
│   │   └── settings.ts         # mirror of main's settings (no secrets)
│   ├── components/
│   │   ├── ChromeShell.tsx     # outermost layout (tab strip + viewport + drawer)
│   │   ├── TabStrip.tsx
│   │   ├── UrlBar.tsx          # omnibox input
│   │   ├── NavButtons.tsx      # back/forward/reload
│   │   ├── RightEdgeTrigger.tsx# the sparkle/gear button → opens drawer
│   │   ├── SettingsDrawer.tsx  # the slide-out panel
│   │   ├── OutputFrame.tsx     # result card host (Defense | Attack)
│   │   ├── ChatFrame.tsx       # buttons + input
│   │   ├── DefenseCard.tsx     # rendered result
│   │   ├── AttackCard.tsx
│   │   └── ScoreBars.tsx
│   ├── styles/                 # tailwind + tokens
│   │   └── theme.css
│   └── lib/
│       ├── hotkeys.ts          # mousetrap-like, all keyboard shortcuts
│       └── animations.ts       # drawer + frame transitions
│
├── page-preload/               # the tiny preload script loaded per tab
│   └── preload.ts
│
├── shared-build/               # build outputs scoped per process target
└── packaging/                  # electron-builder config, icons, signing
```

The shape is intentionally close to the extension's module tree (see `../docs/CODE_MAP.md`) — `lib/llm`, `lib/search`, `lib/storage`, `agents/*` are essentially **lift-and-shift** from the extension. The differences are:

- The orchestrator no longer lives in a service worker; it lives in `src/main/orchestrator/`.
- There is no `content/` directory — replaced by the much smaller `page-preload/`.
- There is no `sidepanel/` or `options/` — replaced by the chrome renderer + settings drawer.

When code starts landing, mirror this into `docs_new_browser/CODE_MAP.md` per the CLAUDE.md protocol.

## 8. Data + cache lifecycle

| Data | Where it lives | TTL | Notes |
|---|---|---|---|
| API keys (LLM, search) | Encrypted via Electron `safeStorage`, then on disk under `userData/secrets.bin`. | persistent | OS keychain handles the encryption key. See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §3. |
| User preferences | `userData/settings.json` (plain). | persistent | No secrets ever in this file. |
| Vibe profile cache | `userData/cache/vibe/<site_id>.json` via `lib/storage`. | 7 days default, user-tunable | Same shape as extension. |
| Fact memo | `userData/cache/fact/<sha256>.json`. | 24 h | Cleanup on read. |
| Tab session (URLs only) | `userData/session.json`. | persistent until cleared | Restores tabs on relaunch. |
| Browsing history | session-local (in-memory) by default. Optional persistence in settings (post-MVP). | session | We are not a sync product. |
| Conversation history (refinement) | chrome-renderer zustand store only. | session, cleared on new invocation | Not persisted. |

`userData` is Electron's per-app directory (`~/Library/Application Support/<AppName>` on macOS, `%APPDATA%\<AppName>` on Windows).

## 9. Trust & data boundaries

- **API keys never cross the main → chrome-renderer boundary.** Renderer asks main "do this LLM call"; main does it, returns the result. Renderer reads the *current key fingerprint* (e.g., last 4 chars) for display only.
- **The page renderer never sees agent state or settings.** The preload exposes three responders, no schemas.
- **All outbound network calls originate in main.** Renderer has no `fetch` to LLM hosts.
- **Selection/insert tokens are opaque.** A token is bound to a specific tab + element; main rejects mismatches.
- **No telemetry.** Period.

See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) for the full threat model.

## 10. Failure modes & degradation

| Failure | Behavior |
|---|---|
| No API key set | Defense/Attack buttons disabled; clicking shows a tooltip with "Open settings" CTA. |
| LLM API 5xx / timeout | One retry with backoff in main; renderer shows `evt:agent:error` → red banner in output frame. |
| Search API failure | Fact agent falls back to LLM-only; result card shows a yellow "unverified — no live search" badge. |
| Page preload not loaded (e.g., `about:blank`) | Selection/insert APIs return `{ ok: false }`; chat input is still usable. |
| `safeStorage.isEncryptionAvailable()` returns false | Settings drawer shows a banner: "OS keychain unavailable — keys will only be held in memory for this session." Don't silently fall back to plaintext on disk. |
| Tab crashes (Chromium oop renderer dies) | Tab shows a "page crashed — reload" card; main process unaffected. |
| Main process crashes | Window dies; on next launch we restore tab URLs from `session.json`. |

## 11. Performance notes

- Lazy-create `WebContentsView` per tab. Closed tabs deallocate.
- Output frame and chat frame mount on first invocation; not on app start.
- The settings drawer is rendered but `display: none` until first open — avoids paint cost while preserving form state.
- The vibe cache hit avoids the most expensive LLM call (vibe synthesis). Aim for > 80% hit rate after first week.
- Drawer animation runs on CSS `transform: translateX()` only — no JS-driven layout.

## 12. Open architectural questions

1. **Tab process model.** Do we use one `WebContentsView` per tab in a single window, or one `BrowserWindow` per tab? `WebContentsView` is the right answer for a single-window browser; `BrowserWindow` is the right answer for an Arc-style multi-window experience. MVP uses `WebContentsView`.
2. **Auto-update channel.** `electron-updater` with our own static GitHub releases, or a self-hosted feed. Defer until v0.2.
3. **Where does the omnibox search go?** MVP: hard-codes Google. Post-MVP: settings drawer entry.
4. **Multi-window.** Post-MVP. Adds tab-manager-per-window plumbing.
5. **Code signing on Windows.** Requires an EV cert ($300+/yr) for SmartScreen reputation. Either pay, or ship unsigned with a documented "more info → run anyway" path. Decision before v1.
6. **Chromium upgrade discipline.** Electron's major versions move every few months. Pin to a known-good Electron version per release; document the upgrade SOP in `docs_new_browser/`.

## 13. What this architecture is not

- Not a multi-process per-tab story we wrote. Chromium already does that; we just rely on it via `WebContentsView`.
- Not a custom rendering pipeline. We render web pages with stock Chromium.
- Not a privacy moat by itself. The privacy story comes from "no backend" + "OS keychain for secrets," not from the shell choice.
