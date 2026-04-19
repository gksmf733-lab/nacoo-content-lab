"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERSONAS, DEFAULT_PERSONA_ID } from "@/lib/personas";

export function ScriptGenerateForm({
  noticeId,
  hasExisting,
}: {
  noticeId: number;
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [personaId, setPersonaId] = useState<string>(DEFAULT_PERSONA_ID);
  const [guide, setGuide] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notice_id: noticeId,
          persona_id: personaId,
          guide: guide.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-blue-900">
          ✨ 대본 {hasExisting ? "추가 생성" : "초안 생성"}
        </span>
        {hasExisting && (
          <span className="text-[11px] text-blue-700/70">
            (기존 대본은 유지되고, 새 버전이 추가됩니다)
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-600">페르소나</label>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          disabled={loading}
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] leading-relaxed text-neutral-500">{selected.description}</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-600">
          추가 가이드 <span className="font-normal text-neutral-400">(선택, 최우선 반영)</span>
        </label>
        <textarea
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
          rows={3}
          disabled={loading}
          placeholder="예) 훅을 더 강하게, 숫자와 기한을 명시, 전개는 3가지 포인트로 간결하게."
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        {error && <p className="mr-auto text-xs text-red-600">{error}</p>}
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              생성 중...
            </>
          ) : hasExisting ? (
            <>➕ 새 버전 생성</>
          ) : (
            <>✨ 초안 생성</>
          )}
        </button>
      </div>
    </div>
  );
}
