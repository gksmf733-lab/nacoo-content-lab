import React, { useState, useEffect } from "react";
import { addPage } from "@canva/design";
import { findFonts, type FontRef } from "@canva/asset";
import {
  Button,
  Rows,
  Text,
  Title,
  LoadingIndicator,
  Alert,
  Box,
  Columns,
  Column,
} from "@canva/app-ui-kit";
// (Box/Columns/Column은 슬라이드 미리보기 레이아웃에서 사용됨)
import "@canva/app-ui-kit/styles.css";

// Pretendard 우선, 없으면 유사 폰트로 폴백할 후보 (정확도 순)
const FONT_PREFERENCES: RegExp[] = [
  /^Pretendard/i,
  /^Noto Sans KR$/i,
  /^Noto Sans Korean/i,
  /^Spoqa/i,
  /Gothic/i,
  /Sans/i,
];

// 나쿠 API base URL
const API_BASE = "https://naku-content-lab.vercel.app";

type CardSet = {
  set_id: number;
  notice_id: number;
  notice_title: string;
  audience: string | null;
  tone: string | null;
  card_count: number;
  qa_verdict: string | null;
};

type SlideLayout = {
  pointText?: string;
  pointLabel?: string;
  icon?: string;
  sub?: string;
  titleAlign?: "left" | "center";
} | null;

type Slide = {
  id: number;
  card_no: number;
  role: string;
  title: string;
  body: string;
  hashtags: string[] | null;
  layout?: SlideLayout;
};

// Color palette (Canva SDK requires strict 6-char lowercase hex)
const COLOR_BG = "#f7f5f0";
const COLOR_INK = "#1a1a1a";
const COLOR_ACCENT = "#e8572c";
const COLOR_INK_DIM = "#555555";
const COLOR_INK_MUTED = "#888888";
const COLOR_WHITE = "#ffffff";
const COLOR_WHITE_DIM = "#ffd9c9";
const BRAND = "나쿠 콘텐츠연구소";

// Card dimensions (Instagram post 4:5)
const CARD_W = 1080;
const CARD_H = 1350;

// Canva fontSize is clamped to [1, 100]. 이 헬퍼로 안전하게 고정.
const fs = (px: number): number => Math.max(1, Math.min(100, Math.round(px)));

// 제목 맨 앞 이모지 추출
function splitLeadingEmoji(s: string): { icon: string; rest: string } {
  const m = s.match(/^\s*(\p{Extended_Pictographic})\s*/u);
  if (m) return { icon: m[1], rest: s.slice(m[0].length) };
  return { icon: "", rest: s };
}

// CTA 본문에서 ①②③ / 1. 2. 3. / 줄바꿈 등으로 항목 분해
function parseCtaItems(body: string): string[] {
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(body)) {
    return body
      .split(/[①②③④⑤⑥⑦⑧⑨⑩]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  const lines = body.split(/\n+/).map((p) => p.replace(/^\s*\d+[).]\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 5);
  return body.split(/[·.,]/).map((p) => p.trim()).filter(Boolean).slice(0, 5);
}

export function App() {
  const [sets, setSets] = useState<CardSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<CardSet | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fontRef, setFontRef] = useState<FontRef | null>(null);
  const [fontName, setFontName] = useState<string>("");

  // Fetch card news sets + font on mount
  useEffect(() => {
    fetchSets();
    loadPretendardFont();
  }, []);

  async function loadPretendardFont() {
    try {
      const { fonts } = await findFonts();
      for (const re of FONT_PREFERENCES) {
        const hit = fonts.find((f) => re.test(f.name));
        if (hit) {
          setFontRef(hit.ref);
          setFontName(hit.name);
          return;
        }
      }
      // 후보 매칭 실패 — 폰트 지정 없이 Canva 기본 폰트로 진행
      setFontName("");
    } catch {
      // findFonts 실패해도 삽입은 계속 가능
      setFontName("");
    }
  }

  async function fetchSets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/card-news/canva-list`);
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const data = await res.json();
      setSets(data.sets ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "카드뉴스 목록을 불러올 수 없습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function selectSet(set: CardSet) {
    setSelectedSet(set);
    setSlides([]);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/card-news/canva-list?notice_id=${set.notice_id}`);
      if (!res.ok) throw new Error(`슬라이드 로드 실패: ${res.status}`);
      const data = await res.json();
      setSlides(data.slides ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "슬라이드를 불러올 수 없습니다.";
      setError(message);
    }
  }

  // 한 슬라이드에 해당하는 페이지용 elements 배열 구성
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildElementsForSlide(slide: Slide, total: number): any[] {
    const layout = slide.layout ?? {};
    const isCta = slide.role === "cta";
    const isHook = slide.role === "hook";
    const onAccent = isCta || isHook; // 배경이 오렌지인 카드
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = [];

    // --- Brand (top-left) ---
    elements.push({
      type: "text",
      children: [`● ${BRAND}`],
      top: 90,
      left: 100,
      width: 700,
      fontSize: fs(16),
      color: onAccent ? COLOR_WHITE_DIM : COLOR_INK_MUTED,
      fontWeight: "semibold",
    });

    // --- Page number (bottom-right) ---
    elements.push({
      type: "text",
      children: [`${slide.card_no} / ${total}`],
      top: CARD_H - 140,
      left: CARD_W - 260,
      width: 160,
      fontSize: fs(18),
      color: onAccent ? COLOR_WHITE_DIM : COLOR_INK_MUTED,
      fontWeight: "semibold",
      textAlign: "end",
    });

    if (isHook) {
      const { icon: leadIcon, rest } = splitLeadingEmoji(slide.title);
      const icon = layout.icon || leadIcon;
      const titleText = (rest || slide.title).replace(/\n/g, " ");
      const subText = layout.sub || slide.body.split("\n")[0] || "";

      if (icon) {
        elements.push({
          type: "text",
          children: [icon],
          top: 280,
          left: CARD_W / 2 - 100,
          width: 200,
          fontSize: fs(96),
          textAlign: "center",
          color: COLOR_WHITE,
        });
      }
      elements.push({
        type: "text",
        children: [titleText],
        top: icon ? 450 : 380,
        left: 80,
        width: CARD_W - 160,
        fontSize: fs(72),
        color: COLOR_WHITE,
        fontWeight: "bold",
        textAlign: "center",
      });
      if (subText) {
        elements.push({
          type: "text",
          children: [subText],
          top: 820,
          left: 120,
          width: CARD_W - 240,
          fontSize: fs(30),
          color: COLOR_WHITE,
          fontWeight: "medium",
          textAlign: "center",
        });
      }
      return elements;
    }

    if (isCta) {
      elements.push({
        type: "text",
        children: ["ACTION"],
        top: 200,
        left: 100,
        width: 400,
        fontSize: fs(22),
        color: COLOR_WHITE_DIM,
        fontWeight: "bold",
      });
      elements.push({
        type: "text",
        children: [slide.title],
        top: 260,
        left: 100,
        width: CARD_W - 200,
        fontSize: fs(60),
        color: COLOR_WHITE,
        fontWeight: "bold",
      });

      const items = parseCtaItems(slide.body);
      const itemTop0 = 480;
      const itemGap = 110;
      items.forEach((it, idx) => {
        elements.push({
          type: "text",
          children: [`${idx + 1}`],
          top: itemTop0 + itemGap * idx,
          left: 100,
          width: 70,
          fontSize: fs(52),
          color: COLOR_WHITE,
          fontWeight: "bold",
          textAlign: "center",
        });
        elements.push({
          type: "text",
          children: [it],
          top: itemTop0 + itemGap * idx + 12,
          left: 200,
          width: CARD_W - 300,
          fontSize: fs(34),
          color: COLOR_WHITE,
          fontWeight: "medium",
        });
      });

      if (slide.hashtags && slide.hashtags.length > 0) {
        elements.push({
          type: "text",
          children: [slide.hashtags.join("  ")],
          top: CARD_H - 230,
          left: 100,
          width: CARD_W - 200,
          fontSize: fs(20),
          color: COLOR_WHITE_DIM,
          fontWeight: "normal",
        });
      }
      return elements;
    }

    // --- context / body ---
    const tagLabel =
      slide.role === "context"
        ? "CONTEXT"
        : `POINT ${Math.max(1, slide.card_no - 2)}`;

    elements.push({
      type: "text",
      children: [tagLabel],
      top: 200,
      left: 100,
      width: 400,
      fontSize: fs(22),
      color: COLOR_ACCENT,
      fontWeight: "bold",
    });
    elements.push({
      type: "text",
      children: [slide.title],
      top: 260,
      left: 100,
      width: CARD_W - 200,
      fontSize: fs(56),
      color: COLOR_INK,
      fontWeight: "bold",
    });

    // 본문 — 줄마다 분리해 삽입 (Canva TextElement는 배열의 첫 원소만 사용)
    const bodyLines = slide.body.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const bodyTop0 = 440;
    const bodyGap = 70;
    bodyLines.forEach((line, i) => {
      elements.push({
        type: "text",
        children: [slide.role === "body" ? `• ${line}` : line],
        top: bodyTop0 + bodyGap * i,
        left: 100,
        width: CARD_W - 200,
        fontSize: fs(30),
        color: COLOR_INK_DIM,
        fontWeight: "normal",
      });
    });

    // POINT 박스 — pointText 있으면 하단 강조
    if (layout.pointText) {
      const pointLabel =
        layout.pointLabel || (slide.role === "context" ? "KEY POINT" : "POINT");
      elements.push({
        type: "text",
        children: [pointLabel],
        top: CARD_H - 330,
        left: 100,
        width: 400,
        fontSize: fs(20),
        color: COLOR_ACCENT,
        fontWeight: "bold",
      });
      elements.push({
        type: "text",
        children: [`▸ ${layout.pointText}`],
        top: CARD_H - 290,
        left: 100,
        width: CARD_W - 200,
        fontSize: fs(32),
        color: COLOR_ACCENT,
        fontWeight: "bold",
      });
    }

    return elements;
  }

  async function insertAllCards() {
    if (slides.length === 0) return;
    setInserting(true);
    setError(null);
    setSuccess(null);

    try {
      // ── 정렬 보정 ──
      // 1) card_no ASC로 명시적 정렬 (API가 이미 정렬하지만 방어적으로)
      // 2) Canva addPage는 "현재 선택된 페이지 바로 뒤"에 삽입되므로,
      //    선택 커서가 이동하지 않는 경우를 가정해 역순으로 넣어
      //    최종 문서 순서가 card_no ASC가 되도록 한다.
      const total = slides.length;
      const sorted = [...slides].sort((a, b) => a.card_no - b.card_no);
      const insertionOrder = [...sorted].reverse();

      const inserted: number[] = [];
      for (const slide of insertionOrder) {
        const isCta = slide.role === "cta";
        const isHook = slide.role === "hook";
        const bgColor = isCta || isHook ? COLOR_ACCENT : COLOR_BG;
        const rawElements = buildElementsForSlide(slide, total);
        // Pretendard(또는 폴백) 폰트를 모든 text 요소에 일괄 주입
        const elements = fontRef
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? rawElements.map((el: any) =>
              el.type === "text" ? { ...el, fontRef } : el,
            )
          : rawElements;

        await addPage({
          title: `Card ${slide.card_no} — ${slide.title}`.slice(0, 255),
          background: { color: bgColor },
          dimensions: { width: CARD_W, height: CARD_H },
          elements,
        });
        inserted.push(slide.card_no);
      }

      // ── 검수: 삽입 개수와 카드 번호 일치 여부 확인 ──
      const expected = sorted.map((s) => s.card_no).join(", ");
      const actual = inserted.slice().sort((a, b) => a - b).join(", ");
      if (inserted.length !== total) {
        throw new Error(`삽입 수 불일치: ${inserted.length}/${total}`);
      }
      if (actual !== expected) {
        throw new Error(`카드 번호 불일치 (기대 ${expected} / 실제 ${actual})`);
      }

      setSuccess(`${total}장 모두 삽입 완료 (카드 ${expected})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`삽입 실패: ${message}`);
    } finally {
      setInserting(false);
    }
  }

  // --- Render ---

  if (loading) {
    return (
      <Rows spacing="2u">
        <LoadingIndicator />
        <Text alignment="center">카드뉴스 목록 불러오는 중...</Text>
      </Rows>
    );
  }

  // 세트 선택 직후 슬라이드 로딩 중 상태
  if (selectedSet && slides.length === 0 && !error) {
    return (
      <Rows spacing="1.5u">
        <Button
          variant="tertiary"
          onClick={() => {
            setSelectedSet(null);
            setSlides([]);
            setSuccess(null);
          }}
        >
          ← 목록으로
        </Button>
        <LoadingIndicator />
        <Text alignment="center">슬라이드 불러오는 중...</Text>
      </Rows>
    );
  }

  // Card detail view
  if (selectedSet && slides.length > 0) {
    return (
      <Rows spacing="1.5u">
        <Button
          variant="tertiary"
          onClick={() => {
            setSelectedSet(null);
            setSlides([]);
            setSuccess(null);
          }}
        >
          ← 목록으로
        </Button>

        <Title size="small">{selectedSet.notice_title}</Title>
        <Text size="small" tone="tertiary">
          {`${selectedSet.card_count}장 · ${selectedSet.tone ?? "정보형"} · ${selectedSet.audience ?? "전체"}`}
        </Text>
        <Text size="small" tone="tertiary">
          {fontName ? `폰트: ${fontName}` : "폰트: Canva 기본 (Pretendard 후보 없음)"}
        </Text>

        {error && <Alert tone="critical">{error}</Alert>}
        {success && <Alert tone="info">{success}</Alert>}

        <Button
          variant="primary"
          onClick={insertAllCards}
          loading={inserting}
          stretch
        >
          {inserting ? "삽입 중..." : `Canva에 ${slides.length}장 삽입하기`}
        </Button>

        <Rows spacing="1u">
          {slides.map((s) => (
            <Box
              key={s.id}
              padding="1u"
              borderRadius="standard"
              background="neutral"
            >
              <Rows spacing="0.5u">
                <Columns spacing="1u" alignY="center">
                  <Column width="content">
                    <Text
                      size="small"
                      tone={s.role === "cta" ? "critical" : "secondary"}
                      variant="bold"
                    >
                      {s.card_no}
                    </Text>
                  </Column>
                  <Column>
                    <Text size="small" variant="bold">
                      {s.title}
                    </Text>
                  </Column>
                </Columns>
                <Text size="small" tone="tertiary" lineClamp={2}>
                  {s.body}
                </Text>
              </Rows>
            </Box>
          ))}
        </Rows>
      </Rows>
    );
  }

  // Set list view — Button으로 변경 (Box는 onClick 미지원)
  return (
    <Rows spacing="1.5u">
      <Title size="small">나쿠 카드뉴스</Title>
      <Text size="small" tone="tertiary">
        카드뉴스 세트를 선택하면 Canva 디자인에 편집 가능한 카드로 삽입됩니다.
      </Text>

      {error && <Alert tone="critical">{error}</Alert>}

      {sets.length === 0 ? (
        <Text alignment="center" tone="tertiary">
          등록된 카드뉴스가 없습니다.
        </Text>
      ) : (
        <Rows spacing="0.5u">
          {sets.map((s) => (
            <Button
              key={s.set_id}
              variant="secondary"
              onClick={() => selectSet(s)}
              stretch
              alignment="start"
            >
              {`${s.notice_title} — ${s.card_count}장${s.qa_verdict === "pass" ? " · QA ✓" : ""}`}
            </Button>
          ))}
        </Rows>
      )}

      <Button variant="tertiary" onClick={fetchSets}>
        새로고침
      </Button>
    </Rows>
  );
}
