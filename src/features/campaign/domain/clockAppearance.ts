import type { CSSProperties } from "react";
import type { BoardAppearance } from "./boardAppearance.ts";
import type { CampaignClockStyle } from "./campaignClock.ts";
import { normalizeColor } from "./campaignSettings.ts";

export type ClockThemePresetId =
  | "auto"
  | "veil_cork"
  | "shadow_slate"
  | "parchment_study"
  | "crisis_diner"
  | "cyber_terminal"
  | "molten_forge"
  | "custom";

export type ClockFontStyle = "mono" | "serif" | "handwritten" | "display";
export type ClockFrameStyle = "glass" | "bezel" | "parchment" | "terminal";

export interface BoardClockAppearance {
  preset: ClockThemePresetId;
  label?: string | null;
  surfaceColor?: string | null;
  borderColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  glowColor?: string | null;
  fontStyle?: ClockFontStyle;
  frameStyle?: ClockFrameStyle;
  scanlines?: boolean;
  glowStrength?: number;
  fontSize?: number;
  customFontFamily?: string | null;
  aiPrompt?: string | null;
}

export interface ClockThemeVisual {
  id: Exclude<ClockThemePresetId, "auto">;
  label: string;
  tagline: string;
  recommendedDial: CampaignClockStyle;
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  glowColor: string;
  fontStyle: ClockFontStyle;
  frameStyle: ClockFrameStyle;
  scanlines: boolean;
  glowStrength: number;
  fontSize: number;
  customFontFamily?: string | null;
}

const VALID_PRESETS = new Set<ClockThemePresetId>([
  "auto",
  "veil_cork",
  "shadow_slate",
  "parchment_study",
  "crisis_diner",
  "cyber_terminal",
  "molten_forge",
  "custom",
]);

const VALID_FONTS = new Set<ClockFontStyle>([
  "mono",
  "serif",
  "handwritten",
  "display",
]);

const VALID_FRAMES = new Set<ClockFrameStyle>([
  "glass",
  "bezel",
  "parchment",
  "terminal",
]);

export const CLOCK_THEME_PRESETS: Record<
  Exclude<ClockThemePresetId, "auto" | "custom">,
  ClockThemeVisual
> = {
  veil_cork: {
    id: "veil_cork",
    label: "帷幕软木",
    tagline: "胡桃木边 + 奶油黄铜表盘",
    recommendedDial: "quartz",
    surfaceColor: "#261f1a",
    borderColor: "#b8905c",
    textColor: "#f7ecd6",
    accentColor: "#e2ae5c",
    glowColor: "#e2ae5c",
    fontStyle: "serif",
    frameStyle: "bezel",
    scanlines: false,
    glowStrength: 0.45,
    fontSize: 22,
  },
  shadow_slate: {
    id: "shadow_slate",
    label: "暗影黑板",
    tagline: "拉丝玄铁 + 粉笔冷白字面",
    recommendedDial: "digital",
    surfaceColor: "#1b2229",
    borderColor: "#6e8296",
    textColor: "#edf4fa",
    accentColor: "#8ec5ff",
    glowColor: "#78b8ff",
    fontStyle: "display",
    frameStyle: "glass",
    scanlines: false,
    glowStrength: 0.55,
    fontSize: 22,
  },
  parchment_study: {
    id: "parchment_study",
    label: "羊皮卷宗",
    tagline: "古铜手抄卷轴 + 暖褐墨字",
    recommendedDial: "quartz",
    surfaceColor: "#efe2c6",
    borderColor: "#8c6538",
    textColor: "#2d1f12",
    accentColor: "#a24328",
    glowColor: "#c88d42",
    fontStyle: "serif",
    frameStyle: "parchment",
    scanlines: false,
    glowStrength: 0.2,
    fontSize: 22,
  },
  crisis_diner: {
    id: "crisis_diner",
    label: "危机营业",
    tagline: "复古霓虹灯箱 + 炽红辉光",
    recommendedDial: "nixie",
    surfaceColor: "#171a18",
    borderColor: "#dfd6c1",
    textColor: "#ff5a4f",
    accentColor: "#f7b538",
    glowColor: "#ff3b30",
    fontStyle: "mono",
    frameStyle: "bezel",
    scanlines: false,
    glowStrength: 1.15,
    fontSize: 22,
  },
  cyber_terminal: {
    id: "cyber_terminal",
    label: "赛博终端",
    tagline: "全息荧光青 + 扫描线矩阵",
    recommendedDial: "digital",
    surfaceColor: "#09181e",
    borderColor: "#2be4dc",
    textColor: "#b8fffb",
    accentColor: "#2be4dc",
    glowColor: "#2be4dc",
    fontStyle: "mono",
    frameStyle: "terminal",
    scanlines: true,
    glowStrength: 1.25,
    fontSize: 22,
  },
  molten_forge: {
    id: "molten_forge",
    label: "熔炉余烬",
    tagline: "焦黑锻铁 + 炽热余烬辉光",
    recommendedDial: "nixie",
    surfaceColor: "#1c1311",
    borderColor: "#c95b2a",
    textColor: "#ffd199",
    accentColor: "#ff6a2b",
    glowColor: "#ff4d12",
    fontStyle: "display",
    frameStyle: "bezel",
    scanlines: false,
    glowStrength: 1.3,
    fontSize: 22,
  },
};

export const CLOCK_THEME_PRESET_LIST: ClockThemeVisual[] = [
  CLOCK_THEME_PRESETS.veil_cork,
  CLOCK_THEME_PRESETS.shadow_slate,
  CLOCK_THEME_PRESETS.parchment_study,
  CLOCK_THEME_PRESETS.crisis_diner,
  CLOCK_THEME_PRESETS.cyber_terminal,
  CLOCK_THEME_PRESETS.molten_forge,
];

export function defaultBoardClockAppearance(): BoardClockAppearance {
  return {
    preset: "auto",
    label: null,
    surfaceColor: null,
    borderColor: null,
    textColor: null,
    accentColor: null,
    glowColor: null,
  fontStyle: "mono",
  frameStyle: "glass",
  scanlines: false,
  glowStrength: 0.6,
  fontSize: 22,
  customFontFamily: null,
  aiPrompt: null,
};
}

export function normalizeBoardClockAppearance(
  raw: unknown,
): BoardClockAppearance {
  const base = defaultBoardClockAppearance();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const preset = VALID_PRESETS.has(r.preset as ClockThemePresetId)
    ? (r.preset as ClockThemePresetId)
    : base.preset;
  const fontStyle = VALID_FONTS.has(r.fontStyle as ClockFontStyle)
    ? (r.fontStyle as ClockFontStyle)
    : base.fontStyle;
  const frameStyle = VALID_FRAMES.has(r.frameStyle as ClockFrameStyle)
    ? (r.frameStyle as ClockFrameStyle)
    : base.frameStyle;
  const glowRaw = Number(r.glowStrength);
  const glowStrength = Number.isFinite(glowRaw)
    ? Math.max(0, Math.min(2, Number(glowRaw.toFixed(2))))
    : base.glowStrength;
  const fontSizeRaw = Number(r.fontSize);
  const fontSize = Number.isFinite(fontSizeRaw)
    ? Math.max(14, Math.min(34, Math.round(fontSizeRaw)))
    : 22;
  const customFontFamily =
    typeof r.customFontFamily === "string" && r.customFontFamily.trim()
      ? r.customFontFamily.trim().slice(0, 64)
      : null;
  const label =
    typeof r.label === "string" && r.label.trim()
      ? r.label.trim().slice(0, 40)
      : null;
  const aiPrompt =
    typeof r.aiPrompt === "string" && r.aiPrompt.trim()
      ? r.aiPrompt.trim().slice(0, 180)
      : null;

  return {
    preset,
    label,
    surfaceColor:
      typeof r.surfaceColor === "string" ? normalizeColor(r.surfaceColor) : null,
    borderColor:
      typeof r.borderColor === "string" ? normalizeColor(r.borderColor) : null,
    textColor:
      typeof r.textColor === "string" ? normalizeColor(r.textColor) : null,
    accentColor:
      typeof r.accentColor === "string" ? normalizeColor(r.accentColor) : null,
    glowColor:
      typeof r.glowColor === "string" ? normalizeColor(r.glowColor) : null,
    fontStyle,
    frameStyle,
    scanlines: Boolean(r.scanlines),
    glowStrength,
    fontSize,
    customFontFamily,
    aiPrompt,
  };
}

export function isDefaultBoardClockAppearance(
  value: BoardClockAppearance | null | undefined,
): boolean {
  if (!value) return true;
  return (
    value.preset === "auto" &&
    !value.surfaceColor &&
    !value.borderColor &&
    !value.textColor &&
    !value.accentColor &&
    !value.glowColor &&
    !value.scanlines &&
    (value.fontSize ?? 22) === 22 &&
    !value.customFontFamily
  );
}

/** 根据当前公告板的板面外观与全局 Shader，推断与之配套的时钟预设。 */
export function inferBoardMatchingClockPreset(
  appearance?: BoardAppearance | null,
  hints?: {
    cardStyle?: string;
    surfaceShader?: string;
  },
): Exclude<ClockThemePresetId, "auto" | "custom"> {
  if (hints?.surfaceShader === "hologram_grid" || hints?.cardStyle === "terminal") {
    return "cyber_terminal";
  }
  if (hints?.surfaceShader === "ember_ash") {
    return "molten_forge";
  }
  if (hints?.surfaceShader === "ancient_vellum") {
    return "parchment_study";
  }
  if (appearance) {
    if (appearance.frame === "burger") return "crisis_diner";
    if (appearance.surface.kind === "paper") return "parchment_study";
    if (appearance.surface.kind === "felt" || appearance.frame === "metal") {
      return "shadow_slate";
    }
    if (appearance.surface.kind === "cork") return "veil_cork";
  }
  return "veil_cork";
}

export function resolveClockVisual(
  clockAppearance: BoardClockAppearance | null | undefined,
  boardAppearance?: BoardAppearance | null,
  hints?: { cardStyle?: string; surfaceShader?: string },
): ClockThemeVisual {
  const normalized = normalizeBoardClockAppearance(clockAppearance);
  const baseKey =
    normalized.preset === "auto"
      ? inferBoardMatchingClockPreset(boardAppearance, hints)
      : normalized.preset === "custom"
        ? inferBoardMatchingClockPreset(boardAppearance, hints)
        : normalized.preset;
  const preset = CLOCK_THEME_PRESETS[baseKey];

  if (normalized.preset !== "custom") {
    return {
      ...preset,
      surfaceColor: normalized.surfaceColor ?? preset.surfaceColor,
      borderColor: normalized.borderColor ?? preset.borderColor,
      textColor: normalized.textColor ?? preset.textColor,
      accentColor: normalized.accentColor ?? preset.accentColor,
      glowColor: normalized.glowColor ?? preset.glowColor,
      fontSize: normalized.fontSize ?? preset.fontSize,
      customFontFamily: normalized.customFontFamily ?? null,
    };
  }

  return {
    id: "custom",
    label: normalized.label || "AI 自定义时钟",
    tagline: normalized.aiPrompt || "自定义配色与质感",
    recommendedDial: preset.recommendedDial,
    surfaceColor: normalized.surfaceColor ?? preset.surfaceColor,
    borderColor: normalized.borderColor ?? preset.borderColor,
    textColor: normalized.textColor ?? preset.textColor,
    accentColor: normalized.accentColor ?? preset.accentColor,
    glowColor: normalized.glowColor ?? normalized.accentColor ?? preset.glowColor,
    fontStyle: normalized.fontStyle ?? preset.fontStyle,
    frameStyle: normalized.frameStyle ?? preset.frameStyle,
    scanlines: Boolean(normalized.scanlines),
    glowStrength: normalized.glowStrength ?? preset.glowStrength,
    fontSize: normalized.fontSize ?? preset.fontSize,
    customFontFamily: normalized.customFontFamily ?? null,
  };
}

const CLOCK_FONT_MAP: Record<ClockFontStyle, string> = {
  mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  serif: '"Songti SC", "STSong", "Noto Serif SC", Georgia, serif',
  handwritten: '"LXGW WenKai", "Kaiti SC", "STKaiti", serif',
  display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif',
};

export function clockVisualCssVars(visual: ClockThemeVisual): CSSProperties {
  const glowPx = Math.round(visual.glowStrength * 12);
  const resolvedFont = visual.customFontFamily
    ? `"${visual.customFontFamily}", ${CLOCK_FONT_MAP[visual.fontStyle]}`
    : CLOCK_FONT_MAP[visual.fontStyle];
  return {
    "--clock-surface": visual.surfaceColor,
    "--clock-border": visual.borderColor,
    "--clock-text": visual.textColor,
    "--clock-accent": visual.accentColor,
    "--clock-glow": visual.glowColor,
    "--clock-glow-radius": `${glowPx}px`,
    "--clock-font": resolvedFont,
    "--clock-font-size": `${visual.fontSize}px`,
  } as CSSProperties;
}

/**
 * 离线自然语言时钟样式编排器（在无外部 LLM 或实时快捷入口下也能生成高质感定制时钟）：
 * 同时返回推荐的 `clockStyle`（nixie / quartz / digital）与完整的 `BoardClockAppearance`。
 */
export function synthesizeClockStyleFromPrompt(prompt: string): {
  appearance: BoardClockAppearance;
  recommendedDial: CampaignClockStyle;
  reply: string;
} {
  const text = prompt.trim();
  const wantsNixie = /辉光|电子管|nixie|蒸汽|炼金|朋克|熔岩|烈焰|余烬/.test(text);
  const wantsQuartz = /石英|怀表|指针|古典|羊皮|天文|黄铜|木头|软木|优雅|维多利亚/.test(text);
  const wantsDigital = /数字|电子|赛博|全息|终端|黑客|矩阵|极简|现代|苹果|液态玻璃/.test(text);

  const hexMatches = text.match(/#[0-9a-fA-F]{6}/g) ?? [];

  if (/赛博|全息|霓虹|荧光|终端|矩阵|科技|未来/.test(text)) {
    const isPurple = /紫|粉|洋红|魅影|霓虹粉/.test(text);
    const accent = hexMatches[0] ?? (isPurple ? "#e879f9" : "#2be4dc");
    const appearance: BoardClockAppearance = {
      preset: "custom",
      label: isPurple ? "赛博紫霓虹钟" : "赛博全息终端钟",
      surfaceColor: isPurple ? "#140b24" : "#07171d",
      borderColor: accent,
      textColor: isPurple ? "#fce7ff" : "#c4fffb",
      accentColor: accent,
      glowColor: accent,
      fontStyle: "mono",
      frameStyle: "terminal",
      scanlines: true,
      glowStrength: 1.35,
      aiPrompt: text.slice(0, 120),
    };
    return {
      appearance,
      recommendedDial: wantsNixie ? "nixie" : wantsQuartz ? "quartz" : "digital",
      reply: `已生成「${appearance.label}」全息扫描线时钟样式。`,
    };
  }

  if (/熔岩|火焰|余烬|地狱|火山|赤红|炼狱|血月/.test(text)) {
    const accent = hexMatches[0] ?? "#ff5a1f";
    const appearance: BoardClockAppearance = {
      preset: "custom",
      label: "熔岩余烬辉光钟",
      surfaceColor: "#1b1110",
      borderColor: "#c84b20",
      textColor: "#ffe0b2",
      accentColor: accent,
      glowColor: "#ff3b14",
      fontStyle: "display",
      frameStyle: "bezel",
      scanlines: false,
      glowStrength: 1.4,
      aiPrompt: text.slice(0, 120),
    };
    return {
      appearance,
      recommendedDial: wantsQuartz ? "quartz" : wantsDigital ? "digital" : "nixie",
      reply: `已生成「${appearance.label}」炙热余烬时钟样式。`,
    };
  }

  if (/羊皮|古卷|古典|维多利亚|怀表|黄铜|炼金|魔法|奥术|秘银/.test(text)) {
    const isArcane = /奥术|魔法|秘银|星辰|星空|深渊/.test(text);
    const appearance: BoardClockAppearance = isArcane
      ? {
          preset: "custom",
          label: "星象奥术天文钟",
          surfaceColor: "#14182e",
          borderColor: "#d6b36a",
          textColor: "#f7e8c2",
          accentColor: hexMatches[0] ?? "#7dd3fc",
          glowColor: "#60a5fa",
          fontStyle: "serif",
          frameStyle: "bezel",
          scanlines: false,
          glowStrength: 1.05,
          aiPrompt: text.slice(0, 120),
        }
      : {
          preset: "custom",
          label: "古典羊皮黄铜钟",
          surfaceColor: "#f1e3c4",
          borderColor: "#8c6334",
          textColor: "#2c1e11",
          accentColor: hexMatches[0] ?? "#a8442a",
          glowColor: "#c48a3a",
          fontStyle: "serif",
          frameStyle: "parchment",
          scanlines: false,
          glowStrength: 0.25,
          aiPrompt: text.slice(0, 120),
        };
    return {
      appearance,
      recommendedDial: wantsNixie ? "nixie" : wantsDigital ? "digital" : "quartz",
      reply: `已生成「${appearance.label}」典雅时钟样式。`,
    };
  }

  if (/极光|冰霜|深海|翡翠|森系|青玉|薄荷|水墨/.test(text)) {
    const isJade = /翡翠|森系|青玉|薄荷/.test(text);
    const accent = hexMatches[0] ?? (isJade ? "#34d399" : "#38bdf8");
    const appearance: BoardClockAppearance = {
      preset: "custom",
      label: isJade ? "青玉翠影毛玻璃钟" : "深海极光玻璃钟",
      surfaceColor: isJade ? "#0f241f" : "#0d1b2a",
      borderColor: accent,
      textColor: isJade ? "#dcfff1" : "#e0f2fe",
      accentColor: accent,
      glowColor: accent,
      fontStyle: "display",
      frameStyle: "glass",
      scanlines: false,
      glowStrength: 0.9,
      aiPrompt: text.slice(0, 120),
    };
    return {
      appearance,
      recommendedDial: wantsQuartz ? "quartz" : wantsNixie ? "nixie" : "digital",
      reply: `已生成「${appearance.label}」通透毛玻璃时钟样式。`,
    };
  }

  // Generic custom prompt: respect any hex colors mentioned, default sleek dark glass
  const accent = hexMatches[0] ?? "#7cc4ff";
  const surface = hexMatches[1] ?? "#182028";
  const appearance: BoardClockAppearance = {
    preset: "custom",
    label: text.slice(0, 16) || "AI 定制时钟",
    surfaceColor: surface,
    borderColor: accent,
    textColor: "#f0f6fc",
    accentColor: accent,
    glowColor: accent,
    fontStyle: wantsQuartz ? "serif" : "display",
    frameStyle: "glass",
    scanlines: false,
    glowStrength: 0.85,
    aiPrompt: text.slice(0, 120),
  };
  return {
    appearance,
    recommendedDial: wantsNixie ? "nixie" : wantsQuartz ? "quartz" : "digital",
    reply: `已按「${text.slice(0, 24)}」为你定制专属时钟外观。`,
  };
}
