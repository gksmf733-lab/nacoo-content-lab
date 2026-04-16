# 플레이스 프로젝트 지침 (웹 API 기반)

## 일반 원칙
- **공지 수집은 반드시 puppeteer 스크래퍼(`npm run scrape:notices`)를 사용한다.** smartplace.naver.com은 JS SPA라 WebFetch/WebSearch로 접근 불가.
- 공지 외 일반 정보탐색은 WebSearch 활용 가능
- 플레이스 컨설턴트/강사 관점에서 정보를 깔끔하고 자세하게 분석하여 답변
- **결과물 저장소는 Notion이 아니라 "나쿠 콘텐츠연구소" 웹 API (Vercel Postgres)**

---

## 네이버 스마트플레이스 공지사항 자동화 지침

이 프로젝트는 매일 오전 9시 / 오후 6시(KST)에 네이버 스마트플레이스 공지를 수집하고,
각 공지에 대해 사장님 대상 릴스 대본을 자동 생성하여 **나쿠 콘텐츠연구소 웹 DB**에 저장한다.

### 저장소 (웹 API)

모든 공지와 릴스 대본은 아래 웹 API로 저장된다. **Notion은 더 이상 사용하지 않는다.**

- **Base URL (환경변수로 주입)**: `NAKU_API_BASE` — 예: `https://naku-lab.vercel.app`
- **인증**: 모든 쓰기 요청은 `Authorization: Bearer <NAKU_API_TOKEN>` 헤더 필수
- **공지 엔드포인트**
  - `GET  /api/notices` — 기존 등록된 공지 목록 (중복 체크용)
  - `POST /api/notices` — 신규 공지 등록
- **릴스 대본 엔드포인트**
  - `GET  /api/scripts` — 기존 대본 목록
  - `POST /api/scripts` — 신규 대본 등록 (공지당 1건)
  - `GET  /api/scripts/:id` — 대본 상세
  - `PATCH /api/scripts/:id` — 대본 수정 (웹 UI에서 주로 사용)
- **카드뉴스 엔드포인트**
  - `GET  /api/card-news?notice_id=<id>` — 세트 + 슬라이드 조회
  - `POST /api/card-news` — 세트 + 슬라이드 일괄 등록 (공지당 1세트)

### 수집 및 등록 절차

1. **기존 등록 목록 확인**
   - `GET {NAKU_API_BASE}/api/notices` 호출 → 응답의 `notices[].title` 및 `title_hash` 수집
   - 중복 방지 기준으로 사용 (제목 정규화 후 비교)

2. **puppeteer 스크래퍼로 공식 공지 페이지 직접 읽기**
   - smartplace.naver.com은 JS 렌더링 SPA라서 WebFetch/WebSearch로는 접근 불가. **반드시 puppeteer 스크래퍼를 사용한다.**
   - 실행 명령 (**당일 공지만 수집**):
     ```bash
     cd C:/Users/Z840/Desktop/바이브코딩/나쿠 && npm run scrape:notices -- --today
     ```
   - `--today`: 오늘 날짜(KST) 공지만 필터. 결과가 `[]`이면 당일 신규 없음 → 종료.
   - `--recent N`: 최근 N일 공지 (수동 백필용)
   - stdout에 JSON 배열 출력: `[{title, date, tags, importance, url, content}, ...]`
     - `content`: 상세 페이지 본문 텍스트 (최대 3000자). 스크래퍼가 각 공지의 상세 페이지를 자동으로 방문하여 수집한다.
   - 이 JSON이 공지 수집의 **유일한 소스**다. WebSearch/WebFetch로 공지를 검색하지 마라.
   - **`content` 필드를 반드시 활용**하여 summary/checklist를 작성한다. content가 비어있는 경우에만 title 기반으로 간략 요약한다.

3. **신규 공지 필터링**
   - 1번에서 수집한 기존 제목·해시와 대조 → 중복이 아닌 것만 추림

4. **공지 등록 (`POST /api/notices`)**

   ```http
   POST {NAKU_API_BASE}/api/notices
   Authorization: Bearer {NAKU_API_TOKEN}
   Content-Type: application/json

   {
     "title": "스마트플레이스(핵심주제) YYYY-MM-DD",
     "tags": ["공통", "플레이스", "식당"],
     "importance": "중요|null",
     "published_at": "YYYY-MM-DD",
     "effective_at": "YYYY-MM-DD",
     "summary": "핵심 변경사항 상세 요약 (아래 작성 기준 참고)",
     "checklist": "운영자 체크리스트 (아래 작성 기준 참고)",
     "source_urls": ["https://smartplace.naver.com/notices/..."],
     "deadline": "YYYY-MM-DD 또는 null",
     "source": "auto"
   }
   ```

   - **`deadline` 필드**: 공지 본문에 신청 마감일, 모집 마감일, 접수 마감일 등이 명시된 경우 해당 날짜를 `YYYY-MM-DD` 형식으로 기입한다. 마감일이 없으면 `null`. summary/checklist에서 "마감", "신청 마감", "모집 마감", "접수 마감" 등의 키워드와 함께 나오는 날짜를 추출한다.
   - **`tags` 배열 규칙**: 네이버 공식 공지페이지(https://smartplace.naver.com/notices)의 각 공지 제목 앞에 붙은 뱃지를 **그대로** 배열로 기록한다. 대표 값: `공통`, `플레이스`, `식당`, `예약`, `교육`, `외식업종`.
   - **`중요` 뱃지 처리**: `중요` 뱃지가 붙어있으면 `tags`에 넣지 말고 `importance: "중요"`로 분리해서 보낸다. (서버가 tags에 포함돼 있어도 자동 분리하지만, 에이전트는 규칙대로 분리해서 보낼 것)
   - 중요 뱃지가 없으면 `importance`는 `null`로 보낸다.

   - **`summary` 작성 기준** (스크래퍼 `content` 필드 기반으로 상세히 작성):
     - 교육/이벤트: 대상, 일정(날짜·시간), 장소(온/오프라인), 커리큘럼/내용, 혜택/인센티브, 신청 방법·마감일
     - 정책 변경: 변경 내용, 시행일, 영향 범위, 사장님이 해야 할 조치
     - 기능 업데이트: 기능 설명, 적용 대상, 활용 방법
     - **최소 500자 이상**, 항목별 ■ 구분자 사용, 구체적 수치/날짜 필수 포함
   - **`checklist` 작성 기준**: 사장님이 즉시 실행할 액션 항목 7~10개, `•` 기호 사용, 우선순위 순 나열
   - 응답 201 → `notice.id`를 기억해 5단계에서 사용
   - 응답 409 → 중복이므로 건너뜀

5. **공지 수집 즉시 두 파이프라인을 병렬로 실행**한다:
   - (A) 릴스 대본 생성 → `POST /api/scripts` (아래 5-A)
   - (B) 카드뉴스 생성 → `POST /api/card-news` (아래 섹션 "카드뉴스 생성 파이프라인")

5-A. **릴스 대본 등록 (`POST /api/scripts`) — 공지 1건당 1개**

   ```http
   POST {NAKU_API_BASE}/api/scripts
   Authorization: Bearer {NAKU_API_TOKEN}
   Content-Type: application/json

   {
     "notice_id": 123,
     "title": "[릴스대본] 스마트플레이스(핵심주제) YYYY-MM-DD",
     "tone": "urgent" | "opportunity",
     "body_markdown": "<아래 릴스 대본 템플릿 전체>",
     "hashtags": ["#네이버플레이스", "#스마트플레이스", ...]
   }
   ```

   - `body_markdown`은 아래 **상세 릴스 대본 템플릿**을 정확히 따른다.
   - `tone`은 공지 성격에 따라 `urgent`(긴박·경고형) 또는 `opportunity`(정보·기회형).

---

## 📐 상세 릴스 대본 템플릿 (body_markdown에 그대로 저장)

```markdown
## 📋 대본 정보

| 항목 | 내용 |
|---|---|
| 공지 주제 | [주제 + 시행일] |
| 톤앤매너 | 긴박·경고형 OR 정보·기회형 (공지 성격에 따라 선택) |
| 목표 길이 | 60초 내외 |
| 포맷 | 인스타그램 릴스 (세로 9:16) |

---

## 🎬 영상 구성 타임라인

| 구간 | 시간 | 역할 |
|---|---|---|
| HOOK | 0~5초 | 시청 중단을 막는 강렬한 첫 마디 |
| 문제 제기 | 6~20초 | 변화 내용 + 위기감 or 기회 포착 |
| 핵심 설명 | 21~45초 | 사장님이 알아야 할 포인트 3가지 |
| CTA | 46~60초 | 행동 유도 + 저장 유도 |

---

## 🎙️ 대본 (자막 포함 촬영용)

### ▶ HOOK — 0~5초

**🎤 나레이션**
> "[시선 사로잡는 한 문장]"

- 📸 **화면 제안**: [구체적 장면]
- 📝 **자막**: `[자막 문구]`

### ▶ 문제 제기 — 6~20초

**🎤 나레이션**
> "[변화 내용 3~4문장]"

- 📸 **화면 제안**: [장면]
- 📝 **자막 1**: `[키 메시지]`
- 📝 **자막 2**: `[보조 메시지]`

### ▶ 핵심 설명 — 21~45초

**🎤 나레이션**
> "[사장님이 할 3가지 — 첫째/둘째/셋째로 명확히 구분]"

- 📸 **화면 제안**: 123 슬라이드 + 보조 화면
- 📝 **자막 1**: `① [액션 1]`
- 📝 **자막 2**: `② [액션 2]`
- 📝 **자막 3**: `③ [액션 3]`

### ▶ CTA — 46~60초

**🎤 나레이션**
> "[즉시 실행 유도 + 저장/팔로우 CTA]"

- 📸 **화면 제안**: [스마트플레이스 센터 경로 시각화]
- 📝 **자막 1**: `[CTA 문구]`
- 📝 **자막 2**: `💾 저장해두면 나중에 써먹어요`

---

## 📌 촬영 & 편집 가이드

| 항목 | 가이드 |
|---|---|
| 촬영 포맷 | 세로 9:16 (1080×1920) |
| BGM 분위기 | [톤에 맞는 BGM 설명] |
| 자막 스타일 | 굵은 흰색 + [강조색] 키워드 |
| 컷 편집 속도 | [평균 컷 시간] |
| 썸네일 문구 | `"[문구1]"` / `"[문구2]"` |

---

## 🏷️ 추천 해시태그

#네이버플레이스 #스마트플레이스 #[주제해시] #자영업자필수 #플레이스최적화
#사장님정보 #소상공인 #플레이스관리 #리뷰관리 #네이버리뷰

---

## 📎 참고 공지 출처

- 발표일: YYYY-MM-DD / 시행일: YYYY-MM-DD
- [출처 1 — 매체명, 기사 제목]
- [출처 2 — 매체명, 기사 제목]
- 원본 공지 ID: {notice_id}
```

---

## 🖼️ 카드뉴스 생성 파이프라인 (공지당 1세트)

공지 등록(`POST /api/notices`) 직후, 릴스 대본 생성과 **병렬로** 카드뉴스도 생성한다.
`.claude/agents/` 의 4개 서브에이전트를 순차 호출한다.

### 실행 순서

1. **`research-analyst` 호출** — 공지 원문/브리프를 넘겨 JSON 브리프 수령
   - 입력: `notice_id`, 공지 본문 (title/summary/checklist/source_urls)
   - 산출: 브리프 JSON (headline_fact, key_points, audience, tone, cta_candidates, banned_words, references, risk_flags)

2. **`content-writer` 호출** — 브리프를 넘겨 카드뉴스 카피 초안 작성
   - 산출: `drafts/{notice_id}.md` (6~8장 카드)

3. **`visual-designer` 호출** — 카피를 읽어 HTML 카드 생성
   - HTML은 `POST /api/card-news` 의 `slides[].html` 필드로만 전송한다. **로컬 파일은 저장하지 않는다.**
   - 템플릿 생성은 `lib/card-html.ts` 의 `renderCardHtml()`를 단일 진실 소스로 사용한다.
     - 서버 PATCH(`/api/card-news/slides/[id]`)에서도 이 함수로 HTML을 재생성하므로, 에이전트 단계에서 미리 고정된 HTML을 박아두면 나중에 웹 UI 편집과 불일치가 생길 수 있다. **`renderCardHtml()` 결과를 그대로 보낸다.**

4. **`qa-reviewer` 호출** — 최종 검수
   - 산출: `{verdict: "pass" | "needs-fix", issues: [...]}`
   - `verdict === "needs-fix"` 이고 `block` 이슈가 있으면:
     - `suggested_action` 이 지목한 에이전트를 **1회만** 재호출
     - 재호출 후 다시 `qa-reviewer` 1회 재실행
     - 2회째도 실패하면 그대로 저장하고 세트 status를 `draft`, `qa_verdict=needs-fix`로 남긴다

### 로컬 저장 규칙 — **자동 저장 없음 (2026-04-16 변경)**

- **자동화 파이프라인은 로컬 파일을 만들지 않는다.** 카드뉴스 HTML은 DB(`card_news_slides.html`)에만 저장된다.
- **로컬 JPG가 필요할 때**: 웹 UI `카드뉴스` 탭 상단의 **`로컬에 저장 명령 복사`** 버튼을 눌러 명령어를 클립보드에 복사한 뒤, 터미널에서 실행한다:
  ```bash
  npm run save:cards -- <set_id>          # 특정 세트
  npm run save:cards -- --notice <notice_id>
  npm run save:cards -- --all             # 전체 세트
  ```
- **저장 루트**: `C:\Users\Z840\Desktop\바이브코딩\나쿠\카드뉴스\`
- **폴더명**: `{공지명} 카드뉴스/` 아래에 `card-1.jpg ~ card-N.jpg` + `spec.json`
- CLI는 DB의 `html` 컬럼을 그대로 읽어 puppeteer로 1080×1350 @2x / JPEG 92 품질로 렌더한다. 편집으로 `html`이 갱신되어 있으므로 **항상 최신본이 저장**된다.

### DB 일괄 등록 (`POST /api/card-news`)

```http
POST {NAKU_API_BASE}/api/card-news
Authorization: Bearer {NAKU_API_TOKEN}
Content-Type: application/json

{
  "notice_id": 123,
  "audience": "신규|단골|전체",
  "tone": "정보형|캐주얼|프로모션",
  "brief_json": { ... research-analyst 원본 ... },
  "status": "draft",
  "qa_verdict": "pass|needs-fix",
  "qa_issues": [ ... qa-reviewer issues ... ],
  "slides": [
    {
      "card_no": 1,
      "role": "hook|context|body|summary|cta",
      "title": "...",
      "body": "...",
      "hashtags": ["#..."],
      "html": "<section>...</section>"
    }
  ]
}
```

- `slides`는 순서대로(1번 카드부터) 넣는다.
- `html` 필드에는 visual-designer가 생성한 카드별 HTML 전체를 문자열로 담는다.
- 성공 응답 201 + `set_id` 수령.

---

## 🎨 톤 선택 기준

- **긴박·경고형 (`tone: "urgent"`)**: 정책 강화, 제재, 금지 행위, 리뷰 대행 리스크 등 사장님이 조치하지 않으면 불이익이 발생하는 공지
- **정보·기회형 (`tone: "opportunity"`)**: 새 기능, 무료 홍보 효과, AI 도입 등 사장님에게 기회가 되는 공지

---

## ✅ 대본 작성 필수 원칙

- **타겟**: 스마트플레이스를 운영하는 소상공인·자영업자 사장님
- **톤**: 친근하지만 신뢰감 있게. "사장님~" 호칭 적극 활용
- **분량**: 60초 (HOOK 5초 + 문제제기 15초 + 핵심설명 25초 + CTA 15초) 반드시 준수
- **핵심 설명**: 반드시 **3가지 액션 플랜**으로 구성 (첫째/둘째/셋째 구분)
- **모든 섹션**: 🎤 나레이션 / 📸 화면 제안 / 📝 자막 3가지 요소 필수
- **촬영 가이드 & 해시태그**: 공지 성격에 맞게 매번 커스터마이징 (복붙 금지)
- **공지 제목과 릴스 대본 제목**의 "핵심주제"는 반드시 통일
- 공지 1건당 릴스 대본 1건을 **1:1 매칭** (`notice_id` FK로 보장)

---

## ⚠️ 금지 사항

- 중복 제목/해시의 공지·대본은 절대 재등록 금지 (API가 409로 거부함, 재시도하지 말 것)
- 정보 탐색 시 WebSearch 외 다른 도구 사용 금지
- **Notion API 호출 금지** (더 이상 사용하지 않음)
- 릴스 대본 분량이 60초를 크게 벗어나지 않도록 주의
- 핵심 설명 3가지 구조를 2가지 또는 4가지로 임의 변경 금지
- 웹 API 쓰기 요청 시 Bearer 토큰 누락 금지

---

## 📬 결과 전달 방식

- **새 공지가 있을 경우**: 등록한 공지 건수 + 각 대본의 `id`와 수정 URL을 한국어로 깔끔히 정리
  - 대본 수정 URL 포맷: `{NAKU_API_BASE}/scripts/{script.id}`
  - 대시보드 URL: `{NAKU_API_BASE}/`
- **새 공지가 없을 경우**: "새로운 공지사항이 없습니다. (확인 시각: YYYY-MM-DD HH:MM KST)"로 간단히 알림

---

## 🔧 환경변수 (에이전트 실행 환경에 주입되어야 함)

| 변수 | 설명 |
|---|---|
| `NAKU_API_BASE` | 나쿠 콘텐츠연구소 웹사이트 Base URL |
| `NAKU_API_TOKEN` | `POST /api/notices`, `POST /api/scripts` 호출용 Bearer 토큰 (웹사이트 `.env`의 `API_TOKEN`과 동일) |
