# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Source Code Map (`docs/CODE_MAP.md`) — Token Efficiency Protocol

**Purpose:** Maintain a single, authoritative map of the codebase (files, exports, functions, key types, and their relationships) so that Claude can locate and reason about code without re-scanning the entire repo every session. This directly reduces token consumption and speeds up implementation.

### When the map exists

**Always read `docs/CODE_MAP.md` FIRST** before any non-trivial code task (implementation, refactor, bugfix, feature add). Treat it as the index — use it to decide which specific files to `Read`, instead of doing broad `grep`/`find`/Explore sweeps.

- If the map already answers the question (e.g., "which file owns the Style/Vibe agent?"), do not run additional searches.
- Only fall back to broad search when the map is silent or stale.

### When to create the map

Create `docs/CODE_MAP.md` the first time real source code lands in this repo (i.e., when the first feature is implemented, not for the empty scaffold). Do not create it speculatively while the repo only contains the PRD.

### When to update the map (MANDATORY)

Update `docs/CODE_MAP.md` **in the same change** that:

- Adds, renames, moves, or deletes a file/module.
- Adds, renames, or removes an exported function, class, or type.
- Changes a function's signature, responsibility, or its primary callers/callees.
- Introduces a new agent, tool surface (MCP-style), or cross-module contract.
- Changes data flow between Shield/Sword modes, agents, or the extension boundary.

A change that touches code structure but skips the map update is **incomplete**. Treat the map like a test that must stay green.

Trivial changes that do **not** require a map update: in-function logic edits, comment/string tweaks, dependency version bumps, formatting.

### Required structure of `docs/CODE_MAP.md`

Keep it terse — one line per item where possible. Prefer signal density over prose.

```markdown
# Code Map

> Last updated: YYYY-MM-DD (commit <short-sha>)
> Update protocol: see CLAUDE.md → "Source Code Map".

## Module tree
- `src/background/` — extension service worker; routes context-menu + floating-button events
  - `router.ts` — `handleContextMenu(info, tab)`, `handleStrikeRequest(payload)`
- `src/agents/`
  - `fact.ts` — `verifyFactWithLinks(claim, url) → FactResult`
  - `logic.ts` — `detectFallacies(text) → Fallacy[]`
  - `vibe.ts` — `getSiteVibe(url) → VibeProfile`; `rewriteInVibe(draft, vibe)`
- ...

## Key types
- `FactResult { summary: string; sources: {title; url}[]; confidence: 0..1 }`
- `VibeProfile { siteId; fewShotPosts: string[]; lexicon: string[] }`
- ...

## Cross-module contracts
- Shield flow: `background/router → agents/fact → agents/logic → agents/vibe → UI`
- Sword flow: `content-script (floating btn) → background/router → agents/vibe (rubric eval) → UI`
- MCP-style tools exposed to model: `get_site_vibe`, `verify_fact_with_links` (see `src/agents/tools.ts`)

## Known gaps / TODO
- (list stale or unmapped areas explicitly so they're not silently forgotten)
```

### Rules for the map itself

- **One file, one source of truth.** Do not fragment into per-module maps.
- **Index, not documentation.** No long explanations — link or point to the file. Detailed docs belong in the code or in `docs/`.
- **No duplication of code.** Signatures and one-line responsibility only; never paste function bodies.
- **Stale entries are bugs.** If you notice drift while working, fix the map in the same commit, or add it to "Known gaps" if out of scope.
- **Token budget:** target < 300 lines. If it grows past that, compress (drop trivial helpers, group siblings) — don't split the file.

### Workflow checklist (every code-changing task)

1. **Read** `docs/CODE_MAP.md` (if it exists) → identify target files.
2. **Read** only those target files (not the whole tree).
3. **Implement** the change.
4. **Update** `docs/CODE_MAP.md` if structure/signatures/contracts changed.
5. **Verify** the map's "Last updated" line and any affected sections reflect reality.
