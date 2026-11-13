import type { CampaignBoard } from "./types";
import { defaultBoardAppearance } from "./boardAppearance";
import { defaultCampaignClock } from "./campaignClock";

export const defaultBoard: CampaignBoard = {
  campaign: {
    id: "demo-campaign",
    name: "汉○王夜班危机营业",
    joinCode: "BURGER",
    burgerIndex: 5,
    status: "active",
  },
  viewer: {
    id: "demo-gm",
    displayName: "值班店长",
    role: "gm",
    jobTitle: "店长",
  },
  members: [
    {
      userId: "demo-gm",
      role: "gm",
      characterName: "值班店长",
      jobTitle: "店长",
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
    appearance: defaultBoardAppearance(),
    boardTextureUrl: null,
    clock: defaultCampaignClock(),
  },
  activities: [],
  hasMoreActivity: false,
  noteLinks: [],
  stickers: [],
};

export function cloneDefaultBoard(): CampaignBoard {
  return structuredClone(defaultBoard);
}
