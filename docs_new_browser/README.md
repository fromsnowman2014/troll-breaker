# Truth & Strike — Native Browser (Atlas-style)

> Successor to the Chrome extension version. Same core mission — fact-check (Defense) and draft-enhance (Attack) for online debates — packaged as a **standalone native browser** so we are no longer constrained by Manifest V3 rules, content-script CSP, or the Chrome Web Store policy surface.

---

## 1. Why a native browser, not an extension

The extension version (`/docs`) is functional, but every hard problem in that codebase eventually traces back to extension-platform constraints:

| Constraint in extension form | Removed in native browser |
|---|---|
| Service worker dies between events; cannot hold model state. | Long-lived main process; one in-memory cache for the whole session. |
| Content scripts share the page's origin and CSP; injected UI fights site styles. | Our UI is browser chrome, not page chrome. Zero style collisions. |
| Side panel API quirks per Chrome version. | We own the window — the side panel **is** the window. |
| `host_permissions` review, single-purpose policy, CWS approval cycles. | We ship binaries directly. |
| API key UX is awkward inside a popup. | First-class native settings drawer with OS keychain storage. |
| Cannot intercept context menu / shortcuts cleanly on every site. | Native menubar + global accelerators. |

We deliberately discard most of the extension's surface area (context menu, floating button, content script, MV3 service worker) and rebuild a **minimal browser** whose entire job is: load web pages + run the Attack/Defense agents on what is on screen.

## 2. North star UI

Inspired by ChatGPT Atlas (see `IMAGE_REFERENCE.md` if attached): a quiet, minimalist Chromium-style window with a single trailing "AI" affordance. No tabs explosion, no toolbar clutter, no extension icons. The agent panel is hidden until summoned.

Four — and only four — visible surfaces:

1. **Browser viewport** (URL bar + tabs + content). Behaves like Chrome.
2. **Right-edge slide-out settings drawer** — LLM provider + API key + model picker. Hidden by default. Toggled by a single gear/sparkle button on the right edge. Closes on the X button or any click on the main viewport (light-dismiss).
3. **Output frame** — the result panel where Defense (fact-check + sources + counter-punches) and Attack (score + final rewrite) results render.
4. **Chat frame** — `[🛡 Defense] [⚔ Attack]` buttons + a free-form input. This is how the user invokes pipelines and refines results.

That's the whole product. Anything not on this list belongs in "later" until v1.

## 3. Relationship to the extension docs

The agent design (Vibe / Fact / Logic / Evaluator) and the data contracts (`VibeProfile`, `FactResult`, `Fallacy`, `EvalScore`) are **inherited verbatim** from `/docs`. Reuse, don't rewrite. New docs in this folder cover only what the platform change actually changes: shell, surfaces, IPC, settings drawer UX, OS-level secret storage, packaging/distribution.

Where a topic is unchanged from the extension version, we link to the extension doc rather than duplicate it.

| Topic | Where to read |
|---|---|
| Agent roster, pipelines, tool-use shape | `../docs/AGENT_DESIGN.md` (inherited) |
| Prompt structure and caching policy | `../docs/PROMPT_GUIDELINES.md` (inherited) |
| Vibe extraction / few-shot strategy | `../docs/VIBE_EXTRACTION.md` (inherited) |
| Site-extractor specs | `../docs/site-extractors/` (inherited) |

Everything below is new and lives in this folder.

## 4. Document index

| # | File | What it answers |
|---|---|---|
| 1 | [`PRD.md`](./PRD.md) | What we are building and why. Feature scope, non-goals, success criteria. |
| 2 | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Native browser shell, process model, IPC, module tree. Chromium-embedding choice. |
| 3 | [`BROWSER_CORE.md`](./BROWSER_CORE.md) | Web-browser-as-a-browser requirements. Tabs, navigation, history, find-in-page, downloads. MVP cut list. |
| 4 | [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) | Surface-by-surface UX. Settings drawer animation/dismiss model. Output frame. Chat frame. Atlas-style chrome. |
| 5 | [`TECH_STACK.md`](./TECH_STACK.md) | Electron vs Tauri vs CEF. React + Tailwind. BYOK provider adapters. Build/packaging. |
| 6 | [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) | Native-shell-flavored pipeline notes. Diffs against extension AGENT_DESIGN. |
| 7 | [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) | OS keychain (Electron `safeStorage` / Tauri stronghold). Threat model deltas. |
| 8 | [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md) | Settings, IPC payloads, AttackRequest/Response, DefenseRequest/Response, ChatTurn. |
| 9 | [`ROADMAP.md`](./ROADMAP.md) | Phased delivery. MVP → v0.1 → v1. Phase exit checklists. |
| 10 | [`CODE_MAP.md`](./CODE_MAP.md) | Intended module tree. Becomes the live index once code lands (CLAUDE.md protocol). |

## 5. How to use this folder

- Read in order: PRD → ARCHITECTURE → BROWSER_CORE → UI_UX_SPEC → TECH_STACK. The rest are reference.
- When code starts landing, update `CODE_MAP.md` in the same commit that changes structure. The CLAUDE.md "Source Code Map" protocol applies to this folder too.
- Open questions live in each doc's final section. Resolve and remove rather than letting them rot.

## 6. Naming

The product retains the **Truth & Strike** name. Internal codename for the native shell: **Atlas-T&S** (a working title — change if it conflicts with anything trademarked).
