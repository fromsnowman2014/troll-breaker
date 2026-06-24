/**
 * End-to-end smoke test for the orchestrator.
 *
 * Usage:
 *   1. (optional) cp .env.example .env and set BRAVE_API_KEY / PROXY_URL
 *   2. npm run smoke
 *
 * Hits the deployed Vercel proxy at troll-breaker.vercel.app/api/chat
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
import { makeSeedLoader, isSkeleton } from "../src/lib/seeds/index.js";
import { nodeFsRawLoader } from "../src/lib/seeds/node.js";
import { ProxyFetcher } from "../src/lib/fetch/proxy.js";
import { runShield, runSword } from "../src/background/orchestrator.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SEEDS_DIR = resolve(REPO_ROOT, "extension/seeds");
const DEFAULT_PROXY_URL = "https://troll-breaker.vercel.app/api/chat";
const DEFAULT_FETCH_PROXY_URL = "https://troll-breaker.vercel.app/api/fetch";

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

  const fetcher = new ProxyFetcher(DEFAULT_FETCH_PROXY_URL);
  const deps = { llm, search, fetcher, storage, loadSeed };

  const seed = await loadSeed("fmkorea.com");
  if (seed && isSkeleton(seed)) {
    console.warn(
      "[smoke] WARNING: fmkorea.com seed is still a skeleton (__TODO__ markers present).",
    );
    console.warn("[smoke]          See USER_ACTION_ITEMS.md §2 and VIBE_EXTRACTION.md §3.\n");
  }

  // Real-world test case: fmkorea post with inline URLs (the problematic case).
  const REAL_CASE = `[펌] '박원순 사람'도 품었던 오세훈…이번엔 고위직 대폭 물갈이, 왜
https://www.fmkorea.com/9995776148
https://n.news.naver.com/mnews/article/025/0003532654?sid=102

하지만 6·3지방선거를 거치며 서울시 내부 분위기는 크게 달라졌다. 선거 과정에서 예상보다 많은 간부가 정원오 후보 캠프와 직간접적으로 연결된 것으로 드러나면서다. 특히 오 시장이 과거 탕평 인사 차원에서 중용했던 인사들이 정 후보 캠프 측에 일제히 합류해 충격이 작지 않았다는 후문이다.

여성시대 ㅋㅋㅋㅋ`;

  console.log("[smoke] Running Shield (real URL inline case)…");
  const shield = await runShield(deps, {
    request_id: "smoke-shield-1",
    selected_text: REAL_CASE,
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
