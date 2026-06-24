# Tech Stack — Native Browser

> Concrete tech choices, rationale, and what we'd swap to if a choice goes sideways. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3 (shell choice) first.

Each item flagged **DR** (Decision Required) is a stake the owner should drive before code is written.

---

## 1. Shell — Electron (latest LTS)

**Choice:** Electron, pinned to the most recent **LTS major** at code-start time.

| Why | Tradeoff |
|---|---|
| `WebContentsView` lets us host arbitrary web pages inside our own React chrome — the exact shape PRD §4 needs. | Each Electron major bundles its own Chromium; we pay a ~150 MB install footprint. |
| `safeStorage` API maps to Keychain / DPAPI / libsecret — exactly the storage tier we want for keys. | `safeStorage` on Linux requires a configured keyring; falls back to plaintext if missing. We refuse the fallback (see [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §3). |
| `contextBridge` + `contextIsolation` are mature; we already know how to do typed IPC. | Easy to misuse — strict review on every new IPC channel. |
| `electron-builder` handles signing, notarization, auto-update infrastructure on mac + win. | EV certs cost money (Windows) and a paid Apple Developer account ($99/yr). |

**DR-1:** Confirm Electron over Tauri. Tauri's smaller-binary story is appealing but it forces us off Chromium-on-mac, which breaks "act like Chrome" rendering parity. Tauri stays in the back pocket if Electron's footprint is a real user complaint.

**DR-2:** Pick the **major** version at code-start. Default to "latest LTS" — never the bleeding edge non-LTS. Upgrade cadence: at least once per Electron LTS release.

**Not chosen:**

- **Tauri 2** — bundling Chromium ourselves negates the size advantage and adds plumbing we don't need.
- **CEF from scratch** — months of window/tab/IPC plumbing.
- **Wails (Go + webview)** — same OS-webview problem as Tauri, worse community for desktop browser shells.

## 2. Language + frameworks

| Layer | Pick | Why | Alternative |
|---|---|---|---|
| Main process | TypeScript (Node 22+) | Same language as renderer; share schemas trivially. | — |
| Chrome renderer | React 18 + Vite | Fast HMR, ecosystem, idiomatic for the team. | Solid (smaller, less ecosystem). |
| State (renderer) | Zustand | Simple, no boilerplate, good fit for "panel state + chat history." | Jotai if we want atom-level granularity later. |
| Styling | Tailwind CSS + a tiny token layer (CSS variables for theme) | Atlas-style cleanliness needs design-tokens-as-CSS-vars; Tailwind utility classes do the rest. | Vanilla CSS modules (slower iteration). |
| Components | **No design system.** Build the ~12 components by hand using Tailwind. Lift small pieces from shadcn/ui if useful (button, dialog, dropdown). | Material / Chakra would dictate a look we don't want. |
| Schemas | Zod | Runtime validation at every IPC boundary. Shared TS types. | — |
| IPC plumbing | Native `ipcMain` / `ipcRenderer` + `contextBridge` | Avoid wrappers; one less abstraction to reason about for security. | `electron-trpc` (overkill for ~15 channels). |
| Build | Vite (renderer) + tsc (main) | Vite for HMR speed; main process is small TS that just needs `tsc`. | Electron Forge bundles everything; OK but more opinionated. |
| Packaging | electron-builder | Signing + notarization + auto-update DSL is best-in-class. | Electron Forge (sufficient; less plumbing for AU). |

## 3. LLM providers

Inherit the adapter pattern from `../docs/CODE_MAP.md` — `lib/llm/{types,structured,anthropic,gemini,openai}.ts`. The native shell does not change agent semantics; it just lives in a longer-running process.

**Default provider (MVP):** Anthropic (Claude).

| Tier | Default model | Used for |
|---|---|---|
| Fast | `claude-haiku-4-5` | Vibe rewrite, chat refinement, Defense Fast pipeline. |
| Standard | `claude-sonnet-4-6` | Evaluator, logic, fact summarize. |
| Deep (opt-in) | `claude-opus-4-7` | Deep Analyze mode (post-MVP). |

User can override per-tier in the settings drawer. Provider list in MVP: Anthropic / OpenAI / Google (Gemini). The adapters all conform to one `LlmClient` interface; the orchestrator does not know which is in use.

**DR-3:** Confirm Anthropic as MVP default. The extension version already chose this.

## 4. Search provider

Inherit `lib/search/`. **Default:** Brave Search.

| Why Brave | Tradeoff |
|---|---|
| Independent index; clean URL + snippet output. | Korean-query quality varies — measure in smoke tests. |
| Free tier sufficient for individual debate use. | Quota is per-user (BYOK) — they handle limits. |

**DR-4:** Confirm Brave as default. Alternative: Google CSE (better Korean, lower free tier).

## 5. Storage stack

| What | Where | Format |
|---|---|---|
| Settings (no secrets) | `userData/settings.json` | JSON, schema-validated on read. |
| API keys | `userData/secrets.bin` | Bytes from `safeStorage.encryptString()`. |
| Vibe cache | `userData/cache/vibe/<site_id>.json` | JSON, mtime-based TTL. |
| Fact memo | `userData/cache/fact/<sha256>.json` | JSON, mtime-based TTL. |
| Tab session | `userData/session.json` | JSON, written on shutdown. |
| Bundled seed corpora | resources path (read-only) | JSON. |

Why no SQLite or IndexedDB: amounts are tiny (KBs), shapes are flat, and JSON-per-file makes manual inspection trivial during dev.

`userData` resolves to:
- macOS: `~/Library/Application Support/<AppName>/`
- Windows: `%APPDATA%\<AppName>\`
- Linux: `~/.config/<AppName>/`

## 6. Testing

- **Unit tests:** Vitest. Mock LLM and search adapters. Cover orchestrator, agent input/output, IPC schema validation. Same approach as extension tests.
- **Renderer component tests:** Vitest + Testing Library. Snapshot on small components only (cards, buttons).
- **E2E:** Playwright + `electron` driver. Smoke test on each platform: launch app, open settings, enter a fake key, send a Defense request against a mocked main process.
- **Eval suite:** inherited from `../docs/PROMPT_GUIDELINES.md` §6. Run separately, against real keys, opt-in (not in CI by default).

CI matrix: macOS-latest + windows-latest, both with Node 22 + the pinned Electron major. Linux (Ubuntu) builds but not auto-released in MVP.

## 7. Build, signing, distribution

### 7.1 Build

- `pnpm dev` — runs the main process with Vite dev server for the renderer. HMR for chrome renderer.
- `pnpm build` — `tsc` for main, `vite build` for renderer, `electron-builder` for the final binary.
- Outputs: `dist/Truth & Strike-<version>-mac.dmg`, `dist/Truth & Strike Setup <version>.exe`, `dist/Truth & Strike-<version>.AppImage`.

### 7.2 Code signing

- **macOS:** Apple Developer ID + notarization via `notarytool`. Required for Gatekeeper to not block.
- **Windows:** EV code-signing certificate for SmartScreen reputation. Standard certs cost less but require months of reputation build-up.
- **Linux:** AppImage is unsigned by convention; `.deb` / `.rpm` can be signed but most users sideload.

**DR-5:** Acquire signing certs before v1. Tracked in [`ROADMAP.md`](./ROADMAP.md) Phase 5. Owner action.

### 7.3 Distribution

- **MVP:** GitHub Releases page. Manual download. No auto-update.
- **v0.2:** Add `electron-updater` against the same GitHub Releases feed.
- **v1:** Optional dedicated download page on a static site.

We do not target stores (Mac App Store, Microsoft Store) — sandboxing rules conflict with running an embedded Chromium.

## 8. Dependencies budget

Minimize total dependency count. Hard caps that trigger a discussion:

- **>50 direct deps** in `package.json` → simplify before adding more.
- **Any single dep >1 MB unpacked** → audit if necessary.
- **No telemetry-bearing libs.** Inspect `package.json` of any new lib for `analytics`, `tracking`, `bugsnag`, etc.

Pinned via `pnpm-lock.yaml`. Renovate bot for updates with manual review.

## 9. What we are explicitly NOT using

- **No backend server.** Identical to extension policy.
- **No analytics SDK.** Privacy default.
- **No CRDT / sync framework.** Single-device.
- **No vector DB.** Vibe few-shots fit in a prompt.
- **No state management beyond Zustand.** Redux is over-engineering for this scale.
- **No router.** The chrome renderer is one screen; views are conditionally rendered.
- **No i18n framework yet.** Korean + English strings in a single `strings.ts` map. Add `i18next` if a third language is requested.
- **No Sentry / crash reporter SaaS.** Crashes go to OS reports. If we ever add one it's opt-in and self-hosted.

## 10. Versioning policy

Semantic versioning, but with intent:

- `0.x.y` — pre-v1. Breaking IPC / schema changes allowed between minors with a migration in `lib/storage/migrations.ts`.
- `1.0.0` — first user-facing public release. From here, IPC is a contract.
- `schema_version` in `Settings` bumps on breaking storage changes. Migration runs at startup before any read.

## 11. Open tech questions

1. **Electron version cadence.** Pin to LTS; upgrade once per major LTS cycle. Who owns the upgrade SOP?
2. **Auto-update channel.** GitHub Releases via `electron-updater` is simplest. Anything fancier (delta updates, A/B channels) is out of MVP.
3. **Provider tool-use catalog.** Each LLM provider's tool-use schema mutates slowly; adapter must abstract it. Already done in the extension; lift as-is.
4. **Brave Search rate limiting** under BYOK. Each user owns their key; we add a defensive cache layer for repeat claims (24h, see `lib/storage`).
5. **Chromium feature parity testing.** Do we maintain a "compat checklist" of community sites (fmkorea, dcinside, theqoo, ruliweb, namu wiki) and verify they render correctly on each release? Yes — small Playwright suite, runs on PR.
6. **Crash recovery quality.** Native crash → OS dialog; should we add an in-app "send report" CTA? Not in MVP; the binary is small enough that the user just relaunches.

## 12. 30-day spike list (before code lock)

These confirm the riskiest assumptions:

| Spike | Question it answers | Time budget |
|---|---|---|
| Electron `WebContentsView` tab strip | Can we route per-tab navigation events cleanly to React state? | 1 day |
| `safeStorage` on macOS, Windows, Linux | Does encryption succeed on all three with no user config? On Linux without keyring, do we get a clean failure? | 0.5 day |
| LLM adapter port from extension | Do the extension's adapters work unmodified in Node 22 (no `fetch` polyfills, no service-worker hacks)? | 0.5 day |
| Brave Search latency from KR | p50 / p95 from Korea. Acceptable if < 1 s p95. | 0.5 day |
| Page preload selection/insert | Does our 3-message preload work on fmkorea, theqoo, naver without site CSP breaking it? | 1 day |
| `electron-builder` mac notarization | Full sign + notarize on a sample build. Confirms we can ship. | 1 day |

Three days total. If any spike fails, we revisit the stack before scaling.
