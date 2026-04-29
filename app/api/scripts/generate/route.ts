import { NextRequest, NextResponse } from "next/server";
import { callClaude, parseJsonFromResponse } from "@/lib/claude-cli.mjs";
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
    detail_summary: string | null;
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

  const primaryContext = notice.detail_summary ?? notice.summary ?? "없음";

  return `${persona.promptBlock}
아래 네이버 스마트플레이스 공지 내용을 바탕으로 인스타그램 릴스 대본(40~60초, 약 300~500자)을 작성하세요.

## 공지 정보
- 제목: ${notice.title}
- 카테고리: ${notice.category ?? "일반"}
- 중요도: ${notice.importance ?? "보통"}
- 핵심요약(상세):
${primaryContext}
- 핵심 체크리스트: ${notice.summary ?? "없음"}
- 운영자 체크리스트: ${notice.checklist ?? "없음"}
- 참고 링크: ${(notice.source_urls ?? []).join(", ") || "없음"}${guideSection}

## 대본 구조 (반드시 이 5단 + 시간 코드 유지)
1. \`## 도입부 (0~3초)\` — 사장님에게 건네는 한 줄 질문형 훅. 큰따옴표로 감싸기.
2. \`## 문제 제기 (3~8초)\` — 공감대를 형성하는 2~3문장. 현재 겪고 있을 법한 아쉬움을 짚어주기.
3. \`## 기회 제시 (8~25초)\` — 공지가 무엇인지, 어떻게 해결해 주는지 구체적으로. 필요 시 단계별 불릿 사용.
4. \`## 핵심 혜택 (25~40초)\` — 강조할 포인트·혜택·조건. 반드시 **굵게** + 불릿(- 로 시작)로 가독성 높이기.
5. \`## CTA (40~50초)\` — 행동 유도, 마감일/신청 경로 명시.

위 5단이 끝난 뒤, 마지막에 \`## 해시태그\` 섹션을 추가하고 #태그들을 한 줄로 나열.

## 작성 규칙
- 독자: ${persona.audience}
- 어조: ${persona.tone}
- 각 섹션은 2~4문장(핵심 혜택은 불릿 3~4개)
- 숫자·금액·기간은 공지에 명시된 그대로 사용
- 굵게(**...**)는 금액·날짜·중요 키워드에만
- title: 15자 이내. 사장님 호기심 자극하는 한 문장
- tone: 마감·제재·경고성이면 "urgent", 신규·기회·혜택성이면 "opportunity"
- hashtags JSON 배열: 5~7개, # 포함 (body_markdown의 해시태그 섹션과 별도)

## 응답 형식 (JSON만, 설명·코드블록 없이)
{
  "title": "...",
  "tone": "urgent" | "opportunity",
  "body_markdown": "## 도입부 (0~3초)\\n...\\n\\n## 문제 제기 (3~8초)\\n...\\n\\n## 기회 제시 (8~25초)\\n...\\n\\n## 핵심 혜택 (25~40초)\\n...\\n\\n## CTA (40~50초)\\n...\\n\\n## 해시태그\\n#... #...",
  "hashtags": ["#...", "#..."]
}`;
}

export async function POST(req: NextRequest) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    SELECT id, title, category, importance, summary, detail_summary, checklist, source_urls
    FROM notices WHERE id = ${noticeId} LIMIT 1
  `) as unknown as Array<{
    id: number;
    title: string;
    category: string | null;
    importance: string | null;
    summary: string | null;
    detail_summary: string | null;
    checklist: string | null;
    source_urls: string[] | null;
  }>;

  if (noticeRows.length === 0) {
    return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  }
  const notice = noticeRows[0];

  let parsed: ClaudeScript;
  try {
    const prompt = buildPrompt(notice, persona, guide);
    const text = await callClaude(prompt);
    parsed = parseJsonFromResponse(text);
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
