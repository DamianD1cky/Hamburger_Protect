import type { CampaignBoard } from "./types.ts";
import { veilBoardAppearance } from "./boardAppearance.ts";
import { defaultBoardStyleTokens } from "./boardStyleTokens.ts";
import { defaultCampaignClock } from "./campaignClock.ts";
import { DEFAULT_DECOMPOSED_SECTIONS } from "./campaignSettings.ts";

/**
 * 初始公告板仅保留三大核心板块：成员名册（shifts）、事件钟（index）、行动记录（activity）。
 * 物资、委托任务、检查清单均由原子能力（resource_list / task_board / checkbox_group 等）按需拼装。
 */
export const defaultBoard: CampaignBoard = {
  campaign: {
    id: "demo-campaign",
    name: "灰雾港调查档案",
    joinCode: "VEIL01",
    burgerIndex: 5,
    status: "active",
  },
  viewer: {
    id: "demo-gm",
    displayName: "帷幕主持人",
    role: "gm",
    jobTitle: "主持人",
  },
  members: [
    {
      userId: "demo-gm",
      role: "gm",
      characterName: "帷幕主持人",
      jobTitle: "主持人",
      profileText: "",
      active: true,
      joinedAt: "2026-10-19T00:00:00.000Z",
      leftAt: null,
    },
  ],
  resources: [],
  checklistCategories: [],
  checklist: [],
  quests: [],
  notes: [],
  settings: {
    sectionTitles: {},
    sectionColors: {},
    resourceTitles: {},
    hiddenSections: [...DEFAULT_DECOMPOSED_SECTIONS],
    moduleLayout: {
      shifts: { x: 60, y: 50, w: 360, h: 290 },
      index: { x: 450, y: 50, w: 340, h: 221 },
      activity: { x: 60, y: 370, w: 395, h: 380 },
    },
    isPublic: false,
    backgroundPath: null,
    noteTexturePath: null,
    backgroundUrl: null,
    noteTextureUrl: null,
    appearance: veilBoardAppearance(),
    styleTokens: defaultBoardStyleTokens(),
    customPanels: [],
    boardTextureUrl: null,
    clock: defaultCampaignClock(),
  },
  activities: [],
  hasMoreActivity: false,
  noteLinks: [],
  stickers: [],
  eventClocks: [],
};

export function cloneDefaultBoard(): CampaignBoard {
  return structuredClone(defaultBoard);
}
