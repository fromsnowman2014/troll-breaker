# Agent Design — Native Browser

> The agents themselves (Fact, Logic, Vibe, Evaluator) are **unchanged** from the extension version. This doc records only the deltas introduced by moving from a service-worker host to a long-lived main-process host.

For the canonical agent design, read `../docs/AGENT_DESIGN.md` first. This file is a diff against it.

---

## 1. What carries over verbatim

| Thing | Source of truth |
|---|---|
| Agent roster (Fact, Logic, Vibe, Evaluator) and responsibilities | `../docs/AGENT_DESIGN.md` §1 |
| Pipeline shapes (Defense, Attack, Refine) | `../docs/AGENT_DESIGN.md` §2 |
| Fast / Standard / Deep mode policy | `../docs/AGENT_DESIGN.md` §3 |
| MCP-style tool surface (`get_site_vibe`, `verify_fact_with_links`, `search_web`) | `../docs/AGENT_DESIGN.md` §4 |
| Error / timeout handling | `../docs/AGENT_DESIGN.md` §5 |
| Agent isolation rules | `../docs/AGENT_DESIGN.md` §6 |
| Test strategy | `../docs/AGENT_DESIGN.md` §7 |
| Prompt structure + caching | `../docs/PROMPT_GUIDELINES.md` (whole file) |
| Vibe extraction logic | `../docs/VIBE_EXTRACTION.md` (whole file) |

Code that implements those concepts in the extension (`src/agents/*`, `src/lib/llm/*`, `src/lib/search/*`, `src/lib/storage/*`) is **lifted into `src/main/agents/`, `src/main/lib/llm/`, etc.** under the native shell with minimal changes — the only things that change are:

- Drop `chrome.storage` references → use `lib/storage/disk.ts` (`fs/promises`-backed KV).
- Drop `fetch` polyfills for service-worker compat → Node 22 has native `fetch`.
- Drop any `XMLHttpRequest`-specific workarounds.

## 2. What changes — the deltas

### 2.1 Host process

| | Extension | Native browser |
|---|---|---|
| Where agents run | Service worker (event-driven, suspended when idle). | Main process (long-lived for the app's lifetime). |
| Cache lifetime | Limited by service-worker suspension; warm cache only inside one session of activity. | Warm for the whole app session. Disk cache below the in-memory layer. |
| Cancellation | `AbortController` was per-message; complex due to SW restart. | Per `request_id`, kept in a Map in `orchestrator/cancellation.ts`; survives the whole session. |
| Concurrency limit | Implicit (browser allowed ~6 concurrent fetches per origin). | Explicit: a small concurrency limiter (max 4 in-flight LLM calls) prevents a "click Defense 10 times" runaway. |

### 2.2 Names

The mode names in the UI change to match what the PRD describes:

| Internal (inherited) | UI label (new) |
|---|---|
| Shield | **Defense** (🛡) |
| Sword | **Attack** (⚔) |

Internal code keeps `Shield` / `Sword` for stability (matches `../docs/CODE_MAP.md`). UI translation lives in `chrome-renderer/strings.ts`. Result schema field names also keep the old names (`ShieldResult` / `SwordResult`) — see `DATA_SCHEMAS.md`.

Renaming the internal symbols is **out of scope** for the port. Touch only what platform-change requires.

### 2.3 Vibe sampling

The extension had an "opportunistic best-post sampling" plan (extension `VIBE_EXTRACTION.md`), executed by the content script. In the native shell:

- The **page preload** does not do scraping. It exposes only the three messages from [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.
- "Best-post sampling" becomes an **explicit main-process fetch** when the orchestrator decides the cached vibe profile is stale.
  - Use Chromium-cookie-aware `net.request` from the Electron main process, so the user's logged-in session can read protected pages.
  - Per-site DOM extractor specs from `../docs/site-extractors/` are evaluated server-side (against the fetched HTML).
- Same TTL (7 days), same `VibeProfile` shape.

This is a clear improvement over the extension version — sampling no longer depends on the user happening to scroll a community page; the main process can refresh proactively in the background. Worth one design note here, but the pipeline shape is the same.

**Open question (carryover):** if a user is on a brand-new site we have no extractor for, do we (a) refuse, (b) use the generic Korean cynical baseline, or (c) crawl? Current bias: (b) with a visible "vibe is generic" badge — and queue an offline TODO to add an extractor. No live LLM-driven extractor in MVP.

### 2.4 Insert-back

Extension version used a content-script reference to the textarea via a per-invocation token. Native version uses the **page preload** with the same token model. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.

The difference: the token now lives in main-process state, not content-script state. Tokens have a TTL of **120 seconds** — long enough for the user to read the result and click Insert, short enough that stale tokens don't survive across multiple invocations.

### 2.5 Refinement

Identical to extension version. One LLM call per turn, single Haiku, carries `priorResult` + `userInstruction` + last N conversation turns (default `N=5`).

Refinement does NOT re-run Fact, Logic, or the Evaluator unless the user instruction matches one of the explicit re-trigger patterns:

- "fact check again", "다시 팩트체크", "rescore", "다시 점수", "fact check the new version", "팩트 다시 확인"

Detected via a simple keyword/regex sweep in the orchestrator. False positives are fine (worst case is one extra cached call); false negatives are fine (user can manually click 🔄).

## 3. Orchestrator API

The native main-process orchestrator exposes three async functions, each yielding events through the IPC layer:

```ts
// src/main/orchestrator/orchestrator.ts

runDefense(req: DefenseRequest, on: ProgressSink): Promise<DefenseResult>
runAttack(req: AttackRequest, on: ProgressSink): Promise<AttackResult>
runRefine(req: RefineRequest, on: ProgressSink): Promise<RefineResult>

type ProgressSink = {
  stage: (label: string) => void   // emits evt:agent:progress
  cancelToken: AbortSignal
}
```

The IPC handler in `src/main/ipc/handlers.agent.ts` wires these to:

- `ui:agent:defense` → `runDefense`
- `ui:agent:attack` → `runAttack`
- `ui:agent:refine` → `runRefine`
- `ui:agent:cancel` → looks up the AbortController for the request_id and aborts.

The `ProgressSink.stage()` calls emit `evt:agent:progress` events with labels like:

- `"vibe.lookup"`
- `"fact.check"`
- `"logic.detect"`
- `"vibe.rewrite"`
- `"evaluator.score"`
- `"vibe.finalize"`

The chrome renderer maps these to the skeleton UI strings (e.g., "사이트 분위기 파악 중…").

## 4. Pipeline selection

Same rule as extension: `pickPipeline(text)` returns `"fast"` if `text.length <= 500`, else `"standard"`. In MVP we **always run Fast** regardless — Standard is not wired up until v0.2.

`"deep"` is callers-opt-in only; in MVP there is no UI for it. The infrastructure (a flag on `DefenseRequest`) is reserved.

## 5. Caching policy (with native shell)

Two layers, both managed by `lib/storage/kv.ts`:

1. **In-memory** (per-app-session). Backed by a `Map`. Fast path.
2. **Disk** (persistent). Backed by `fs/promises` at `userData/cache/...`. Slow path.

On read: in-memory → disk → miss. On write: both layers.

| Item | In-memory key | Disk key | TTL |
|---|---|---|---|
| Vibe profile | `vibe:<site_id>` | `cache/vibe/<site_id>.json` | 7 d |
| Fact memo | `fact:<sha256(claim+locale)>` | `cache/fact/<sha256>.json` | 24 h |
| Search results | `search:<sha256(query)>` | (not persisted) | 1 h (memory only) |

`request_id` results are NOT cached — refinement starts from the in-memory current session, not a cache lookup.

## 6. New: graceful provider switching

If the user changes the LLM provider in the settings drawer **while an agent call is in flight**, the rule is:

- The in-flight call completes against the **previous** provider.
- The next call uses the new one.
- The orchestrator reads provider config at `request_id` creation time; it caches the resolved adapter for that request.

This avoids partial calls and surprise costs.

## 7. Things we deliberately did NOT change

- The 4-axis Evaluator rubric (Cynicism / Fact / Punchline / Vibe). Whole product mission.
- The Fallacy taxonomy. Adding a fallacy type still requires a coupled UI label + prompt update.
- The "1 retry on schema-violation" rule for structured outputs.
- The MCP-style tool definitions (`get_site_vibe`, `verify_fact_with_links`, `search_web`).
- The agent isolation invariant — agents do not call each other; orchestrator composes.

## 8. Open questions

1. **Vibe sampling cadence in native shell.** Should we eagerly refresh stale vibe profiles in the background while the user browses, or lazily on next invocation? MVP: lazy. Background refresh is a v0.2+ optimization once we have telemetry on actual hit rates (which, given no telemetry, means owner dogfood reports).
2. **Are tools (MCP) exposed differently in main process?** No — the LLM still sees them as JSON tool definitions; the orchestrator handles them in main. The seam between LLM and tool execution is identical to the extension.
3. **Multi-claim Defense.** Same open question as extension — claim splitter still un-built.
4. **Counter-puncher as its own agent vs inlined in Logic.** Same answer: inlined for now.
