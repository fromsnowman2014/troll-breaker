import { useState } from "react";
import type { ShieldResult, SwordResult } from "../lib/schemas/results.js";
import type { ReplyResult, ReplyMode } from "../lib/schemas/reply.js";
import type { AppError } from "../lib/schemas/errors.js";

type AppErrorObj = { code: AppError["code"]; message: string };

const VERDICT_STYLE: Record<string, string> = {
  true: "bg-green-100 text-green-800",
  false: "bg-red-100 text-red-800",
  partial: "bg-yellow-100 text-yellow-800",
  unverified: "bg-gray-100 text-gray-600",
};

const VERDICT_LABEL: Record<string, string> = {
  true: "사실",
  false: "거짓",
  partial: "부분 사실",
  unverified: "미확인",
};

const REPLY_MODES: { mode: ReplyMode; label: string }[] = [
  { mode: "attack", label: "⚔️ 공격" },
  { mode: "defend", label: "🛡 방어" },
  { mode: "agree", label: "👍 동조" },
  { mode: "mock", label: "😏 비꼬기" },
  { mode: "humor", label: "😂 유머" },
];

function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unverified}`}
    >
      {VERDICT_LABEL[verdict] ?? verdict}
    </span>
  );
}

type Tab = "interpret" | "fact" | "reply";

export function ResultCard({
  result,
  replyResult,
  replyLoading,
}: {
  result: ShieldResult;
  replyResult: ReplyResult | null;
  replyLoading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("interpret");

  const hasInterpret = !!result.interpretation;

  // Auto-select fact tab if no interpretation available
  const activeTab = !hasInterpret && tab === "interpret" ? "fact" : tab;

  function requestReply(mode: ReplyMode) {
    chrome.runtime.sendMessage({
      kind: "reply/request",
      request_id: `reply-${Date.now()}`,
      original_text: result.claim_excerpt,
      fact_summary: result.fact.summary,
      sources: result.fact.sources,
      reply_mode: mode,
      page_url: "",
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header strip */}
      <div className="px-4 pt-3 pb-0 flex items-center gap-2 flex-wrap border-b border-gray-100">
        <VerdictBadge verdict={result.fact.verdict} />
        <span className="text-xs text-gray-400 ml-auto">{result.vibe_used.display_name}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {hasInterpret && (
          <TabButton active={activeTab === "interpret"} onClick={() => setTab("interpret")}>
            해석
          </TabButton>
        )}
        <TabButton active={activeTab === "fact"} onClick={() => setTab("fact")}>
          팩트체크
        </TabButton>
        <TabButton active={activeTab === "reply"} onClick={() => setTab("reply")}>
          댓글 작성
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "interpret" && result.interpretation && (
          <InterpretTab interpretation={result.interpretation} />
        )}
        {activeTab === "fact" && <FactTab result={result} />}
        {activeTab === "reply" && (
          <ReplyTab
            onRequest={requestReply}
            replyResult={replyResult}
            replyLoading={replyLoading}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function InterpretTab({ interpretation }: { interpretation: NonNullable<ShieldResult["interpretation"]> }) {
  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
        {interpretation.plain_text}
      </p>

      {interpretation.glossary.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">용어 해설</p>
          <div className="flex flex-wrap gap-2">
            {interpretation.glossary.map((entry, i) => (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs">
                <span className="text-amber-600 font-medium">{entry.original}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-gray-700">{entry.normalized}</span>
                {entry.note && (
                  <span className="block text-gray-400 text-xs mt-0.5">{entry.note}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactTab({ result }: { result: ShieldResult }) {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <VerdictBadge verdict={result.fact.verdict} />
        <span className="text-xs text-gray-400">
          신뢰도 {Math.round(result.fact.confidence * 100)}%
        </span>
      </div>

      <blockquote className="border-l-2 border-gray-300 pl-3 text-xs text-gray-500 italic line-clamp-2">
        {result.claim_excerpt}
      </blockquote>

      <p className="text-sm text-gray-800 leading-relaxed">{result.fact.summary}</p>

      {result.fact.sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">출처 ({result.fact.sources.length})</p>
          <ul className="space-y-2">
            {result.fact.sources.slice(0, 5).map((s, i) => (
              <li key={i} className="text-xs bg-gray-50 border border-gray-200 rounded p-2 space-y-1">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline block font-medium"
                >
                  {s.title || new URL(s.url).hostname}
                </a>
                {s.publisher && (
                  <span className="text-gray-400">{s.publisher}</span>
                )}
                {s.snippet && (
                  <p className="text-gray-500 line-clamp-2">{s.snippet}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {showSummary ? "▲ 커뮤니티 해설 접기" : "▼ 커뮤니티 스타일 해설 보기"}
        </button>
        {showSummary && (
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            {result.vibe_adjusted_summary}
          </p>
        )}
      </div>
    </div>
  );
}

function ReplyTab({
  onRequest,
  replyResult,
  replyLoading,
}: {
  onRequest: (mode: ReplyMode) => void;
  replyResult: ReplyResult | null;
  replyLoading: boolean;
}) {
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(() => undefined);
    chrome.runtime.sendMessage({ kind: "insert_back", text });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {REPLY_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onRequest(mode)}
            disabled={replyLoading}
            className="py-2 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {replyLoading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          <span>댓글 작성 중…</span>
        </div>
      )}

      {replyResult && !replyLoading && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">
            생성된 댓글 ({REPLY_MODES.find((m) => m.mode === replyResult.reply_mode)?.label})
          </p>
          <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed bg-gray-50 border border-gray-200 rounded p-3">
            {replyResult.post}
          </p>
          {replyResult.cited_urls.length > 0 && (
            <ul className="space-y-0.5">
              {replyResult.cited_urls.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => handleCopy(replyResult.post)}
            className="w-full py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            복사
          </button>
        </div>
      )}

      {!replyResult && !replyLoading && (
        <p className="text-xs text-gray-400">위 버튼을 눌러 댓글을 생성하세요.</p>
      )}
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="p-4 flex items-center gap-3 text-gray-500">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      <span className="text-sm">분석 중…</span>
    </div>
  );
}

export function ErrorCard({ error }: { error: AppErrorObj }) {
  return (
    <div className="p-4 space-y-1">
      <p className="text-sm text-red-600 font-medium">오류 발생</p>
      <p className="text-xs text-gray-500">{error.message}</p>
      <p className="text-xs text-gray-400">[{error.code}]</p>
    </div>
  );
}

const AXIS_LABEL: Record<string, string> = {
  cynicism: "냉소",
  fact: "사실성",
  punchline: "펀치라인",
  vibe: "분위기",
};

export function SwordCard({ result }: { result: SwordResult }) {
  const { axes, line_critique, final_post } = result.score;

  function handleCopy() {
    navigator.clipboard.writeText(final_post).catch(() => undefined);
    chrome.runtime.sendMessage({ kind: "insert_back", text: final_post });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">{result.pipeline} pipeline</span>
        <span className="text-xs text-gray-400 ml-auto">{result.vibe_used.display_name}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(axes) as [string, { value: number; rationale: string }][]).map(
          ([key, axis]) => (
            <div key={key} className="bg-gray-50 border border-gray-200 rounded p-2 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{AXIS_LABEL[key] ?? key}</span>
                <span className="text-xs font-semibold text-blue-600">{axis.value}/10</span>
              </div>
              <p className="text-xs text-gray-400 line-clamp-2">{axis.rationale}</p>
            </div>
          ),
        )}
      </div>

      {line_critique.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">라인 피드백</p>
          <ul className="space-y-1">
            {line_critique.map((note, i) => (
              <li key={i} className="text-xs">
                <span className="text-gray-700 italic">"{note.span}"</span>
                <span className="text-gray-400"> — {note.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium">완성된 글</p>
        <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed bg-gray-50 border border-gray-200 rounded p-3">
          {final_post}
        </p>
        <button
          onClick={handleCopy}
          className="w-full py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          복사
        </button>
      </div>
    </div>
  );
}
