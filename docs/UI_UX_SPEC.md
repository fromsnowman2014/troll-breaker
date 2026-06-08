# UI / UX Specification

What the user sees, where they click, and how they steer results. This doc answers the explicit question: *does the user need a chat interface, and how do they edit/apply results?*

## 1. Design principles

1. **Zero context switch.** The user is in a debate. The extension must not steal their attention from the conversation they're winning.
2. **One look = one decision.** Each surface should answer one question: "what now?"
3. **Edit > regenerate > start over.** Cheap refinement is the killer feature. Expensive full reruns are a last resort.
4. **Reveal sources, always.** Trust is the product. If a fact has no source, say so loudly.
5. **The user is the editor, the LLM is the writer.** Always one-click "apply to my draft" — never auto-paste.

## 2. The four surfaces

| # | Surface | When it appears | Purpose |
|---|---|---|---|
| 1 | **Context menu item** ("Truth Check") | Right-click on selected text | Trigger Shield. |
| 2 | **Floating button** | When user focuses a textarea / contenteditable | Trigger Sword. |
| 3 | **Side panel** | After trigger; persists per tab | Show result, chat-refine, insert back. |
| 4 | **Options page** | User-opened | BYOK setup, model + tier choices, seed corpus management, per-site overrides. |

**Why not a popup?** Popups close on focus loss. The user *must* be able to look back at the page they're debating on without losing the result. Side panel survives focus changes.

**Why not an in-page overlay?** Each site's CSS would fight us. Side panel is a Chrome-owned chrome region — no z-index battles, no style leaks.

## 3. Trigger flows

### 3a. Shield — context menu

```
[user selects text in any page]
   │
   ▼
[right-click → "Truth Check" appears]
   │
   ▼
[side panel opens automatically on this tab]
   │
   ▼
[skeleton state appears immediately (< 200 ms)]
   • "사이트 분위기 파악 중…" with the site_id
   • "사실 확인 중…" with the claim preview
   • "논리 점검 중…"
   │
   ▼
[result card replaces skeleton when ready]
```

If the user invokes Truth Check again on different text while the previous result is still loading, the older one is cancelled. No stacking.

### 3b. Sword — floating button

```
[user focuses a textarea or contenteditable element]
   │
   ▼
[floating button "⚔️ Strike" appears anchored to the textarea]
   • semi-transparent until hover
   • absolute-positioned, not fixed (scrolls with the textarea)
   • injected only on whitelisted hosts (community sites the user opted in via options page)
   │
   ▼
[user clicks button]
   │
   ▼
[side panel opens; draft is sent to Sword pipeline]
   │
   ▼
[result card shows score, line critique, final rewrite]
   │
   ▼
[user clicks "초안에 적용" → content script replaces textarea content]
```

The floating button only injects on hosts the user has whitelisted (in options). This is both a privacy default and a UX one — we don't want a strange button popping up on banking forms.

## 4. The result card — Shield

A single scrollable card in the side panel. Sections, top to bottom:

```
┌─────────────────────────────────────────────────┐
│ 🛡 Truth Check                          [×] [↻] │
├─────────────────────────────────────────────────┤
│ Vibe: fmkorea · 정치/시사 게시판            [✎]│  ← clickable: open vibe override panel
├─────────────────────────────────────────────────┤
│ ⚠ 주장: "<selected text excerpt>"               │
├─────────────────────────────────────────────────┤
│ ✅ Verdict: 부분적 사실                         │
│                                                 │
│ <site-vibe summary, one paragraph>              │
│                                                 │
├─────────────────────────────────────────────────┤
│ 📎 Sources                                      │
│  • [Hankyoreh, 2025-04] — link                  │
│  • [Wikipedia] — link                           │
├─────────────────────────────────────────────────┤
│ 🧠 논리적 허점                                  │
│  • Ad Hominem: "<span from input>"              │
│    → 카운터: "<cynical rebuttal>"   [📋 copy]   │
├─────────────────────────────────────────────────┤
│ 💬 더 다듬기                                    │
│ [chat input ─────────────────────────] [↵]      │
└─────────────────────────────────────────────────┘
```

Affordances:
- **`[↻]` regenerate** — re-runs Shield with same inputs. Same cost as initial.
- **`[✎]` next to vibe** — opens an inline vibe override (forbidden words, tone slider) for this run only.
- **`[📋]` on every quoted block** — copy to clipboard.
- **Source links** — open in new tab, never replace user's debate tab.
- **Chat input at the bottom** — natural language refinement. Stays open. See §6.

## 5. The result card — Sword

```
┌─────────────────────────────────────────────────┐
│ ⚔ Strike Enhance                       [×] [↻] │
├─────────────────────────────────────────────────┤
│ Vibe: theqoo · 핫게                         [✎]│
├─────────────────────────────────────────────────┤
│ 📊 점수                                         │
│  Cynicism  ██████░░░░ 6 / 10                    │
│  Fact      ███░░░░░░░ 3 / 10  ← biggest gap     │
│  Punchline ████░░░░░░ 4 / 10                    │
│  Vibe      ████████░░ 8 / 10                    │
├─────────────────────────────────────────────────┤
│ ✏ 라인 코멘트                                   │
│  • "첫 문장" — 후킹이 약함. 통계 한 줄 추가 권장 │
│  • "마지막 문장" — 펀치라인 무딤              │
├─────────────────────────────────────────────────┤
│ ✨ 최종 개념글                                  │
│  <rewritten draft>                              │
│                                                 │
│  [📋 복사] [→ 초안에 적용]                       │
├─────────────────────────────────────────────────┤
│ 💬 더 다듬기                                    │
│ [chat input ─────────────────────────] [↵]      │
└─────────────────────────────────────────────────┘
```

`→ 초안에 적용` writes the rewritten text back into the textarea the user invoked from. Content script holds the reference via a per-invocation token. If the textarea is gone (user navigated, deleted), button degrades to copy.

## 6. Chat-style refinement — design

This is the key UX answer to *"does the user need chat?"* Yes — but constrained.

**What chat refinement IS:**
- A persistent input at the bottom of the result card.
- Free-form natural-language instructions: *"더 짧게", "팩트 하나만 남기고 줄여줘", "마지막 줄에 비꼬는 한 방 추가"*.
- Each turn rewrites the visible result; previous result is kept in a "↶ revert" stack (up to 5 deep).
- Conversation context is local to the panel; never persisted across sessions unless user pins it.

**What chat refinement is NOT:**
- It's not a general LLM chat. The model's job is bounded: refine *this* result.
- It does NOT re-trigger fact-check or evaluator unless user explicitly says "fact check the new version" or "rescore."
- It does NOT support arbitrary tool use mid-chat. (Keeps cost and latency predictable.)

**Conversation header reset:** if the user clicks `[↻]` regenerate, the chat history clears. New result = new conversation.

## 7. Inline editing affordances

In addition to chat:

- **Click-and-edit on the final draft.** The rewritten Sword draft is a `contenteditable` block. Users can hand-edit, then click "apply." The model does not re-run.
- **Quick-action chips below the chat input:** "더 짧게" / "더 비꼬게" / "팩트 줄이기" / "펀치라인 강화". Each is a canned instruction — one click sends. Reduces typing.
- **Source pinning:** click a `[📌]` on any source to lock it in. Subsequent refinements must keep it referenced. (Useful when one source is the trump card.)
- **Source removal:** click `[✕]` on a source to remove it; refinement re-runs the rewrite without it.

## 8. Options page

Single page, sectioned:

```
[API Keys]
   • LLM provider [dropdown]
   • API key [password field, masked]
   • Test connection [button]
   • (repeated for Search provider)

[Model tiers]
   • Fast    [model dropdown]   (default: Haiku)
   • Standard[model dropdown]   (default: Sonnet)
   • Deep    [model dropdown]   (default: Opus)

[Per-site whitelist]
   • [ ] fmkorea.com   — floating button on / off
   • [ ] dcinside.com
   • [ ] theqoo.net
   • [ ] ruliweb.com
   • [+ add custom domain]

[Vibe profiles]
   • <site> — last refreshed <date> — [edit] [refresh] [reset to bundled]
     │
     └ on edit:
        • lexicon list (chips, add/remove)
        • forbidden words (chips)
        • tone sliders (cynicism 0–10, length short ↔ long)
        • few-shot examples (textarea per example)

[Data]
   • Clear all caches
   • Export settings
   • Import settings

[About]
   • Version
   • Privacy policy link
```

## 9. First-run experience

```
Install → toolbar icon appears
   ↓
[user clicks toolbar icon]
   ↓
Side panel opens with a one-screen welcome:
   • "Truth & Strike needs an LLM API key to work."
   • [Set up now] → opens options page focused on API Keys section
   • [Try with demo key] (optional — if we ship a rate-limited demo) — defer to post-MVP
```

After setup, the welcome panel is replaced by an "examples" view: 2 sample Shield invocations the user can run on canned text to feel the product.

## 10. Empty & error states

- **No API key:** every trigger surfaces a small banner in the side panel — "API key required → [open settings]". No silent failure.
- **No search results:** Fact section shows "No sources found — verdict is LLM opinion only" with a warning color.
- **Site not in profile:** Vibe section shows "Generic Korean tone (no community profile for this site)."
- **Timeout:** "Took too long. [Retry] [Switch to Fast mode]"
- **Network offline:** "Offline — can't reach LLM provider."

## 11. Keyboard

- `Cmd/Ctrl+Shift+T` → Truth Check on current selection (if any).
- `Cmd/Ctrl+Shift+S` → Strike Enhance on current textarea (if focused).
- Inside side panel: `Enter` sends chat, `Cmd/Ctrl+Enter` regenerates, `Esc` closes panel.

Keyboard shortcuts are configurable via `chrome://extensions/shortcuts`.

## 12. Accessibility

- All interactive elements have visible focus rings (tailwind `focus-visible:ring-2`).
- Score bars are also numeric (`6 / 10`) for screen readers.
- Side panel respects `prefers-reduced-motion`.
- Korean and English text both pass WCAG AA contrast on dark + light themes.

## 13. Open UX questions

1. **Onboarding tone for the BYOK step.** The first thing a user sees is an API key prompt. That kills 30% of installs in similar BYOK tools. Should we offer a hosted demo key with strict rate limits? Cost/abuse risk; defer until first wave of feedback.
2. **Vibe transparency.** Do power users want to *see* the vibe profile that was used for a given rewrite (lexicon list, few-shot titles)? Probably yes — adds trust. Cheap to add as a collapsible "vibe used" section in the result card.
3. **History.** Do we keep the last N results per tab so the user can revisit? Nice-to-have; defer to v0.1.
4. **Mobile / tablet.** Chrome on Android does not support extensions in the same way. Out of scope.
