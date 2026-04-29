// GET /api/cron/status?log=data/logs/web-collect-XXX.log
// run 엔드포인트가 spawn 한 로그 파일을 tail 하고 진행 상황을 반환.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const logParam = req.nextUrl.searchParams.get("log");
  if (!logParam) {
    return NextResponse.json({ error: "log param required" }, { status: 400 });
  }

  // Path traversal 방어 — data/logs 하위만 허용
  const allowedBase = path.resolve("data/logs");
  const resolved = path.resolve(logParam);
  if (!resolved.startsWith(allowedBase)) {
    return NextResponse.json({ error: "forbidden path" }, { status: 403 });
  }

  let content = "";
  try {
    content = await readFile(resolved, "utf8");
  } catch {
    // 로그 파일이 아직 flush 안 됐을 수 있음
    return NextResponse.json({ status: "waiting", lines: [], done: false, error: false });
  }

  // 완료/에러 감지
  // - cron-collect.mjs: "✓ 전체 완료:"
  // - save-cards.mjs:  "완료." (EOF)
  const trimmed = content.trimEnd();
  const done =
    content.includes("✓ 전체 완료:") ||
    content.includes("실행 실패:") ||
    trimmed.endsWith("완료.");
  const error =
    content.includes("실행 실패:") ||
    /Error:\s.+/.test(content) ||
    /UnhandledPromiseRejection/.test(content);

  // 마지막 40줄만 UI로
  const allLines = content.split("\n");
  const lines = allLines.slice(-40);

  // 간단한 통계 추출 (✓ 전체 완료: scraped=N, inserted=N, skipped=N, enrichFail=N)
  let stats: null | {
    scraped: number;
    inserted: number;
    skipped: number;
    enrichFail: number;
  } = null;
  const statsLine = allLines.find((l) => l.includes("✓ 전체 완료:"));
  if (statsLine) {
    const m = statsLine.match(
      /scraped=(\d+),\s*inserted=(\d+),\s*skipped=(\d+),\s*enrichFail=(\d+)/
    );
    if (m) {
      stats = {
        scraped: Number(m[1]),
        inserted: Number(m[2]),
        skipped: Number(m[3]),
        enrichFail: Number(m[4]),
      };
    }
  }

  return NextResponse.json({
    status: done ? "done" : "running",
    done,
    error,
    stats,
    lines,
  });
}
