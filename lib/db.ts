import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function getSQL(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // 빌드 타임에는 DATABASE_URL이 없을 수 있으므로 lazy 초기화
    throw new Error("DATABASE_URL is not set");
  }
  return neon(url);
}

// Proxy로 감싸서 실제 호출 시점에만 neon 초기화 (빌드 타임 에러 방지)
export const sql: NeonQueryFunction<false, false> = new Proxy(
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args) {
      return getSQL()(...(args as [TemplateStringsArray, ...unknown[]]));
    },
  }
);

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
