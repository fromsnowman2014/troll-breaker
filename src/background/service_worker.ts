import { TheGridLlm } from "../lib/llm/thegrid.js";
import { ProxySearch } from "../lib/search/proxy.js";
import { ProxyFetcher } from "../lib/fetch/proxy.js";
import { ChromeKvStore } from "../lib/storage/chrome.js";
import { makeSeedLoader } from "../lib/seeds/index.js";
import { extensionRawLoader } from "../lib/seeds/extension.js";
import { runShield, runSword, runReply } from "./orchestrator.js";
import type { OrchestratorDeps } from "./orchestrator.js";
import type { ShieldResult, SwordResult } from "../lib/schemas/results.js";
import type { ReplyResult, ReplyMode } from "../lib/schemas/reply.js";

const PROXY_URL = "https://troll-breaker.vercel.app/api/chat";
const SEARCH_PROXY_URL = "https://troll-breaker.vercel.app/api/search";
const FETCH_PROXY_URL = "https://troll-breaker.vercel.app/api/fetch";

function buildDeps(): OrchestratorDeps {
  return {
    llm: new TheGridLlm({ proxyUrl: PROXY_URL }),
    search: new ProxySearch({ proxyUrl: SEARCH_PROXY_URL }),
    fetcher: new ProxyFetcher(FETCH_PROXY_URL),
    storage: new ChromeKvStore(),
    loadSeed: makeSeedLoader(extensionRawLoader()),
  };
}

// Pending result waiting for side panel to signal ready.
type PendingResult =
  | { kind: "shield/result"; request_id: string; payload: ShieldResult }
  | { kind: "shield/error"; request_id: string; error: { code: string; message: string } }
  | { kind: "sword/result"; request_id: string; payload: SwordResult }
  | { kind: "sword/error"; request_id: string; error: { code: string; message: string } }
  | { kind: "reply/result"; request_id: string; payload: ReplyResult }
  | { kind: "reply/error"; request_id: string; error: { code: string; message: string } };

const pendingByTab = new Map<number, PendingResult>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "truth-check",
    title: "Truth Check",
    contexts: ["selection"],
  });
});

// Side panel sends this when its React root is mounted and listening.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.kind !== "sidepanel/ready") return;
  const tabId: number | undefined = msg.tabId;
  if (tabId === undefined) return;
  const pending = pendingByTab.get(tabId);
  if (pending) {
    pendingByTab.delete(tabId);
    chrome.runtime.sendMessage(pending);
  }
});

// Content script sends this when user clicks "✦ Strike" button.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.kind !== "sword/request") return;
  const draft: string = msg.draft ?? "";
  const pageUrl: string = msg.page_url ?? "";
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const requestId = `sword-${Date.now()}`;

  chrome.sidePanel.open({ tabId }).then(() => {
    chrome.runtime.sendMessage({ kind: "sword/loading", request_id: requestId });
  });

  const deps = buildDeps();
  runSword(deps, { request_id: requestId, draft, page_url: pageUrl })
    .then((result) => {
      const out: PendingResult = { kind: "sword/result", request_id: requestId, payload: result };
      chrome.runtime.sendMessage(out).catch(() => {
        pendingByTab.set(tabId, out);
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      const out: PendingResult = {
        kind: "sword/error",
        request_id: requestId,
        error: { code: "unknown", message },
      };
      chrome.runtime.sendMessage(out).catch(() => {
        pendingByTab.set(tabId, out);
      });
    });
});

// Side panel sends this when user clicks a reply mode button.
chrome.runtime.onMessage.addListener((msg, _sender) => {
  if (msg?.kind !== "reply/request") return;
  const requestId: string = msg.request_id ?? `reply-${Date.now()}`;
  const deps = buildDeps();
  runReply(deps, {
    request_id: requestId,
    original_text: msg.original_text ?? "",
    fact_summary: msg.fact_summary,
    sources: msg.sources,
    reply_mode: (msg.reply_mode ?? "mock") as ReplyMode,
    page_url: msg.page_url ?? "",
  })
    .then((result) => {
      chrome.runtime.sendMessage({ kind: "reply/result", request_id: requestId, payload: result });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      chrome.runtime.sendMessage({
        kind: "reply/error",
        request_id: requestId,
        error: { code: "unknown", message },
      });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "truth-check") return;
  if (!tab?.id || !info.selectionText) return;

  const tabId = tab.id;
  const requestId = `shield-${Date.now()}`;

  // Open side panel first, then send loading state.
  chrome.sidePanel.open({ tabId }).then(() => {
    chrome.runtime.sendMessage({ kind: "shield/loading", request_id: requestId });
  });

  const deps = buildDeps();
  runShield(deps, {
    request_id: requestId,
    selected_text: info.selectionText,
    page_url: tab.url ?? "",
  })
    .then((result) => {
      const msg: PendingResult = { kind: "shield/result", request_id: requestId, payload: result };
      // Try sending directly; if it fails (panel not yet listening), store for when ready.
      chrome.runtime.sendMessage(msg).catch(() => {
        pendingByTab.set(tabId, msg);
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      const msg: PendingResult = {
        kind: "shield/error",
        request_id: requestId,
        error: { code: "unknown", message },
      };
      chrome.runtime.sendMessage(msg).catch(() => {
        pendingByTab.set(tabId, msg);
      });
    });
});
