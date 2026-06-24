# 다음에 해야 할 일 (한국어 안내)

> **갱신:** 2026-06-24
>
> **코드 현황 (2026-06-24):** Phase 0(익스텐션 셸) + Phase 1(Shield MVP) + Phase 2(Sword 플로팅 버튼) + `/api/search` 프록시 + `/api/fetch` URL 콘텐츠 프록시까지 완료. 실제 동작 확인됨.

코드 측은 **에이전트 계층 + THEGRID 어댑터 + Vercel 프록시 + Brave Search + URL fetch 프록시 + 익스텐션 셸 + Shield/Sword MVP**까지 완료.

> 영문 / 상세 체크리스트: [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md)

---

## Phase 3: Truth Check UX 재설계 — 해석 + 팩트체크 + 댓글 모드

> **구현 전 계획 단계.** 아래는 코드 변경 계획이며, 실제 구현은 이 계획을 확정한 뒤 진행합니다.

### 배경 및 목표

현재 "Truth Check"는 우클릭 → 팩트체크 결과 하나를 사이드 패널에 표시한다.
사용자 요구사항은 세 가지 기능이 **하나의 플로우**에 통합되어야 한다:

1. **해석 (Interpret)** — 선택한 글을 정상 한국어로 풀어씀. 속어·줄임말·밈을 표준어로 번역.
2. **팩트체크 (Fact)** — 기존 Shield 기능. 주장/링크를 Brave Search + URL fetch로 검증하고 원본 기사 링크 제공.
3. **댓글 작성 (Reply)** — 버튼별 5가지 댓글 톤 선택 → vibe 적용된 댓글 생성.

---

### Phase 3-A: 해석 에이전트 (Interpret)

#### 무엇을 만드나

`src/agents/interpret.ts` — 새 에이전트 함수

```
interpretText(deps, { text, vibe }) → InterpretResult
```

**InterpretResult 스키마 (새 파일 `src/lib/schemas/interpret.ts`)**
```ts
{
  plain_text: string;        // 속어·줄임말을 표준어로 치환한 전체 문장
  glossary: {                // 치환된 단어/구 목록 (UI에서 hover tooltip 등에 사용)
    original: string;
    normalized: string;
    note?: string;
  }[];
}
```

#### 프롬프트 설계

- system: "당신은 한국 인터넷 커뮤니티 용어 전문가입니다. 주어진 글의 속어·줄임말·밈을 표준 한국어로 해석하세요. 의미를 바꾸지 말고, 독자가 이해할 수 있게만 바꾸세요."
- user: `text: <선택 텍스트>\nvibe_site: <site_id>`
- tool: `emit_result` with `InterpretResultSchema`

#### 오케스트레이터 변경

`runShield` 호출 시 `interpretText`를 `verifyFactWithLinks`, `detectFallacies`와 **병렬**로 실행.
결과를 `ShieldResult`에 `interpretation?: InterpretResult` 필드로 추가.

**ShieldResult 스키마 변경 (`src/lib/schemas/results.ts`)**
```ts
ShieldResultSchema 에 .extend({ interpretation: InterpretResultSchema.optional() })
```

---

### Phase 3-B: 팩트체크 결과 UI 개선

#### 현재 문제

- `vibe_adjusted_summary`가 사이드 패널 전체를 채우는 긴 텍스트 하나 → 가독성 낮음
- 출처 링크가 3개 이하로 잘리며 제목만 표시됨 → 사용자가 원본 기사를 못 찾음
- 해석 결과를 표시할 자리가 없음

#### UI 변경 계획 (`src/sidepanel/ResultCard.tsx`)

ShieldResult 카드를 **탭 구조**로 재설계:

```
[ 해석 | 팩트체크 | 댓글 ]   ← 탭 헤더
```

**해석 탭 (기본 탭)**
- `interpretation.plain_text` 전체 표시 (스크롤 가능)
- `interpretation.glossary` 항목을 태그 형태로 아래에 나열 (원어 → 표준어)

**팩트체크 탭**
- 판정 배지 (`verdict`) + 신뢰도 (confidence %)
- `fact.summary` 요약
- 출처 목록: 제목 + 도메인 + 클릭 가능한 URL — 최대 5개, 스니펫 토글 가능
- `vibe_adjusted_summary`는 접을 수 있는 "커뮤니티 스타일 해설" 섹션으로 이동

**댓글 탭**
- 5개 댓글 모드 버튼 (아래 Phase 3-C 참고)
- 버튼 클릭 → 로딩 → 생성된 댓글 표시 + 복사 버튼

---

### Phase 3-C: 댓글 생성 에이전트 (Reply)

#### 5가지 댓글 모드

| 버튼 레이블 | `reply_mode` 값 | 설명 |
|---|---|---|
| ⚔️ 공격 | `attack` | 상대 주장을 정면 반박. 팩트 근거 활용. |
| 🛡 방어 | `defend` | 원글 주장을 옹호. 반론 차단 논리 구성. |
| 👍 동조 | `agree` | 원글에 공감 표현. 추가 근거 덧붙이기. |
| 😏 비꼬기 | `mock` | 냉소적 비꼬기. vibe 풀 활용. 감정 배제. |
| 😂 유머 | `humor` | 맥락 있는 유머 댓글. 커뮤니티 밈 스타일. |

#### 새 에이전트

`src/agents/reply.ts` — `generateReply(deps, input) → ReplyResult`

**ReplyInput**
```ts
{
  original_text: string;    // 선택한 원본 글
  fact_summary?: string;    // 팩트체크 요약 (있으면 근거로 활용)
  sources?: Source[];       // 팩트체크 출처 (공격/방어 모드에서 링크 인용)
  reply_mode: "attack" | "defend" | "agree" | "mock" | "humor";
  vibe: VibeProfile;
}
```

**ReplyResult 스키마 (`src/lib/schemas/reply.ts`)**
```ts
{
  reply_mode: string;
  post: string;             // 생성된 댓글 (vibe 적용)
  cited_urls: string[];     // 댓글 내 인용된 URL 목록
}
```

**프롬프트 전략 (모드별)**
- `attack`: "다음 팩트와 출처를 근거로 원글 주장을 반박하는 댓글을 써라. 감정 없이 팩트로."
- `defend`: "원글의 주장을 지지하고 반론 여지를 차단하는 논리 댓글을 써라."
- `agree`: "원글에 공감하며 추가 관점이나 근거를 덧붙이는 댓글을 써라."
- `mock`: "원글을 냉소적으로 비꼬는 댓글. vibe 스타일 필수. 직접 욕 금지."
- `humor`: "원글의 맥락을 이해한 유머 댓글. 커뮤니티 밈 스타일."
- 모든 모드에 vibe 스타일 블록 주입 (evaluator와 동일한 `renderStyle(vibe)` 방식)

#### 서비스 워커 변경

`sword/reply` 메시지 타입 추가:
```ts
// content script → service worker
{ kind: "reply/request"; request_id: string; original_text: string; fact_context?: ...; reply_mode: ReplyMode; page_url: string }

// service worker → side panel
{ kind: "reply/loading"; request_id: string }
{ kind: "reply/result"; request_id: string; payload: ReplyResult }
{ kind: "reply/error"; request_id: string; error: ... }
```

사이드 패널에서 버튼 클릭 → `chrome.runtime.sendMessage({ kind: "reply/request", ... })` 전송.
서비스 워커가 `generateReply` 호출 후 결과 반환.

---

### Phase 3-D: 전체 플로우 변경 요약

```
우클릭 → "Truth Check"
         ↓
  서비스 워커: runShield (기존)
   + interpretText (신규, 병렬)
         ↓
  사이드 패널 오픈 → [ 해석 | 팩트체크 | 댓글 ] 탭
         ↓                    ↓                 ↓
   plain_text           verdict/sources    버튼 5개
   glossary             summary            (클릭 시 reply/request 전송)
                        vibe_summary       → generateReply 결과 표시
```

---

### Phase 3 구현 순서 (우선순위)

1. **3-A**: `interpret.ts` 에이전트 + `InterpretResult` 스키마 + `runShield` 병렬 추가
2. **3-B**: `ResultCard.tsx` 탭 UI 재설계 (해석·팩트체크 탭)
3. **3-C**: `reply.ts` 에이전트 + `ReplyResult` 스키마 + 댓글 탭 UI
4. **3-D**: 서비스 워커 `reply/request` 메시지 핸들러 추가

각 단계 완료 기준:
- 1: `npm test` 통과 + `npm run smoke`에서 `interpretation` 필드 확인
- 2: 빌드 후 사이드 패널에서 탭 전환 동작 확인
- 3: 댓글 탭 → 버튼 클릭 → 생성된 댓글 표시 확인
- 4: 서비스 워커 → 사이드 패널 메시지 라운드트립 확인

---

### 주요 파일 변경 목록 (Phase 3)

**새로 만들 파일:**
- `src/lib/schemas/interpret.ts` — `InterpretResultSchema`, `InterpretResult`
- `src/lib/schemas/reply.ts` — `ReplyResultSchema`, `ReplyResult`, `ReplyMode`
- `src/agents/interpret.ts` — `interpretText(deps, input) → InterpretResult`
- `src/agents/reply.ts` — `generateReply(deps, input) → ReplyResult`

**수정할 파일:**
- `src/lib/schemas/results.ts` — `ShieldResult`에 `interpretation?` 추가
- `src/background/orchestrator.ts` — `runShield`에 `interpretText` 병렬 추가; `OrchestratorDeps` 확장
- `src/background/service_worker.ts` — `reply/request` 메시지 핸들러 추가
- `src/sidepanel/app.tsx` — `reply/loading|result|error` 메시지 처리 추가
- `src/sidepanel/ResultCard.tsx` — 탭 구조 재설계; `ReplyCard` 추가

**변경 없는 파일:**
- `src/agents/fact.ts`, `vibe.ts`, `evaluator.ts` — 재사용 그대로
- `api/chat.ts`, `api/search.ts`, `api/fetch.ts` — 재사용 그대로
- `extension/seeds/*.json` — 재사용 그대로

---

---

## 0. THEGRID + Vercel 프록시 확인 (가장 먼저, 5분)

**왜:** 모든 LLM 호출이 이 프록시 위에서 동작합니다. 여기 깨지면 전체가 멈춥니다.

### 0a. Vercel 환경 변수 확인

https://vercel.com/sein-ohs-projects/troll-breaker-browser → Settings → Environment Variables

- `THEGRID_API_KEY` 가 **Production / Preview / Development 세 환경 모두**에 있어야 함.
- 키 변경 시 신규 배포부터 적용 → 변경 후 redeploy 필요.

### 0b. 프록시 함수 살아있나?

`api/chat.ts`가 추가되었습니다. main에 push하면 Vercel이 자동 배포합니다.

```bash
curl -X POST https://troll-breaker.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":20}'
```

| 응답 | 의미 |
|---|---|
| 200 + `choices[0].message.content` | ✅ 정상 |
| 404 | `api/chat.ts`가 아직 배포 안 됨. git push 했는지, Vercel이 main을 보고 있는지 확인 |
| 500 `server_misconfigured` | `THEGRID_API_KEY` env var가 비어 있음. 0a 다시 확인 |
| 502 `upstream_unreachable` | THEGRID 측 장애 |
| 502 `upstream_error` | THEGRID에서 에러 반환 — 키 만료/취소나 잔액 부족 의심 |

---

## 1. (선택) `.env` 만들기 — dev smoke runner용만

**왜:** 로컬 smoke runner는 (a) Brave Search 키와 (b) 프록시 URL 오버라이드만 읽음. LLM 키는 더 이상 로컬에 둘 필요 없음.

```bash
cp .env.example .env
```

채워야 하는 값 (선택):
```
PROXY_URL=                  # 비워두면 https://troll-breaker.vercel.app/api/chat 사용
BRAVE_API_KEY=BSA...        # 비워두면 https://troll-breaker.vercel.app/api/xxxx 사용
```

**확인:**
```bash
npm run smoke
```
- 로그에 `[smoke] Using TheGrid proxy: ...` 가 떠야 함.
- `=== ShieldResult ===` JSON이 출력되고 `[smoke] OK.` 로 끝나면 성공.
- 0번 단계 (프록시 배포 확인)가 끝나지 않았다면 여기서 `llm_unreachable` 에러가 납니다.

---

## 2. 시드 코퍼스 4개 채우기 (사이트당 30~60분) — fmkorea는 완료

**왜:** 이게 제품 품질의 80%를 결정합니다. ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §3, §10)

**파일 위치:** `extension/seeds/<site_id>.json`
- ✅ `fmkorea.com.json` — 큐레이션 완료
- ❌ `dcinside.com.json`
- ❌ `theqoo.net.json`
- ❌ `ruliweb.com.json`
- ❌ `ilbe.com.json`

각 파일은 **스키마는 통과하지만 `__TODO__` 마커가 잔뜩 있는 빈 껍데기** 상태. 채우는 순서:

1. **30일 이내 베스트 글 2~5개** 제목/본문/상위 댓글 전사. (`few_shot_posts`)
   - 본문 1500자 이하로 자르기. 개인정보/슬러 수작업 제거.
2. **50단어 voice memo** 작성 — *어떻게* 비꼬는지를 *한 방향*으로 묘사. (`tonality.sarcasm_style`)
   - 좋은 예: `"건조하게 비꼬는, 감정 배제, 마지막에 한 방"`
   - 나쁜 예: `"sarcastic"` (방향 없음)
3. **시그니처 단어 15~30개** (`lexicon.high_signal_words`)
4. **금지어 5~10개** (`lexicon.forbidden_words`)
5. `cynicism_level` 0~10, `political_lean`, `paragraph_style` 등 메타 필드 채우기.
6. `last_refreshed`를 오늘 ISO 날짜로.
7. `display_name`에서 `(skeleton — ...)` 부분 제거.

**확인:**
```bash
npm test
grep -l __TODO__ extension/seeds/*.json    # 출력이 비어야 완료
```

---

## 3. DOM 셀렉터 스펙 5개 채우기 (사이트당 15~30분)

**왜:** 사용자가 그 커뮤니티 페이지를 *직접 보고 있을 때*, 콘텐츠 스크립트가 화면의 베스트 글을 자동으로 읽어 시드 캐시를 갱신함. ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §4)

**파일 위치:** `docs/site-extractors/<site_id>.md` (5개 모두 스켈레톤)

**방법:**
1. 사이트의 베스트 목록 페이지를 크롬에서 엽니다.
2. DevTools (F12) → Elements → 게시글 제목 위에서 우클릭 → Copy → Copy selector.
3. 콘솔에서 검증: `document.querySelectorAll("복사한_셀렉터").length` → 10 이상이면 합격.
4. 자동 생성 ID가 들어 있으면 안정성 낮음 → 클래스/태그로 일반화.
5. 본문 / 댓글 컨테이너 / 개별 댓글도 동일 절차.
6. "로그인 필요?" / "JS 렌더?" / "Cloudflare?" 메타 정보도 채우기.

**확인:**
```bash
grep -l __TODO__ docs/site-extractors/*.md   # _TEMPLATE.md 외엔 없어야 완료
```

---

## 4. 법무 / TOS 검토 (스토어 제출 전, 30분)

스토어 제출 전 본인이 직접 한 번 읽고, 각 항목에 대해 1문단으로 "왜 OK한지" 답할 수 있어야 함:

1. **THEGRID Usage Policy** — 운영자(우리)가 책임지는 모델. 냉소적 재작성 출력이 abuse 라인을 넘는지 확인.
2. **Brave Search TOS** — 현재 BraveSearch는 dev smoke runner 전용이라 영향 적음. 프로덕션 검색을 켤 때 다시 검토.
3. **대상 커뮤니티 TOS** — 우리는 *사용자가 이미 로드한 DOM만* 읽음. 프라이버시 정책에 명시.
4. **Chrome Web Store** — https://developer.chrome.com/docs/webstore/program-policies (Single Purpose + User Data).

---

## 5. 프라이버시 정책 안정 URL 게시 (스토어 제출 전, 20분)

**중요:** 이전 BYOK 시절 문구가 있다면 ⚠️ **반드시 갱신**.

**필수 포함 내용** ([`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §7):
1. 운영자가 작은 서버(Vercel proxy)를 운영하며 이 서버가 LLM API 키를 보유.
2. 사용자가 명시적으로 트리거할 때만 선택 텍스트 + 현재 URL이 우리 프록시 → THEGRID 순으로 전송.
3. 로컬 저장: 환경설정, vibe 캐시. **API 키 저장 없음** (이전 정책과 다름).
4. 분석/텔레메트리 없음. 요청은 사용자 신원과 연결되지 않음.
5. 로컬 데이터 삭제는 옵션 페이지 또는 확장 제거. 서버 측 함수 로그는 사용자 식별자가 없어 개별 삭제 불가.

---

## 6. 토큰 비용 모니터링 (출시 후 지속)

**왜:** BYOK가 아니므로 abuse나 사용량 폭증이 운영자 카드로 직격됩니다.

- **주 1회:** Vercel 함수 호출 수 점검 (Analytics 페이지).
- **주 1회:** THEGRID 사용량 점검 (https://app.thegrid.ai).
- **THEGRID 계정에 월간 spending cap 설정** — 한도 초과 시 동작 방식 미리 결정 (에러 vs 큐잉).
- **비정상 증가 발견 시:** `api/chat.ts`에 rate limiting 추가 (Vercel KV / Upstash). 현재 TODO 주석만 있음.

---

## 코드 측에서 완료된 작업 (참고)

- ✅ 익스텐션 셸 (Manifest V3, Vite+CRXJS, service worker, side panel, options page)
- ✅ Shield MVP — 우클릭 → Truth Check → 사실확인 + vibe 보정 결과 표시
- ✅ Sword MVP — ✦ Strike 플로팅 버튼 → 4축 점수 + 완성된 글 + 복사
- ✅ `/api/search` 프록시 — Brave Search가 서버사이드로 전환됨 (BRAVE_API_KEY Vercel env var 필요)
- ✅ `chrome.storage` 어댑터 (비밀 정보 보관 없음)

## 코드 측에서 다음으로 해야 할 작업 (참고)

- 콘텐츠 스크립트 DOM extractor — 3번 스펙(DOM 셀렉터) 완성 후 구현 가능
- Standard/Deep 파이프라인 UI 토글 (Phase 3+)
- Chat refinement (Phase 3)

---

## 빠른 진단: 지금 상태 점검

```bash
# 0. 프록시 살아있나?
curl -X POST https://troll-breaker.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":20}'

# 1. 코드 정상?
npm test                                       # 40개 모두 통과해야

# 2. 시드 진척도?
grep -l __TODO__ extension/seeds/*.json        # 출력이 비어야 완료

# 3. DOM 스펙 진척도?
grep -l __TODO__ docs/site-extractors/*.md     # _TEMPLATE.md 외엔 없어야 완료

# 4. 전체 파이프라인 (프록시 + Brave + 에이전트)
npm run smoke                                  # ShieldResult/SwordResult JSON 출력되면 OK
```

---

질문이 있으면 [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md) (한국어 상세 가이드) → [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) (서버 모델 보안 문서) → [`ARCHITECTURE.md`](./ARCHITECTURE.md) 순서로 참고하세요.
