import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthed, checkApiToken } from "@/lib/auth";

// Puppeteer는 거대한 의존성이라 Next.js 번들러가 분석하지 않도록 동적 import
// (이 라우트는 로컬 dev 서버 전용. Vercel Functions에서는 @sparticuz/chromium 필요)
export const runtime = "nodejs";
export const maxDuration = 300;

const VIEWPORT = { width: 1080, height: 1350, deviceScaleFactor: 2 };
const JPEG_QUALITY = 92;

/** Windows/유닉스 모두에서 안전한 파일명 */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

// POST /api/card-news/[set_id]/save
// 카드뉴스 ZIP (JPEG 6장 + spec.json)을 HTTP body로 반환
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ set_id: string }> },
) {
  const authed =
    (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { set_id } = await ctx.params;
  const setId = Number(set_id);
  if (!Number.isFinite(setId) || setId <= 0) {
    return NextResponse.json({ error: "invalid set_id" }, { status: 400 });
  }

  // 1. 세트 + 공지 제목 조회
  const setRows = (await sql`
    SELECT s.id AS set_id, s.notice_id, n.title
    FROM card_news_sets s JOIN notices n ON n.id = s.notice_id
    WHERE s.id = ${setId} LIMIT 1
  `) as unknown as Array<{ set_id: number; notice_id: number; title: string }>;
  if (setRows.length === 0) {
    return NextResponse.json({ error: "세트를 찾을 수 없습니다." }, { status: 404 });
  }
  const setRow = setRows[0];

  const slides = (await sql`
    SELECT card_no, html FROM card_news_slides
    WHERE set_id = ${setId} ORDER BY card_no ASC
  `) as unknown as Array<{ card_no: number; html: string | null }>;
  const valid = slides.filter((s) => s.html);
  if (valid.length === 0) {
    return NextResponse.json({ error: "저장할 슬라이드가 없습니다." }, { status: 404 });
  }

  // 2. Puppeteer 렌더 → JSZip (동적 import로 번들러 분석 회피)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let JSZipCtor: any;
  try {
    puppeteer = (await import("puppeteer")).default;
    JSZipCtor = (await import("jszip")).default;
  } catch (err: unknown) {
    const m = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `puppeteer/jszip 로드 실패: ${m}` },
      { status: 500 },
    );
  }

  const safeTitle = safeName(setRow.title);
  const zip = new JSZipCtor();

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    for (const s of valid) {
      await page.setContent(s.html as string, { waitUntil: "networkidle0" });
      // 웹폰트(Pretendard) 완전 로드 대기
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });
      // 추가 안정화 (그라디언트/이미지)
      await new Promise((r) => setTimeout(r, 200));

      const shot = (await page.screenshot({
        type: "jpeg",
        quality: JPEG_QUALITY,
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
        omitBackground: false,
      })) as Buffer;

      zip.file(`${safeTitle}-${s.card_no}.jpg`, shot);
    }

    await page.close();
  } catch (err: unknown) {
    await browser.close();
    const m = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `렌더 실패: ${m}` }, { status: 500 });
  }
  await browser.close();

  // 3. spec.json
  zip.file(
    "spec.json",
    JSON.stringify(
      {
        set_id: setRow.set_id,
        notice_id: setRow.notice_id,
        title: setRow.title,
        saved_at: new Date().toISOString(),
        cards: valid.map((s) => ({
          n: s.card_no,
          file: `${safeTitle}-${s.card_no}.jpg`,
        })),
      },
      null,
      2,
    ),
  );

  // 4. ZIP buffer → HTTP response (binary)
  const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  const filename = `${safeTitle}.zip`;
  const encoded = encodeURIComponent(filename);
  // 한글 파일명: RFC 5987 (filename*)로 UTF-8 전달 + ASCII fallback
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="cards.zip"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
