/**
 * 공지 #15 (외식업 플레이스 스쿨 교육 신청) 카드뉴스를 생성해 DB에 저장한다.
 * 개선된 card-html.ts 디자인 로직 인라인 포함.
 *
 * 사용법: node --env-file=.env.local scripts/gen-notice-15.mjs
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

const sql = neon(process.env.DATABASE_URL);

// ── CTA 템플릿 로더 (data/cta-template.md) ──
// 1번째 줄: 제목 / 빈 줄 / 나머지: 본문 (①②③ 형식)
function loadCtaTemplate() {
  const p = path.join(__dirname, '..', 'data', 'cta-template.md');
  const raw = readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').trim();
  const [head, ...rest] = raw.split(/\n\s*\n/);
  const title = head.trim();
  const body = rest.join('\n\n').trim();
  return { title, body };
}

// ── 디자인 상수 ──
const COLOR_BG = "#F7F5F0";
const COLOR_INK = "#1A1A1A";
const COLOR_ACCENT = "#E8572C";
const COLOR_ACCENT_DARK = "#C4411A";
const COLOR_ACCENT_LIGHT = "#FDF0EB";
const BRAND = "나쿠 콘텐츠연구소";

const TITLE_SIZE_PX = { sm: 54, md: 66, lg: 82, xl: 96 };
const HOOK_TITLE_SIZE_PX = { sm: 78, md: 94, lg: 112, xl: 128 };
const BODY_SIZE_PX = { sm: 32, md: 38, lg: 44 };

// ── 유틸 함수 ──
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
function escMultiline(s) {
  return esc(s).replace(/\n/g, "<br/>");
}
function parseCtaItems(body) {
  const circled = /[①②③④⑤⑥⑦⑧⑨⑩]/;
  if (circled.test(body)) {
    return body.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map(p => p.trim()).filter(Boolean).slice(0, 5);
  }
  // 줄바꿈 우선 분해 (각 줄 앞의 "1." "1)" 같은 번호 접두사는 제거)
  const lines = body.split(/\n+/).map(p => p.replace(/^\s*\d+[).]\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 5);
  const numbered = body.split(/\s*(?:^|\s)\d+[).]\s*/).map(p => p.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0, 5);
  return body.split(/[·.,]/).map(p => p.trim()).filter(Boolean).slice(0, 5);
}
function parseBodyLines(body) {
  return body.split("\n").map(l => l.trim()).filter(Boolean);
}

// ── BASE CSS ──
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
  .hook-bg-split{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg,${COLOR_ACCENT} 0%,${COLOR_ACCENT_DARK} 100%);z-index:0;}
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
  .body-title{font-weight:800;line-height:1.22;letter-spacing:-0.02em;margin-top:32px}
  .body-divider{width:64px;height:5px;border-radius:3px;background:${COLOR_ACCENT};margin:36px 0 32px;flex-shrink:0;}
  .body-list{display:flex;flex-direction:column;gap:22px;flex:1;}
  .body-item{font-size:34px;font-weight:500;line-height:1.55;color:${COLOR_INK};opacity:0.88;margin:0;padding-left:32px;text-indent:-32px;}
  .body-bullet{color:${COLOR_ACCENT};font-size:22px;margin-right:14px;line-height:1;}
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
  <div class="body-list" style="margin-top:${bodyOffset}px">
${lines.map(line=>`    <p class="body-item"><span class="body-bullet">●</span>${esc(line)}</p>`).join("\n")}
  </div>
  ${pointText ? `<div class="body-point-box">
    <span class="body-point-label">${esc(pointLabel)}</span>
    <span class="body-point-text">${esc(pointText)}</span>
  </div>` : ""}
  ${brandFooter(card_no, total)}
</section>`;
  return wrapHtml(inner);
}

// ── 공지 #15 카드 데이터 ──
const SLIDES = [
  {
    card_no: 1,
    role: "hook",
    title: "🎓 공짜로 배우고\n40만원 쿠폰까지",
    body: "외식업 사장님, 4월 22일(수) 마감",
    hashtags: [],
    layout: {}
  },
  {
    card_no: 2,
    role: "context",
    title: "플레이스 스쿨이 뭔가요?",
    body: "네이버가 음식점·카페 사장님을 위해 직접 진행하는 무료 교육 프로그램입니다.\n스마트플레이스 기본부터 네이버 예약, 쿠폰, 톡톡 마케팅, 플레이스 광고까지 3주간 집중 학습할 수 있어요.\n이번 기수는 역대 최고 수준의 수료 혜택이 걸려 있습니다.",
    hashtags: [],
    layout: { pointText: "3주 집중 교육 + 최대 40만원 비즈쿠폰" }
  },
  {
    card_no: 3,
    role: "body",
    title: "언제, 어떻게 진행되나요?",
    body: "4월 28일(화) ~ 5월 19일(화), 3주 과정\n매주 화요일 오후 1시~5시 (4시간)\n5월 5일(어린이날)은 제외\n온라인 라이브 또는 오프라인(네이버 스퀘어 역삼 대강의장) 선택",
    hashtags: [],
    layout: { pointText: "매주 화요일 4시간, 3주 완성" }
  },
  {
    card_no: 4,
    role: "body",
    title: "무엇을 배우나요?",
    body: "1주차 · 플레이스 검색 구조와 운영 기초 세팅\n2주차 · 네이버 예약·쿠폰 실습, Connect+ 등 신규 서비스\n3주차 · 플레이스 광고 집행과 통계 분석\n예약 전환까지 이어지는 실전 마케팅 흐름",
    hashtags: [],
    layout: { pointText: "기초 세팅 → 예약 전환 → 광고 분석" }
  },
  {
    card_no: 5,
    role: "body",
    title: "수료하면 받는 혜택",
    body: "광고 컨설팅 1:1 신청만 해도 비즈쿠폰 20만원\n수료 시 추가 비즈쿠폰 20만원 지급\n최대 40만원 광고 지원금 제공\n세부 조건은 1주차 오리엔테이션에서 안내",
    hashtags: [],
    layout: { pointText: "최대 40만원 비즈쿠폰 지원" }
  },
  // card_no 6 (CTA)는 data/cta-template.md에서 고정 로드 (아래 main에서 병합)
];

const CTA_HASHTAGS = ["#플레이스스쿨", "#네이버스마트플레이스", "#외식업사장님", "#무료교육", "#비즈쿠폰", "#소상공인지원", "#카페창업"];

const NOTICE_ID = 15;

// CTA(6번) — 고정 템플릿에서 로드
const cta = loadCtaTemplate();
SLIDES.push({
  card_no: 6,
  role: "cta",
  title: cta.title,
  body: cta.body,
  hashtags: CTA_HASHTAGS,
  layout: {},
});

const total = SLIDES.length;

async function main() {
  console.log(`▶ 공지 #${NOTICE_ID} 카드뉴스 생성 시작...`);

  // 1. 기존 세트 삭제
  await sql`DELETE FROM card_news_sets WHERE notice_id = ${NOTICE_ID}`;
  console.log("  기존 세트 삭제 완료");

  // 2. 새 세트 생성
  const setRows = await sql`
    INSERT INTO card_news_sets (notice_id, audience, tone, card_count, status)
    VALUES (${NOTICE_ID}, '외식업 사장님', 'Claude HTML 직접 생성(v3, 캐릭터 없음)', ${total}, 'draft')
    RETURNING id
  `;
  const setId = setRows[0].id;
  console.log(`  세트 생성: ID=${setId}`);

  // 3. 각 슬라이드 HTML 생성 및 저장
  for (const s of SLIDES) {
    const html = renderCardHtml({ ...s, total });
    await sql`
      INSERT INTO card_news_slides (set_id, card_no, role, title, body, hashtags, html, layout)
      VALUES (
        ${setId}, ${s.card_no}, ${s.role}, ${s.title}, ${s.body},
        ${s.hashtags.length > 0 ? s.hashtags : null},
        ${html},
        ${Object.keys(s.layout).length > 0 ? JSON.stringify(s.layout) : null}::jsonb
      )
    `;
    console.log(`  카드 ${s.card_no} 저장: ${s.role} — ${s.title}`);
  }

  console.log(`\n✅ 완료! set_id=${setId}, ${total}장 저장됨`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ 오류:", err.message);
  process.exit(1);
});
