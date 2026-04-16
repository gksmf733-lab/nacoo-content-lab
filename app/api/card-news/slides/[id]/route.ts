import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { renderCardHtml, normalizeRole, type CardLayout } from "@/lib/card-html";

// PATCH /api/card-news/slides/[id] -- 개별 카드 수정 (웹 UI, 쿠키)
// 텍스트/레이아웃이 바뀌면 html 필드를 서버에서 즉시 재생성한다.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const { title, body: bodyText, hashtags, layout } = body as {
    title?: string;
    body?: string;
    hashtags?: string[];
    layout?: CardLayout | null;
  };

  // 1) 기존 슬라이드 + 세트 카드 총수 조회
  const existing = (await sql`
    SELECT s.id, s.set_id, s.card_no, s.role, s.title, s.body, s.layout,
           (SELECT card_count FROM card_news_sets WHERE id = s.set_id) AS total
    FROM card_news_slides s WHERE s.id = ${id}
  `) as unknown as Array<{
    id: number;
    set_id: number;
    card_no: number;
    role: string;
    title: string;
    body: string;
    layout: CardLayout | null;
    total: number;
  }>;
  if (existing.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const prev = existing[0];

  // 2) 병합 후 HTML 재생성
  const nextTitle = title ?? prev.title;
  const nextBody = bodyText ?? prev.body;
  const nextLayout: CardLayout = { ...(prev.layout ?? {}), ...(layout ?? {}) };
  const html = renderCardHtml({
    card_no: prev.card_no,
    total: prev.total,
    role: normalizeRole(prev.role),
    title: nextTitle,
    body: nextBody,
    layout: nextLayout,
  });

  // 3) 업데이트
  await sql`
    UPDATE card_news_slides SET
      title = ${nextTitle},
      body = ${nextBody},
      hashtags = COALESCE(${hashtags ?? null}, hashtags),
      layout = ${JSON.stringify(nextLayout)}::jsonb,
      html = ${html}
    WHERE id = ${id}
  `;

  await sql`
    UPDATE card_news_sets SET status = 'draft', updated_at = NOW()
    WHERE id = ${prev.set_id}
  `;

  return NextResponse.json({ ok: true, id, set_id: prev.set_id });
}
