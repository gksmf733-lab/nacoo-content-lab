import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthed } from "@/lib/auth";

// DELETE /api/card-news/[set_id] -- 웹 UI에서 세트 통째로 삭제 (쿠키)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ set_id: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { set_id } = await params;
  const id = Number(set_id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await sql`DELETE FROM card_news_sets WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
