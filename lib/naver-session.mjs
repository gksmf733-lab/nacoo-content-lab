// 네이버 공통 로그인 세션 모듈.
// 전략: 쿠키 파일 우선 → 만료/없음이면 ID/PW 자동 로그인 시도 → 2FA·기기인증 걸리면 수동 개입 대기.
//
// 환경변수:
//   NAVER_ID   — 네이버 아이디
//   NAVER_PW   — 네이버 비밀번호
//   NAVER_HEADLESS=0 으로 지정하면 로그인 창을 띄움(수동 개입용)
//
// 쿠키 파일: data/naver-session.json (gitignore 권장)

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import puppeteer from "puppeteer";

const COOKIE_PATH = path.resolve("data/naver-session.json");
const LOGIN_URL = "https://nid.naver.com/nidlogin.login";
const HOME_URL = "https://www.naver.com";

export async function launchBrowser({ headless } = {}) {
  const env = process.env.NAVER_HEADLESS;
  const shouldHeadless = headless ?? (env === "0" ? false : "new");
  return puppeteer.launch({
    headless: shouldHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=ko-KR"],
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function readCookies() {
  try {
    const raw = await fs.readFile(COOKIE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (Array.isArray(json.cookies)) return json.cookies;
    return null;
  } catch {
    return null;
  }
}

async function writeCookies(cookies) {
  await fs.mkdir(path.dirname(COOKIE_PATH), { recursive: true });
  await fs.writeFile(
    COOKIE_PATH,
    JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 2)
  );
}

async function applyCookies(page, cookies) {
  if (!cookies || cookies.length === 0) return;
  // puppeteer 24+ 는 page.setCookie(...cookies) 지원
  await page.setCookie(...cookies);
}

export async function saveCurrentCookies(page) {
  const cookies = await page.cookies(
    "https://naver.com",
    "https://www.naver.com",
    "https://nid.naver.com",
    "https://smartplace.naver.com",
    "https://sell.smartstore.naver.com",
    "https://partner.booking.naver.com",
    "https://partner.talk.naver.com",
    "https://searchad.naver.com"
  );
  await writeCookies(cookies);
  return cookies.length;
}

// 현재 페이지에서 로그인 상태인지 추론.
// 네이버 메인의 로그인 박스 존재 여부로 판단(#gnb_login_button 는 비로그인, #gnb_logout_button 존재면 로그인).
export async function isLoggedInOnNaver(page) {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  return page.evaluate(() => {
    const logoutBtn =
      document.querySelector("#gnb_logout_button") ||
      document.querySelector(".MyView-module__btn_logout___bsTOJ");
    const loginBtn = document.querySelector("#gnb_login_button");
    if (logoutBtn) return true;
    if (loginBtn) return false;
    // 안전한 기본값: 로그인 버튼이 안 보이면 로그인 상태로 간주
    return !document.body.innerText.includes("로그인");
  });
}

// 아이디/비밀번호를 input.value에 직접 세팅하고 이벤트 디스패치.
// type() 을 쓰면 키 입력 패턴으로 봇 감지에 걸리는 케이스가 있음.
// 동시에 IP보안 토글도 OFF 처리 (ON이면 IP 바뀔 때 세션 즉시 만료 → 쿠키 재사용 불가).
async function fillLoginInputs(page, id, pw) {
  await page.evaluate(
    ({ id, pw }) => {
      const idEl = document.querySelector("#id");
      const pwEl = document.querySelector("#pw");
      if (idEl) {
        idEl.value = id;
        idEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (pwEl) {
        pwEl.value = pw;
        pwEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      // IP보안 체크박스 해제 — 네이버는 UI/이름을 자주 바꿔서 여러 셀렉터 순차 시도
      const ipToggle =
        document.querySelector("#switch") ||
        document.querySelector('input[name="smart_LEVEL"]') ||
        document.querySelector('input[type="checkbox"][class*="ip"]');
      if (ipToggle) {
        if (ipToggle.type === "checkbox" && ipToggle.checked) {
          ipToggle.click();
        } else if (ipToggle.type === "hidden") {
          ipToggle.value = "-1"; // -1 = IP보안 OFF
        }
      }
      // hidden smart_LEVEL 도 보조 처리
      const hidden = document.querySelector('input[name="smart_LEVEL"]');
      if (hidden) hidden.value = "-1";
    },
    { id, pw }
  );
}

async function promptEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(message);
  rl.close();
}

// 네이버 로그인 시도. 성공 시 쿠키 저장.
// 2FA·기기등록·캡차 페이지가 나타나면 headless=false 상태에서 사용자의 수동 완료를 기다린다.
export async function performLogin(page, { id, pw }) {
  if (!id || !pw) {
    throw new Error("NAVER_ID / NAVER_PW 환경변수가 필요합니다.");
  }

  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await fillLoginInputs(page, id, pw);
  await Promise.all([
    page.click(".btn_login, #log\\.login, button[type=submit]").catch(() => {}),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
  ]);

  // 로그인 후 도달한 URL / 페이지 텍스트로 결과 판정
  const url = page.url();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1000));

  const needsManual =
    /deviceConfirm|otp|captcha|oneTimePass|ncs|help\.naver\.com/.test(url) ||
    /기기\s*등록|인증번호|자동입력|캡차|평소와\s*다른/.test(body);

  if (needsManual) {
    console.log("");
    console.log("⚠ 네이버가 추가 인증을 요구합니다 (기기 등록/2FA/캡차).");
    console.log("   브라우저 창에서 인증을 완료한 뒤 이 콘솔에서 Enter 를 눌러주세요.");
    console.log("   (headless 모드로 실행 중이면 NAVER_HEADLESS=0 으로 다시 시도)");
    await promptEnter("   완료 후 Enter ▶ ");
  }

  // 최종 확인
  const ok = await isLoggedInOnNaver(page);
  if (!ok) {
    throw new Error("네이버 로그인에 실패했습니다. 쿠키 파일을 삭제하고 다시 시도하세요.");
  }

  const n = await saveCurrentCookies(page);
  console.log(`  ✓ 쿠키 ${n}개 저장됨 (${COOKIE_PATH})`);
}

// 외부에서 호출하는 엔트리포인트.
// 반환: { browser, page } — page 는 이미 로그인된 상태.
export async function openNaverSession({ headless } = {}) {
  const browser = await launchBrowser({ headless });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const cookies = await readCookies();
  if (cookies) {
    await applyCookies(page, cookies);
    const ok = await isLoggedInOnNaver(page);
    if (ok) {
      console.log("· 캐시된 쿠키로 로그인 세션 복원");
      return { browser, page };
    }
    console.log("· 쿠키 만료/무효 → 재로그인 시도");
  }

  await performLogin(page, {
    id: process.env.NAVER_ID,
    pw: process.env.NAVER_PW,
  });
  return { browser, page };
}
