// 누락된 대본·카드뉴스 일괄 생성 (로컬 dev 서버에 HTTP로 위임)
//
// 사전 조건: 다른 터미널에서 `npm run dev` 실행 중 (3002 포트)
// 사용: node --env-file=.env.local scripts/generate-missing.mjs [--only-scripts|--only-cards]
//
// 각 공지에 대해 /api/scripts/generate , /api/card-news/generate 를 차례로 호출.
// 이미 있으면 덮어씀 (스크립트는 새 버전 추가, 카드는 재생성).

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. (--env-file=.env.local 확인)");
  process.exit(1);
}
if (!process.env.API_TOKEN) {
  console.error("API_TOKEN 환경변수가 없습니다. (.env.local 확인)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const BASE = process.env.GEN_BASE_URL || "http://localhost:3002";
const TOKEN = process.env.API_TOKEN;

const args = process.argv.slice(2);
const onlyScripts = args.includes("--only-scripts");
const onlyCards = args.includes("--only-cards");

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error ?? text.slice(0, 200);
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

async function main() {
  // 연결 확인
  try {
    const ping = await fetch(BASE, { method: "HEAD" }).then((r) => r.status);
    console.log(`✓ dev 서버 연결됨 (${BASE}, status=${ping})`);
  } catch (err) {
    console.error(`✗ dev 서버 접속 실패 (${BASE}).`);
    console.error(`  다른 터미널에서 'npm run dev' 실행 후 다시 시도하세요.`);
    console.error(`  에러: ${err.message}`);
    process.exit(1);
  }

  const rows = (await sql`
    SELECT n.id, n.title,
           (s.id IS NOT NULL) AS has_script,
           (c.id IS NOT NULL) AS has_card
    FROM notices n
    LEFT JOIN reels_scripts s ON s.notice_id = n.id
    LEFT JOIN card_news_sets c ON c.notice_id = n.id
    ORDER BY n.id
  `);

  const needScript = rows.filter((r) => !r.has_script && !onlyCards);
  const needCard = rows.filter((r) => !r.has_card && !onlyScripts);

  console.log(`\n▶ 대본 누락: ${needScript.length}건`);
  console.log(`▶ 카드뉴스 누락: ${needCard.length}건\n`);

  // 1) 대본
  for (const row of needScript) {
    try {
      await postJson("/api/scripts/generate", {
        notice_id: row.id,
        persona_id: "default",
      });
      console.log(`  ✓ 대본 [${row.id}] ${row.title.slice(0, 40)}...`);
    } catch (err) {
      console.error(`  ✗ 대본 [${row.id}]: ${err.message}`);
    }
  }

  // 2) 카드뉴스
  for (const row of needCard) {
    try {
      await postJson("/api/card-news/generate", { notice_id: row.id });
      console.log(`  ✓ 카드 [${row.id}] ${row.title.slice(0, 40)}...`);
    } catch (err) {
      console.error(`  ✗ 카드 [${row.id}]: ${err.message}`);
    }
  }

  console.log("\n✓ 완료");
}

main().catch((e) => {
  console.error("실행 실패:", e.message);
  process.exit(1);
});
