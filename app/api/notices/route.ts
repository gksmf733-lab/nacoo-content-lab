import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkApiToken, isAuthed } from "@/lib/auth";
import { createHash } from "node:crypto";

// GET /api/notices - 공지 리스트 (웹 UI 또는 자동화가 중복 체크용으로 사용)
export async function GET(req: NextRequest) {
  // 브라우저 세션 또는 Bearer 토큰 허용
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT id, title, title_hash, category, importance, tags, published_at, effective_at,
           deadline, summary, source, created_at
    FROM notices
    ORDER BY COALESCE(published_at, created_at::date) DESC
    LIMIT 200
  `;
  return NextResponse.json({ notices: rows });
}

// POST /api/notices - 신규 공지 등록 (자동화 전용, Bearer 토큰 필수)
export async function POST(req: NextRequest) {
  if (!checkApiToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    category,
    importance,
    tags,
    published_at,
    effective_at,
    deadline,
    summary,
    checklist,
    source_urls,
    source = "auto",
  } = body;

  // tags는 배열이어야 함. '중요'는 importance로 분리 저장하고 tags에는 제외.
  const rawTags: string[] = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string" && t.length > 0) : [];
  const hasImportant = rawTags.includes("중요");
  const cleanTags = rawTags.filter((t) => t !== "중요");
  const finalImportance = importance ?? (hasImportant ? "중요" : null);

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // 제목 기반 해시로 중복 방지
  const title_hash = createHash("sha256").update(title.trim()).digest("hex").slice(0, 32);

  try {
    const rows = await sql`
      INSERT INTO notices (
        title, title_hash, category, importance, tags,
        published_at, effective_at, deadline, summary, checklist, source_urls, source
      ) VALUES (
        ${title}, ${title_hash}, ${category ?? null}, ${finalImportance}, ${cleanTags},
        ${published_at ?? null}, ${effective_at ?? null}, ${deadline ?? null},
        ${summary ?? null}, ${checklist ?? null},
        ${source_urls ?? null}, ${source}
      )
      RETURNING id, title, title_hash
    `;
    return NextResponse.json({ notice: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("unique")) {
      return NextResponse.json({ error: "duplicate", title_hash }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
