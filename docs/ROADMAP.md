# Roadmap

Phased delivery plan. Each phase has a goal, an explicit cut list, and a definition of done. Treat scope cuts as features, not failures.

## Phase 0 — Foundation (no user-facing product)

**Goal:** Repo is wired so a dev can run the extension locally with HMR and ship a build.

In-scope:
- Vite + `@crxjs/vite-plugin` (or Plasmo, per [`TECH_STACK.md`](./TECH_STACK.md) §1) scaffold.
- TypeScript + ESLint + Prettier configured.
- Empty service worker, content script, side panel, options page — all wired into `manifest.json`.
- `pnpm dev` loads the unpacked extension; `pnpm build` produces a store-ready zip.
- Three tech spikes from [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §7 completed.
- `docs/CODE_MAP.md` created at the moment the first real source file lands, per [`CLAUDE.md`](../CLAUDE.md).

Out of scope: any agent logic, any LLM call, any real UI.

**Done when:** a dev can install the unpacked extension, see the toolbar icon, and open an empty side panel.

---

## Phase 1 — MVP: Shield Fast mode

**Goal:** Single-flow proof-of-life. User can fact-check selected text and see a result, even if rough.

In-scope:
- Context menu "Truth Check" wired through service worker → orchestrator.
- Single-call **Fast pipeline** only (see [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) §3).
- TheGrid LLM adapter (via Vercel proxy `/api/chat`). Brave Search adapter (dev smoke only for now).
- Options page: preferences and per-site whitelist only. **No key entry.**
- Side panel shows a minimal result card (verdict, summary, 1–3 sources).
- Bundled seed corpus for **one** site only (pick the owner's home community).
- Generic Korean cynical fallback profile for everything else.
- Privacy disclosures shown on first run.

Cut list (explicit):
- ✂ Sword mode entirely.
- ✂ Standard and Deep pipelines.
- ✂ Logic / fallacy detection.
- ✂ Chat refinement.
- ✂ Multi-site whitelist.
- ✂ Per-site DOM extractors / opportunistic scraping. (We only ship the seed corpus.)
- ✂ Source pinning, source removal, quick-action chips.

**Done when:** owner can right-click text on any site, click "Truth Check," and see a sourced response in their home community's tone within 6 seconds, p50.

---

## Phase 2 — Sword Fast mode

**Goal:** Both modes available, both at Fast quality.

In-scope:
- Content script injects floating button on whitelisted hosts.
- Sword pipeline: evaluator (4-axis score) + final rewrite.
- "Insert back" affordance writes rewritten draft into the originating textarea.
- Per-site whitelist UI in options.
- A second seed corpus profile (second-priority community).

Cut list:
- Still no chat refinement.
- Still no Logic agent.
- Still no Standard or Deep pipelines.

**Done when:** owner can write a 200-char draft in a whitelisted community's textarea, click the floating button, and see a scored rewrite they'd actually post — and apply it with one click.

---

## Phase 3 — Chat refinement + Logic agent

**Goal:** The product becomes interactive instead of one-shot. Fallacy detection lands.

In-scope:
- Chat input in side panel — natural-language refinements.
- Quick-action chips ("더 짧게", "더 비꼬게", etc.).
- Revert stack (last 5 versions).
- Logic agent: fallacy detection + counter-punch suggestions in Shield results.
- "Show vibe used" expandable section in result card.

Cut list:
- Standard / Deep pipelines (still Fast only).
- Multi-claim Shield (still one claim per invocation).

**Done when:** owner uses the chat refinement on every other invocation, and the fallacy detection catches an ad hominem in a real debate.

---

## Phase 4 — Standard pipeline + opportunistic scraping

**Goal:** Quality jump for longer / harder cases. Vibe profiles update themselves while the owner uses real communities.

In-scope:
- Standard pipeline orchestration (vibe cache → parallel Fact + Logic → Rewrite).
- Auto-select Fast vs Standard based on input length and pipeline preference.
- Per-site DOM extractors for the seeded communities.
- Opportunistic best-post sampling → vibe cache merge.
- Vibe profile management UI in options (refresh, reset, edit).
- Source pinning + source removal.

Cut list:
- Deep mode (still v5+).
- User-curated profile sharing (never in v0–v5).

**Done when:** vibe profiles auto-refresh within a week of normal use, and the owner stops manually re-curating the seed corpus weekly.

---

## Phase 5 — Polish + Store launch

**Goal:** Ship to the Chrome Web Store. Public.

In-scope:
- Deep Analyze mode toggle in options + per-invocation override.
- Multi-claim Shield (claim splitter).
- Listing assets ready (see [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §10).
- Privacy policy URL stable.
- Onboarding flow polished, first-run consent screen.
- Error states and empty states all designed.
- At minimum: 4 seed corpora (fmkorea, dcinside, theqoo, ruliweb) shipped.
- A11y pass (focus rings, screen reader labels, contrast).

Cut list:
- Firefox port.
- i18n beyond Korean/English.
- Analytics / telemetry.

**Done when:** the extension is listed on the Chrome Web Store and the owner can install it from a clean profile via the store, not unpacked.

---

## Post-launch — explicit "later" pile

Things worth doing eventually but not the critical path:

- **Firefox port.** Different sidebar API, different manifest.
- **Mobile.** Chrome Android extensions are very limited; revisit when state of the world changes.
- **Shared vibe profiles.** Community curation with moderation. Needs a backend, abuse mitigation. Big project.
- **Usage dashboard.** Per-request cost / token counts surfaced to the user.
- **Conversation history persistence.** Currently session-only by design.
- **Provider abstraction beyond TheGrid.** Direct Anthropic / OpenAI / Gemini adapters if we hit gateway limits.
- **Proxy rate limiting** (Vercel KV / Upstash) — add when invocation traffic warrants.
- **`/api/search` proxy for Brave** so production extension can fact-check without BYOK.

---

## Phase exit checklist (template)

Each phase ends with:

```
[ ] Acceptance criteria met (per "Done when" above).
[ ] CODE_MAP.md reflects the new module layout.
[ ] All affected docs in /docs updated.
[ ] No regressions in earlier-phase flows.
[ ] Owner dogfooded the new surface for ≥ 3 real uses.
[ ] Open questions for the next phase logged in the relevant doc.
```

A phase isn't "done" until this checklist is checked.

---

## What this roadmap is not

- **Not a deadline plan.** No dates. Dates without staffing data are fiction.
- **Not a contract.** If user feedback after Phase 1 says "I need fallacy detection more than Sword," we shuffle. Sequence is a default, not a vow.
- **Not exhaustive of every nice-to-have.** It's the critical path. Everything else lives in [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) or in per-doc "open questions" sections.
