// 카드뉴스 HTML 생성기 — 단일 진실 소스 (SSOT)
// PATCH API, 로컬 저장 CLI, 수동 생성 스크립트 모두 이 함수를 호출한다.

export type CardRole = "hook" | "context" | "body" | "cta";

export type CardLayout = {
  /** 제목 정렬 (기본: hook=center, 나머지=left) */
  titleAlign?: "left" | "center";
  /** 제목 크기 단계 (기본 md). hook은 한 단계 크게 적용됨 */
  titleSize?: "sm" | "md" | "lg" | "xl";
  /** 본문 크기 단계 (기본 md) */
  bodySize?: "sm" | "md" | "lg";
  /** 본문 위쪽 여백 조정 px (기본 0, -60 ~ 200) */
  bodyOffset?: number;
  /** 포인트 박스 문구 (body/context 롤). 비워두면 박스 숨김 */
  pointText?: string;
  /** 포인트 박스 라벨 (기본: POINT) */
  pointLabel?: string;
  /** hook 롤 아이콘 (이모지, 기본: title 맨 앞 이모지 자동 추출) */
  icon?: string;
  /** hook 롤 서브 카피 (기본: body 첫 줄) */
  sub?: string;
};

export type CardInput = {
  card_no: number;
  total: number;
  role: CardRole;
  title: string;
  body: string;
  layout?: CardLayout | null;
};

const COLOR_BG = "#F7F5F0";
const COLOR_INK = "#1A1A1A";
const COLOR_ACCENT = "#E8572C";
const BRAND = "나쿠 콘텐츠연구소";

const TITLE_SIZE_PX: Record<NonNullable<CardLayout["titleSize"]>, number> = {
  sm: 54,
  md: 66,
  lg: 82,
  xl: 96,
};

const HOOK_TITLE_SIZE_PX: Record<NonNullable<CardLayout["titleSize"]>, number> = {
  sm: 78,
  md: 94,
  lg: 112,
  xl: 128,
};

const BODY_SIZE_PX: Record<NonNullable<CardLayout["bodySize"]>, number> = {
  sm: 32,
  md: 38,
  lg: 44,
};

/** 문자열 첫 이모지를 뽑아 반환 (없으면 빈 문자열) + 나머지 텍스트 */
function splitLeadingEmoji(s: string): { icon: string; rest: string } {
  // Emoji property \p{Extended_Pictographic}
  const m = s.match(/^\s*(\p{Extended_Pictographic})\s*/u);
  if (m) return { icon: m[1], rest: s.slice(m[0].length) };
  return { icon: "", rest: s };
}

/** HTML-이스케이프 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 본문/제목에 자동 `<br/>` 삽입: 문장부호 근처에서 줄바꿈 */
function autoBreakTitle(s: string): string {
  const clean = esc(s).replace(/\n+/g, " ").trim();
  // 14자 이내면 한 줄
  if (clean.length <= 14) return clean;
  // 가운데 근처 공백에서 쪼개기
  const mid = Math.floor(clean.length / 2);
  let splitAt = -1;
  for (let d = 0; d < clean.length; d++) {
    const l = mid - d;
    const r = mid + d;
    if (l > 0 && clean[l] === " ") {
      splitAt = l;
      break;
    }
    if (r < clean.length && clean[r] === " ") {
      splitAt = r;
      break;
    }
  }
  if (splitAt === -1) return clean;
  return clean.slice(0, splitAt) + "<br/>" + clean.slice(splitAt + 1);
}

function escMultiline(s: string): string {
  return esc(s).replace(/\n/g, "<br/>");
}

/** CTA 본문에서 ①②③ 또는 숫자+) 패턴으로 리스트 아이템 추출 */
function parseCtaItems(body: string): string[] {
  const circled = /[①②③④⑤⑥⑦⑧⑨⑩]/;
  if (circled.test(body)) {
    const parts = body.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map((p) => p.trim()).filter(Boolean);
    return parts.slice(0, 5);
  }
  // "1) ..." 또는 "1. ..."
  const numbered = body.split(/\s*(?:^|\s)\d+[).]\s*/).map((p) => p.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0, 5);
  // 마지막: 온점/콤마로 분리
  return body
    .split(/[·.,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 5);
}

const BASE_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1350px}
  body{
    font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;
    background:${COLOR_BG};
    color:${COLOR_INK};
    -webkit-font-smoothing:antialiased;
  }
  section.card{
    position:relative;width:1080px;height:1350px;
    padding:120px 100px;display:flex;flex-direction:column;
  }
  .brand{font-size:22px;font-weight:500;letter-spacing:0.02em;color:${COLOR_INK};opacity:0.55}
  .pagenum{position:absolute;right:100px;bottom:120px;font-size:22px;font-weight:500;color:${COLOR_INK};opacity:0.55}
  .dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:${COLOR_ACCENT};margin-right:10px;vertical-align:middle}
  .tag{display:inline-block;font-size:22px;font-weight:600;color:${COLOR_ACCENT};letter-spacing:0.02em;text-transform:uppercase}
  .hook-wrap{flex:1;display:flex;flex-direction:column;justify-content:center}
  .hook-icon{font-size:140px;margin-bottom:20px;color:${COLOR_ACCENT}}
  .hook-title{font-weight:800;line-height:1.22;letter-spacing:-0.02em}
  .hook-sub{margin-top:44px;font-weight:500;line-height:1.5;color:${COLOR_INK};opacity:0.72;font-size:36px}
  .body-title{font-weight:800;line-height:1.22;letter-spacing:-0.02em}
  .body-text{font-weight:500;line-height:1.6;color:${COLOR_INK};opacity:0.82}
  .point-box{margin-top:auto;padding:40px 44px;background:#FFFFFF;border:2px solid ${COLOR_INK};border-radius:24px;font-size:28px;font-weight:600;line-height:1.5;color:${COLOR_INK}}
  .point-box .point-label{display:block;font-size:22px;font-weight:700;color:${COLOR_ACCENT};margin-bottom:10px;letter-spacing:0.04em}
  .cta-card{background:${COLOR_ACCENT};color:#FFFFFF}
  .cta-card .brand,.cta-card .pagenum{color:#FFFFFF;opacity:0.8}
  .cta-card .dot{background:#FFFFFF}
  .cta-card .tag{color:#FFFFFF !important}
  .cta-title{margin-top:28px;font-size:78px;font-weight:800;line-height:1.2;letter-spacing:-0.02em}
  .cta-list{margin-top:64px;list-style:none;display:flex;flex-direction:column;gap:28px}
  .cta-list li{font-size:36px;font-weight:600;line-height:1.45;padding-left:64px;position:relative}
  .cta-list li .num{position:absolute;left:0;top:0;width:48px;height:48px;border-radius:50%;background:#FFFFFF;color:${COLOR_ACCENT};font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center}
`;

function wrapHtml(inner: string): string {
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

export function renderCardHtml(input: CardInput): string {
  const layout: CardLayout = input.layout ?? {};
  const titleAlign: "left" | "center" =
    layout.titleAlign ?? (input.role === "hook" ? "center" : "left");
  const titleSize = layout.titleSize ?? "md";
  const bodySize = layout.bodySize ?? "md";
  const bodyOffset = Number(layout.bodyOffset ?? 0);

  const pageNum = `${input.card_no} / ${input.total}`;

  if (input.role === "hook") {
    const { icon: leadIcon, rest } = splitLeadingEmoji(input.title);
    const icon = layout.icon ?? leadIcon ?? "";
    const titleHtml = autoBreakTitle(rest || input.title);
    const sub = layout.sub ?? input.body.split("\n")[0] ?? "";
    const titlePx = HOOK_TITLE_SIZE_PX[titleSize];
    const subPx = BODY_SIZE_PX[bodySize];
    const inner = `<section class="card">
  <div class="brand"><span class="dot"></span>${esc(BRAND)}</div>
  <div class="hook-wrap" style="text-align:${titleAlign}">
    ${icon ? `<div class="hook-icon">${esc(icon)}</div>` : ""}
    <h1 class="hook-title" style="font-size:${titlePx}px;${titleAlign === "center" ? "" : "text-align:left;"}">${titleHtml}</h1>
    ${sub ? `<p class="hook-sub" style="font-size:${subPx}px;margin-top:${44 + bodyOffset}px">${escMultiline(sub)}</p>` : ""}
  </div>
  <div class="pagenum">${pageNum}</div>
</section>`;
    return wrapHtml(inner);
  }

  if (input.role === "cta") {
    const titlePx = HOOK_TITLE_SIZE_PX[titleSize] - 18;
    const items = parseCtaItems(input.body);
    const inner = `<section class="card cta-card">
  <div class="brand"><span class="dot"></span>${esc(BRAND)}</div>
  <div class="tag" style="margin-top:40px">ACTION</div>
  <h2 class="cta-title" style="font-size:${titlePx}px;text-align:${titleAlign}">${autoBreakTitle(input.title)}</h2>
  <ul class="cta-list" style="margin-top:${64 + bodyOffset}px">
${items.map((it, i) => `    <li><span class="num">${i + 1}</span>${esc(it)}</li>`).join("\n")}
  </ul>
  <div class="pagenum">${pageNum}</div>
</section>`;
    return wrapHtml(inner);
  }

  // context | body
  const tagText =
    input.role === "context"
      ? "CONTEXT"
      : `POINT ${Math.max(1, input.card_no - 2)}`;
  const titlePx = TITLE_SIZE_PX[titleSize];
  const bodyPx = BODY_SIZE_PX[bodySize];
  const pointLabel = layout.pointLabel ?? "POINT";
  const pointText = layout.pointText ?? "";
  const inner = `<section class="card">
  <div class="brand"><span class="dot"></span>${esc(BRAND)}</div>
  <div class="tag" style="margin-top:40px">${esc(tagText)}</div>
  <h2 class="body-title" style="font-size:${titlePx}px;margin-top:28px;text-align:${titleAlign}">${autoBreakTitle(input.title)}</h2>
  <p class="body-text" style="font-size:${bodyPx}px;margin-top:${60 + bodyOffset}px;text-align:${titleAlign}">${escMultiline(input.body)}</p>
  ${pointText ? `<div class="point-box"><span class="point-label">${esc(pointLabel)}</span>${esc(pointText)}</div>` : ""}
  <div class="pagenum">${pageNum}</div>
</section>`;
  return wrapHtml(inner);
}

export function normalizeRole(role: string): CardRole {
  const r = role.toLowerCase();
  if (r === "hook" || r === "훅") return "hook";
  if (r === "context" || r === "맥락") return "context";
  if (r === "cta") return "cta";
  return "body";
}
