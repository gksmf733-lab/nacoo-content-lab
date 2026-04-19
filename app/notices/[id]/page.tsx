import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { TagBadges } from "@/lib/tag-badge";
import { ScriptEditor } from "./script-editor";
import { ScriptGenerateForm } from "./script-generate-form";
import { CardNewsPanel, type SetRow, type SlideRow } from "./card-news-panel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<{ tab?: string }> };

type NoticeRow = {
  id: number;
  title: string;
  category: string | null;
  importance: string | null;
  tags: string[] | null;
  published_at: string | Date | null;
  effective_at: string | Date | null;
  summary: string | null;
  checklist: string | null;
  source_urls: string[] | null;
  source: "auto" | "manual";
  created_at: string | Date;
};

type ScriptRow = {
  id: number;
  notice_id: number;
  title: string;
  tone: "urgent" | "opportunity";
  body_markdown: string;
  hashtags: string[] | null;
  persona_id: string | null;
  guide: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default async function NoticeDetailPage({ params, searchParams }: Params & Search) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: "info" | "script" | "cardnews" =
    rawTab === "script" ? "script" : rawTab === "cardnews" ? "cardnews" : "info";

  const noticeId = Number(id);
  const [noticeRowsRaw, scriptRowsRaw, setRowsRaw] = await Promise.all([
    sql`SELECT * FROM notices WHERE id = ${noticeId} LIMIT 1`,
    sql`SELECT * FROM reels_scripts WHERE notice_id = ${noticeId} ORDER BY created_at DESC`,
    sql`SELECT id, notice_id, audience, tone, card_count, status, qa_verdict, qa_issues
        FROM card_news_sets WHERE notice_id = ${noticeId} LIMIT 1`,
  ]);
  const noticeRows = noticeRowsRaw as unknown as NoticeRow[];
  const scripts = scriptRowsRaw as unknown as ScriptRow[];
  const setRows = setRowsRaw as unknown as SetRow[];

  if (noticeRows.length === 0) notFound();
  const notice = noticeRows[0];
  const cardSet = setRows[0] ?? null;

  let slides: SlideRow[] = [];
  if (cardSet) {
    const slideRowsRaw = await sql`
      SELECT id, set_id, card_no, role, title, body, hashtags, html, layout
      FROM card_news_slides WHERE set_id = ${cardSet.id} ORDER BY card_no ASC
    `;
    slides = slideRowsRaw as unknown as SlideRow[];
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← 대시보드
      </Link>

      <header className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-1">
          <TagBadges importance={notice.importance} tags={notice.tags} />
        </div>
        <h1 className="mt-2 text-lg font-bold leading-snug sm:text-xl">{notice.title}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          {fmtDate(notice.published_at)} ·{" "}
          <span className={notice.source === "auto" ? "text-blue-600" : "text-neutral-500"}>
            {notice.source === "auto" ? "자동수집" : "수동"}
          </span>
        </p>
      </header>

      {/* 탭 — 모바일에서 스크롤 가능 */}
      <nav className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-neutral-200">
          <TabLink
            href={`/notices/${notice.id}?tab=info`}
            active={tab === "info"}
            label="📋 공지"
          />
          <TabLink
            href={`/notices/${notice.id}?tab=script`}
            active={tab === "script"}
            label={scripts.length ? `🎬 대본 (${scripts.length})` : "🎬 대본 (없음)"}
          />
          <TabLink
            href={`/notices/${notice.id}?tab=cardnews`}
            active={tab === "cardnews"}
            label={cardSet ? `🖼️ 카드 (${cardSet.card_count}장)` : "🖼️ 카드 (없음)"}
          />
        </div>
      </nav>

      {tab === "info" && <NoticeInfoPanel notice={notice} />}
      {tab === "script" && <ScriptPanel noticeId={noticeId} scripts={scripts} />}
      {tab === "cardnews" && <CardNewsPanel set={cardSet} slides={slides} />}
    </main>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        "whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition sm:px-4 sm:text-sm " +
        (active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-500 hover:text-neutral-900")
      }
    >
      {label}
    </Link>
  );
}

function NoticeInfoPanel({ notice }: { notice: NoticeRow }) {
  return (
    <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:space-y-6 sm:p-6">
      <div className="grid grid-cols-2 gap-3 text-sm sm:gap-4">
        <Info label="발표일" value={fmtDate(notice.published_at)} />
        <Info label="시행일" value={fmtDate(notice.effective_at)} />
      </div>

      {notice.summary && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-neutral-500">핵심 변경사항</h3>
          <div className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed">
            {notice.summary}
          </div>
        </section>
      )}

      {notice.checklist && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-neutral-500">운영자 체크리스트</h3>
          <div className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed">
            {notice.checklist}
          </div>
        </section>
      )}

      {notice.source_urls && notice.source_urls.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-neutral-500">참고 링크</h3>
          <ul className="space-y-1 text-sm">
            {notice.source_urls.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

const PERSONA_LABELS: Record<string, string> = {
  default: "기본",
  expert: "전문가",
  warm: "따뜻한 동료",
};

function fmtDateTime(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function ScriptPanel({
  noticeId,
  scripts,
}: {
  noticeId: number;
  scripts: ScriptRow[];
}) {
  return (
    <div className="space-y-4">
      <ScriptGenerateForm noticeId={noticeId} hasExisting={scripts.length > 0} />

      {scripts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          아직 이 공지의 릴스 대본이 없습니다.
          <br />
          위에서 페르소나를 골라 첫 초안을 만들어 보세요.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-neutral-500">
            총 {scripts.length}개 버전 (최신순)
          </div>
          {scripts.map((s, idx) => (
            <div key={s.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
                <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-medium text-white">
                  v{scripts.length - idx}
                </span>
                {s.persona_id && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-200">
                    {PERSONA_LABELS[s.persona_id] ?? s.persona_id}
                  </span>
                )}
                <span className="rounded-md bg-neutral-100 px-2 py-0.5">
                  {s.tone === "urgent" ? "긴박" : "기회"}
                </span>
                <span className="text-neutral-400">· {fmtDateTime(s.created_at)}</span>
                {s.guide && (
                  <span
                    className="truncate text-neutral-400"
                    title={s.guide}
                  >
                    · 가이드: {s.guide.slice(0, 30)}
                    {s.guide.length > 30 ? "…" : ""}
                  </span>
                )}
              </div>
              <ScriptEditor
                id={s.id}
                initial={{
                  title: s.title,
                  tone: s.tone,
                  body_markdown: s.body_markdown,
                  hashtags: (s.hashtags ?? []).join(" "),
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
