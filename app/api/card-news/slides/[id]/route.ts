import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { renderCardHtml, normalizeRole, type CardLayout } from "@/lib/card-html";
import { renderNacooSlide, type NacooLayout, type NacooRole } from "@/lib/nacoo-card-html";

// PATCH /api/card-news/slides/[id] -- 개별 카드 수정 (웹 UI, 쿠키)
// legacy(6장 hook/context/body/cta): renderCardHtml 로 재생성
// nacoo(7장 thumb/quote/compare/timeline/checklist/insight/cta): renderNacooSlide 로 재생성
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
    layout?: Record<string, unknown> | null;
  };

  // 1) 기존 슬라이드 + 세트(card_count, style) 조회
  const existing = (await sql`
    SELECT s.id, s.set_id, s.card_no, s.role, s.title, s.body, s.layout,
           cs.card_count AS total, cs.style
    FROM card_news_slides s
    JOIN card_news_sets cs ON cs.id = s.set_id
    WHERE s.id = ${id}
  `) as unknown as Array<{
    id: number;
    set_id: number;
    card_no: number;
    role: string;
    title: string;
    body: string;
    layout: Record<string, unknown> | null;
    total: number;
    style: "legacy" | "nacoo" | null;
  }>;
  if (existing.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const prev = existing[0];

  // 2) layout 병합 + HTML 재생성 (스타일별 분기)
  let nextTitle = title ?? prev.title;
  let nextBody = bodyText ?? prev.body;
  let nextLayout = { ...(prev.layout ?? {}), ...(layout ?? {}) };
  let html: string;

  if (prev.style === "nacoo") {
    if (prev.role === "cta") {
      // CTA 는 변경 금지 — 텍스트/레이아웃·title/body 모두 고정값으로 강제 (CTA_고정.md)
      nextTitle = "CTA";
      nextBody = "나쿠 팔로우 후 댓글 남기시면 정보 공유방 링크 보내드려요";
      nextLayout = {};
      html = renderNacooSlide({ role: "cta", data: {} });
    } else {
      const validRoles: NacooRole[] = [
        "thumb", "quote", "compare", "timeline", "checklist", "insight", "cta",
      ];
      if (!validRoles.includes(prev.role as NacooRole)) {
        return NextResponse.json(
          { error: `nacoo 스타일에 알 수 없는 role: ${prev.role}` },
          { status: 400 }
        );
      }
      try {
        html = renderNacooSlide({
          role: prev.role as Exclude<NacooRole, "cta">,
          data: nextLayout as never,
        } as NacooLayout);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `nacoo 렌더 실패: ${message}` },
          { status: 400 }
        );
      }
    }
  } else {
    html = renderCardHtml({
      card_no: prev.card_no,
      total: prev.total,
      role: normalizeRole(prev.role),
      title: nextTitle,
      body: nextBody,
      layout: nextLayout as CardLayout,
    });
  }

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
