import type { ResourceStatus } from "./types";

export const resourceGroups = [
  { id: 0, title: "食材与补给", color: "yellow" },
  { id: 1, title: "设施与防御", color: "cream" },
  { id: 2, title: "工具与用品", color: "pink" },
] as const;

export const defaultResourceTitles: Record<string, string> =
  Object.fromEntries(
    resourceGroups.map((group) => [String(group.id), group.title]),
  );

/** 物资便签小标题：GM 改过的优先，否则用默认标题。 */
export function resourceGroupTitle(
  id: number,
  custom: Partial<Record<string, string>> = {},
) {
  const customTitle = custom[String(id)]?.trim();
  if (customTitle) return customTitle;
  return resourceGroups.find((group) => group.id === id)?.title ?? "";
}

export const resourceLabels: Record<ResourceStatus, string> = {
  ok: "已备",
  low: "待补",
  out: "耗尽",
};
