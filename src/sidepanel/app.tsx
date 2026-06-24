import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { ResultCard, SwordCard, LoadingCard, ErrorCard } from "./ResultCard.js";
import type { ShieldResult, SwordResult } from "../lib/schemas/results.js";
import type { ReplyResult } from "../lib/schemas/reply.js";
import type { AppError } from "../lib/schemas/errors.js";
import "./index.css";

type AppErrorObj = { code: AppError["code"]; message: string };

type PanelState =
  | { phase: "idle" }
  | { phase: "loading"; request_id: string }
  | { phase: "shield" }
  | { phase: "sword"; result: SwordResult }
  | { phase: "error"; error: AppErrorObj };

type PanelStore = {
  state: PanelState;
  shieldResult: ShieldResult | null;
  replyResult: ReplyResult | null;
  replyLoading: boolean;
  set: (s: PanelState) => void;
  setShield: (r: ShieldResult) => void;
  setReply: (r: ReplyResult | null) => void;
  setReplyLoading: (v: boolean) => void;
};

const usePanel = create<PanelStore>((set) => ({
  state: { phase: "idle" },
  shieldResult: null,
  replyResult: null,
  replyLoading: false,
  set: (s) => set({ state: s }),
  setShield: (r) => set({ shieldResult: r }),
  setReply: (r) => set({ replyResult: r }),
  setReplyLoading: (v) => set({ replyLoading: v }),
}));

type ChromeMessage =
  | { kind: "shield/loading"; request_id: string }
  | { kind: "shield/result"; request_id: string; payload: ShieldResult }
  | { kind: "shield/error"; request_id: string; error: AppErrorObj }
  | { kind: "sword/loading"; request_id: string }
  | { kind: "sword/result"; request_id: string; payload: SwordResult }
  | { kind: "sword/error"; request_id: string; error: AppErrorObj }
  | { kind: "reply/loading"; request_id: string }
  | { kind: "reply/result"; request_id: string; payload: ReplyResult }
  | { kind: "reply/error"; request_id: string; error: AppErrorObj };

function useChromeMessages() {
  const store = usePanel();

  useEffect(() => {
    const listener = (msg: ChromeMessage) => {
      switch (msg.kind) {
        case "shield/loading":
          store.set({ phase: "loading", request_id: msg.request_id });
          store.setShield(null as unknown as ShieldResult);
          store.setReply(null);
          store.setReplyLoading(false);
          break;
        case "sword/loading":
          store.set({ phase: "loading", request_id: msg.request_id });
          break;
        case "shield/result":
          store.setShield(msg.payload);
          store.setReply(null);
          store.set({ phase: "shield" });
          break;
        case "shield/error":
        case "sword/error":
        case "reply/error":
          store.set({ phase: "error", error: msg.error });
          store.setReplyLoading(false);
          break;
        case "sword/result":
          store.set({ phase: "sword", result: msg.payload });
          break;
        case "reply/loading":
          store.setReplyLoading(true);
          store.setReply(null);
          break;
        case "reply/result":
          store.setReplyLoading(false);
          store.setReply(msg.payload);
          break;
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId !== undefined) {
        chrome.runtime.sendMessage({ kind: "sidepanel/ready", tabId });
      }
    });

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [store]);
}

function App() {
  useChromeMessages();
  const { state, shieldResult, replyResult, replyLoading } = usePanel();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <span className="font-bold text-sm tracking-wide text-blue-400">Troll Breaker</span>
        {state.phase === "sword" && (
          <span className="text-xs text-slate-500 ml-auto">✦ Strike</span>
        )}
      </header>

      <main>
        {state.phase === "idle" && (
          <div className="p-6 text-center text-slate-500 text-sm space-y-2">
            <p>텍스트를 선택하고 우클릭 →</p>
            <p className="font-medium text-slate-400">"Truth Check"</p>
          </div>
        )}
        {state.phase === "loading" && <LoadingCard />}
        {state.phase === "shield" && shieldResult && (
          <ResultCard
            result={shieldResult}
            replyResult={replyResult}
            replyLoading={replyLoading}
          />
        )}
        {state.phase === "sword" && <SwordCard result={state.result} />}
        {state.phase === "error" && <ErrorCard error={state.error} />}
      </main>
    </div>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
