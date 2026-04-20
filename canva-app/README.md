# 나쿠 카드뉴스 Canva App

나쿠 콘텐츠연구소의 카드뉴스 데이터를 Canva 디자인에 편집 가능한 요소로 삽입하는 Canva Apps SDK 플러그인입니다.

---

## 시작하기

### 1. Canva Apps SDK 스타터 킷 클론

```bash
git clone https://github.com/canva-sdks/canva-apps-sdk-starter-kit.git
cd canva-apps-sdk-starter-kit
npm install
```

### 2. 앱 소스 파일 복사

이 `canva-app/src/` 폴더의 파일들을 스타터 킷의 `src/` 폴더에 복사합니다.

```bash
# 스타터 킷 루트에서 실행
cp /path/to/naku/canva-app/src/app.tsx src/app.tsx
cp /path/to/naku/canva-app/src/index.tsx src/index.tsx
```

### 3. 의존성 확인

스타터 킷의 `package.json`에 아래 패키지들이 포함되어 있는지 확인합니다.

```json
{
  "dependencies": {
    "@canva/app-ui-kit": "^5.0.0",
    "@canva/design": "^2.0.0",
    "@canva/asset": "^2.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

없다면 설치:

```bash
npm install @canva/app-ui-kit @canva/design @canva/asset
```

### 4. Canva 개발자 포털에서 앱 등록

1. [canva.dev/apps](https://www.canva.com/developers/apps) 에 접속합니다.
2. **Create an app** 클릭 → 앱 이름: `나쿠 카드뉴스`
3. **App source** 에서 **Development URL** 선택
4. URL: `http://localhost:8080`
5. **Save** 클릭 후 앱 ID를 확인합니다.

### 5. 개발 서버 실행

```bash
# 스타터 킷 루트에서 실행
npm start
```

개발 서버가 `http://localhost:8080`에서 실행됩니다.

### 6. Canva에서 미리보기

1. [canva.com](https://www.canva.com) 에서 새 디자인을 엽니다.
2. 왼쪽 패널 → **Apps** → 방금 만든 **나쿠 카드뉴스** 앱 클릭
3. 카드뉴스 목록이 표시되면 세트를 선택하고 **Canva에 삽입** 버튼을 클릭합니다.

---

## 배포 (프로덕션)

### 빌드

```bash
npm run build
```

### 앱 호스팅

빌드된 `dist/` 폴더를 정적 호스팅 서비스(Vercel, Netlify 등)에 배포합니다.

```bash
# Vercel 예시
cd dist
vercel deploy
```

### 개발자 포털에서 URL 업데이트

1. [canva.dev/apps](https://www.canva.com/developers/apps) 에서 앱 설정 열기
2. **App source URL**을 배포된 URL로 변경
3. Canva에 앱 제출 (심사 후 공개)

---

## API 엔드포인트

이 앱은 나쿠 백엔드의 전용 Canva API를 사용합니다.

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/card-news/canva-list` | 모든 카드뉴스 세트 목록 반환 |
| `GET /api/card-news/canva-list?notice_id=<id>` | 특정 공지의 슬라이드 반환 |

두 엔드포인트 모두 인증 없이 접근 가능하며, CORS 허용 설정이 되어 있습니다.

---

## 카드 디자인 사양

- 크기: 1080 × 1350 px (인스타그램 4:5 비율)
- 배경색: `#F7F5F0` (크림 / CTA 카드는 `#E8572C`)
- 텍스트색: `#1A1A1A` (CTA 카드는 `#FFFFFF`)
- 브랜드: 나쿠 콘텐츠연구소

### 슬라이드 역할(role)

| role | 설명 |
|---|---|
| `hook` | 표지 / 제목 카드 |
| `context` | 배경/맥락 카드 |
| `point` | 핵심 포인트 카드 (여러 장) |
| `cta` | 행동 유도 카드 (마지막) |

---

## 문제 해결

**앱이 로드되지 않는 경우**
- 개발 서버(`npm start`)가 실행 중인지 확인합니다.
- Canva 개발자 포털의 Development URL이 `http://localhost:8080`인지 확인합니다.
- 브라우저 콘솔에서 오류 메시지를 확인합니다.

**카드뉴스 목록이 비어 있는 경우**
- 나쿠 대시보드에서 카드뉴스가 생성되었는지 확인합니다.
- `/api/card-news/canva-list` 엔드포인트를 직접 호출해 데이터가 있는지 확인합니다.

**삽입 실패**
- `@canva/design` 패키지가 올바른 버전으로 설치되었는지 확인합니다.
- `addPage` API가 현재 Canva 플랜에서 지원되는지 확인합니다 (일부 기능은 특정 플랜 필요).
