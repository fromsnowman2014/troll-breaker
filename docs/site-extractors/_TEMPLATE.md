# <site_id>

> 상태: __TODO__ — 사용자 채움 필요.
> 마지막 검증일: YYYY-MM-DD

## URL 패턴

- 베스트 목록: `__TODO__: 예) https://www.fmkorea.com/best`
- 개별 글: `__TODO__: 예) https://www.fmkorea.com/{post_id}` (정규식: `__TODO__`)

## CSS 셀렉터

| 대상 | 셀렉터 | 검증 (`querySelectorAll(...).length`) |
|---|---|---|
| 글 카드 (목록) | `__TODO__` | __TODO__ |
| 글 제목 | `__TODO__` | __TODO__ |
| 글 본문 | `__TODO__` | __TODO__ |
| 댓글 컨테이너 | `__TODO__` | __TODO__ |
| 개별 댓글 | `__TODO__` | __TODO__ |

## 렌더링 / 인증

- 로그인 필요? __TODO__ (yes/no)
- 서버 렌더 vs JS 렌더? __TODO__
- 콘텐츠 스크립트가 기다려야 할 셀렉터: `__TODO__` (없으면 N/A)

## Anti-bot 메모

- __TODO__: Cloudflare? 자체 차단? 빈도 제한?
- __TODO__: 모바일/PC 마크업 차이.

## 깨졌을 때 신호

- `0 samples in 14 days` 경보 (자동) → 셀렉터 갱신 필요.
- 사용자 리포트 → 위 셀렉터 검증값 다시 측정 → 표 업데이트.

## 변경 이력

- YYYY-MM-DD: initial skeleton.
