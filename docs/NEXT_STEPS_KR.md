# 다음에 해야 할 일 (한국어 안내)

> **갱신:** 2026-06-23
>
> **아키텍처 변경 안내 (2026-06-23):** BYOK 모델 폐기, 단일 공유 키(`THEGRID_API_KEY`, Vercel env) + 서버리스 프록시(`/api/chat`)로 전환. 유저는 더 이상 API 키를 다루지 않습니다.

코드 측은 **에이전트 계층 + THEGRID 어댑터 + Vercel 프록시 + Brave Search 와이어링 + 시드 로더 + smoke runner**까지 완료. 아래는 **운영자가 직접** 해야 동작이 살아나는 일들입니다.

> 영문 / 상세 체크리스트: [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md)

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

## 코드 측에서 자동으로 따라오는 다음 작업 (참고)

- 익스텐션 셸 (Manifest V3, side panel, 옵션 페이지) — 옵션 페이지는 이제 **키 입력 UI가 없음**. 설정/whitelist 관리만.
- 콘텐츠 스크립트 + 사이트별 DOM extractor (3번 스펙 필요).
- `chrome.storage` 어댑터 (비밀 정보 보관 없음).
- (선택) `/api/search` 프록시 추가해서 Brave도 서버 측으로 — 현재는 dev 전용.

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
