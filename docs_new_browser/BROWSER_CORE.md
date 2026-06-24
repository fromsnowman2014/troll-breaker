# Browser Core Requirements

> "What does a debater actually need from a browser?" The answer is **much less than Chrome ships**, but the things they do need must work reliably. This doc enumerates them, with a strict cut list.

Read [`PRD.md`](./PRD.md) §4.1 and [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4 first.

---

## 1. Design lens

We optimize for a single user story:

> The user is browsing a community thread, mid-debate. They want to flip between 2–5 tabs, read fast, sometimes search, and trigger the agents without losing their place.

That story implies:

- Tab switching has to be instant (Chromium handles it; we just must not regress it).
- The URL bar has to be obvious and forgiving (typos, search vs URL).
- Reload and back/forward must be one keystroke.
- Anything not on the critical path should be invisible (no toolbar zoo).

It explicitly does NOT imply:

- A bookmarks manager.
- A reading list.
- A history search UI.
- A password manager.
- A download manager UI.

Those are nice. They are not the cut. They are not the moat. They go in v0.2+.

## 2. MVP feature matrix

✅ = ships in MVP. ⏳ = post-MVP. ✂ = explicitly out.

| Area | Feature | MVP? | Notes |
|---|---|---|---|
| **Tabs** | Open new tab | ✅ | `Cmd/Ctrl+T`, "+" button at end of strip. |
| | Close tab | ✅ | `Cmd/Ctrl+W`, "×" on tab hover. |
| | Switch tab | ✅ | Click, `Cmd/Ctrl+1..9`, `Ctrl+Tab` / `Ctrl+Shift+Tab`. |
| | Drag-reorder | ⏳ | v0.2. |
| | Pinned tabs | ⏳ | v0.2. |
| | Tab groups / spaces | ✂ | Not the moat. |
| | Restore closed tab | ✅ | `Cmd/Ctrl+Shift+T`. Stack of last 10. |
| | Restore session on launch | ✅ | URLs only — not form state. |
| **URL bar** | Type URL → navigate | ✅ | Detect `http(s)://`, bare host, IP, localhost. |
| | Type query → search | ✅ | Hard-coded Google in MVP. Configurable later. |
| | Suggestions dropdown | ⏳ | v0.2: history + open-tab matches. No Google Suggest in MVP (privacy). |
| | Visible "lock" / "not secure" indicator | ✅ | Lock for HTTPS, warning for HTTP, dot for `file://` / `about:`. |
| | Copy URL | ✅ | `Cmd/Ctrl+L` then `Cmd/Ctrl+C`. |
| **Navigation** | Back | ✅ | `Cmd/Ctrl+[`, button. |
| | Forward | ✅ | `Cmd/Ctrl+]`, button. |
| | Reload | ✅ | `Cmd/Ctrl+R`, button. `Cmd/Ctrl+Shift+R` = hard reload. |
| | Stop loading | ✅ | `Esc` while loading. |
| | Home page | ✂ | New tab opens to a blank page with a centered URL bar. |
| **Find** | Find in page | ✅ | `Cmd/Ctrl+F` opens a bar at top of viewport. Enter / Shift+Enter cycles. |
| | Highlight all matches | ✅ | Standard Chromium find. |
| **Zoom** | Zoom in / out / reset | ✅ | `Cmd/Ctrl + +/-/0`. Persists per-origin? **No** in MVP; per-tab only. |
| **History** | Session history (per tab) | ✅ | Chromium-native, drives back/forward. |
| | Global history list / search | ⏳ | v0.2 if asked for. |
| **Downloads** | Save link as / download | ✅ | Default OS Save dialog. |
| | Download list panel | ⏳ | v0.2. For MVP, file appears in OS Downloads folder. |
| **Cookies / storage** | Per-origin cookies | ✅ | Standard Chromium partition. |
| | Clear cookies / cache | ✅ | Settings drawer → Privacy → "Clear browsing data" (cookies + cache + history). |
| | Cross-tab cookie sharing | ✅ | Single profile means yes, intentionally — login state must persist between tabs. |
| **Privacy** | HTTPS-only by default | ✅ | Refuse plain HTTP unless user explicitly clicks "load anyway." |
| | Private / incognito window | ⏳ | v0.2. |
| | Block third-party cookies | ⏳ | v0.2 toggle. |
| | Ad blocker | ✂ | Out of mission. |
| **Window** | Single main window | ✅ | MVP is single-window. |
| | Multi-window | ⏳ | v0.3. |
| | Full-screen | ✅ | `Cmd/Ctrl+F11` (Win) / `Ctrl+Cmd+F` (mac). |
| | Mini-player / picture-in-picture | ✂ | Out. |
| **Print** | Print page | ⏳ | Chromium gives it free; wire it in v0.2. |
| **PDF** | View PDF inline | ✅ | Chromium ships a PDF viewer; leave on. |
| **Reader mode** | Stripped-page view | ✂ | Not aligned with mission. |
| **Bookmarks** | Save bookmark | ⏳ | v0.2: simple flat list, no folders. |
| **Autofill** | Save / fill passwords | ✂ | Use the OS password manager. We are not in this business. |
| **Form** | Save / fill addresses | ✂ | Same. |
| **Extensions** | Chrome extension support | ✂ | Whole reason we forked. Never. |
| **Sync** | Cross-device sync of any kind | ✂ | Requires backend; not the product. |
| **Updates** | Auto-update | ⏳ | v0.2 via `electron-updater`. MVP: manual download. |
| **Crash recovery** | "Page is unresponsive" UI | ✅ | Chromium emits it; we surface it as a banner with "Reload tab." |
| **Network** | Offline indicator | ✅ | OS network status → top banner when offline. |

## 3. Specifications for each MVP item

### 3.1 Tab strip

- Horizontally laid out at the top of the window, above the URL bar.
- Each tab: favicon (or letter avatar fallback), title (truncated to ~24 chars), close "×" on hover.
- Active tab visually elevated; others have lower contrast.
- "+" button at the end of the strip opens a new tab.
- Overflow behavior: tabs shrink to a minimum of ~60 px, then horizontal scroll appears. No tab collapsing or grouping in MVP.

Edge cases:

- Closing the last tab → open a new blank tab (do not quit the app). On macOS, the window stays open; on Windows, the window stays open.
- Closing a tab that has unsaved form state: show a small "Discard changes?" dialog. Reuse Chromium's `beforeunload` handler.

### 3.2 URL bar (omnibox)

A single text input. Heuristic for what to do on Enter:

```
parseOmnibox(input):
  trim whitespace
  if input matches /^[a-z][a-z0-9+.-]*:\/\//i      → navigate as URL
  if input is "localhost" / "127.0.0.1" / ip pattern → navigate as http://input
  if input has no space and contains a dot and a valid TLD → navigate as https://input
  if input starts with "about:" / "file:" / "chrome:" → navigate as URL
  else → search via configured search engine, query=input
```

Rules:

- The bar shows the *current page URL*, not the user's last typed query.
- Selecting all (`Cmd/Ctrl+L`) selects the URL for easy replacement.
- HTTPS upgrade: if the typed URL is `http://` and HTTPS upgrade is on (default), try HTTPS first, fall back on TLS error with a visible warning banner.

No suggestions dropdown in MVP. Adding one means we either (a) ship Google Suggest (privacy regression) or (b) build local suggestion ranking from history (real work). Defer.

### 3.3 Navigation chrome

A row below the tab strip with: `[←] [→] [↻] [____ URL bar ____] [⚙ right-edge trigger →]`

- Back / forward: disabled state when stack is empty; long-press to show history list (post-MVP).
- Reload becomes "Stop" while loading (`✕` icon).
- Right-edge trigger lives outside the URL bar, anchored to the chrome edge — it is the only thing on the right side. See [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §3.

### 3.4 Find in page

`Cmd/Ctrl+F` opens a small bar overlay at the top of the viewport (not above the URL bar).

- Input field, current/total count, `↑` previous, `↓` next, `×` close.
- `Enter` = next; `Shift+Enter` = previous; `Esc` = close.
- Highlighting uses Chromium's native find-in-page API.

### 3.5 Zoom

- `Cmd/Ctrl +` / `Cmd/Ctrl -` / `Cmd/Ctrl 0`.
- Zoom level shown briefly as a toast in the top-right (auto-hide after 1.5 s).
- Range: 25% – 500%. Increments: 25/33/50/67/75/80/90/100/110/125/150/175/200/250/300/400/500.
- Reset to 100% on `Cmd/Ctrl 0`.

### 3.6 Session restore

On quit:

- Write `{ tabs: [{ url, title }], active_index }` to `userData/session.json`.

On launch:

- If `session.json` exists and is non-empty, restore those tabs in their order. Active tab focused.
- If absent, open a single blank new tab.

Form state is NOT restored — Chromium's per-WebContents history is reset. We trade fidelity for simplicity in MVP.

### 3.7 Downloads

- Triggered by user clicking a link with `Content-Disposition: attachment` or a file-extension that Chromium would download.
- We listen to Electron's `session.defaultSession.on('will-download')` and let Chromium use the OS Save dialog (`item.setSavePath` left unset → Chromium prompts).
- A short-lived toast appears in the bottom-right: "Saved <filename> to Downloads."
- No download manager UI in MVP. The file is on disk; that's the contract.

### 3.8 Cookies, storage, partitioning

- Single Chromium profile (default partition). All tabs share cookies, IndexedDB, localStorage.
- Settings drawer → Privacy → "Clear browsing data":
  - Options: cookies, cache, history (session list).
  - Time range: "Last hour" / "All time" only. No granular date picker in MVP.
  - Confirmation modal because this can break sessions across the user's open tabs.

### 3.9 HTTPS-only

Default ON. When a navigation resolves to HTTP:

- Show a full-viewport interstitial: "This site is not secure. <Continue anyway> / <Go back>."
- "Continue anyway" stores an in-memory exception for the host for this session only — never persisted.

This is intentionally annoying. It is the right default for a debate tool that surfaces sources.

### 3.10 Offline state

- Listen to `navigator.onLine` in the chrome renderer.
- When offline: show a 36-px top banner, "You're offline. The browser will load cached pages only; the agent buttons are disabled."

## 4. Keyboard shortcut summary

All shortcuts are registered in `src/main/menus/shortcuts.ts`. Listed at-a-glance:

| Shortcut (mac / win) | Action |
|---|---|
| `Cmd/Ctrl+T` | New tab |
| `Cmd/Ctrl+W` | Close tab |
| `Cmd/Ctrl+Shift+T` | Reopen last closed tab |
| `Cmd/Ctrl+L` | Focus URL bar (select all) |
| `Cmd/Ctrl+R` | Reload |
| `Cmd/Ctrl+Shift+R` | Hard reload (cache bypass) |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]` | Back / forward |
| `Cmd/Ctrl+F` | Find in page |
| `Cmd/Ctrl++` / `Cmd/Ctrl+-` / `Cmd/Ctrl+0` | Zoom in / out / reset |
| `Cmd/Ctrl+1..9` | Switch to tab N |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Esc` | Stop loading / close find / close drawer |
| `Cmd/Ctrl+,` | Toggle settings drawer |
| `Cmd/Ctrl+Shift+D` | Run **Defense** on current chat input or selection |
| `Cmd/Ctrl+Shift+A` | Run **Attack** on current chat input |
| `Cmd/Ctrl+Q` (mac) / `Alt+F4` (win) | Quit |

If a shortcut would conflict with a page (e.g., docs apps using `Cmd+F`), the chrome wins. The page-level event is suppressed for the shortcuts in this table.

## 5. App menu (macOS) / menubar (Windows)

Minimal. Reuses the Chromium-like vocabulary.

```
Truth & Strike (mac only)
  About Truth & Strike
  Settings…           Cmd+,
  Quit                Cmd+Q

File
  New Tab             Cmd/Ctrl+T
  Close Tab           Cmd/Ctrl+W
  Reopen Closed Tab   Cmd/Ctrl+Shift+T

Edit
  Cut / Copy / Paste / Select All  (standard)
  Find in Page…       Cmd/Ctrl+F

View
  Reload              Cmd/Ctrl+R
  Hard Reload         Cmd/Ctrl+Shift+R
  Zoom In             Cmd/Ctrl++
  Zoom Out            Cmd/Ctrl+-
  Actual Size         Cmd/Ctrl+0
  Toggle Settings     Cmd/Ctrl+,

Tools
  Defense             Cmd/Ctrl+Shift+D
  Attack              Cmd/Ctrl+Shift+A

Window  (mac only)
  Minimize
  Zoom
  Bring All to Front

Help
  Documentation
  Report an Issue (mailto)
```

No "History" or "Bookmarks" menu in MVP.

## 6. What we will not entertain in MVP

These are pre-decided "no"s. Re-raise after MVP feedback only.

- Vertical tabs (Arc-style). Adds a sidebar; conflicts with our right-edge slide-out.
- A "command palette" (`Cmd+K` global). Discoverability is via the URL bar omnibox.
- A "side panel" the user docks. The settings drawer is the only side panel; the output frame is its own thing.
- An "AI assistant" that lives outside the agent buttons. The chat frame *is* the assistant; we do not also ship a separate sidebar chat.
- Multi-account browser profiles.

## 7. Acceptance — browser core

The browser-core portion of MVP is "done" when the owner can:

1. Browse `fmkorea.com`, `theqoo.net`, `news.naver.com` for 30 minutes without hitting a missing shortcut or broken navigation.
2. Restore the same set of tabs after a quit + relaunch.
3. Find a string on a long thread with `Cmd/Ctrl+F`.
4. Zoom into a small post with `Cmd/Ctrl+`.
5. Encounter an HTTP page and decide whether to continue.
6. Clear browsing data and verify cookies are gone (test by visiting a logged-in site that now asks for login).

Pass all six → browser core ships.

## 8. Open questions

1. Should `Cmd/Ctrl+Shift+R` purge HTTP cache only, or also service workers + IndexedDB? Chromium default is cache-only; match that for least-surprise.
2. Do we surface a "site is loading" progress bar? Chromium has a built-in throbber. MVP: tab favicon area shows a spinner; no horizontal progress bar.
3. New-tab page content. MVP: empty centered URL bar with the product name above it. Post-MVP: "recent" or "pinned sites." Decide after first dogfood.
4. Default search engine. MVP: Google. Configurable in the settings drawer post-MVP.
