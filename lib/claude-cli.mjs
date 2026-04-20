// Claude Code CLI 서브프로세스 래퍼.
// `claude -p` 인쇄 모드로 프롬프트를 stdin으로 전달하고 stdout을 받는다.
// Claude Code에 로그인된 사용자 세션(Max 플랜 등)의 쿼터를 사용한다.
// API 키 불필요 — 단, 이 코드가 실행되는 프로세스의 사용자 계정에 `claude login`이 돼 있어야 함.

import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const DEFAULT_TIMEOUT_MS = 180_000; // 3분

/**
 * 프롬프트를 Claude Code CLI로 보내고 텍스트 응답을 받는다.
 * @param {string} prompt
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export function callClaude(prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ["-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32", // Windows에서는 claude.cmd 래퍼 때문에 shell 필요
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error(`claude CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            `claude CLI exit ${code}: ${stderr.trim() || stdout.trim() || "(no output)"}`
          )
        );
      }
    });

    try {
      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Claude 응답 텍스트에서 최상위 JSON 오브젝트를 추출한다.
 * 코드블록 래핑이나 앞뒤 설명이 있어도 동작.
 * @param {string} text
 * @returns {any}
 */
export function parseJsonFromResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Claude 응답에서 JSON을 추출할 수 없습니다.");
    return JSON.parse(match[0]);
  }
}
