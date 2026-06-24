# UI / UX Specification — Native Browser

> The whole product surface. Atlas-style chrome, right-edge slide-out settings, output frame, chat frame. Wireframes are ASCII; refer to the attached reference image (`README.md` §2) for the visual mood.

Read [`PRD.md`](./PRD.md), [`BROWSER_CORE.md`](./BROWSER_CORE.md), and [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5 first.

---

## 1. Design principles

1. **Quiet chrome.** The browser should feel like Chrome without the toolbar zoo. Every pixel that isn't a tab, URL, or content is justified.
2. **One trailing affordance.** A single button on the right edge is the *only* visible "AI" thing until the user wants more.
3. **The agent panel is a guest.** It appears when summoned, disappears when dismissed. It never blocks reading.
4. **Light-dismiss everything.** Drawer closes on viewport click or `Esc`. Output frame can be collapsed without losing state.
5. **Outputs are never auto-applied.** Copy / Insert are always explicit clicks.
6. **Korean-first.** Strings are written for ko first, en second. Not a translation app.

## 2. Visual mood

Mood reference: the ChatGPT Atlas screenshot in [`README.md`](./README.md) §2.

Concretely:

- **Dark default theme.** Backgrounds use a near-black neutral (`#0f0f12`-ish); foreground UI is `#e7e7ea` text on `#1b1b1f` surfaces.
- **Light theme** mirrors the dark one with `#fafafa` / `#1b1b1f` for accessibility parity.
- One brand accent (a calm purple, e.g. `#7c7cff`) used sparingly — only for: the right-edge trigger, the Defense / Attack buttons on hover, focus rings.
- **Typography:** system UI stack (San Francisco / Segoe UI / Inter fallback). One weight: regular for body, semibold for titles. No display fonts.
- **Spacing:** 4-px grid. Tab strip 36 px tall, URL bar 40 px, output frame padding 16 px.
- **Corners:** 8 px on cards, 10 px on the drawer, 999 px on the URL bar (pill).
- **Shadows:** very subtle. One elevation token (`0 1px 2px rgba(0,0,0,.25)`). The Atlas look is mostly contrast, not shadow.

## 3. Window layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⏺ ⏺ ⏺    [tab 1] [tab 2] [+]                                                 │  ← title bar + tab strip
├──────────────────────────────────────────────────────────────────────────────┤
│  ← →  ↻   ╭──────────────────────────────────────────────╮            ✦       │  ← nav row + URL pill
│           │  https://www.fmkorea.com/best                │                    │     + right-edge trigger
│           ╰──────────────────────────────────────────────╯                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                              [   page viewport  ]                            │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                          ┌──────────────────┐│  ← Output frame
│                                                          │  Defense result  ││     (docked bottom-right
│                                                          │  …               ││      when active)
│                                                          ├──────────────────┤│
│                                                          │ [🛡] [⚔]         ││  ← Chat frame
│                                                          │ [chat input ▷]   ││     (always above output
│                                                          └──────────────────┘│      when panel is open)
└──────────────────────────────────────────────────────────────────────────────┘
```

Three zones:

1. **Top chrome** (title bar + tab strip + nav row + URL pill + right-edge trigger). Spec'd in [`BROWSER_CORE.md`](./BROWSER_CORE.md) §3.
2. **Viewport.** The current tab's web content. Owns most of the space.
3. **Agent panel** (output frame + chat frame). Floating, docked to the bottom-right by default. Collapsible. **Hidden entirely until the user clicks 🛡 / ⚔ for the first time in the session.**

The right-edge trigger (✦) is the only persistent "AI" surface. It opens the **settings drawer**, not the agent panel. The agent panel is opened by the Defense / Attack buttons.

That split matters: it makes "settings" and "use the agents" two different actions, with two different trigger points.

## 4. The right-edge slide-out settings drawer

### 4.1 Visual

```
                                                              ╭───────────────────────────╮
                                                              │  ✕  Settings              │
                                                              ├───────────────────────────┤
                                                              │                           │
                                                              │  LLM                      │
                                                              │  Provider     [Anthropic▾]│
                                                              │  Model        [Sonnet 4.6▾]│
                                                              │  API Key      ●●●●●●●●  [✎]│
                                                              │                  [Test ↗]  │
                                                              │                           │
                                                              ├───────────────────────────┤
                                                              │  Search                   │
                                                              │  Provider     [Brave    ▾]│
                                                              │  API Key      ●●●●●●●●  [✎]│
                                                              │                           │
                                                              ├───────────────────────────┤
                                                              │  Vibe                     │
                                                              │  Default site  [generic ▾]│
                                                              │                           │
                                                              ├───────────────────────────┤
                                                              │  Privacy                  │
                                                              │  [Clear browsing data]    │
                                                              │  [Clear stored keys]      │
                                                              │  [Reset all settings]     │
                                                              │                           │
                                                              ├───────────────────────────┤
                                                              │  About                    │
                                                              │  v0.1.0 · licenses · docs │
                                                              │                           │
                                                              ╰───────────────────────────╯
```

### 4.2 Trigger

- One button at the right edge of the chrome row (✦ icon). Size 32 × 32. Sticky to the right edge.
- Hover: subtle background tint (no tooltip text — the icon is the message; we add `aria-label="Settings"`).
- Click: drawer slides in from the right.

### 4.3 Open / close animation

- Width: 360 px on screens ≥ 1280 px wide; clamped to `min(360px, 90vw)` otherwise.
- Slide animation: `transform: translateX(100%) → 0`, `transition: transform 180ms ease-out`. CSS only.
- Drawer is `position: fixed; right: 0; top: 0; height: 100vh; z-index: 50;`.
- A 30%-opacity dim layer covers the rest of the chrome behind the drawer (helps light-dismiss feel intentional). The page viewport gets a `pointer-events: none` overlay so clicking it dismisses the drawer instead of interacting with the page.

### 4.4 Dismiss

The drawer closes on any of:

1. Click the close `[✕]` button.
2. Click anywhere on the main viewport (the dim layer captures the click).
3. Press `Esc`.
4. Press `Cmd/Ctrl+,` (toggle).

It does NOT close on:

- Clicking inside the drawer.
- Switching tabs.
- Losing OS focus.

### 4.5 Sections (top to bottom)

Each section is a vertically-stacked card with a header. No collapse/expand in MVP — the drawer is short enough to fit on a 720-px-tall screen without scrolling.

1. **LLM**
   - `Provider`: dropdown — Anthropic, OpenAI, Google. Switching provider clears the model selection (must pick one for the new provider).
   - `Model`: dropdown filtered by provider. Static catalog in MVP (e.g., for Anthropic: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7`).
   - `API Key`: password-masked input. Last 4 chars visible. `[✎]` edit button — pressing it clears the field for re-entry. Pressing Enter or losing focus persists the new value via IPC `ui:settings:put_key`. The renderer never sees the full key after persistence.
   - `[Test ↗]`: pings the configured provider with a 1-token call. Shows ✓ / ✗ inline with latency. No keys are logged.

2. **Search**
   - `Provider`: Brave / Disabled. Disabled means Defense's fact-check falls back to LLM-only (with the "unverified" badge in results).
   - `API Key`: same UX as LLM key.

3. **Vibe**
   - `Default site profile` dropdown — used as fallback when the active URL has no profile. Options: "generic Korean cynical" (default), "fmkorea", "theqoo" once those seeds ship.

4. **Privacy** (three destructive buttons, each with a confirm modal)
   - `Clear browsing data` — cookies, cache, history.
   - `Clear stored keys` — wipes secrets from `safeStorage`.
   - `Reset all settings` — restores defaults except keys.

5. **About**
   - Version string. Links: open-source licenses (modal), privacy policy (external URL), docs (external URL).

### 4.6 Edge cases

- **`safeStorage.isEncryptionAvailable() === false`** (e.g., Linux without a keychain configured): a yellow banner at the top of the drawer: *"OS keychain unavailable. Keys are held in memory only and will be cleared on quit."* The API key field still works, but stores in main-process memory only, marked `volatile: true`.
- **User pastes something that doesn't look like a key** (e.g., a chat message starting with "오늘 "): no client-side validation; `[Test ↗]` is the only verification. We deliberately don't regex-check formats — providers change them.
- **Provider switched mid-session with an active agent call**: the in-flight call uses the *previously* configured provider. Subsequent calls use the new one. No interruption.

## 5. The agent panel

The agent panel houses two stacked frames: **output frame** (top) and **chat frame** (bottom).

### 5.1 Visibility rules

| State | Panel visible? |
|---|---|
| App just launched, no agent activity yet | No. |
| User clicked 🛡 or ⚔ once | Yes. Stays visible. |
| User clicked the `[ — ]` collapse button | Collapses to a 36-px pill at the bottom-right ("Agent ▴") that re-expands on click. |
| User clicked the `[ ✕ ]` close button | Hides; next 🛡 / ⚔ click re-creates fresh. |
| Tab switched | Panel persists across tabs; its content (last result, chat) survives the switch. New invocations use the *now-active* tab's URL for vibe. |

The panel is independent of the settings drawer. They can both be open; the drawer overlays the panel on the right (the drawer has higher z-index).

### 5.2 Docked vs floating

Default: **docked bottom-right**, 420 px wide, 60% of viewport height, with 16 px gap from window edges.

User can drag the panel header to detach it (floats anywhere within the window). On window resize it stays where it was. Position persists across sessions.

The panel never moves to overlay the URL bar — there is a 56-px reserved zone at the top.

### 5.3 Layout

```
╭────────────────────────────────────────────╮
│  ●  Defense  ·  fmkorea       [—] [↻] [✕] │  ← header (mode badge, vibe, controls)
├────────────────────────────────────────────┤
│                                            │
│             [ output frame ]               │  ← scrollable
│                                            │
├────────────────────────────────────────────┤
│  [🛡 Defense]  [⚔ Attack]                  │  ← chat frame
│  ┌──────────────────────────────┐ [▷]      │
│  │  type a claim or refinement… │           │
│  └──────────────────────────────┘           │
╰────────────────────────────────────────────╯
```

Header:
- Mode badge: ● Defense (green dot) / ● Attack (purple dot). Empty state shows ○ Idle.
- Vibe: `· fmkorea` (clickable for future vibe override panel; tooltip-only in MVP).
- `[—]` collapse to pill.
- `[↻]` regenerate — only enabled after a result has rendered.
- `[✕]` close panel (clears state).

## 6. Output frame — Defense result

Rendered when a Defense pipeline completes.

```
┌──────────────────────────────────────────────┐
│ ⚠ 주장:                                       │
│ "<excerpt of the claim, ≤ 200 chars>"        │
│                                              │
│ ✅ Verdict: 부분적 사실                       │
│                                              │
│ <vibe-adjusted summary paragraph>            │
│                                              │
│ 📎 출처                                       │
│  · Hankyoreh — 2025-04-12       [↗] [📋]      │
│  · Wikipedia                      [↗] [📋]   │
│                                              │
│ 🧠 논리적 허점                                │
│  · Ad Hominem · "<span>"                     │
│    → 카운터: "<rebuttal>"   [📋]              │
│                                              │
└──────────────────────────────────────────────┘
```

Rules:

- **Verdict badge color**: green for `true`, red for `false`, yellow for `partial`, gray for `unverified`. Always also a text label for screen readers and color-blind users.
- **Sources**: each row shows publisher, date if available, a copy button, and an external-link icon. Clicking the link opens a new tab in the same window — never replaces the user's debate tab.
- **Fallacies block**: only renders if `fallacies.length > 0`. Otherwise omitted entirely (don't show an empty header).
- **Empty / unverified state**: if `fact.sources.length === 0` and verdict is `unverified`, the sources block shows a gray "출처를 찾지 못했습니다 — LLM 추정" badge instead of an empty list.

Affordances:

- `[📋]` on every quoted block copies to clipboard with a toast confirmation.
- The entire vibe-adjusted summary is itself a `[📋]` target on hover.
- If the user invokes Defense again while a result is still rendering, the in-flight one is **cancelled** and the new one replaces it. No stacking.

## 7. Output frame — Attack result

Rendered when an Attack pipeline completes.

```
┌──────────────────────────────────────────────┐
│ 📊 점수                                       │
│  Cynicism   ████████░░  8                    │
│  Fact       ███░░░░░░░  3   ← 최약점          │
│  Punchline  ████░░░░░░  4                    │
│  Vibe       █████████░  9                    │
│                                              │
│ ✏ 라인 코멘트                                 │
│  · "<span>" — 후킹이 약함. 통계 추가 권장     │
│  · "<span>" — 펀치라인 무딤                   │
│                                              │
│ ✨ 최종 개념글                                │
│  ┌────────────────────────────────────────┐ │
│  │  <rewritten draft, contenteditable>    │ │
│  └────────────────────────────────────────┘ │
│  [📋 복사]   [→ 페이지 입력란에 적용]         │
└──────────────────────────────────────────────┘
```

Rules:

- **Score bars** show numeric value next to the bar — accessibility and at-a-glance.
- The axis with the lowest value gets a "← 최약점" (weakest) label.
- The "최종 개념글" block is a `contenteditable` div. The user can hand-edit before applying. Edits don't re-run the model.
- **Insert button**: enabled if the active page has a focused textarea at the time of click; disabled with a tooltip ("페이지에서 입력란을 먼저 클릭하세요") otherwise.

Cancellation: same as Defense. Re-clicking ⚔ cancels in-flight.

## 8. Chat frame

### 8.1 Buttons row

Two pill buttons: `🛡 Defense` and `⚔ Attack`. Side by side, left-aligned.

States:

- **Idle** (no input, no result): both enabled but visually muted; tooltip "Enter a claim, or select text on the page."
- **Has input** (chat input non-empty OR page has selection): the relevant button highlights (subtle accent border).
- **Loading** (request in flight): the clicked button shows a spinner inline; the other button is disabled.
- **Has result** (a result is on screen): both buttons re-enabled; clicking either *starts a new session* (clears chat history and the output frame).

The buttons read input from the chat input field first; if empty, they fall back to the active page's text selection.

### 8.2 Input field

- Single text input (or multi-line autosizing textarea — autosizes from 1 line to 5, then scrolls).
- Placeholder: *"주장이나 초안을 입력하세요. 또는 페이지에서 텍스트를 선택하고 버튼을 누르세요."*
- `Enter` sends as a **refinement** if a result is on screen; otherwise treated as input for the next 🛡 / ⚔ click.
- `Shift+Enter` inserts a newline.
- `↑` recalls the last user message (single level; not a full history shell).
- Send button `[▷]` is enabled when the input is non-empty.

### 8.3 Refinement mode

After a Defense or Attack result is on screen:

- The chat input becomes the **refinement channel**. Sending a message runs `runRefine` (one LLM call; see [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) §2c).
- The output frame's rendered text mutates in place. Sources, scores, fallacies remain untouched unless the user explicitly says "fact check again" / "rescore."
- A small history strip appears below the input: `[↶ 1] [↶ 2] [↶ 3]` — click to revert to a prior version (last 5 turns).
- Clicking 🛡 or ⚔ again clears refinement history and starts a new session.

### 8.4 Quick-action chips (post-MVP, but reserved space)

Below the input, room for canned instructions: `더 짧게` / `더 비꼬게` / `팩트 줄이기` / `펀치라인 강화`. Each is one click → sends that instruction as refinement. **Not in MVP** — reserved 24-px space below the input so the layout doesn't reflow when we add them.

## 9. State transitions diagram

```
                            ┌─────────────────┐
            launch app  →   │   Idle (panel   │
                            │     hidden)     │
                            └────────┬────────┘
                  click 🛡 or ⚔ →    │
                                     ▼
                            ┌─────────────────┐
                            │   Loading       │
                            │  (skeleton in   │
                            │   output frame) │
                            └────────┬────────┘
                                     │
                  result event →     │     ← error event
                                     ▼
                            ┌─────────────────┐
                            │   Has result    │
                            │ (output + chat) │
                            └─┬──┬────────────┘
              type + send →   │  │   ← click 🛡/⚔
                              │  │     (clears history,
                              ▼  │      back to Loading)
                            ┌──┴──────────────┐
                            │   Refining      │
                            │ (output mutates │
                            │   in place)     │
                            └────────┬────────┘
                                     │
                          done →     ▼
                            (back to "Has result")
```

Cancellation (`✕` on header, or new 🛡/⚔ click) returns to **Has result** if a prior result exists, else to **Idle**.

## 10. First-run experience

```
[App launches for the first time]
   │
   ▼
[Tab strip + URL bar visible; one blank tab open at a "welcome" internal page.]
   │
   ▼
[The right-edge trigger pulses gently (subtle 2-pulse animation, then stops).]
   │
   ▼
[Welcome page content:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Truth & Strike
   온라인 토론을 위한 작은 브라우저.

   시작하려면 우측 ✦ 버튼을 눌러
   API 키를 입력하세요.

   [Open Settings]      ←  one button, opens the drawer
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]
   │
   ▼
[User opens drawer, pastes key, clicks Test → ✓ → closes drawer]
   │
   ▼
[Welcome page replaced by the empty new-tab page.]
```

If the user closes the drawer without entering a key, the welcome page stays as the new-tab content until a key is configured.

## 11. Empty & error states

| State | UI |
|---|---|
| No API key configured | 🛡 / ⚔ buttons disabled. Tooltip: "API 키가 필요합니다 — 설정에서 입력하세요." The right-edge trigger gets a small red dot. |
| LLM call timed out | Output frame shows a red banner: "응답이 너무 오래 걸렸습니다. [다시 시도]"; chat input remains. |
| LLM provider unreachable | Same banner with "네트워크 오류 — API 도달 불가." |
| Search failed | Yellow banner inside the Defense card: "라이브 검색 실패 — LLM 단독 답변입니다." (verdict is `unverified`). |
| Schema validation failed | Red banner: "응답 형식이 잘못되었습니다. [다시 시도]". One auto-retry happens before this shows. |
| No text selection AND empty chat input | 🛡 / ⚔ click shakes the input field briefly; placeholder fades to "주장을 입력하세요." |
| Page navigation while loading | The result still completes for the URL that was active when the request started. A small note appears in the result header: "결과의 vibe는 이전 페이지(`<host>`) 기준입니다." |
| Offline | The 🛡 / ⚔ buttons get a slash-through icon; top banner shows "오프라인." |

## 12. Accessibility

- All interactive elements have a visible focus ring (`focus-visible:ring-2 ring-accent`).
- The drawer is a modal pattern: when open, focus is trapped inside; `Esc` returns focus to the right-edge trigger.
- Score bars include numeric labels for screen readers (`<span>{value} of 10</span>` next to the bar).
- Verdict color is always paired with a text label.
- Respect `prefers-reduced-motion`: drawer slide → fade; pulse on trigger → none.
- Korean + English UI strings both pass WCAG AA contrast on dark + light themes.

## 13. Theming

Two themes: **dark** (default) and **light**. System theme detection on first launch; user override in the drawer (post-MVP) — for MVP it follows system.

Colors live in `chrome-renderer/styles/theme.css` as CSS variables. No `--ai-` or "creative" tokens; just `--bg`, `--bg-elev`, `--fg`, `--fg-muted`, `--accent`, `--border`, `--success`, `--warning`, `--danger`. Component CSS reads these only.

## 14. Animation budget

Every animation is on this list. If it's not here, don't add it.

| Element | Animation | Timing |
|---|---|---|
| Settings drawer | slide-in / -out | 180 ms ease-out |
| Agent panel first appearance | fade + 8-px upward | 160 ms ease-out |
| Panel collapse to pill | scale + opacity | 160 ms ease-out |
| Result skeleton → result content | crossfade | 200 ms ease-out |
| Tab open / close | width transition | 120 ms ease-out |
| Right-edge trigger first-run pulse | scale 1 → 1.06 → 1 | 600 ms, 2 cycles |
| Find bar open | slide-down 24 px | 120 ms ease-out |

No bouncy/spring easings. No hover transforms larger than 1.02. No animated gradients.

## 15. What this UI is not

- Not a sidebar like Edge / Brave. The drawer is for settings; the agent panel is its own object.
- Not Atlas. Atlas inspires the chrome quietness; we do not copy its interaction model wholesale (we do not bundle a generic chat sidebar).
- Not multi-window in MVP.
- Not a vertical tabs experiment.

## 16. Open UX questions

1. **Should the agent panel auto-open on first 🛡 / ⚔ if hidden?** Yes for MVP — the click is the invocation, the panel has to show the result. Open question: what about subsequent runs after the user explicitly `[✕]`-closed? Current rule: each 🛡 / ⚔ click reopens. Re-evaluate if it feels intrusive.
2. **Where does the chat input go when output frame is collapsed to a pill?** Hidden along with output. Reopen the panel to chat. Alternative: keep input always visible; deferred.
3. **Vibe override per-run.** Add a small `[✎]` next to the vibe badge in the panel header? Useful for power users; defer past MVP.
4. **Drawer width on ultrawide displays.** 360 px feels narrow on 1440-px+ screens but right on 1280. Pin at 360; let drag-resize in v0.2.
5. **Multi-window.** Where do agents go when there are two windows on screen? Probably: per-window panel; settings drawer is a singleton across windows. Defer to v0.3.
