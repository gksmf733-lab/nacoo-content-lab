// notices 테이블에 platform 컬럼을 추가하고 기존 행을 'smartplace'로 백필한다.
// 실행: npm run migrate:platform  (또는 node --env-file=.env.local scripts/migrate-platform.mjs)

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. (--env-file=.env.local 확인)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const steps = [
  {
    label: "platform 컬럼 추가",
    run: () => sql`
      ALTER TABLE notices
      ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'smartplace'
    `,
  },
  {
    label: "기존 행 백필 (platform = 'smartplace')",
    run: () => sql`
      UPDATE notices
      SET platform = 'smartplace'
      WHERE platform IS NULL OR platform = ''
    `,
  },
  {
    label: "idx_notices_platform 인덱스 생성",
    run: () => sql`
      CREATE INDEX IF NOT EXISTS idx_notices_platform
      ON notices (platform, published_at DESC)
    `,
  },
];

console.log("▶ platform 마이그레이션 시작");
for (const step of steps) {
  try {
    await step.run();
    console.log(`  ✓ ${step.label}`);
  } catch (err) {
    console.error(`  ✗ ${step.label}: ${err.message}`);
    process.exit(1);
  }
}

const counts = await sql`
  SELECT platform, COUNT(*)::int AS n
  FROM notices
  GROUP BY platform
  ORDER BY platform
`;
console.log("✓ 완료. 플랫폼별 공지 수:");
for (const r of counts) console.log(`  · ${r.platform}: ${r.n}건`);
