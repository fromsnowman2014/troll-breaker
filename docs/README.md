# Truth & Strike — Documentation Index

Chrome extension that helps users win online debates with fact-based, site-native responses.
Two modes: **Shield** (defend / fact-check) and **Sword** (attack / draft enhancement).

Source of truth for product intent: [`PRD.md`](./PRD.md).

## Reading order

For a **product/PM** reader:
1. [`PRD.md`](./PRD.md) — what we're building and why
2. [`UI_UX_SPEC.md`](./UI_UX_SPEC.md) — what the user sees and does
3. [`ROADMAP.md`](./ROADMAP.md) — phased delivery, what ships when
4. [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) — what the human owner must do outside of code

For a **developer** picking up implementation:
1. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, Manifest V3 structure, message flow
2. [`TECH_STACK.md`](./TECH_STACK.md) — concrete choices + rationale + alternatives
3. [`AGENT_DESIGN.md`](./AGENT_DESIGN.md) — Shield/Sword agent orchestration
4. [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md) — prompt structure, versioning, eval
5. [`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) — how site tone/trends are captured
6. [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md) — typed contracts between modules
7. [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) — BYOK flow + threat model

## Document map

| Doc | Owner concern | Updated when |
|---|---|---|
| `PRD.md` | Product intent | Scope/feature changes |
| `ARCHITECTURE.md` | System structure | Module boundaries change |
| `TECH_STACK.md` | Tooling & libraries | A dependency is added/swapped |
| `AGENT_DESIGN.md` | Agent orchestration | Agent count/role changes |
| `PROMPT_GUIDELINES.md` | Prompt authoring | A new prompt template lands |
| `VIBE_EXTRACTION.md` | Tone/trend pipeline | Scraping or seed corpus changes |
| `UI_UX_SPEC.md` | User-facing surfaces | UI surface added/removed |
| `API_KEY_SECURITY.md` | Secrets & trust boundary | Storage or transport changes |
| `DATA_SCHEMAS.md` | Module contracts | A typed contract changes |
| `USER_ACTION_ITEMS.md` | Human-owner checklist | A new manual step is required |
| `ROADMAP.md` | Phased delivery | A milestone shifts |

## Status

**Phase:** Pre-implementation. Repo currently contains PRD + this docs set only.
Per [`CLAUDE.md`](../CLAUDE.md), `CODE_MAP.md` is **not** created until the first feature lands.

## Conventions

- All docs are markdown, ≤ 400 lines each. If a doc grows past that, split or compress — don't let prose dilute signal.
- Cross-references use relative paths (`./FOO.md`), not absolute URLs.
- "MUST / SHOULD / MAY" carry RFC 2119 meaning where they appear.
- Korean is acceptable in product copy examples; reasoning and headings stay in English so future contributors can grep.
