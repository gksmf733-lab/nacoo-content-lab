import { cookies } from "next/headers";

const COOKIE_NAME = "naku_auth";

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token === process.env.AUTH_SECRET;
}

export async function setAuthCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, process.env.AUTH_SECRET ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function checkPassword(input: string): boolean {
  return input === process.env.SITE_PASSWORD;
}

// API 자동화용 Bearer 토큰 검증
export function checkApiToken(authHeader: string | null): boolean {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token === process.env.API_TOKEN;
}
