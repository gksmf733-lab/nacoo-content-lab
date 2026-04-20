import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// CORS headers for Canva Apps SDK (runs on different origin)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// OPTIONS /api/card-news/canva-list  -- preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/card-news/canva-list
//   without notice_id  → returns all card news sets with notice titles
//   with notice_id     → returns slides for that notice
export async function GET(req: NextRequest) {
  const noticeIdParam = req.nextUrl.searchParams.get("notice_id");

  try {
    // --- Slide list for a specific notice ---
    if (noticeIdParam !== null) {
      const noticeId = Number(noticeIdParam);
      if (!Number.isFinite(noticeId)) {
        return NextResponse.json(
          { error: "notice_id must be a number" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const setRows = (await sql`
        SELECT id, notice_id, audience, tone, card_count, qa_verdict
        FROM card_news_sets
        WHERE notice_id = ${noticeId}
        LIMIT 1
      `) as unknown as Array<{
        id: number;
        notice_id: number;
        audience: string | null;
        tone: string | null;
        card_count: number;
        qa_verdict: string | null;
      }>;

      if (setRows.length === 0) {
        return NextResponse.json(
          { set: null, slides: [] },
          { headers: CORS_HEADERS }
        );
      }

      const set = setRows[0];
      const slides = (await sql`
        SELECT id, set_id, card_no, role, title, body, hashtags, html, layout
        FROM card_news_slides
        WHERE set_id = ${set.id}
        ORDER BY card_no ASC
      `) as unknown as Array<unknown>;

      return NextResponse.json({ set, slides }, { headers: CORS_HEADERS });
    }

    // --- All card news sets with notice titles ---
    const sets = (await sql`
      SELECT
        cns.id          AS set_id,
        cns.notice_id,
        sn.title        AS notice_title,
        cns.audience,
        cns.tone,
        cns.card_count,
        cns.qa_verdict
      FROM card_news_sets cns
      LEFT JOIN notices sn ON sn.id = cns.notice_id
      ORDER BY cns.created_at DESC
    `) as unknown as Array<{
      set_id: number;
      notice_id: number;
      notice_title: string | null;
      audience: string | null;
      tone: string | null;
      card_count: number;
      qa_verdict: string | null;
    }>;

    return NextResponse.json({ sets }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
