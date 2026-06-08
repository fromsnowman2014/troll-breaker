# Data Schemas

Typed contracts between modules. Source of truth for all message payloads, structured LLM outputs, and storage shapes.

When code lands, these become zod schemas in `src/lib/schemas/` and are imported wherever the type is used. Until then, this doc is the spec.

## 1. Core domain types

### `VibeProfile`

```ts
VibeProfile {
  site_id: string                  // "<host>" or "<host>:<board_slug>"
  display_name: string             // human label, e.g. "에펨코리아 정치/시사"
  source: "bundled-seed" | "scraped" | "user-curated"
  last_refreshed: ISO8601

  lexicon: {
    high_signal_words: string[]    // ≤ 30
    forbidden_words: string[]      // ≤ 15
    emoji_or_emoticons: string[]   // ≤ 10
  }

  sentence_shape: {
    avg_length: int                // chars
    paragraph_style: "short-burst" | "long-thread" | "mixed"
    opener_patterns: string[]      // ≤ 10
    closer_patterns: string[]      // ≤ 10
  }

  tonality: {
    cynicism_level: 0..10
    sarcasm_style: string          // free text, ≤ 200 chars
    political_lean: "left" | "right" | "mixed" | "apolitical"
    taboo_topics: string[]         // ≤ 10
  }

  few_shot_posts: VibePost[]       // 2..5
}

VibePost {
  title: string
  body: string                     // ≤ 1500 chars after trim
  top_comments: string[]           // ≤ 3 comments, each ≤ 300 chars
  collected_at: ISO8601
}
```

Invariants:
- `few_shot_posts.length` between 2 and 5 (rejects under-curated profiles).
- No PII — all `@handle` mentions stripped before storage.
- `site_id` matches `/^[a-z0-9.-]+(:[a-z0-9_-]+)?$/`.

### `FactResult`

```ts
FactResult {
  claim: string                    // verbatim what was checked
  verdict: "true" | "false" | "partial" | "unverified"
  summary: string                  // ≤ 400 chars, vibe-agnostic
  sources: Source[]                // ≥ 0, but verdict ≠ "unverified" ⇒ ≥ 1
  confidence: 0..1
  needs_followup: string[]         // optional clarifying questions
}

Source {
  title: string
  url: string                      // absolute URL
  publisher?: string               // "Hankyoreh", "Wikipedia", ...
  published_at?: ISO8601
  snippet: string                  // ≤ 280 chars, verbatim quote
}
```

Invariants:
- `verdict: "unverified"` ⇒ `sources` may be empty AND UI must show warning.
- All `sources[].url` must be HTTPS (we don't surface plain HTTP).

### `Fallacy`

```ts
Fallacy {
  type: FallacyType
  span: string                     // verbatim excerpt from input
  explanation: string              // ≤ 200 chars, vibe-agnostic
  counter_punch: string            // ≤ 300 chars, vibe-applied rebuttal
}

FallacyType =
  | "ad_hominem"
  | "red_herring"
  | "strawman"
  | "slippery_slope"
  | "false_dilemma"
  | "appeal_to_authority"
  | "appeal_to_emotion"
  | "tu_quoque"
  | "moving_the_goalposts"
  | "other"
```

If a fallacy doesn't fit the taxonomy, use `"other"` and put the named fallacy in `explanation`. Don't expand the enum casually — every new value is a UI label translation + a prompt update.

### `EvalScore`

PRD §5 4-axis rubric, structured.

```ts
EvalScore {
  axes: {
    cynicism:  AxisScore
    fact:      AxisScore
    punchline: AxisScore
    vibe:      AxisScore
  }
  line_critique: LineNote[]
  final_post: string               // the rewritten draft
  needs_verification: string[]     // claims the user should fact-check
}

AxisScore {
  value: 0..10                     // integer
  rationale: string                // ≤ 150 chars
}

LineNote {
  span: string                     // verbatim excerpt from draft
  note: string                     // ≤ 200 chars
}
```

### `ShieldResult` and `SwordResult`

These are the orchestrator's outputs sent to the side panel.

```ts
ShieldResult {
  request_id: string               // for cancellation
  pipeline: "fast" | "standard" | "deep"
  vibe_used: { site_id: string, display_name: string }
  claim_excerpt: string            // ≤ 200 chars
  fact: FactResult
  fallacies: Fallacy[]
  vibe_adjusted_summary: string    // the final rendered response
  generated_at: ISO8601
}

SwordResult {
  request_id: string
  pipeline: "fast" | "standard" | "deep"
  vibe_used: { site_id: string, display_name: string }
  score: EvalScore
  generated_at: ISO8601
}
```

## 2. Storage shapes

`chrome.storage.local` keys and their schemas. Treat keys as a flat namespace with `:` separators.

| Key | Shape | Notes |
|---|---|---|
| `secrets` | `{ llm: {provider, key_encrypted}, search: {provider, key_encrypted} }` | See [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §3. |
| `prefs` | `Preferences` (see below) | User-tunable settings. |
| `vibe:<site_id>` | `VibeProfile` | One per site. |
| `vibe:overrides:<site_id>` | `Partial<VibeProfile>` | User edits layered over the bundled profile at read time. |
| `whitelist:hosts` | `string[]` | Hosts where the floating button injects. |

```ts
Preferences {
  model_tiers: {
    fast:     ModelChoice
    standard: ModelChoice
    deep:     ModelChoice
  }
  default_pipeline: "fast" | "standard"
  language: "ko" | "en"            // primary output language
  ui: {
    theme: "system" | "light" | "dark"
    show_vibe_details: boolean     // expose vibe-used section in result card
  }
}

ModelChoice {
  provider: "anthropic" | "openai" | "google"
  model_id: string                 // e.g., "claude-haiku-4-5"
}
```

`IndexedDB` (via `idb-keyval`):

| Store | Shape | TTL |
|---|---|---|
| `fact_memo` | `{ key: sha256(claim+locale), value: FactResult, ts: number }` | 24 h, cleanup on read. |
| `best_posts_sample` | `{ key: site_id, value: VibePost[], ts: number }` | replaces VibeProfile.few_shot_posts on next merge. |

## 3. Message-passing payloads

All messages between content script ↔ service worker ↔ side panel use the `Message` discriminated union.

```ts
Message =
  | { kind: "shield/request",  request_id: string, payload: ShieldRequest }
  | { kind: "shield/result",   request_id: string, payload: ShieldResult }
  | { kind: "shield/error",    request_id: string, error: AppError }

  | { kind: "sword/request",   request_id: string, payload: SwordRequest }
  | { kind: "sword/result",    request_id: string, payload: SwordResult }
  | { kind: "sword/error",     request_id: string, error: AppError }

  | { kind: "refine/request",  request_id: string, prior: ShieldResult | SwordResult, instruction: string }
  | { kind: "refine/result",   request_id: string, refined_text: string }

  | { kind: "vibe/sample",     site_id: string, posts: VibePost[] }
  | { kind: "insert_back",     target_token: string, text: string }
  | { kind: "cancel",          request_id: string }


ShieldRequest {
  selected_text: string
  page_url: string
  page_title?: string
}

SwordRequest {
  draft: string
  page_url: string
  textarea_token: string           // opaque, used by insert_back
}

AppError {
  code:
    | "no_api_key"
    | "llm_unreachable"
    | "search_unreachable"
    | "schema_validation_failed"
    | "timeout"
    | "cancelled"
    | "unknown"
  message: string                  // user-safe
  details?: unknown                // dev-only
}
```

Every `kind` is namespaced. The router is a flat switch on `kind`. Adding a feature = adding a new kind = adding a new router case. No magic strings.

## 4. LLM tool-use schemas

The tools we expose to the LLM (PRD §4, [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) §4). Each tool's `input_schema` is the corresponding zod schema converted to JSON Schema at build time.

```ts
ToolDefs = [
  {
    name: "get_site_vibe",
    description: "...",
    input_schema: { url: string }
    // returns VibeProfile (see §1)
  },
  {
    name: "verify_fact_with_links",
    description: "...",
    input_schema: { claim: string, locale?: "ko" | "en" }
    // returns FactResult
  },
  {
    name: "search_web",
    description: "...",
    input_schema: { query: string, max?: int }
    // returns Source[]
  }
]
```

Each agent's structured-output schema (the `emit_result` tool described in [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) §4) is the agent's return type from §1.

## 5. Versioning

Schemas evolve. Rules:

- Adding an **optional** field is non-breaking. Ship it.
- Adding a **required** field is breaking. Bump a `schema_version` in `Preferences` and provide a migration in `lib/storage/migrations.ts`.
- Removing or renaming a field is breaking. Same rule.
- Enum expansions (e.g., new `FallacyType`) require a UI label and a prompt update *in the same PR*. The fallback is `"other"` for forward compatibility.

The current `schema_version` is `1`. Bump in this doc and in the migration file together.

## 6. What is deliberately NOT modeled

- **Conversation history for chat refinement.** Lives in side-panel React state only. Not a persistent shape.
- **Per-request usage / cost.** Could be useful; out of scope until a "usage dashboard" feature exists.
- **A "user identity"**. There is no user; there is a browser profile. Don't introduce one.
