import type { CampaignBoard } from "./types";

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
      active: true,
      joinedAt: "2026-10-19T00:00:00.000Z",
    },
  ],
  resources: [],
  checklist: [],
  quests: [],
  notes: [],
};

export function cloneDefaultBoard(): CampaignBoard {
  return structuredClone(defaultBoard);
}
