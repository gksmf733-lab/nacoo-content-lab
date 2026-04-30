"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ThumbLayout,
  QuoteLayout,
  CompareLayout,
  TimelineLayout,
  ChecklistLayout,
  InsightLayout,
} from "@/lib/nacoo-card-html";

// 공통 input/textarea 스타일
const inputCls =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-neutral-900 focus:outline-none disabled:opacity-50";
const labelCls = "block text-[11px] font-semibold text-neutral-600";

type SaveResult = { ok: true } | { error: string };

async function patchSlide(
  slideId: number,
  layout: object,
  title: string,
  body: string,
): Promise<SaveResult> {
  const res = await fetch(`/api/card-news/slides/${slideId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout, title, body }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "저장 실패" };
  return { ok: true };
}

// ── 메인 진입점 ──
export function NacooSlideEditor({
  slideId,
  role,
  initialLayout,
  onClose,
}: {
  slideId: number;
  role: string;
  initialLayout: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextLayout: object, derivedTitle: string, derivedBody: string) {
    setSaving(true);
    setError(null);
    const r = await patchSlide(slideId, nextLayout, derivedTitle, derivedBody);
    setSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    router.refresh();
    onClose();
  }

  if (role === "cta") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong>CTA 슬라이드는 편집 금지</strong>
        <div className="mt-1 text-[11px] text-amber-800">
          브랜드 일관성을 위해 모든 카드뉴스에 동일한 CTA 가 사용됩니다 (CTA_고정.md).
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-md bg-amber-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-800"
        >
          닫기
        </button>
      </div>
    );
  }

  const wrapper = (children: React.ReactNode) => (
    <div className="space-y-3 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      {children}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      <p className="text-[10px] text-neutral-400">
        저장 시 HTML 자동 재렌더링됩니다 · saving={saving ? "예" : "아니오"}
      </p>
    </div>
  );

  switch (role) {
    case "thumb":
      return wrapper(
        <ThumbForm
          initial={initialLayout as ThumbLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.titleLines.join(" "), d.subLine1)}
        />,
      );
    case "quote":
      return wrapper(
        <QuoteForm
          initial={initialLayout as QuoteLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.label, `${d.quoteLine1} ${d.quoteHighlight}`)}
        />,
      );
    case "compare":
      return wrapper(
        <CompareForm
          initial={initialLayout as CompareLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.label, `${d.headLine1} ${d.headHighlight}`)}
        />,
      );
    case "timeline":
      return wrapper(
        <TimelineForm
          initial={initialLayout as TimelineLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.label, `${d.headLine1} ${d.headHighlight}`)}
        />,
      );
    case "checklist":
      return wrapper(
        <ChecklistForm
          initial={initialLayout as ChecklistLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.label, d.head)}
        />,
      );
    case "insight":
      return wrapper(
        <InsightForm
          initial={initialLayout as InsightLayout | null}
          saving={saving}
          onCancel={onClose}
          onSave={(d) => save(d, d.label, `${d.headPrefix} ${d.headHighlight}`)}
        />,
      );
    default:
      return (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          지원하지 않는 슬라이드 타입: {role}
        </div>
      );
  }
}

// ── 공통 액션 영역 ──
function Actions({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        onClick={onCancel}
        disabled={saving}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
      >
        취소
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}

// ── 1. 썸네일 ──
function ThumbForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: ThumbLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: ThumbLayout) => void;
}) {
  const fallback: ThumbLayout = {
    titleLines: ["", "", "", ""],
    emphasisIndex: 2,
    lightIndex: 1,
    titleSize: 104,
    subLine1: "",
  };
  const [d, setD] = useState<ThumbLayout>(initial ?? fallback);

  function setLine(i: number, v: string) {
    const next = [...d.titleLines] as ThumbLayout["titleLines"];
    next[i] = v;
    setD({ ...d, titleLines: next });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">1. 썸네일 편집</h4>

      <div className="space-y-2">
        <label className={labelCls}>메인 타이틀 4줄 (각 줄 ≤13자)</label>
        {d.titleLines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-[10px] text-neutral-400">{i}</span>
            <input
              value={line}
              onChange={(e) => setLine(i, e.target.value)}
              className={inputCls}
              placeholder={`${i + 1}번째 줄`}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>골든 강조 줄</label>
          <select
            value={d.emphasisIndex ?? 2}
            onChange={(e) => setD({ ...d, emphasisIndex: Number(e.target.value) })}
            className={inputCls}
          >
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={i}>{i + 1}번째</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>연회색 줄</label>
          <select
            value={d.lightIndex ?? 1}
            onChange={(e) => setD({ ...d, lightIndex: Number(e.target.value) })}
            className={inputCls}
          >
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={i}>{i + 1}번째</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>폰트 크기 px</label>
          <select
            value={d.titleSize ?? 120}
            onChange={(e) => setD({ ...d, titleSize: Number(e.target.value) })}
            className={inputCls}
          >
            <option value={120}>120 (기본)</option>
            <option value={104}>104 (4줄)</option>
            <option value={92}>92 (긴 줄)</option>
            <option value={80}>80 (매우 긴 줄)</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>서브 1줄</label>
        <input
          value={d.subLine1}
          onChange={(e) => setD({ ...d, subLine1: e.target.value })}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>서브 2줄 앞</label>
          <input
            value={d.subLine2Prefix ?? ""}
            onChange={(e) => setD({ ...d, subLine2Prefix: e.target.value })}
            className={inputCls}
            placeholder="(선택)"
          />
        </div>
        <div>
          <label className={labelCls}>골든 강조</label>
          <input
            value={d.subHighlight ?? ""}
            onChange={(e) => setD({ ...d, subHighlight: e.target.value })}
            className={inputCls}
            placeholder="(선택)"
          />
        </div>
        <div>
          <label className={labelCls}>서브 2줄 뒤</label>
          <input
            value={d.subSuffix ?? ""}
            onChange={(e) => setD({ ...d, subSuffix: e.target.value })}
            className={inputCls}
            placeholder="(선택)"
          />
        </div>
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}

// ── 2. 인용/핵심요약 ──
function QuoteForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: QuoteLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: QuoteLayout) => void;
}) {
  const fallback: QuoteLayout = {
    label: "핵심 요약",
    quoteLine1: "",
    quoteHighlight: "",
    items: [
      { title: "", desc: "" },
      { title: "", desc: "" },
      { title: "", desc: "" },
    ],
    conclusion: "",
  };
  const [d, setD] = useState<QuoteLayout>(initial ?? fallback);

  function setItem(i: number, key: "title" | "desc", v: string) {
    const items = [...d.items];
    items[i] = { ...items[i], [key]: v };
    setD({ ...d, items });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">2. 핵심 요약 편집</h4>

      <div>
        <label className={labelCls}>라벨 (예: 핵심 요약 / 이슈 / 문제)</label>
        <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>큰 인용문 1줄 (보통)</label>
          <input value={d.quoteLine1} onChange={(e) => setD({ ...d, quoteLine1: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>큰 인용문 2줄 (골든 강조)</label>
          <input value={d.quoteHighlight} onChange={(e) => setD({ ...d, quoteHighlight: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelCls}>항목 3개</label>
        {d.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[40px_1fr_2fr] items-center gap-2">
            <span className="text-center text-[11px] font-semibold text-neutral-500">0{i + 1}</span>
            <input
              value={it.title}
              onChange={(e) => setItem(i, "title", e.target.value)}
              className={inputCls}
              placeholder="제목 (≤8자)"
            />
            <input
              value={it.desc}
              onChange={(e) => setItem(i, "desc", e.target.value)}
              className={inputCls}
              placeholder="설명 (≤30자)"
            />
          </div>
        ))}
      </div>

      <div>
        <label className={labelCls}>결론 한 줄 (선택, 골든 가로선 + 회색 텍스트)</label>
        <input value={d.conclusion ?? ""} onChange={(e) => setD({ ...d, conclusion: e.target.value })} className={inputCls} />
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}

// ── 3. 진단/안내 ──
function CompareForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: CompareLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: CompareLayout) => void;
}) {
  const fallback: CompareLayout = {
    label: "안내",
    headLine1: "",
    headHighlight: "",
    rows: Array.from({ length: 4 }, () => ({ tag: "", text: "", type: "right" as const })),
    verdictLine1: "",
  };
  const [d, setD] = useState<CompareLayout>(initial ?? fallback);

  function setRow(i: number, patch: Partial<CompareLayout["rows"][number]>) {
    const rows = [...d.rows];
    rows[i] = { ...rows[i], ...patch };
    setD({ ...d, rows });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">3. 안내 / 진단 편집</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>라벨 (안내 / 진단 / 비교)</label>
          <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>헤드 1줄</label>
          <input value={d.headLine1} onChange={(e) => setD({ ...d, headLine1: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>골든 밑줄</label>
          <input value={d.headHighlight} onChange={(e) => setD({ ...d, headHighlight: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>꼬리말</label>
          <input value={d.headSuffix ?? ""} onChange={(e) => setD({ ...d, headSuffix: e.target.value })} className={inputCls} placeholder="(선택)" />
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelCls}>행 4개</label>
        {d.rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[60px_1fr_3fr_70px] items-center gap-2">
            <span className="text-center text-[11px] font-semibold text-neutral-500">행 {i + 1}</span>
            <input
              value={r.tag}
              onChange={(e) => setRow(i, { tag: e.target.value })}
              className={inputCls}
              placeholder="태그"
            />
            <input
              value={r.text}
              onChange={(e) => setRow(i, { text: e.target.value })}
              className={inputCls}
              placeholder="본문"
            />
            <select
              value={r.type}
              onChange={(e) => setRow(i, { type: e.target.value as "right" | "wrong" })}
              className={inputCls}
            >
              <option value="right">right</option>
              <option value="wrong">wrong</option>
            </select>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>verdict 앞</label>
          <input value={d.verdictLine1} onChange={(e) => setD({ ...d, verdictLine1: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>verdict 굵은 강조</label>
          <input value={d.verdictBold ?? ""} onChange={(e) => setD({ ...d, verdictBold: e.target.value })} className={inputCls} placeholder="(선택)" />
        </div>
        <div>
          <label className={labelCls}>verdict 뒤</label>
          <input value={d.verdictSuffix ?? ""} onChange={(e) => setD({ ...d, verdictSuffix: e.target.value })} className={inputCls} placeholder="(선택)" />
        </div>
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}

// ── 4. 타임라인 ──
function TimelineForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: TimelineLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: TimelineLayout) => void;
}) {
  const fallback: TimelineLayout = {
    label: "절차",
    headLine1: "",
    headHighlight: "",
    steps: Array.from({ length: 4 }, () => ({ time: "", title: "", desc: "" })),
  };
  const [d, setD] = useState<TimelineLayout>(initial ?? fallback);

  function setStep(i: number, patch: Partial<TimelineLayout["steps"][number]>) {
    const steps = [...d.steps];
    steps[i] = { ...steps[i], ...patch };
    setD({ ...d, steps });
  }
  function addStep() {
    if (d.steps.length >= 5) return;
    setD({ ...d, steps: [...d.steps, { time: "", title: "", desc: "" }] });
  }
  function removeStep(i: number) {
    if (d.steps.length <= 3) return;
    setD({ ...d, steps: d.steps.filter((_, idx) => idx !== i) });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">4. 절차 / 타임라인 편집</h4>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>라벨 (절차/방법/대상)</label>
          <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>헤드 1줄 (보통)</label>
          <input value={d.headLine1} onChange={(e) => setD({ ...d, headLine1: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>헤드 강조 (골든)</label>
          <input value={d.headHighlight} onChange={(e) => setD({ ...d, headHighlight: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelCls}>단계 (3~5개)</label>
        {d.steps.map((s, i) => (
          <div key={i} className="space-y-1 rounded-md border border-neutral-200 bg-white p-2">
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span className="font-semibold">단계 {i + 1}</span>
              <button
                type="button"
                onClick={() => removeStep(i)}
                disabled={d.steps.length <= 3}
                className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
              >
                삭제
              </button>
            </div>
            <input
              value={s.time}
              onChange={(e) => setStep(i, { time: e.target.value })}
              className={inputCls}
              placeholder="STEP 01 · 시점"
            />
            <input
              value={s.title}
              onChange={(e) => setStep(i, { title: e.target.value })}
              className={inputCls}
              placeholder="제목"
            />
            <input
              value={s.desc}
              onChange={(e) => setStep(i, { desc: e.target.value })}
              className={inputCls}
              placeholder="설명"
            />
          </div>
        ))}
        {d.steps.length < 5 && (
          <button
            type="button"
            onClick={addStep}
            className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-500"
          >
            + 단계 추가 ({d.steps.length}/5)
          </button>
        )}
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}

// ── 5. 체크리스트 ──
function ChecklistForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: ChecklistLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: ChecklistLayout) => void;
}) {
  const fallback: ChecklistLayout = {
    label: "체크리스트",
    captureTag: "캡처해서 매장에 적용",
    head: "",
    headSub: "",
    checks: Array.from({ length: 5 }, () => ({ title: "", dim: "" })),
  };
  const [d, setD] = useState<ChecklistLayout>(initial ?? fallback);

  function setCheck(i: number, patch: Partial<ChecklistLayout["checks"][number]>) {
    const checks = [...d.checks];
    checks[i] = { ...checks[i], ...patch };
    setD({ ...d, checks });
  }
  function addCheck() {
    if (d.checks.length >= 7) return;
    setD({ ...d, checks: [...d.checks, { title: "", dim: "" }] });
  }
  function removeCheck(i: number) {
    if (d.checks.length <= 3) return;
    setD({ ...d, checks: d.checks.filter((_, idx) => idx !== i) });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">5. 체크리스트 / FAQ 편집</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>라벨</label>
          <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>캡처 태그</label>
          <input value={d.captureTag} onChange={(e) => setD({ ...d, captureTag: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>헤드</label>
          <input value={d.head} onChange={(e) => setD({ ...d, head: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>서브 (선택)</label>
          <input value={d.headSub ?? ""} onChange={(e) => setD({ ...d, headSub: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelCls}>항목 (3~7개)</label>
        {d.checks.map((c, i) => (
          <div key={i} className="space-y-1 rounded-md border border-neutral-200 bg-white p-2">
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span className="font-semibold">항목 {i + 1}</span>
              <button
                type="button"
                onClick={() => removeCheck(i)}
                disabled={d.checks.length <= 3}
                className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
              >
                삭제
              </button>
            </div>
            <input
              value={c.title}
              onChange={(e) => setCheck(i, { title: e.target.value })}
              className={inputCls}
              placeholder="핵심 (≤25자)"
            />
            <input
              value={c.dim ?? ""}
              onChange={(e) => setCheck(i, { dim: e.target.value })}
              className={inputCls}
              placeholder="부가설명 (선택, ≤40자)"
            />
          </div>
        ))}
        {d.checks.length < 7 && (
          <button
            type="button"
            onClick={addCheck}
            className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-500"
          >
            + 항목 추가 ({d.checks.length}/7)
          </button>
        )}
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}

// ── 6. 인사이트 ──
function InsightForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: InsightLayout | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (d: InsightLayout) => void;
}) {
  const fallback: InsightLayout = {
    label: "인사이트",
    keyStamp: "본질",
    headPrefix: "",
    headHighlight: "",
    headSuffix: "",
    headLine2: "",
    points: Array.from({ length: 4 }, () => ({ title: "", desc: "" })),
  };
  const [d, setD] = useState<InsightLayout>(initial ?? fallback);

  function setPoint(i: number, patch: Partial<InsightLayout["points"][number]>) {
    const points = [...d.points];
    points[i] = { ...points[i], ...patch };
    setD({ ...d, points });
  }

  return (
    <>
      <h4 className="text-sm font-bold text-neutral-900">6. 인사이트 (KEY) 편집</h4>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>라벨 (보통 "인사이트")</label>
          <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>KEY 스탬프 (본질/정리/핵심)</label>
          <input value={d.keyStamp} onChange={(e) => setD({ ...d, keyStamp: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>헤드 1줄 앞</label>
          <input value={d.headPrefix} onChange={(e) => setD({ ...d, headPrefix: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>cream 강조</label>
          <input value={d.headHighlight} onChange={(e) => setD({ ...d, headHighlight: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>헤드 1줄 뒤</label>
          <input value={d.headSuffix ?? ""} onChange={(e) => setD({ ...d, headSuffix: e.target.value })} className={inputCls} placeholder="(선택)" />
        </div>
      </div>

      <div>
        <label className={labelCls}>헤드 2줄 (선택)</label>
        <input value={d.headLine2 ?? ""} onChange={(e) => setD({ ...d, headLine2: e.target.value })} className={inputCls} />
      </div>

      <div className="space-y-2">
        <label className={labelCls}>핵심 4가지</label>
        {d.points.map((p, i) => (
          <div key={i} className="grid grid-cols-[40px_1fr_2fr] items-center gap-2">
            <span className="text-center text-[11px] font-semibold text-neutral-500">0{i + 1}</span>
            <input
              value={p.title}
              onChange={(e) => setPoint(i, { title: e.target.value })}
              className={inputCls}
              placeholder="제목 (≤14자)"
            />
            <input
              value={p.desc}
              onChange={(e) => setPoint(i, { desc: e.target.value })}
              className={inputCls}
              placeholder="설명 (≤40자)"
            />
          </div>
        ))}
      </div>

      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(d)} />
    </>
  );
}
