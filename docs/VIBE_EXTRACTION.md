# Vibe Extraction

How we capture and refresh a community's tone, lexicon, and trends so that Shield/Sword output sounds native to the site.

The PRD's "Context is King" principle lives or dies here. This is the highest-leverage doc to get right.

## 1. What a "vibe" actually is

We model a community's voice as a structured profile, not free-form text. Forces the LLM to use the *right kind* of stylistic signals instead of vague "be sarcastic."

```
VibeProfile {
  site_id:          "fmkorea" | "dcinside" | "theqoo" | "ruliweb" | "<custom>"
  display_name:     str          // "에펨코리아 정치/시사"
  last_refreshed:   ISO date
  source:           "bundled-seed" | "scraped" | "user-curated"

  lexicon: {
    high_signal_words:    str[]   // 시그니처 단어 (예: "그저", "오히려 좋아", "참 거시기하네")
    forbidden_words:      str[]   // 이 사이트에서 안 통하는 단어 (예: 진지충 표현)
    emoji_or_emoticons:   str[]   // "ㅋㅋㅋ", "..." 등
  }

  sentence_shape: {
    avg_length:           int     // 평균 문장 길이 (한국어 기준 chars)
    paragraph_style:      "short-burst" | "long-thread" | "mixed"
    opener_patterns:      str[]   // "솔직히 말해서", "팩트는 이거임" 등
    closer_patterns:      str[]   // 마지막 한 방의 형태
  }

  tonality: {
    cynicism_level:       0..10
    sarcasm_style:        str     // 자유 서술 — "건조하게 비꼬는", "비웃듯이" 등
    political_lean:       "left" | "right" | "mixed" | "apolitical"
    taboo_topics:         str[]   // 다루면 -100 받는 주제
  }

  few_shot_posts: [
    { title: str, body: str, top_comments: str[], collected_at: ISO }
    // 2~5 개. 최신 베스트 글.
  ]
}
```

The `few_shot_posts` is the heaviest field and the one that goes into prompts. The structured fields above guide the LLM's *choices*; the few-shots show by example.

## 2. Sources of truth — three tiers

Vibe data comes from three tiers, in priority order. When agents call `getSiteVibe(url)`, they always get the merged result.

| Tier | What it is | Who curates | Refresh cadence |
|---|---|---|---|
| **Tier 1 — Bundled seed corpus** | JSON files shipped inside the extension, hand-curated per site. | The repo owner (you). Initial commit must include this. | Every release. |
| **Tier 2 — Opportunistic scrape** | When the user is *already on* the community page, the content script reads visible best-post markup and feeds it back to the cache. | Automatic. | Whenever user visits & posts are sampled. |
| **Tier 3 — User override** | User edits the profile manually in the options page (forbidden words, custom few-shots). | The end user. | Manual. |

**Why bundled seed first:** ships day one without any scraping. Cold start works. Anti-bot pages don't block first use.

**Why opportunistic scrape, not background crawl:** crawling Korean community sites from a server-class IP is detection-prone, ToS-gray, and adversarial. Reading the DOM of a page the user *already chose to visit* is the same access the user has. No new trust boundary crossed.

**Why user override:** taste is personal. Some users want spicier tone than the default; some want milder. Don't fight them.

## 3. Initial seed corpus — what you need to produce

This is the single biggest pre-launch human task. It is **not automatable cleanly** because:
- These sites' best-post pages often require login.
- DOM markup changes frequently.
- Quality control needs a human who reads Korean fluently.

**Per site (fmkorea / dcinside / theqoo / ruliweb minimum):**

1. **5 recent best-post screenshots → transcribed text.** Title, body, top 3 comments. Stored as JSON in `extension/seeds/<site_id>.json`.
2. **A 50-word "voice memo"** describing the community in your own words: who posts there, what gets upvoted, what tone fails. Becomes the `tonality.sarcasm_style` field plus inline notes.
3. **Lexicon list:** 15–30 high-signal words/phrases unique to that community.
4. **Forbidden list:** 5–10 phrases that scream "outsider."

Owner deliverable: see [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) §2.

## 4. Scraping policy (Tier 2)

When the content script detects the user is on a recognized community URL pattern AND on a best-posts listing or post page:

```
content_script:
  on page settled (DOMContentLoaded + 2s):
    sample = readBestPostsFromDOM(site_id)
    if sample.posts.length >= 1:
      send to background: { event: "vibe_sample", site_id, posts }

background:
  on vibe_sample:
    merge into VibeProfile.few_shot_posts (keep most-recent N=5)
    bump last_refreshed
    persist
```

Critical rules:
- **Never** run scraping outside an active user visit.
- **Never** transmit the scraped content off-device. It feeds the local cache only.
- **Per-site DOM extractors** live in `src/content/extractors/<site_id>.ts`. Each is a small function returning `{ title, body, comments }[]`. When a site's DOM changes, only that file changes. Stale extractors are surfaced via a telemetry-free "0 samples in 14 days" flag in the options page.
- Respect `robots.txt`? — content script reading already-loaded user-facing DOM is not crawling. We are not bypassing robots. We are not fetching pages the user didn't ask for. Document this stance for the privacy policy.

## 5. Caching policy

```
chrome.storage.local["vibe:<site_id>"] = VibeProfile
TTL: 7 days for the structured fields, refreshed eagerly on any opportunistic sample.
TTL: 24 h for few_shot_posts staleness check — if older, mark "stale" badge in UI.
```

A stale profile is still used (better than nothing), but the side panel shows a small "trend may be outdated" badge until the user visits the community.

User can force-refresh from the options page.

## 6. How few-shots get into a prompt

When `vibe.rewriteInVibe(text, vibe)` runs:

1. Pick the **top 2** few_shot_posts by collected_at recency.
2. Strip personal info (mention handles, URLs in body) via a regex pass.
3. Cap each to ~500 chars of body + 3 top comments.
4. Inject as cached content block — see [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) §5.

If the profile is `source: "bundled-seed"` and >30 days old, the side panel surfaces a soft warning before the result: "Using bundled examples from {date}. Visit the community to update."

## 7. What happens on an unknown URL

User invokes Shield/Sword on a site we have no profile for.

```
if no profile for url.hostname:
  if (content_script can extract anything):
    build an ephemeral VibeProfile { source: "scraped", confidence: low }
    proceed with a visible "learning vibe" badge
  else:
    fall back to "Generic Korean cynical" profile (bundled)
    show "no community profile — generic tone" badge
```

Never refuse. Always degrade.

## 8. PII and toxicity hygiene

Before any few-shot enters a prompt:
- Replace user handles (`@xxx`, `*님`) with `[user]`.
- Strip URLs from post bodies (we don't want the LLM citing random forum links as sources).
- Drop posts containing slurs from a small blocklist (we don't want them re-emitted in rewrites). The blocklist lives in `src/lib/safety/slurs.ts` and is overridable per locale.

## 9. Open questions

1. **Cross-board variance within fmkorea / dcinside.** A politics board's vibe ≠ a hobby board's vibe. Site-level granularity is probably too coarse. Decision: model `site_id` as `"<host>:<board_slug>"` from day one, even if seeds start at host level. Cheap insurance.
2. **Do we ever share user-curated profiles?** Tempting (community curation, network effect) — adds a backend, moderation, abuse vector. Out of scope until v2.
3. **LLM-generated vibe summary as a layer.** Could feed raw best-posts into a one-shot "summarize this community's voice" call, store the structured result, and use it instead of raw few-shots. Cheaper at inference time, but adds a daily cost and a quality risk. Try after we have baseline measurements.

## 10. Quality checks for the human curator

When you author or refresh a seed profile, gut-check:

- [ ] Could a reader tell which community this is, from the few-shots alone?
- [ ] Are at least 3 of the high-signal lexicon words *specific* to this community?
- [ ] Does the `sarcasm_style` description name a *direction*, not just "sarcastic"?
- [ ] Are the few-shots from the last 30 days?
- [ ] Would the example posts plausibly land on the best/concept page today?
- [ ] No personal info? No slurs?

If any of these is "no," the profile isn't ready to ship.
