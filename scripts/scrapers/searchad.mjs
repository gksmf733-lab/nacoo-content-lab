// 네이버 검색광고 공지 스크래퍼 — saedu.naver.com (공개, 로그인 불필요).
//
// 주의: 네이버 검색광고의 공지 페이지는 DOM 구조가 변경될 수 있다.
// 파싱 실패 시 콘솔 경고를 남기고 0건 반환 — 전체 파이프라인을 블록하지 않는다.

import puppeteer from "puppeteer";

const LIST_URL = "https://saedu.naver.com/notice/noticeList.naver";

export const meta = {
  id: "searchad",
  label: "네이버 검색광고",
  loginRequired: false,
};

function safeDateKstStr() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, ".");
}

export async function scrape({ recentDays = 30, todayOnly = false } = {}) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    try {
      await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
      console.error(`  ✗ 검색광고 공지 페이지 접근 실패: ${err.message}`);
      return [];
    }

    await new Promise((r) => setTimeout(r, 1500));

    // 범용 파싱: 목록에서 제목·날짜·링크 추출.
    const list = await page.evaluate(() => {
      const results = [];

      // 후보 1: <table> 기반 게시판
      const rows = document.querySelectorAll("table tbody tr");
      for (const tr of rows) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 2) continue;
        const linkEl = tr.querySelector("a[href]");
        if (!linkEl) continue;
        const href = linkEl.getAttribute("href") || "";
        const title = (linkEl.textContent || "").trim();
        const fullText = (tr.textContent || "").trim();
        const dateMatch = fullText.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})/);
        const date = dateMatch ? dateMatch[1].replace(/-/g, ".") : "";
        if (title.length < 2) continue;

        const url = href.startsWith("http")
          ? href
          : new URL(href, location.href).toString();
        results.push({ title, date, url });
      }

      // 후보 2: li 기반
      if (results.length === 0) {
        const items = document.querySelectorAll("li, .notice_item, [class*='list'] > div");
        for (const item of items) {
          const a = item.querySelector("a[href]");
          if (!a) continue;
          const href = a.getAttribute("href") || "";
          if (!/notice|공지/.test(href + (a.textContent || ""))) continue;
          const title = (a.textContent || "").trim();
          if (title.length < 3) continue;
          const text = (item.textContent || "").trim();
          const dateMatch = text.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})/);
          const url = href.startsWith("http")
            ? href
            : new URL(href, location.href).toString();
          results.push({
            title,
            date: dateMatch ? dateMatch[1].replace(/-/g, ".") : "",
            url,
          });
        }
      }

      return results;
    });

    if (list.length === 0) {
      console.error("  ⚠ 검색광고 공지 목록 파싱 결과 0건 — 페이지 DOM 변경 가능성");
      return [];
    }

    // 중복 제거
    const seen = new Set();
    const unique = [];
    for (const n of list) {
      if (seen.has(n.url)) continue;
      seen.add(n.url);
      unique.push(n);
    }

    // 날짜 필터
    const today = safeDateKstStr();
    let filtered = unique;
    if (todayOnly) {
      filtered = unique.filter((n) => n.date === today);
    } else if (recentDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - recentDays);
      filtered = unique.filter((n) => {
        if (!n.date) return true;
        const d = new Date(n.date.replace(/\./g, "-"));
        return d >= cutoff;
      });
    }

    // 상세 본문 수집 (최대 30건으로 상한)
    const detailPage = await browser.newPage();
    await detailPage.setViewport({ width: 1280, height: 900 });
    await detailPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    const cap = Math.min(filtered.length, 30);
    for (let i = 0; i < cap; i++) {
      const n = filtered[i];
      try {
        await detailPage.goto(n.url, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1000));
        const text = await detailPage.evaluate(() => {
          const candidates = [
            "article",
            ".content",
            "[class*='content']",
            "[class*='view']",
            "[class*='detail']",
            "main",
          ];
          for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 50) {
              return (el.innerText || "").slice(0, 3000);
            }
          }
          return (document.body.innerText || "").slice(0, 3000);
        });
        n.content = text;
      } catch {
        n.content = "";
      }
    }
    await detailPage.close();

    return filtered.slice(0, cap).map((n) => ({
      platform: "searchad",
      title: n.title,
      date: n.date || null,
      tags: ["검색광고"],
      importance: /중요|긴급|필독/.test(n.title) ? "중요" : null,
      url: n.url,
      content: n.content || "",
    }));
  } finally {
    await browser.close();
  }
}
