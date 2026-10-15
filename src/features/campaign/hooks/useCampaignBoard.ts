import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nhost, isNhostConfigured } from "../../../lib/nhost/client";
import { localCampaignRepository } from "../data/localCampaignRepository";
import { nhostCampaignRepository } from "../data/nhostCampaignRepository";
import { cloneDefaultBoard, defaultBoard } from "../domain/defaults";
import type {
  CampaignBoard,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "../domain/types";

export function useCampaignBoard() {
  const queryClient = useQueryClient();
  const cloudEnabled =
    isNhostConfigured && Boolean(nhost?.getUserSession()?.user);
  const repository = cloudEnabled
    ? nhostCampaignRepository
    : localCampaignRepository;
  const boardKey = [
    "campaign-board",
    cloudEnabled ? "nhost" : "local",
  ] as const;
  const query = useQuery({
    queryKey: boardKey,
    queryFn: () => repository.getBoard(defaultBoard.campaign.id),
    placeholderData: cloneDefaultBoard,
  });
  const board = query.data ?? cloneDefaultBoard();
  const campaignId = board.campaign.id;

  const commit = async (operation: () => Promise<CampaignBoard>) => {
    const next = await operation();
    queryClient.setQueryData(boardKey, next);
    return next;
  };

  return {
    board,
    dataSource: cloudEnabled ? ("nhost" as const) : ("local" as const),
    isLoading: query.isLoading,
    cycleResource: (resourceId: string) =>
      commit(() => repository.cycleResource(campaignId, resourceId)),
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
