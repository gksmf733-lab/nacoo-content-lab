import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { isAuthed, checkApiToken } from "@/lib/auth";
import { getPersona, type Persona } from "@/lib/personas";

type ClaudeScript = {
  title?: string;
  tone?: string;
  body_markdown?: string;
  hashtags?: string[];
};

function buildPrompt(
  notice: {
    title: string;
    summary: string | null;
    checklist: string | null;
    category: string | null;
    importance: string | null;
    source_urls: string[] | null;
  },
  persona: Persona,
  guide: string
): string {
  const guideSection = guide.trim()
    ? `\n\n## 추가 가이드 (최우선 반영)\n${guide.trim()}`
    : "";

  return `${persona.promptBlock}
아래 네이버 스마트플레이스 공지 내용을 바탕으로 인스타그램 릴스 대본(30~60초 분량)을 작성하세요.

## 공지 정보
- 제목: ${notice.title}
- 카테고리: ${notice.category ?? "일반"}
- 중요도: ${notice.importance ?? "보통"}
- 요약: ${notice.summary ?? "없음"}
- 체크리스트: ${notice.checklist ?? "없음"}
- 참고 링크: ${(notice.source_urls ?? []).join(", ") || "없음"}${guideSection}

## 대본 규칙
- 분량: 30~60초 (약 150~250자)
- 구조: 훅(2~3초, 스크롤 멈추게) → 전개(핵심 1~3개) → CTA(행동 촉구)
- 독자: ${persona.audience}
- 어조: ${persona.tone}
- body_markdown은 다음 형식의 마크다운으로 작성:
  ### 🎬 훅
  (한 줄)

  ### 📌 전개
  - 핵심 1
  - 핵심 2
  - 핵심 3

  ### 🚀 CTA
  (한 줄)
- title: 15자 이내, 본문 핵심을 요약
- tone: 마감·제재·경고 성격이면 "urgent", 신규·기회·혜택 성격이면 "opportunity"
- hashtags: 5~7개, # 포함

## 응답 형식 (JSON만, 설명·코드블록 없이)
{
  "title": "...",
  "tone": "urgent" | "opportunity",
  "body_markdown": "...",
  "hashtags": ["#...", "#..."]
}`;
}

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

  const personaId = typeof body.persona_id === "string" ? body.persona_id : null;
  const guide = typeof body.guide === "string" ? body.guide : "";
  const persona = getPersona(personaId);

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

  let parsed: ClaudeScript;
  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(notice, persona, guide);
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Claude 응답에서 JSON을 추출할 수 없습니다.");
      parsed = JSON.parse(match[0]);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Claude 생성 실패: ${message}` }, { status: 500 });
  }

  const title = (parsed.title ?? "").trim() || notice.title.slice(0, 40);
  const tone: "urgent" | "opportunity" =
    parsed.tone === "urgent" ? "urgent" : "opportunity";
  const bodyMarkdown = (parsed.body_markdown ?? "").trim();
  if (!bodyMarkdown) {
    return NextResponse.json({ error: "대본 본문이 비어 있습니다." }, { status: 500 });
  }
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((h) => typeof h === "string")
    : [];

  try {
    const rows = (await sql`
      INSERT INTO reels_scripts (notice_id, title, tone, body_markdown, hashtags, persona_id, guide)
      VALUES (
        ${noticeId}, ${title}, ${tone}, ${bodyMarkdown}, ${hashtags},
        ${persona.id}, ${guide.trim() || null}
      )
      RETURNING id, notice_id, title, tone, persona_id, created_at
    `) as unknown as Array<{
      id: number;
      notice_id: number;
      title: string;
      tone: string;
      persona_id: string | null;
      created_at: string | Date;
    }>;
    return NextResponse.json(
      { ok: true, script: rows[0], persona: persona.id },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `DB 저장 실패: ${message}` }, { status: 500 });
  }
}
