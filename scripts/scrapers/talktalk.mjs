// 네이버 톡톡 파트너센터 공지 스크래퍼 — 로그인 필요.
//
// ⚠ 주의: 이 스크래퍼는 실제 DOM 구조를 확인하지 않은 상태로 작성됐습니다.
//   첫 실행 시 NAVER_HEADLESS=0 으로 브라우저를 띄워 실제 DOM을 확인하고
//   아래 SELECTOR 섹션을 조정하세요.

import { openNaverSession } from "../../lib/naver-session.mjs";

const CANDIDATE_URLS = [
  "https://partner.talk.naver.com/notice",
  "https://partner.talk.naver.com/#/notice",
  "https://partner.talk.naver.com/",
];

export const meta = {
  id: "talktalk",
  label: "네이버 톡톡 파트너센터",
  loginRequired: true,
};

export async function scrape({ recentDays = 30 } = {}) {
  let browser;
  let page;
  try {
    ({ browser, page } = await openNaverSession());
  } catch (err) {
    console.error(`  ✗ 톡톡 파트너 로그인 실패: ${err.message}`);
    if (browser) await browser.close();
    return [];
  }

  try {
    let loaded = false;
    for (const url of CANDIDATE_URLS) {
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((r) => setTimeout(r, 2500));
        const hasNotice = await page.evaluate(() =>
          document.body.innerText.includes("공지")
        );
        if (hasNotice) {
          loaded = true;
          break;
        }
      } catch {
        // 다음 후보 시도
      }
    }
    if (!loaded) {
      console.error("  ⚠ 톡톡 파트너 공지 페이지를 찾지 못함 — URL 확정 필요");
      return [];
    }

    const list = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        "tr, .notice_item, [class*='list'] [class*='item']"
      );
      const out = [];
      for (const row of rows) {
        const a = row.querySelector("a[href]");
        const titleEl =
          row.querySelector("[class*='title']") || row.querySelector("strong") || a;
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
      console.error("  ⚠ 톡톡 파트너 공지 0건 — DOM 셀렉터 조정 필요");
      return [];
    }

    const seen = new Set();
    const unique = list.filter((n) => {
      const k = n.url + "|" + n.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

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
      platform: "talktalk",
      title: n.title,
      date: n.date || null,
      tags: ["톡톡"],
      importance: /중요|긴급|필독/.test(n.title) ? "중요" : null,
      url: n.url,
      content: "",
    }));
  } finally {
    await browser.close();
  }
}
