# 사용자 액션 아이템 (User Action Items)

> **Last updated:** 2026-06-23
>
> 코드 측이 자동으로 못 하는 일들 — **운영자(사용자)가 직접** 처리해야 익스텐션이 실제로 출시·동작합니다. 우선순위 순으로 정렬.
>
> **중요 아키텍처 변경 (2026-06-23):** BYOK(Bring Your Own Key) 모델을 폐기하고, 단일 공유 키(`THEGRID_API_KEY`, Vercel 환경 변수에 저장) + 서버리스 프록시 모델로 전환했습니다. 유저는 더 이상 API 키를 입력하지 않으며, **토큰 비용은 운영자가 부담**합니다.

---

## 진행 상황 한눈에 보기 (2026-06-23 기준)

```
[x] Chrome Web Store 개발자 계정 ($5)        ← 발급 완료
[x] THEGRID API 키 발급 + Vercel 등록        ← 운영자가 완료
[ ] Vercel에 /api/chat 프록시 배포           ← git push 후 자동 배포 필요
[ ] 배포된 프록시 동작 확인                  ← curl/smoke runner로 검증
[x] Brave Search API 키 발급                 ← .env에 등록 + 코드 와이어링 완료 (dev only)
[x] fmkorea.com 시드 코퍼스                  ← 큐레이션 완료
[ ] dcinside.com 시드 코퍼스                 ← __TODO__ 마커 남음
[ ] theqoo.net  시드 코퍼스                  ← __TODO__ 마커 남음
[ ] ruliweb.com 시드 코퍼스                  ← __TODO__ 마커 남음
[ ] ilbe.com    시드 코퍼스                  ← __TODO__ 마커 남음
[ ] fmkorea.com DOM 셀렉터 스펙              ← __TODO__ 마커 남음
[ ] dcinside.com / theqoo / ruliweb / ilbe DOM 스펙
[ ] THEGRID + 커뮤니티 + CWS TOS 검토
[ ] 프라이버시 정책 안정 URL 게시 (서버 프록시 반영)
[ ] 기술 스파이크 3건 (TECH_STACK §10)
[ ] 아키텍처 의사결정 4건 (ARCHITECTURE §8)
[ ] 스토어 리스팅 자산 (아이콘/스크린샷/카피)
[ ] 이슈 트래커 URL 설정
[ ] 월간 시드 리프레시 캘린더 등록
[ ] 월간 토큰 비용 모니터링 (THEGRID + Vercel 대시보드)
```

> **지금 가장 큰 병목:** ① 프록시 배포 확인, ② 시드 4개 + DOM 셀렉터 5개. 시드/셀렉터가 채워지지 않으면 출력 품질이 generic 한국어 비꼬기로 떨어집니다.

---

## §0. THEGRID + Vercel 운영 가이드 (NEW — 가장 먼저 확인)

전체 텍스트 생성이 이 프록시 위에서 동작합니다. 여기 무너지면 익스텐션 전체가 멈춥니다.

### §0.1 Vercel 환경 변수 확인

- **어디서:** https://vercel.com/sein-ohs-projects/troll-breaker-browser → Settings → Environment Variables
- **무엇이 있어야 하는가:** `THEGRID_API_KEY` = (THEGRID 대시보드에서 발급받은 키). **Production / Preview / Development** 세 환경 모두에 설정.
- **변경 시:** env 값을 바꾸면 **신규 배포부터 적용**됩니다. Vercel 대시보드에서 "Redeploy" 누르거나 git push로 새 배포 트리거.
- **확인:** Vercel 대시보드의 가장 최근 배포가 성공 상태인지 (녹색 체크).

### §0.2 프록시 함수 배포 확인

`api/chat.ts`가 이 레포에 추가되었습니다. GitHub에 push하면 Vercel이 자동으로 빌드/배포합니다.

```bash
# 프록시가 살아있는지 테스트
curl -X POST https://troll-breaker-browser.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":20}'
```

- **200 + JSON 응답**: 정상. `choices[0].message.content`에 답변이 있어야 함.
- **404**: `api/chat.ts`가 아직 배포 안 됨. git push 했는지, Vercel이 main 브랜치를 보고 있는지 확인.
- **500 `server_misconfigured`**: `THEGRID_API_KEY` env var가 비어 있음. §0.1 확인.
- **502 `upstream_unreachable`**: THEGRID 측 장애. status.thegrid.ai 확인.
- **502 `upstream_error` (내부 메시지 포함)**: THEGRID에서 에러 반환. 키가 만료/취소되었거나 잔액 부족일 가능성.

### §0.3 토큰 비용 모니터링 (반복 작업)

토큰 비용을 *운영자가 부담*하므로 노출 관리가 중요합니다.

- **주 1회:** Vercel 함수 호출 수 점검 → https://vercel.com/sein-ohs-projects/troll-breaker-browser → Analytics.
- **주 1회:** THEGRID 사용량 점검 → https://app.thegrid.ai (Usage 페이지).
- **비정상 증가 발견 시:** abuse 가능성. 다음 중 하나로 대응:
  1. `api/chat.ts`에 per-IP rate limiting 추가 (Vercel KV 또는 Upstash). 현재 TODO 주석으로만 표시되어 있음.
  2. 임시 차단: Vercel 함수에서 throw하거나 함수 자체를 비활성화.
  3. THEGRID 키 회전.

### §0.4 키 회전 절차 (보안 사고 시)

1. https://app.thegrid.ai/profile/api-keys → 기존 키 revoke (즉시 사용 불가화).
2. 새 키 발급.
3. Vercel → Settings → Environment Variables → `THEGRID_API_KEY` 업데이트 (3개 환경 모두).
4. Redeploy 트리거.
5. 새 배포가 성공한 뒤 §0.2의 curl 테스트로 확인.

엔드유저는 아무 작업 필요 없음 (프록시 URL은 그대로).

---

## Phase 0 — 코드를 더 쓰기 전에 끝내야 할 것

### §1. Chrome Web Store 개발자 계정 — ✅ 완료

- **상태:** 등록 완료. 개발자 대시보드: https://chrome.google.com/webstore/devconsole/c58102d6-3991-4815-8ed1-2e655708904e
- **다음 단계:** §10 스토어 리스팅 자산 준비까지 추가 작업 없음.

### §2. 시드 vibe 코퍼스 — 🔄 1/5 완료 (가장 중요한 미완 작업)

- **무엇:** 각 타겟 커뮤니티에 대해 `VibeProfile` JSON을 손으로 큐레이션. 출시 최소 세트: `fmkorea`, `dcinside`, `theqoo`, `ruliweb`, `ilbe`.
- **왜:** 시드 품질이 day-one 출력 품질의 80%를 결정. 시드가 비어 있으면 어느 커뮤니티에서 글을 다듬어도 똑같이 generic한 한국어가 나옴.
- **현재 상태:**
  - ✅ `extension/seeds/fmkorea.com.json` — 큐레이션 완료
  - ❌ `extension/seeds/dcinside.com.json` — `__TODO__` 마커
  - ❌ `extension/seeds/theqoo.net.json` — `__TODO__` 마커
  - ❌ `extension/seeds/ruliweb.com.json` — `__TODO__` 마커
  - ❌ `extension/seeds/ilbe.com.json` — `__TODO__` 마커
- **각 시드 파일에 필요한 것** ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §10 체크리스트):
  - 최근 30일 이내 베스트 글 **2~5개** 전사 (`title` / `body` ≤ 1500자 / `top_comments[]`)
  - 50단어 voice memo → `tonality.sarcasm_style` 필드
  - 고시그널 어휘 **15~30개**
  - 금지어 **5~10개**
  - `cynicism_level` / `political_lean` / `paragraph_style` 등 메타 필드
  - `last_refreshed`를 큐레이션 당일 ISO 날짜로
  - **PII / 슬러는 전사 시점에 수작업 제거**
- **확인:**
  ```bash
  npm test                                       # 시드 스키마 검증 통과해야 함
  grep -l __TODO__ extension/seeds/*.json        # 출력이 비어야 완료
  ```

### §3. 사이트별 DOM 셀렉터 스펙 — ❌ 0/5 완료

- **무엇:** 각 사이트의 베스트 글 페이지에서 제목 / 본문 / 상위 댓글을 뽑아낼 CSS 셀렉터를 `docs/site-extractors/<site_id>.md`에 문서화.
- **왜:** 사용자가 그 커뮤니티 페이지를 *직접 방문 중일 때*, 콘텐츠 스크립트가 화면의 베스트 글을 자동으로 읽어 시드 캐시를 갱신함. 셀렉터 없이는 시드가 시간이 지나면서 낡아도 자동 복구 불가.
- **현재 상태:** 5개 파일 모두 `__TODO__` 마커 남음.
- **방법:**
  1. 사이트의 베스트 목록 페이지를 크롬에서 열기
  2. DevTools (F12) → Elements 탭 → 제목 위에서 우클릭 → Copy → Copy selector
  3. 콘솔에서 `document.querySelectorAll("...").length` 로 검증 (10 이상이면 합격)
  4. 본문 / 댓글에도 동일 절차 반복
- **확인:** `grep -l __TODO__ docs/site-extractors/*.md` 출력에 `_TEMPLATE.md`만 남아야 완료.

### §4. API 키 — ✅ 완전히 단순화됨

| 항목 | 상태 | 메모 |
|---|---|---|
| **THEGRID API** | ✅ Vercel env에 등록 완료 | 모든 프로덕션 LLM 호출이 이 키로 동작. §0 참고 |
| **Brave Search API** | ✅ 발급 + `.env` 등록 + 코드 와이어링 완료 | dev smoke runner 전용. 프로덕션 익스텐션은 아직 검색을 호출하지 않음 |
| ~~Anthropic API~~ | ❌ 제거됨 | 어댑터 코드 삭제. 향후 multi-provider가 필요해지면 THEGRID `agent-prime` 인스트루먼트나 별도 어댑터로 |
| ~~Gemini API~~ | ❌ 제거됨 | 어댑터 코드 삭제. THEGRID OpenAI-호환 게이트웨이로 통합 |

엔드유저가 발급해야 할 키는 **0개**입니다.

### §5. 법무 / TOS 검토 — ❌ 미진행 (스토어 제출 전 필수)

스토어 제출 전에 본인이 직접 한 번 읽고, 각 항목에 대해 "왜 OK한지" 1문단으로 답할 수 있어야 함:

1. **THEGRID Usage Policy** — "냉소적 재작성" 출력이 abuse 라인을 넘는지. 정책에 따라 운영자(우리)가 책임짐.
2. **Brave Search TOS** — 브라우저 익스텐션 배포에서 사용 가능 여부. (현재 BraveSearch는 dev smoke runner 전용이므로 프로덕션 영향은 적음.)
3. **타겟 커뮤니티 TOS** (fmkorea / dcinside / theqoo / ruliweb / ilbe) — *서버 스크래핑이 아니라 사용자가 이미 로드한 DOM만 읽음*. 프라이버시 정책에 명시.
4. **Chrome Web Store policies** — https://developer.chrome.com/docs/webstore/program-policies (Single Purpose + User Data 항목 정독).

### §6. 프라이버시 정책 안정 URL 게시 — ❌ 미진행 (서버 모델 반영해서 다시 작성 필요)

- **무엇:** GitHub Pages / Notion / 개인 사이트 등 안정 URL에 정책 게시.
- **필수 포함 내용** ([`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §7):
  1. 운영자가 작은 서버(Vercel proxy)를 운영하며, 이 서버가 LLM API 키를 보유함.
  2. *사용자가 명시적으로 트리거*했을 때만 선택 텍스트 + 현재 URL이 우리 프록시 → THEGRID 순으로 전송됨.
  3. 로컬 저장 항목: 환경설정, vibe 캐시. 비밀 정보 저장 없음.
  4. 분석 / 텔레메트리 없음. 요청은 사용자 신원과 연결되지 않음.
  5. 로컬 데이터 삭제 방법: 옵션 페이지 또는 확장 제거. 서버 측 함수 로그는 사용자 식별자가 없어 개별 삭제 불가.
- **이전 BYOK 시절 정책 문구가 있다면 ⚠️ 반드시 갱신** (서버 부재 → 서버 있음, 키 사용자 보유 → 키 운영자 보유로 정정).

---

## Phase 1 — MVP 개발 중에 결정해야 할 것

### §7. 기술 스파이크 3건 (TECH_STACK.md §10)

각 ~30분 작업:

- [ ] **MV3 service worker에서 Vercel 프록시로 fetch가 동작하는가?** CORS 응답 헤더 확인.
- [ ] **Brave Search 한국 발 레이턴시 — p50 < 1s인가?** (Brave를 결국 프록시화할 경우에도 필요한 측정.)
- [ ] **Chrome side panel이 탭 전환 시 채팅 상태를 유지하는가?** Chrome stable에서 확인.

### §8. 아키텍처 오픈 의사결정 4건 (ARCHITECTURE.md §8)

- [ ] **기본 파이프라인 모드** — Fast vs Standard 자동 선택의 기준. 현재 500자 임계.
- [ ] **모델 선택 정책** — THEGRID의 `text-prime` 단일 vs 작업별 `text-standard`/`agent-prime` 라우팅. 비용 vs 품질.
- [ ] **검색 프로바이더** — Brave 단일로 가는지, 향후 `/api/search` 프록시 추가할지.
- [ ] **사이트 DOM 안정성 / extractor 버저닝 정책**.

### §9. 주 1회 dogfood

- **무엇:** 진행 중인 익스텐션을 실제 토론에 주 1회 사용. vibe 품질은 운영자만 판단 가능.

---

## Phase 2 — 출시 전

### §10. 스토어 리스팅 자산 — ❌ 미진행

- **아이콘:** 16×16, 48×48, 128×128 PNG + 스토어 128×128.
- **스크린샷:** 1~5장, 1280×800 또는 640×400.
- **프로모션 이미지** (선택): 440×280, 920×680.
- **리스팅 카피 (한/영):** 한 문단 설명, 상세 설명, 카테고리.
- **권한 정당화 1줄씩** (서버 모델 반영, [`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §8):
  - `contextMenus` — "Truth Check" 우클릭 메뉴
  - `storage` — **환경설정과 vibe 캐시만 로컬 저장 (비밀 정보 없음)**
  - `sidePanel` — 결과 UI 렌더링
  - `activeTab` — 명시적 호출 시 선택 텍스트 읽기
  - `host_permissions` (`troll-breaker-browser.vercel.app`) — 우리 프록시 호출
  - `host_permissions` (커뮤니티 사이트) — 플로팅 버튼 + DOM vibe 샘플링

### §11. 지원 채널 — ❌ 미진행

- **무엇:** GitHub Issues면 충분.
- **확인:** Issue template + URL을 스토어 리스팅에 기재.

---

## Phase 3 — 출시 후 지속 운영

### §12. Vibe 프로파일 월간 리프레시

- **무엇:** 번들된 시드 프로파일을 월 1회 재큐레이션.
- **확인:** 출시 시점에 각 프로파일의 `last_refreshed`가 30일 이내.

### §13. DOM extractor watch + Vercel 사용량 watch

- **무엇:** 두 가지를 모두 모니터링.
  - **사이트 측:** "0 samples in 14 days" 경고 → 셀렉터 스펙 업데이트 → 패치 배포.
  - **운영 측:** Vercel 함수 호출 수 + THEGRID 사용량 → 비정상 증가 시 §0.3 절차.
- **언제:** 지속.

### §14. 토큰 비용 한도 검토 (NEW)

- **무엇:** THEGRID 계정에 월간 spending cap 설정. 한도 초과 시 동작 방식 결정 (에러 메시지 vs 큐잉).
- **왜:** BYOK가 아니므로 abuse나 갑작스러운 사용량 증가가 운영자의 카드로 직격됨.
- **언제:** 출시 전 결정, 매월 점검.

### §15. 프로바이더 모델 마이그레이션

- **무엇:** THEGRID이 새 인스트루먼트 (예: `text-prime` → `text-prime-v2`)를 내놓을 때 평가 후 기본값 업데이트.
- **언제:** 메이저 릴리즈 후 2주 이내.

---

## 사용자가 할 일이 *아닌* 것 (코드 / 스펙으로 위임)

- 익스텐션 코드 작성 → [`ROADMAP.md`](./ROADMAP.md).
- 스키마 정의 → [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md).
- 프롬프트 작성 → [`PROMPT_GUIDELINES.md`](./PROMPT_GUIDELINES.md).

---

## 우선순위 권장 (지금 무엇부터?)

1. **지금 바로 (5분):** §0.2의 curl 테스트로 프록시 살아있는지 확인. 404면 git push → Vercel 자동 배포 대기.
2. **이번 주:** 시드 1개 큐레이션 (가장 자주 쓰는 커뮤니티). 끝나면 `npm run smoke`로 톤 변화 확인.
3. **다음 주:** 시드 3~4개 + DOM 셀렉터 5개 동시 진행 (같은 사이트를 분석하는 김에 병행).
4. **출시 전:** 기술 스파이크 → 익스텐션 셸 코드 → TOS 검토 → 프라이버시 정책 → 스토어 자산.

---

## 빠른 진단 명령어

```bash
# 1. 코드 정상?
npm run typecheck
npm test                                          # 모두 통과해야

# 2. 시드 진척도?
grep -l __TODO__ extension/seeds/*.json           # 출력 비어야 완료

# 3. DOM 스펙 진척도?
grep -l __TODO__ docs/site-extractors/*.md        # _TEMPLATE.md 외에 없어야 완료

# 4. 프록시 살아있나? (수동 curl)
curl -X POST https://troll-breaker-browser.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":20}'

# 5. 전체 파이프라인 (프록시 + Brave + 에이전트)
npm run smoke                                     # ShieldResult/SwordResult JSON 출력되면 OK
```
