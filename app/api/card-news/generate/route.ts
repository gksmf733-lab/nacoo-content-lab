import { NextRequest, NextResponse } from "next/server";
import { callClaude, parseJsonFromResponse } from "@/lib/claude-cli.mjs";
import { sql } from "@/lib/db";
import { isAuthed, checkApiToken } from "@/lib/auth";
import { renderCardHtml, normalizeRole } from "@/lib/card-html";

// ── 타입 ──────────────────────────────────────────────
type SlideInput = {
  card_no: number;
  role: "hook" | "context" | "body" | "cta";
  title: string;
  body: string;
  hashtags?: string[];
  layout?: Record<string, unknown>;
};

type ClaudeSlide = {
  card_no: number;
  role: string;
  title: string;
  body: string;
  hashtags?: string[];
  layout?: Record<string, unknown>;
};

// ── Claude 프롬프트 ───────────────────────────────────
function buildPrompt(notice: {
  title: string;
  summary: string | null;
  detail_summary: string | null;
  checklist: string | null;
  category: string | null;
  importance: string | null;
  source_urls: string[] | null;
}, script: { body_markdown: string | null } | null): string {
  const scriptSection = script?.body_markdown
    ? `\n\n## 릴스 대본 (참고용)\n${script.body_markdown}`
    : "";

  const primaryContext = notice.detail_summary ?? notice.summary ?? "없음";

  return `당신은 나쿠(naoo) 콘텐츠연구소의 카드뉴스 전문 카피라이터입니다.
아래 공지 내용을 바탕으로 인스타그램 카드뉴스 6장을 JSON으로 생성하세요.
톤은 친근하고 실용적, 과장 없이 사실 중심. 독자는 네이버 스마트플레이스를 쓰는 자영업자.

## 공지 정보
- 제목: ${notice.title}
- 카테고리: ${notice.category ?? "일반"}
- 중요도: ${notice.importance ?? "보통"}
- 핵심요약(상세):
${primaryContext}
- 핵심 체크리스트: ${notice.summary ?? "없음"}
- 운영자 체크리스트: ${notice.checklist ?? "없음"}
- 참고 링크: ${(notice.source_urls ?? []).join(", ") || "없음"}${scriptSection}

## 카드 구성 규칙 (B 스타일)
1. card_no: 1 / role: "hook"
   - title: 이모지 + 2줄 형태의 강렬한 후킹. 줄바꿈은 \\n 로 연결 (예: "🎓 공짜로 배우고\\n40만원 쿠폰까지")
   - body: 대상 + 마감 같은 핵심 한 줄 (20자 이내)
2. card_no: 2 / role: "context"
   - title: 질문형 ("~가 뭔가요?" / "왜 중요한가요?")
   - body: 3줄 이내로 배경 설명
   - layout.pointText: 한 줄로 요약된 포인트 메시지 (필수)
3. card_no: 3 / role: "body"
   - title: 질문형 ("언제, 어떻게 진행되나요?" 같은 구체 질문)
   - body: 날짜·일정·방식 등 실제 정보 4~5줄
   - layout.pointText: 한 줄 핵심 (필수)
4. card_no: 4 / role: "body"
   - title: 질문형 ("무엇을 배우나요?" / "어떻게 신청하나요?")
   - body: 단계·커리큘럼·방법 4~5줄. 숫자 매기기(1주차/2주차) 또는 · 구분자 사용
   - layout.pointText: 한 줄 핵심 (필수)
5. card_no: 5 / role: "body"
   - title: 혜택·주의사항 요약 ("수료하면 받는 혜택" 등)
   - body: 4~5줄. 혜택 금액·조건은 숫자 그대로
   - layout.pointText: 한 줄 핵심 (필수)
6. card_no: 6 / role: "cta" — ★ 반드시 나쿠 브랜드 고정 CTA ★
   - title: "자세한 정보가 궁금하다면!"
   - body: 아래 3줄 고정 (수정 금지)
     naoo 인스타 팔로우\\n 댓글달기\\n DM창 확인하고 정보 확인하기
   - hashtags: 5~7개, # 포함

## 작성 규칙
- 제목 15자 이내(1번 hook 제외, hook은 2줄 구조)
- 본문 각 줄 짧게, 줄바꿈은 \\n
- 숫자·금액·기간은 공지에 명시된 그대로
- hook 제외한 모든 body 카드는 layout.pointText 필수

## 응답 형식 (JSON만, 설명 없이)
{
  "slides": [
    { "card_no": 1, "role": "hook", "title": "이모지 + 2줄", "body": "대상+마감" },
    { "card_no": 2, "role": "context", "title": "질문?", "body": "...", "layout": { "pointText": "..." } },
    { "card_no": 3, "role": "body", "title": "질문?", "body": "...", "layout": { "pointText": "..." } },
    { "card_no": 4, "role": "body", "title": "질문?", "body": "...", "layout": { "pointText": "..." } },
    { "card_no": 5, "role": "body", "title": "혜택/주의", "body": "...", "layout": { "pointText": "..." } },
    { "card_no": 6, "role": "cta", "title": "자세한 정보가 궁금하다면!", "body": "naoo 인스타 팔로우\\n 댓글달기\\n DM창 확인하고 정보 확인하기", "hashtags": ["#...", "#..."] }
  ]
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

  // 2. 릴스 대본 조회 (있으면 참고용으로 사용)
  const scriptRows = (await sql`
    SELECT body_markdown FROM reels_scripts WHERE notice_id = ${noticeId} LIMIT 1
  `) as unknown as Array<{ body_markdown: string }>;
  const script = scriptRows[0] ?? null;

  // 3. Claude 호출
  let slides: SlideInput[];
  try {
    const prompt = buildPrompt(notice, script);
    const text = await callClaude(prompt);
    const parsed = parseJsonFromResponse(text) as { slides: ClaudeSlide[] };

    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      throw new Error("슬라이드 배열이 비어 있습니다.");
    }

    // 슬라이드 정규화 + HTML 생성
    const total = parsed.slides.length;
    slides = parsed.slides.map((s: ClaudeSlide, idx: number) => {
      const role = normalizeRole(s.role ?? "body");
      const layout = s.layout ?? {};
      const html = renderCardHtml({
        card_no: s.card_no ?? idx + 1,
        total,
        role,
        title: s.title ?? "",
        body: s.body ?? "",
        layout,
      });
      return {
        card_no: s.card_no ?? idx + 1,
        role,
        title: s.title ?? "",
        body: s.body ?? "",
        hashtags: s.hashtags ?? [],
        layout,
        html,
      } as SlideInput & { html: string; layout: Record<string, unknown> };
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Claude 생성 실패: ${message}` },
      { status: 500 }
    );
  }

  // 4. DB 저장 (기존 세트 삭제 후 재생성)
  try {
    await sql`DELETE FROM card_news_sets WHERE notice_id = ${noticeId}`;

    const setRows = (await sql`
      INSERT INTO card_news_sets (notice_id, audience, tone, card_count, status)
      VALUES (${noticeId}, '전체', 'AI생성(Gemini)', ${slides.length}, 'draft')
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    const setId = setRows[0].id;

    for (const s of slides) {
      const sl = s as SlideInput & { html?: string; layout?: Record<string, unknown> };
      await sql`
        INSERT INTO card_news_slides (set_id, card_no, role, title, body, hashtags, html, layout)
        VALUES (
          ${setId}, ${sl.card_no}, ${sl.role}, ${sl.title}, ${sl.body},
          ${sl.hashtags ?? null},
          ${sl.html ?? null},
          ${sl.layout ? JSON.stringify(sl.layout) : null}::jsonb
        )
      `;
    }

    return NextResponse.json(
      { ok: true, set_id: setId, card_count: slides.length },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `DB 저장 실패: ${message}` }, { status: 500 });
  }
}
