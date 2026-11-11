import { useRef } from "react";
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
  BoardNoteLink,
  BoardSticker,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "../domain/types";

/** Shared with navigation so the prepared board is the mounted view's cache. */
export function campaignBoardQueryOptions(
  requestedCampaignId: string,
  publicView = false,
) {
  const session = getSupabaseAppSession();
  const cloudEnabled = backend !== "local";
  return {
    queryKey: [
      "campaign-board",
      backend,
      publicView ? "public" : session?.user.authUserId,
      publicView ? "visitor" : (session?.user.id ?? "demo"),
      requestedCampaignId,
    ] as const,
    queryFn: () =>
      publicView && cloudEnabled
        ? getPublicCampaignBoard(requestedCampaignId)
        : (cloudEnabled ? supabaseCampaignRepository : localCampaignRepository)
          .getBoard(requestedCampaignId),
    staleTime: cloudEnabled ? 5_000 : Number.POSITIVE_INFINITY,
    retry: 1,
  };
}

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
  const noteMoveRevisions = useRef(new Map<string, number>());
  const options = campaignBoardQueryOptions(requestedCampaignId, publicView);
  const boardKey = options.queryKey;
  const query = useQuery({
    ...options,
    placeholderData: cloudEnabled ? undefined : cloneDefaultBoard,
    refetchInterval: cloudEnabled ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const board = query.data;
  const campaignId = board?.campaign.id ?? requestedCampaignId;

  const commit = async (operation: () => Promise<CampaignBoard>) => {
    const next = await operation();
    if (cloudEnabled && getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId)
      throw new Error("登录账号已变更，请重新进入战役。");
    queryClient.setQueryData(boardKey, next);
    return next;
  };

  const setCachedNotePosition = (noteId: string, x: number, y: number) => {
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) => {
      if (!current) return current;
      const noteIndex = current.notes.findIndex((note) => note.id === noteId);
      if (noteIndex < 0) return current;
      const notes = current.notes.slice();
      notes[noteIndex] = { ...notes[noteIndex], x, y };
      return { ...current, notes };
    });
  };

  const moveNote = async (noteId: string, x: number, y: number) => {
    const revision = (noteMoveRevisions.current.get(noteId) ?? 0) + 1;
    noteMoveRevisions.current.set(noteId, revision);
    const previous = queryClient
      .getQueryData<CampaignBoard>(boardKey)
      ?.notes.find((note) => note.id === noteId);

    await queryClient.cancelQueries({ queryKey: boardKey });
    if (noteMoveRevisions.current.get(noteId) === revision) {
      setCachedNotePosition(noteId, x, y);
    }

    try {
      const next = await repository.moveNote(campaignId, noteId, x, y);
      if (
        cloudEnabled &&
        getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId
      ) {
        throw new Error("登录账号已变更，请重新进入战役。");
      }
      // moveNote 返回的是整板快照。这里只合并当前便签，避免较晚返回的
      // 旧快照覆盖其他刚移动完的便签。
      if (noteMoveRevisions.current.get(noteId) === revision) {
        setCachedNotePosition(noteId, x, y);
      }
      return next;
    } catch (error) {
      if (
        previous &&
        noteMoveRevisions.current.get(noteId) === revision
      ) {
        setCachedNotePosition(noteId, previous.x, previous.y);
      }
      throw error;
    } finally {
      if (noteMoveRevisions.current.get(noteId) === revision) {
        noteMoveRevisions.current.delete(noteId);
      }
    }
  };

  const createNoteLink = async (
    fromNoteId: string,
    toNoteId: string,
  ): Promise<BoardNoteLink> => {
    const created = await repository.createNoteLink(
      campaignId,
      fromNoteId,
      toNoteId,
    );
    if (
      cloudEnabled &&
      getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId
    ) {
      throw new Error("登录账号已变更，请重新进入战役。");
    }
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) => {
      if (!current) return current;
      const existing = current.noteLinks.find(
        (link) =>
          link.id === created.id ||
          (link.fromNoteId === created.fromNoteId &&
            link.toNoteId === created.toNoteId),
      );
      if (!existing) {
        return { ...current, noteLinks: [...current.noteLinks, created] };
      }
      return {
        ...current,
        noteLinks: current.noteLinks.map((link) =>
          link === existing ? created : link,
        ),
      };
    });
    return created;
  };

  const setCachedSticker = (sticker: BoardSticker) => {
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) => {
      if (!current) return current;
      const exists = current.stickers.some((item) => item.id === sticker.id);
      return {
        ...current,
        stickers: exists
          ? current.stickers.map((item) =>
              item.id === sticker.id ? sticker : item,
            )
          : [...current.stickers, sticker],
      };
    });
  };

  const createBoardSticker = async (
    emoji: string,
    x: number,
    y: number,
    rotation: number,
  ) => {
    const created = await repository.createBoardSticker(
      campaignId,
      emoji,
      x,
      y,
      rotation,
    );
    setCachedSticker(created);
    return created;
  };

  const moveBoardSticker = async (stickerId: string, x: number, y: number) => {
    const previous = queryClient
      .getQueryData<CampaignBoard>(boardKey)
      ?.stickers.find((item) => item.id === stickerId);
    if (previous) setCachedSticker({ ...previous, x, y });
    try {
      const moved = await repository.moveBoardSticker(
        campaignId,
        stickerId,
        x,
        y,
      );
      setCachedSticker(moved);
      return moved;
    } catch (error) {
      if (previous) setCachedSticker(previous);
      throw error;
    }
  };

  const deleteBoardSticker = async (stickerId: string) => {
    const previous = queryClient
      .getQueryData<CampaignBoard>(boardKey)
      ?.stickers.find((item) => item.id === stickerId);
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
      current
        ? {
            ...current,
            stickers: current.stickers.filter((item) => item.id !== stickerId),
          }
        : current,
    );
    try {
      return await repository.deleteBoardSticker(campaignId, stickerId);
    } catch (error) {
      if (previous) setCachedSticker(previous);
      throw error;
    }
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
    moveNote,
    deleteNote: (noteId: string) =>
      commit(() => repository.deleteNote(campaignId, noteId)),
    setNotePinned: (noteId: string, pinned: boolean) =>
      commit(() => repository.setNotePinned(campaignId, noteId, pinned)),
    moveNoteLayer: (noteId: string, direction: -1 | 1) =>
      commit(() => repository.moveNoteLayer(campaignId, noteId, direction)),
    uploadNotePhoto: (file: File) =>
      repository.uploadNotePhoto(campaignId, file),
    createBoardSticker,
    moveBoardSticker,
    deleteBoardSticker,
    createNoteLink,
    deleteNoteLink: (linkId: string) =>
      commit(() => repository.deleteNoteLink(campaignId, linkId)),
    updateNoteLinkLabel: (linkId: string, label: string | null) =>
      commit(() => repository.updateNoteLinkLabel(campaignId, linkId, label)),
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
