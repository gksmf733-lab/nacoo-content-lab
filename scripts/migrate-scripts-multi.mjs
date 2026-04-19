// 대본 다중 버전 지원 마이그레이션
// - reels_scripts 의 UNIQUE(notice_id) 제거
// - persona_id, guide 컬럼 추가
// - notice_id + created_at 인덱스 추가
//
// 사용: node --env-file=.env.local scripts/migrate-scripts-multi.mjs

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. (.env.local 로드 필요)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const steps = [
  {
    label: "UNIQUE(notice_id) 제약 제거 (있을 때만)",
    run: async () => {
      const rows = await sql`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'reels_scripts'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%notice_id%'
      `;
      for (const r of rows) {
        await sql.query(`ALTER TABLE reels_scripts DROP CONSTRAINT "${r.conname}"`);
        console.log(`  ✓ dropped constraint: ${r.conname}`);
      }
      if (rows.length === 0) console.log("  · 대상 제약 없음 (skip)");
    },
  },
  {
    label: "persona_id 컬럼 추가",
    run: async () => {
      await sql`ALTER TABLE reels_scripts ADD COLUMN IF NOT EXISTS persona_id TEXT`;
    },
  },
  {
    label: "guide 컬럼 추가",
    run: async () => {
      await sql`ALTER TABLE reels_scripts ADD COLUMN IF NOT EXISTS guide TEXT`;
    },
  },
  {
    label: "(notice_id, created_at) 인덱스 추가",
    run: async () => {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_scripts_notice_id
        ON reels_scripts (notice_id, created_at DESC)
      `;
    },
  },
];

for (const step of steps) {
  console.log(`▶ ${step.label}`);
  try {
    await step.run();
  } catch (err) {
    console.error(`  ✗ 실패: ${err.message}`);
    process.exit(1);
  }
}

console.log("\n✓ 마이그레이션 완료");
