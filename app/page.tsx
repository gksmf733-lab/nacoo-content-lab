import Link from "next/link";
import { sql } from "@/lib/db";
import { TagBadges } from "@/lib/tag-badge";

export const dynamic = "force-dynamic";

const NAVER_NOTICE_URL = "https://smartplace.naver.com/notices";

type NoticeRow = {
  id: number;
  title: string;
  category: string | null;
  importance: string | null;
  tags: string[] | null;
  published_at: string | Date | null;
  source: "auto" | "manual";
  has_script: boolean;
  has_card_news: boolean;
  card_qa_verdict: string | null;
};

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default async function HomePage() {
  const rowsRaw = await sql`
    SELECT n.id, n.title, n.category, n.importance, n.tags, n.published_at, n.source,
           (s.id IS NOT NULL) AS has_script,
           (c.id IS NOT NULL) AS has_card_news,
           c.qa_verdict AS card_qa_verdict
    FROM notices n
    LEFT JOIN reels_scripts s ON s.notice_id = n.id
    LEFT JOIN card_news_sets c ON c.notice_id = n.id
    ORDER BY COALESCE(n.published_at, n.created_at::date) DESC
    LIMIT 100
  `;
  const notices = rowsRaw as unknown as NoticeRow[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">나쿠 콘텐츠연구소</h1>
            <a
              href={NAVER_NOTICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-600 shadow-sm transition hover:border-neutral-400 hover:text-neutral-900"
            >
              🔗 네이버 공식 공지 <span aria-hidden>↗</span>
            </a>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            네이버 스마트플레이스 공지 모니터링 · 릴스 대본 보관함
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="text-xs text-neutral-400 hover:text-neutral-600">로그아웃</button>
        </form>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">📢 공지 수집</h2>
        {notices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            아직 수집된 공지가 없습니다. 자동화 스케줄이 다음 시간에 실행됩니다.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {notices.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notices/${n.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TagBadges importance={n.importance} tags={n.tags} />
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {n.has_script ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          🎬 대본
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                          🎬 없음
                        </span>
                      )}
                      {n.has_card_news ? (
                        <span
                          className={
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                            (n.card_qa_verdict === "needs-fix"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sky-50 text-sky-700")
                          }
                        >
                          🖼️ 카드뉴스
                          {n.card_qa_verdict === "needs-fix" ? " ⚠️" : ""}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                          🖼️ 없음
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {fmtDate(n.published_at)} ·{" "}
                      <span className={n.source === "auto" ? "text-blue-600" : "text-neutral-500"}>
                        {n.source === "auto" ? "자동수집" : "수동"}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-neutral-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
