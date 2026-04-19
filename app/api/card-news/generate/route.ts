import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
  checklist: string | null;
  category: string | null;
  importance: string | null;
  source_urls: string[] | null;
}, script: { body_markdown: string | null } | null): string {
  const scriptSection = script?.body_markdown
    ? `\n\n## 릴스 대본 (참고용)\n${script.body_markdown}`
    : "";

  return `당신은 네이버 스마트플레이스 자영업자를 위한 카드뉴스 전문 카피라이터입니다.
아래 공지 내용을 바탕으로 인스타그램 카드뉴스 6장을 JSON으로 생성하세요.

## 공지 정보
- 제목: ${notice.title}
- 카테고리: ${notice.category ?? "일반"}
- 중요도: ${notice.importance ?? "보통"}
- 요약: ${notice.summary ?? "없음"}
- 체크리스트: ${notice.checklist ?? "없음"}
- 참고 링크: ${(notice.source_urls ?? []).join(", ") || "없음"}${scriptSection}

## 카드 구성 규칙
1. card_no: 1 → role: "hook" — 강렬한 후킹 제목 (이모지 포함), 서브 카피
2. card_no: 2 → role: "context" — 왜 중요한지 배경 설명
3. card_no: 3 → role: "body" — 핵심 정보 1 (구체적 내용)
4. card_no: 4 → role: "body" — 핵심 정보 2 (실행 방법)
5. card_no: 5 → role: "body" — 핵심 정보 3 (주의사항 또는 팁)
6. card_no: 6 → role: "cta" — 행동 촉구 (①②③ 형식의 3단계 행동)

## 작성 규칙
- 독자: 네이버 스마트플레이스를 쓰는 자영업자
- 어조: 친근하고 실용적, 과장 없이 사실 중심
- 제목: 15자 이내, 핵심만
- 본문(body): 4~6줄, 줄바꿈은 \\n 사용
- hook의 body: 서브 카피 한 줄 (20자 이내)
- cta의 body: "① 행동1\\n② 행동2\\n③ 행동3" 형식
- body/context 카드 중 중요한 것에는 layout.pointText 추가 (한 줄 핵심 메시지)
- hashtags: card_no 6(cta)에만 5~7개, # 포함

## 응답 형식 (JSON만, 설명 없이)
{
  "slides": [
    {
      "card_no": 1,
      "role": "hook",
      "title": "...",
      "body": "...",
      "hashtags": []
    },
    {
      "card_no": 2,
      "role": "context",
      "title": "...",
      "body": "...",
      "layout": { "pointText": "..." }
    },
    ...
  ]
}`;
}

// ── POST /api/card-news/generate ──────────────────────
export async function POST(req: NextRequest) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await req.json();
  const noticeId = Number(body.notice_id);
  if (!Number.isFinite(noticeId)) {
    return NextResponse.json({ error: "notice_id가 필요합니다." }, { status: 400 });
  }

  // 1. 공지 조회
  const noticeRows = (await sql`
    SELECT id, title, category, importance, summary, checklist, source_urls
    FROM notices WHERE id = ${noticeId} LIMIT 1
  `) as unknown as Array<{
    id: number;
    title: string;
    category: string | null;
    importance: string | null;
    summary: string | null;
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
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(notice, script);
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // JSON 파싱 (코드블록 래핑 대비)
    let parsed: { slides: ClaudeSlide[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Claude 응답에서 JSON을 추출할 수 없습니다.");
      parsed = JSON.parse(match[0]);
    }

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
      { error: `Gemini 생성 실패: ${message}` },
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
