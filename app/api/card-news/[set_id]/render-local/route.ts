// POST /api/card-news/[set_id]/render-local
// 로컬 dev 전용 — save-cards.mjs 를 detached 백그라운드 실행. 클라이언트는
// /api/cron/status?log=... 로 로그를 폴링해 진행 상황을 보여준다.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { spawn } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ set_id: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error:
          "이 기능은 로컬 dev 환경 전용입니다. 터미널에서 직접 npm run save:cards 실행하세요.",
      },
      { status: 400 },
    );
  }

  const { set_id } = await ctx.params;
  const setId = Number(set_id);
  if (!Number.isFinite(setId) || setId <= 0) {
    return NextResponse.json({ error: "invalid set_id" }, { status: 400 });
  }

  const logDir = path.resolve("data/logs");
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `save-cards-${setId}-${Date.now()}.log`);
  const fd = openSync(logFile, "w");

  const args = [
    "--env-file=.env.local",
    "scripts/save-cards.mjs",
    String(setId),
  ];

  const child = spawn("node", args, {
    detached: true,
    stdio: ["ignore", fd, fd],
    cwd: process.cwd(),
  });
  child.unref();

  const relLog = path.relative(process.cwd(), logFile).replace(/\\/g, "/");

  return NextResponse.json({
    ok: true,
    pid: child.pid,
    logFile: relLog,
    startedAt: new Date().toISOString(),
  });
}
