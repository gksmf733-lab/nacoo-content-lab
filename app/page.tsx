import { sql } from "@/lib/db";
import { NoticesList, type NoticeListItem } from "./notices-list";

export const dynamic = "force-dynamic";

const NAVER_NOTICE_URL = "https://smartplace.naver.com/notices";

type NoticeRow = {
  id: number;
  title: string;
  category: string | null;
  importance: string | null;
  tags: string[] | null;
  published_at: string | Date | null;
  effective_at: string | Date | null;
  deadline: string | Date | null;
  source: "auto" | "manual";
  has_script: boolean;
  has_card_news: boolean;
  card_qa_verdict: string | null;
};

function toDateStr(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default async function HomePage() {
  const rowsRaw = await sql`
    SELECT n.id, n.title, n.category, n.importance, n.tags,
           n.published_at, n.effective_at, n.deadline, n.source,
           (s.id IS NOT NULL) AS has_script,
           (c.id IS NOT NULL) AS has_card_news,
           c.qa_verdict AS card_qa_verdict
    FROM notices n
    LEFT JOIN reels_scripts s ON s.notice_id = n.id
    LEFT JOIN card_news_sets c ON c.notice_id = n.id
    ORDER BY COALESCE(n.published_at, n.created_at::date) DESC
    LIMIT 100
  `;
  const rows = rowsRaw as unknown as NoticeRow[];

  // Date 객체는 클라이언트 전달 전에 string으로 직렬화
  const notices: NoticeListItem[] = rows.map((n) => ({
    id: n.id,
    title: n.title,
    category: n.category,
    importance: n.importance,
    tags: n.tags,
    published_at: toDateStr(n.published_at),
    effective_at: toDateStr(n.effective_at),
    deadline: toDateStr(n.deadline),
    source: n.source,
    has_script: n.has_script,
    has_card_news: n.has_card_news,
    card_qa_verdict: n.card_qa_verdict,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-10">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">나쿠 콘텐츠연구소</h1>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
              네이버 스마트플레이스 공지 모니터링 · 릴스 대본 보관함
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={NAVER_NOTICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-600 shadow-sm transition hover:border-neutral-400 hover:text-neutral-900 sm:inline-flex"
            >
              🔗 네이버 공식 공지 <span aria-hidden>↗</span>
            </a>
            <form action="/api/auth/logout" method="post">
              <button className="text-xs text-neutral-400 hover:text-neutral-600">로그아웃</button>
            </form>
          </div>
        </div>
      </header>

      <section>
        <NoticesList notices={notices} />
      </section>
    </main>
  );
}
