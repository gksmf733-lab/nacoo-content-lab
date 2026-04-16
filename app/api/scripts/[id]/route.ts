import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkApiToken, isAuthed } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/scripts/:id
export async function GET(req: NextRequest, { params }: Params) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await sql`
    SELECT s.*, n.title AS notice_title, n.published_at
    FROM reels_scripts s
    JOIN notices n ON n.id = s.notice_id
    WHERE s.id = ${Number(id)}
  `;
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ script: rows[0] });
}

// PATCH /api/scripts/:id - 대본 수정 (웹 UI 전용)
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const { title, tone, body_markdown, hashtags } = body;

  const rows = await sql`
    UPDATE reels_scripts
    SET title = COALESCE(${title ?? null}, title),
        tone = COALESCE(${tone ?? null}, tone),
        body_markdown = COALESCE(${body_markdown ?? null}, body_markdown),
        hashtags = COALESCE(${hashtags ?? null}, hashtags),
        updated_at = NOW()
    WHERE id = ${Number(id)}
    RETURNING id, title, tone, updated_at
  `;
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ script: rows[0] });
}

// DELETE /api/scripts/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await sql`DELETE FROM reels_scripts WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
