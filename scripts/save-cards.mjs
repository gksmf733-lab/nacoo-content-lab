// 카드뉴스 로컬 저장 CLI
// 사용: npm run save:cards -- <set_id>
//       npm run save:cards -- --notice <notice_id>
//       npm run save:cards -- --all
//
// DB의 card_news_slides.html을 읽어 "카드뉴스/{공지명} 카드뉴스/" 폴더에
// card-N.jpg로 저장한다. HTML 원본은 렌더 직후 삭제된다.

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { neon } from "@neondatabase/serverless";
import puppeteer from "puppeteer";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. (.env.local 로드 필요)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const ROOT = path.resolve("카드뉴스");
const VIEWPORT = { width: 1080, height: 1350, deviceScaleFactor: 2 };
const JPEG_QUALITY = 92;

/** 파일시스템에 안전한 이름 (Windows 금지 문자 교체) */
function safeFolder(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSetsFromArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help") {
    console.error(
      "사용법:\n  npm run save:cards -- <set_id>\n  npm run save:cards -- --notice <notice_id>\n  npm run save:cards -- --all"
    );
    process.exit(1);
  }

  if (args[0] === "--all") {
    return await sql`
      SELECT s.id AS set_id, s.notice_id, n.title
      FROM card_news_sets s JOIN notices n ON n.id = s.notice_id
      ORDER BY s.id
    `;
  }
  if (args[0] === "--notice") {
    const nid = Number(args[1]);
    return await sql`
      SELECT s.id AS set_id, s.notice_id, n.title
      FROM card_news_sets s JOIN notices n ON n.id = s.notice_id
      WHERE s.notice_id = ${nid}
    `;
  }
  const setId = Number(args[0]);
  return await sql`
    SELECT s.id AS set_id, s.notice_id, n.title
    FROM card_news_sets s JOIN notices n ON n.id = s.notice_id
    WHERE s.id = ${setId}
  `;
}

async function renderSet(browser, setRow) {
  const slides = await sql`
    SELECT card_no, html FROM card_news_slides
    WHERE set_id = ${setRow.set_id} ORDER BY card_no ASC
  `;
  if (slides.length === 0) {
    console.log(`✗ set ${setRow.set_id}: 슬라이드 없음`);
    return;
  }

  const safeTitle = safeFolder(setRow.title);
  const folderPath = path.join(ROOT, safeTitle);
  fs.mkdirSync(folderPath, { recursive: true });

  // 1) HTML 파일 쓰기 (임시) — 파일명 = 제목
  const htmlPaths = [];
  for (const s of slides) {
    if (!s.html) {
      console.log(`  ! ${s.card_no}: html 비어있음, 건너뜀`);
      continue;
    }
    const p = path.join(folderPath, `${safeTitle}-${s.card_no}.html`);
    fs.writeFileSync(p, s.html, "utf8");
    htmlPaths.push(p);
  }

  // 2) JPG 렌더
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  for (const p of htmlPaths) {
    const jpg = p.replace(/\.html$/i, ".jpg");
    await page.goto(pathToFileURL(p).href, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({
      path: jpg,
      type: "jpeg",
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });
    console.log(`  ✓ ${path.relative(process.cwd(), jpg)}`);
    fs.unlinkSync(p);
  }
  await page.close();

  // 3) spec.json
  const specPath = path.join(folderPath, "spec.json");
  fs.writeFileSync(
    specPath,
    JSON.stringify(
      {
        set_id: setRow.set_id,
        notice_id: setRow.notice_id,
        title: setRow.title,
        saved_at: new Date().toISOString(),
        cards: slides.map((s) => ({ n: s.card_no, file: `${safeTitle}-${s.card_no}.jpg` })),
      },
      null,
      2
    ),
    "utf8"
  );
}

async function main() {
  const sets = await fetchSetsFromArgs(process.argv);
  if (sets.length === 0) {
    console.log("대상 세트가 없습니다.");
    return;
  }
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await puppeteer.launch({ headless: "new" });
  try {
    for (const s of sets) {
      console.log(`\n▶ set ${s.set_id} — ${s.title}`);
      await renderSet(browser, s);
    }
  } finally {
    await browser.close();
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
