// 로컬 크론 수집 스크립트
// - 스크레이프 → Claude 가공 → Neon DB INSERT (title_hash 중복 skip)
// - 호출: node --env-file=.env.local scripts/cron-collect.mjs [--recent 30] [--reprocess]
// - --reprocess: 기존 DB 중 summary/checklist/effective_at이 비어 있는 행을 다시 가공·UPDATE

import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";
import { scrapeNotices } from "./scrape-notices.mjs";
import { callClaude, parseJsonFromResponse } from "../lib/claude-cli.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. (--env-file=.env.local 확인)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// 명령줄 파싱
const args = process.argv.slice(2);
let recentDays = 30;
const recentIdx = args.indexOf("--recent");
if (recentIdx !== -1 && args[recentIdx + 1]) recentDays = Number(args[recentIdx + 1]);
const reprocessMode = args.includes("--reprocess");

function kstIsoNow() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("Z", "+09:00");
}

function safeDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ── Claude 가공 ──
// 출력:
//  - summary: 핵심 체크리스트 (번호 목록 3~7개)
//  - detail_summary: 상세 장문 요약 (대본/카드 생성의 주 입력)
//  - checklist: 운영자 액션 체크리스트 ("- [ ] 항목" 3~5개)
//  - effective_at / deadline / importance
async function enrichWithClaude({ title, date, content, tags }) {
  const prompt = `네이버 스마트플레이스 공지 원문을 자영업자 관점에서 정리해줘. JSON만 응답해 (설명·코드블록 없이).

## 공지
제목: ${title}
발표일: ${date || "미상"}
태그: ${(tags ?? []).join(", ") || "없음"}
본문:
${(content || "").slice(0, 3000)}

## 출력 JSON
{
  "summary": "핵심 체크리스트. 번호 목록 형식. 각 줄은 '1. 항목' '2. 항목'... 형식. 3~7개. 문장 짧게. 줄바꿈은 \\n 으로 연결.",
  "detail_summary": "공지 전체를 상세하고 꼼꼼하게 다시 쓴 요약. 빠뜨린 정보 없게 모든 중요한 내용(대상·조건·금액·기간·신청 방법·혜택·주의사항 등) 포함. 문단 3~6개, 각 문단 2~4문장. 줄바꿈은 \\n\\n.",
  "checklist": "운영자 액션. '- [ ] 항목' 형식 줄바꿈으로 3~5개. 실행 가능한 구체 행동.",
  "effective_at": "YYYY-MM-DD 시행일. 본문에 명시 없으면 null.",
  "deadline": "YYYY-MM-DD 신청/적용 마감일. 명시 없으면 null.",
  "importance": "중요 | 일반 중 하나. (마감·제재·필수 변경이면 '중요')"
}`;

  const text = await callClaude(prompt);
  const parsed = parseJsonFromResponse(text);

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : null,
    detail_summary:
      typeof parsed.detail_summary === "string" ? parsed.detail_summary.trim() : null,
    checklist: typeof parsed.checklist === "string" ? parsed.checklist.trim() : null,
    effective_at: typeof parsed.effective_at === "string" ? parsed.effective_at : null,
    deadline: typeof parsed.deadline === "string" ? parsed.deadline : null,
    importance: parsed.importance === "중요" ? "중요" : null,
  };
}

function normalize(notice) {
  const tags = Array.isArray(notice.tags) ? notice.tags : [];
  return {
    title: String(notice.title ?? "").trim(),
    category: tags[0] ?? null,
    tags,
    published_at: safeDate(notice.date),
    source_urls: notice.url ? [notice.url] : null,
  };
}

// ── 신규 수집 모드 ──
async function runCollect() {
  const startedAt = kstIsoNow();
  console.log(`▶ [cron-collect] 시작: ${startedAt} (최근 ${recentDays}일)`);

  const scraped = await scrapeNotices({ recentDays });
  if (scraped.length === 0) {
    console.log("· 수집된 공지 없음");
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let enrichFail = 0;

  for (const raw of scraped) {
    const base = normalize(raw);
    if (!base.title) continue;

    const title_hash = createHash("sha256")
      .update(base.title)
      .digest("hex")
      .slice(0, 32);

    // 먼저 중복 체크 (Claude 호출 낭비 방지)
    const dup = await sql`
      SELECT id FROM notices WHERE title_hash = ${title_hash} LIMIT 1
    `;
    if (dup.length > 0) {
      skipped++;
      continue;
    }

    // Claude 가공
    let enriched;
    try {
      enriched = await enrichWithClaude({
        title: base.title,
        date: raw.date,
        content: raw.content,
        tags: base.tags,
      });
    } catch (err) {
      console.error(`  ✗ 가공실패 "${base.title.slice(0, 30)}...": ${err.message}`);
      enrichFail++;
      continue;
    }

    try {
      const rows = await sql`
        INSERT INTO notices (
          title, title_hash, category, importance, tags,
          published_at, effective_at, deadline,
          summary, detail_summary, checklist, source_urls, source
        ) VALUES (
          ${base.title}, ${title_hash}, ${base.category}, ${enriched.importance}, ${base.tags},
          ${base.published_at}, ${enriched.effective_at}, ${enriched.deadline},
          ${enriched.summary}, ${enriched.detail_summary}, ${enriched.checklist},
          ${base.source_urls}, 'auto'
        )
        ON CONFLICT (title_hash) DO NOTHING
        RETURNING id
      `;
      if (rows.length > 0) {
        inserted++;
        console.log(`  + [${rows[0].id}] ${base.title.slice(0, 40)}...`);
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ INSERT "${base.title.slice(0, 30)}...": ${err.message}`);
    }
  }

  console.log(
    `✓ 완료: scraped=${scraped.length}, inserted=${inserted}, skipped=${skipped}, enrichFail=${enrichFail}`
  );
}

// ── 재가공 모드 ──
async function runReprocess() {
  console.log(`▶ [reprocess] 기존 공지 재가공 시작`);

  const rows = await sql`
    SELECT id, title, published_at, tags, source_urls
    FROM notices
    WHERE (detail_summary IS NULL OR summary IS NULL OR checklist IS NULL OR effective_at IS NULL)
    ORDER BY created_at DESC
  `;
  if (rows.length === 0) {
    console.log("· 재가공 대상 없음");
    return;
  }
  console.log(`· ${rows.length}건 대상`);

  // 각 행의 source_url에서 본문을 다시 가져오기 위해 puppeteer 세션 하나 오픈
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  let updated = 0;
  let fail = 0;

  try {
    for (const row of rows) {
      const url = (row.source_urls && row.source_urls[0]) || null;
      if (!url) {
        console.log(`  · [${row.id}] source_url 없음, skip`);
        continue;
      }

      let content = "";
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1200));
        content = await page.evaluate(() => {
          const selectors = [
            "article",
            "[class*='content']",
            "[class*='Content']",
            "[class*='detail']",
            "[class*='Detail']",
            "[class*='body']",
            "[class*='Body']",
            "main",
            ".notice_content",
            "#content",
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 50) {
              return (el.innerText || "").slice(0, 3000);
            }
          }
          const divs = [...document.querySelectorAll("div, section")];
          divs.sort((a, b) => b.textContent.length - a.textContent.length);
          return (divs[0]?.innerText || document.body.innerText || "").slice(0, 3000);
        });
      } catch (err) {
        console.error(`  ✗ [${row.id}] 본문 재수집 실패: ${err.message}`);
        fail++;
        continue;
      }

      let enriched;
      try {
        enriched = await enrichWithClaude({
          title: row.title,
          date: row.published_at,
          content,
          tags: row.tags,
        });
      } catch (err) {
        console.error(`  ✗ [${row.id}] 가공실패: ${err.message}`);
        fail++;
        continue;
      }

      try {
        await sql`
          UPDATE notices SET
            summary = ${enriched.summary},
            detail_summary = ${enriched.detail_summary},
            checklist = COALESCE(${enriched.checklist}, checklist),
            effective_at = COALESCE(${enriched.effective_at}, effective_at),
            deadline = COALESCE(${enriched.deadline}, deadline),
            importance = COALESCE(${enriched.importance}, importance)
          WHERE id = ${row.id}
        `;
        updated++;
        console.log(`  ✓ [${row.id}] ${row.title.slice(0, 40)}...`);
      } catch (err) {
        console.error(`  ✗ [${row.id}] UPDATE: ${err.message}`);
        fail++;
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`✓ 완료: updated=${updated}, failed=${fail}`);
}

// ── 로그 파일 미러링 ──
const LOG_DIR = path.resolve("data/logs");
await fs.mkdir(LOG_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logFile = path.join(LOG_DIR, `cron-collect-${ts}.log`);
const stream = (await fs.open(logFile, "w")).createWriteStream();
const origLog = console.log;
const origErr = console.error;
console.log = (...a) => {
  origLog(...a);
  stream.write(a.join(" ") + "\n");
};
console.error = (...a) => {
  origErr(...a);
  stream.write(a.join(" ") + "\n");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (reprocessMode ? runReprocess() : runCollect())
    .then(() => {
      stream.end();
      process.exit(0);
    })
    .catch((e) => {
      console.error("실행 실패:", e.message);
      stream.end();
      process.exit(1);
    });
}
