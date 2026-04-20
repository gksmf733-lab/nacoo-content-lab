/**
 * 기존 카드뉴스 슬라이드의 HTML을 재생성한다.
 * card-html.ts 템플릿이 바뀌었을 때 사용.
 *
 * 사용법: node --env-file=.env.local scripts/regen-html.mjs
 * 환경변수: DATABASE_URL 필요
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local 수동 로드
const envPath = path.join(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^(\w+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* ignore */ }

// ── 캐릭터 이미지 ──
const charPng = readFileSync(path.join(__dirname, '..', 'public', 'images', 'character-sm.png'));
const CHARACTER_IMG = `data:image/png;base64,${charPng.toString('base64')}`;

// ── 디자인 상수 (card-html.ts v2 SSOT와 동일) ──
const COLOR_BG = "#F7F5F0";
const COLOR_INK = "#1A1A1A";
const COLOR_ACCENT = "#E8572C";
const COLOR_ACCENT_LIGHT = "#FDF0EB";
const BRAND = "나쿠 콘텐츠연구소";

const TITLE_SIZE_PX = { sm: 54, md: 66, lg: 82, xl: 96 };
const HOOK_TITLE_SIZE_PX = { sm: 78, md: 94, lg: 112, xl: 128 };
const BODY_SIZE_PX = { sm: 32, md: 38, lg: 44 };

function splitLeadingEmoji(s) {
  const m = s.match(/^\s*(\p{Extended_Pictographic})\s*/u);
  if (m) return { icon: m[1], rest: s.slice(m[0].length) };
  return { icon: "", rest: s };
}
function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function autoBreakTitle(s) {
  const clean = esc(s).replace(/\n+/g," ").trim();
  if (clean.length <= 14) return clean;
  const mid = Math.floor(clean.length / 2);
  let splitAt = -1;
  for (let d = 0; d < clean.length; d++) {
    const l = mid - d, r = mid + d;
    if (l > 0 && clean[l] === " ") { splitAt = l; break; }
    if (r < clean.length && clean[r] === " ") { splitAt = r; break; }
  }
  if (splitAt === -1) return clean;
  return clean.slice(0, splitAt) + "<br/>" + clean.slice(splitAt + 1);
}
function escMultiline(s) { return esc(s).replace(/\n/g, "<br/>"); }
function parseCtaItems(body) {
  const circled = /[①②③④⑤⑥⑦⑧⑨⑩]/;
  if (circled.test(body)) return body.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map(p=>p.trim()).filter(Boolean).slice(0,5);
  const numbered = body.split(/\s*(?:^|\s)\d+[).]\s*/).map(p=>p.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0,5);
  return body.split(/[·.,]/).map(p=>p.trim()).filter(Boolean).slice(0,5);
}
function parseBodyLines(body) {
  return body.split("\n").map(l => l.trim()).filter(Boolean);
}

const BASE_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1350px;overflow:hidden}
  body{font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;background:${COLOR_BG};color:${COLOR_INK};-webkit-font-smoothing:antialiased;}
  section.card{position:relative;width:1080px;height:1350px;padding:100px 100px 110px;display:flex;flex-direction:column;overflow:hidden;}
  .brand-bar{display:flex;align-items:center;gap:10px;flex-shrink:0}
  .brand-dot{width:12px;height:12px;border-radius:50%;background:${COLOR_ACCENT};flex-shrink:0}
  .brand-name{font-size:22px;font-weight:600;letter-spacing:0.04em;color:${COLOR_INK};opacity:0.55}
  .brand-footer{position:absolute;left:0;right:0;bottom:0;height:70px;background:${COLOR_INK};display:flex;align-items:center;justify-content:space-between;padding:0 100px;}
  .brand-footer-name{font-size:20px;font-weight:600;color:#FFFFFF;opacity:0.7;letter-spacing:0.06em}
  .pagenum-badge{position:absolute;right:100px;bottom:86px;display:flex;align-items:center;gap:6px;}
  .pagenum-current{width:44px;height:44px;border-radius:50%;background:${COLOR_ACCENT};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#FFFFFF;}
  .pagenum-sep{font-size:16px;font-weight:500;color:${COLOR_INK};opacity:0.35}
  .pagenum-total{font-size:18px;font-weight:600;color:${COLOR_INK};opacity:0.45}
  .tag-chip{display:inline-flex;align-items:center;gap:8px;margin-top:36px;flex-shrink:0;}
  .tag-chip-bar{width:28px;height:4px;border-radius:2px;background:${COLOR_ACCENT}}
  .tag-chip-text{font-size:20px;font-weight:700;color:${COLOR_ACCENT};letter-spacing:0.08em;text-transform:uppercase}
  .hook-bg-split{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg,${COLOR_ACCENT} 0%,${COLOR_ACCENT} 48%,${COLOR_BG} 48%);z-index:0;}
  .hook-bg-circle{position:absolute;top:-160px;right:-160px;width:600px;height:600px;border-radius:50%;background:rgba(255,255,255,0.08);z-index:1;}
  .hook-bg-circle2{position:absolute;bottom:200px;left:-120px;width:380px;height:380px;border-radius:50%;background:rgba(255,255,255,0.06);z-index:1;}
  .hook-content{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}
  .hook-icon-wrap{width:160px;height:160px;border-radius:32px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:90px;margin-bottom:36px;border:2px solid rgba(255,255,255,0.25);}
  .hook-title{font-weight:800;line-height:1.2;letter-spacing:-0.025em;color:#FFFFFF;}
  .hook-divider{width:60px;height:5px;border-radius:3px;background:rgba(255,255,255,0.5);margin:40px 0;}
  .hook-sub{font-weight:500;line-height:1.55;color:rgba(255,255,255,0.88);padding:24px 28px;background:rgba(255,255,255,0.12);border-radius:16px;border-left:4px solid rgba(255,255,255,0.6);}
  .hook-card .brand-bar .brand-name{color:#FFFFFF;opacity:0.75}
  .hook-card .brand-bar .brand-dot{background:#FFFFFF}
  .context-border-line{position:absolute;left:0;top:0;bottom:70px;width:10px;background:${COLOR_ACCENT};}
  .context-body-wrap{margin-top:36px;flex:1;display:flex;flex-direction:column;}
  .context-body-text{font-weight:500;line-height:1.75;color:${COLOR_INK};font-size:34px;opacity:0.85;padding-left:20px;border-left:3px solid rgba(232,87,44,0.25);}
  .context-point-box{margin-top:auto;margin-bottom:86px;padding:36px 44px;background:${COLOR_ACCENT};border-radius:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 32px rgba(232,87,44,0.28);}
  .context-point-label{font-size:18px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:0.08em;text-transform:uppercase;}
  .context-point-text{font-size:30px;font-weight:700;color:#FFFFFF;line-height:1.45;}
  .body-title{font-weight:800;line-height:1.22;letter-spacing:-0.02em;margin-top:28px}
  .body-divider{width:48px;height:5px;border-radius:3px;background:${COLOR_ACCENT};margin:28px 0;flex-shrink:0;}
  .body-list{list-style:none;display:flex;flex-direction:column;gap:20px;flex:1;}
  .body-list-item{display:flex;align-items:flex-start;gap:18px;font-size:34px;font-weight:500;line-height:1.6;color:${COLOR_INK};opacity:0.86;}
  .body-list-bullet{flex-shrink:0;margin-top:10px;width:10px;height:10px;border-radius:50%;background:${COLOR_ACCENT};}
  .body-point-box{margin-top:auto;margin-bottom:86px;padding:32px 44px;background:${COLOR_ACCENT_LIGHT};border:2px solid ${COLOR_ACCENT};border-radius:20px;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden;flex-shrink:0;}
  .body-point-box::before{content:"";position:absolute;top:0;left:0;bottom:0;width:6px;background:${COLOR_ACCENT};}
  .body-point-label{font-size:17px;font-weight:700;color:${COLOR_ACCENT};letter-spacing:0.08em;text-transform:uppercase;padding-left:18px;}
  .body-point-text{font-size:28px;font-weight:700;color:${COLOR_INK};line-height:1.5;padding-left:18px;}
  .cta-card{background:${COLOR_ACCENT};color:#FFFFFF;overflow:hidden}
  .cta-pattern{position:absolute;top:0;left:0;right:0;bottom:0;background-image:radial-gradient(circle at 20% 20%,rgba(255,255,255,0.07) 0%,transparent 50%),radial-gradient(circle at 80% 80%,rgba(0,0,0,0.08) 0%,transparent 50%);z-index:0;}
  .cta-pattern-lines{position:absolute;top:0;left:0;right:0;bottom:0;background-image:repeating-linear-gradient(-45deg,transparent,transparent 40px,rgba(255,255,255,0.025) 40px,rgba(255,255,255,0.025) 41px);z-index:0;}
  .cta-content{position:relative;z-index:2;display:flex;flex-direction:column;flex:1}
  .cta-card .brand-bar .brand-name{color:#FFFFFF;opacity:0.75}
  .cta-card .brand-bar .brand-dot{background:#FFFFFF}
  .cta-tag{display:inline-flex;align-items:center;gap:10px;margin-top:40px;flex-shrink:0;}
  .cta-tag-bar{width:28px;height:4px;border-radius:2px;background:rgba(255,255,255,0.6)}
  .cta-tag-text{font-size:20px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.1em}
  .cta-title{margin-top:28px;font-size:76px;font-weight:800;line-height:1.18;letter-spacing:-0.025em;color:#FFFFFF;flex-shrink:0;}
  .cta-list{margin-top:48px;list-style:none;display:flex;flex-direction:column;gap:22px;flex:1;}
  .cta-list li{display:flex;align-items:flex-start;gap:22px;font-size:34px;font-weight:600;line-height:1.5;color:rgba(255,255,255,0.92);}
  .cta-num{flex-shrink:0;width:52px;height:52px;border-radius:50%;background:#FFFFFF;color:${COLOR_ACCENT};font-size:24px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);margin-top:2px;}
  .cta-hashtags{margin-top:auto;display:flex;flex-wrap:wrap;gap:10px;padding-top:20px;padding-bottom:86px;flex-shrink:0;}
  .cta-hashtag{font-size:19px;font-weight:500;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.1);border-radius:30px;padding:6px 16px;}
  .cta-card .brand-footer{background:rgba(0,0,0,0.25)}
  .cta-card .brand-footer-name{color:rgba(255,255,255,0.65)}
  .cta-card .pagenum-badge .pagenum-current{background:#FFFFFF;color:${COLOR_ACCENT}}
  .cta-card .pagenum-badge .pagenum-sep{color:rgba(255,255,255,0.4)}
  .cta-card .pagenum-badge .pagenum-total{color:rgba(255,255,255,0.55)}
  .character{position:absolute;right:48px;bottom:70px;width:200px;height:auto;opacity:0.90;pointer-events:none;z-index:3}
  .cta-card .character{opacity:0.20}
`;

function brandFooter(cardNo, total) {
  return `
  <div class="brand-footer">
    <span class="brand-footer-name">${esc(BRAND)}</span>
  </div>
  <div class="pagenum-badge">
    <div class="pagenum-current">${cardNo}</div>
    <span class="pagenum-sep">/</span>
    <span class="pagenum-total">${total}</span>
  </div>`;
}

function wrapHtml(inner) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>Card</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.min.css">
<style>${BASE_STYLE}</style>
</head><body>
${inner}
</body></html>`;
}

function normalizeRole(r) {
  r = r.toLowerCase();
  if (r === "hook" || r === "훅") return "hook";
  if (r === "context" || r === "맥락") return "context";
  if (r === "cta") return "cta";
  return "body";
}

function renderCardHtml({ card_no, total, role, title, body, layout, hashtags }) {
  layout = layout || {};
  const titleAlign = layout.titleAlign || (role === "hook" ? "center" : "left");
  const titleSize = layout.titleSize || "md";
  const bodySize = layout.bodySize || "md";
  const bodyOffset = Number(layout.bodyOffset || 0);

  if (role === "hook") {
    const { icon: leadIcon, rest } = splitLeadingEmoji(title);
    const icon = layout.icon || leadIcon || "";
    const titleHtml = autoBreakTitle(rest || title);
    const sub = layout.sub || body.split("\n")[0] || "";
    const titlePx = HOOK_TITLE_SIZE_PX[titleSize];
    const subPx = BODY_SIZE_PX[bodySize];
    const inner = `<section class="card hook-card" style="background:${COLOR_BG}">
  <div class="hook-bg-split"></div>
  <div class="hook-bg-circle"></div>
  <div class="hook-bg-circle2"></div>
  <div class="brand-bar" style="position:relative;z-index:2">
    <div class="brand-dot"></div>
    <span class="brand-name">${esc(BRAND)}</span>
  </div>
  <div class="hook-content" style="text-align:${titleAlign};margin-top:${40+bodyOffset}px">
    ${icon ? `<div class="hook-icon-wrap"${titleAlign==="center"?' style="margin:0 auto 36px"':""}">${esc(icon)}</div>` : ""}
    <h1 class="hook-title" style="font-size:${titlePx}px${titleAlign==="left"?";text-align:left":""}">${titleHtml}</h1>
    ${sub ? `<div class="hook-divider"${titleAlign==="center"?' style="margin:40px auto"':""}></div>
    <p class="hook-sub" style="font-size:${subPx}px;text-align:left">${escMultiline(sub)}</p>` : ""}
  </div>
  <img class="character" src="${CHARACTER_IMG}" alt="" />
  ${brandFooter(card_no, total)}
</section>`;
    return wrapHtml(inner);
  }

  if (role === "cta") {
    const titlePx = HOOK_TITLE_SIZE_PX[titleSize] - 18;
    const items = parseCtaItems(body);
    const tags = hashtags || [];
    const inner = `<section class="card cta-card">
  <div class="cta-pattern"></div>
  <div class="cta-pattern-lines"></div>
  <div class="cta-content">
    <div class="brand-bar">
      <div class="brand-dot"></div>
      <span class="brand-name">${esc(BRAND)}</span>
    </div>
    <div class="cta-tag">
      <div class="cta-tag-bar"></div>
      <span class="cta-tag-text">ACTION</span>
    </div>
    <h2 class="cta-title" style="font-size:${titlePx}px;text-align:${titleAlign}">${autoBreakTitle(title)}</h2>
    <ul class="cta-list" style="margin-top:${48+bodyOffset}px">
${items.map((it,i)=>`      <li><div class="cta-num">${i+1}</div><span>${esc(it)}</span></li>`).join("\n")}
    </ul>
    ${tags.length > 0 ? `<div class="cta-hashtags">\n${tags.map(t=>`      <span class="cta-hashtag">${esc(t)}</span>`).join("\n")}\n    </div>` : ""}
  </div>
  <img class="character" src="${CHARACTER_IMG}" alt="" />
  ${brandFooter(card_no, total)}
</section>`;
    return wrapHtml(inner);
  }

  if (role === "context") {
    const titlePx = TITLE_SIZE_PX[titleSize];
    const pointLabel = layout.pointLabel || "KEY POINT";
    const pointText = layout.pointText || "";
    const inner = `<section class="card" style="padding-left:110px">
  <div class="context-border-line"></div>
  <div class="brand-bar">
    <div class="brand-dot"></div>
    <span class="brand-name">${esc(BRAND)}</span>
  </div>
  <div class="tag-chip">
    <div class="tag-chip-bar"></div>
    <span class="tag-chip-text">CONTEXT</span>
  </div>
  <h2 class="body-title" style="font-size:${titlePx}px;margin-top:28px;text-align:${titleAlign}">${autoBreakTitle(title)}</h2>
  <div class="context-body-wrap" style="margin-top:${36+bodyOffset}px">
    <p class="context-body-text">${escMultiline(body)}</p>
  </div>
  ${pointText ? `<div class="context-point-box">
    <span class="context-point-label">${esc(pointLabel)}</span>
    <span class="context-point-text">${esc(pointText)}</span>
  </div>` : ""}
  <img class="character" src="${CHARACTER_IMG}" alt="" />
  ${brandFooter(card_no, total)}
</section>`;
    return wrapHtml(inner);
  }

  // body
  const tagIndex = Math.max(1, card_no - 2);
  const titlePx = TITLE_SIZE_PX[titleSize];
  const pointLabel = layout.pointLabel || "POINT";
  const pointText = layout.pointText || "";
  const lines = parseBodyLines(body);
  const inner = `<section class="card">
  <div class="brand-bar">
    <div class="brand-dot"></div>
    <span class="brand-name">${esc(BRAND)}</span>
  </div>
  <div class="tag-chip">
    <div class="tag-chip-bar"></div>
    <span class="tag-chip-text">POINT ${tagIndex}</span>
  </div>
  <h2 class="body-title" style="font-size:${titlePx}px;text-align:${titleAlign}">${autoBreakTitle(title)}</h2>
  <div class="body-divider"></div>
  <ul class="body-list" style="margin-top:${bodyOffset}px">
${lines.map(line=>`    <li class="body-list-item"><div class="body-list-bullet"></div><span>${esc(line)}</span></li>`).join("\n")}
  </ul>
  ${pointText ? `<div class="body-point-box">
    <span class="body-point-label">${esc(pointLabel)}</span>
    <span class="body-point-text">${esc(pointText)}</span>
  </div>` : ""}
  <img class="character" src="${CHARACTER_IMG}" alt="" />
  ${brandFooter(card_no, total)}
</section>`;
  return wrapHtml(inner);
}

// ── 메인: DB의 모든 슬라이드 HTML 재생성 ──
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL 없음"); process.exit(1); }

  const sql = neon(dbUrl);

  const slides = await sql`
    SELECT s.id, s.set_id, s.card_no, s.role, s.title, s.body, s.layout, s.hashtags,
           (SELECT card_count FROM card_news_sets WHERE id = s.set_id) AS total
    FROM card_news_slides s
    ORDER BY s.set_id, s.card_no
  `;

  console.log(`총 ${slides.length}개 슬라이드 HTML 재생성 시작...`);

  for (const slide of slides) {
    const layout = typeof slide.layout === 'string' ? JSON.parse(slide.layout) : (slide.layout ?? {});
    const hashtags = Array.isArray(slide.hashtags) ? slide.hashtags : [];
    const html = renderCardHtml({
      card_no: slide.card_no,
      total: slide.total,
      role: normalizeRole(slide.role),
      title: slide.title,
      body: slide.body,
      layout,
      hashtags,
    });

    await sql`UPDATE card_news_slides SET html = ${html} WHERE id = ${slide.id}`;
    console.log(`  ✓ slide ${slide.id} (set ${slide.set_id}, card ${slide.card_no} ${slide.role})`);
  }

  console.log("\n✅ 완료!");
}

main().catch(e => { console.error(e); process.exit(1); });
