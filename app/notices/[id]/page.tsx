import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { TagBadges } from "@/lib/tag-badge";
import { ScriptEditor } from "./script-editor";
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
    sql`SELECT * FROM reels_scripts WHERE notice_id = ${noticeId} LIMIT 1`,
    sql`SELECT id, notice_id, audience, tone, card_count, status, qa_verdict, qa_issues
        FROM card_news_sets WHERE notice_id = ${noticeId} LIMIT 1`,
  ]);
  const noticeRows = noticeRowsRaw as unknown as NoticeRow[];
  const scriptRows = scriptRowsRaw as unknown as ScriptRow[];
  const setRows = setRowsRaw as unknown as SetRow[];

  if (noticeRows.length === 0) notFound();
  const notice = noticeRows[0];
  const script = scriptRows[0] ?? null;
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← 대시보드
      </Link>

      <header className="mt-3 mb-6">
        <div className="flex items-center gap-2">
          <TagBadges importance={notice.importance} tags={notice.tags} />
        </div>
        <h1 className="mt-2 text-xl font-bold leading-snug">{notice.title}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          {fmtDate(notice.published_at)} ·{" "}
          <span className={notice.source === "auto" ? "text-blue-600" : "text-neutral-500"}>
            {notice.source === "auto" ? "자동수집" : "수동"}
          </span>
        </p>
      </header>

      {/* 탭 */}
      <nav className="mb-6 flex gap-1 border-b border-neutral-200">
        <TabLink
          href={`/notices/${notice.id}?tab=info`}
          active={tab === "info"}
          label="📋 공지 내용"
        />
        <TabLink
          href={`/notices/${notice.id}?tab=script`}
          active={tab === "script"}
          label={script ? "🎬 릴스 대본" : "🎬 릴스 대본 (없음)"}
        />
        <TabLink
          href={`/notices/${notice.id}?tab=cardnews`}
          active={tab === "cardnews"}
          label={cardSet ? `🖼️ 카드뉴스 (${cardSet.card_count}장)` : "🖼️ 카드뉴스 (없음)"}
        />
      </nav>

      {tab === "info" && <NoticeInfoPanel notice={notice} />}
      {tab === "script" && <ScriptPanel script={script} />}
      {tab === "cardnews" && <CardNewsPanel set={cardSet} slides={slides} />}
    </main>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition " +
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
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-2 gap-4 text-sm">
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

function ScriptPanel({ script }: { script: ScriptRow | null }) {
  if (!script) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
        아직 이 공지의 릴스 대본이 생성되지 않았습니다.
        <br />
        자동화 에이전트가 다음 스케줄(09:00 / 18:00 KST)에 생성합니다.
      </div>
    );
  }

  return (
    <ScriptEditor
      id={script.id}
      initial={{
        title: script.title,
        tone: script.tone,
        body_markdown: script.body_markdown,
        hashtags: (script.hashtags ?? []).join(" "),
      }}
    />
  );
}
