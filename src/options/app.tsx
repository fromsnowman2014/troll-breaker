import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <h1 className="text-lg font-bold text-slate-100">Troll Breaker 설정</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">정보</h2>
        <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-400 space-y-1">
          <p>텍스트 생성은 운영자 서버(Vercel proxy)를 통해 이루어집니다.</p>
          <p>API 키를 입력하거나 저장할 필요가 없습니다.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">버전</h2>
        <p className="text-sm text-slate-500">v0.1.0</p>
      </section>
    </div>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
