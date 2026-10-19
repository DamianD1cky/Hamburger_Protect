import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nhost, isNhostConfigured } from "../../../lib/nhost/client";
import { localCampaignRepository } from "../data/localCampaignRepository";
import { nhostCampaignRepository } from "../data/nhostCampaignRepository";
import { cloneDefaultBoard, defaultBoard } from "../domain/defaults";
import type {
  CampaignBoard,
  ResourceDraft,
  ChecklistDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "../domain/types";

export function useCampaignBoard(
  requestedCampaignId = defaultBoard.campaign.id,
) {
  const queryClient = useQueryClient();
  const session = nhost?.getUserSession();
  const cloudEnabled = isNhostConfigured && Boolean(session?.user);
  const repository = cloudEnabled
    ? nhostCampaignRepository
    : localCampaignRepository;
  const boardKey = [
    "campaign-board",
    cloudEnabled ? "nhost" : "local",
    session?.user?.id ?? "demo",
    requestedCampaignId,
  ] as const;
  const query = useQuery({
    queryKey: boardKey,
    queryFn: () => repository.getBoard(requestedCampaignId),
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
    dataSource: cloudEnabled ? ("nhost" as const) : ("local" as const),
    isLoading: query.isLoading,
    getActivities: (beforeId?: string) => repository.getActivities(campaignId, beforeId),
    saveResource: (draft: ResourceDraft, id?: string) =>
      commit(() => repository.saveResource(campaignId, draft, id)),
    deleteResource: (id: string) =>
      commit(() => repository.deleteResource(campaignId, id)),
    saveChecklistItem: (draft: ChecklistDraft, id?: string) =>
      commit(() => repository.saveChecklistItem(campaignId, draft, id)),
    deleteChecklistItem: (id: string) =>
      commit(() => repository.deleteChecklistItem(campaignId, id)),
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
  };
}
