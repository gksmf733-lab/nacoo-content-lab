"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TagBadges } from "@/lib/tag-badge";
import { PLATFORMS, PLATFORM_ORDER, type PlatformMeta } from "@/lib/platforms";
import type { PlatformId } from "@/lib/db";

export type NoticeListItem = {
  id: number;
  title: string;
  category: string | null;
  importance: string | null;
  tags: string[] | null;
  published_at: string | null;
  effective_at: string | null;
  deadline: string | null;
  source: "auto" | "manual";
  platform: PlatformId;
  collected_at: string | null;
  has_script: boolean;
  has_card_news: boolean;
  card_qa_verdict: string | null;
};

function toDateStr(d: string | null | undefined): string {
  if (!d) return "";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function shortDate(d: string | null | undefined): string {
  const s = toDateStr(d);
  if (!s) return "-";
  const parts = s.split("-");
  return `${parts[1]}.${parts[2]}`;
}

function monthKey(d: string | null | undefined): string {
  const s = toDateStr(d);
  if (!s) return "날짜 미정";
  const parts = s.split("-");
  return `${parts[0]}년 ${parseInt(parts[1])}월`;
}

function dDay(target: string | null | undefined): number | null {
  const s = toDateStr(target);
  if (!s) return null;
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const todayMs = new Date(todayStr).getTime();
  const targetMs = new Date(s).getTime();
  return Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function NoticesList({ notices }: { notices: NoticeListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: NoticeListItem[]) {
    const ids = items.map((i) => i.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleSelectMode() {
    if (selectMode) setSelected(new Set());
    setSelectMode((v) => !v);
  }

  async function onDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `선택한 ${selected.size}건의 공지를 삭제할까요?\n연관된 대본·카드뉴스도 함께 삭제됩니다.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch("/api/notices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      setSelected(new Set());
      setSelectMode(false);
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setDeleting(false);
    }
  }

  if (notices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
        아직 수집된 공지가 없습니다. 자동화 스케줄이 다음 시간에 실행됩니다.
      </div>
    );
  }

  // 플랫폼별 그룹핑 — PLATFORM_ORDER 순서대로 전부 렌더 (0건도 표시).
  const platformGroups = new Map<PlatformId, NoticeListItem[]>();
  for (const n of notices) {
    const pid = (n.platform ?? "smartplace") as PlatformId;
    if (!platformGroups.has(pid)) platformGroups.set(pid, []);
    platformGroups.get(pid)!.push(n);
  }
  const platforms: Array<{ meta: PlatformMeta; items: NoticeListItem[] }> = PLATFORM_ORDER.map(
    (pid) => ({ meta: PLATFORMS[pid], items: platformGroups.get(pid) ?? [] })
  );

  return (
    <>
      {/* 선택 모드 토글 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] text-neutral-500">총 {notices.length}건</span>
        <button
          onClick={toggleSelectMode}
          className={
            "rounded-md border px-3 py-1 text-xs font-medium transition " +
            (selectMode
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400")
          }
        >
          {selectMode ? "선택 취소" : "선택"}
        </button>
      </div>

      <div className="space-y-4 pb-24">
        {platforms.map((p, i) => (
          <PlatformAccordion
            key={p.meta.id}
            label={p.meta.shortLabel}
            loginRequired={p.meta.loginRequired}
            count={p.items.length}
            defaultOpen={i === 0 && p.items.length > 0}
          >
            {p.items.length === 0 ? (
              <div className="pt-4 text-center text-xs text-neutral-400">
                아직 수집된 공지가 없습니다.
                {p.meta.loginRequired && (
                  <div className="mt-1 text-[11px] text-amber-600">
                    · 네이버 계정 설정(.env.local)과 쿠키 발급이 필요합니다.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8 pt-4">
                {renderMonthGroups({
                  notices: p.items,
                  selectMode,
                  selected,
                  toggle,
                  toggleGroup,
                })}
              </div>
            )}
          </PlatformAccordion>
        ))}
      </div>

      {/* 플로팅 삭제 툴바 */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-2.5 shadow-lg">
            <span className="text-xs font-medium text-neutral-700">
              {selected.size === 0 ? "항목을 선택하세요" : `${selected.size}건 선택됨`}
            </span>
            <button
              onClick={onDelete}
              disabled={selected.size === 0 || deleting}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? "삭제 중..." : "🗑️ 삭제"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PlatformAccordion({
  label,
  count,
  loginRequired = false,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  loginRequired?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-neutral-50 sm:px-5 sm:py-4"
        aria-expanded={open}
      >
        <span className={"transition-transform " + (open ? "rotate-90" : "rotate-0")}>
          ▶
        </span>
        <h2 className="text-base font-bold text-neutral-900">{label}</h2>
        {loginRequired && (
          <span
            className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
            title="네이버 로그인 필요"
          >
            🔒 로그인
          </span>
        )}
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {count}건
        </span>
      </button>
      {open && <div className="border-t border-neutral-100 px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>}
    </section>
  );
}

function renderMonthGroups({
  notices,
  selectMode,
  selected,
  toggle,
  toggleGroup,
}: {
  notices: NoticeListItem[];
  selectMode: boolean;
  selected: Set<number>;
  toggle: (id: number) => void;
  toggleGroup: (items: NoticeListItem[]) => void;
}) {
  const map = new Map<string, NoticeListItem[]>();
  for (const n of notices) {
    const key = monthKey(n.published_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  const grouped = [...map.entries()];

  return (
    <>
      {grouped.map(([month, items]) => {
          const groupIds = items.map((i) => i.id);
          const allGroupSelected = selectMode && groupIds.every((id) => selected.has(id));
          return (
            <div key={month}>
              <div className="mb-3 flex items-center gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    onChange={() => toggleGroup(items)}
                    className="h-4 w-4 accent-neutral-900"
                    aria-label={`${month} 전체 선택`}
                  />
                )}
                <h2 className="text-sm font-bold text-neutral-900">{month}</h2>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                  {items.length}건
                </span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white shadow-sm">
                {items.map((n) => {
                  const pubStr = toDateStr(n.published_at);
                  const effStr = toDateStr(n.effective_at);
                  const dlStr = toDateStr(n.deadline);
                  const hasDifferentEffective = !!effStr && effStr !== pubStr;
                  const deadlineTarget = dlStr || (hasDifferentEffective ? effStr : null);
                  const remaining = deadlineTarget ? dDay(deadlineTarget) : null;
                  const isChecked = selected.has(n.id);

                  const rowInner = (
                    <>
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggle(n.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 shrink-0 accent-neutral-900"
                          aria-label={`${n.title} 선택`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          <TagBadges importance={n.importance} tags={n.tags} />
                        </div>
                        <p className="text-sm font-medium leading-snug sm:truncate">{n.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                            <span className="text-neutral-400">발표</span> {shortDate(n.published_at)}
                          </span>
                          {hasDifferentEffective && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              <span className="text-blue-400">시행</span> {shortDate(n.effective_at)}
                            </span>
                          )}
                          {dlStr && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                              <span className="text-red-400">마감</span> {shortDate(n.deadline)}
                            </span>
                          )}
                          {n.collected_at && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200"
                              title={`DB에 수집된 날짜 (${n.collected_at})`}
                            >
                              <span className="text-neutral-400">수집</span> {shortDate(n.collected_at)}
                            </span>
                          )}
                          <span className="text-xs text-neutral-300">·</span>
                          <span
                            className={`text-[10px] ${n.source === "auto" ? "text-blue-600" : "text-neutral-500"}`}
                          >
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
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {remaining !== null ? (
                          <DdayBadge days={remaining} />
                        ) : (
                          !selectMode && <span className="text-neutral-300">→</span>
                        )}
                      </div>
                    </>
                  );

                  return (
                    <li key={n.id}>
                      {selectMode ? (
                        <button
                          type="button"
                          onClick={() => toggle(n.id)}
                          className={
                            "flex w-full items-center gap-3 px-3 py-3 text-left transition sm:px-4 sm:py-4 " +
                            (isChecked ? "bg-neutral-50" : "hover:bg-neutral-50")
                          }
                        >
                          {rowInner}
                        </button>
                      ) : (
                        <Link
                          href={`/notices/${n.id}`}
                          className="flex items-center gap-3 px-3 py-3 transition hover:bg-neutral-50 sm:px-4 sm:py-4"
                        >
                          {rowInner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
    </>
  );
}

function DdayBadge({ days }: { days: number }) {
  if (days < 0) {
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
    return (
      <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600 ring-1 ring-inset ring-red-200">
        D-{days}
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-inset ring-amber-200">
        D-{days}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[3.2rem] items-center justify-center rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600 ring-1 ring-inset ring-blue-200">
      D-{days}
    </span>
  );
}
