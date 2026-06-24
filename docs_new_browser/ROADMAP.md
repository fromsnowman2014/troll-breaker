# Roadmap — Native Browser

> Phased delivery plan. Each phase has a goal, an explicit cut list, and an exit checklist. Scope cuts are features, not failures.

Compare with `../docs/ROADMAP.md` (extension roadmap). The native version follows a similar shape but with a much heavier Phase 0 (we have to build a browser shell before any feature lights up).

---

## Phase 0 — Browser shell, no agents

**Goal:** A dev can launch a single-window Electron app that renders any web page in a `WebContentsView`, with tabs and a URL bar that work.

In-scope:

- Electron scaffolded with TypeScript, Vite for the chrome renderer, `tsc` for main.
- `WebContentsView` per tab; one open tab on launch loading `about:blank`.
- Tab strip + URL bar + nav buttons rendering and wired to `tab_manager.ts`.
- Right-edge settings drawer **trigger** in place (button visible), but the drawer itself shows a placeholder "settings coming next."
- Page preload script loaded into every tab — exposes the three responders ([`ARCHITECTURE.md`](./ARCHITECTURE.md) §6) but main does not yet call any of them.
- All six spikes from [`TECH_STACK.md`](./TECH_STACK.md) §12 completed.
- `docs_new_browser/CODE_MAP.md` updated the moment the first real `.ts` lands.

Out of scope: any LLM call, any agent, any settings persistence beyond defaults, signing / packaging.

**Done when:** `pnpm dev` opens a window where the owner can browse `fmkorea.com`, click links, navigate back / forward, and close / reopen tabs. The right-edge button is visible and opens a placeholder drawer.

---

## Phase 1 — MVP: Defense Fast mode

**Goal:** Defense flow is usable end-to-end. Single keystroke = sourced answer in the active tab's vibe.

In-scope:

- Settings drawer (real): LLM provider + key + model picker + "Test connection." `safeStorage` integration. UX per [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §4.
- Agent panel (real): output frame + chat frame, hidden until 🛡 / ⚔ click.
- Defense **Fast** pipeline only:
  - `vibe.getSiteVibe(url)` against bundled seed corpora.
  - `fact.verifyFactWithLinks(claim)` via Brave Search + LLM summarize.
  - `vibe.rewriteInVibe(combined, vibe)` for the final rendered text.
- Anthropic LLM adapter + Brave Search adapter — lifted from `../src/lib/`.
- Bundled seed corpus for **one** site (owner's primary community, currently fmkorea). Generic Korean cynical fallback for everything else.
- Privacy / data-egress consent shown on first run (welcome page, [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §10).
- Session restore (tab URLs across launches).
- macOS + Windows builds via `electron-builder`. **Unsigned** in this phase.

Cut list (explicit):

- ✂ Attack mode entirely.
- ✂ Standard and Deep pipelines.
- ✂ Logic / fallacy detection.
- ✂ Chat refinement.
- ✂ Insert-back (no Attack means no need).
- ✂ Bookmarks, history search, downloads UI, multi-window.
- ✂ Code signing (you can run it yourself; users can't easily).

**Done when:** owner can browse `fmkorea.com`, type a claim in the chat input, click 🛡 Defense, and see a sourced response in fmkorea's tone within 8 s p95. Settings drawer survives relaunch.

---

## Phase 2 — Attack Fast mode + Refinement

**Goal:** Both modes available, both at Fast quality. Chat refinement lights up.

In-scope:

- Attack pipeline: `evaluator.scoreAndCritique` → `vibe.finalizeConceptPost`.
- "Insert back" affordance: chrome renderer asks the page preload to write the rewritten draft into the focused textarea. Token validation per [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.
- Chat refinement (Defense + Attack): natural-language refinement, single Haiku per turn, revert stack (5 deep).
- A second seed corpus profile (the next community owner uses heavily).

Cut list:

- Still no Logic agent.
- Still no Standard or Deep pipelines.
- Still no quick-action chips (the reserved space stays empty).

**Done when:** owner can write a 200-char draft in the chat input on a whitelisted community page, click ⚔ Attack, get a scored rewrite, apply it to a focused textarea with one click, and then chat-refine it ("더 짧게") in under 3 s.

---

## Phase 3 — Logic agent + quick actions + Standard pipeline

**Goal:** Real-debate quality. The product catches ad hominems and runs deeper on long posts.

In-scope:

- Logic agent: fallacy detection + counter-punch in Defense results.
- "Show vibe used" expandable section in result card.
- Quick-action chips below the chat input (`더 짧게`, `더 비꼬게`, `팩트 줄이기`, `펀치라인 강화`).
- Standard pipeline orchestration (`pickPipeline(text)` selects Standard for inputs > 500 chars).

Cut list:

- Deep mode (still v0.5+).
- Auto vibe refresh / opportunistic scraping (still on demand).

**Done when:** owner uses chat refinement on every other invocation, and Logic detection catches at least one real-world ad hominem during dogfood.

---

## Phase 4 — Vibe auto-refresh + per-site DOM extractors

**Goal:** Vibe profiles stay fresh without owner-hand intervention.

In-scope:

- Per-site DOM extractor specs in `docs_new_browser/site-extractors/` (or reuse `../docs/site-extractors/`).
- Background "vibe refresh" job: when the user navigates to a profiled site whose cache is > 5 days old, fetch best posts in the main process (cookie-aware), re-synthesize, write to cache.
- Source pinning + removal in the result card.
- More seed corpora: theqoo, ruliweb, dcinside (target: 4 total).

Cut list:

- Multi-claim Defense (claim splitter).
- Deep mode.

**Done when:** vibe profiles auto-refresh within a week of normal browsing, and owner stops manually re-curating seed corpora.

---

## Phase 5 — Polish, signing, public release

**Goal:** Ship to a release page. Public.

In-scope:

- macOS code signing + notarization.
- Windows EV signing.
- `electron-updater` auto-update against GitHub Releases.
- Privacy policy URL stable, linked from About.
- Error / empty states all designed per [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §11.
- A11y pass (focus rings, screen-reader labels, contrast).
- Onboarding flow polished (welcome page → drawer → first Defense).
- Linux AppImage built (unsigned by convention).
- README / DOWNLOAD page on the project site.

Cut list:

- Bookmarks (post-launch).
- Private window (post-launch).
- Multi-window (post-launch).
- Firefox-engine fork (never; we're Chromium).

**Done when:** the binary is downloadable from a release page, signed on mac + win, auto-updates work, and a clean-install user can complete the welcome → Defense → Attack flow.

---

## Post-launch — explicit "later" pile

Things worth doing eventually but not the critical path:

- **Bookmarks** (flat list, no folders). v0.2 candidate.
- **Private / incognito window.** v0.2.
- **Drag-reorder tabs / pinned tabs.** v0.2.
- **Multi-window.** v0.3 — adds tab-manager-per-window plumbing.
- **Download manager UI.** v0.3.
- **Vibe-override per-run UI.** Power users only.
- **Memory-only key mode.** Shared machines.
- **Usage / cost dashboard.** Counts tokens, surfaces cost per request.
- **Per-tab incognito.** Big partition-management work.
- **Custom search engine** in URL bar.
- **Reader mode.** Not aligned with mission, but cheap if asked.
- **Mac App Store / Windows Store distribution.** Sandboxing pain; defer indefinitely.
- **Vector DB / embeddings for vibe matching across unseen sites.** Only if seed-corpus growth stalls.
- **Mobile.** Not a realistic target until Tauri / WebView2 catches up.

## Phase exit checklist (template)

Each phase ends with:

```
[ ] Acceptance criteria met (per "Done when" above).
[ ] CODE_MAP.md reflects the new module layout.
[ ] All affected docs in /docs_new_browser updated.
[ ] No regressions in earlier-phase flows (manual smoke).
[ ] Owner dogfooded the new surface for ≥ 3 real uses.
[ ] Open questions for the next phase logged in the relevant doc.
[ ] Spikes for the next phase scoped (if any).
```

A phase isn't "done" until this checklist is checked.

---

## What this roadmap is not

- **Not a deadline plan.** No dates. Calendar without staffing data is fiction.
- **Not a contract.** If post-MVP feedback says "I need vibe auto-refresh before chat refinement," we shuffle.
- **Not exhaustive of every nice-to-have.** Critical path only; everything else lives in this doc's "post-launch" section or in per-doc "open questions."

---

## Cross-roadmap notes (extension vs native)

A user might run both the Chrome extension and the native browser. We make no promises about parity between them. Extension users who want the better surface migrate by:

1. Install Truth & Strike (native).
2. Enter the same API key in the drawer.
3. Optionally export bundled seed corpus from extension (`Export settings`) → import into native (post-v1).

The two share zod schemas at the source-code level, so cross-migration is cheap — but not user-visible until we ship import / export.
