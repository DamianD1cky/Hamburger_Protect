import type {
  CampaignBoard,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "./types";

export interface CampaignRepository {
  getBoard(campaignId: string): Promise<CampaignBoard>;
  cycleResource(campaignId: string, resourceId: string): Promise<CampaignBoard>;
  toggleChecklist(campaignId: string, itemId: string): Promise<CampaignBoard>;
  saveQuest(
    campaignId: string,
    draft: QuestDraft,
    questId?: string,
  ): Promise<CampaignBoard>;
  transitionQuest(
    campaignId: string,
    questId: string,
    status: QuestStatus,
  ): Promise<CampaignBoard>;
  deleteQuest(campaignId: string, questId: string): Promise<CampaignBoard>;
  saveNote(
    campaignId: string,
    draft: NoteDraft,
    noteId?: string,
  ): Promise<CampaignBoard>;
  moveNote(
    campaignId: string,
    noteId: string,
    x: number,
    y: number,
  ): Promise<CampaignBoard>;
  deleteNote(campaignId: string, noteId: string): Promise<CampaignBoard>;
}
