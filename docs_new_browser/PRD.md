# [PRD] Truth & Strike — Native Browser

> Read [`README.md`](./README.md) first for the why-not-extension context.
> The product mission (fact-based cynicism, vibe-aware tone) is unchanged from `../docs/PRD.md`. This document re-anchors the **product surface** to a native browser shell.

---

## 1. Product summary

Truth & Strike is a **standalone desktop web browser** with one differentiator: a built-in pair of debate agents.

- **🛡 Defense** — fact-checks the claim currently on screen (selected text or visible page content), returns cited sources, flags logical fallacies, and renders the rebuttal in the host site's tone.
- **⚔ Attack** — takes the user's draft, scores it on a 4-axis rubric (Cynicism / Fact / Punchline / Vibe), and rewrites it into a "concept post" of the host community.

Everything else the browser does is "be a normal browser." We are not building a new rendering engine, a new bookmarks system, a new sync product, or a new ad blocker.

## 2. Why this exists (Concept)

Online debaters spend most of their time context-switching: copy a claim into a search bar, skim three articles, paste a counter into the textarea, reword to fit the community. Truth & Strike collapses that loop into one keystroke, and uses the host community's own tone so the response actually reads as native.

The Chrome extension version (see `../docs`) proved the agents work. It also proved the extension surface is the wrong delivery vehicle: service-worker amnesia, CSP fights with content scripts, and BYOK key UX shoved into a popup. A native shell removes those frictions in exchange for the cost of building a browser shell.

## 3. Core philosophy

Carried over from `../docs/PRD.md` §2, restated for emphasis:

- **Context is King.** The active URL determines the vibe profile used for every output.
- **Fact-based Cynicism.** Every defense and attack is grounded in citable sources; the *delivery* is the community's signature tone.
- **The user is the editor; the LLM is the writer.** Outputs are never auto-applied. The user copies, edits, or chats them into shape.

Two additions native to this version:

- **Quiet by default.** The agent UI is hidden until summoned. A user who only wants to browse should not see the panel.
- **One window, one debate.** The current tab's URL is the only context the agents care about. We do not scan other tabs.

## 4. In scope (MVP)

### 4.1 Browser-as-a-browser (minimum viable)

We implement only what a debater actually needs while browsing community forums:

- Multiple tabs (open, close, switch, reorder).
- URL bar with omnibox: type URL → navigate; type query → search via configured search engine.
- Back / forward / reload.
- Find-in-page (`Cmd/Ctrl+F`).
- Page zoom (`Cmd/Ctrl + / -`).
- Basic history (session-local list; cleared on quit unless user enables persistence).
- Cookies + localStorage per-origin, isolated profile.
- HTTPS-only by default; user can override per-page.
- Downloads (open in OS default app; no in-browser download manager UI in MVP).

Full requirements + cut list in [`BROWSER_CORE.md`](./BROWSER_CORE.md).

### 4.2 Agent surfaces

Exactly three:

1. **Right-edge slide-out settings drawer**
   - Single trigger button on the right edge of the chrome (gear / sparkle icon).
   - Slides in from the right, ~360 px wide, overlays the viewport.
   - Contains: LLM provider dropdown, model picker (per provider), API key field (password-masked), search-provider key, "Test connection" button.
   - **Light-dismiss:** clicks on the main viewport, the close (X) button, or `Esc` closes it.
   - Persists between sessions; opens with last-used tab focused.

2. **Output frame**
   - Floating-bottom-right (or right-docked, see [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §4) result panel.
   - Renders one of: Defense result card, Attack result card, error state, empty state.
   - Always shows: vibe used (site_id), sources (Defense) or score bars (Attack), final rendered text.
   - "Copy" + "Insert back" affordances on every output block (Insert back writes to the focused page textarea via the renderer process — see ARCHITECTURE §6).

3. **Chat frame**
   - Below the output frame.
   - Top row: `[🛡 Defense]` and `[⚔ Attack]` buttons.
   - Bottom row: a text input + send button.
   - The same input drives **both** the initial invocation (when buttons are clicked) and **refinement** (subsequent turns).
   - Conversation is bounded to the current Defense/Attack session; new invocation = new session.

### 4.3 Pipelines

We inherit the agent pipelines from `../docs/AGENT_DESIGN.md` §2 with no contract changes:

- **Defense (Shield)** — vibe → parallel(fact, logic) → rewrite in vibe.
- **Attack (Sword)** — vibe → evaluator(4-axis) → finalize concept post.
- **Refine** — single rewrite call carrying conversation history; never re-runs fact/logic unless user asks.

For MVP we ship only **Fast** pipelines (single structured-output call per mode). Standard/Deep are post-MVP. See [`AGENT_DESIGN.md`](./AGENT_DESIGN.md).

### 4.4 BYOK

The user supplies their own API keys for the LLM provider and (optionally) the search provider. Keys live in the OS keychain (Electron `safeStorage` / Tauri stronghold), not in plain disk storage. See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md).

## 5. Out of scope (explicit non-goals for MVP)

| Cut | Why |
|---|---|
| Browser sync (bookmarks, history, passwords across devices). | Requires a backend and identity. Not the product. |
| Password manager / form autofill. | Big surface, big liability. Use the OS one. |
| Ad blocker / content filter. | Not a privacy product; out of mission. |
| Extension marketplace. | Whole reason we forked. |
| Custom search engine config UI. | Default to one engine in MVP; settings come later. |
| Reader mode, PDF viewer, print preview. | Defer; Chromium engine handles PDF natively, fine for v1. |
| Profile / account switcher. | One profile per install in MVP. |
| Bookmarks. | Add in v0.2; not core to debate-helper flow. |
| Per-tab incognito. | Whole-window private mode in v0.2. |
| Mobile / tablet build. | Desktop only. |
| Telemetry, analytics, A/B framework. | No backend, no collection. |

## 6. Detailed functional requirements

### 6.1 Defense flow

```
[any page is loaded in the active tab]
   │
   ▼
[user types a claim into the chat input OR selects text on the page]
   │
   ▼
[user clicks 🛡 Defense]
   │
   ▼  (within 200 ms)
[output frame fades in with skeleton:
   • "Vibe: <site_id>" placeholder
   • "사실 확인 중…"
   • "논리 점검 중…"]
   │
   ▼  (within 4 s p50, 8 s p95)
[result card renders:
   • Verdict badge (true / false / partial / unverified)
   • Vibe-adjusted summary paragraph
   • Sources list (each with title, publisher, link icon)
   • Fallacies (if any): type + verbatim span + counter-punch
   • Chat input remains available for refinement]
```

Inputs source rule:

1. If chat input is non-empty → use chat input as the claim.
2. Else if the page has a text selection → use the selection.
3. Else surface an error: "Type a claim, or select text on the page."

The active tab's URL is always sent as the vibe context.

### 6.2 Attack flow

```
[user types a draft into the chat input]
   │
   ▼
[user clicks ⚔ Attack]
   │
   ▼  (within 200 ms)
[output frame fades in with skeleton score bars]
   │
   ▼  (within 6 s p50, 12 s p95)
[result card renders:
   • 4-axis score (Cynicism / Fact / Punchline / Vibe)
   • Line critique list (verbatim span → note)
   • "최종 개념글" — the rewritten draft
   • [📋 Copy] [→ Insert into page textarea] affordances
   • Chat input remains for refinement ("더 짧게", etc.)]
```

If the active page has a focused textarea at invocation, the "Insert" button is active; otherwise it falls back to Copy-only. The Attack flow does NOT auto-paste — always one explicit click.

### 6.3 Chat refinement

After either initial result, the chat input drives **refinement** of *that same result*. One LLM call per turn, no re-running fact/logic.

- The output frame replaces the rendered text but keeps the supporting data (sources, score, fallacies) untouched.
- A revert affordance lets the user step back through up to the last 5 refinement turns. Older turns are discarded.
- Clicking 🛡 Defense or ⚔ Attack again starts a brand-new session — the conversation buffer clears.

### 6.4 Settings drawer

Sections, top to bottom:

1. **LLM** — provider (Anthropic / OpenAI / Google), model (per-provider dropdown filled from a static catalog), API key (password field). "Test connection" button → makes one cheap call, shows pass/fail.
2. **Search** — provider (Brave / disabled), API key. Disabled means Defense falls back to LLM-only assertion with a visible "unverified" badge.
3. **Default site profile** — when the active URL has no vibe profile, the fallback to use.
4. **Privacy** — "Clear cache," "Clear keys," "Reset all settings" buttons. Each requires a confirmation modal.
5. **About** — version, OSS licenses link, privacy policy link.

The drawer is the only place keys are entered. There is no popup, no toolbar menu, no command-palette path. Single source of truth.

### 6.5 Browser core (summarized — full spec in `BROWSER_CORE.md`)

- Open new tab: `Cmd/Ctrl+T`. Close tab: `Cmd/Ctrl+W`.
- Back / forward: `Cmd/Ctrl+[` / `Cmd/Ctrl+]`.
- Reload: `Cmd/Ctrl+R`.
- Focus URL bar: `Cmd/Ctrl+L`.
- Find: `Cmd/Ctrl+F`.
- Toggle settings drawer: `Cmd/Ctrl+,`.
- Invoke Defense: `Cmd/Ctrl+Shift+D`. Attack: `Cmd/Ctrl+Shift+A`.

## 7. Non-functional requirements

| Concern | Target |
|---|---|
| Cold-start time-to-first-paint | < 1.5 s on a MacBook Air M1. |
| Page navigation p95 | Within ~10% of upstream Chromium (we're a thin shell). |
| Defense p50 / p95 (Fast pipeline) | 4 s / 8 s. |
| Attack p50 / p95 (Fast pipeline) | 6 s / 12 s. |
| Refinement chat turn p50 | < 3 s. |
| Settings drawer open animation | 180 ms ease-out; no jank. |
| Memory ceiling at idle (5 tabs, agent panel closed) | < 800 MB RSS. |
| Crash recovery | Open tabs restored on next launch (URLs only; no form state). |
| Offline behavior | Browser still works; agent buttons show "offline" banner. |
| Localization | Korean and English UI strings from day one. No other languages in MVP. |

## 8. Success criteria (what "MVP done" means)

The MVP ships when the owner can:

1. Install the signed binary on macOS + Windows from a release page.
2. Launch, open `fmkorea.com`, paste their API key into the drawer, click 🛡 Defense on a claim — see a sourced, vibe-correct response in < 8 s.
3. Type a draft into the chat input, click ⚔ Attack — get a scored rewrite they would actually post.
4. Refine the rewrite via chat ("더 짧게") and see it update in < 3 s.
5. Close the drawer by clicking the viewport, and have it stay closed across app restarts.
6. Quit and relaunch — last session's tabs are back; API key is still there (loaded from keychain).

Phase 1 done = all six checkboxes green. Anything beyond is v0.2+.

## 9. Risks & open questions

| # | Risk | Mitigation / decision needed |
|---|---|---|
| 1 | Browser shells are expensive to maintain (Chromium upgrades, CVE patching). | Pick a framework that does it for us (Electron auto-updates Chromium). Treat Chromium-version drift as a cost we accept. |
| 2 | Signed-binary distribution on macOS + Windows requires paid developer accounts and notarization. | See [`TECH_STACK.md`](./TECH_STACK.md) §7. Owner must obtain certs before v1. |
| 3 | "Insert back" into the active page textarea requires renderer-process JS injection — different ergonomics than the extension content script. | Architecture §6 specifies a single internal injection from the chrome process; no remote code. |
| 4 | LLM provider API surfaces evolve (e.g., tool-use spec changes). | We already have the `lib/llm` adapter pattern from the extension; carry it over. |
| 5 | What is the actual differentiator vs "Chrome + the extension"? | Quiet, focused UI; no MV3 amnesia; no CWS policy review delays; OS-keychain BYOK. Worth the binary if the user is a heavy debater. Reassess after MVP feedback. |

## 10. What this PRD is not

- Not a v1 spec — we deliberately defer most "real browser" features. Treat v1 as "MVP + bookmarks + private mode + auto-update."
- Not a moat. The moat is the agent quality + vibe corpus, not the browser shell. The shell exists only to remove extension constraints.
