# Prompt Guidelines

How prompts are authored, versioned, tested, and shipped in this codebase. Read [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) first to know which prompts exist.

## 1. Where prompts live

```
src/agents/<agent>/
  ├── <agent>.ts           # the agent function
  ├── prompts/
  │   ├── system.md        # system prompt (multi-line, with placeholders)
  │   ├── user.md          # user-message template
  │   └── examples.json    # few-shot pairs (input → output)
  └── schema.ts            # zod schema for structured output
```

**Why markdown files, not inline strings:**
- Diffable. PR reviews on prompts are useful instead of a wall of escape characters.
- Editable without recompile during dev (vite watches markdown).
- Translators / native-Korean reviewers can read them.

The agent loads the markdown at build time via Vite's `?raw` import.

## 2. Prompt anatomy

Every system prompt has these sections, in order:

```
# Role
You are <one sentence — what role, for whom>.

# Goal
<the single thing this call must accomplish>

# Inputs
<short description of placeholders this prompt expects>

# Constraints
- Output MUST conform to the schema below (JSON, no prose around it).
- Cite sources only from the provided search results, never invent URLs.
- Korean output, unless input is English and locale is 'en'.
- <agent-specific constraints>

# Style
<vibe rules, if any — usually injected dynamically for vibe-aware agents>

# Output schema
<inlined zod schema in human-readable form>

# Examples
<2–5 few-shots, drawn from examples.json>
```

This order matters: role → goal → inputs → constraints → style → schema → examples. Constraints before examples so the model treats examples as illustrations, not exceptions.

## 3. Placeholder conventions

- `{{snake_case}}` for substitutions. No nested templating logic — if you need branching, do it in TypeScript before rendering.
- Required placeholders are declared at the top of the file in an HTML comment:
  ```
  <!-- requires: claim, locale -->
  ```
  The render helper throws if a required placeholder is missing. Keeps prompt/code drift impossible.

## 4. Structured output: tool-use over JSON-mode

Force structured output via the LLM's **tool-use** mechanism, not "respond in JSON" begging. Tool-use is reliably validated; JSON-mode often degrades natural-language quality.

For Anthropic: define a single tool `emit_result` whose `input_schema` is the agent's zod schema (converted via `zod-to-json-schema`). Then `tool_choice: { type: "tool", name: "emit_result" }`. The model's tool input is the structured output.

After the call: parse with zod → on failure, retry once with the validation error injected → on second failure, throw.

## 5. Prompt caching

Anthropic's prompt cache has a 5-minute TTL. **Design prompts so the long, stable part comes first.**

Structure all our prompts as:
```
[STABLE]  role + goal + constraints + schema + examples           ← cache_control: ephemeral
[STABLE]  vibe few-shots for this site                            ← cache_control: ephemeral
[VOLATILE] today's facts / user input                              ← not cached
```

Vibe few-shots change daily (when the corpus refreshes) but are stable within a session. Putting them in a separate cache block lets us cache the schema/instructions independently of the per-site corpus.

Concretely: every agent's prompt builder returns a list of content blocks with `cache_control` markers, not a single string.

## 6. Eval harness

A prompt is "tested" by running it against frozen fixtures and asserting **properties**, not exact strings. LLM output drifts; assertions must be drift-tolerant.

```
evals/<agent>.fixtures.json:
  [
    {
      "name": "ad-hominem detection",
      "input": { "text": "<example with ad hominem>" },
      "expect": {
        "fallacies.length": ">= 1",
        "fallacies[*].type": "includes 'ad_hominem'",
        "fallacies[0].counterPunch": "matches /^[^A-Z]/"   // starts lowercase, casual
      }
    }
  ]
```

Run: `pnpm eval` → hits real LLM, costs real tokens. Run only when prompts change.

CI does NOT run eval (cost + non-determinism). It runs unit tests against a mocked LLM that returns canned schema-conformant outputs.

## 7. Versioning

Each prompt file has a header comment:
```
<!-- version: 3 -->
<!-- changed: 2026-06-07 — added counter-punch tone constraint -->
```

When a prompt changes meaningfully:
1. Bump the version number.
2. Add a one-line changelog entry in the file.
3. Re-run `pnpm eval`. If qualitative properties shift, update the fixture's `expect` block deliberately, in the same PR.

If a prompt change ships without a fixture update and properties later regress, blame routes to the change that skipped step 3.

## 8. The Evaluator prompt (PRD §5) — concrete reference implementation

This is the most opinionated prompt in the product. Reproduced here as the template for how every prompt should be authored.

```markdown
<!-- version: 1 -->
<!-- requires: current_url, vibe_few_shots, draft -->

# Role
You are a senior editor who has internalized the meta and language of the community at {{current_url}}. You know which posts go to "베스트/개념글" and which die in the void.

# Goal
Score the user's draft on four axes and produce a rewritten "concept post" that would top the front page of this community.

# Inputs
- `{{current_url}}` — the community
- `{{vibe_few_shots}}` — 2–3 recent top posts from this community, verbatim
- `{{draft}}` — the user's draft

# Constraints
- Output MUST conform to the schema. No prose outside the tool call.
- Each axis score is an integer 0–10, with a one-sentence rationale.
- The rewritten post uses the lexicon, sentence length, and cadence demonstrated in {{vibe_few_shots}} — NOT generic Korean.
- Do NOT invent facts. If the draft makes a factual claim that you cannot substantiate from context, mark it `needs_verification: true` instead of asserting it.
- The rewritten post ends with a punchline. Always.

# Style (injected at runtime)
{{vibe_few_shots}}

# Output schema
{
  scores: {
    cynicism:  { value: int, rationale: str },
    fact:      { value: int, rationale: str },
    punchline: { value: int, rationale: str },
    vibe:      { value: int, rationale: str }
  },
  line_critique: [{ span: str, note: str }],
  final_post: str,
  needs_verification: [str]   // claims that the user should fact-check
}

# Examples
(loaded from evaluator/examples.json — 2 worked examples)
```

## 9. Anti-patterns (do not do)

- **"Pretend you are…" persona spam.** Wastes tokens and rarely improves output. State the role in one sentence.
- **"Think step by step out loud."** We use tool-use structured output. Reasoning leaks into JSON and breaks parsing. If reasoning helps, use a separate hidden "scratch" field in the schema that the UI doesn't render.
- **Telling the model to "be sure" or "be very careful."** Doesn't work. Add a concrete constraint instead.
- **Multiple roles in one prompt.** If a prompt says "you are an editor AND a fact-checker AND a comedian," split it into agents.
- **Prompts that hard-code "fmkorea" or specific site names.** Vibe is injected via few-shots; the prompt itself stays site-agnostic. Lets us add sites without touching the prompt.
- **Korean prompt fragments mixed with English placeholders inconsistently.** Pick a language per prompt and commit. Constraints in English are fine if the model performs equivalently; output language is controlled by an explicit constraint.

## 10. Open questions

1. **Do we ship prompts unminified or minified?** Markdown is readable but adds tokens. Probably ship as-is — savings are marginal vs review value.
2. **Per-site prompt overrides?** Some sites might genuinely need a tweaked rubric. Right now the variation is in few-shots only. Revisit if eval shows fmkorea and theqoo diverge sharply.
3. **Prompt audit log.** For Deep Analyze mode, should we surface the actual prompts to power users? Useful for trust; risky if it exposes our IP. Defer decision.
