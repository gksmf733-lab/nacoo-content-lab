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
