# Data Schemas — Native Browser

> Typed contracts at every boundary: IPC channels, settings, on-disk cache. Source of truth for what crosses processes.

When code lands, these become zod schemas in `src/main/shared/schemas/` and are imported by both main and renderer.

The agent-domain types (`VibeProfile`, `FactResult`, `Fallacy`, `EvalScore`, `ShieldResult`, `SwordResult`, `Source`) are **identical to `../docs/DATA_SCHEMAS.md` §1** and not repeated here. Read that doc for the agent-domain shape.

---

## 1. What changes vs the extension

| Topic | Extension | Native browser |
|---|---|---|
| Cross-process messaging | `chrome.runtime.sendMessage` discriminated union | Electron IPC channels + zod-validated payloads (this doc §3). |
| Settings shape | `Preferences` in `chrome.storage.local` | `Settings` in `userData/settings.json` (this doc §2). |
| Secrets | `chrome.storage.local["secrets"]` with derived-key encryption | `userData/secrets.bin` via `safeStorage` (no schema — opaque bytes per provider). |
| Storage TTLs | `chrome.storage` API quirks | `fs/promises` + mtime checks. |
| `tab_id` / `tab.url` | Provided by Chrome APIs | Maintained by `tab_manager.ts` (this doc §4). |

Everything below is new.

## 2. Settings

The user-tunable config persisted across launches. Lives at `userData/settings.json` (plain JSON, no secrets).

```ts
Settings {
  schema_version: number           // currently 1; bumped on breaking changes
  llm: {
    provider: "anthropic" | "openai" | "google"
    model_id: string               // e.g., "claude-sonnet-4-6"
    // No api_key field — keys live in safeStorage, not here.
  }
  search: {
    provider: "brave" | "disabled"
  }
  vibe: {
    default_site_id: string        // fallback when active URL has no profile
  }
  ui: {
    theme: "system" | "light" | "dark"  // MVP: "system" only; switcher post-MVP
    language: "ko" | "en"               // primary UI language
    panel_position: {
      docked: boolean              // true = bottom-right docked, false = floating
      x?: number                   // only used when docked=false
      y?: number
    }
  }
  privacy: {
    https_only: boolean            // default true
    persist_history: boolean       // default false (session-only history)
  }
}
```

Invariants:
- `provider` and `model_id` must agree (a `model_id` must exist in the static catalog of the chosen `provider`). Validation rejects mismatches.
- `panel_position.x` / `.y` only valid when `docked === false`.

Read path: validated against `SettingsSchema` on load; invalid file → reset to defaults + back up the bad file to `settings.json.bak` for debugging.

### Sanitized view exposed to the renderer

The chrome renderer never sees secrets, but does need a UI hint that a key is set. Main exposes:

```ts
SettingsView {
  ...Settings,
  key_present: {
    llm:    { present: boolean, last4?: string }
    search: { present: boolean, last4?: string }
  }
  encryption_available: boolean    // false → renderer shows the keychain banner
}
```

Renderer never receives the actual key. Mutations go through dedicated IPC channels (§3).

## 3. IPC channels

All channels are namespaced. The discriminated union is exhaustive — adding a feature = adding a channel = adding a router case.

### 3.1 Tabs (renderer → main)

```ts
"ui:tab:open"      → { url?: string }                              → { tab_id: string }
"ui:tab:close"     → { tab_id: string }                            → { ok: true }
"ui:tab:switch"    → { tab_id: string }                            → { ok: true }
"ui:tab:navigate"  → { tab_id: string, url: string }               → { ok: true }
"ui:tab:reload"    → { tab_id: string, hard?: boolean }            → { ok: true }
"ui:tab:back"      → { tab_id: string }                            → { ok: true }
"ui:tab:forward"   → { tab_id: string }                            → { ok: true }
"ui:tab:list"      → {}                                            → TabSummary[]

TabSummary {
  tab_id: string
  url: string
  title: string
  favicon_url?: string
  is_loading: boolean
  can_go_back: boolean
  can_go_forward: boolean
}
```

### 3.2 Settings & drawer (renderer → main)

```ts
"ui:drawer:open"    → {}                                        → { ok: true }
"ui:drawer:close"   → {}                                        → { ok: true }
"ui:settings:get"   → {}                                        → SettingsView
"ui:settings:set"   → Partial<Settings>                         → SettingsView
"ui:settings:put_key"   → { which: "llm" | "search", key: string }  → { ok: true }
"ui:settings:clear_key" → { which: "llm" | "search" }               → { ok: true }
"ui:settings:test_llm"  → {}      → { ok: boolean, latency_ms?: number, error?: string }
"ui:settings:reset_all" → {}      → SettingsView
"ui:settings:clear_browsing_data" → { cookies?: boolean, cache?: boolean, history?: boolean } → { ok: true }
```

### 3.3 Agents (renderer → main)

```ts
"ui:agent:defense" → DefenseRequest    → { request_id: string }
"ui:agent:attack"  → AttackRequest     → { request_id: string }
"ui:agent:refine"  → RefineRequest     → { request_id: string }
"ui:agent:cancel"  → { request_id: string }  → { ok: true }
```

Request shapes:

```ts
DefenseRequest {
  // input source resolved by the renderer per UI rules (PRD §6.1)
  claim: string                  // ≤ 2_000 chars; longer is rejected
  page_url: string               // active tab's URL at click time
  textarea_token?: string        // populated if there is a focused page textarea (for parity with attack; reserved)
  pipeline_hint?: "fast" | "standard" | "deep"   // optional override; MVP ignores → fast
}

AttackRequest {
  draft: string                  // ≤ 4_000 chars
  page_url: string
  textarea_token?: string        // present if user has a focused page textarea; enables Insert button
  pipeline_hint?: "fast" | "standard" | "deep"
}

RefineRequest {
  prior_request_id: string       // must reference a prior defense or attack result still alive in session
  instruction: string            // ≤ 500 chars
}
```

### 3.4 Agent events (main → renderer)

Emitted on the per-window `webContents`:

```ts
"evt:agent:progress" { request_id: string, stage: AgentStage, label?: string }
"evt:agent:result"   { request_id: string, payload: ShieldResult | SwordResult | RefineResult }
"evt:agent:error"    { request_id: string, error: AppError }

AgentStage =
  | "vibe.lookup"
  | "fact.check"
  | "logic.detect"
  | "vibe.rewrite"
  | "evaluator.score"
  | "vibe.finalize"
  | "refine.rewrite"
```

`ShieldResult` and `SwordResult` are inherited verbatim from `../docs/DATA_SCHEMAS.md` §1.

```ts
RefineResult {
  request_id: string             // matches the refine request
  prior_request_id: string       // ties back to the original Defense/Attack result
  refined_text: string           // replaces the visible text in the output frame
}
```

### 3.5 Tab events (main → renderer)

```ts
"evt:tab:title"          { tab_id: string, title: string }
"evt:tab:url"            { tab_id: string, url: string }
"evt:tab:loading"        { tab_id: string, is_loading: boolean }
"evt:tab:favicon"        { tab_id: string, favicon_url: string }
"evt:tab:focus_changed"  { tab_id: string }
"evt:tab:crashed"        { tab_id: string, reason: string }
"evt:tab:closed"         { tab_id: string }
```

### 3.6 Page preload (page renderer ↔ main)

The preload exposes a single namespaced object on the page's `window` via `contextBridge`. From the **main** process side, these are addressed by `webContents.send` / `webContents.invoke` against a tab's web contents.

```ts
"page:selection:get"     → {}                              → { text: string, url: string }
"page:textarea:focused"  → {}                              → { has_focus: boolean, token?: string, hint?: string }
"page:textarea:insert"   → { token: string, text: string } → { ok: boolean, reason?: string }
```

`token` is opaque, generated in the preload on `focus` of a textarea / contenteditable, with a 120-s TTL. Main validates `token` before forwarding to insert.

`hint` is a short human-readable description of the focused element ("Comment box on fmkorea.com"), shown in the UI to confirm what the user is about to write into.

### 3.7 Error shape

Every error event uses the same shape:

```ts
AppError {
  code:
    | "no_api_key"
    | "llm_unreachable"
    | "search_unreachable"
    | "schema_validation_failed"
    | "timeout"
    | "cancelled"
    | "page_preload_unavailable"
    | "textarea_token_stale"
    | "input_too_long"
    | "encryption_unavailable"
    | "unknown"
  message: string                // user-safe (shown verbatim in banners)
  details?: unknown              // dev-only, never displayed
}
```

## 4. Tab manager state (main process)

Not crossing IPC — internal to main. Captured here because the tab IDs / URLs leak into `TabSummary` and the agent requests.

```ts
Tab {
  tab_id: string                 // ulid; stable for the tab's lifetime
  view: WebContentsView          // Electron object
  history_index: number          // mirrors webContents history
  is_loading: boolean
  title: string                  // last known
  url: string
  favicon_url?: string
  created_at: number
  closed_at?: number
}
```

The tab manager emits `evt:tab:*` events to the chrome renderer whenever any field changes.

## 5. On-disk cache

| Path | Shape | TTL |
|---|---|---|
| `userData/settings.json` | `Settings` | persistent |
| `userData/secrets.bin` | encrypted bytes (per `safeStorage`) | persistent |
| `userData/session.json` | `{ tabs: [{ url, title }], active_index: number, written_at: ISO8601 }` | persistent |
| `userData/cache/vibe/<site_id>.json` | `VibeProfile` (extension §1) | 7 d (mtime) |
| `userData/cache/fact/<sha256>.json` | `FactResult` (extension §1) | 24 h (mtime) |

Read flow: open file → parse JSON → validate against schema → use. On any parse / validation error, treat as cache miss and overwrite on the next write.

Write flow: write to `<path>.tmp` → fsync → rename to `<path>`. Atomic.

## 6. Schema versioning

Rules carry over from `../docs/DATA_SCHEMAS.md` §5 with one addition: **IPC payload changes** are now first-class breaking-change candidates. Rules:

- Adding an **optional** field to a request or response is non-breaking. Ship it.
- Adding a **required** field is breaking. Bump `schema_version` in `Settings`, and add a renderer-side guard that refuses to invoke until both sides agree on the version (renderer reads its bundled version, main reads its own; mismatch → log + safe fallback).
- Adding a new IPC channel is non-breaking (the renderer simply doesn't call it on old main).
- Removing or renaming a channel is breaking. Same `schema_version` bump.
- Removing or renaming a field on an existing event payload is breaking.

`schema_version` currently `1`. Bump in this doc and in the migration file together.

## 7. What is deliberately NOT modeled

- **Refinement conversation history.** Lives in `chrome-renderer/state/chat.ts` only. Session-bound. Not a wire schema.
- **Per-request usage / cost.** Provider responses include token counts; we don't expose them to the renderer in MVP. Add a `cost_breakdown` field on `ShieldResult` / `SwordResult` in v0.2 if we build a usage dashboard.
- **User identity.** There is no user account. There is a single OS user with a single app install. Don't introduce a `user_id`.
- **Multi-window state.** Single-window in MVP. `window_id` will be added when v0.3 multi-window lands.

## 8. Validation policy

- Every IPC request and event is validated against its zod schema **on receipt** at the receiving side (main validates requests; renderer validates events).
- Schema mismatch is a hard error: `AppError { code: "schema_validation_failed" }`. No silent best-effort parsing.
- Validation happens before the value reaches any business logic. The router is the validation layer.

## 9. Example end-to-end payload trace — Defense

```
1. User types "이거 진짜야?" into chat input, presses 🛡 Defense.
2. Renderer reads:
   - chat input → claim
   - active tab url
   - any focused page textarea → no
3. Renderer sends:
   "ui:agent:defense" → { claim: "이거 진짜야?", page_url: "https://fmkorea.com/best/..." }
4. Main validates → assigns request_id "01HBK...XYZ"
5. Main responds: { request_id: "01HBK...XYZ" }
6. Main starts orchestrator.runDefense, emits:
   "evt:agent:progress" { request_id, stage: "vibe.lookup", label: "사이트 분위기 파악 중…" }
   "evt:agent:progress" { request_id, stage: "fact.check", label: "사실 확인 중…" }
   "evt:agent:progress" { request_id, stage: "vibe.rewrite", label: "톤 적용 중…" }
7. Main emits:
   "evt:agent:result" { request_id, payload: ShieldResult { ... } }
8. Renderer renders DefenseCard with payload.
9. User types "더 짧게" into chat input, presses Enter.
10. Renderer sends:
    "ui:agent:refine" → { prior_request_id: "01HBK...XYZ", instruction: "더 짧게" }
11. Main re-runs vibe.rewriteInVibe; emits "evt:agent:result" with RefineResult.
12. Renderer replaces the visible text; sources untouched.
```

The trace is the contract. Any deviation breaks the renderer.
