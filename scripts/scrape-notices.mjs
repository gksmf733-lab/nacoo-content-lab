// 네이버 스마트플레이스 공지사항 스크래퍼
// puppeteer로 https://smartplace.naver.com/notices 페이지를 직접 열어 공지 목록을 파싱한다.
//
// 사용 (CLI):
//   node scripts/scrape-notices.mjs              → 전체 공지 JSON stdout
//   node scripts/scrape-notices.mjs --recent 30  → 최근 30일 공지만
//   node scripts/scrape-notices.mjs --today
//
// 사용 (모듈):
//   import { scrapeNotices } from "./scrape-notices.mjs";
//   const notices = await scrapeNotices({ recentDays: 7 });

import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";

const URL = "https://smartplace.naver.com/notices";
const MAX_SCROLL = 20; // 최대 스크롤 횟수 (무한스크롤 대비)
const SCROLL_DELAY = 800; // ms

export async function scrapeNotices({ recentDays = null, todayOnly = false } = {}) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 네이버 봇 감지 우회용 UA
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

    // 공지 목록이 렌더링될 때까지 대기
    await page.waitForSelector("a[href*='/notices/']", { timeout: 15000 }).catch(() => {
      // 셀렉터 못 찾으면 다른 셀렉터 시도
    });

    // 추가 렌더링 대기
    await new Promise((r) => setTimeout(r, 2000));

    // 스크롤해서 모든 공지 로드 (무한스크롤 또는 더보기 버튼 대응)
    let prevCount = 0;
    for (let i = 0; i < MAX_SCROLL; i++) {
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll("a[href*='/notices/']").length;
      });
      if (currentCount === prevCount && i > 0) break; // 더 이상 새 항목 없음
      prevCount = currentCount;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, SCROLL_DELAY));
    }

    // 공지 파싱
    const notices = await page.evaluate(() => {
      const results = [];

      // 방법 1: a 태그 기반 (href에 /notices/ 포함)
      const links = document.querySelectorAll("a[href*='/notices/']");
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        // 자기 자신(/notices)이 아니라 /notices/{id} 형태만
        if (href === "/notices" || href === "/notices/") continue;

        const url = href.startsWith("http")
          ? href
          : "https://smartplace.naver.com" + href;

        // 태그 뱃지 추출
        const badgeEls = link.querySelectorAll(
          "span, em, strong, div"
        );
        const tags = [];
        let importance = null;
        let title = "";
        let date = "";

        for (const el of badgeEls) {
          const text = (el.textContent || "").trim();
          // 태그 뱃지 패턴: 1~4글자 한글, 특정 알려진 태그
          if (
            /^(중요|공통|플레이스|식당|예약|교육|외식업종|주문|숙박|쇼핑|배달)$/.test(text)
          ) {
            if (text === "중요") {
              importance = "중요";
            } else if (!tags.includes(text)) {
              tags.push(text);
            }
          }
        }

        // 전체 텍스트에서 제목과 날짜 추출
        const fullText = (link.textContent || "").trim();
        // 날짜 패턴: YYYY.MM.DD
        const dateMatch = fullText.match(/(\d{4}\.\d{2}\.\d{2})/);
        if (dateMatch) {
          date = dateMatch[1];
        }

        // 제목: 태그와 날짜를 제거한 나머지
        let titleText = fullText;
        // 태그 텍스트 제거
        for (const t of [...tags, ...(importance ? [importance] : [])]) {
          titleText = titleText.replace(t, "");
        }
        // 날짜 제거
        if (date) titleText = titleText.replace(date, "");
        // 정리
        title = titleText.replace(/\s+/g, " ").trim();

        if (title) {
          results.push({ title, date, tags, importance, url });
        }
      }

      // 방법 2: a 태그로 못 찾았으면 li/div 기반으로 시도
      if (results.length === 0) {
        const items = document.querySelectorAll(
          "li, [class*='notice'], [class*='Notice'], [class*='list'] > div"
        );
        for (const item of items) {
          const linkEl = item.querySelector("a");
          const href = linkEl?.getAttribute("href") || "";
          if (!href.includes("/notices/")) continue;

          const url = href.startsWith("http")
            ? href
            : "https://smartplace.naver.com" + href;

          const fullText = (item.textContent || "").trim();
          const dateMatch = fullText.match(/(\d{4}\.\d{2}\.\d{2})/);
          const date = dateMatch ? dateMatch[1] : "";

          const tags = [];
          let importance = null;
          const knownTags = ["중요", "공통", "플레이스", "식당", "예약", "교육", "외식업종", "주문", "숙박", "쇼핑", "배달"];
          for (const t of knownTags) {
            if (fullText.includes(t)) {
              if (t === "중요") importance = "중요";
              else tags.push(t);
            }
          }

          let title = fullText;
          for (const t of [...tags, ...(importance ? [importance] : [])]) {
            title = title.replace(new RegExp(t, "g"), "");
          }
          if (date) title = title.replace(date, "");
          title = title.replace(/\s+/g, " ").trim();

          if (title && title.length > 5) {
            results.push({ title, date, tags, importance, url });
          }
        }
      }

      return results;
    });

    // 중복 제거 (같은 URL)
    const seen = new Set();
    const unique = [];
    for (const n of notices) {
      if (seen.has(n.url)) continue;
      seen.add(n.url);
      unique.push(n);
    }

    // 날짜 필터
    let filtered = unique;
    if (todayOnly) {
      // 오늘 날짜만 (KST 기준)
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kst.toISOString().slice(0, 10).replace(/-/g, ".");
      filtered = unique.filter((n) => n.date === todayStr);
    } else if (recentDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - recentDays);
      filtered = unique.filter((n) => {
        if (!n.date) return true;
        const d = new Date(n.date.replace(/\./g, "-"));
        return d >= cutoff;
      });
    }

    // 날짜 내림차순 정렬
    filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // 상세 페이지 내용 수집 (필터된 공지만)
    if (filtered.length > 0) {
      console.error(`▶ ${filtered.length}건 상세 내용 수집 중...`);
      const detailPage = await browser.newPage();
      await detailPage.setViewport({ width: 1280, height: 900 });
      await detailPage.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );

      for (const notice of filtered) {
        try {
          await detailPage.goto(notice.url, { waitUntil: "networkidle2", timeout: 20000 });
          await new Promise((r) => setTimeout(r, 1500));

          const detail = await detailPage.evaluate(() => {
            // 본문 영역 탐색 (여러 셀렉터 시도)
            const selectors = [
              "article",
              "[class*='content']",
              "[class*='Content']",
              "[class*='detail']",
              "[class*='Detail']",
              "[class*='body']",
              "[class*='Body']",
              "main",
              ".notice_content",
              "#content",
            ];
            let contentEl = null;
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.textContent.trim().length > 50) {
                contentEl = el;
                break;
              }
            }
            // fallback: body에서 가장 긴 텍스트 블록
            if (!contentEl) {
              const divs = [...document.querySelectorAll("div, section")];
              divs.sort((a, b) => b.textContent.length - a.textContent.length);
              contentEl = divs[0] || document.body;
            }

            const text = (contentEl?.innerText || "").trim();
            // 너무 길면 앞 3000자만
            return text.slice(0, 3000);
          });

          notice.content = detail;
          console.error(`  ✓ ${notice.title.slice(0, 30)}... (${detail.length}자)`);
        } catch (err) {
          console.error(`  ✗ ${notice.title.slice(0, 30)}... 상세 수집 실패: ${err.message}`);
          notice.content = "";
        }
      }
      await detailPage.close();
    }

    console.error(`✓ ${filtered.length}건 수집 (전체 ${unique.length}건)`);
    return filtered;
  } finally {
    await browser.close();
  }
}

// CLI 진입점: 이 파일이 직접 실행된 경우에만 동작
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let recentDays = null;
  let todayOnly = false;
  const recentIdx = args.indexOf("--recent");
  if (recentIdx !== -1 && args[recentIdx + 1]) {
    recentDays = Number(args[recentIdx + 1]);
  }
  if (args.includes("--today")) {
    todayOnly = true;
  }

  scrapeNotices({ recentDays, todayOnly })
    .then((notices) => {
      console.log(JSON.stringify(notices, null, 2));
    })
    .catch((e) => {
      console.error("스크래핑 실패:", e.message);
      process.exit(1);
    });
}
