"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Stats = {
  scraped: number;
  inserted: number;
  skipped: number;
  enrichFail: number;
};

type Phase = "idle" | "starting" | "running" | "done" | "error";

export function CollectButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [logFile, setLogFile] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false); // 로그 패널 토글
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 프로덕션(Vercel)에선 spawn(node ...) 불가 → 로컬 dev 에서만 노출.
  // 프로덕션 자동 수집은 vercel.json 의 Vercel Cron (/api/cron/collect) 가 담당.
  if (process.env.NODE_ENV !== "development") return null;

  async function start() {
    setPhase("starting");
    setLines([]);
    setStats(null);
    setError(null);
    setOpen(true);
    try {
      const res = await fetch("/api/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
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

  // 실행 중이면 3초마다 status 폴링
  useEffect(() => {
    if (phase !== "running" || !logFile) return;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/cron/status?log=${encodeURIComponent(logFile)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setLines(data.lines ?? []);
        if (data.stats) setStats(data.stats);
        if (data.done) {
          setPhase(data.error ? "error" : "done");
          if (intervalRef.current) clearInterval(intervalRef.current);
          // 완료 시 서버 컴포넌트 재실행 → 대시보드 최신 데이터 반영
          router.refresh();
        }
      } catch {
        // 무시
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, logFile, router]);

  const running = phase === "starting" || phase === "running";

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={start}
          disabled={running}
          className={
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm transition " +
            (running
              ? "border-neutral-300 bg-neutral-100 text-neutral-500"
              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-900")
          }
          title="공지 수집 (최신 10건씩)"
        >
          {running ? (
            <>
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
              수집 중…
            </>
          ) : (
            <>🔄 공지 수집</>
          )}
        </button>
        {phase !== "idle" && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-neutral-400 hover:text-neutral-600"
          >
            {open ? "로그 접기" : "로그 보기"}
          </button>
        )}
        {phase === "done" && stats && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            +{stats.inserted}건 신규 · {stats.skipped}건 중복 skip
          </span>
        )}
        {phase === "error" && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200">
            ⚠ 실패
          </span>
        )}
      </div>

      {open && phase !== "idle" && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(90vw,560px)] rounded-lg border border-neutral-200 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-400">
            <span>
              {phase === "starting" && "백그라운드 작업 시작 중..."}
              {phase === "running" && "수집 중... (3초마다 로그 갱신)"}
              {phase === "done" && "✓ 완료"}
              {phase === "error" && "⚠ 에러 발생"}
            </span>
            {logFile && (
              <span className="truncate font-mono text-neutral-500">
                {logFile}
              </span>
            )}
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-neutral-100">
            {lines.length === 0
              ? "(로그 대기 중...)"
              : lines.join("\n")}
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
