// 스마트플레이스 공지 스크래퍼 (공개, 로그인 불필요).
// 기존 scripts/scrape-notices.mjs 를 공통 인터페이스로 감싼다.

import { scrapeNotices } from "../scrape-notices.mjs";

export const meta = {
  id: "smartplace",
  label: "네이버 스마트플레이스",
  loginRequired: false,
};

export async function scrape({ recentDays = 30, todayOnly = false } = {}) {
  const items = await scrapeNotices({ recentDays, todayOnly });
  return items.map((n) => ({
    platform: "smartplace",
    title: n.title,
    date: n.date ?? null,
    tags: n.tags ?? [],
    importance: n.importance ?? null,
    url: n.url,
    content: n.content ?? "",
  }));
}
