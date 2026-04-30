import { NextRequest, NextResponse } from "next/server";
import { callClaude, parseJsonFromResponse } from "@/lib/claude-cli.mjs";
import { sql } from "@/lib/db";
import { isAuthed, checkApiToken } from "@/lib/auth";
import { buildNacooSlideRows, type NacooBriefJson } from "@/lib/nacoo-card-html";

// ── Claude 프롬프트 (NACOO 7장 양식) ───────────────────
function buildPrompt(notice: {
  title: string;
  summary: string | null;
  detail_summary: string | null;
  checklist: string | null;
  category: string | null;
  importance: string | null;
  source_urls: string[] | null;
}): string {
  const primaryContext = notice.detail_summary ?? notice.summary ?? "없음";

  return `당신은 @nacoo_ceo (나쿠의 네이버 마케팅 연구소) 인스타그램 카드뉴스 카피라이터입니다.
브랜드 톤은 **단호·진단형, 전문가 포지셔닝** — 친근·공감 톤이 아닙니다.
독자는 자영업자 / 플레이스 마케터 / 네이버 마케팅 입문자.

## 공지 정보
- 제목: ${notice.title}
- 카테고리: ${notice.category ?? "일반"}
- 중요도: ${notice.importance ?? "보통"}
- 핵심요약(상세):
${primaryContext}
- 핵심 체크리스트: ${notice.summary ?? "없음"}
- 운영자 체크리스트: ${notice.checklist ?? "없음"}
- 참고 링크: ${(notice.source_urls ?? []).join(", ") || "없음"}

## 7장 카드 구성 (고정 순서)

### 1. thumb (썸네일)
- titleLines: 정확히 4줄 배열. 각 줄 한국어 ≤13자. 임팩트 있는 단언/요약.
- emphasisIndex: 골든 강조 들어갈 줄 번호 (0~3, 보통 2 — 핵심 키워드)
- lightIndex: 연회색 처리할 줄 번호 (0~3, 보통 1 — 분위기 라벨)
- titleSize: 4줄이 짧으면 120, 길면 104, 더 길면 92
- subLine1, subLine2Prefix, subHighlight, subSuffix: 서브 한 문장을 4조각으로 나눠서. 강조 키워드 1곳만 subHighlight 로 분리.

### 2. quote (핵심 요약)
- label: "핵심 요약" (또는 "이슈" / "문제" 중 적절한 것)
- quoteLine1, quoteHighlight: 큰 인용문을 두 조각으로. 후자가 골든 강조.
- items: 정확히 3개. {title: 핵심 단어 ≤8자, desc: 한 줄 설명 ≤30자}
- conclusion: 결론 한 줄 (선택)

### 3. compare (안내 / 진단)
- label: "안내" (정보 전달형) 또는 "진단" (잘못된 방식 vs 올바른 방식)
- headLine1, headHighlight, headSuffix: 헤드라인 분할. headHighlight 는 underline-gold.
- rows: 정확히 4개. 각 {tag: 짧은 태그(2~4자), text: 본문(≤25자), type: "right" or "wrong"}
  - 안내형: 모두 type="right"
  - 진단형: 잘못 2개("wrong") + 올바름 2개("right")
- verdictLine1, verdictBold, verdictSuffix: 결론 박스 — verdictBold 는 골든 강조.

### 4. timeline (방법 / 절차)
- label: "절차" / "방법" / "대상" 중 택1
- headLine1, headHighlight: 헤드라인 분할. headHighlight 가 골든.
- steps: 4~5개. 각 {time: STEP/CONDITION/시점 라벨(예 "STEP 01 · 사전 확인"), title: ≤18자, desc: ≤40자}

### 5. checklist (체크리스트 / FAQ)
- label: "체크리스트" 또는 "자주 묻는 질문"
- captureTag: "캡처해서 매장에 적용" 또는 "캡처해서 보관하세요"
- head: 헤드라인 (≤25자)
- headSub: 부제 (선택)
- checks: 5개 (최대 7개). 각 {title: 핵심(≤25자), dim: 부가설명(≤40자, 선택)}

### 6. insight (인사이트 — 골든 배경 KEY)
- label: "인사이트" (고정 권장)
- keyStamp: "본질" / "정리" / "핵심" 중 택1
- headPrefix, headHighlight, headSuffix: 본질 헤드라인 분할. headHighlight 는 cream(흰크림) 강조.
- headLine2: 두 번째 줄 (선택)
- points: 정확히 4개. 각 {title: ≤14자, desc: ≤40자}

### 7. cta — 자동 생성 (출력에서 제외!) — 시스템이 고정 텍스트 사용

## 절대 규칙
- 컬러 이모지(📌💡🔥 등) 절대 금지
- 모든 텍스트는 공지에 명시된 사실만 사용. 없는 정보 창작 금지.
- 숫자·금액·기간·메뉴 경로는 공지에 적힌 그대로
- 톤: "리뷰 100개 있어도 안 뜹니다" / "대부분 모르는 진짜 이유" 같이 단언·진단형
- 피할 단어: "대박", "꿀팁", "혜자", "완전", "5분 만에", "초간단"
- 헤드라인 한 줄 ≤13자, 항목 제목 ≤18자, 본문 ≤35자

## 응답 형식 — JSON 만, 코드블록·설명 없이
{
  "thumb": { "titleLines": ["","","",""], "emphasisIndex": 2, "lightIndex": 1, "titleSize": 104, "subLine1": "", "subLine2Prefix": "", "subHighlight": "", "subSuffix": "" },
  "quote": { "label": "핵심 요약", "quoteLine1": "", "quoteHighlight": "", "items": [{"title":"","desc":""},{"title":"","desc":""},{"title":"","desc":""}], "conclusion": "" },
  "compare": { "label": "안내", "headLine1": "", "headHighlight": "", "headSuffix": "", "rows": [{"tag":"","text":"","type":"right"}], "verdictLine1": "", "verdictBold": "", "verdictSuffix": "" },
  "timeline": { "label": "절차", "headLine1": "", "headHighlight": "", "steps": [{"time":"","title":"","desc":""}] },
  "checklist": { "label": "체크리스트", "captureTag": "", "head": "", "headSub": "", "checks": [{"title":"","dim":""}] },
  "insight": { "label": "인사이트", "keyStamp": "본질", "headPrefix": "", "headHighlight": "", "headSuffix": "", "headLine2": "", "points": [{"title":"","desc":""}] }
}`;
}

// ── POST /api/card-news/generate ──────────────────────
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "카드뉴스 생성은 로컬 dev 환경 전용입니다 (Claude Code CLI 의존)." },
      { status: 400 }
    );
  }

  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const noticeId = Number(body.notice_id);
  if (!Number.isFinite(noticeId)) {
    return NextResponse.json({ error: "notice_id가 필요합니다." }, { status: 400 });
  }

  // 1. 공지 조회
  const noticeRows = (await sql`
    SELECT id, title, category, importance, summary, detail_summary, checklist, source_urls
    FROM notices WHERE id = ${noticeId} LIMIT 1
  `) as unknown as Array<{
    id: number;
    title: string;
    category: string | null;
    importance: string | null;
    summary: string | null;
    detail_summary: string | null;
    checklist: string | null;
    source_urls: string[] | null;
  }>;

  if (noticeRows.length === 0) {
    return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  }
  const notice = noticeRows[0];

  // 2. Claude 호출 → NACOO 7장 brief JSON
  let slides: ReturnType<typeof buildNacooSlideRows>;
  try {
    const prompt = buildPrompt(notice);
    const text = await callClaude(prompt);
    const brief = parseJsonFromResponse(text) as NacooBriefJson;

    // 최소 검증 — 필수 키 존재
    for (const key of ["thumb", "quote", "compare", "timeline", "checklist", "insight"] as const) {
      if (!brief[key]) throw new Error(`brief.${key} 누락`);
    }
    slides = buildNacooSlideRows(brief);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Claude 생성 실패: ${message}` },
      { status: 500 }
    );
  }

  // 3. DB 저장 (기존 세트 삭제 후 재생성)
  try {
    await sql`DELETE FROM card_news_sets WHERE notice_id = ${noticeId}`;

    const setRows = (await sql`
      INSERT INTO card_news_sets (notice_id, audience, tone, card_count, status, style)
      VALUES (${noticeId}, '@nacoo_ceo', 'NACOO 7장', ${slides.length}, 'draft', 'nacoo')
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    const setId = setRows[0].id;

    for (const s of slides) {
      await sql`
        INSERT INTO card_news_slides (set_id, card_no, role, title, body, html, layout)
        VALUES (
          ${setId}, ${s.card_no}, ${s.role}, ${s.title}, ${s.body},
          ${s.html},
          ${JSON.stringify(s.layout)}::jsonb
        )
      `;
    }

    return NextResponse.json(
      { ok: true, set_id: setId, card_count: slides.length, style: "nacoo" },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `DB 저장 실패: ${message}` }, { status: 500 });
  }
}
