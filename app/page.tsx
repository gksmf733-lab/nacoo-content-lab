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
  effective_at: string | Date | null;
  deadline: string | Date | null;
  source: "auto" | "manual";
  has_script: boolean;
  has_card_news: boolean;
  card_qa_verdict: string | null;
};

function toDateStr(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) {
    // KST(UTC+9) 기준으로 변환하여 날짜 밀림 방지
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** MM.DD 형태로 날짜 표시 */
function shortDate(d: string | Date | null | undefined): string {
  const s = toDateStr(d);
  if (!s) return "-";
  const parts = s.split("-");
  return `${parts[1]}.${parts[2]}`;
}

/** YYYY년 MM월 형태로 월 그룹 키 생성 */
function monthKey(d: string | Date | null | undefined): string {
  const s = toDateStr(d);
  if (!s) return "날짜 미정";
  const parts = s.split("-");
  return `${parts[0]}년 ${parseInt(parts[1])}월`;
}

/** D-day 계산: 양수면 남은 일수, 0이면 오늘, 음수면 지남 */
function dDay(target: string | Date | null | undefined): number | null {
  const s = toDateStr(target);
  if (!s) return null;
  const now = new Date();
  // KST 기준 오늘
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const todayMs = new Date(todayStr).getTime();
  const targetMs = new Date(s).getTime();
  return Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24));
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
  const notices = rowsRaw as unknown as NoticeRow[];

  // 월별 그룹핑
  const grouped = new Map<string, NoticeRow[]>();
  for (const n of notices) {
    const key = monthKey(n.published_at);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(n);
  }

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
        {notices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            아직 수집된 공지가 없습니다. 자동화 스케줄이 다음 시간에 실행됩니다.
          </div>
        ) : (
          <div className="space-y-8">
            {[...grouped.entries()].map(([month, items]) => (
              <div key={month}>
                {/* 월 헤더 */}
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-bold text-neutral-900">{month}</h2>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                    {items.length}건
                  </span>
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>

                {/* 공지 리스트 */}
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white shadow-sm">
                  {items.map((n) => {
                    const pubStr = toDateStr(n.published_at);
                    const effStr = toDateStr(n.effective_at);
                    const dlStr = toDateStr(n.deadline);
                    const hasDifferentEffective = effStr && effStr !== pubStr;
                    // D-day: deadline 우선, 없으면 effective_at (발표일과 다를 때만)
                    const deadlineTarget = dlStr || (hasDifferentEffective ? effStr : null);
                    const remaining = deadlineTarget ? dDay(deadlineTarget) : null;

                    return (
                      <li key={n.id}>
                        <Link
                          href={`/notices/${n.id}`}
                          className="flex items-center gap-3 px-3 py-3 transition hover:bg-neutral-50 sm:px-4 sm:py-4"
                        >
                          {/* 좌측: 내용 */}
                          <div className="min-w-0 flex-1">
                            {/* 태그 뱃지 */}
                            <div className="mb-1 flex flex-wrap items-center gap-1">
                              <TagBadges importance={n.importance} tags={n.tags} />
                            </div>

                            {/* 제목 */}
                            <p className="text-sm font-medium leading-snug sm:truncate">{n.title}</p>

                            {/* 메타 행: 날짜 뱃지 + 상태 뱃지 */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {/* 발표일 */}
                              <span className="inline-flex items-center gap-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                                <span className="text-neutral-400">발표</span> {shortDate(n.published_at)}
                              </span>

                              {/* 시행일 (발표일과 다를 때만) */}
                              {hasDifferentEffective && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  <span className="text-blue-400">시행</span> {shortDate(n.effective_at)}
                                </span>
                              )}

                              {/* 마감일 (deadline 컬럼이 있을 때) */}
                              {dlStr && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                                  <span className="text-red-400">마감</span> {shortDate(n.deadline)}
                                </span>
                              )}

                              <span className="text-xs text-neutral-300">·</span>
                              <span className={`text-[10px] ${n.source === "auto" ? "text-blue-600" : "text-neutral-500"}`}>
                                {n.source === "auto" ? "자동수집" : "수동"}
                              </span>
                              <span className="text-xs text-neutral-300 hidden sm:inline">·</span>

                              {n.has_script ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  🎬 대본
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                                  🎬 없음
                                </span>
                              )}
                              {n.has_card_news ? (
                                <span
                                  className={
                                    "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                                    (n.card_qa_verdict === "needs-fix"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-sky-50 text-sky-700")
                                  }
                                >
                                  🖼️ 카드뉴스
                                  {n.card_qa_verdict === "needs-fix" ? " ⚠️" : ""}
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                                  🖼️ 없음
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 우측: D-day 뱃지 또는 화살표 */}
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {remaining !== null ? (
                              <DdayBadge days={remaining} />
                            ) : (
                              <span className="text-neutral-300">→</span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function DdayBadge({ days }: { days: number }) {
  if (days < 0) {
    // 이미 지남
    return (
      <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-400">
        마감
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex min-w-[3.2rem] animate-pulse items-center justify-center rounded-lg bg-red-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
        D-Day
      </span>
    );
  }
  if (days <= 3) {
    // 긴급 (1~3일)
    return (
      <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600 ring-1 ring-inset ring-red-200">
        D-{days}
      </span>
    );
  }
  if (days <= 7) {
    // 임박 (4~7일)
    return (
      <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-inset ring-amber-200">
        D-{days}
      </span>
    );
  }
  // 여유 (8일+)
  return (
    <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600 ring-1 ring-inset ring-blue-200">
      D-{days}
    </span>
  );
}
