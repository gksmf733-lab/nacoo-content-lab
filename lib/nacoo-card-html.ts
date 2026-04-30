// NACOO 카드뉴스 7장 렌더러
// 단호·진단형 톤 / 다크 + 골든 컬러 시스템 / 1080×1350 인스타 4:5
// 스타일가이드: "C:/Users/Z840/Desktop/나쿠 연구/나쿠 인스타/카드뉴스/스타일가이드_NACOO.md"
//
// 각 슬라이드는 독립된 완전한 HTML 문서로 출력 — save-cards.mjs 가 puppeteer 로
// 1장씩 PNG 캡처하기 때문에 fragment 가 아닌 standalone 이어야 한다.

export type NacooRole = "thumb" | "quote" | "compare" | "timeline" | "checklist" | "insight" | "cta";

// ── 슬라이드별 데이터 구조 (card_news_slides.layout JSONB 에 저장) ──

export type ThumbLayout = {
  /** 메인 타이틀 4줄 (각 줄 최대 13자 권장). 길면 titleSize 로 축소 */
  titleLines: [string, string, string, string];
  /** em(골든) 강조 들어갈 줄 인덱스 (0~3). 보통 2번 줄(가운데) */
  emphasisIndex?: number;
  /** light(연회색) 처리 들어갈 줄 인덱스 (0~3). 보통 1번 줄 */
  lightIndex?: number;
  /** 타이틀 폰트 크기 px (기본 120). 4줄이거나 길면 104·92 등으로 축소 */
  titleSize?: number;
  /** 서브 1줄 */
  subLine1: string;
  /** 서브 2줄 — 강조 키워드 한 곳을 highlight 로 분리 */
  subLine2Prefix?: string;
  subHighlight?: string;
  subSuffix?: string;
};

export type QuoteLayout = {
  /** 라벨: "핵심 요약" / "이슈" / "문제" 중 택1 */
  label: string;
  /** 큰 인용문 1줄 */
  quoteLine1: string;
  /** 큰 인용문 2줄 — em(골든) 처리 */
  quoteHighlight: string;
  /** 항목 정확히 3개 */
  items: Array<{ title: string; desc: string }>;
  /** 골든 짧은 가로선 + 결론 한 줄 (선택) */
  conclusion?: string;
};

export type CompareLayout = {
  /** 라벨: "진단" / "안내" / "비교" 중 택1 */
  label: string;
  /** 헤드라인 1줄 */
  headLine1: string;
  /** underline-gold 강조 키워드 */
  headHighlight: string;
  /** 강조 뒤 꼬리말 (예: "한 번에 정리") */
  headSuffix?: string;
  /** 행 4개 — type='wrong'(취소선/회색) / 'right'(흰색굵게) */
  rows: Array<{ tag: string; text: string; type: "right" | "wrong" }>;
  /** verdict 박스 — 골든 좌측 보더 결론 */
  verdictLine1: string;
  /** strong 굵은 키워드 */
  verdictBold?: string;
  verdictSuffix?: string;
};

export type TimelineLayout = {
  /** 라벨: "방법" / "대상" / "절차" 중 택1 */
  label: string;
  /** 헤드라인 1줄 */
  headLine1: string;
  /** em(골든) 강조 */
  headHighlight: string;
  /** 단계 4~5개 */
  steps: Array<{ time: string; title: string; desc: string }>;
};

export type ChecklistLayout = {
  /** 라벨: "체크리스트" / "자주 묻는 질문" 중 택1 */
  label: string;
  /** 캡처 태그 (예: "캡처해서 매장에 적용") */
  captureTag: string;
  head: string;
  headSub?: string;
  /** 체크 항목 5~7개 */
  checks: Array<{ title: string; dim?: string }>;
};

export type InsightLayout = {
  /** 라벨 (고정에 가깝게: "인사이트") */
  label: string;
  /** KEY 스탬프: "본질" / "정리" / "핵심" */
  keyStamp: string;
  /** 헤드라인 1줄 앞부분 */
  headPrefix: string;
  /** em(cream — 골든 위 흰색톤) 강조 */
  headHighlight: string;
  /** 강조 뒤 꼬리말 */
  headSuffix?: string;
  /** 헤드라인 2줄 (선택) */
  headLine2?: string;
  /** 핵심 4가지 */
  points: Array<{ title: string; desc: string }>;
};

export type NacooLayout =
  | { role: "thumb"; data: ThumbLayout }
  | { role: "quote"; data: QuoteLayout }
  | { role: "compare"; data: CompareLayout }
  | { role: "timeline"; data: TimelineLayout }
  | { role: "checklist"; data: ChecklistLayout }
  | { role: "insight"; data: InsightLayout }
  | { role: "cta"; data: Record<string, never> };

// ── 공통 CSS (모든 슬라이드 동일) ──
const NACOO_CSS = `
:root{
  --ink:#0F1A2E; --ink-deep:#0A1424; --card:#1A2843; --surface:#2A3B5C;
  --line:rgba(180,200,220,0.15); --line-strong:rgba(180,200,220,0.3);
  --gold:#F5B82E; --gold-soft:rgba(245,184,46,0.12); --cream:#FFF4D4;
  --text:#E8EDF5; --mute:#7E92AE; --mute-strong:#B0BFD2;
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{
  background:#040810; font-family:'Pretendard',sans-serif;
  color:var(--text); -webkit-font-smoothing:antialiased; font-feature-settings:'tnum';
}
body{padding:0;display:flex;justify-content:center;align-items:center;}
.slide{width:1080px;height:1350px;position:relative;overflow:hidden;color:var(--text);display:flex;flex-direction:column;}
.bg-ink{background:var(--ink);}
.bg-deep{background:var(--ink-deep);}
.accent-gold{color:var(--gold);}
.strike{color:var(--mute);text-decoration:line-through;text-decoration-color:rgba(126,146,174,0.5);}
.underline-gold{background:linear-gradient(transparent 70%,rgba(245,184,46,0.85) 70%,rgba(245,184,46,0.85) 92%,transparent 92%);padding:0 3px;}

.head{position:absolute;top:80px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--line);}
.label{font-size:14px;font-weight:700;color:var(--gold);letter-spacing:0.32em;}
.brand{font-size:14px;color:var(--mute);font-weight:600;letter-spacing:0.24em;}
.foot{position:absolute;bottom:60px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;padding-top:18px;border-top:1px solid var(--line);}
.foot .handle{font-size:15px;color:var(--mute);letter-spacing:0.05em;}
.foot .swipe{font-size:14px;color:var(--gold);font-weight:700;letter-spacing:0.24em;}
.body{position:absolute;top:160px;bottom:140px;left:90px;right:90px;display:flex;flex-direction:column;}

/* s1 썸네일 */
.s1{background:radial-gradient(circle 400px at 85% 15%,rgba(245,184,46,0.07) 0%,transparent 50%),radial-gradient(circle 600px at 15% 90%,rgba(30,55,100,0.5) 0%,transparent 60%),linear-gradient(165deg,#0F1A2E 0%,#0A1424 50%,#050B17 100%);overflow:hidden;}
.s1::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.35) 100%);pointer-events:none;z-index:1;}
.s1 .body{align-items:center;justify-content:center;text-align:center;z-index:2;}
.s1 .head{border-bottom:none;justify-content:space-between;padding-bottom:0;z-index:3;align-items:flex-start;}
.s1 .brand-label{display:flex;flex-direction:column;gap:8px;}
.s1 .brand-label .l1{font-size:16px;color:var(--gold);font-weight:700;letter-spacing:0.32em;}
.s1 .brand-label .l2{font-size:22px;color:var(--text);font-weight:700;letter-spacing:-0.01em;}
.s1 .brand-label .l2 .em{color:var(--gold);}
.s1 .top-mark{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:54px;}
.s1 .top-mark .ornament{display:flex;align-items:center;gap:14px;}
.s1 .top-mark .ornament .l{width:60px;height:1px;background:var(--gold);}
.s1 .top-mark .ornament .dot{width:5px;height:5px;background:var(--gold);transform:rotate(45deg);}
.s1 .cover-title{font-weight:700;line-height:1.08;letter-spacing:-0.035em;margin-bottom:54px;}
.s1 .cover-title .em{color:var(--gold);}
.s1 .cover-title .light{font-weight:500;color:var(--mute-strong);}
.s1 .cover-sub{font-size:26px;color:var(--mute-strong);font-weight:500;line-height:1.6;letter-spacing:-0.01em;max-width:820px;padding-top:36px;position:relative;}
.s1 .cover-sub::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:56px;height:1px;background:var(--line-strong);}
.s1 .cover-sub .gold{color:var(--gold);font-weight:700;}

/* s2 인용/핵심요약 */
.s2 .quote-svg{margin-bottom:18px;}
.s2 .quote{font-size:54px;font-weight:700;line-height:1.32;letter-spacing:-0.02em;margin-bottom:64px;}
.s2 .quote .em{color:var(--gold);}
.s2 .list{display:flex;flex-direction:column;}
.s2 .item{display:grid;grid-template-columns:96px 1fr;gap:24px;padding:32px 0;border-top:1px solid var(--line);align-items:start;}
.s2 .item:last-child{border-bottom:1px solid var(--line);}
.s2 .num{font-size:36px;font-weight:700;color:var(--gold);letter-spacing:-0.02em;line-height:1;padding-top:4px;}
.s2 .item-body{display:flex;flex-direction:column;gap:8px;}
.s2 .item-title{font-size:30px;font-weight:700;}
.s2 .item-desc{font-size:21px;color:var(--mute-strong);font-weight:400;line-height:1.55;}
.s2 .conclusion{margin-top:42px;font-size:24px;color:var(--mute);font-weight:500;padding-left:120px;position:relative;}
.s2 .conclusion::before{content:"";position:absolute;left:0;top:16px;width:96px;height:1px;background:var(--gold);}

/* s3 진단/안내 */
.s3 .head-title{font-size:54px;font-weight:700;line-height:1.3;margin-bottom:54px;letter-spacing:-0.025em;}
.s3 .compare{display:flex;flex-direction:column;}
.s3 .row{display:grid;grid-template-columns:160px 1fr;gap:28px;padding:30px 0;border-top:1px solid var(--line);align-items:start;}
.s3 .row:last-child{border-bottom:1px solid var(--line);}
.s3 .row-tag{font-size:15px;font-weight:700;letter-spacing:0.24em;padding-top:10px;}
.s3 .row.wrong .row-tag{color:var(--mute);}
.s3 .row.right .row-tag{color:var(--gold);}
.s3 .row-text{font-size:32px;font-weight:500;line-height:1.42;letter-spacing:-0.01em;}
.s3 .row.wrong .row-text{color:var(--mute);}
.s3 .row.right .row-text{color:var(--text);font-weight:700;}
.s3 .verdict{margin-top:42px;padding:32px 36px;background:var(--gold-soft);border-left:4px solid var(--gold);font-size:25px;font-weight:500;line-height:1.55;}
.s3 .verdict strong{color:var(--gold);font-weight:700;}

/* s4 타임라인 */
.s4 .head-title{font-size:54px;font-weight:700;line-height:1.25;margin-bottom:60px;letter-spacing:-0.025em;}
.s4 .head-title .em{color:var(--gold);}
.s4 .timeline{position:relative;padding-left:54px;}
.s4 .timeline::before{content:"";position:absolute;left:20px;top:14px;bottom:14px;width:1px;background:var(--line-strong);}
.s4 .step{position:relative;padding-bottom:38px;}
.s4 .step:last-child{padding-bottom:0;}
.s4 .step::before{content:"";position:absolute;left:-42px;top:10px;width:16px;height:16px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 5px var(--ink);}
.s4 .step-time{font-size:15px;color:var(--gold);font-weight:700;letter-spacing:0.24em;margin-bottom:8px;}
.s4 .step-title{font-size:28px;font-weight:700;margin-bottom:8px;letter-spacing:-0.01em;}
.s4 .step-desc{font-size:20px;color:var(--mute-strong);line-height:1.6;}

/* s5 체크리스트 */
.s5 .capture-tag{display:inline-block;font-size:14px;font-weight:700;color:var(--gold);border:1px solid var(--gold);padding:8px 18px;letter-spacing:0.3em;margin-bottom:28px;}
.s5 .head-title{font-size:50px;font-weight:700;line-height:1.25;margin-bottom:10px;letter-spacing:-0.025em;}
.s5 .head-sub{font-size:22px;color:var(--mute);font-weight:500;margin-bottom:42px;}
.s5 .checkbox-list{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--gold);padding:36px 40px;display:flex;flex-direction:column;gap:24px;}
.s5 .check{display:flex;gap:22px;align-items:flex-start;}
.s5 .check .box{width:26px;height:26px;border:2px solid var(--gold);flex-shrink:0;margin-top:5px;position:relative;}
.s5 .check .box::after{content:"";position:absolute;left:5px;top:1px;width:8px;height:15px;border:solid var(--gold);border-width:0 3px 3px 0;transform:rotate(45deg);}
.s5 .check-text{font-size:23px;font-weight:700;line-height:1.5;}
.s5 .check-text .dim{color:var(--mute);font-weight:400;font-size:19px;display:block;margin-top:5px;}

/* s6 인사이트 (골든 배경) */
.s6{background:var(--gold);color:var(--ink-deep);}
.s6 .head{border-bottom-color:rgba(15,26,46,0.3);}
.s6 .label{color:var(--ink-deep);}
.s6 .brand{color:rgba(15,26,46,0.6);}
.s6 .foot{border-top-color:rgba(15,26,46,0.3);}
.s6 .foot .handle{color:rgba(15,26,46,0.7);}
.s6 .foot .swipe{color:var(--ink-deep);}
.s6 .key-stamp{font-size:16px;color:rgba(15,26,46,0.5);font-weight:700;letter-spacing:0.28em;margin-bottom:18px;}
.s6 .head-title{font-size:72px;font-weight:700;line-height:1.18;letter-spacing:-0.03em;margin-bottom:54px;color:var(--ink-deep);}
.s6 .head-title em{font-style:normal;font-weight:700;color:var(--cream);}
.s6 .points{display:flex;flex-direction:column;}
.s6 .point{display:grid;grid-template-columns:78px 1fr;gap:24px;padding:30px 0;border-top:1px solid rgba(15,26,46,0.3);align-items:start;}
.s6 .point:last-child{border-bottom:1px solid rgba(15,26,46,0.3);}
.s6 .pt-num{font-size:34px;font-weight:700;color:var(--ink-deep);letter-spacing:-0.02em;}
.s6 .pt-title{font-size:30px;font-weight:700;color:var(--ink-deep);margin-bottom:6px;}
.s6 .pt-desc{font-size:19px;color:rgba(15,26,46,0.72);line-height:1.55;}

/* s7 CTA */
.s7{background:var(--ink-deep);display:flex;align-items:center;justify-content:center;}
.s7 .cta-wrap{text-align:center;width:640px;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong);padding:80px 0;}
.s7 .cta-stamp{font-size:14px;font-weight:700;color:var(--gold);letter-spacing:0.4em;margin-bottom:36px;}
.s7 .cta-text{font-size:36px;font-weight:700;line-height:1.55;letter-spacing:-0.02em;}
.s7 .cta-text .em{color:var(--gold);}
.s7 .cta-text .br{display:block;height:24px;}
.s7 .cta-handle{margin-top:32px;font-size:30px;font-weight:700;color:var(--gold);letter-spacing:0.05em;}
`;

// ── 유틸 ──

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(slideHtml: string, opts: { title?: string } = {}): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${esc(opts.title ?? "NACOO 카드뉴스")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${NACOO_CSS}</style></head><body>${slideHtml}</body></html>`;
}

function commonHead(label: string): string {
  return `<div class="head"><div class="label">${esc(label)}</div><div class="brand">NACOO</div></div>`;
}

const COMMON_FOOT = `<div class="foot"><div class="handle">@nacoo_ceo</div><div class="swipe">SWIPE →</div></div>`;

// ── 슬라이드별 렌더러 ──

function renderThumb(d: ThumbLayout): string {
  const lines = d.titleLines;
  const emI = d.emphasisIndex ?? 2;
  const lightI = d.lightIndex ?? 1;
  const lineHtml = lines
    .map((line, i) => {
      const safe = esc(line);
      if (i === emI) return `<span class="em">${safe}</span>`;
      if (i === lightI) return `<span class="light">${safe}</span>`;
      return safe;
    })
    .join("<br>");
  const sizeStyle = d.titleSize ? ` style="font-size:${d.titleSize}px"` : ` style="font-size:120px"`;

  const subHTML = d.subHighlight
    ? `${esc(d.subLine1)}<br>${esc(d.subLine2Prefix ?? "")}<span class="gold">${esc(d.subHighlight)}</span>${esc(d.subSuffix ?? "")}`
    : esc(d.subLine1);

  const slide = `<div class="slide s1">
  <div class="head">
    <div class="brand-label">
      <div class="l1">NACOO</div>
      <div class="l2"><span class="em">나쿠</span>의 네이버 마케팅 연구소</div>
    </div>
  </div>
  <div class="body">
    <div class="top-mark"><div class="ornament"><div class="l"></div><div class="dot"></div><div class="l"></div></div></div>
    <div class="cover-title"${sizeStyle}>${lineHtml}</div>
    <div class="cover-sub">${subHTML}</div>
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: lines.join(" ") });
}

function renderQuote(d: QuoteLayout): string {
  const items = d.items
    .slice(0, 3)
    .map(
      (it, i) => `<div class="item">
        <div class="num">${String(i + 1).padStart(2, "0")}</div>
        <div class="item-body">
          <div class="item-title">${esc(it.title)}</div>
          <div class="item-desc">${esc(it.desc)}</div>
        </div>
      </div>`
    )
    .join("\n      ");

  const slide = `<div class="slide bg-ink s2">
  ${commonHead(`! ${d.label}`)}
  <div class="body">
    <svg class="quote-svg" width="72" height="56" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 70 Q 5 25, 35 5 L 40 20 Q 25 35, 25 70 Z" fill="#F5B82E"/>
      <path d="M65 70 Q 65 25, 95 5 L 100 20 Q 85 35, 85 70 Z" fill="#F5B82E"/>
    </svg>
    <div class="quote">${esc(d.quoteLine1)},<br><span class="em">${esc(d.quoteHighlight)}</span></div>
    <div class="list">
      ${items}
    </div>
    ${d.conclusion ? `<div class="conclusion">${esc(d.conclusion)}</div>` : ""}
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: d.label });
}

function renderCompare(d: CompareLayout): string {
  const rows = d.rows
    .slice(0, 4)
    .map(
      (r) =>
        `<div class="row ${r.type === "wrong" ? "wrong" : "right"}">
        <div class="row-tag">${esc(r.tag)}</div>
        <div class="row-text">${esc(r.text)}</div>
      </div>`
    )
    .join("\n      ");

  const verdict = d.verdictBold
    ? `${esc(d.verdictLine1)} <strong>${esc(d.verdictBold)}</strong>${esc(d.verdictSuffix ?? "")}`
    : esc(d.verdictLine1);

  const slide = `<div class="slide bg-ink s3">
  ${commonHead(`◇ ${d.label}`)}
  <div class="body">
    <div class="head-title">${esc(d.headLine1)}<br><span class="underline-gold">${esc(d.headHighlight)}</span>${esc(d.headSuffix ?? "")}</div>
    <div class="compare">
      ${rows}
    </div>
    <div class="verdict">${verdict}</div>
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: d.label });
}

function renderTimeline(d: TimelineLayout): string {
  const steps = d.steps
    .slice(0, 5)
    .map(
      (s) => `<div class="step">
        <div class="step-time">${esc(s.time)}</div>
        <div class="step-title">${esc(s.title)}</div>
        <div class="step-desc">${esc(s.desc)}</div>
      </div>`
    )
    .join("\n      ");

  const slide = `<div class="slide bg-ink s4">
  ${commonHead(`▶ ${d.label}`)}
  <div class="body">
    <div class="head-title">${esc(d.headLine1)}<br><span class="em">${esc(d.headHighlight)}</span></div>
    <div class="timeline">
      ${steps}
    </div>
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: d.label });
}

function renderChecklist(d: ChecklistLayout): string {
  const checks = d.checks
    .slice(0, 7)
    .map(
      (c) => `<div class="check">
        <div class="box"></div>
        <div class="check-text">${esc(c.title)}${c.dim ? `<span class="dim">${esc(c.dim)}</span>` : ""}</div>
      </div>`
    )
    .join("\n      ");

  const slide = `<div class="slide bg-ink s5">
  ${commonHead(`□ ${d.label}`)}
  <div class="body">
    <div class="capture-tag">▸ ${esc(d.captureTag)}</div>
    <div class="head-title">${esc(d.head)}</div>
    ${d.headSub ? `<div class="head-sub">${esc(d.headSub)}</div>` : ""}
    <div class="checkbox-list">
      ${checks}
    </div>
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: d.label });
}

function renderInsight(d: InsightLayout): string {
  const points = d.points
    .slice(0, 4)
    .map(
      (p, i) => `<div class="point">
        <div class="pt-num">${String(i + 1).padStart(2, "0")}</div>
        <div>
          <div class="pt-title">${esc(p.title)}</div>
          <div class="pt-desc">${esc(p.desc)}</div>
        </div>
      </div>`
    )
    .join("\n      ");

  const headLine1 = `${esc(d.headPrefix)} <em>${esc(d.headHighlight)}</em>${esc(d.headSuffix ?? "")}`;
  const headLine2 = d.headLine2 ? `<br>${esc(d.headLine2)}` : "";

  const slide = `<div class="slide s6">
  ${commonHead(`★ ${d.label}`)}
  <div class="body">
    <div class="key-stamp">— ${esc(d.keyStamp)}</div>
    <div class="head-title">${headLine1}${headLine2}</div>
    <div class="points">
      ${points}
    </div>
  </div>
  ${COMMON_FOOT}
</div>`;
  return wrap(slide, { title: d.label });
}

// CTA 는 고정 — CTA_고정.md 의 마크업 그대로 (절대 변경 금지)
function renderCta(): string {
  const slide = `<div class="slide s7">
  <div class="cta-wrap">
    <div class="cta-stamp">NACOO</div>
    <div class="cta-text">
      <span class="em">나쿠</span> 팔로우 후<br>
      댓글 남기시면
      <span class="br"></span>
      네이버 마케팅 정보를<br>
      <span class="em">가장 빠르게</span> 보내주는<br>
      <span class="underline-gold">정보 공유방 링크</span> 보내드려요!
    </div>
    <div class="cta-handle">@nacoo_ceo</div>
  </div>
</div>`;
  return wrap(slide, { title: "CTA" });
}

// ── 외부 노출: NacooLayout → HTML 문자열 ──
export function renderNacooSlide(layout: NacooLayout): string {
  switch (layout.role) {
    case "thumb": return renderThumb(layout.data);
    case "quote": return renderQuote(layout.data);
    case "compare": return renderCompare(layout.data);
    case "timeline": return renderTimeline(layout.data);
    case "checklist": return renderChecklist(layout.data);
    case "insight": return renderInsight(layout.data);
    case "cta": return renderCta();
  }
}

// 7장 카드 일괄 생성용 — AI JSON 응답 → 슬라이드 배열
export type NacooBriefJson = {
  thumb: ThumbLayout;
  quote: QuoteLayout;
  compare: CompareLayout;
  timeline: TimelineLayout;
  checklist: ChecklistLayout;
  insight: InsightLayout;
};

export type NacooSlideRow = {
  card_no: number;
  role: NacooRole;
  title: string;
  body: string;
  layout: object;
  html: string;
};

export function buildNacooSlideRows(brief: NacooBriefJson): NacooSlideRow[] {
  const rows: NacooSlideRow[] = [];
  rows.push({
    card_no: 1, role: "thumb",
    title: brief.thumb.titleLines.join(" "),
    body: brief.thumb.subLine1,
    layout: brief.thumb,
    html: renderNacooSlide({ role: "thumb", data: brief.thumb }),
  });
  rows.push({
    card_no: 2, role: "quote",
    title: brief.quote.label,
    body: `${brief.quote.quoteLine1} ${brief.quote.quoteHighlight}`,
    layout: brief.quote,
    html: renderNacooSlide({ role: "quote", data: brief.quote }),
  });
  rows.push({
    card_no: 3, role: "compare",
    title: brief.compare.label,
    body: `${brief.compare.headLine1} ${brief.compare.headHighlight}`,
    layout: brief.compare,
    html: renderNacooSlide({ role: "compare", data: brief.compare }),
  });
  rows.push({
    card_no: 4, role: "timeline",
    title: brief.timeline.label,
    body: `${brief.timeline.headLine1} ${brief.timeline.headHighlight}`,
    layout: brief.timeline,
    html: renderNacooSlide({ role: "timeline", data: brief.timeline }),
  });
  rows.push({
    card_no: 5, role: "checklist",
    title: brief.checklist.label,
    body: brief.checklist.head,
    layout: brief.checklist,
    html: renderNacooSlide({ role: "checklist", data: brief.checklist }),
  });
  rows.push({
    card_no: 6, role: "insight",
    title: brief.insight.label,
    body: `${brief.insight.headPrefix} ${brief.insight.headHighlight}`,
    layout: brief.insight,
    html: renderNacooSlide({ role: "insight", data: brief.insight }),
  });
  rows.push({
    card_no: 7, role: "cta",
    title: "CTA",
    body: "나쿠 팔로우 후 댓글 남기시면 정보 공유방 링크 보내드려요",
    layout: {},
    html: renderNacooSlide({ role: "cta", data: {} }),
  });
  return rows;
}
