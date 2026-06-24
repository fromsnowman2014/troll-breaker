import { TheGridLlm } from "../lib/llm/thegrid.js";
import { MockSearch } from "../lib/search/mock.js";
import { ChromeKvStore } from "../lib/storage/chrome.js";
import { makeSeedLoader } from "../lib/seeds/index.js";
import { extensionRawLoader } from "../lib/seeds/extension.js";
import { runShield } from "./orchestrator.js";
import type { OrchestratorDeps } from "./orchestrator.js";
import type { ShieldResult } from "../lib/schemas/results.js";

const PROXY_URL = "https://troll-breaker.vercel.app/api/chat";

function buildDeps(): OrchestratorDeps {
  return {
    llm: new TheGridLlm({ proxyUrl: PROXY_URL }),
    search: new MockSearch([]),
    storage: new ChromeKvStore(),
    loadSeed: makeSeedLoader(extensionRawLoader()),
  };
}

// Pending result waiting for side panel to signal ready.
type PendingResult =
  | { kind: "shield/result"; request_id: string; payload: ShieldResult }
  | { kind: "shield/error"; request_id: string; error: { code: string; message: string } };

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
