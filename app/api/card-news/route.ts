import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkApiToken, isAuthed } from "@/lib/auth";

// GET /api/card-news?notice_id=123  -- 세트 + 슬라이드 전체 반환
export async function GET(req: NextRequest) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const noticeIdParam = req.nextUrl.searchParams.get("notice_id");
  if (!noticeIdParam) {
    return NextResponse.json({ error: "notice_id is required" }, { status: 400 });
  }
  const noticeId = Number(noticeIdParam);
  if (!Number.isFinite(noticeId)) {
    return NextResponse.json({ error: "notice_id must be a number" }, { status: 400 });
  }

  const setRows = (await sql`
    SELECT id, notice_id, audience, tone, card_count, brief_json,
           status, qa_verdict, qa_issues, created_at, updated_at
    FROM card_news_sets WHERE notice_id = ${noticeId} LIMIT 1
  `) as unknown as Array<{ id: number }>;

  if (setRows.length === 0) {
    return NextResponse.json({ set: null, slides: [] });
  }
  const set = setRows[0];
  const slides = (await sql`
    SELECT id, set_id, card_no, role, title, body, hashtags, html
    FROM card_news_slides WHERE set_id = ${set.id} ORDER BY card_no ASC
  `) as unknown as Array<unknown>;

  return NextResponse.json({ set, slides });
}

// POST /api/card-news  -- 세트 + 슬라이드 일괄 등록 (에이전트 전용, Bearer)
export async function POST(req: NextRequest) {
  if (!checkApiToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    notice_id,
    audience,
    tone,
    brief_json,
    qa_verdict,
    qa_issues,
    status = "draft",
    slides,
  } = body as {
    notice_id: number;
    audience?: string;
    tone?: string;
    brief_json?: unknown;
    qa_verdict?: string;
    qa_issues?: unknown;
    status?: string;
    slides: Array<{
      card_no: number;
      role: string;
      title: string;
      body: string;
      hashtags?: string[];
      html?: string;
    }>;
  };

  if (!notice_id || !Array.isArray(slides) || slides.length === 0) {
    return NextResponse.json({ error: "notice_id and slides[] required" }, { status: 400 });
  }

  const cardCount = slides.length;

  try {
    // 기존 세트가 있으면 삭제 후 재생성 (UNIQUE 제약)
    await sql`DELETE FROM card_news_sets WHERE notice_id = ${notice_id}`;

    const setRows = (await sql`
      INSERT INTO card_news_sets (
        notice_id, audience, tone, card_count, brief_json, status, qa_verdict, qa_issues
      ) VALUES (
        ${notice_id}, ${audience ?? null}, ${tone ?? null}, ${cardCount},
        ${brief_json ? JSON.stringify(brief_json) : null}::jsonb,
        ${status},
        ${qa_verdict ?? null},
        ${qa_issues ? JSON.stringify(qa_issues) : null}::jsonb
      )
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    const setId = setRows[0].id;

    for (const s of slides) {
      await sql`
        INSERT INTO card_news_slides (
          set_id, card_no, role, title, body, hashtags, html
        ) VALUES (
          ${setId}, ${s.card_no}, ${s.role}, ${s.title}, ${s.body},
          ${s.hashtags ?? null}, ${s.html ?? null}
        )
      `;
    }

    return NextResponse.json({ set_id: setId, card_count: cardCount }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
