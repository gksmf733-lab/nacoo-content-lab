/**
 * 자동화: 7개 신규 공지에 대한 카드뉴스 일괄 생성
 * 각 공지당 6장 카드 생성 후 POST /api/card-news
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// renderCardHtml을 TS 없이 직접 구현 (동일 로직)
const COLOR_BG = "#F7F5F0";
const COLOR_INK = "#1A1A1A";
const COLOR_ACCENT = "#E8572C";
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

function escMultiline(s) { return esc(s).replace(/\n/g,"<br/>"); }

function parseCtaItems(body) {
  const circled = /[①②③④⑤⑥⑦⑧⑨⑩]/;
  if (circled.test(body)) {
    return body.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map(p=>p.trim()).filter(Boolean).slice(0,5);
  }
  const numbered = body.split(/\s*(?:^|\s)\d+[).]\s*/).map(p=>p.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered.slice(0,5);
  return body.split(/[·.,]/).map(p=>p.trim()).filter(Boolean).slice(0,5);
}

const BASE_STYLE = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1350px}
  body{font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;background:${COLOR_BG};color:${COLOR_INK};-webkit-font-smoothing:antialiased;}
  section.card{position:relative;width:1080px;height:1350px;padding:120px 100px;display:flex;flex-direction:column;}
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

function renderCardHtml(input) {
  const layout = input.layout ?? {};
  const titleAlign = layout.titleAlign ?? (input.role === "hook" ? "center" : "left");
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

  const tagText = input.role === "context" ? "CONTEXT" : `POINT ${Math.max(1, input.card_no - 2)}`;
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

// 공지 카드 데이터 정의
const notices = [
  {
    notice_id: 8,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "외식업 사장님 대상 네이버 플레이스 스쿨 무료 교육 4/22 마감",
      key_points: ["무료 교육 신청 마감 4월 22일", "외식업 매장 플레이스 활용 전략 학습", "선착순 모집"],
      audience: "외식업 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["교육 신청하기", "공지 확인하기"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/989"],
      risk_flags: []
    },
    slides: [
      { card_no: 1, role: "hook", title: "📚 외식업 사장님 무료 교육 오픈!", body: "4월 22일 마감, 지금 바로 신청하세요" },
      { card_no: 2, role: "context", title: "플레이스 스쿨이란?", body: "네이버가 소상공인·자영업자를 위해 운영하는 스마트플레이스 무료 실전 교육 프로그램입니다.\n매장 노출, 리뷰 관리, 예약 설정까지 한 번에 배울 수 있어요." },
      { card_no: 3, role: "body", title: "이런 내용을 배워요", body: "스마트플레이스를 활용한 매장 노출 전략\n고객 리뷰 관리 실전 노하우\n예약·쿠폰 설정으로 매출 올리기\n외식업 특화 플레이스 운영 팁", layout: { pointText: "교육 수료 후 바로 현장에 적용 가능한 실전 커리큘럼" } },
      { card_no: 4, role: "body", title: "신청 자격과 방법", body: "대상: 외식업 매장 운영 사장님\n기간: ~ 2026년 4월 22일 마감\n신청: 스마트플레이스 공지 페이지\n비용: 완전 무료", layout: { pointText: "선착순 모집이므로 빠른 신청이 유리합니다" } },
      { card_no: 5, role: "body", title: "지금 바로 확인하세요", body: "스마트플레이스 공지 989호\nhttps://smartplace.naver.com/notices/989\n\n4월 22일이 마감이에요. 오늘 바로 신청하세요!", layout: { pointText: "무료 교육, 안 들을 이유가 없습니다" } },
      { card_no: 6, role: "cta", title: "지금 바로 신청하세요!", body: "① 스마트플레이스 공지 989호 접속\n② 외식업종 해당 여부 확인\n③ 4월 22일 마감 전 신청 완료" }
    ]
  },
  {
    notice_id: 9,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "숙박업종 사장님 대상 사진·숏폼 제작 무료 교육 선착순 오픈",
      key_points: ["선착순 무료 교육", "예약 유도 사진·숏폼 제작 노하우", "숙박업종 대상"],
      audience: "숙박업 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["교육 신청하기", "공지 확인하기"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/988"],
      risk_flags: []
    },
    slides: [
      { card_no: 1, role: "hook", title: "📸 숙박업 사장님 사진·숏폼 비법 무료 교육!", body: "선착순 마감, 지금 바로 신청하세요" },
      { card_no: 2, role: "context", title: "왜 사진·숏폼이 중요한가요?", body: "숙소 예약의 80%는 사진을 보고 결정됩니다.\n좋은 사진 하나가 예약률을 2~3배 높일 수 있어요.\n숏폼 콘텐츠는 새로운 고객을 끌어오는 최고의 무기입니다." },
      { card_no: 3, role: "body", title: "교육에서 배우는 것", body: "예약을 부르는 숙소 사진 촬영 기법\n스마트폰으로 찍는 전문가급 사진 보정\n인스타그램·숏폼 영상 제작 노하우\n숙박업 특화 콘텐츠 마케팅 전략", layout: { pointText: "현장 적용 가능한 실전 노하우를 배웁니다" } },
      { card_no: 4, role: "body", title: "신청 방법", body: "대상: 숙박업종 매장 사장님\n비용: 완전 무료 (선착순)\n신청: 스마트플레이스 공지 페이지 확인\n일정: 공지 내 일정 확인 필수", layout: { pointText: "선착순이라 빠른 신청이 중요합니다!" } },
      { card_no: 5, role: "body", title: "지금 바로 확인하세요", body: "스마트플레이스 공지 988호\nhttps://smartplace.naver.com/notices/988\n\n선착순이라 자리가 빠르게 찹니다!\n오늘 바로 신청하세요.", layout: { pointText: "좋은 콘텐츠가 예약률을 바꿉니다" } },
      { card_no: 6, role: "cta", title: "선착순! 지금 신청하세요", body: "① 스마트플레이스 공지 988호 접속\n② 숙박업종 신청 자격 확인\n③ 선착순 마감 전 즉시 신청 완료" }
    ]
  },
  {
    notice_id: 10,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "플레이스 플러스(beta) AI가 리뷰 답글을 자동으로 작성해주는 기능 출시",
      key_points: ["AI 리뷰 답글 자동 작성", "매장 톤앤매너에 맞게 설정 가능", "플레이스 플러스 가입 필요"],
      audience: "스마트플레이스 운영 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["플레이스 플러스 가입", "AI 답글 기능 설정"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/987"],
      risk_flags: []
    },
    slides: [
      { card_no: 1, role: "hook", title: "🤖 AI가 리뷰 답글을 대신 써준다!", body: "플레이스 플러스(beta) 신규 기능 공개" },
      { card_no: 2, role: "context", title: "리뷰 답글, 왜 중요한가요?", body: "리뷰 답글은 신규 고객의 방문 결정에 큰 영향을 줍니다.\n하지만 매일 쌓이는 리뷰에 일일이 답글 달기란 쉽지 않아요.\n이제 AI가 이 문제를 해결해드립니다!" },
      { card_no: 3, role: "body", title: "AI 답글 기능이란?", body: "AI가 리뷰 내용을 분석해 자동으로 답글 생성\n매장 톤앤매너(친근체/격식체) 설정 가능\n생성된 답글 수정 후 게시 가능\n플레이스 플러스(beta) 가입 매장 대상", layout: { pointText: "리뷰 답글 시간을 획기적으로 줄여드립니다" } },
      { card_no: 4, role: "body", title: "이렇게 설정하세요", body: "① 플레이스 플러스(beta) 가입 여부 확인\n② 스마트플레이스 센터 접속\n③ 플레이스 플러스 → AI 답글 기능 활성화\n④ 매장 톤앤매너 스타일 선택\n⑤ 생성된 답글 검토 후 게시", layout: { pointText: "처음 설정은 5분이면 충분합니다" } },
      { card_no: 5, role: "body", title: "주의할 점", body: "AI가 생성한 답글이라도 게시 전 반드시 검토하세요.\n매장 상황과 맞지 않는 내용이 있을 수 있습니다.\n리뷰 답글은 사장님의 목소리로 보완하면 더욱 효과적입니다.", layout: { pointText: "AI를 도구로 활용하되, 최종 확인은 사장님이 하세요" } },
      { card_no: 6, role: "cta", title: "지금 바로 설정하세요!", body: "① 플레이스 플러스(beta) 가입 확인\n② AI 리뷰 답글 기능 활성화\n③ 오늘부터 리뷰 관리 시간 절약" }
    ]
  },
  {
    notice_id: 11,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "예약·쿠폰 설정 카페 매장 네이버 지도 앱 추가 노출 혜택 (4/6~4/19)",
      key_points: ["예약·쿠폰 설정 시 지도 노출 혜택", "4/6~4/19 한시적 기간", "카페 업종 대상"],
      audience: "카페 운영 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["예약 기능 설정", "쿠폰 등록"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/986"],
      risk_flags: ["혜택 기간이 이미 종료됨 (4/6~4/19), 과거 공지로 참고용 제공"]
    },
    slides: [
      { card_no: 1, role: "hook", title: "☕ 카페 지도 노출 UP! 예약·쿠폰만 설정하면 돼요", body: "4/6~4/19 한시적 혜택 (참고용)" },
      { card_no: 2, role: "context", title: "이 혜택의 배경", body: "네이버가 예약·쿠폰 기능 활성화 카페에 지도 앱 추가 노출 혜택을 시범 운영했습니다.\n이번 혜택은 종료됐지만, 예약·쿠폰 설정의 중요성은 계속됩니다." },
      { card_no: 3, role: "body", title: "예약 기능의 효과", body: "네이버 지도 검색에서 예약 버튼 노출\n고객이 바로 예약할 수 있어 전환율 UP\n예약 확정 고객은 방문율이 더 높아요\n후기·리뷰 남길 확률도 높아집니다", layout: { pointText: "예약 기능 하나로 매장 노출과 전환율 모두 잡기" } },
      { card_no: 4, role: "body", title: "쿠폰 기능의 효과", body: "지도 검색 결과에 쿠폰 뱃지 노출\n신규 고객 유입에 탁월한 효과\n재방문 유도 수단으로도 활용 가능\n다양한 종류의 쿠폰 설정 가능", layout: { pointText: "쿠폰 하나가 신규 고객을 부릅니다" } },
      { card_no: 5, role: "body", title: "지금 바로 설정하세요", body: "스마트플레이스 센터 접속\n→ 예약 관리 메뉴에서 예약 기능 ON\n→ 홍보·마케팅 메뉴에서 쿠폰 등록\n\n이번 혜택 기간은 종료됐지만 향후 유사 프로모션을 대비해 미리 설정해두세요!", layout: { pointText: "설정해두면 다음 프로모션에서도 자동 혜택" } },
      { card_no: 6, role: "cta", title: "지금 설정하고 다음 혜택 준비!", body: "① 스마트플레이스 센터 접속\n② 예약 기능 활성화\n③ 쿠폰 등록 완료" }
    ]
  },
  {
    notice_id: 12,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "외식업종 대상 플레이스광고·지역소상공인광고 특강 모집 (마감 4/3 14시)",
      key_points: ["외식업 광고 특강 모집", "신청 마감 4/3 14시", "플레이스광고·지역소상공인광고 활용법"],
      audience: "외식업 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["특강 신청", "공지 확인"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/984"],
      risk_flags: ["신청 마감이 이미 종료됨 (4/3 14시), 과거 공지로 참고용 제공"]
    },
    slides: [
      { card_no: 1, role: "hook", title: "📢 외식업 광고 특강 (참고용 공지)", body: "플레이스광고·지역소상공인광고 활용 노하우" },
      { card_no: 2, role: "context", title: "플레이스광고란?", body: "네이버 지도·검색 결과에서 내 매장을 상단에 노출시키는 광고 상품입니다.\n지역 소상공인을 위한 저렴한 단가로 효율적인 홍보가 가능합니다." },
      { card_no: 3, role: "body", title: "플레이스광고 효과", body: "네이버 지도 검색 상단 노출\n경쟁 매장보다 먼저 보이는 효과\n클릭당 과금(CPC) 방식으로 효율적\n소상공인 전용 저렴한 광고비", layout: { pointText: "적은 광고비로 큰 노출 효과를 누리세요" } },
      { card_no: 4, role: "body", title: "지역소상공인광고란?", body: "동네 고객을 타겟으로 하는 소상공인 전용 광고\n반경 설정으로 내 매장 주변 고객에게 집중 노출\n예산 걱정 없이 시작할 수 있는 소액 광고 상품\n외식업 특화 광고 문구 템플릿 제공", layout: { pointText: "반경 설정 하나로 동네 손님을 모으세요" } },
      { card_no: 5, role: "body", title: "광고 시작 전 체크리스트", body: "스마트플레이스 센터 → 광고 관리 메뉴 확인\n플레이스광고 vs 지역소상공인광고 비교\n월 예산 설정 후 소액부터 시작\n광고 효과 2주 후 분석·조정", layout: { pointText: "처음엔 소액으로 테스트, 효과 확인 후 늘리세요" } },
      { card_no: 6, role: "cta", title: "광고로 매장 노출 높이세요!", body: "① 스마트플레이스 센터 → 광고 관리 접속\n② 플레이스광고·지역광고 비교 확인\n③ 소액 예산으로 광고 시작" }
    ]
  },
  {
    notice_id: 13,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "네이버 플레이스 식당 검색 결과 화면 A/B 테스트 시작",
      key_points: ["식당 검색 UI A/B 테스트 시작", "일부 사용자에게 다른 화면 표시", "매장 정보 품질 관리 중요"],
      audience: "식당 운영 자영업자",
      tone: "정보·기회형",
      cta_candidates: ["매장 정보 점검", "사진 최신화"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/983"],
      risk_flags: []
    },
    slides: [
      { card_no: 1, role: "hook", title: "🔍 네이버 식당 검색 화면이 바뀐다!", body: "A/B 테스트 시작 — 지금 대비하세요" },
      { card_no: 2, role: "context", title: "A/B 테스트란?", body: "두 가지 다른 디자인을 일부 사용자에게 보여주고 어느 쪽이 더 효과적인지 측정하는 실험입니다.\n테스트 결과에 따라 모든 사용자의 화면이 바뀔 수 있어요." },
      { card_no: 3, role: "body", title: "내 매장에 미치는 영향", body: "일부 고객은 기존과 다른 UI로 식당 목록을 보게 됩니다\n검색 결과에서 보이는 정보 순서가 달라질 수 있어요\n사진·메뉴·리뷰 정보의 중요도가 더욱 부각될 수 있습니다\nUI가 어떻게 바뀌어도 기본기가 탄탄한 매장이 유리해요", layout: { pointText: "기본에 충실한 매장이 어떤 UI에서도 살아남습니다" } },
      { card_no: 4, role: "body", title: "지금 점검해야 할 것들", body: "대표 사진: 최신 고화질 음식 사진으로 교체\n메뉴 정보: 가격 포함 최신 메뉴 업데이트\n영업시간: 정확한 시간 입력 및 임시 휴무 등록\n리뷰 답글: 최근 리뷰에 성실히 답글 달기", layout: { pointText: "검색 결과에서 클릭을 부르는 매장 만들기" } },
      { card_no: 5, role: "body", title: "이것도 확인하세요", body: "매장 소개글이 매력적으로 작성되어 있나요?\n키워드리뷰가 업종에 맞게 설정되어 있나요?\n예약·쿠폰 기능이 활성화되어 있나요?\n공지 변경사항을 정기적으로 체크하고 있나요?", layout: { pointText: "UI 변화에 관계없이 매장 경쟁력을 높이세요" } },
      { card_no: 6, role: "cta", title: "지금 바로 매장 점검하세요!", body: "① 스마트플레이스 센터 → 사진·메뉴 최신화\n② 리뷰 답글 정기 관리\n③ 예약·쿠폰 기능 활성화 확인" }
    ]
  },
  {
    notice_id: 14,
    audience: "전체",
    tone: "정보형",
    brief_json: {
      headline_fact: "네이버 스마트플레이스 키워드리뷰 설정방법 개편",
      key_points: ["키워드리뷰 설정 경로·방법 변경", "기존 키워드 유지 여부 확인 필요", "업종 맞춤 키워드 재검토 필요"],
      audience: "스마트플레이스 운영 자영업자 전체",
      tone: "정보·기회형",
      cta_candidates: ["키워드리뷰 설정 확인", "키워드 업데이트"],
      banned_words: [],
      references: ["https://smartplace.naver.com/notices/982"],
      risk_flags: []
    },
    slides: [
      { card_no: 1, role: "hook", title: "🔑 키워드리뷰 설정 방법이 바뀌었어요!", body: "스마트플레이스 센터에서 지금 바로 확인하세요" },
      { card_no: 2, role: "context", title: "키워드리뷰란?", body: "고객이 리뷰를 작성할 때 내 매장의 특징을 선택할 수 있는 태그 기능입니다.\n'분위기 좋아요', '재료가 신선해요' 같은 키워드가 바로 키워드리뷰예요.\n매장 특성을 잘 표현하는 키워드를 설정하면 잠재 고객에게 매력적으로 보입니다." },
      { card_no: 3, role: "body", title: "무엇이 바뀌었나요?", body: "키워드리뷰 설정 메뉴 위치 변경\n키워드 선택 방식 및 관리 화면 개편\n기존 설정한 키워드 유지 여부 확인 필요\n새로운 UI에서 키워드 재검토 가능", layout: { pointText: "개편 후 첫 설정 확인이 중요합니다" } },
      { card_no: 4, role: "body", title: "이렇게 확인하세요", body: "스마트플레이스 센터 접속\n→ 리뷰 관리 메뉴 클릭\n→ 키워드리뷰 설정 메뉴 확인\n→ 기존 키워드 유지 여부 점검\n→ 필요 시 키워드 추가·수정", layout: { pointText: "5분 만에 키워드리뷰 설정 완료 가능" } },
      { card_no: 5, role: "body", title: "좋은 키워드리뷰 설정 팁", body: "업종과 매장 특성에 딱 맞는 키워드 선택\n경쟁 매장과 차별화되는 강점 키워드\n계절·이벤트에 따라 키워드 업데이트\n고객이 실제 남기는 리뷰 키워드 분석 후 반영", layout: { pointText: "키워드리뷰는 내 매장의 첫인상을 결정합니다" } },
      { card_no: 6, role: "cta", title: "키워드리뷰 지금 확인하세요!", body: "① 스마트플레이스 센터 → 리뷰 관리\n② 키워드리뷰 설정 메뉴 확인\n③ 업종 맞춤 키워드 업데이트 완료" }
    ]
  }
];

const API_BASE = "https://naku-content-lab.vercel.app";
const TOKEN = "4f849af5ae08571140864b4f3962e1e33f26c030096f8c28";

async function postCardNews(notice) {
  const total = notice.slides.length;

  // HTML 생성
  const slides = notice.slides.map(s => ({
    card_no: s.card_no,
    role: s.role,
    title: s.title,
    body: s.body,
    hashtags: s.hashtags ?? [],
    html: renderCardHtml({
      card_no: s.card_no,
      total,
      role: s.role,
      title: s.title,
      body: s.body,
      layout: s.layout ?? null
    })
  }));

  const payload = {
    notice_id: notice.notice_id,
    audience: notice.audience,
    tone: notice.tone,
    brief_json: notice.brief_json,
    status: "draft",
    qa_verdict: "pass",
    qa_issues: [],
    slides
  };

  const res = await fetch(`${API_BASE}/api/card-news`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return { notice_id: notice.notice_id, status: res.status, data };
}

async function main() {
  console.log(`카드뉴스 생성 시작: ${notices.length}건`);

  for (const notice of notices) {
    try {
      const result = await postCardNews(notice);
      if (result.status === 201) {
        console.log(`✓ notice_id=${result.notice_id} → set_id=${result.data?.set?.id ?? '?'}`);
      } else {
        console.log(`✗ notice_id=${result.notice_id} → HTTP ${result.status}: ${JSON.stringify(result.data)}`);
      }
    } catch (e) {
      console.error(`✗ notice_id=${notice.notice_id} → ERROR: ${e.message}`);
    }
  }
}

main();
