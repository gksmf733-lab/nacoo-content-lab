# 나쿠 콘텐츠연구소

네이버 스마트플레이스 공지 모니터링 · 릴스 대본 보관함 웹사이트.

**스택:** Next.js 16 (App Router) · Vercel Postgres (Neon) · Tailwind v4 · Vercel 배포

---

## 구조

```
나쿠/
├─ app/                   # Next.js App Router
│  ├─ page.tsx            # 대시보드 (공지 · 대본 리스트)
│  ├─ login/              # 비밀번호 로그인
│  ├─ scripts/[id]/       # 릴스 대본 수정 페이지
│  └─ api/                # 서버 API
│     ├─ auth/login       # 비밀번호 인증
│     ├─ notices          # GET/POST 공지
│     ├─ scripts          # GET/POST 대본
│     ├─ scripts/[id]     # PATCH/DELETE 대본
│     └─ cron/collect     # Vercel Cron 훅 (09:00/18:00 KST)
├─ lib/
│  ├─ db.ts               # Neon serverless 클라이언트
│  └─ auth.ts             # 쿠키 세션 + Bearer 토큰 검증
├─ middleware.ts          # 비로그인 시 /login 리다이렉트
├─ scripts/
│  ├─ schema.sql          # DB 스키마
│  └─ init-db.mjs         # 스키마 초기화 스크립트
├─ 자동화 지침/CLAUDE.md  # 자동화 에이전트용 지침 (웹 API 기반)
├─ vercel.ts              # Vercel 설정 + Cron 정의
└─ .env.example           # 필요한 환경변수 목록
```

---

## 초기 셋업

### 1. 의존성 설치

```bash
npm install
```

### 2. Vercel 연결 + Postgres 프로비저닝

```bash
npm i -g vercel         # Vercel CLI 설치 (아직 없다면)
vercel link             # 프로젝트 연결
vercel env pull .env.local    # Vercel Postgres 환경변수 로컬 싱크
```

> Vercel 대시보드 → Storage → Create Database → **Neon Postgres (Pro)** 선택.
> 생성 후 프로젝트에 연결하면 `DATABASE_URL` 등이 자동으로 주입됩니다.

### 3. 나머지 환경변수 설정

`.env.local`에 아래 값을 추가:

```env
SITE_PASSWORD=원하는-비밀번호
AUTH_SECRET=openssl rand -hex 32 로 생성한 값
API_TOKEN=자동화용-랜덤-토큰
CRON_SECRET=Vercel-Cron-Secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

프로덕션에도 동일하게 등록:

```bash
vercel env add SITE_PASSWORD
vercel env add AUTH_SECRET
vercel env add API_TOKEN
vercel env add CRON_SECRET
```

### 4. DB 초기화

```bash
npm run db:init
```

### 5. 로컬 실행

```bash
npm run dev
```

http://localhost:3000 → 비밀번호 입력 → 대시보드 확인.

### 6. 배포

```bash
vercel deploy --prod
```

Vercel Cron이 자동으로 `/api/cron/collect`를 매일 09:00 / 18:00 KST에 호출합니다.

---

## 자동화 에이전트 연동

자동화 에이전트 (Claude Code 스케줄드 태스크 등) 는
`자동화 지침/CLAUDE.md`를 읽고, 아래 환경변수로 웹 API를 호출합니다:

```env
NAKU_API_BASE=https://your-project.vercel.app
NAKU_API_TOKEN=위에서 정한 API_TOKEN과 동일
```

에이전트 동작:
1. `GET /api/notices` → 기존 등록 목록 확인
2. WebSearch로 네이버 공지 수집
3. 신규만 필터링
4. `POST /api/notices` → 공지 등록
5. `POST /api/scripts` → 릴스 대본 등록

---

## 주요 기능

- ✅ 비밀번호 로그인 (본인 1인 사용)
- ✅ 공지 자동 수집 결과 조회
- ✅ 릴스 대본 조회 · **수정** · 삭제
- ✅ Vercel Cron 자동 트리거
- ❌ 수동 업로드 폼 (요청에 따라 제외, 자동화로만 등록)

---

## 멀티 플랫폼 공지 수집

대시보드는 아래 8개 채널을 플랫폼별 아코디언으로 통합 표시합니다.

| 플랫폼 | 로그인 | 수집 방식 |
|---|---|---|
| 네이버 스마트플레이스 | ❌ | puppeteer (`scripts/scrapers/smartplace.mjs`) |
| 네이버 검색광고 | ❌ | puppeteer (`searchad.mjs`) |
| 스마트플레이스 공식 블로그 | ❌ | RSS (`naver-blog.mjs`) |
| 네이버 비즈니스 공식 블로그 | ❌ | RSS |
| 네이버 다이어리 | ❌ | RSS |
| 스마트스토어센터 | ✅ | puppeteer + 쿠키 세션 |
| 네이버 예약 파트너센터 | ✅ | puppeteer + 쿠키 세션 |
| 네이버 톡톡 파트너센터 | ✅ | puppeteer + 쿠키 세션 |

### DB 마이그레이션 (기존 프로젝트)

`notices` 테이블에 `platform` 컬럼이 없다면:

```bash
npm run migrate:platform
```

기존 행은 모두 `'smartplace'`로 백필됩니다.

### 로그인 필요 채널 최초 셋업

1. `.env.local`에 아이디/비번 추가:
   ```env
   NAVER_ID=your-naver-id
   NAVER_PW=your-naver-password
   ```
2. **처음 한 번만** 브라우저 창을 띄워 수동 로그인 (2FA/기기등록 요구됨):
   ```bash
   NAVER_HEADLESS=0 npm run cron:collect
   ```
   - "새로운 기기입니다" 화면이 뜨면 이메일/SMS 인증을 완료
   - 콘솔에 "완료 후 Enter ▶" 프롬프트가 뜨면 Enter
3. 성공 시 `data/naver-session.json` 쿠키가 저장됨 → 이후엔 자동 재사용
4. 쿠키 만료(보통 2주~1달) 시 같은 절차로 재발급

### 수집 실행

```bash
# 전체 플랫폼 (쿠키 유효 시 무인 실행)
npm run cron:collect

# 로그인 필요 채널 스킵 (공개 채널만)
node --env-file=.env.local scripts/cron-collect.mjs --skip-login

# 특정 플랫폼만
node --env-file=.env.local scripts/cron-collect.mjs --platforms smartplace,blog_smartplace
```

### 알려진 제약

- 로그인 필요 3개 채널(`smartstore` / `booking` / `talktalk`)의 DOM 셀렉터는 **미확인 상태**로 커밋돼 있습니다. 첫 실행 시 0건이 나오면 `NAVER_HEADLESS=0`으로 실제 페이지를 열어 DOM을 확인하고 `scripts/scrapers/{smartstore,booking,talktalk}.mjs` 의 `page.evaluate` 블록 셀렉터를 조정하세요.
- 네이버는 자동 로그인을 차단하는 추세라 `NAVER_ID`/`NAVER_PW`만으로는 자주 실패합니다. 쿠키 파일 재사용 전제로 설계됐습니다.
