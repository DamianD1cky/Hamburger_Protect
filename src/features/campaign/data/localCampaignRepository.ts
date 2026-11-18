import { cloneDefaultBoard } from "../domain/defaults";
import { EVENT_CLOCK_LIMIT, legacyIndexClock, validateEventClock, type EventClock, type EventClockDraft } from "../domain/eventClock";
import type { CampaignRepository } from "../domain/repository";
import { defaultBoardAppearance, veilBoardAppearance, type BoardAppearance, type BoardAppearanceFiles } from "../domain/boardAppearance";
import { hasActiveCardEffect, normalizeCardVisualEffect, type CardVisualEffect } from "../domain/cardEffects";
import { defaultBoardStyleTokens, normalizeBoardStyleTokens, type BoardStyleTokens } from "../domain/boardStyleTokens";
import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "../domain/boardGeometry";
import { boardModules, type BoardModuleKey, type BoardModuleLayout } from "../domain/boardModules";
import {
  applyPanelBlockInteraction,
  normalizeCustomPanels,
  type BoardCustomPanel,
  type CustomPanelInteraction,
} from "../domain/customPanels";
import type {
  BlueprintReceipt,
  BoardUndoSnapshot,
  CompiledCommitPayload,
} from "../../harness/schema";
import {
  defaultCampaignClock,
  normalizeCampaignClock,
  type CampaignClockConfig,
} from "../domain/campaignClock";
import type {
  CampaignBoard,
  BoardActivity,
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
  ResourceStatus,
} from "../domain/types";
import { applySettingsPatch, assertSettingsExpected } from "../domain/settingsUpdate";
import { normalizeStickerRotation, stickerPosition } from "../domain/stickerGeometry";
import { eventClockRects } from "../domain/eventClockLayout";

const STORAGE_KEY = "veilboard-board-v2";
const PREVIOUS_STORAGE_KEY = "hamburger-protect-board-v2";
const LEGACY_STORAGE_KEY = "laojie-burger-board-v1";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uid(prefix: string) {
  return prefix + "-" + crypto.randomUUID();
}

function normalizeBoard(board: CampaignBoard): CampaignBoard {
  board.campaign.burgerIndex ??= 5;
  board.eventClocks ??= [legacyIndexClock(board.campaign.id, board.campaign.burgerIndex)];
  board.viewer.jobTitle ??= board.viewer.role === "gm" ? "主持人" : "调查员";
  board.checklistCategories ??= [];
  board.settings ??= {
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
    styleTokens: defaultBoardStyleTokens(),
    customPanels: [],
    boardTextureUrl: null,
    clock: defaultCampaignClock(),
  };
  board.settings.sectionColors ??= {};
  board.settings.resourceTitles ??= {};
  board.settings.moduleLayout ??= {};
  board.settings.appearance ??= defaultBoardAppearance(board.settings.backgroundPath);
  board.settings.styleTokens = normalizeBoardStyleTokens(board.settings.styleTokens);
  board.settings.customPanels = normalizeCustomPanels(board.settings.customPanels);
  board.settings.boardTextureUrl ??= null;
  board.settings.clock = normalizeCampaignClock(board.settings.clock);
  const clockRects = eventClockRects(board.eventClocks, board.settings.moduleLayout, board.settings.hiddenSections);
  board.eventClocks.forEach((clock) => {
    if (!clock.position) {
      const rect = clockRects.get(clock.id)!;
      clock.position = { x: rect.x, y: rect.y };
    }
  });
  board.noteLinks ??= [];
  board.stickers ??= [];
  board.stickers.forEach((sticker) => { sticker.scale ??= 1; });
  board.settings.isPublic ??= false;
  board.members ??= [
    {
      userId: board.viewer.id,
      role: board.viewer.role,
      characterName: board.viewer.displayName,
      jobTitle: board.viewer.jobTitle,
      profileText: "",
      active: board.campaign.status === "active",
      joinedAt: new Date().toISOString(),
      leftAt: null,
    },
  ];
  board.notes ??= [];
  board.activities ??= [];
  board.hasMoreActivity = board.activities.length > 30;
  board.members.forEach((member) => {
    member.profileText ??= "";
    member.leftAt ??= null;
  });
  board.checklist.forEach((item) => (item.categoryId ??= null));
  board.quests.forEach((quest) => (quest.claimedBy ??= null));
  board.notes.forEach((note) => {
    note.pinned ??= false;
    note.pinnedAt ??= null;
    note.pinColor ??= "red";
    note.scale =
      typeof note.scale === "number" && Number.isFinite(note.scale)
        ? Math.max(0.6, Math.min(2.2, Number(note.scale.toFixed(2))))
        : 1;
    note.effect = note.effect ? normalizeCardVisualEffect(note.effect) : null;
    note.authorName ??=
      board.members.find((member) => member.userId === note.authorId)
        ?.characterName ?? "未知成员";
  });
  [...board.notes]
    .sort((left, right) =>
      left.layer - right.layer ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
    )
    .forEach((note, index) => (note.layer = index + 1));
  return board;
}

function loadLegacyBoard(): CampaignBoard | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const legacy = JSON.parse(raw) as {
      inventory?: Record<string, ResourceStatus>;
      safety?: boolean[];
      tasks?: Array<Record<string, unknown>>;
      notes?: Array<Record<string, unknown>>;
    };
    const board = cloneDefaultBoard();
    board.eventClocks = [legacyIndexClock(board.campaign.id, board.campaign.burgerIndex)];

    board.resources = board.resources.map((resource) => ({
      ...resource,
      status: legacy.inventory?.[resource.id] ?? resource.status,
    }));
    board.checklist = board.checklist.map((item, index) => ({
      ...item,
      completed: legacy.safety?.[index] ?? item.completed,
    }));

    if (Array.isArray(legacy.tasks)) {
      board.quests = legacy.tasks.map((task) => ({
        id: String(task.id),
        title: String(task.title ?? "未命名任务"),
        body: String(task.body ?? ""),
        assigneeName: String(task.assignee ?? "待认领"),
        due: String(task.due ?? ""),
        status: task.status === "done" ? "completed" : "open",
        createdBy: board.viewer.id,
        claimedBy: null,
      }));
    }

    if (Array.isArray(legacy.notes)) {
      board.notes = legacy.notes.map((note) => ({
        id: String(note.id),
        title: String(note.title ?? "留言"),
        body: String(note.body ?? ""),
        color:
          note.color === "pink" ||
          note.color === "blue" ||
          note.color === "green"
            ? note.color
            : "yellow",
        x: Number(note.x ?? 1098),
        y: Number(note.y ?? 605),
        rotation: Number(note.rotation ?? 0),
        createdAt: String(note.createdAt ?? new Date().toISOString()),
        authorId: board.viewer.id,
        authorName: board.viewer.displayName,
        pinned: false,
        pinnedAt: null,
        layer: Number(note.layer ?? 0),
        imagePath: null,
        pinColor: "red",
      }));
    }

    return board;
  } catch {
    return null;
  }
}

// Match the server snapshots; no fabricated history is added to existing demo data.
function snapshots(board: CampaignBoard) {
  return [
    ...board.notes.map(
      ({ id, title, body, color, x, y, rotation, pinned }) => ({
        id,
        entity: "note",
        value: { title, body, color, x, y, rotation, pinned },
      }),
    ),
    ...board.quests.map(({ id, title, body, status, assigneeName, due }) => ({
      id,
      entity: "quest",
      value: { title, body, status, assignee_label: assigneeName, due_at: due },
    })),
    ...board.resources.map(({ id, name, quantity, status, group }) => ({
      id,
      entity: "resource",
      value: { name, quantity, status, group_index: group },
    })),
    ...board.checklist.map(({ id, label, completed, categoryId }) => ({
      id,
      entity: "checklist",
      value: { label, completed, category_id: categoryId },
    })),
    ...board.eventClocks.map(({ id, name, segments, progress, consequence, color, mode }) => ({
      id, entity: "event_clock", value: { name, segments, progress, consequence, color, mode },
    })),
    {
      id: board.campaign.id,
      entity: "campaign",
      value: {
        name: board.campaign.name,
        burger_index: board.campaign.burgerIndex,
        status: board.campaign.status,
      },
    },
    {
      id: board.campaign.id,
      entity: "settings",
      value: {
        section_titles: board.settings.sectionTitles,
        section_colors: board.settings.sectionColors,
        resource_titles: board.settings.resourceTitles,
        module_layout: board.settings.moduleLayout,
        hidden_sections: board.settings.hiddenSections,
      },
    },
  ];
}

function recordChanges(before: CampaignBoard, board: CampaignBoard) {
  const oldRows = snapshots(before);
  const newRows = snapshots(board);
  const keys = new Set(
    [...oldRows, ...newRows].map((row) => row.entity + ":" + row.id),
  );
  for (const key of keys) {
    const oldRow = oldRows.find((row) => row.entity + ":" + row.id === key);
    const newRow = newRows.find((row) => row.entity + ":" + row.id === key);
    if (JSON.stringify(oldRow?.value) === JSON.stringify(newRow?.value))
      continue;
    const target = (newRow ?? oldRow)!;
    const prev: Record<string, unknown> | null = oldRow?.value ?? null;
    const next: Record<string, unknown> | null = newRow?.value ?? null;
    let eventType =
      target.entity + (!prev ? "_created" : !next ? "_deleted" : "_updated");
    if (prev && next) {
      if (target.entity === "event_clock") {
        if (next.mode === "progress" && next.progress === next.segments && prev.progress !== prev.segments)
          eventType = "event_clock_completed";
        else if (next.mode === "progress" && prev.progress === prev.segments && next.progress !== next.segments)
          eventType = "event_clock_reopened";
        else if (prev.progress !== next.progress) eventType = "event_clock_progress_changed";
      }
      if (
        target.entity === "note" &&
        ["title", "body", "color"].every((f) => prev[f] === next[f])
      )
        eventType = "note_moved";
      if (target.entity === "quest" && prev.status !== next.status)
        eventType = "quest_status_changed";
      if (target.entity === "checklist" && prev.completed !== next.completed)
        eventType = "checklist_status_changed";
      if (
        target.entity === "campaign" &&
        prev.burger_index !== next.burger_index
      )
        eventType = "burger_index_changed";
    }
    if (target.entity === "event_clock" && !prev && next?.mode === "progress" && next.progress === next.segments)
      eventType = "event_clock_completed";
    const event: BoardActivity = {
      id: String(BigInt(board.activities[0]?.id ?? "0") + 1n),
      actorId: board.viewer.id,
      actorName: board.viewer.displayName,
      entityId: target.id,
      entityType: target.entity,
      eventType,
      payload: { before: prev, after: next },
      createdAt: new Date().toISOString(),
    };
    board.activities.unshift(event);
  }
}

class LocalCampaignRepository implements CampaignRepository {
  private read(): CampaignBoard {
    const saved =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (saved) {
      try {
        return normalizeBoard(JSON.parse(saved) as CampaignBoard);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    const initial = loadLegacyBoard() ?? cloneDefaultBoard();
    this.write(initial);
    return initial;
  }

  private write(board: CampaignBoard) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  }

  private mutate(update: (board: CampaignBoard) => void): CampaignBoard {
    const board = this.read();
    const before = clone(board);
    update(board);
    recordChanges(before, board);
    this.write(board);
    board.hasMoreActivity = board.activities.length > 30;
    const result = clone(board);
    result.activities = result.activities.slice(0, 30);
    return result;
  }

  async getBoard(_campaignId: string) {
    const board = clone(this.read());
    board.activities = board.activities.slice(0, 30);
    return board;
  }

  async getActivities(_campaignId: string, beforeId?: string) {
    const rows = this.read().activities.filter(
      (event) => !beforeId || BigInt(event.id) < BigInt(beforeId),
    );
    return { items: clone(rows.slice(0, 30)), hasMore: rows.length > 30 };
  }

  private manage(update: (board: CampaignBoard) => void) {
    return this.mutate((board) => {
      if (board.viewer.role !== "gm" || board.campaign.status !== "active") {
        throw new Error("仅房间 GM 可以修改");
      }
      update(board);
    });
  }

  private updateAsMember(update: (board: CampaignBoard) => void) {
    return this.mutate((board) => {
      if (
        board.viewer.role === "observer" ||
        board.campaign.status !== "active"
      ) {
        throw new Error("仅房间成员可以修改");
      }
      update(board);
    });
  }

  async saveResource(_campaignId: string, draft: ResourceDraft, id?: string) {
    return this.updateAsMember((board) => {
      const item = board.resources.find((entry) => entry.id === id);
      if (id && !item) throw new Error("物资已被移除，请刷新后重试");
      if (item) Object.assign(item, draft);
      else board.resources.push({ id: uid("resource"), ...draft });
    });
  }

  async deleteResource(_campaignId: string, id: string) {
    return this.updateAsMember((board) => {
      board.resources = board.resources.filter((item) => item.id !== id);
    });
  }

  async saveChecklistItem(
    _campaignId: string,
    draft: ChecklistDraft,
    id?: string,
  ) {
    return this.manage((board) => {
      const item = board.checklist.find((entry) => entry.id === id);
      if (id && !item) throw new Error("检查项已被移除，请刷新后重试");
      if (item) Object.assign(item, draft);
      else
        board.checklist.push({
          id: uid("check"),
          label: draft.label,
          categoryId: draft.categoryId,
          completed: false,
        });
    });
  }

  async deleteChecklistItem(_campaignId: string, id: string) {
    return this.manage((board) => {
      board.checklist = board.checklist.filter((item) => item.id !== id);
    });
  }
  async saveChecklistCategory(
    _campaignId: string,
    name: string,
    id?: string,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      const category = board.checklistCategories.find((item) => item.id === id);
      if (category) category.name = name;
      else board.checklistCategories.push({ id: uid("category"), name });
    });
  }

  async deleteChecklistCategory(
    _campaignId: string,
    id: string,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      board.checklistCategories = board.checklistCategories.filter(
        (item) => item.id !== id,
      );
      board.checklist.forEach((item) => {
        if (item.categoryId === id) item.categoryId = null;
      });
    });
  }

  async saveEventClock(_campaignId: string, draft: EventClockDraft, id?: string, revision?: number) {
    let saved!: EventClock;
    this.manage((board) => {
      const current = board.eventClocks.find((clock) => clock.id === id);
      if (id && !current) throw new Error("EVENT_CLOCK_NOT_FOUND");
      if (current && current.revision !== revision) throw new Error("EVENT_CLOCK_CONFLICT");
      if (!id && board.eventClocks.length >= EVENT_CLOCK_LIMIT) throw new Error("EVENT_CLOCK_LIMIT");
      saved = current ? { ...current, ...validateEventClock(draft, current), revision: current.revision + 1 } :
        { ...validateEventClock(draft), id: crypto.randomUUID(), mode: "progress", stages: null, revision: 1 };
      if (!current) {
        const rect = eventClockRects([...board.eventClocks, saved], board.settings.moduleLayout, board.settings.hiddenSections).get(saved.id)!;
        saved.position = { x: rect.x, y: rect.y };
      }
      board.eventClocks = current ? board.eventClocks.map((clock) => clock.id === id ? saved : clock) :
        [...board.eventClocks, saved];
    });
    return saved;
  }
  async setEventClockProgress(_campaignId: string, id: string, progress: number, revision: number) {
    let saved!: EventClock;
    this.manage((board) => {
      const current = board.eventClocks.find((clock) => clock.id === id);
      if (!current) throw new Error("EVENT_CLOCK_NOT_FOUND");
      if (current.revision !== revision) throw new Error("EVENT_CLOCK_CONFLICT");
      validateEventClock({ ...current, progress }, current);
      saved = { ...current, progress, revision: current.revision + (progress !== current.progress ? 1 : 0) };
      board.eventClocks = board.eventClocks.map((clock) => clock.id === id ? saved : clock);
    });
    return saved;
  }
  async deleteEventClock(_campaignId: string, id: string, revision: number) {
    this.manage((board) => {
      const current = board.eventClocks.find((clock) => clock.id === id);
      if (!current) throw new Error("EVENT_CLOCK_NOT_FOUND");
      if (current.revision !== revision) throw new Error("EVENT_CLOCK_CONFLICT");
      board.eventClocks = board.eventClocks.filter((clock) => clock.id !== id);
    });
    return id;
  }
  async moveEventClock(_campaignId: string, id: string, x: number, y: number, revision: number) {
    let saved!: EventClock;
    this.manage((board) => {
      const current = board.eventClocks.find((clock) => clock.id === id);
      if (!current) throw new Error("EVENT_CLOCK_NOT_FOUND");
      if (current.revision !== revision) throw new Error("EVENT_CLOCK_CONFLICT");
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 8 || x > 1796 || y < 8 || y > 977)
        throw new Error("INVALID_EVENT_CLOCK_POSITION");
      saved = { ...current, position: { x, y }, revision: current.revision + 1 };
      board.eventClocks = board.eventClocks.map((clock) => clock.id === id ? saved : clock);
    });
    return saved;
  }

  async toggleChecklist(_campaignId: string, itemId: string) {
    return this.updateAsMember((board) => {
      const item = board.checklist.find((candidate) => candidate.id === itemId);
      if (item) item.completed = !item.completed;
    });
  }

  async saveQuest(_campaignId: string, draft: QuestDraft, questId?: string) {
    return this.mutate((board) => {
      const quest = board.quests.find((item) => item.id === questId);
      if (quest) {
        Object.assign(quest, draft);
        return;
      }
      board.quests.unshift({
        id: uid("quest"),
        ...draft,
        status: "open",
        createdBy: board.viewer.id,
        claimedBy: null,
      });
    });
  }

  async transitionQuest(
    _campaignId: string,
    questId: string,
    status: QuestStatus,
  ) {
    return this.mutate((board) => {
      const quest = board.quests.find((item) => item.id === questId);
      if (quest) {
        quest.status = status;
        if (status === "claimed") {
          quest.claimedBy = board.viewer.id;
          quest.assigneeName = board.viewer.displayName;
        }
        if (status === "open") {
          quest.claimedBy = null;
          quest.assigneeName = "待认领";
        }
      }
    });
  }

  async deleteQuest(_campaignId: string, questId: string) {
    return this.mutate((board) => {
      board.quests = board.quests.filter((quest) => quest.id !== questId);
    });
  }

  async saveNote(_campaignId: string, draft: NoteDraft, noteId?: string) {
    return this.mutate((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      const normalizedScale =
        draft.scale !== undefined && Number.isFinite(draft.scale)
          ? Math.max(0.6, Math.min(2.2, Number(draft.scale.toFixed(2))))
          : undefined;
      const normalizedEffect =
        draft.effect !== undefined
          ? draft.effect
            ? normalizeCardVisualEffect(draft.effect)
            : null
          : undefined;
      if (note) {
        note.title = draft.title;
        note.body = draft.body;
        note.color = draft.color;
        note.pinColor = draft.pinColor;
        note.imagePath = draft.imagePath;
        if (draft.rotation !== undefined && Number.isFinite(draft.rotation)) {
          note.rotation = Math.max(-180, Math.min(180, draft.rotation));
        }
        if (normalizedScale !== undefined) note.scale = normalizedScale;
        if (normalizedEffect !== undefined) note.effect = normalizedEffect;
        return;
      }
      const count = board.notes.length;
      board.notes.push({
        id: uid("note"),
        title: draft.title,
        body: draft.body,
        color: draft.color,
        pinColor: draft.pinColor,
        imagePath: draft.imagePath,
        x: 1098 + (count % 2) * 36,
        y: 605 + (count % 3) * 168,
        rotation:
          draft.rotation !== undefined && Number.isFinite(draft.rotation)
            ? Math.max(-180, Math.min(180, draft.rotation))
            : [-2.4, 1.8, -0.8][count % 3],
        scale: normalizedScale ?? 1,
        effect: normalizedEffect ?? null,
        createdAt: new Date().toISOString(),
        authorId: board.viewer.id,
        authorName: board.viewer.displayName,
        pinned: false,
        pinnedAt: null,
        layer: Math.max(0, ...board.notes.map((item) => item.layer)) + 1,
      });
    });
  }

  async moveNote(_campaignId: string, noteId: string, x: number, y: number) {
    return this.mutate((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (note) Object.assign(note, { x, y });
    });
  }

  async resizeNote(_campaignId: string, noteId: string, scale: number) {
    return this.mutate((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (!note) throw new Error("便签不存在");
      note.scale = Math.max(0.6, Math.min(2.2, Number(scale.toFixed(2))));
    });
  }

  async createNoteLink(
    _campaignId: string,
    fromNoteId: string,
    toNoteId: string,
  ): Promise<BoardNoteLink> {
    let result: BoardNoteLink | undefined;
    this.manage((board) => {
      if (fromNoteId === toNoteId) return;
      const existing = board.noteLinks.find(
        (link) =>
          (link.fromNoteId === fromNoteId && link.toNoteId === toNoteId) ||
          (link.fromNoteId === toNoteId && link.toNoteId === fromNoteId),
      );
      if (existing) {
        result = { ...existing };
        return;
      }
      result = {
        id: uid("link"),
        fromNoteId,
        toNoteId,
        label: null,
      };
      board.noteLinks.push(result);
    });
    if (!result) throw new Error("无法创建便签连线");
    return result;
  }
  async updateNoteLinkLabel(
    _campaignId: string,
    linkId: string,
    label: string | null,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      const link = board.noteLinks.find((item) => item.id === linkId);
      if (!link) return;
      const trimmed = (label ?? "").trim();
      link.label = trimmed ? trimmed.slice(0, 24) : null;
    });
  }
  async deleteNoteLink(
    _campaignId: string,
    linkId: string,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      board.noteLinks = board.noteLinks.filter((link) => link.id !== linkId);
    });
  }
  async deleteNote(_campaignId: string, noteId: string) {
    return this.mutate((board) => {
      board.notes = board.notes.filter((note) => note.id !== noteId);
      // 便签没了，连着它的线也一起删（对应后端的 CASCADE）。
      board.noteLinks = board.noteLinks.filter(
        (link) =>
          link.fromNoteId !== noteId && link.toNoteId !== noteId,
      );
    });
  }

  async setNotePinned(
    _campaignId: string,
    noteId: string,
    pinned: boolean,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (!note) throw new Error("便签不存在");
      note.pinned = pinned;
      note.pinnedAt = pinned ? new Date().toISOString() : null;
    });
  }
  async uploadNotePhoto(_campaignId: string, file: File) {
    // 演示模式没有后端存储，直接用本地对象地址预览。
    return URL.createObjectURL(file);
  }
  async moveNoteLayer(
    _campaignId: string,
    noteId: string,
    direction: -1 | 1,
  ): Promise<CampaignBoard> {
    return this.updateAsMember((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (!note) throw new Error("便签不存在");
      if (board.viewer.role !== "gm" && note.authorId !== board.viewer.id) {
        throw new Error("只能调整自己的便签");
      }
      const ordered = [...board.notes].sort(
        (left, right) => left.layer - right.layer,
      );
      const index = ordered.findIndex((item) => item.id === noteId);
      const adjacent = ordered[index + direction];
      if (!adjacent) return;
      const layer = note.layer;
      note.layer = adjacent.layer;
      adjacent.layer = layer;
    });
  }

  async createBoardSticker(
    _campaignId: string,
    emoji: string,
    x: number,
    y: number,
    rotation: number,
  ): Promise<BoardSticker> {
    let created: BoardSticker | undefined;
    this.updateAsMember((board) => {
      created = {
        id: uid("sticker"),
        emoji,
        x: Math.max(0, Math.min(BOARD_WIDTH - STICKER_SIZE, x)),
        y: Math.max(0, Math.min(BOARD_HEIGHT - STICKER_SIZE, y)),
        rotation: Math.max(-20, Math.min(20, rotation)),
        scale: 1,
        createdBy: board.viewer.id,
      };
      board.stickers.push(created);
    });
    if (!created) throw new Error("贴纸创建失败");
    return created;
  }

  async moveBoardSticker(
    _campaignId: string,
    stickerId: string,
    x: number,
    y: number,
  ): Promise<BoardSticker> {
    let moved: BoardSticker | undefined;
    this.updateAsMember((board) => {
      const sticker = board.stickers.find((item) => item.id === stickerId);
      if (!sticker) throw new Error("贴纸不存在");
      Object.assign(sticker, stickerPosition(x, y, sticker.scale, sticker.rotation));
      moved = { ...sticker };
    });
    if (!moved) throw new Error("贴纸不存在");
    return moved;
  }

  async deleteBoardSticker(_campaignId: string, stickerId: string) {
    this.updateAsMember((board) => {
      board.stickers = board.stickers.filter((item) => item.id !== stickerId);
    });
    return stickerId;
  }

  async resizeBoardSticker(_campaignId: string, stickerId: string, scale: number): Promise<BoardSticker> {
    if (!Number.isFinite(scale) || scale < .5 || scale > 2.5) throw new Error("贴纸大小须为 50%–250%");
    let resized: BoardSticker | undefined;
    this.updateAsMember((board) => {
      const sticker = board.stickers.find((item) => item.id === stickerId);
      if (!sticker) throw new Error("贴纸不存在");
      sticker.scale = Math.round(scale * 100) / 100;
      Object.assign(sticker, stickerPosition(sticker.x, sticker.y, sticker.scale, sticker.rotation));
      resized = { ...sticker };
    });
    return resized!;
  }
  async rotateBoardSticker(_campaignId: string, stickerId: string, rotation: number): Promise<BoardSticker> {
    const angle = normalizeStickerRotation(rotation);
    let rotated!: BoardSticker;
    this.updateAsMember((board) => {
      const sticker = board.stickers.find((item) => item.id === stickerId);
      if (!sticker) throw new Error("贴纸不存在");
      Object.assign(sticker, { rotation: angle }, stickerPosition(sticker.x, sticker.y, sticker.scale, angle));
      rotated = { ...sticker };
    });
    return rotated;
  }

  async updateMemberProfile(_campaignId: string, draft: MemberProfileDraft) {
    return this.updateAsMember((board) => {
      const member = board.members.find(
        (item) => item.userId === board.viewer.id,
      );
      if (!member) throw new Error("成员不存在");
      member.characterName = draft.characterName;
      member.jobTitle = draft.jobTitle;
      member.profileText = draft.profileText;
      board.viewer.displayName = draft.characterName;
      board.viewer.jobTitle = draft.jobTitle;
    });
  }

  async removeMember(
    _campaignId: string,
    userId: string,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      const member = board.members.find((item) => item.userId === userId);
      if (!member || member.role !== "player") throw new Error("玩家不存在");
      member.active = false;
      member.leftAt = new Date().toISOString();
      board.quests.forEach((quest) => {
        if (
          quest.claimedBy === userId &&
          ["claimed", "in_progress", "failed"].includes(quest.status)
        ) {
          quest.status = "open";
          quest.claimedBy = null;
          quest.assigneeName = "待认领";
        }
      });
    });
  }

  async updateCampaignSettings(
    _campaignId: string,
    update: CampaignSettingsUpdate,
  ) {
    this.manage((board) => {
      assertSettingsExpected(board, update);
      Object.assign(board, applySettingsPatch(board, update.patch));
    });
    return clone(update.patch);
  }

  async moveBoardModule(
    _campaignId: string,
    key: BoardModuleKey,
    x: number,
    y: number,
  ): Promise<BoardModuleLayout> {
    const board = this.manage((current) => {
      const existing = current.settings.moduleLayout[key] ?? {};
      current.settings.moduleLayout = {
        ...current.settings.moduleLayout,
        [key]: { ...existing, x, y },
      };
    });
    return clone(board.settings.moduleLayout);
  }

  async resizeBoardModule(
    _campaignId: string,
    key: BoardModuleKey,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Promise<BoardModuleLayout> {
    const board = this.manage((current) => {
      const existing = current.settings.moduleLayout[key] ?? {};
      current.settings.moduleLayout = {
        ...current.settings.moduleLayout,
        [key]: { ...existing, x, y, w, h },
      };
    });
    return clone(board.settings.moduleLayout);
  }

  async setBoardModuleEffect(
    _campaignId: string,
    key: BoardModuleKey,
    effect: CardVisualEffect | null,
  ): Promise<BoardModuleLayout> {
    const board = this.manage((current) => {
      const base = boardModules[key].rect;
      const existing = current.settings.moduleLayout[key] ?? {
        x: base.x,
        y: base.y,
      };
      const normalized = effect ? normalizeCardVisualEffect(effect) : null;
      const nextEntry = { ...existing };
      if (normalized && hasActiveCardEffect(normalized)) {
        nextEntry.effect = normalized;
      } else {
        delete nextEntry.effect;
      }
      current.settings.moduleLayout = {
        ...current.settings.moduleLayout,
        [key]: nextEntry,
      };
    });
    return clone(board.settings.moduleLayout);
  }

  async saveBoardStyleTokens(
    _campaignId: string,
    tokens: BoardStyleTokens,
  ): Promise<BoardStyleTokens> {
    const normalized = normalizeBoardStyleTokens(tokens);
    this.manage((current) => {
      current.settings.styleTokens = normalized;
    });
    return clone(normalized);
  }

  async saveCustomPanels(
    _campaignId: string,
    panels: BoardCustomPanel[],
  ): Promise<BoardCustomPanel[]> {
    const normalized = normalizeCustomPanels(panels);
    this.manage((current) => {
      current.settings.customPanels = normalized;
    });
    return clone(normalized);
  }

  async interactCustomPanel(
    _campaignId: string,
    panelId: string,
    blockId: string,
    interaction: CustomPanelInteraction,
  ): Promise<BoardCustomPanel[]> {
    const board = this.updateAsMember((current) => {
      const target = current.settings.customPanels.find((p) => p.id === panelId);
      if (!target) throw new Error("展板不存在，请刷新后重试");
      if (target.interactiveFor === "gm" && current.viewer.role !== "gm") {
        throw new Error("此展板仅限 GM 操作");
      }
      current.settings.customPanels = current.settings.customPanels.map((p) =>
        p.id === panelId ? applyPanelBlockInteraction(p, blockId, interaction) : p,
      );
    });
    return clone(board.settings.customPanels);
  }

  async applyBoardBlueprint(
    _campaignId: string,
    payload: CompiledCommitPayload,
  ): Promise<{ board: CampaignBoard; receipt: BlueprintReceipt }> {
    const receipt: BlueprintReceipt = {
      createdNoteIds: [],
      createdLinkIds: [],
      createdQuestIds: [],
      createdResourceIds: [],
      createdClockIds: [],
      createdChecklistIds: [],
    };
    const board = this.manage((current) => {
      if (payload.campaignName) {
        current.campaign.name = payload.campaignName;
      }
      current.settings.appearance = clone(payload.appearance);
      current.settings.backgroundPath = payload.appearance.room.imagePath;
      current.settings.styleTokens = normalizeBoardStyleTokens(payload.styleTokens);
      current.settings.sectionTitles = clone(payload.sectionTitles);
      current.settings.sectionColors = clone(payload.sectionColors);
      current.settings.resourceTitles = clone(payload.resourceTitles);
      current.settings.hiddenSections = clone(payload.hiddenSections);
      current.settings.moduleLayout = clone(payload.moduleLayout);
      current.settings.customPanels = normalizeCustomPanels(payload.customPanels);
      if (payload.clock) {
        current.settings.clock = normalizeCampaignClock(payload.clock);
      }

      const refMap = new Map<string, string>();
      const maxLayer = current.notes.reduce((m, n) => Math.max(m, n.layer), 0);
      const nowIso = new Date().toISOString();
      if (payload.noteUpdates && payload.noteUpdates.length > 0) {
        receipt.updatedNotesBefore = [];
        for (const patch of payload.noteUpdates) {
          const target = current.notes.find((n) => n.id === patch.id);
          if (!target) continue;
          receipt.updatedNotesBefore.push({
            id: target.id,
            color: target.color,
            pinColor: target.pinColor,
            rotation: target.rotation,
            scale: target.scale ?? 1,
            effect: target.effect ? clone(target.effect) : null,
          });
          if (patch.color !== undefined) target.color = patch.color;
          if (patch.pinColor !== undefined) target.pinColor = patch.pinColor;
          if (patch.rotation !== undefined) target.rotation = patch.rotation;
          if (patch.scale !== undefined) target.scale = patch.scale;
          if (patch.effect !== undefined) {
            target.effect = patch.effect
              ? normalizeCardVisualEffect(patch.effect)
              : null;
          }
        }
      }
      payload.notes.forEach((n, idx) => {
        const id = uid("note");
        receipt.createdNoteIds.push(id);
        if (n.refId) refMap.set(n.refId, id);
        current.notes.push({
          id,
          title: n.title,
          body: n.body,
          color: n.color,
          pinColor: n.pinColor,
          x: n.x,
          y: n.y,
          rotation: n.rotation,
          scale: n.scale ?? 1,
          effect: n.effect ? normalizeCardVisualEffect(n.effect) : null,
          createdAt: nowIso,
          authorId: current.viewer.id,
          authorName: current.viewer.displayName,
          pinned: n.pinned,
          pinnedAt: n.pinned ? nowIso : null,
          layer: maxLayer + idx + 1,
          imagePath: null,
        });
      });

      payload.noteLinks.forEach((l) => {
        const fromId = refMap.get(l.from) ?? l.from;
        const toId = refMap.get(l.to) ?? l.to;
        if (
          fromId !== toId &&
          current.notes.some((n) => n.id === fromId) &&
          current.notes.some((n) => n.id === toId)
        ) {
          const id = uid("link");
          receipt.createdLinkIds.push(id);
          current.noteLinks.push({
            id,
            fromNoteId: fromId,
            toNoteId: toId,
            label: l.label,
          });
        }
      });

      payload.quests.forEach((q) => {
        const id = uid("quest");
        receipt.createdQuestIds.push(id);
        current.quests.push({
          id,
          title: q.title,
          body: q.body,
          assigneeName: q.assigneeName || "待认领",
          due: q.due,
          status: "open",
          createdBy: current.viewer.id,
          claimedBy: null,
        });
      });

      payload.resources.forEach((r) => {
        const id = uid("resource");
        receipt.createdResourceIds.push(id);
        current.resources.push({
          id,
          group: r.group,
          name: r.name,
          quantity: r.quantity,
          status: r.status,
        });
      });

      payload.eventClocks.forEach((c) => {
        if (current.eventClocks.length >= EVENT_CLOCK_LIMIT) return;
        const id = uid("clock");
        receipt.createdClockIds.push(id);
        current.eventClocks.push({
          id,
          ...validateEventClock(c),
          mode: "progress",
          stages: null,
          revision: 1,
        });
      });

      payload.checklist.forEach((item) => {
        let categoryId: string | null = null;
        if (item.categoryName) {
          let cat = current.checklistCategories.find((c) => c.name === item.categoryName);
          if (!cat) {
            cat = { id: uid("cat"), name: item.categoryName };
            current.checklistCategories.push(cat);
          }
          categoryId = cat.id;
        }
        const id = uid("chk");
        receipt.createdChecklistIds.push(id);
        current.checklist.push({
          id,
          label: item.label,
          completed: false,
          categoryId,
        });
      });
    });
    return { board, receipt };
  }

  async rollbackBoardBlueprint(
    _campaignId: string,
    snapshot: BoardUndoSnapshot,
  ): Promise<CampaignBoard> {
    return this.manage((current) => {
      const dropLinks = new Set(snapshot.createdLinkIds);
      const dropNotes = new Set(snapshot.createdNoteIds);
      const dropQuests = new Set(snapshot.createdQuestIds);
      const dropRes = new Set(snapshot.createdResourceIds);
      const dropClocks = new Set(snapshot.createdClockIds);
      const dropChk = new Set(snapshot.createdChecklistIds);

      current.noteLinks = current.noteLinks.filter(
        (l) => !dropLinks.has(l.id) && !dropNotes.has(l.fromNoteId) && !dropNotes.has(l.toNoteId),
      );
      current.notes = current.notes.filter((n) => !dropNotes.has(n.id));
      if (snapshot.updatedNotesBefore) {
        for (const prevNote of snapshot.updatedNotesBefore) {
          const target = current.notes.find((n) => n.id === prevNote.id);
          if (!target) continue;
          target.color = prevNote.color;
          target.pinColor = prevNote.pinColor;
          target.rotation = prevNote.rotation;
          target.scale = prevNote.scale;
          target.effect = prevNote.effect ? clone(prevNote.effect) : null;
        }
      }
      current.quests = current.quests.filter((q) => !dropQuests.has(q.id));
      current.resources = current.resources.filter((r) => !dropRes.has(r.id));
      current.eventClocks = current.eventClocks.filter((c) => !dropClocks.has(c.id));
      current.checklist = current.checklist.filter((c) => !dropChk.has(c.id));

      const s = snapshot.settings;
      if (s.campaignName) current.campaign.name = s.campaignName;
      current.settings.appearance = clone(s.appearance);
      current.settings.backgroundPath = s.appearance.room.imagePath;
      current.settings.styleTokens = normalizeBoardStyleTokens(s.styleTokens);
      current.settings.sectionTitles = clone(s.sectionTitles);
      current.settings.sectionColors = clone(s.sectionColors);
      current.settings.resourceTitles = clone(s.resourceTitles);
      current.settings.hiddenSections = clone(s.hiddenSections);
      current.settings.moduleLayout = clone(s.moduleLayout);
      current.settings.customPanels = normalizeCustomPanels(s.customPanels);
      if (s.clock) current.settings.clock = normalizeCampaignClock(s.clock);
    });
  }

  async saveCampaignClock(
    _campaignId: string,
    config: CampaignClockConfig,
  ) {
    const saved = normalizeCampaignClock({
      ...config,
      referenceAt: new Date().toISOString(),
    });
    this.manage((board) => {
      board.settings.clock = saved;
    });
    return clone(saved);
  }

  async setCampaignPublic(
    _campaignId: string,
    isPublic: boolean,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      board.settings.isPublic = isPublic;
    });
  }

  async saveBoardAppearance(
    _campaignId: string,
    appearance: BoardAppearance,
    files: BoardAppearanceFiles,
    expected: BoardAppearance,
  ) {
    if (Object.keys(files).length) throw new Error("演示模式不保存自定义图片");
    return this.manage((board) => {
      if (JSON.stringify(board.settings.appearance) !== JSON.stringify(expected))
        throw new Error("其他 GM 已修改外观，请重新打开后再调整。");
      board.settings.appearance = clone(appearance);
      board.settings.backgroundPath = appearance.room.imagePath;
      board.settings.backgroundUrl = null;
    });
  }

  async uploadCampaignMedia(
    _campaignId: string,
    _kind: CampaignMediaKind,
    _file: File,
  ): Promise<CampaignBoard> {
    throw new Error("演示模式不保存自定义图片");
  }

  async clearCampaignMedia(
    _campaignId: string,
    kind: CampaignMediaKind,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      if (kind === "background") {
        board.settings.backgroundPath = null;
        board.settings.backgroundUrl = null;
      } else {
        board.settings.noteTexturePath = null;
        board.settings.noteTextureUrl = null;
      }
    });
  }
}

export const localCampaignRepository = new LocalCampaignRepository();
