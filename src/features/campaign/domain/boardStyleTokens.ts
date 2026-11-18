import type { CSSProperties } from "react";
import { normalizeColor, readableTextColor } from "./campaignSettings.ts";
import {
  defaultBoardAmbientShader,
  defaultCardVisualEffect,
  hasActiveAmbientShader,
  hasActiveCardEffect,
  normalizeBoardAmbientShader,
  normalizeCardVisualEffect,
  type BoardAmbientShader,
  type CardVisualEffect,
} from "./cardEffects.ts";

export type BoardFontPreset = "handwritten" | "serif" | "typewriter" | "mono";
export type BoardCardStyle = "paper" | "parchment" | "slate" | "terminal";
export type BoardRadiusPreset = "soft" | "sharp" | "torn";
export type BoardLinkStyle = "red_cord" | "gold_thread" | "chalk" | "neon_cyan";

export interface BoardStyleTokens {
  fontPreset: BoardFontPreset;
  cardStyle: BoardCardStyle;
  /** 可选自定义卡片底色（#rrggbb）；null 表示使用 cardStyle 默认底色。 */
  cardBackground: string | null;
  radiusPreset: BoardRadiusPreset;
  linkStyle: BoardLinkStyle;
  /** 全局默认模块/展板卡片着色器。 */
  defaultCardEffect?: CardVisualEffect;
  /** 全局默认便签着色器（单张便签可独立覆盖）。 */
  defaultNoteEffect?: CardVisualEffect;
  /** AI 命令可控的公告板背景板面 WebGL2 Shader。 */
  surfaceShader?: BoardAmbientShader;
  /** AI 命令可控的公告板外边框 WebGL2 Shader。 */
  frameShader?: BoardAmbientShader;
}

const FONT_PRESETS: readonly BoardFontPreset[] = [
  "handwritten",
  "serif",
  "typewriter",
  "mono",
];
const CARD_STYLES: readonly BoardCardStyle[] = [
  "paper",
  "parchment",
  "slate",
  "terminal",
];
const RADIUS_PRESETS: readonly BoardRadiusPreset[] = ["soft", "sharp", "torn"];
const LINK_STYLES: readonly BoardLinkStyle[] = [
  "red_cord",
  "gold_thread",
  "chalk",
  "neon_cyan",
];

export function defaultBoardStyleTokens(): BoardStyleTokens {
  return {
    fontPreset: "handwritten",
    cardStyle: "paper",
    cardBackground: null,
    radiusPreset: "soft",
    linkStyle: "red_cord",
    defaultCardEffect: defaultCardVisualEffect(),
    defaultNoteEffect: defaultCardVisualEffect(),
    surfaceShader: defaultBoardAmbientShader(),
    frameShader: defaultBoardAmbientShader(),
  };
}

export function normalizeBoardStyleTokens(raw: unknown): BoardStyleTokens {
  const base = defaultBoardStyleTokens();
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  const fontPreset = FONT_PRESETS.includes(record.fontPreset as BoardFontPreset)
    ? (record.fontPreset as BoardFontPreset)
    : base.fontPreset;
  const cardStyle = CARD_STYLES.includes(record.cardStyle as BoardCardStyle)
    ? (record.cardStyle as BoardCardStyle)
    : base.cardStyle;
  const radiusPreset = RADIUS_PRESETS.includes(
    record.radiusPreset as BoardRadiusPreset,
  )
    ? (record.radiusPreset as BoardRadiusPreset)
    : base.radiusPreset;
  const linkStyle = LINK_STYLES.includes(record.linkStyle as BoardLinkStyle)
    ? (record.linkStyle as BoardLinkStyle)
    : base.linkStyle;
  const cardBackground =
    typeof record.cardBackground === "string"
      ? normalizeColor(record.cardBackground)
      : null;
  const defaultCardEffect = normalizeCardVisualEffect(record.defaultCardEffect);
  const defaultNoteEffect = normalizeCardVisualEffect(record.defaultNoteEffect);
  const surfaceShader = normalizeBoardAmbientShader(record.surfaceShader);
  const frameShader = normalizeBoardAmbientShader(record.frameShader);
  return {
    fontPreset,
    cardStyle,
    cardBackground,
    radiusPreset,
    linkStyle,
    defaultCardEffect,
    defaultNoteEffect,
    surfaceShader,
    frameShader,
  };
}

const FONT_FAMILIES: Record<BoardFontPreset, string> = {
  handwritten: '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif',
  serif: '"Songti SC", "STSong", "Noto Serif SC", Georgia, serif',
  typewriter:
    '"Courier Prime", "American Typewriter", "Courier New", "LXGW WenKai", monospace',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "PingFang SC", monospace',
};

const CARD_SURFACES: Record<
  BoardCardStyle,
  { bg: string; ink: string; muted: string; border: string }
> = {
  paper: {
    bg: "#f4f3e7",
    ink: "#272421",
    muted: "#655e53",
    border: "rgba(39, 36, 33, 0.78)",
  },
  parchment: {
    bg: "#efe2c4",
    ink: "#2f2216",
    muted: "#6b533b",
    border: "rgba(78, 52, 28, 0.78)",
  },
  slate: {
    bg: "#232a2e",
    ink: "#ece8dd",
    muted: "#a9b2b5",
    border: "rgba(218, 206, 180, 0.42)",
  },
  terminal: {
    bg: "#101b18",
    ink: "#d4f7e4",
    muted: "#7db89c",
    border: "rgba(74, 222, 158, 0.55)",
  },
};

const RADIUS_VALUES: Record<BoardRadiusPreset, string> = {
  soft: "6px",
  sharp: "0px",
  torn: "2px 10px 3px 9px",
};

const LINK_TOKENS: Record<
  BoardLinkStyle,
  { stroke: string; dash: string; labelBg: string; labelInk: string }
> = {
  red_cord: {
    stroke: "#d32029",
    dash: "none",
    labelBg: "#fff8e6",
    labelInk: "#2a231c",
  },
  gold_thread: {
    stroke: "#d4a644",
    dash: "none",
    labelBg: "#2c2419",
    labelInk: "#f7e5b7",
  },
  chalk: {
    stroke: "#ece8dd",
    dash: "9 6",
    labelBg: "#273033",
    labelInk: "#f4f1e6",
  },
  neon_cyan: {
    stroke: "#2be4dc",
    dash: "none",
    labelBg: "#0f2326",
    labelInk: "#aefaf5",
  },
};

export function isDefaultBoardStyleTokens(tokens: BoardStyleTokens): boolean {
  const base = defaultBoardStyleTokens();
  return (
    tokens.fontPreset === base.fontPreset &&
    tokens.cardStyle === base.cardStyle &&
    tokens.cardBackground === base.cardBackground &&
    tokens.radiusPreset === base.radiusPreset &&
    tokens.linkStyle === base.linkStyle &&
    !hasActiveCardEffect(tokens.defaultCardEffect) &&
    !hasActiveCardEffect(tokens.defaultNoteEffect) &&
    !hasActiveAmbientShader(tokens.surfaceShader) &&
    !hasActiveAmbientShader(tokens.frameShader)
  );
}

/** 将结构化样式 Token 转为安全的 CSS 自定义属性，挂载在 .world 容器上。 */
export function boardStyleVariables(tokens: BoardStyleTokens): CSSProperties {
  const surface = CARD_SURFACES[tokens.cardStyle];
  const bg = tokens.cardBackground ?? surface.bg;
  const customLight = tokens.cardBackground
    ? readableTextColor(tokens.cardBackground) === "#2b2517"
    : null;
  const ink =
    customLight === null ? surface.ink : customLight ? "#252019" : "#f0ece1";
  const muted =
    customLight === null
      ? surface.muted
      : customLight
        ? "#645b4f"
        : "#b2b8b6";
  const border =
    customLight === null
      ? surface.border
      : customLight
        ? "rgba(42, 35, 27, 0.72)"
        : "rgba(232, 224, 205, 0.44)";
  const link = LINK_TOKENS[tokens.linkStyle];

  return {
    "--vb-font-family": FONT_FAMILIES[tokens.fontPreset],
    "--vb-card-bg": bg,
    "--vb-card-ink": ink,
    "--vb-card-muted": muted,
    "--vb-card-border": border,
    "--vb-card-radius": RADIUS_VALUES[tokens.radiusPreset],
    "--vb-link-stroke": link.stroke,
    "--vb-link-dash": link.dash,
    "--vb-link-label-bg": link.labelBg,
    "--vb-link-label-ink": link.labelInk,
  } as CSSProperties;
}

export const boardStylePresetLabels: Record<
  "default" | "noir" | "arcane" | "terminal",
  { label: string; tokens: BoardStyleTokens }
> = {
  default: {
    label: "手写纸卡（默认）",
    tokens: defaultBoardStyleTokens(),
  },
  noir: {
    label: "调查剪报（打字机+旧纸）",
    tokens: {
      ...defaultBoardStyleTokens(),
      fontPreset: "typewriter",
      cardStyle: "parchment",
      radiusPreset: "torn",
      linkStyle: "red_cord",
    },
  },
  arcane: {
    label: "古典秘卷（衬线+金丝）",
    tokens: {
      ...defaultBoardStyleTokens(),
      fontPreset: "serif",
      cardStyle: "parchment",
      cardBackground: "#f2e5c6",
      radiusPreset: "soft",
      linkStyle: "gold_thread",
    },
  },
  terminal: {
    label: "赛博终端（等宽+霓虹）",
    tokens: {
      ...defaultBoardStyleTokens(),
      fontPreset: "mono",
      cardStyle: "terminal",
      radiusPreset: "sharp",
      linkStyle: "neon_cyan",
    },
  },
};
