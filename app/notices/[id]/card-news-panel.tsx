"use client";

import { useState, useRef, useEffect } from "react";
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
  noticeTitle,
}: {
  set: SetRow | null;
  slides: SlideRow[];
  noticeTitle: string;
}) {
  if (!set) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-500">
          아직 이 공지의 카드뉴스가 생성되지 않았습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SetHeader set={set} noticeTitle={noticeTitle} />
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

function SetHeader({ set, noticeTitle }: { set: SetRow; noticeTitle: string }) {
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [saveResult, setSaveResult] = useState<
    | { ok: true; count: number; filename: string }
    | { ok: false; error: string }
    | null
  >(null);
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

  /** 파일시스템 안전 문자만 남김 */
  function safeName(s: string): string {
    return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
  }

  /** 카드뉴스 ZIP 다운로드 (클라이언트 사이드, Vercel/로컬 어디서든 동작) */
  async function downloadZip() {
    if (saving) return;
    setSaving(true);
    setSaveResult(null);
    setProgress(null);

    try {
      // 1. 슬라이드 조회
      const listRes = await fetch(`/api/card-news?notice_id=${set.notice_id}`);
      if (!listRes.ok) throw new Error(`목록 조회 실패 (${listRes.status})`);
      const listData = await listRes.json();
      const slides: Array<{ card_no: number; html: string | null }> =
        (listData.slides ?? []).filter((s: { html: string | null }) => s.html);
      if (slides.length === 0) throw new Error("저장할 슬라이드가 없습니다.");

      const safeTitle = safeName(noticeTitle);

      // 2. lazy import (번들 크기 최소화)
      const [{ default: JSZip }, { default: html2canvas }] = await Promise.all([
        import("jszip"),
        import("html2canvas"),
      ]);

      const zip = new JSZip();
      setProgress({ current: 0, total: slides.length });

      // 3. 각 슬라이드를 iframe에 렌더 → 캡처 → ZIP에 추가
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const html = slide.html!;

        const iframe = document.createElement("iframe");
        iframe.style.cssText =
          "position:fixed;top:0;left:-10000px;width:1080px;height:1350px;border:0;";
        iframe.srcdoc = html;
        document.body.appendChild(iframe);

        try {
          // iframe 로드 대기
          await new Promise<void>((resolve, reject) => {
            iframe.addEventListener("load", () => resolve(), { once: true });
            iframe.addEventListener("error", () => reject(new Error("iframe load error")), {
              once: true,
            });
          });

          // iframe 내부 문서의 폰트 로드 대기
          const ifDoc = iframe.contentDocument;
          if (!ifDoc) throw new Error("iframe contentDocument 없음");
          if (ifDoc.fonts?.ready) {
            await ifDoc.fonts.ready;
          }
          // 그라디언트/이미지 렌더 안정화
          await new Promise((r) => setTimeout(r, 400));

          const target = ifDoc.body;
          const canvas = await html2canvas(target, {
            width: 1080,
            height: 1350,
            windowWidth: 1080,
            windowHeight: 1350,
            scale: 2,
            useCORS: true,
            backgroundColor: null,
            logging: false,
          });

          const blob: Blob | null = await new Promise((r) =>
            canvas.toBlob((b) => r(b), "image/jpeg", 0.92),
          );
          if (!blob) throw new Error(`card-${slide.card_no} blob 생성 실패`);
          zip.file(`${safeTitle}-${slide.card_no}.jpg`, blob);
          setProgress({ current: i + 1, total: slides.length });
        } finally {
          iframe.remove();
        }
      }

      // 4. spec.json (파일 목록 + 메타)
      zip.file(
        "spec.json",
        JSON.stringify(
          {
            set_id: set.id,
            notice_id: set.notice_id,
            title: noticeTitle,
            saved_at: new Date().toISOString(),
            cards: slides.map((s) => ({ n: s.card_no, file: `${safeTitle}-${s.card_no}.jpg` })),
          },
          null,
          2,
        ),
      );

      // 5. ZIP 생성 + 다운로드 트리거
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const filename = `${safeTitle}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setSaveResult({ ok: true, count: slides.length, filename });
    } catch (e: unknown) {
      setSaveResult({ ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류" });
    } finally {
      setSaving(false);
      setProgress(null);
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
      <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="min-w-0 text-xs text-neutral-600">
          📦 <span className="font-medium">카드뉴스 ZIP 다운로드</span> —{" "}
          <span className="text-neutral-500">
            {saveResult?.ok ? (
              `✅ ${saveResult.count}장 · ${saveResult.filename}`
            ) : saveResult && !saveResult.ok ? (
              <span className="text-red-600">⚠ {saveResult.error}</span>
            ) : progress ? (
              `렌더링 중 ${progress.current}/${progress.total}...`
            ) : (
              "제목.zip 파일로 다운로드 (브라우저 기본 다운로드 폴더)"
            )}
          </span>
        </div>
        <button
          onClick={downloadZip}
          disabled={saving}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {saving
            ? progress
              ? `${progress.current}/${progress.total}...`
              : "준비 중..."
            : "ZIP 다운로드"}
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
        {/* 미리보기 — 모바일: 가로 꽉 참 / PC: 240×300 고정 */}
        <div className="flex items-center justify-center border-b border-neutral-200 bg-neutral-50 p-3 sm:border-b-0 sm:border-r sm:p-4">
          {slide.html ? (
            <CardPreview html={slide.html} cardNo={slide.card_no} />
          ) : (
            <div
              className="flex aspect-[4/5] w-full max-w-[260px] items-center justify-center rounded-md border border-dashed border-neutral-300 text-[11px] text-neutral-400 sm:w-[220px]"
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

/**
 * 반응형 카드 미리보기.
 * 모바일: 가용 너비에 맞춰 자동 스케일, PC: 220×275 고정.
 * iframe은 항상 1080×1350으로 렌더 후 CSS scale로 축소.
 */
function CardPreview({ html, cardNo }: { html: string; cardNo: number }) {
  // PC 기준 크기
  const pcW = 220;
  const pcH = 275;
  const pcScale = pcW / 1080; // ≈ 0.2037

  return (
    <>
      {/* 모바일: aspect-ratio로 비율 유지, 가로 꽉 참 */}
      <div
        className="relative w-full max-w-[300px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm sm:hidden"
        style={{ aspectRatio: "4 / 5" }}
      >
        <iframe
          key={html.length + ":" + html.slice(0, 32)}
          title={`card-${cardNo}`}
          srcDoc={html}
          sandbox=""
          scrolling="no"
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: 1080,
            height: 1350,
            border: 0,
            transform: "scale(calc(min(300px, 100%) / 1080))",
            /* JS로 정확히 맞추기 어려우므로 CSS 변수 + 퍼센트 기반 대체 */
            pointerEvents: "none",
          }}
        />
        {/* JS 기반 정확한 스케일링 */}
        <MobileIframeScaler html={html} cardNo={cardNo} />
      </div>

      {/* PC: 고정 크기 */}
      <div
        className="relative hidden overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm sm:block"
        style={{ width: pcW, height: pcH }}
      >
        <iframe
          key={html.length + ":" + html.slice(0, 32)}
          title={`card-${cardNo}`}
          srcDoc={html}
          sandbox=""
          scrolling="no"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 1350,
            border: 0,
            transform: `scale(${pcScale})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
          }}
        />
      </div>
    </>
  );
}

/** 모바일에서 컨테이너 실제 너비에 맞춰 iframe 스케일 조정 */
function MobileIframeScaler({ html, cardNo }: { html: string; cardNo: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.278); // 300/1080 기본값

  useEffect(() => {
    function update() {
      if (ref.current?.parentElement) {
        const w = ref.current.parentElement.clientWidth;
        setScale(w / 1080);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      <iframe
        key={html.length + ":" + html.slice(0, 32)}
        title={`card-m-${cardNo}`}
        srcDoc={html}
        sandbox=""
        scrolling="no"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1350,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      />
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
