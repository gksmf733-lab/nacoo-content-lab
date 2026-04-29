"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "starting" | "running" | "done" | "error";

export function SaveLocalButton({
  setId,
  cardCount,
}: {
  setId: number;
  cardCount: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [logFile, setLogFile] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setPhase("starting");
    setLines([]);
    setError(null);
    setOpen(true);
    try {
      const res = await fetch(`/api/card-news/${setId}/render-local`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "시작 실패");
      setLogFile(data.logFile);
      setPhase("running");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
      setPhase("error");
    }
  }

  // 실행 중이면 2초마다 status 폴링 (수집 버튼과 동일 status 엔드포인트 재사용)
  useEffect(() => {
    if (phase !== "running" || !logFile) return;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/cron/status?log=${encodeURIComponent(logFile)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setLines(data.lines ?? []);
        if (data.done) {
          setPhase(data.error ? "error" : "done");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // 무시
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, logFile]);

  const running = phase === "starting" || phase === "running";

  // 저장된 파일 경로 추출 (로그에서 "  ✓ 카드뉴스/..." 줄 수집)
  const savedFiles = lines
    .map((l) => {
      const m = l.match(/^\s*✓\s+(.+\.jpg)\s*$/);
      return m ? m[1] : null;
    })
    .filter((x): x is string => !!x);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={start}
        disabled={running}
        className={
          "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition " +
          (running
            ? "bg-neutral-300 text-neutral-600"
            : phase === "done"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-neutral-900 text-white hover:bg-neutral-700")
        }
      >
        {phase === "starting" && "시작 중…"}
        {phase === "running" && (
          <>
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            저장 중 ({savedFiles.length}/{cardCount})
          </>
        )}
        {phase === "done" && `✓ ${savedFiles.length}장 저장 완료`}
        {phase === "error" && "⚠ 실패 — 다시 시도"}
        {phase === "idle" && "💾 자동 저장"}
      </button>
      {phase !== "idle" && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-neutral-400 hover:text-neutral-600"
        >
          {open ? "로그 접기" : "로그"}
        </button>
      )}

      {open && phase !== "idle" && (
        <div className="absolute right-4 z-30 mt-40 w-[min(90vw,560px)] translate-y-0 rounded-lg border border-neutral-200 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-400">
            <span>
              {phase === "starting" && "백그라운드 작업 시작…"}
              {phase === "running" && "Chromium 렌더 진행 중 (2초마다 갱신)"}
              {phase === "done" && "✓ 저장 완료"}
              {phase === "error" && "⚠ 에러 — 아래 로그 확인"}
            </span>
            {logFile && (
              <span className="truncate font-mono text-neutral-500">
                {logFile}
              </span>
            )}
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-neutral-100">
            {lines.length === 0 ? "(로그 대기 중…)" : lines.join("\n")}
          </pre>
          {error && (
            <div className="mt-2 rounded bg-red-900/30 px-2 py-1 text-[10px] text-red-200">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
