import type { CampaignBoard } from "./types";
import { veilBoardAppearance } from "./boardAppearance";
import { defaultCampaignClock } from "./campaignClock";

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
    hiddenSections: [],
    moduleLayout: {},
    isPublic: false,
    backgroundPath: null,
    noteTexturePath: null,
    backgroundUrl: null,
    noteTextureUrl: null,
    appearance: veilBoardAppearance(),
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
