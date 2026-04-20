import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthed, checkApiToken } from "@/lib/auth";

// POST /api/notices/delete - 공지 여러 건 삭제
// body: { ids: number[] }
// ON DELETE CASCADE 로 연관된 reels_scripts, card_news_sets, card_news_slides 도 함께 삭제된다.
export async function POST(req: NextRequest) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const raw = (body as { ids?: unknown })?.ids;
  const ids = Array.isArray(raw)
    ? raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids 배열이 비어 있습니다." }, { status: 400 });
  }

  try {
    const rows = (await sql`
      DELETE FROM notices WHERE id = ANY(${ids}::int[])
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    return NextResponse.json({ ok: true, deleted: rows.length, ids: rows.map((r) => r.id) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
