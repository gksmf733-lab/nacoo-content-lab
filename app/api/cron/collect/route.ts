import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron이 하루 2회 (09:00 / 18:00 KST) 호출하는 엔드포인트.
 *
 * 이 엔드포인트는 "자동화가 필요하다"는 신호만 기록한다.
 * 실제 WebSearch + 릴스 대본 생성은 Claude 자동화 에이전트(Scheduled Task)가
 * 동일 스케줄에 맞춰 깨어나서 직접 `/api/notices`, `/api/scripts`를 호출한다.
 *
 * Vercel Cron은 GET 요청으로 호출되며 `CRON_SECRET` Bearer로 보호된다.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[cron/collect] triggered at ${now}`);

  // 향후 확장: 에이전트 웨이크업 웹훅 호출, Slack/Discord 알림 등
  return NextResponse.json({ ok: true, triggered_at: now });
}
