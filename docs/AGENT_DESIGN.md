# Agent Design

How the Shield and Sword pipelines are decomposed, what each agent owns, and the orchestration policy.

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4 (message flow) and [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) before changing anything here.

## 1. Agent roster

| Agent | File (planned) | Responsibility | Inputs | Outputs |
|---|---|---|---|---|
| **Fact** | `src/agents/fact.ts` | Verify a single claim, return summary + cited sources. | `{ claim: string, locale?: 'ko' }` | `FactResult` |
| **Logic** | `src/agents/logic.ts` | Detect ad hominem, red herring, strawman, slippery slope, false dilemma, etc. | `{ text: string }` | `Fallacy[]` |
| **Vibe** | `src/agents/vibe.ts` | Capture site tone (lexicon, sentence shape, sarcasm cadence) AND rewrite a draft in that tone. | `{ url: string }` or `{ draft: string, vibe: VibeProfile }` | `VibeProfile` or `string` |
| **Evaluator** | `src/agents/evaluator.ts` | Score a draft on the PRD §5 4-axis rubric (Cynicism / Fact / Punchline / Vibe). | `{ draft: string, vibe: VibeProfile }` | `EvalScore` |
| **Counter-Puncher** | inlined into Logic for now | Given a detected fallacy, suggest a cynical-tone rebuttal sentence. | `{ fallacy: Fallacy, vibe: VibeProfile }` | `string` |

Each agent is a function. No classes, no DI framework. Agents call the shared `lib/llm` adapter; orchestrator wires them up.

## 2. Pipelines

### 2a. Shield pipeline

```
input:  { selectedText, pageUrl, pageBestPostsSample }
        │
        ├─► vibe.getSiteVibe(pageUrl)                  ── may cache hit
        │
        ├─► fact.verifyFactWithLinks(selectedText)     ── search + LLM
        │       returns { summary, sources[], confidence }
        │
        ├─► logic.detectFallacies(selectedText)        ── LLM only
        │       returns [{ type, span, explanation, counterPunch }]
        │
        └─► vibe.rewriteInVibe(
              compose(factSummary, fallacyCounters),
              vibe
            )                                          ── LLM with few-shot

output: ShieldResult { vibeAdjustedSummary, sources, fallacies, rawFacts }
```

**Why fact and logic run in parallel:** they're independent of each other. They both depend on the vibe profile *only for the final rewrite* — the raw fact/logic outputs are vibe-agnostic. Run vibe.getSiteVibe() first (or in parallel if cache likely hit), then fan out fact+logic, then sequence the rewrite.

### 2b. Sword pipeline

```
input:  { draft, pageUrl }
        │
        ├─► vibe.getSiteVibe(pageUrl)
        │
        ├─► evaluator.scoreAndCritique(draft, vibe)
        │       returns { axes: {cynicism, fact, punchline, vibe}, lineNotes[] }
        │
        └─► vibe.finalizeConceptPost(draft, evalNotes, vibe)
                returns finalDraft

output: SwordResult { score, lineNotes, finalDraft }
```

Evaluator and finalize must be **sequential** — finalize uses the eval notes.

### 2c. Chat refinement (both modes)

After the panel shows a result, the user can chat-edit it:

```
input:  { mode: 'shield'|'sword', priorResult, userInstruction, conversationHistory }
        │
        └─► vibe.rewriteInVibe(
              priorResult.text,
              vibe,
              extraInstruction = userInstruction,
              conversationHistory = lastN
            )

output: refined text only (sources/score unchanged unless user asked)
```

Refinement is **cheap and fast** — single Haiku call. Don't re-run fact or evaluator unless user explicitly asks ("re-check the second source", "rescore this").

## 3. Single-call vs multi-agent — the real decision

PRD §4 describes a multi-agent system. In practice, 3+ sequential LLM calls cost 3× tokens and 2–3× latency. For most user requests that is the wrong tradeoff.

**Proposal — three modes, user-toggleable in options:**

| Mode | What runs | Latency target | Best for |
|---|---|---|---|
| **Fast** (default) | One structured-output call. System prompt contains vibe few-shots + fact-check tool + fallacy taxonomy. Model emits one JSON with everything. | < 4 s | Quick Shield / Sword on short text. |
| **Standard** | Vibe (cache) → parallel(Fact, Logic) → Rewrite. ~2 sequential LLM calls. | < 8 s | Default for posts > ~500 chars. |
| **Deep Analyze** | Full multi-agent. Each agent is its own call with its own focused prompt. Useful for high-stakes posts. | < 20 s | User opt-in via a "deep analyze" button. |

The orchestrator picks Fast vs Standard automatically based on input length; Deep is always explicit.

**Why this matters:** the user is in a debate. They want a tight, fast response. Optimize the common case; offer the heavy path on demand.

## 4. Tool surface exposed to the LLM

Following PRD §4 MCP guidance, expose a small, stable set of tools. The LLM decides when to call them.

```
tools = [
  {
    name: "get_site_vibe",
    input: { url: string },
    returns: VibeProfile           // see DATA_SCHEMAS.md
  },
  {
    name: "verify_fact_with_links",
    input: { claim: string, locale?: "ko"|"en" },
    returns: FactResult
  },
  {
    name: "search_web",
    input: { query: string, max?: number },
    returns: [{ title, url, snippet }]
  }
]
```

`get_site_vibe` and `verify_fact_with_links` are convenience wrappers; `search_web` is the primitive. Most calls should go through the convenience wrappers — they cache, dedupe, and apply locale defaults.

**Why expose tools instead of pre-baking all data:** lets the LLM decide whether a claim *needs* a web check. For a tone rewrite of an opinion ("I think this team will win"), no fact check is needed and the model can skip it.

## 5. Error handling

Each agent must:
- **Time out** at 30 s (configurable). Throw `AgentTimeoutError`.
- **Validate output** against its zod schema. On parse failure, retry once with a "format-only" reprompt; on second failure, surface a clean error to UI.
- **Never silently degrade.** If fact-check failed, the rewrite must include `confidence: 'unverified'` in metadata so the UI can warn.

## 6. What an agent must NOT do

- Don't call other agents directly. Orchestrator composes them. (Keeps cycles impossible, testing easy.)
- Don't touch `chrome.storage` directly — go through `lib/storage`. (Keeps agents portable to a future backend.)
- Don't render UI strings. Return structured data; the UI layer renders.
- Don't log user content to console in production builds.

## 7. Testing strategy for agents

- **Schema tests:** every agent has a fixture file `evals/<agent>.fixtures.json` with input + expected-properties. Vitest checks that output conforms to schema and hits qualitative properties (e.g., `fact.sources.length >= 1`).
- **Prompt regression:** when a prompt template changes, the fixture run must pass. If qualitative properties shift, update fixtures *deliberately* — never to make a flaky test pass.
- **Mock LLM in unit tests; real LLM in eval runs.** Two separate test commands: `pnpm test` (fast, mocked) and `pnpm eval` (real keys, slower, optional in CI).

## 8. Open questions

1. **Counter-puncher as its own agent?** Right now it's a method on Logic. If fallacy counters need their own vibe few-shots (different from the main rewrite), split it out.
2. **Cross-site vibe transfer.** If user is on a brand-new site we have no seed corpus for, do we (a) refuse, (b) use a generic Korean-cynical baseline, or (c) opportunistically scrape and warn? Current bias: (c) with a visible "vibe is being learned" badge.
3. **Multi-claim Shield.** If the selected text contains 3 claims, do we run Fact 3 times in parallel? Probably yes, capped at 5. Needs a claim-splitter step in Shield — currently implicit in the Fact prompt.
