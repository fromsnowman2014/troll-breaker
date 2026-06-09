# Site Extractor Specs

USER_ACTION_ITEMS.md §3의 산출물. 각 사이트마다 `<site_id>.md` 하나.

콘텐츠 스크립트(`src/content/extractors/<site_id>.ts`, 추후 추가)는 이 스펙을 그대로 코드로 옮겨 적기만 하면 동작해야 한다.

## 채우는 사람

리포 소유자(=한국어 가능 + 해당 커뮤니티 사용자). 셀렉터는 브라우저 DevTools에서 확인.

## 채우는 방법

1. 사이트의 "베스트/개념글" 목록 페이지를 연다.
2. DevTools → Elements → 게시글 제목 위에서 우클릭 → "Copy → Copy selector".
3. 그 셀렉터가 *모든* 베스트 글에 매치되는지 확인 (콘솔에서 `document.querySelectorAll('<selector>').length` ≥ 10).
4. 본문/댓글도 동일하게.
5. 셀렉터가 너무 길거나 자동 생성 ID(`#wfm-list-1234`)를 포함하면 — 안정성이 낮음. 더 일반적인 클래스/태그로 다듬을 것.

## 셀렉터 안정성 체크

- [ ] 최근 7일 안에 사이트 개편이 없었나? (개편이 잦으면 셀렉터가 자주 깨짐)
- [ ] 로그인 필요? — 있으면 "anti-bot quirks"에 명시.
- [ ] JS 렌더링? — 있으면 콘텐츠 스크립트가 `MutationObserver`로 기다려야 함.
