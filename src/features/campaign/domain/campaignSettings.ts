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

export function sectionTitle(
  key: CampaignSectionKey,
  custom: Partial<Record<CampaignSectionKey, string>>,
) {
  return custom[key]?.trim() || defaultSectionTitles[key];
}
