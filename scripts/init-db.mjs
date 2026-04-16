#!/usr/bin/env node
import { Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수를 먼저 설정하세요.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `CREATE TABLE IF NOT EXISTS notices (
    id             SERIAL PRIMARY KEY,
    title          TEXT NOT NULL,
    title_hash     TEXT NOT NULL UNIQUE,
    category       TEXT,
    importance     TEXT,
    published_at   DATE,
    effective_at   DATE,
    summary        TEXT,
    checklist      TEXT,
    source_urls    TEXT[],
    source         TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notices_published_at ON notices (published_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reels_scripts (
    id             SERIAL PRIMARY KEY,
    notice_id      INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    tone           TEXT NOT NULL CHECK (tone IN ('urgent', 'opportunity')),
    body_markdown  TEXT NOT NULL,
    hashtags       TEXT[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notice_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scripts_created_at ON reels_scripts (created_at DESC)`,
];

console.log(`📦 ${statements.length}개의 SQL 문을 실행합니다...`);

for (const stmt of statements) {
  const label = stmt.slice(0, 60).replace(/\s+/g, " ");
  try {
    await pool.query(stmt);
    console.log(`  ✔ ${label}...`);
  } catch (err) {
    console.error(`  ✘ 실패 (${label}): ${err.message}`);
    await pool.end();
    process.exit(1);
  }
}

await pool.end();
console.log("✅ DB 초기화 완료");
