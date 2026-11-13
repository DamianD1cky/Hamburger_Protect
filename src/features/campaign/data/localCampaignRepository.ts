import { cloneDefaultBoard } from "../domain/defaults";
import type { CampaignRepository } from "../domain/repository";
import { defaultBoardAppearance, type BoardAppearance, type BoardAppearanceFiles } from "../domain/boardAppearance";
import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "../domain/boardGeometry";
import type { BoardModuleKey, BoardModuleLayout } from "../domain/boardModules";
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
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
  ResourceStatus,
} from "../domain/types";

const STORAGE_KEY = "hamburger-protect-board-v2";
const LEGACY_STORAGE_KEY = "laojie-burger-board-v1";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uid(prefix: string) {
  return prefix + "-" + crypto.randomUUID();
}

function normalizeBoard(board: CampaignBoard): CampaignBoard {
  board.campaign.burgerIndex ??= 5;
  board.viewer.jobTitle ??= board.viewer.role === "gm" ? "店长" : "服务员";
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
    appearance: defaultBoardAppearance(),
    boardTextureUrl: null,
    clock: defaultCampaignClock(),
  };
  board.settings.sectionColors ??= {};
  board.settings.resourceTitles ??= {};
  board.settings.moduleLayout ??= {};
  board.settings.appearance ??= defaultBoardAppearance(board.settings.backgroundPath);
  board.settings.boardTextureUrl ??= null;
  board.settings.clock = normalizeCampaignClock(board.settings.clock);
  board.noteLinks ??= [];
  board.stickers ??= [];
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
    note.authorName ??=
      board.members.find((member) => member.userId === note.authorId)
        ?.characterName ?? "未知员工";
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
    const saved = localStorage.getItem(STORAGE_KEY);
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
        throw new Error("仅值班 GM 可以修改");
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
        throw new Error("仅在岗员工可以修改");
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

  async setBurgerIndex(_campaignId: string, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 9)
      throw new Error("指数必须在红1到绿3之间");
    return this.manage((board) => {
      board.campaign.burgerIndex = value;
    });
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
      if (note) {
        Object.assign(note, draft);
        return;
      }
      const count = board.notes.length;
      board.notes.push({
        id: uid("note"),
        ...draft,
        x: 1098 + (count % 2) * 36,
        y: 605 + (count % 3) * 168,
        rotation: [-2.4, 1.8, -0.8][count % 3],
        createdAt: new Date().toISOString(),
        authorId: board.viewer.id,
        authorName: board.viewer.displayName,
        pinned: false,
        pinnedAt: null,
        layer: Math.max(0, ...board.notes.map((item) => item.layer)) + 1,
        pinColor: draft.pinColor,
      });
    });
  }

  async moveNote(_campaignId: string, noteId: string, x: number, y: number) {
    return this.mutate((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (note) Object.assign(note, { x, y });
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
      sticker.x = Math.max(0, Math.min(BOARD_WIDTH - STICKER_SIZE, x));
      sticker.y = Math.max(0, Math.min(BOARD_HEIGHT - STICKER_SIZE, y));
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
    draft: CampaignSettingsDraft,
  ): Promise<CampaignBoard> {
    return this.manage((board) => {
      board.campaign.name = draft.name.trim();
      board.settings.sectionTitles = draft.sectionTitles;
      board.settings.sectionColors = draft.sectionColors;
      board.settings.resourceTitles = draft.resourceTitles;
      board.settings.moduleLayout = draft.moduleLayout;
      board.settings.hiddenSections = draft.hiddenSections;
    });
  }

  async moveBoardModule(
    _campaignId: string,
    key: BoardModuleKey,
    x: number,
    y: number,
  ): Promise<BoardModuleLayout> {
    const board = this.manage((current) => {
      current.settings.moduleLayout = {
        ...current.settings.moduleLayout,
        [key]: { x, y },
      };
    });
    return clone(board.settings.moduleLayout);
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
  ) {
    if (Object.keys(files).length) throw new Error("演示模式不保存自定义图片");
    return this.manage((board) => {
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
