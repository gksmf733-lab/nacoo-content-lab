// 카드뉴스 폴더의 card-*.html을 card-*.jpg로 렌더한다.
// 사용: node scripts/render-cards.mjs "카드뉴스/{폴더명}"
//       node scripts/render-cards.mjs --all    (카드뉴스 디렉터리 전체)

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import puppeteer from "puppeteer";

const ROOT = path.resolve("카드뉴스");
const VIEWPORT = { width: 1080, height: 1350, deviceScaleFactor: 2 };
const JPEG_QUALITY = 92;

async function renderFolder(folder, browser) {
  const abs = path.resolve(folder);
  if (!fs.existsSync(abs)) {
    console.error(`폴더 없음: ${abs}`);
    return;
  }
  const htmlFiles = fs
    .readdirSync(abs)
    .filter((f) => /^card-\d+\.html$/i.test(f))
    .sort();
  if (htmlFiles.length === 0) {
    console.log(`${folder}: HTML 없음, 건너뜀`);
    return;
  }

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  for (const file of htmlFiles) {
    const htmlPath = path.join(abs, file);
    const jpgPath = htmlPath.replace(/\.html$/i, ".jpg");
    const url = pathToFileURL(htmlPath).href;
    await page.goto(url, { waitUntil: "networkidle0" });
    // 웹폰트가 네트워크 idle 이후에도 여유 필요 → 짧게 대기
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({
      path: jpgPath,
      type: "jpeg",
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
    });
    console.log(`✓ ${path.relative(process.cwd(), jpgPath)}`);
    // html 원본은 제거 (사용자 요청: 로컬은 .jpg만 유지)
    fs.unlinkSync(htmlPath);
  }

  await page.close();
}

async function main() {
  const arg = process.argv[2];
  const targets = [];

  if (!arg) {
    console.error('사용법: node scripts/render-cards.mjs "카드뉴스/{폴더명}" | --all');
    process.exit(1);
  }

  if (arg === "--all") {
    if (!fs.existsSync(ROOT)) {
      console.error(`카드뉴스 루트 없음: ${ROOT}`);
      process.exit(1);
    }
    for (const name of fs.readdirSync(ROOT)) {
      const sub = path.join(ROOT, name);
      if (fs.statSync(sub).isDirectory()) targets.push(sub);
    }
  } else {
    targets.push(arg);
  }

  const browser = await puppeteer.launch({ headless: "new" });
  try {
    for (const t of targets) {
      console.log(`\n▶ ${t}`);
      await renderFolder(t, browser);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
