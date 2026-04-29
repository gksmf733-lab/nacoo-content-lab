// 네이버 공식 블로그 스크래퍼 — RSS 피드 기반 (로그인 불필요, puppeteer 불필요).
// 대상: nv_smartplace / n_business / naver_diary (lib/platforms.mjs 참조)
//
// 각 블로그마다 platform id 가 다르다 (blog_smartplace / blog_business / blog_diary).

import { PLATFORMS } from "../../lib/platforms.mjs";

const BLOG_TARGETS = [
  { platform: "blog_smartplace", blogId: "nv_smartplace" },
  { platform: "blog_business", blogId: "n_business" },
  { platform: "blog_diary", blogId: "naver_diary" },
];

export const meta = {
  id: "naver_blog",
  label: "네이버 공식 블로그 (3개)",
  loginRequired: false,
  fanOut: BLOG_TARGETS.map((t) => t.platform),
};

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// RSS 날짜 ("Sun, 20 Apr 2026 10:00:00 +0900") → "YYYY.MM.DD"
function toDateStr(rssDate) {
  if (!rssDate) return null;
  const d = new Date(rssDate);
  if (Number.isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
      const hit = block.match(r);
      return hit ? hit[1].trim() : "";
    };
    const title = stripHtml(pick("title"));
    const link = stripHtml(pick("link"));
    const description = pick("description");
    const pubDate = pick("pubDate");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      content: stripHtml(description).slice(0, 3000),
      date: toDateStr(pubDate),
    });
  }
  return items;
}

async function fetchBlogRss(blogId) {
  const url = `https://rss.blog.naver.com/${blogId}.xml`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) {
    throw new Error(`RSS ${blogId} HTTP ${res.status}`);
  }
  return res.text();
}

function inferTags(title) {
  // 제목 접두 대괄호 태그 추출: [공지] [업데이트] [이벤트] 등
  const tags = [];
  const m = title.match(/\[([^\]]+)\]/g);
  if (m) for (const t of m) tags.push(t.replace(/[\[\]]/g, ""));
  return tags;
}

function passesRecent(dateStr, recentDays) {
  if (!dateStr || !recentDays) return true;
  const d = new Date(dateStr.replace(/\./g, "-"));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recentDays);
  return d >= cutoff;
}

export async function scrape({ recentDays = 30, todayOnly = false } = {}) {
  const out = [];
  for (const target of BLOG_TARGETS) {
    const platMeta = PLATFORMS[target.platform];
    console.error(`▶ ${platMeta?.label || target.platform} RSS 수집 중...`);
    let xml;
    try {
      xml = await fetchBlogRss(target.blogId);
    } catch (err) {
      console.error(`  ✗ ${target.blogId}: ${err.message}`);
      continue;
    }
    const items = parseRssItems(xml);

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kst.toISOString().slice(0, 10).replace(/-/g, ".");

    for (const item of items) {
      if (todayOnly && item.date !== todayStr) continue;
      if (!todayOnly && !passesRecent(item.date, recentDays)) continue;

      const tags = inferTags(item.title);
      const importance = /\[중요\]|긴급|필독/.test(item.title) ? "중요" : null;

      out.push({
        platform: target.platform,
        title: item.title,
        date: item.date,
        tags,
        importance,
        url: item.link,
        content: item.content,
      });
    }
    console.error(`  ✓ ${target.blogId}: ${items.length}건 중 필터 통과 ${out.filter(o => o.platform === target.platform).length}건`);
  }
  return out;
}
