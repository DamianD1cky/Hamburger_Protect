import type {
  CampaignBoard,
  ActivityPage,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "./types";

export interface CampaignRepository {
  getBoard(campaignId: string): Promise<CampaignBoard>;
  getActivities(campaignId: string, beforeId?: string): Promise<ActivityPage>;
  saveResource(
    campaignId: string,
    draft: ResourceDraft,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteResource(campaignId: string, id: string): Promise<CampaignBoard>;
  saveChecklistItem(
    campaignId: string,
    draft: ChecklistDraft,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteChecklistItem(campaignId: string, id: string): Promise<CampaignBoard>;
  saveChecklistCategory(
    campaignId: string,
    name: string,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteChecklistCategory(
    campaignId: string,
    id: string,
  ): Promise<CampaignBoard>;
  setBurgerIndex(campaignId: string, value: number): Promise<CampaignBoard>;
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
  setNotePinned(
    campaignId: string,
    noteId: string,
    pinned: boolean,
  ): Promise<CampaignBoard>;
  updateMemberProfile(
    campaignId: string,
    draft: MemberProfileDraft,
  ): Promise<CampaignBoard>;
  removeMember(
    campaignId: string,
    userId: string,
    note?: string,
  ): Promise<CampaignBoard>;
  updateCampaignSettings(
    campaignId: string,
    draft: CampaignSettingsDraft,
  ): Promise<CampaignBoard>;
  setCampaignPublic(
    campaignId: string,
    isPublic: boolean,
  ): Promise<CampaignBoard>;
  uploadCampaignMedia(
    campaignId: string,
    kind: CampaignMediaKind,
    file: File,
  ): Promise<CampaignBoard>;
  clearCampaignMedia(
    campaignId: string,
    kind: CampaignMediaKind,
  ): Promise<CampaignBoard>;
}
