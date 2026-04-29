// lib/platforms.ts의 .mjs 복제본 — 스크래퍼 스크립트에서 참조한다.
// lib/platforms.ts 를 수정하면 이 파일도 같이 수정할 것.

export const PLATFORMS = {
  smartplace: {
    id: "smartplace",
    label: "네이버 스마트플레이스",
    shortLabel: "스마트플레이스",
    group: "place",
    loginRequired: false,
    noticeUrl: "https://smartplace.naver.com/notices",
  },
  smartstore: {
    id: "smartstore",
    label: "네이버 스마트스토어센터",
    shortLabel: "스마트스토어",
    group: "store",
    loginRequired: true,
    noticeUrl: "https://sell.smartstore.naver.com/",
  },
  booking: {
    id: "booking",
    label: "네이버 예약 파트너센터",
    shortLabel: "예약",
    group: "booking",
    loginRequired: true,
    noticeUrl: "https://partner.booking.naver.com/",
  },
  talktalk: {
    id: "talktalk",
    label: "네이버 톡톡 파트너센터",
    shortLabel: "톡톡",
    group: "talktalk",
    loginRequired: true,
    noticeUrl: "https://partner.talk.naver.com/",
  },
  searchad: {
    id: "searchad",
    label: "네이버 검색광고",
    shortLabel: "검색광고",
    group: "ads",
    loginRequired: false,
    noticeUrl: "https://saedu.naver.com/notice/noticeList.naver",
  },
  blog_smartplace: {
    id: "blog_smartplace",
    label: "스마트플레이스 공식 블로그",
    shortLabel: "플레이스 블로그",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/nv_smartplace",
    blogId: "nv_smartplace",
  },
  blog_business: {
    id: "blog_business",
    label: "네이버 비즈니스 공식 블로그",
    shortLabel: "비즈니스 블로그",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/n_business",
    blogId: "n_business",
  },
  blog_diary: {
    id: "blog_diary",
    label: "네이버 다이어리 (공식)",
    shortLabel: "네이버 다이어리",
    group: "blog",
    loginRequired: false,
    noticeUrl: "https://blog.naver.com/naver_diary",
    blogId: "naver_diary",
  },
};

export const PLATFORM_ORDER = [
  "smartplace",
  "searchad",
  "blog_smartplace",
  "blog_business",
  "blog_diary",
];
