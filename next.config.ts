import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer는 Chromium 바이너리를 포함 — Next.js 번들 대상에서 제외
  // (카드뉴스 ZIP 저장 API에서 사용, 로컬 dev 전용)
  serverExternalPackages: ["puppeteer"],
};

export default nextConfig;
