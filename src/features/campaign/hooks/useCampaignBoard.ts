import { useRef } from "react";
import type { BoardAppearance, BoardAppearanceFiles } from "../domain/boardAppearance";
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
  CampaignSettingsUpdate,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "../domain/types";
import type {
  BoardModuleKey,
  BoardModuleLayout,
  BoardModuleLayoutEntry,
} from "../domain/boardModules";
import type { CardVisualEffect } from "../domain/cardEffects";
import type { BoardStyleTokens } from "../domain/boardStyleTokens";
import type { CampaignClockConfig } from "../domain/campaignClock";
import {
  applyPanelBlockInteraction,
  type BoardCustomPanel,
  type CustomPanelInteraction,
} from "../domain/customPanels";
import { validateEventClock, type EventClock, type EventClockDraft } from "../domain/eventClock";
import { applySettingsPatch } from "../domain/settingsUpdate";
import { normalizeStickerRotation, stickerPosition } from "../domain/stickerGeometry";
import type {
  BoardUndoSnapshot,
  CompiledCommitPayload,
} from "../../harness/schema";

type PendingNoteMove = { revision: number; x: number; y: number };
type PendingModuleMove = {
  revision: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
};
type PendingSticker = { revision: number; sticker: BoardSticker };
type PendingClockSave = {
  revision: number;
  config: CampaignClockConfig;
};
type EventClockWrite = { clock: EventClock | null; pending: boolean };

function withPendingPositions(
  board: CampaignBoard,
  pendingNotes: Map<string, PendingNoteMove>,
  pendingModules: Map<BoardModuleKey, PendingModuleMove>,
  pendingClock: PendingClockSave | null,
  pendingStickers: Map<string, PendingSticker>,
  eventClockWrites: Map<string, EventClockWrite>,
) {
  if (!pendingNotes.size && !pendingModules.size && !pendingClock && !pendingStickers.size && !eventClockWrites.size) {
    return board;
  }
  const moduleLayout = { ...board.settings.moduleLayout };
  pendingModules.forEach(({ x, y, w, h }, key) => {
    const prev = moduleLayout[key] ?? {};
    moduleLayout[key] = {
      ...prev,
      x,
      y,
      ...(w !== undefined ? { w } : {}),
      ...(h !== undefined ? { h } : {}),
    };
  });
  return {
    ...board,
    eventClocks: [...board.eventClocks.filter((clock) => eventClockWrites.get(clock.id)?.clock !== null)
      .map((clock) => {
        const entry = eventClockWrites.get(clock.id);
        const override = entry?.clock;
        return override && (entry.pending || override.revision >= clock.revision) ? override : clock;
      }), ...[...eventClockWrites.values()].flatMap(({ clock }) =>
        clock && !board.eventClocks.some((existing) => existing.id === clock.id) ? [clock] : [])],
    stickers: board.stickers.map((sticker) => pendingStickers.get(sticker.id)?.sticker ?? sticker),
    notes: board.notes.map((note) => {
      const pending = pendingNotes.get(note.id);
      return pending ? { ...note, x: pending.x, y: pending.y } : note;
    }),
    settings:
      pendingModules.size || pendingClock
        ? {
            ...board.settings,
            moduleLayout,
            clock: pendingClock?.config ?? board.settings.clock,
          }
        : board.settings,
  };
}

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
  const noteMoveRevisions = useRef(new Map<string, PendingNoteMove>());
  const moduleMoveRevisions = useRef(
    new Map<BoardModuleKey, PendingModuleMove>(),
  );
  const pendingClockSave = useRef<PendingClockSave | null>(null);
  const pendingStickers = useRef(new Map<string, PendingSticker>());
  const stickerWrites = useRef(new Map<string, Promise<unknown>>());
  const stickerRevision = useRef(0);
  const eventClockWrites = useRef(new Map<string, EventClockWrite>());
  const eventClockScope = useRef(requestedCampaignId);
  if (eventClockScope.current !== requestedCampaignId) {
    eventClockWrites.current.clear(); eventClockScope.current = requestedCampaignId;
  }
  const options = campaignBoardQueryOptions(requestedCampaignId, publicView);
  const boardKey = options.queryKey;
  const query = useQuery({
    ...options,
    queryFn: async () => {
      const next = await options.queryFn();
      // A fresh board read confirms successful writes and can then reflect
      // another GM's deletion. Pending writes remain protected.
      eventClockWrites.current.forEach((entry, id) => {
        const saved = next.eventClocks.find((clock) => clock.id === id);
        if (!entry.pending && (!saved || (entry.clock && saved.revision >= entry.clock.revision)))
          eventClockWrites.current.delete(id);
      });
      return next;
    },
    select: (data) =>
      withPendingPositions(
        data,
        noteMoveRevisions.current,
        moduleMoveRevisions.current,
        pendingClockSave.current,
        pendingStickers.current,
        eventClockWrites.current,
      ),
    placeholderData: cloudEnabled ? undefined : cloneDefaultBoard,
    refetchInterval: cloudEnabled ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const board = query.data;
  const campaignId = board?.campaign.id ?? requestedCampaignId;

  const mergePendingPositions = (next: CampaignBoard) => {
    return withPendingPositions(
      next,
      noteMoveRevisions.current,
      moduleMoveRevisions.current,
      pendingClockSave.current,
      pendingStickers.current,
      eventClockWrites.current,
    );
  };

  const commit = async (operation: () => Promise<CampaignBoard>) => {
    const next = await operation();
    if (cloudEnabled && getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId)
      throw new Error("登录账号已变更，请重新进入战役。");
    queryClient.setQueryData(boardKey, mergePendingPositions(next));
    return next;
  };
  const writeEventClock = async (id: string, optimistic: EventClock | null,
    save: () => Promise<EventClock | string>) => {
    if (eventClockWrites.current.get(id)?.pending) throw new Error("这个事件钟正在保存，请稍后重试。");
    const previous = queryClient.getQueryData<CampaignBoard>(boardKey)?.eventClocks.find((clock) => clock.id === id);
    const entry: EventClockWrite = { clock: optimistic, pending: true };
    eventClockWrites.current.set(id, entry);
    const refresh = () => queryClient.setQueryData<CampaignBoard>(boardKey,
      (current) => current ? mergePendingPositions({ ...current }) : current);
    await queryClient.cancelQueries({ queryKey: boardKey }); refresh();
    try {
      const result = await save();
      if (cloudEnabled && getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId)
        throw new Error("登录账号已变更，请重新进入战役。");
      await queryClient.cancelQueries({ queryKey: boardKey });
      entry.clock = typeof result === "string" ? null : result;
      entry.pending = false;
      refresh();
      void queryClient.invalidateQueries({ queryKey: boardKey });
      return result;
    } catch (error) {
      // Restore the snapshot even if the optimistic version already carries
      // a larger revision. A subsequent read supplies any newer GM update.
      entry.clock = previous ?? null; entry.pending = true;
      refresh();
      eventClockWrites.current.delete(id);
      void queryClient.invalidateQueries({ queryKey: boardKey });
      throw error;
    }
  };
  const saveEventClock = async (draft: EventClockDraft, id?: string, revision?: number) => {
    const current = queryClient.getQueryData<CampaignBoard>(boardKey)?.eventClocks.find((clock) => clock.id === id);
    const validated = validateEventClock(draft, current);
    if (id) return await writeEventClock(id, current ? { ...current, ...validated, revision: current.revision + 1 } : null,
      () => repository.saveEventClock(campaignId, validated, id, revision)) as EventClock;
    const saved = await repository.saveEventClock(campaignId, validated);
    if (cloudEnabled && getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId)
      throw new Error("登录账号已变更，请重新进入战役。");
    await queryClient.cancelQueries({ queryKey: boardKey });
    eventClockWrites.current.set(saved.id, { clock: saved, pending: false });
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) => current ? mergePendingPositions({ ...current }) : current);
    void queryClient.invalidateQueries({ queryKey: boardKey });
    return saved;
  };
  const setEventClockProgress = async (id: string, progress: number, revision: number) => {
    const current = queryClient.getQueryData<CampaignBoard>(boardKey)?.eventClocks.find((clock) => clock.id === id);
    if (!current) throw new Error("EVENT_CLOCK_NOT_FOUND");
    validateEventClock({ ...current, progress }, current);
    return await writeEventClock(id, { ...current, progress, revision: current.revision + 1 },
      () => repository.setEventClockProgress(campaignId, id, progress, revision)) as EventClock;
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

  const setCachedModulePosition = (
    key: BoardModuleKey,
    position: BoardModuleLayoutEntry | null,
  ) => {
    queryClient.setQueryData<CampaignBoard>(boardKey, (current) => {
      if (!current) return current;
      const moduleLayout: BoardModuleLayout = {
        ...current.settings.moduleLayout,
      };
      if (position) moduleLayout[key] = position;
      else delete moduleLayout[key];
      return {
        ...current,
        settings: { ...current.settings, moduleLayout },
      };
    });
  };

  const moveBoardModule = async (
    key: BoardModuleKey,
    x: number,
    y: number,
  ) => {
    const revision =
      (moduleMoveRevisions.current.get(key)?.revision ?? 0) + 1;
    const previous =
      queryClient.getQueryData<CampaignBoard>(boardKey)?.settings
        .moduleLayout[key] ?? null;
    const nextEntry: BoardModuleLayoutEntry = { ...(previous ?? {}), x, y };
    moduleMoveRevisions.current.set(key, { revision, ...nextEntry });
    await queryClient.cancelQueries({ queryKey: boardKey });
    if (moduleMoveRevisions.current.get(key)?.revision === revision) {
      setCachedModulePosition(key, nextEntry);
    }
    try {
      const saved = await repository.moveBoardModule(
        campaignId,
        key,
        x,
        y,
      );
      if (
        cloudEnabled &&
        getSupabaseAppSession()?.user.authUserId !==
          session?.user.authUserId
      ) {
        throw new Error("登录账号已变更，请重新进入战役。");
      }
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        setCachedModulePosition(key, saved[key] ?? nextEntry);
      }
      return saved;
    } catch (error) {
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        setCachedModulePosition(key, previous);
      }
      throw error;
    } finally {
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        moduleMoveRevisions.current.delete(key);
      }
    }
  };

  const resizeBoardModule = async (
    key: BoardModuleKey,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const revision =
      (moduleMoveRevisions.current.get(key)?.revision ?? 0) + 1;
    const previous =
      queryClient.getQueryData<CampaignBoard>(boardKey)?.settings
        .moduleLayout[key] ?? null;
    const nextEntry: BoardModuleLayoutEntry = {
      ...(previous ?? {}),
      x,
      y,
      w,
      h,
    };
    moduleMoveRevisions.current.set(key, { revision, ...nextEntry });
    await queryClient.cancelQueries({ queryKey: boardKey });
    if (moduleMoveRevisions.current.get(key)?.revision === revision) {
      setCachedModulePosition(key, nextEntry);
    }
    try {
      const saved = await repository.resizeBoardModule(
        campaignId,
        key,
        x,
        y,
        w,
        h,
      );
      if (
        cloudEnabled &&
        getSupabaseAppSession()?.user.authUserId !==
          session?.user.authUserId
      ) {
        throw new Error("登录账号已变更，请重新进入战役。");
      }
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        setCachedModulePosition(key, saved[key] ?? nextEntry);
      }
      return saved;
    } catch (error) {
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        setCachedModulePosition(key, previous);
      }
      throw error;
    } finally {
      if (moduleMoveRevisions.current.get(key)?.revision === revision) {
        moduleMoveRevisions.current.delete(key);
      }
    }
  };

  const moveNote = async (noteId: string, x: number, y: number) => {
    const revision =
      (noteMoveRevisions.current.get(noteId)?.revision ?? 0) + 1;
    noteMoveRevisions.current.set(noteId, { revision, x, y });
    const previous = queryClient
      .getQueryData<CampaignBoard>(boardKey)
      ?.notes.find((note) => note.id === noteId);

    await queryClient.cancelQueries({ queryKey: boardKey });
    if (noteMoveRevisions.current.get(noteId)?.revision === revision) {
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
      if (noteMoveRevisions.current.get(noteId)?.revision === revision) {
        setCachedNotePosition(noteId, x, y);
      }
      return next;
    } catch (error) {
      if (
        previous &&
        noteMoveRevisions.current.get(noteId)?.revision === revision
      ) {
        setCachedNotePosition(noteId, previous.x, previous.y);
      }
      throw error;
    } finally {
      if (noteMoveRevisions.current.get(noteId)?.revision === revision) {
        noteMoveRevisions.current.delete(noteId);
      }
    }
  };

  const saveCampaignClock = async (config: CampaignClockConfig) => {
    const revision = (pendingClockSave.current?.revision ?? 0) + 1;
    const previous =
      queryClient.getQueryData<CampaignBoard>(boardKey)?.settings.clock;
    pendingClockSave.current = { revision, config };
    await queryClient.cancelQueries({ queryKey: boardKey });
    const setCachedClock = (clock: CampaignClockConfig) => {
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current
          ? {
              ...current,
              settings: { ...current.settings, clock },
            }
          : current,
      );
    };
    setCachedClock(config);
    try {
      const saved = await repository.saveCampaignClock(
        campaignId,
        config,
      );
      await queryClient.cancelQueries({ queryKey: boardKey });
      if (
        cloudEnabled &&
        getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId
      ) {
        throw new Error("登录账号已变更，请重新进入战役。");
      }
      if (pendingClockSave.current?.revision === revision) {
        pendingClockSave.current = { revision, config: saved };
        setCachedClock(saved);
      }
      return saved;
    } catch (error) {
      await queryClient.cancelQueries({ queryKey: boardKey });
      if (pendingClockSave.current?.revision === revision && previous) {
        setCachedClock(previous);
      }
      throw error;
    } finally {
      if (pendingClockSave.current?.revision === revision) {
        pendingClockSave.current = null;
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

  const updateSticker = async (stickerId: string, change: (sticker: BoardSticker) => BoardSticker,
    save: () => Promise<BoardSticker>) => {
    const previous = queryClient
      .getQueryData<CampaignBoard>(boardKey)
      ?.stickers.find((item) => item.id === stickerId);
    const revision = ++stickerRevision.current;
    if (previous) {
      const sticker = change(previous);
      pendingStickers.current.set(stickerId, { revision, sticker });
      setCachedSticker(sticker);
    }
    const write = (stickerWrites.current.get(stickerId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      return save();
    });
    stickerWrites.current.set(stickerId, write);
    try {
      const updated = await write;
      await queryClient.cancelQueries({ queryKey: boardKey });
      if (pendingStickers.current.get(stickerId)?.revision === revision) {
        pendingStickers.current.delete(stickerId);
        setCachedSticker(updated);
      }
      return updated;
    } catch (error) {
      if (pendingStickers.current.get(stickerId)?.revision === revision) {
        pendingStickers.current.delete(stickerId);
        if (previous) setCachedSticker(previous);
      }
      throw error;
    } finally {
      if (stickerWrites.current.get(stickerId) === write) stickerWrites.current.delete(stickerId);
    }
  };
  const moveBoardSticker = (stickerId: string, x: number, y: number) =>
    updateSticker(stickerId, (sticker) => ({ ...sticker, x, y }),
      () => repository.moveBoardSticker(campaignId, stickerId, x, y));
  const resizeBoardSticker = (stickerId: string, scale: number) =>
    updateSticker(stickerId, (sticker) => ({
      ...sticker, scale,
      ...stickerPosition(sticker.x, sticker.y, scale, sticker.rotation),
    }), () => repository.resizeBoardSticker(campaignId, stickerId, scale));
  const rotateBoardSticker = (stickerId: string, rotation: number) => {
    const angle = normalizeStickerRotation(rotation);
    return updateSticker(stickerId, (sticker) => ({
      ...sticker, rotation: angle, ...stickerPosition(sticker.x, sticker.y, sticker.scale, angle),
    }), () => repository.rotateBoardSticker(campaignId, stickerId, angle));
  };

  const deleteBoardSticker = async (stickerId: string) => {
    await stickerWrites.current.get(stickerId)?.catch(() => {});
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
    saveEventClock,
    setEventClockProgress,
    moveEventClock: (id: string, x: number, y: number, revision: number) => {
      const current = board?.eventClocks.find((clock) => clock.id === id);
      if (!current) return Promise.reject(new Error("EVENT_CLOCK_NOT_FOUND"));
      return writeEventClock(id, { ...current, position: { x, y } },
        () => repository.moveEventClock(campaignId, id, x, y, revision));
    },
    deleteEventClock: (id: string, revision: number) =>
      writeEventClock(id, null, () => repository.deleteEventClock(campaignId, id, revision)),
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
    resizeNote: (noteId: string, scale: number) =>
      commit(() => repository.resizeNote(campaignId, noteId, scale)),
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
    resizeBoardSticker,
    rotateBoardSticker,
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
    updateCampaignSettings: async (update: CampaignSettingsUpdate) => {
      if (!Object.keys(update.patch).length) return {};
      const saved = await repository.updateCampaignSettings(campaignId, update);
      if (cloudEnabled && getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId)
        throw new Error("登录账号已变更，请重新进入战役。");
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current ? mergePendingPositions(applySettingsPatch(current, saved)) : current);
      if (Object.keys(saved).length) void queryClient.invalidateQueries({ queryKey: boardKey });
      return saved;
    },
    moveBoardModule,
    resizeBoardModule,
    setBoardModuleEffect: async (
      key: BoardModuleKey,
      effect: CardVisualEffect | null,
    ) => {
      const saved = await repository.setBoardModuleEffect(
        campaignId,
        key,
        effect,
      );
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current
          ? mergePendingPositions({
              ...current,
              settings: { ...current.settings, moduleLayout: saved },
            })
          : current,
      );
      return saved;
    },
    saveBoardStyleTokens: async (tokens: BoardStyleTokens) => {
      const saved = await repository.saveBoardStyleTokens(campaignId, tokens);
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current
          ? mergePendingPositions({
              ...current,
              settings: { ...current.settings, styleTokens: saved },
            })
          : current,
      );
      return saved;
    },
    saveCustomPanels: async (panels: BoardCustomPanel[]) => {
      const saved = await repository.saveCustomPanels(campaignId, panels);
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current
          ? mergePendingPositions({
              ...current,
              settings: { ...current.settings, customPanels: saved },
            })
          : current,
      );
      return saved;
    },
    interactCustomPanel: async (
      panelId: string,
      blockId: string,
      interaction: CustomPanelInteraction,
    ) => {
      const previous = queryClient.getQueryData<CampaignBoard>(boardKey)
        ?.settings.customPanels;
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
        current
          ? mergePendingPositions({
              ...current,
              settings: {
                ...current.settings,
                customPanels: current.settings.customPanels.map((p) =>
                  p.id === panelId
                    ? applyPanelBlockInteraction(p, blockId, interaction)
                    : p,
                ),
              },
            })
          : current,
      );
      try {
        const saved = await repository.interactCustomPanel(
          campaignId,
          panelId,
          blockId,
          interaction,
        );
        queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
          current
            ? mergePendingPositions({
                ...current,
                settings: { ...current.settings, customPanels: saved },
              })
            : current,
        );
        return saved;
      } catch (error) {
        if (previous) {
          queryClient.setQueryData<CampaignBoard>(boardKey, (current) =>
            current
              ? mergePendingPositions({
                  ...current,
                  settings: { ...current.settings, customPanels: previous },
                })
              : current,
          );
        }
        throw error;
      }
    },
    applyBoardBlueprint: async (payload: CompiledCommitPayload) => {
      const { board: next, receipt } = await repository.applyBoardBlueprint(
        campaignId,
        payload,
      );
      if (
        cloudEnabled &&
        getSupabaseAppSession()?.user.authUserId !== session?.user.authUserId
      ) {
        throw new Error("登录账号已变更，请重新进入战役。");
      }
      await queryClient.cancelQueries({ queryKey: boardKey });
      queryClient.setQueryData(boardKey, mergePendingPositions(next));
      return { board: next, receipt };
    },
    rollbackBoardBlueprint: (snapshot: BoardUndoSnapshot) =>
      commit(() => repository.rollbackBoardBlueprint(campaignId, snapshot)),
    saveCampaignClock,
    saveBoardAppearance: (appearance: BoardAppearance, files: BoardAppearanceFiles, expected: BoardAppearance) =>
      commit(() => repository.saveBoardAppearance(campaignId, appearance, files, expected)),
    setCampaignPublic: (isPublic: boolean) =>
      commit(() => repository.setCampaignPublic(campaignId, isPublic)),
    uploadCampaignMedia: (kind: CampaignMediaKind, file: File) =>
      commit(() => repository.uploadCampaignMedia(campaignId, kind, file)),
    clearCampaignMedia: (kind: CampaignMediaKind) =>
      commit(() => repository.clearCampaignMedia(campaignId, kind)),
  };
}
