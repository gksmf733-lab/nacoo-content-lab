// POST /api/cron/run
// 로컬 전용 — dev 서버와 같은 머신에서 cron-collect.mjs 를 백그라운드 spawn.
// UI "공지 수집" 버튼이 이 엔드포인트를 호출하고, 별도 /api/cron/status 로 진행 상황을 폴링.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { spawn } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 로컬 dev 서버에서만 동작 (Next.js dev = NODE_ENV=development, Vercel 빌드 = production).
  // .env.local 파일엔 NODE_ENV 를 주입할 수 없으므로 신뢰 가능한 유일한 지표.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        error:
          "이 기능은 로컬 dev 환경 전용입니다. 프로덕션에선 Vercel Cron(/api/cron/collect)을 이용하세요.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const limit = Number(body.limit) || 10;
  const skipLogin = body.skipLogin !== false; // 기본 true (로그인 채널 숨김 상태라)

  // 로그 파일 준비
  const logDir = path.resolve("data/logs");
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `web-collect-${Date.now()}.log`);
  const fd = openSync(logFile, "w");

  const args = [
    "--env-file=.env.local",
    "scripts/cron-collect.mjs",
    "--limit",
    String(limit),
  ];
  if (skipLogin) args.push("--skip-login");

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
    args,
    startedAt: new Date().toISOString(),
  });
}
