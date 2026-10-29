import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "../../../lib/backend";
import { getSupabaseAppSession } from "../../access/data/supabaseSession";
import {
  getPublicActivities,
  getPublicCampaignBoard,
  supabaseCampaignRepository,
} from "../data/supabaseCampaignRepository";
import { localCampaignRepository } from "../data/localCampaignRepository";
import { cloneDefaultBoard, defaultBoard } from "../domain/defaults";
import type {
  CampaignBoard,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "../domain/types";

export function useCampaignBoard(
  requestedCampaignId = defaultBoard.campaign.id,
  publicView = false,
) {
  const queryClient = useQueryClient();
  const session = getSupabaseAppSession();
  const cloudEnabled = backend !== "local";
  const repository = cloudEnabled
    ? supabaseCampaignRepository
    : localCampaignRepository;
  const boardKey = [
    "campaign-board",
    backend,
    publicView ? "public" : session?.user.authUserId,
    publicView ? "visitor" : (session?.user?.id ?? "demo"),
    requestedCampaignId,
  ] as const;
  const query = useQuery({
    queryKey: boardKey,
    queryFn: () =>
      publicView && cloudEnabled
        ? getPublicCampaignBoard(requestedCampaignId)
        : repository.getBoard(requestedCampaignId),
    placeholderData: cloudEnabled ? undefined : cloneDefaultBoard,
    refetchInterval: cloudEnabled ? 5_000 : false,
    refetchIntervalInBackground: false,
    staleTime: cloudEnabled ? 5_000 : Number.POSITIVE_INFINITY,
  });
  const board = query.data;
  const campaignId = board?.campaign.id ?? requestedCampaignId;

  const commit = async (operation: () => Promise<CampaignBoard>) => {
    const next = await operation();
    queryClient.setQueryData(boardKey, next);
    return next;
  };

  return {
    board,
    error: query.error,
    refetch: query.refetch,
    isLoading: query.isLoading,
    getActivities: (beforeId?: string) =>
      publicView && cloudEnabled
        ? getPublicActivities(campaignId, beforeId)
        : repository.getActivities(campaignId, beforeId),
    saveResource: (draft: ResourceDraft, id?: string) =>
      commit(() => repository.saveResource(campaignId, draft, id)),
    deleteResource: (id: string) =>
      commit(() => repository.deleteResource(campaignId, id)),
    saveChecklistItem: (draft: ChecklistDraft, id?: string) =>
      commit(() => repository.saveChecklistItem(campaignId, draft, id)),
    deleteChecklistItem: (id: string) =>
      commit(() => repository.deleteChecklistItem(campaignId, id)),
    saveChecklistCategory: (name: string, id?: string) =>
      commit(() => repository.saveChecklistCategory(campaignId, name, id)),
    deleteChecklistCategory: (id: string) =>
      commit(() => repository.deleteChecklistCategory(campaignId, id)),
    setBurgerIndex: (value: number) =>
      commit(() => repository.setBurgerIndex(campaignId, value)),
    toggleChecklist: (itemId: string) =>
      commit(() => repository.toggleChecklist(campaignId, itemId)),
    saveQuest: (draft: QuestDraft, questId?: string) =>
      commit(() => repository.saveQuest(campaignId, draft, questId)),
    transitionQuest: (questId: string, status: QuestStatus) =>
      commit(() => repository.transitionQuest(campaignId, questId, status)),
    deleteQuest: (questId: string) =>
      commit(() => repository.deleteQuest(campaignId, questId)),
    saveNote: (draft: NoteDraft, noteId?: string) =>
      commit(() => repository.saveNote(campaignId, draft, noteId)),
    moveNote: (noteId: string, x: number, y: number) =>
      commit(() => repository.moveNote(campaignId, noteId, x, y)),
    deleteNote: (noteId: string) =>
      commit(() => repository.deleteNote(campaignId, noteId)),
    setNotePinned: (noteId: string, pinned: boolean) =>
      commit(() => repository.setNotePinned(campaignId, noteId, pinned)),
    updateMemberProfile: (draft: MemberProfileDraft) =>
      commit(() => repository.updateMemberProfile(campaignId, draft)),
    removeMember: (userId: string, note?: string) =>
      commit(() => repository.removeMember(campaignId, userId, note)),
    updateCampaignSettings: (draft: CampaignSettingsDraft) =>
      commit(() => repository.updateCampaignSettings(campaignId, draft)),
    setCampaignPublic: (isPublic: boolean) =>
      commit(() => repository.setCampaignPublic(campaignId, isPublic)),
    uploadCampaignMedia: (kind: CampaignMediaKind, file: File) =>
      commit(() => repository.uploadCampaignMedia(campaignId, kind, file)),
    clearCampaignMedia: (kind: CampaignMediaKind) =>
      commit(() => repository.clearCampaignMedia(campaignId, kind)),
  };
}
