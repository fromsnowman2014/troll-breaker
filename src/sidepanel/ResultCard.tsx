import type { ShieldResult } from "../lib/schemas/results.js";
import type { AppError } from "../lib/schemas/errors.js";

type AppErrorObj = { code: AppError["code"]; message: string };

const VERDICT_STYLE: Record<string, string> = {
  true: "bg-green-700 text-green-100",
  false: "bg-red-700 text-red-100",
  partial: "bg-yellow-700 text-yellow-100",
  unverified: "bg-slate-600 text-slate-200",
};

const VERDICT_LABEL: Record<string, string> = {
  true: "사실",
  false: "거짓",
  partial: "부분 사실",
  unverified: "미확인",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unverified}`}>
      {VERDICT_LABEL[verdict] ?? verdict}
    </span>
  );
}

export function ResultCard({ result }: { result: ShieldResult }) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <VerdictBadge verdict={result.fact.verdict} />
        <span className="text-xs text-slate-400">{result.pipeline} pipeline</span>
        <span className="text-xs text-slate-500 ml-auto">{result.vibe_used.display_name}</span>
      </div>

      <blockquote className="border-l-2 border-slate-600 pl-3 text-sm text-slate-300 italic line-clamp-2">
        {result.claim_excerpt}
      </blockquote>

      <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">
        {result.vibe_adjusted_summary}
      </p>

      {result.fact.sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium">출처</p>
          <ul className="space-y-1">
            {result.fact.sources.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline truncate block"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="p-4 flex items-center gap-3 text-slate-400">
      <div className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
      <span className="text-sm">분석 중…</span>
    </div>
  );
}

export function ErrorCard({ error }: { error: AppErrorObj }) {
  return (
    <div className="p-4 space-y-1">
      <p className="text-sm text-red-400 font-medium">오류 발생</p>
      <p className="text-xs text-slate-400">{error.message}</p>
      <p className="text-xs text-slate-600">[{error.code}]</p>
    </div>
  );
}
