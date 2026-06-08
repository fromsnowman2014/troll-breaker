# User Action Items

Things the human owner of this project must do — outside of writing code — for the extension to actually ship and work. Sorted by when they're needed.

Each item names: what to do, why, when, and how to verify it's done.

---

## Phase 0 — Before any code is written

### §1. Chrome Web Store developer account

- **What:** Register at https://chrome.google.com/webstore/devconsole. One-time **$5 USD** fee.
- **Why:** Without this you cannot publish the extension. Better to do early so it's not on the critical path at launch.
- **When:** Now (or within the next week).
- **Verify:** You see the developer dashboard at the URL above.

### §2. Seed vibe corpora — initial curation

This is the most important manual artifact and the biggest single time cost.

- **What:** Hand-author a seed `VibeProfile` JSON for **each** target community. Minimum launch set: `fmkorea`, `dcinside`, `theqoo`, `ruliweb`. Add others as you go.
- **Why:** Without good seeds, day-one quality is garbage and the product feels generic. See [`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §3.
- **What each profile needs:**
  - 5 recent best-posts (≤30 days old), transcribed: `title`, `body`, `top_comments[]`.
  - A 50-word voice memo describing the community's tone.
  - 15–30 high-signal lexicon words.
  - 5–10 forbidden phrases (things that scream outsider).
  - Tonality fields: cynicism level, sarcasm style direction, political lean, taboo topics.
  - **Per-board** profiles if the community has clearly different sub-communities (e.g., fmkorea politics vs hobby boards). Cheap insurance.
- **When:** Before MVP code lands. Code is useless without these.
- **Verify:** Each `extension/seeds/<site_id>.json` passes the quality checklist in [`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §10.

### §3. Per-site DOM extractor specs

- **What:** For each launch site, document the **CSS selectors** used to find best-post titles, bodies, and comments. One markdown file per site under `docs/site-extractors/<site_id>.md` — or a JSON if you prefer.
- **Why:** The opportunistic scraper ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §4) needs site-specific extractors. These break when sites change DOM. Centralizing them as docs first means devs can implement them and you can update them without touching code.
- **What each spec needs:**
  - URL pattern for the "best posts" listing page.
  - URL pattern for an individual post page.
  - Selector for the post title element.
  - Selector for the post body element (post content, not nav).
  - Selector for the top-N comments container.
  - Notes on login requirement, anti-bot quirks, JS-rendered vs server-rendered.
- **When:** Before MVP code lands.
- **Verify:** A dev can read the spec and write a working extractor without you in the loop.

### §4. Obtain and test API keys

- **What:** Get your own:
  - **Anthropic API key** — console.anthropic.com → API Keys.
  - **Brave Search API key** — api.search.brave.com (free tier is fine for personal testing).
- **Why:** You'll dogfood the extension with these; also needed to write the obtain-a-key instructions for end users.
- **When:** Before first dev build runs end-to-end.
- **Verify:** A simple `curl` to each provider returns a 200.

### §5. Legal / TOS review

Things you (the owner) should look into yourself before launch:

- **Anthropic TOS** — confirm browser-extension distribution of API-using software is permitted (it is, with BYOK). Skim the acceptable use policy for any wording about adversarial content, harassment, etc. Our "cynical rewrite" output likely sits inside policy, but you should know the line.
- **Brave Search API TOS** — confirm extension usage is fine.
- **Target community TOS** — read the terms of service for fmkorea, dcinside, theqoo, ruliweb on automated reading. We are **not** scraping their servers, we are reading the DOM that the user already loaded as a normal visitor — but this stance should be documented explicitly in our privacy policy, and you should have a reasoned answer if a site operator asks.
- **Chrome Web Store policies** — read https://developer.chrome.com/docs/webstore/program-policies. Single Purpose + User Data are the two we'll be evaluated on.
- **When:** Before store submission.
- **Verify:** You can answer "is this legally OK?" with one paragraph for each concern.

### §6. Publish a privacy policy

- **What:** Publish a privacy policy at a **stable URL** you control (GitHub Pages, personal site, anywhere stable).
- **Why:** Chrome Web Store requires it; users should be able to read it before installing. Content requirements in [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §8.
- **When:** Before store submission.
- **Verify:** The URL loads the policy and contains the required disclosures.

---

## Phase 1 — During MVP development

### §7. Run the spike tests

These are the three "open tech questions" from [`TECH_STACK.md`](./TECH_STACK.md) §10. They take ~30 min each and should happen before deeper investment in the stack.

- [ ] Anthropic SDK works from an MV3 service worker (fetch-only, no XHR).
- [ ] Brave Search latency from Korea is acceptable (< 1s p50).
- [ ] Chrome side panel retains state across tab switches as expected.

If any fails, revisit the tech stack before writing more code.

### §8. Decide the four open architectural questions

From [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8:

- [ ] Default pipeline mode (Fast vs Standard).
- [ ] Single LLM provider (Anthropic) vs multi-provider abstraction from day one.
- [ ] Search provider (Brave vs CSE vs Perplexity vs LLM-native).
- [ ] How to handle site DOM stability — extractor versioning policy.

Lock each one in writing in the relevant doc before code that depends on it ships.

### §9. Dogfood weekly

- **What:** Use the in-progress extension on at least one real debate per week.
- **Why:** No amount of eval fixtures replaces using the product where it's supposed to work. Vibe quality is the #1 thing only the owner can judge.
- **When:** From the first runnable build onward.
- **Verify:** A short note in the repo (`docs/dogfood-log.md` — optional) of what worked and what didn't.

---

## Phase 2 — Pre-launch

### §10. Store listing assets

You will need:

- **Icon set:** 16 × 16, 48 × 48, 128 × 128 PNGs. Plus a 128 × 128 store icon.
- **Screenshots:** At least 1, up to 5. 1280 × 800 or 640 × 400. Use real Shield/Sword results on a recognizable community page (with debug data stripped).
- **Promotional images** (optional but recommended): 440 × 280 small tile, 920 × 680 marquee.
- **Listing copy** (Korean + English): one-paragraph description, detailed description, category ("Productivity" probably fits best).
- **Permission justifications:** prepare the one-liners in [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §9.

**Verify:** Submission form fills with no warnings about missing assets.

### §11. Support channel

- **What:** A place users can reach you. GitHub Issues on the public repo is sufficient.
- **Why:** Vibe profiles will be wrong, sites will change DOMs, users will report it. You need a queue.
- **When:** Before store submission.
- **Verify:** Issue template exists; URL is in the store listing.

---

## Phase 3 — Ongoing maintenance

### §12. Vibe profile refresh cadence

- **What:** Re-curate the bundled seed profiles **monthly**. Communities' top-meta shifts; stale seeds = generic output.
- **Why:** Vibe quality decays. The opportunistic scraper helps for active users but day-zero users get the bundled seeds.
- **When:** Every ~30 days, or whenever an extractor breaks.
- **Verify:** Each profile's `last_refreshed` is within the last 30 days at release time.

### §13. DOM extractor watch

- **What:** Subscribe to your own "0 samples in 14 days" warning. When a site's extractor stops returning data, update the selector spec and ship a patched extractor.
- **Why:** Without this, the product silently degrades.
- **When:** Continuous. Should be the second thing you check on issues.

### §14. Provider model migrations

- **What:** When Anthropic releases a new model tier (e.g., Sonnet 4.7 → 4.8), evaluate it and consider updating the `Preferences.model_tiers` defaults. Document the decision in `docs/model-migrations.md`.
- **Why:** New models are usually cheaper or better. Inertia loses you both.
- **When:** Within ~2 weeks of a major model release.

---

## What is NOT on you (delegated to code / spec)

- Writing the actual extension code → engineering work, tracked in [`ROADMAP.md`](./ROADMAP.md).
- Defining schemas → in [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md).
- Authoring prompts → guided by [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md), but a Korean-fluent reviewer (you, probably) must approve them.
- Per-request abuse mitigation → BYOK shifts that responsibility to the user and their provider.

---

## Quick checklist (printable)

```
[ ] Chrome Web Store developer account ($5)
[ ] Seed vibe corpus: fmkorea
[ ] Seed vibe corpus: dcinside
[ ] Seed vibe corpus: theqoo
[ ] Seed vibe corpus: ruliweb
[ ] DOM extractor spec for each site above
[ ] Anthropic API key obtained & tested
[ ] Brave Search API key obtained & tested
[ ] Read Anthropic + Brave + community + CWS policies
[ ] Privacy policy published at stable URL
[ ] Three tech spikes completed
[ ] Four architectural decisions documented
[ ] Store listing assets prepared
[ ] Issue tracker URL set
[ ] Monthly refresh cadence on calendar
```
