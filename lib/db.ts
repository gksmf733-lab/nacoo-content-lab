import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);

export type Notice = {
  id: number;
  title: string;
  category: string | null;
  importance: string | null;
  published_at: string | null;
  effective_at: string | null;
  summary: string | null;
  checklist: string | null;
  source_urls: string[] | null;
  title_hash: string;
  source: "auto" | "manual";
  created_at: string;
};

export type ReelsScript = {
  id: number;
  notice_id: number;
  title: string;
  tone: "urgent" | "opportunity";
  body_markdown: string;
  hashtags: string[] | null;
  created_at: string;
  updated_at: string;
};
