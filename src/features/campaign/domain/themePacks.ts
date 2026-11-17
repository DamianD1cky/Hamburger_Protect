import {
  crisisDinerAppearance,
  veilBoardAppearance,
  type BoardAppearance,
} from "./boardAppearance";
import type { CampaignBoard, CampaignRole, CampaignSectionKey } from "./types";

export type CampaignThemePackId = "veil" | "crisis_diner";

export interface CampaignThemePack {
  id: CampaignThemePackId;
  label: string;
  description: string;
  defaultCampaignName: string;
  gmJobTitle: string;
  gmPlaceholder: string;
  submitLabel: string;
  appearance: () => BoardAppearance;
  sectionTitles: Partial<Record<CampaignSectionKey, string>>;
  sectionColors: Partial<Record<CampaignSectionKey, string>>;
  resourceTitles: Partial<Record<string, string>>;
}

export const playerPositionPresets = [
  "调查员",
  "冒险者",
  "特工",
  "学者",
  "医师",
  "游侠",
  "厨师",
  "服务员",
] as const;

export const campaignThemePacks: Record<CampaignThemePackId, CampaignThemePack> = {
  veil: {
    id: "veil",
    label: "帷幕软木（通用默认）",
    description: "中性软木与木框桌面，适配悬疑调查、奇幻冒险、无限流与自创规则。",
    defaultCampaignName: "灰雾港调查档案",
    gmJobTitle: "主持人",
    gmPlaceholder: "例：守秘人老周 / 远征团主持人",
    submitLabel: "创建战役并展开告示板",
    appearance: veilBoardAppearance,
    sectionTitles: {},
    sectionColors: {},
    resourceTitles: {},
  },
  crisis_diner: {
    id: "crisis_diner",
    label: "危机营业（经典主题包）",
    description: "保留快餐店厨房背景、汉堡边框、排班与食材防御分类的经典风味。",
    defaultCampaignName: "汉○王夜班危机营业",
    gmJobTitle: "店长",
    gmPlaceholder: "例：临时代理店长老周",
    submitLabel: "创建战役并开始营业",
    appearance: () => crisisDinerAppearance(),
    sectionTitles: {
      tasks: "工作指示与报告",
      shifts: "危机排班",
      activity: "工作记录",
      safety: "每日检查清单",
    },
    sectionColors: {
      inventory: "#df101d",
      tasks: "#df101d",
      shifts: "#0860b2",
      index: "#fff4d9",
      activity: "#f6d817",
      safety: "#12963e",
      notes: "#f6d817",
    },
    resourceTitles: {
      "0": "食材与补给",
      "1": "设施与防御",
      "2": "工具与用品",
    },
  },
};

export function gmRoleLabel(role: CampaignRole, jobTitle?: string) {
  if (role === "gm") {
    const trimmed = jobTitle?.trim();
    if (trimmed && trimmed !== "主持人" && trimmed !== "GM") {
      return `GM / ${trimmed}`;
    }
    return "GM / 主持人";
  }
  if (role === "player") return jobTitle?.trim() || "玩家";
  return "观察者";
}

export function isCrisisDinerBoard(board: Pick<CampaignBoard, "settings" | "members">) {
  return (
    board.settings.appearance.frame === "burger" ||
    board.members.some((member) => member.role === "gm" && member.jobTitle === "店长")
  );
}
