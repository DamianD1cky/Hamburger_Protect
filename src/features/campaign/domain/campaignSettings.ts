import type { CampaignSectionKey } from "./types.ts";

/**
 * 初始保留的核心系统板块：成员名册（shifts）、事件钟（index）、行动记录（activity）与自由便签（notes）。
 * 原「可用物资与设施」「委托与行动报告」「行动检查清单」已拆解为可由原子能力自由拼装的展板。
 */
export const coreCampaignSections: Array<{
  id: CampaignSectionKey;
  defaultTitle: string;
}> = [
  { id: "shifts", defaultTitle: "成员名册" },
  { id: "index", defaultTitle: "事件钟" },
  { id: "activity", defaultTitle: "行动记录" },
  { id: "notes", defaultTitle: "便签" },
];

/** 初始默认隐藏（已原子化重构）的历史内置模块键。 */
export const DEFAULT_DECOMPOSED_SECTIONS: CampaignSectionKey[] = [
  "inventory",
  "tasks",
  "safety",
];

/** 包含历史兼容键的完整定义表（确保旧战役数据与数据库校验 100% 兼容）。 */
export const campaignSections: Array<{
  id: CampaignSectionKey;
  defaultTitle: string;
}> = [
  { id: "inventory", defaultTitle: "可用物资与设施" },
  { id: "tasks", defaultTitle: "委托与行动报告" },
  { id: "shifts", defaultTitle: "成员名册" },
  { id: "index", defaultTitle: "事件钟" },
  { id: "activity", defaultTitle: "行动记录" },
  { id: "safety", defaultTitle: "行动检查清单" },
  { id: "notes", defaultTitle: "便签" },
];

export const defaultSectionTitles = Object.fromEntries(
  campaignSections.map((section) => [section.id, section.defaultTitle]),
) as Record<CampaignSectionKey, string>;

/** 区块标题的默认底色（帷幕软木配色：沉稳深红、石板蓝、松林绿与暖羊皮色）。 */
export const defaultSectionColors: Record<CampaignSectionKey, string> = {
  inventory: "#8f2929",
  tasks: "#9e3329",
  shifts: "#254e70",
  index: "#f5ebd4",
  activity: "#d8a838",
  safety: "#2e6b47",
  notes: "#d8a838",
};

export const NOTE_NAMED_COLORS: Record<string, string> = {
  yellow: "#f8e98e",
  pink: "#f4c7d0",
  blue: "#c2dff8",
  green: "#c9e8c2",
};

export const PIN_NAMED_COLORS: Record<string, string> = {
  red: "#e72b3c",
  blue: "#2785d8",
  green: "#36a467",
  yellow: "#f1c933",
  black: "#343536",
};

export function sectionTitle(
  key: CampaignSectionKey,
  custom: Partial<Record<CampaignSectionKey, string>>,
) {
  return custom[key]?.trim() || defaultSectionTitles[key];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0)));
  return (
    "#" +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string | null | undefined): [number, number, number] {
  const clean = normalizeColor(hex) ?? "#000000";
  return [
    parseInt(clean.slice(1, 3), 16),
    parseInt(clean.slice(3, 5), 16),
    parseInt(clean.slice(5, 7), 16),
  ];
}

/**
 * 全站统一色号解析器：支持 #rrggbb、#rgb、rgb(r, g, b) 以及 "r, g, b" 三通道数字，
 * 统一规范化输出为小写 #rrggbb，非法值返回 null。
 */
export function normalizeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return (
      "#" +
      trimmed
        .slice(1)
        .split("")
        .map((char) => char + char)
        .join("")
    ).toLowerCase();
  }
  const rgbMatch = trimmed.match(
    /^(?:rgba?\(\s*)?(\d{1,3})\s*[,，\s]\s*(\d{1,3})\s*[,，\s]\s*(\d{1,3})(?:\s*(?:[,/]\s*[\d.]+)?\s*\))?$/i,
  );
  if (rgbMatch) {
    // Must contain parens or comma/space separator (already matched 3 groups)
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if (r <= 255 && g <= 255 && b <= 255) {
      return rgbToHex(r, g, b);
    }
  }
  return null;
}

/** 解析便签纸张底色（兼容历史 yellow/pink/blue/green 与任意 RGB/#rrggbb）。 */
export function resolveNoteColorHex(color: string | null | undefined): string {
  if (!color) return NOTE_NAMED_COLORS.yellow;
  const key = color.trim().toLowerCase();
  if (key in NOTE_NAMED_COLORS) return NOTE_NAMED_COLORS[key];
  return normalizeColor(color) ?? NOTE_NAMED_COLORS.yellow;
}

/** 解析图钉底色与高光描边（兼容历史 red/blue/green/yellow/black 与任意 RGB/#rrggbb）。 */
export function resolvePinColorVisual(pinColor: string | null | undefined): {
  fill: string;
  stroke: string;
  highlight: string;
} {
  const key = (pinColor ?? "red").trim().toLowerCase();
  const fill =
    key in PIN_NAMED_COLORS
      ? PIN_NAMED_COLORS[key]
      : normalizeColor(pinColor) ?? PIN_NAMED_COLORS.red;
  const [r, g, b] = hexToRgb(fill);
  const stroke = rgbToHex(r * 0.46, g * 0.46, b * 0.46);
  const highlight = rgbToHex(
    r + (255 - r) * 0.52,
    g + (255 - g) * 0.52,
    b + (255 - b) * 0.52,
  );
  return { fill, stroke, highlight };
}

export function sectionColor(
  key: CampaignSectionKey,
  custom: Partial<Record<CampaignSectionKey, string>> = {},
) {
  return normalizeColor(custom[key]) ?? defaultSectionColors[key];
}

/** 根据底色亮度挑一个可读的文字颜色。 */
export function readableTextColor(background: string) {
  const hex = normalizeColor(background) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  );
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#2b2517" : "#ffffff";
}

/** 给所有模块的统一标题栏用的内联样式。 */
export function titleColorStyle(background: string) {
  const text = readableTextColor(background);
  return {
    background,
    color: text,
    textShadow: text === "#ffffff" ? "1px 2px 0 rgba(0, 0, 0, 0.2)" : "none",
  };
}
