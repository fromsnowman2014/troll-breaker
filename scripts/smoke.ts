/**
 * End-to-end smoke test for the orchestrator.
 *
 * Usage:
 *   1. (optional) cp .env.example .env and set BRAVE_API_KEY / PROXY_URL
 *   2. npm run smoke
 *
 * Hits the deployed Vercel proxy at troll-breaker-browser.vercel.app/api/chat
 * (which holds THEGRID_API_KEY server-side). Costs real tokens against the
 * project owner's THEGRID account. Intended for dogfood, not CI.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TheGridLlm } from "../src/lib/llm/thegrid.js";
import type { LlmClient } from "../src/lib/llm/types.js";
import { MockSearch } from "../src/lib/search/mock.js";
import { BraveSearch } from "../src/lib/search/brave.js";
import type { SearchClient } from "../src/lib/search/types.js";
import { InMemoryKv } from "../src/lib/storage/memory.js";
import { makeSeedLoader, nodeFsRawLoader, isSkeleton } from "../src/lib/seeds/index.js";
import { runShield, runSword } from "../src/background/orchestrator.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SEEDS_DIR = resolve(REPO_ROOT, "extension/seeds");
const DEFAULT_PROXY_URL = "https://troll-breaker-browser.vercel.app/api/chat";

function buildLlm(): LlmClient {
  const proxyUrl = process.env.PROXY_URL || DEFAULT_PROXY_URL;
  console.log(`[smoke] Using TheGrid proxy: ${proxyUrl}`);
  return new TheGridLlm({ proxyUrl });
}

function buildSearch(): SearchClient {
  const key = process.env.BRAVE_API_KEY ?? "";
  if (!key) {
    console.warn(
      "[smoke] BRAVE_API_KEY not set — using MockSearch (canned Wikipedia fixture).",
    );
    return new MockSearch([
      {
        title: "Wikipedia — Example",
        url: "https://en.wikipedia.org/wiki/Example",
        snippet: "Example is widely used as a placeholder term.",
      },
    ]);
  }
  console.log("[smoke] Using BraveSearch.");
  return new BraveSearch({ apiKey: key });
}

async function main() {
  const llm = buildLlm();
  const search = buildSearch();
  const storage = new InMemoryKv();
  const loadSeed = makeSeedLoader(nodeFsRawLoader(SEEDS_DIR));

  const deps = { llm, search, storage, loadSeed };

  const seed = await loadSeed("fmkorea.com");
  if (seed && isSkeleton(seed)) {
    console.warn(
      "[smoke] WARNING: fmkorea.com seed is still a skeleton (__TODO__ markers present).",
    );
    console.warn("[smoke]          See USER_ACTION_ITEMS.md §2 and VIBE_EXTRACTION.md §3.\n");
  }

  console.log("[smoke] Running Shield…");
  const shield = await runShield(deps, {
    request_id: "smoke-shield-1",
    selected_text: "이 사이트는 한국에서 가장 큰 커뮤니티이다.",
    page_url: "https://www.fmkorea.com/best",
  });

  console.log("\n=== ShieldResult ===");
  console.log(JSON.stringify(shield, null, 2));

  console.log("\n[smoke] Running Sword…");
  const sword = await runSword(deps, {
    request_id: "smoke-sword-1",
    draft: "솔직히 이 주장 좀 웃기지 않냐? 데이터도 없고 그냥 감정이잖아.",
    page_url: "https://www.fmkorea.com/best",
  });

  console.log("\n=== SwordResult ===");
  console.log(JSON.stringify(sword, null, 2));

  console.log("\n[smoke] OK.");
}

main().catch((e) => {
  console.error("\n[smoke] FAILED:", e);
  process.exit(1);
});
