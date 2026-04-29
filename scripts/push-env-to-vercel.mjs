// .env.local 의 지정 키들을 Vercel 현재 링크 프로젝트의 Production 환경에 일괄 등록.
// 이미 존재하는 키는 먼저 삭제 후 재생성.
// 사용: node scripts/push-env-to-vercel.mjs

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const KEYS_TO_PUSH = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "NEON_PROJECT_ID",
  "PGDATABASE",
  "PGHOST",
  "PGHOST_UNPOOLED",
  "PGPASSWORD",
  "PGUSER",
  "POSTGRES_DATABASE",
  "POSTGRES_HOST",
  "POSTGRES_PASSWORD",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NO_SSL",
  "POSTGRES_USER",
  "SITE_PASSWORD",
  "AUTH_SECRET",
  "API_TOKEN",
  "CRON_SECRET",
  "NEXT_PUBLIC_BASE_URL",
];

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    // 양쪽 따옴표 제거
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: opts.input !== undefined ? ["pipe", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
    input: opts.input,
    encoding: "utf8",
  });
  return r;
}

const env = parseEnv(readFileSync(".env.local", "utf8"));

for (const key of KEYS_TO_PUSH) {
  const val = env[key];
  if (val === undefined || val === "") {
    console.log(`⏭  ${key} — .env.local 에 값 없음, skip`);
    continue;
  }

  // 기존 값이 있으면 삭제 (에러는 무시)
  const rm = run("vercel", ["env", "rm", key, "production", "--yes"], {
    input: "",
  });
  // 새로 등록
  const add = run("vercel", ["env", "add", key, "production"], { input: val });
  if (add.status === 0) {
    console.log(`✓ ${key}`);
  } else {
    console.error(`✗ ${key}: ${(add.stderr || add.stdout || "").trim()}`);
  }
}

console.log("\n완료. 재배포 필요:  vercel --prod");
