import type { CampaignSectionKey } from "./types";

export const campaignSections: Array<{
  id: CampaignSectionKey;
  defaultTitle: string;
}> = [
  { id: "inventory", defaultTitle: "可用物资与设施" },
  { id: "tasks", defaultTitle: "工作指示与报告" },
  { id: "shifts", defaultTitle: "危机排班" },
  { id: "index", defaultTitle: "汉堡屋指数" },
  { id: "activity", defaultTitle: "工作记录" },
  { id: "safety", defaultTitle: "每日检查清单" },
  { id: "notes", defaultTitle: "便签" },
];

export const defaultSectionTitles = Object.fromEntries(
  campaignSections.map((section) => [section.id, section.defaultTitle]),
) as Record<CampaignSectionKey, string>;

/** 区块标题的默认底色，与 styles.css 里的 .sign-* 保持一致。 */
export const defaultSectionColors: Record<CampaignSectionKey, string> = {
  inventory: "#df101d",
  tasks: "#df101d",
  shifts: "#0860b2",
  index: "#fff4d9",
  activity: "#f6d817",
  safety: "#12963e",
  notes: "#f6d817",
};

export function sectionTitle(
  key: CampaignSectionKey,
  custom: Partial<Record<CampaignSectionKey, string>>,
) {
  return custom[key]?.trim() || defaultSectionTitles[key];
}

/** 规范化 #rrggbb，非法值返回 null（用于过滤历史脏数据）。 */
export function normalizeColor(value: string | null | undefined) {
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
  return null;
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

/** 给标题牌（.sign / .index-heading）用的内联样式。 */
export function titleColorStyle(background: string) {
  const text = readableTextColor(background);
  return {
    background,
    color: text,
    textShadow: text === "#ffffff" ? "1px 2px 0 rgba(0, 0, 0, 0.2)" : "none",
  };
}
