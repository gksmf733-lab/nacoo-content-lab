import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { isAuthed, checkApiToken } from "@/lib/auth";

// POST /api/card-news/[set_id]/save
// 로컬에 실제로 카드뉴스 JPG를 저장하는 엔드포인트 (dev/로컬 실행 전용)
// 내부적으로 scripts/save-cards.mjs 를 spawn 한다.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ set_id: string }> },
) {
  const authed = (await isAuthed()) || checkApiToken(req.headers.get("authorization"));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { set_id } = await ctx.params;
  const setId = Number(set_id);
  if (!Number.isFinite(setId) || setId <= 0) {
    return NextResponse.json({ error: "invalid set_id" }, { status: 400 });
  }

  const repoRoot = process.cwd();
  const scriptPath = path.join(repoRoot, "scripts", "save-cards.mjs");

  return await new Promise<NextResponse>((resolve) => {
    const child = spawn(
      process.execPath,
      ["--env-file=.env.local", scriptPath, String(setId)],
      { cwd: repoRoot },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      resolve(
        NextResponse.json(
          { ok: false, error: `spawn 실패: ${err.message}` },
          { status: 500 },
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        // 저장된 폴더 경로 파싱
        const savedFiles = [...stdout.matchAll(/✓\s+(.+\.jpg)/g)].map((m) => m[1]);
        const folder = savedFiles[0] ? path.dirname(savedFiles[0]) : null;
        resolve(
          NextResponse.json({
            ok: true,
            count: savedFiles.length,
            folder,
            files: savedFiles,
            output: stdout,
          }),
        );
      } else {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: `save-cards.mjs 종료 코드 ${code}`,
              stdout,
              stderr,
            },
            { status: 500 },
          ),
        );
      }
    });
  });
}
