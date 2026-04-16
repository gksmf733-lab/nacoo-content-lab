"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CardLayout = {
  titleAlign?: "left" | "center";
  titleSize?: "sm" | "md" | "lg" | "xl";
  bodySize?: "sm" | "md" | "lg";
  bodyOffset?: number;
  pointText?: string;
  pointLabel?: string;
  icon?: string;
  sub?: string;
};

export type SlideRow = {
  id: number;
  set_id: number;
  card_no: number;
  role: string;
  title: string;
  body: string;
  hashtags: string[] | null;
  html: string | null;
  layout: CardLayout | null;
};

export type SetRow = {
  id: number;
  notice_id: number;
  audience: string | null;
  tone: string | null;
  card_count: number;
  status: string;
  qa_verdict: string | null;
  qa_issues: Array<{
    severity?: string;
    stage?: string;
    card?: number;
    problem?: string;
    suggested_action?: string;
  }> | null;
};

export function CardNewsPanel({
  set,
  slides,
}: {
  set: SetRow | null;
  slides: SlideRow[];
}) {
  if (!set) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
        아직 이 공지의 카드뉴스가 생성되지 않았습니다.
        <br />
        자동화 에이전트가 다음 스케줄(09:00 / 14:00 / 18:00 KST)에 생성합니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SetHeader set={set} />
      <ol className="space-y-4">
        {slides.map((s) => (
          <SlideCard key={s.id} slide={s} />
        ))}
      </ol>
      {set.qa_issues && set.qa_issues.length > 0 && <QaPanel issues={set.qa_issues} />}
      <DangerZone setId={set.id} />
    </div>
  );
}

function SetHeader({ set }: { set: SetRow }) {
  const [copied, setCopied] = useState(false);
  const verdictBadge =
    set.qa_verdict === "pass" ? (
      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        ✅ QA pass
      </span>
    ) : set.qa_verdict === "needs-fix" ? (
      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
        ⚠️ QA needs-fix
      </span>
    ) : (
      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
        QA 미실행
      </span>
    );

  async function saveLocal() {
    const cmd = `npm run save:cards -- ${set.id}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("아래 명령어를 터미널에서 실행하세요 (직접 복사):", cmd);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 shadow-sm sm:gap-3 sm:px-4">
        <span className="text-[11px] text-neutral-500">타깃</span>
        <span className="text-xs font-medium sm:text-sm">{set.audience ?? "-"}</span>
        <span className="text-neutral-300">|</span>
        <span className="text-[11px] text-neutral-500">톤</span>
        <span className="text-xs font-medium sm:text-sm">{set.tone ?? "-"}</span>
        <span className="text-neutral-300">|</span>
        <span className="text-[11px] text-neutral-500">카드</span>
        <span className="text-xs font-medium sm:text-sm">{set.card_count}장</span>
        <span className="ml-auto">{verdictBadge}</span>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="text-[11px] text-neutral-600 sm:text-xs">
          💾 <span className="font-medium">로컬 저장</span> — 명령어를 복사 후 터미널에서 실행
        </div>
        <button
          onClick={saveLocal}
          className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 sm:w-auto"
        >
          {copied ? "✓ 복사됨" : "로컬에 저장 명령 복사"}
        </button>
      </div>
    </div>
  );
}

const TITLE_SIZE_OPTIONS: Array<NonNullable<CardLayout["titleSize"]>> = ["sm", "md", "lg", "xl"];
const BODY_SIZE_OPTIONS: Array<NonNullable<CardLayout["bodySize"]>> = ["sm", "md", "lg"];

function SlideCard({ slide }: { slide: SlideRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: slide.title,
    body: slide.body,
    hashtags: (slide.hashtags ?? []).join(" "),
  });
  const [layout, setLayout] = useState<CardLayout>(slide.layout ?? {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/card-news/slides/${slide.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        body: form.body,
        hashtags: form.hashtags.split(/\s+/).filter(Boolean),
        layout,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert("저장 실패: " + (j.error ?? res.statusText));
    }
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col sm:grid sm:grid-cols-[280px_1fr]">
        {/* 미리보기 — 모바일: 폭 맞춤 / PC: 280×350 고정 */}
        <div className="flex items-center justify-center border-b border-neutral-200 bg-neutral-50 p-3 sm:border-b-0 sm:border-r sm:p-4">
          {slide.html ? (
            <div
              className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm"
              style={{ width: 200, height: 250 }}
            >
              <iframe
                key={slide.html.length + ":" + slide.html.slice(0, 32)}
                title={`card-${slide.card_no}`}
                srcDoc={slide.html}
                sandbox=""
                scrolling="no"
                className="sm:!w-[1080px] sm:!h-[1350px] sm:!scale-[0.2593]"
                style={{
                  width: 1080,
                  height: 1350,
                  border: 0,
                  transform: "scale(0.1852)",
                  transformOrigin: "0 0",
                  pointerEvents: "none",
                }}
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-md border border-dashed border-neutral-300 text-[11px] text-neutral-400"
              style={{ width: 200, height: 250 }}
            >
              HTML 없음
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="space-y-2 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
              Card {slide.card_no}
            </span>
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {slide.role}
            </span>
          </div>

          {editing ? (
            <>
              <label className="block text-[10px] font-semibold text-neutral-500">제목</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <label className="block text-[10px] font-semibold text-neutral-500">본문</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <label className="block text-[10px] font-semibold text-neutral-500">해시태그</label>
              <input
                type="text"
                value={form.hashtags}
                onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                placeholder="#해시 #태그"
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
              />

              <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-2">
                <div className="text-[10px] font-semibold text-neutral-500">레이아웃</div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">정렬</span>
                    <select
                      value={layout.titleAlign ?? ""}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          titleAlign: (e.target.value || undefined) as CardLayout["titleAlign"],
                        })
                      }
                      className="flex-1 rounded border border-neutral-300 px-1 py-0.5"
                    >
                      <option value="">(기본)</option>
                      <option value="left">왼쪽</option>
                      <option value="center">가운데</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">제목 크기</span>
                    <select
                      value={layout.titleSize ?? ""}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          titleSize: (e.target.value || undefined) as CardLayout["titleSize"],
                        })
                      }
                      className="flex-1 rounded border border-neutral-300 px-1 py-0.5"
                    >
                      <option value="">(기본 md)</option>
                      {TITLE_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">본문 크기</span>
                    <select
                      value={layout.bodySize ?? ""}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          bodySize: (e.target.value || undefined) as CardLayout["bodySize"],
                        })
                      }
                      className="flex-1 rounded border border-neutral-300 px-1 py-0.5"
                    >
                      <option value="">(기본 md)</option>
                      {BODY_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">본문 위치</span>
                    <input
                      type="range"
                      min={-60}
                      max={200}
                      step={10}
                      value={layout.bodyOffset ?? 0}
                      onChange={(e) =>
                        setLayout({ ...layout, bodyOffset: Number(e.target.value) })
                      }
                      className="flex-1"
                    />
                    <span className="w-8 text-right tabular-nums text-neutral-500">
                      {layout.bodyOffset ?? 0}
                    </span>
                  </label>
                </div>

                {(slide.role === "body" || slide.role === "context" || slide.role === "본문" || slide.role === "맥락") && (
                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">POINT</span>
                    <input
                      type="text"
                      value={layout.pointText ?? ""}
                      onChange={(e) => setLayout({ ...layout, pointText: e.target.value })}
                      placeholder="포인트 박스 문구 (비우면 숨김)"
                      className="flex-1 rounded border border-neutral-300 px-1 py-0.5"
                    />
                  </label>
                )}

                {(slide.role === "hook" || slide.role === "훅") && (
                  <label className="flex items-center gap-1 text-[11px]">
                    <span className="text-neutral-500 w-14">아이콘</span>
                    <input
                      type="text"
                      value={layout.icon ?? ""}
                      onChange={(e) => setLayout({ ...layout, icon: e.target.value })}
                      placeholder="🎬 (비우면 제목 앞 이모지 자동 사용)"
                      className="flex-1 rounded border border-neutral-300 px-1 py-0.5"
                    />
                  </label>
                )}

                <button
                  onClick={() => setLayout({})}
                  className="text-[10px] text-neutral-500 hover:underline"
                >
                  레이아웃 초기화
                </button>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      title: slide.title,
                      body: slide.body,
                      hashtags: (slide.hashtags ?? []).join(" "),
                    });
                    setLayout(slide.layout ?? {});
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs"
                >
                  취소
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장 (카드 재생성)"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold leading-snug">{slide.title}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
                {slide.body}
              </p>
              {slide.hashtags && slide.hashtags.length > 0 && (
                <p className="text-[11px] text-neutral-500">{slide.hashtags.join(" ")}</p>
              )}
              <div className="pt-1">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                >
                  편집
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function QaPanel({
  issues,
}: {
  issues: NonNullable<SetRow["qa_issues"]>;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h4 className="mb-2 text-xs font-semibold text-amber-800">QA 리뷰 이슈</h4>
      <ul className="space-y-1 text-xs text-amber-900">
        {issues.map((it, i) => (
          <li key={i}>
            <span className="font-semibold">
              [{it.severity ?? "?"}] {it.stage ?? "?"}
              {it.card != null ? ` · Card ${it.card}` : ""}
            </span>{" "}
            — {it.problem ?? "-"}
            {it.suggested_action && (
              <span className="ml-1 text-amber-700">→ {it.suggested_action}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DangerZone({ setId }: { setId: number }) {
  const router = useRouter();
  async function remove() {
    if (!confirm("이 카드뉴스 세트를 정말 삭제할까요?")) return;
    const res = await fetch(`/api/card-news/${setId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }
  return (
    <div className="flex justify-end">
      <button
        onClick={remove}
        className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        세트 삭제
      </button>
    </div>
  );
}
