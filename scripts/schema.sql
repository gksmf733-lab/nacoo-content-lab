-- 나쿠 콘텐츠연구소 DB 스키마

CREATE TABLE IF NOT EXISTS notices (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  title_hash     TEXT NOT NULL UNIQUE,
  category       TEXT,
  importance     TEXT,
  published_at   DATE,
  effective_at   DATE,
  summary        TEXT,
  checklist      TEXT,
  tags           TEXT[] DEFAULT '{}',
  source_urls    TEXT[],
  source         TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notices_published_at ON notices (published_at DESC);

CREATE TABLE IF NOT EXISTS reels_scripts (
  id             SERIAL PRIMARY KEY,
  notice_id      INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  tone           TEXT NOT NULL CHECK (tone IN ('urgent', 'opportunity')),
  body_markdown  TEXT NOT NULL,
  hashtags       TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notice_id)
);

CREATE INDEX IF NOT EXISTS idx_scripts_created_at ON reels_scripts (created_at DESC);

CREATE TABLE IF NOT EXISTS card_news_sets (
  id             SERIAL PRIMARY KEY,
  notice_id      INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  audience       TEXT,
  tone           TEXT,
  card_count     INTEGER NOT NULL,
  brief_json     JSONB,
  status         TEXT NOT NULL DEFAULT 'draft',
  qa_verdict     TEXT,
  qa_issues      JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notice_id)
);

CREATE INDEX IF NOT EXISTS idx_card_news_sets_notice_id ON card_news_sets (notice_id);

CREATE TABLE IF NOT EXISTS card_news_slides (
  id             SERIAL PRIMARY KEY,
  set_id         INTEGER NOT NULL REFERENCES card_news_sets(id) ON DELETE CASCADE,
  card_no        INTEGER NOT NULL,
  role           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  hashtags       TEXT[],
  html           TEXT,
  layout         JSONB DEFAULT '{}'::jsonb,
  UNIQUE (set_id, card_no)
);

-- 마이그레이션: 기존 테이블에 layout 컬럼 추가
ALTER TABLE card_news_slides ADD COLUMN IF NOT EXISTS layout JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_card_news_slides_set_id ON card_news_slides (set_id);
