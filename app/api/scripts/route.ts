import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkApiToken, isAuthed } from "@/lib/auth";

// GET /api/scripts - 릴스 대본 리스트
export async function GET(req: NextRequest) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT s.id, s.notice_id, s.title, s.tone, s.hashtags,
           s.created_at, s.updated_at,
           n.title AS notice_title, n.published_at
    FROM reels_scripts s
    JOIN notices n ON n.id = s.notice_id
    ORDER BY s.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ scripts: rows });
}

// POST /api/scripts - 신규 릴스 대본 등록 (자동화 전용)
export async function POST(req: NextRequest) {
  if (!checkApiToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { notice_id, title, tone, body_markdown, hashtags } = body;

  if (!notice_id || !title || !tone || !body_markdown) {
    return NextResponse.json(
      { error: "notice_id, title, tone, body_markdown are required" },
      { status: 400 }
    );
  }
  if (tone !== "urgent" && tone !== "opportunity") {
    return NextResponse.json({ error: "tone must be 'urgent' or 'opportunity'" }, { status: 400 });
  }

  try {
    const rows = await sql`
      INSERT INTO reels_scripts (notice_id, title, tone, body_markdown, hashtags)
      VALUES (${notice_id}, ${title}, ${tone}, ${body_markdown}, ${hashtags ?? null})
      RETURNING id, notice_id, title
    `;
    return NextResponse.json({ script: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("unique")) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
