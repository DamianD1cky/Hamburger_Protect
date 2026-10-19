import type { ResourceStatus } from "./types";

export const resourceGroups = [
  { id: 0, title: "食材与补给", color: "yellow" },
  { id: 1, title: "设施与防御", color: "cream" },
  { id: 2, title: "工具与用品", color: "pink" },
] as const;

export const resourceLabels: Record<ResourceStatus, string> = {
  ok: "已备",
  low: "待补",
  out: "耗尽",
};
