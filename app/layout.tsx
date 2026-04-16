import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "나쿠 콘텐츠연구소",
  description: "네이버 스마트플레이스 공지 모니터링 · 릴스 대본 보관함",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
