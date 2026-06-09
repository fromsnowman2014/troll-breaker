# 다음에 해야 할 일 (한국어 안내)

지금까지 코드 측은 **에이전트 계층 + Gemini 어댑터 + 시드 로더 + smoke runner**까지 끝나 있습니다.
아래는 **사용자(소유자)가 직접** 해야 동작이 살아나는 일들입니다. 각 단계는 *왜* 필요한지와 *어떻게* 끝났음을 확인하는지를 함께 적었습니다.

> 영문 원본 체크리스트: [`USER_ACTION_ITEMS.md`](./USER_ACTION_ITEMS.md). 이 문서는 그것의 한국어 운영 가이드입니다.

---

## 1. `.env` 만들기 (5분, 지금 바로)

**왜:** smoke runner가 실제로 LLM을 호출하려면 키가 필요합니다. `.env`는 `.gitignore`에 등록되어 절대 커밋되지 않습니다.

**방법:**
```bash
cp .env.example .env
```
`.env`를 열고 아래 한 줄만 채웁니다 (Gemini를 쓰는 경우):
```
GEMINI_API_KEY=AI...본인이_발급받은_키
```

**확인:**
```bash
npm run smoke
```
- 키가 비어 있으면: `[smoke] GEMINI_API_KEY is empty.` 메시지가 뜨고 종료 → 키 다시 확인.
- 키가 정상이면: `=== ShieldResult ===` JSON이 출력되고 `[smoke] OK.`로 끝나면 성공.
- 시드가 아직 비어 있어서 `WARNING: fmkorea.com seed is still a skeleton` 경고가 같이 뜹니다. **정상**입니다 (다음 단계에서 채웁니다).

---

## 2. 시드 코퍼스 5개 채우기 (사이트당 30~60분)

**왜:** 이게 제품 품질의 80%를 결정합니다. 시드가 비어 있으면 일베/디시/펨코 어디서 글을 다듬어도 똑같이 밋밋한 한국어가 나옵니다. ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §3, §10)

**파일 위치:** `extension/seeds/<site_id>.json`
- `fmkorea.com.json`
- `dcinside.com.json`
- `theqoo.net.json`
- `ruliweb.com.json`
- `ilbe.com.json`

각 파일은 **스키마 통과는 하지만 `__TODO__` 마커가 잔뜩 있는 빈 껍데기** 상태입니다. 채우는 순서:

1. **30일 이내 베스트 글 2~5개를 골라** 제목/본문/상위 댓글을 옮겨 적기. (`few_shot_posts`)
   - 본문은 1500자 이하로 자르기. 개인정보/슬러는 손으로 제거.
2. **50단어 한 줄 voice memo** 적기. *어떻게* 비꼬는지를 한 방향으로 묘사. (`tonality.sarcasm_style`)
   - 좋은 예: `"건조하게 비꼬는, 감정 배제, 마지막에 한 방"`
   - 나쁜 예: `"sarcastic"` (방향이 없어서 모델이 못 따라 함)
3. **시그니처 단어 15~30개** (`lexicon.high_signal_words`)
   - 그 커뮤니티에서만 자주 쓰이는 단어. ex) `"그저"`, `"오히려 좋아"`, `"참 거시기"`
4. **금지어 5~10개** (`lexicon.forbidden_words`) — 그 사이트에서 쓰면 "외부인" 티 나는 표현.
5. `cynicism_level` 0~10, `political_lean` (`left`/`right`/`mixed`/`apolitical`), `paragraph_style` 등 메타 필드도 채우기.
6. `last_refreshed`를 오늘 날짜로 (`YYYY-MM-DDT00:00:00.000Z`).
7. `display_name`에서 `(skeleton — ...)` 부분 제거.

**확인:**
```bash
npm test
```
- 시드 파일이 스키마를 깨면 `seed loader › loads and validates bundled site seeds` 테스트가 실패합니다.
- 통과하면 OK. 단 `isSkeleton` 체크는 `__TODO__` 마커가 남아 있으면 여전히 true를 반환 — 모든 `__TODO__`를 다 지웠는지 한 번 더 확인:
```bash
grep -l __TODO__ extension/seeds/*.json
```
출력이 비어야 완성.

**체크리스트 (VIBE_EXTRACTION.md §10):**
- [ ] 시드만 보고도 어느 커뮤니티인지 알아맞힐 수 있나?
- [ ] high_signal_words 중 3개 이상이 그 사이트만의 표현인가?
- [ ] sarcasm_style이 *방향*을 가리키나? (`"비꼬는"`만으로는 부족)
- [ ] few_shot_posts가 30일 이내인가?
- [ ] PII / 슬러가 들어 있지 않나?

---

## 3. DOM 셀렉터 스펙 5개 채우기 (사이트당 15~30분)

**왜:** 사용자가 그 커뮤니티 페이지를 *직접 보고 있을 때*, 콘텐츠 스크립트가 화면의 베스트 글들을 읽어서 시드 캐시를 자동 업데이트합니다. 셀렉터 없이는 자동화가 안 되고, 시드는 시간이 지나면 낡습니다. ([`VIBE_EXTRACTION.md`](./VIBE_EXTRACTION.md) §4)

**파일 위치:** `docs/site-extractors/<site_id>.md` (5개 모두 스켈레톤 있음)

**방법:**
1. 사이트의 "베스트/개념글" 목록 페이지를 크롬에서 엽니다.
2. DevTools(F12) → Elements 탭 → 게시글 제목 위에서 우클릭 → **Copy → Copy selector**.
3. 콘솔에서 검증:
   ```js
   document.querySelectorAll("복사한_셀렉터").length
   ```
   결과가 10 이상이면 합격. 1이면 셀렉터가 너무 좁음 → 더 일반화된 셀렉터로 다듬기.
4. 자동 생성 ID(`#wfm-list-7Aj92`)가 들어 있으면 안정성이 낮음. 클래스/태그로 바꾸기.
5. 본문 / 댓글 컨테이너 / 개별 댓글도 동일한 절차.
6. "로그인 필요?" / "JS 렌더?" / "Cloudflare?" 같은 메타 정보도 채우기.

**확인:**
- 작성한 셀렉터를 콘솔에서 다시 한 번 측정 → 결과 개수를 표에 적기. (그 숫자가 미래 디버깅의 기준점.)
- 5개 파일 모두에서 `__TODO__` 마커가 없어야 합격:
  ```bash
  grep -l __TODO__ docs/site-extractors/*.md
  ```

---

## 4. 추가로 필요한 API 키 (선택)

지금은 **Gemini만 있으면 동작**합니다. 다만 다음 둘은 결국 필요해집니다:

### 4a. Brave Search API 키 — *Fact 모드의 출처 품질 결정*

**왜:** `Fact` 에이전트가 주장을 검증할 후보 URL을 가져오는 곳. 없으면 smoke runner도 `MockSearch`(가짜 위키 1개)만 쓰게 되고, 실제 Shield 결과의 출처가 가짜로 박힙니다.

**방법:**
1. https://api.search.brave.com/app/keys 가입 (무료 티어로 충분).
2. `.env`에 `BRAVE_API_KEY=...` 추가.
3. **TODO:** `src/lib/search/brave.ts`의 stub은 현재 throw만 합니다. 실제 fetch 호출 와이어링은 다음 개발 사이클에 추가됩니다. 키만 미리 발급받아두면 됩니다.

### 4b. Anthropic Claude API 키 — *나중에 멀티 프로바이더로 갈 때*

**왜:** TECH_STACK.md §2는 Anthropic을 기본으로 추천. 한국어 풍자 톤은 Claude가 일관되게 잘 합니다. 다만 지금은 Gemini로도 충분히 동작하므로 **급하지 않음**.

---

## 5. 법무 / TOS 검토 (스토어 제출 전, 30분)

**왜:** Chrome Web Store 정책 위반은 즉시 거절 사유. 일베 같이 강한 사이트를 다루므로 더 조심.

**확인 항목 4가지:**
1. **Anthropic / Google AI Usage Policy**: "냉소적 재작성" 출력이 정책의 harassment 라인을 넘는가? 답은 보통 "안 넘음"이지만, 직접 한 번 읽어두기.
2. **Brave Search TOS**: 브라우저 확장에서 사용 가능 여부 확인.
3. **대상 커뮤니티 TOS**: 우리는 *사용자가 이미 로드한 DOM만* 읽는다 — 서버 스크래핑이 아님. 이 입장을 프라이버시 정책에 명시.
4. **Chrome Web Store**: https://developer.chrome.com/docs/webstore/program-policies — Single Purpose + User Data 항목 정독.

**확인:** 4가지 각각에 대해 1문단으로 "왜 OK한지" 본인이 설명할 수 있는가? 가능하면 합격.

---

## 6. 프라이버시 정책 URL 게시 (스토어 제출 전, 20분)

**왜:** Chrome Web Store가 *반드시* 안정적 URL의 프라이버시 정책을 요구.

**방법:**
1. GitHub Pages, Notion 공개 페이지, 개인 사이트 — 어디든 OK.
2. 다음 내용을 반드시 포함 ([`API_KEY_SECURITY.md`](./API_KEY_SECURITY.md) §8):
   - 우리는 서버를 운영하지 않음 (BYOK)
   - 사용자가 *명시적으로 트리거*했을 때만 선택 텍스트 + 현재 URL이 LLM/검색 API로 전송됨
   - 저장하는 것: API 키(암호화, 로컬), 설정, vibe 캐시
   - 분석/텔레메트리 없음
   - 데이터 삭제 방법: 옵션 페이지 또는 확장 제거
3. URL을 메모해두기 → 추후 스토어 등록 폼에 입력.

---

## 코드 측에서 자동으로 따라오는 다음 작업 (참고)

아래는 **사용자가 할 일은 아니지만** 다음 개발 단계에서 자동으로 발생할 일들. 참고용:

- Brave Search 실제 fetch 와이어링 (4a의 키가 있어야 의미 있음).
- 콘텐츠 스크립트 + 사이트별 DOM extractor (3번 스펙이 채워져야 의미 있음).
- 익스텐션 셸 (Manifest V3, side panel, 옵션 페이지) — ROADMAP.md Phase 0–1.
- `chrome.storage` 어댑터 (현재는 InMemoryKv만).

이 작업들은 모두 **2, 3번 사용자 산출물에 의존**합니다. 그래서 다음 우선순위는:

1. **지금 바로:** `.env` 만들기 + `npm run smoke` 한 번 돌려보기 (5분).
2. **이번 주:** 시드 1개라도 진짜 데이터로 채우기 (가장 자주 쓰는 사이트부터). smoke runner를 다시 돌려서 톤이 달라지는지 확인.
3. **다음 주:** 나머지 시드 4개 + DOM 셀렉터 스펙 5개.
4. **그 다음:** Brave 키 발급 → 코드 측 와이어링 의뢰.

---

## 빠른 진단: 지금 상태 점검

```bash
# 1. 코드 정상?
npm test                                       # 33개 모두 통과해야

# 2. 시드 진척도?
grep -l __TODO__ extension/seeds/*.json        # 비어 있으면 완료

# 3. DOM 스펙 진척도?
grep -l __TODO__ docs/site-extractors/*.md     # 비어 있으면 완료

# 4. 실제 LLM 와이어링?
npm run smoke                                  # ShieldResult/SwordResult JSON 출력되면 OK
```

---

질문이 있으면 `USER_ACTION_ITEMS.md`(영문 원본) → `VIBE_EXTRACTION.md` → `ARCHITECTURE.md` 순으로 참고하면 됩니다.
