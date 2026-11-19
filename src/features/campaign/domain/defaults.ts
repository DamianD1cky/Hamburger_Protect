import type { CampaignBoard } from "./types.ts";
import { veilBoardAppearance } from "./boardAppearance.ts";
import { defaultBoardStyleTokens } from "./boardStyleTokens.ts";
import { defaultCampaignClock } from "./campaignClock.ts";
import { DEFAULT_DECOMPOSED_SECTIONS } from "./campaignSettings.ts";
import { createInitialCorePanels } from "./customPanels.ts";

/**
 * 初始桌面默认呈现「成员名册、事件钟、工作记录」三块由原子能力（member_roster / event_clock / activity_feed）
 * 拼装而成的展示板块，点击任意板块的编辑按钮均统一进入同一套 Apple HIG 板块检查器。
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
    moduleLayout: {},
    isPublic: false,
    backgroundPath: null,
    noteTexturePath: null,
    backgroundUrl: null,
    noteTextureUrl: null,
    appearance: veilBoardAppearance(),
    styleTokens: defaultBoardStyleTokens(),
    customPanels: createInitialCorePanels(),
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
