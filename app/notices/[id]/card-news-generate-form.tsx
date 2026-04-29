"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CardNewsGenerateForm({
  noticeId,
  hasExisting,
}: {
  noticeId: number;
  hasExisting?: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (generating) return;
    if (
      hasExisting &&
      !confirm("기존 카드뉴스를 삭제하고 새로 생성합니다. 계속할까요?")
    )
      return;

    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/card-news/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice_id: noticeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "카드뉴스 생성 실패");
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="mb-1 text-sm font-semibold text-neutral-800">
        🖼️ 카드뉴스 생성
      </h3>
      <p className="mb-4 text-xs leading-relaxed text-neutral-500">
        이 공지의 핵심요약을 바탕으로 Claude가 6장 카드(훅·맥락·본문 3장·CTA)를
        자동으로 만듭니다.
        <br />
        <span className="text-neutral-400">
          약 30초~2분 소요. 생성 후 각 카드 편집·레이아웃 조정·ZIP 다운로드가
          가능합니다.
        </span>
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generating
          ? "생성 중... (닫지 말고 기다려주세요)"
          : hasExisting
          ? "카드뉴스 재생성"
          : "카드뉴스 생성하기"}
      </button>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
