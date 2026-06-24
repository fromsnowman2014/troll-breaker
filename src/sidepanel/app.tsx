import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { ResultCard, LoadingCard, ErrorCard } from "./ResultCard.js";
import type { ShieldResult } from "../lib/schemas/results.js";
import type { AppError } from "../lib/schemas/errors.js";
import "./index.css";

type AppErrorObj = { code: AppError["code"]; message: string };

type PanelState =
  | { phase: "idle" }
  | { phase: "loading"; request_id: string }
  | { phase: "shield"; result: ShieldResult }
  | { phase: "error"; error: AppErrorObj };

type PanelStore = {
  state: PanelState;
  set: (s: PanelState) => void;
};

const usePanel = create<PanelStore>((set) => ({
  state: { phase: "idle" },
  set: (s) => set({ state: s }),
}));

type ChromeMessage =
  | { kind: "shield/loading"; request_id: string }
  | { kind: "shield/result"; request_id: string; payload: ShieldResult }
  | { kind: "shield/error"; request_id: string; error: AppErrorObj };

function useChromeMessages() {
  const setPanel = usePanel((s) => s.set);
  useEffect(() => {
    const listener = (msg: ChromeMessage) => {
      if (msg.kind === "shield/loading") {
        setPanel({ phase: "loading", request_id: msg.request_id });
      } else if (msg.kind === "shield/result") {
        setPanel({ phase: "shield", result: msg.payload });
      } else if (msg.kind === "shield/error") {
        setPanel({ phase: "error", error: msg.error });
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Tell the service worker we're ready to receive messages.
    // Also triggers delivery of any result that completed before we mounted.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId !== undefined) {
        chrome.runtime.sendMessage({ kind: "sidepanel/ready", tabId });
      }
    });

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setPanel]);
}

function App() {
  useChromeMessages();
  const state = usePanel((s) => s.state);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <span className="font-bold text-sm tracking-wide text-blue-400">Troll Breaker</span>
        {state.phase !== "idle" && (
          <span className="text-xs text-slate-500 ml-auto">Truth Check</span>
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
        {state.phase === "shield" && <ResultCard result={state.result} />}
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
