// 네이버 공식 공지 채널 메타데이터.
// 서버(Route)와 클라이언트(notices-list)에서 공통으로 사용한다.
// 스크래퍼 스크립트(.mjs)는 lib/platforms.mjs 동일 정의를 복제해 참조.

import type { PlatformId } from "./db";

export type PlatformMeta = {
  id: PlatformId;
  label: string;
  shortLabel: string;
  group: "place" | "store" | "booking" | "talktalk" | "ads" | "blog";
  loginRequired: boolean;
  noticeUrl: string;
  description: string;
};

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  smartplace: {
    id: "smartplace",
    label: "네이버 스마트플레이스",
    shortLabel: "스마트플레이스",
    group: "place",
    loginRequired: false,
    noticeUrl: "https://smartplace.naver.com/notices",
    description: "플레이스(지역 업체) 사장님 대상 공지",
  },
  smartstore: {
    id: "smartstore",
    label: "네이버 스마트스토어센터",
    shortLabel: "스마트스토어",
    group: "store",
    loginRequired: true,
    noticeUrl: "https://sell.smartstore.naver.com/",
    description: "온라인 스토어 판매자 대상 공지",
  },
  booking: {
    id: "booking",
    label: "네이버 예약 파트너센터",
    shortLabel: "예약",
    group: "booking",
    loginRequired: true,
    noticeUrl: "https://partner.booking.naver.com/",
    description: "예약 파트너 대상 공지",
  },
  talktalk: {
    id: "talktalk",
    label: "네이버 톡톡 파트너센터",
    shortLabel: "톡톡",
    group: "talktalk",
    loginRequired: true,
    noticeUrl: "https://partner.talk.naver.com/",
    description: "톡톡 상담 파트너 대상 공지",
  },
  searchad: {
    id: "searchad",
    label: "네이버 검색광고",
    shortLabel: "검색광고",
    group: "ads",
    loginRequired: false,
    noticeUrl: "https://saedu.naver.com/notice/noticeList.naver",
    description: "검색광고 정책/시스템 공지",
  },
  blog_smartplace: {
    id: "blog_smartplace",
    label: "스마트플레이스 공식 블로그",
    shortLabel: "플레이스 블로그",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/nv_smartplace",
    description: "스마트플레이스 공식 블로그 포스팅",
  },
  blog_business: {
    id: "blog_business",
    label: "네이버 비즈니스 공식 블로그",
    shortLabel: "비즈니스 블로그",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/n_business",
    description: "네이버 비즈니스/광고 공식 블로그",
  },
  blog_diary: {
    id: "blog_diary",
    label: "네이버 다이어리 (공식)",
    shortLabel: "네이버 다이어리",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/naver_diary",
    description: "네이버 전체 서비스 공지 블로그",
  },
};

// UI 아코디언 순서
// smartstore / booking / talktalk 은 로그인 수집이 현실적으로 불가능해 제외.
// PLATFORMS 메타와 스크래퍼 파일은 유지 — 필요해지면 이 배열에 한 줄 추가로 복원.
export const PLATFORM_ORDER: PlatformId[] = [
  "smartplace",
  "searchad",
  "blog_smartplace",
  "blog_business",
  "blog_diary",
];

export function getPlatformMeta(id: string | null | undefined): PlatformMeta {
  if (id && id in PLATFORMS) return PLATFORMS[id as PlatformId];
  return PLATFORMS.smartplace;
}
