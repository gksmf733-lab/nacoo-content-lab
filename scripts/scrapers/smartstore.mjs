// 스마트스토어센터 공지 스크래퍼 — 로그인 필요.
//
// ⚠ 주의: 이 스크래퍼는 실제 DOM 구조를 확인하지 않은 상태로 작성됐습니다.
//   첫 실행 시 NAVER_HEADLESS=0 으로 브라우저를 띄워 실제 DOM을 확인하고
//   아래 SELECTOR 섹션을 조정하세요. 파싱 0건이면 0건 반환하고 파이프라인은 계속 진행됩니다.

import { openNaverSession } from "../../lib/naver-session.mjs";

const LIST_URL = "https://sell.smartstore.naver.com/#/notice/list";

export const meta = {
  id: "smartstore",
  label: "네이버 스마트스토어센터",
  loginRequired: true,
};

export async function scrape({ recentDays = 30, todayOnly = false } = {}) {
  let browser;
  let page;
  try {
    ({ browser, page } = await openNaverSession());
  } catch (err) {
    console.error(`  ✗ 스마트스토어 로그인 실패: ${err.message}`);
    if (browser) await browser.close();
    return [];
  }

  try {
    try {
      await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
      console.error(`  ✗ 스마트스토어 공지 목록 접근 실패: ${err.message}`);
      return [];
    }
    await new Promise((r) => setTimeout(r, 3000)); // SPA 렌더 대기

    const list = await page.evaluate(() => {
      // SELECTOR — 첫 실행 시 실제 DOM 확인 후 수정 권장
      const rows = document.querySelectorAll(
        "tr, .notice_item, [class*='list'] [class*='item'], [class*='Notice']"
      );
      const out = [];
      for (const row of rows) {
        const a = row.querySelector("a[href]");
        const titleEl =
          row.querySelector("[class*='title']") ||
          row.querySelector("strong") ||
          a;
        const title = ((titleEl && titleEl.textContent) || "").trim();
        if (title.length < 3) continue;
        const text = (row.textContent || "").trim();
        const dateMatch = text.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})/);
        const href = a?.getAttribute("href") || "";
        const url = href
          ? href.startsWith("http")
            ? href
            : new URL(href, location.href).toString()
          : location.href;
        out.push({
          title,
          date: dateMatch ? dateMatch[1].replace(/-/g, ".") : "",
          url,
        });
      }
      return out;
    });

    if (list.length === 0) {
      console.error(
        "  ⚠ 스마트스토어 공지 0건 — DOM 셀렉터 조정 필요 (NAVER_HEADLESS=0 으로 확인)"
      );
      return [];
    }

    // 중복 제거 + 날짜 필터
    const seen = new Set();
    const unique = [];
    for (const n of list) {
      const key = n.url + "|" + n.title;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(n);
    }

    let filtered = unique;
    if (recentDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - recentDays);
      filtered = unique.filter((n) => {
        if (!n.date) return true;
        const d = new Date(n.date.replace(/\./g, "-"));
        return d >= cutoff;
      });
    }

    return filtered.slice(0, 30).map((n) => ({
      platform: "smartstore",
      title: n.title,
      date: n.date || null,
      tags: ["스마트스토어"],
      importance: /중요|긴급|필독/.test(n.title) ? "중요" : null,
      url: n.url,
      content: "", // 상세 본문은 DOM 확정 후 추가
    }));
  } finally {
    await browser.close();
  }
}
