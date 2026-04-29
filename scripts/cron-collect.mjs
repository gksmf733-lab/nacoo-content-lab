// 로컬 크론 수집 스크립트
// - 멀티 플랫폼 스크레이프 → Claude 가공 → Neon DB INSERT (title_hash 중복 skip)
// - 호출: node --env-file=.env.local scripts/cron-collect.mjs [--recent 30] [--reprocess]
// - --reprocess: 기존 DB 중 summary/checklist/effective_at이 비어 있는 행을 다시 가공·UPDATE
// - --platforms smartplace,blog_smartplace : 특정 플랫폼만 수집 (쉼표 구분)
// - --skip-login : 로그인 필요 플랫폼 스킵 (smartstore/booking/talktalk)
// - --limit 10   : 플랫폼별 최신순 N건까지만 수집 (기본: 제한 없음)

import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";
import { callClaude, parseJsonFromResponse } from "../lib/claude-cli.mjs";
import { PLATFORMS, PLATFORM_ORDER } from "../lib/platforms.mjs";
import * as smartplaceScraper from "./scrapers/smartplace.mjs";
import * as naverBlogScraper from "./scrapers/naver-blog.mjs";
import * as searchadScraper from "./scrapers/searchad.mjs";
import * as smartstoreScraper from "./scrapers/smartstore.mjs";
import * as bookingScraper from "./scrapers/booking.mjs";
import * as talktalkScraper from "./scrapers/talktalk.mjs";

// 스크래퍼 등록 — id 는 meta.id (블로그는 fan-out 이라 하나가 3개 platform 을 책임).
// smartstore / booking / talktalk 은 PLATFORM_ORDER 에서 숨김 처리 → 수집도 비활성화.
// 스크래퍼 파일과 import 는 유지 — 복원 시 아래 배열에 다시 추가만 하면 됨.
const SCRAPERS = [
  { key: "smartplace", scraper: smartplaceScraper, emits: ["smartplace"] },
  { key: "searchad", scraper: searchadScraper, emits: ["searchad"] },
  {
    key: "naver_blog",
    scraper: naverBlogScraper,
    emits: ["blog_smartplace", "blog_business", "blog_diary"],
  },
  // 비활성화 (로그인 필요 채널):
  // { key: "smartstore", scraper: smartstoreScraper, emits: ["smartstore"], requiresLogin: true },
  // { key: "booking",    scraper: bookingScraper,    emits: ["booking"],    requiresLogin: true },
  // { key: "talktalk",   scraper: talktalkScraper,   emits: ["talktalk"],   requiresLogin: true },
];

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
const skipLogin = args.includes("--skip-login");

let onlyPlatforms = null;
const platIdx = args.indexOf("--platforms");
if (platIdx !== -1 && args[platIdx + 1]) {
  onlyPlatforms = new Set(args[platIdx + 1].split(",").map((s) => s.trim()));
}

let limitPerPlatform = 0; // 0 = 제한 없음
const limitIdx = args.indexOf("--limit");
if (limitIdx !== -1 && args[limitIdx + 1]) {
  limitPerPlatform = Number(args[limitIdx + 1]) || 0;
}

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
async function enrichWithClaude({ title, date, content, tags, platformLabel }) {
  const prompt = `${platformLabel || "네이버"} 공지 원문을 자영업자 관점에서 정리해줘. JSON만 응답해 (설명·코드블록 없이).

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

function normalize(draft) {
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  return {
    platform: draft.platform || "smartplace",
    title: String(draft.title ?? "").trim(),
    category: tags[0] ?? null,
    tags,
    published_at: safeDate(draft.date),
    source_urls: draft.url ? [draft.url] : null,
    importance_hint: draft.importance ?? null,
  };
}

// ── 유사 공지 감지 (제목 변형에 강건) ──
// 해시 기반 정확 매칭으론 잡히지 않는 "같은 내용, 다른 표기" 케이스 차단.
// 예: "외식업 매장의 필수 전략 스마트플레이스! ... (~4/22)" ≈ "스마트플레이스(외식업 ... 교육 신청)"
const SIM_THRESHOLD = 0.6;
const SIM_RECENT_DAYS = 90;

function normalizeTitleForSim(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/[~!@#$%^&*()_+={}\[\]\\|;:'",.<>/?·・\-]/g, " ")
    .replace(/\d+/g, " ") // 날짜·숫자 제거 (4/22, 2026 같은 잡음)
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTitle(t) {
  return new Set(
    normalizeTitleForSim(t)
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  );
}

function jaccardSim(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

async function findSimilarExisting({ platform, title }) {
  const draftKeys = tokenizeTitle(title);
  if (draftKeys.size < 2) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SIM_RECENT_DAYS);

  const rows = await sql`
    SELECT id, title FROM notices
    WHERE platform = ${platform}
      AND created_at > ${cutoff.toISOString()}
  `;

  for (const row of rows) {
    const sim = jaccardSim(draftKeys, tokenizeTitle(row.title));
    if (sim >= SIM_THRESHOLD) {
      return { id: row.id, title: row.title, sim };
    }
  }
  return null;
}

function platformLabelOf(id) {
  return PLATFORMS[id]?.label || "네이버";
}

// 하나의 스크래퍼 결과를 DB에 upsert 한다.
async function ingestDrafts(drafts) {
  let inserted = 0;
  let skipped = 0;
  let enrichFail = 0;

  for (const draft of drafts) {
    const base = normalize(draft);
    if (!base.title) continue;

    // title_hash: 같은 제목이어도 플랫폼이 다르면 별개 공지로 취급
    const title_hash = createHash("sha256")
      .update(base.platform + "|" + base.title)
      .digest("hex")
      .slice(0, 32);

    const dup = await sql`
      SELECT id FROM notices WHERE title_hash = ${title_hash} LIMIT 1
    `;
    if (dup.length > 0) {
      skipped++;
      continue;
    }

    // 유사 공지(제목 변형) 차단
    const similar = await findSimilarExisting({
      platform: base.platform,
      title: base.title,
    });
    if (similar) {
      console.log(
        `  ~ [유사중복 skip] "${base.title.slice(0, 40)}..." ≈ #${similar.id} "${similar.title.slice(0, 40)}..." (유사도 ${(similar.sim * 100).toFixed(0)}%)`
      );
      skipped++;
      continue;
    }

    let enriched;
    try {
      enriched = await enrichWithClaude({
        title: base.title,
        date: draft.date,
        content: draft.content,
        tags: base.tags,
        platformLabel: platformLabelOf(base.platform),
      });
    } catch (err) {
      console.error(
        `  ✗ 가공실패 [${base.platform}] "${base.title.slice(0, 30)}...": ${err.message}`
      );
      enrichFail++;
      continue;
    }

    const importance = enriched.importance ?? base.importance_hint;

    try {
      const rows = await sql`
        INSERT INTO notices (
          title, title_hash, category, importance, tags,
          published_at, effective_at, deadline,
          summary, detail_summary, checklist, source_urls, source, platform
        ) VALUES (
          ${base.title}, ${title_hash}, ${base.category}, ${importance}, ${base.tags},
          ${base.published_at}, ${enriched.effective_at}, ${enriched.deadline},
          ${enriched.summary}, ${enriched.detail_summary}, ${enriched.checklist},
          ${base.source_urls}, 'auto', ${base.platform}
        )
        ON CONFLICT (title_hash) DO NOTHING
        RETURNING id
      `;
      if (rows.length > 0) {
        inserted++;
        console.log(`  + [${rows[0].id}] (${base.platform}) ${base.title.slice(0, 40)}...`);
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ INSERT "${base.title.slice(0, 30)}...": ${err.message}`);
    }
  }

  return { inserted, skipped, enrichFail };
}

// ── 신규 수집 모드 ──
async function runCollect() {
  const startedAt = kstIsoNow();
  console.log(
    `▶ [cron-collect] 시작: ${startedAt} (최근 ${recentDays}일, platforms=${
      onlyPlatforms ? [...onlyPlatforms].join(",") : "all"
    }${skipLogin ? ", skipLogin" : ""})`
  );

  const totals = { scraped: 0, inserted: 0, skipped: 0, enrichFail: 0 };

  for (const entry of SCRAPERS) {
    // --skip-login 옵션 처리
    if (skipLogin && entry.requiresLogin) {
      console.log(`· [${entry.key}] --skip-login 옵션으로 건너뜀`);
      continue;
    }
    // --platforms 필터 (emits 중 하나라도 포함돼야 실행)
    if (onlyPlatforms) {
      const match = entry.emits.some((p) => onlyPlatforms.has(p));
      if (!match) continue;
    }

    console.log(`\n━━━ [${entry.key}] 수집 시작 ━━━`);
    let drafts = [];
    try {
      drafts = await entry.scraper.scrape({ recentDays });
    } catch (err) {
      console.error(`  ✗ [${entry.key}] 스크래핑 실패: ${err.message}`);
      continue;
    }

    // --platforms 필터가 있으면 emits 안에서도 정확히 일치하는 것만
    if (onlyPlatforms) {
      drafts = drafts.filter((d) => onlyPlatforms.has(d.platform));
    }

    // --limit 적용: 플랫폼별 최신순 정렬 후 N건
    if (limitPerPlatform > 0 && drafts.length > 0) {
      const byPlatform = new Map();
      for (const d of drafts) {
        if (!byPlatform.has(d.platform)) byPlatform.set(d.platform, []);
        byPlatform.get(d.platform).push(d);
      }
      const limited = [];
      for (const [, items] of byPlatform) {
        items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        limited.push(...items.slice(0, limitPerPlatform));
      }
      drafts = limited;
    }

    totals.scraped += drafts.length;
    if (drafts.length === 0) {
      console.log(`· [${entry.key}] 수집 결과 0건`);
      continue;
    }

    const res = await ingestDrafts(drafts);
    totals.inserted += res.inserted;
    totals.skipped += res.skipped;
    totals.enrichFail += res.enrichFail;
    console.log(
      `  = [${entry.key}] scraped=${drafts.length}, inserted=${res.inserted}, skipped=${res.skipped}, enrichFail=${res.enrichFail}`
    );
  }

  console.log(
    `\n✓ 전체 완료: scraped=${totals.scraped}, inserted=${totals.inserted}, skipped=${totals.skipped}, enrichFail=${totals.enrichFail}`
  );
}

// ── 재가공 모드 ──
async function runReprocess() {
  console.log(`▶ [reprocess] 기존 공지 재가공 시작`);

  const rows = await sql`
    SELECT id, title, published_at, tags, source_urls, platform
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
          platformLabel: platformLabelOf(row.platform),
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
