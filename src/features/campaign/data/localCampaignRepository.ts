import { cloneDefaultBoard } from "../domain/defaults";
import type { CampaignRepository } from "../domain/repository";
import type {
  CampaignBoard,
  BoardActivity,
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
    hiddenSections: [],
    backgroundPath: null,
    noteTexturePath: null,
    backgroundUrl: null,
    noteTextureUrl: null,
  };
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
    note.authorName ??=
      board.members.find((member) => member.userId === note.authorId)
        ?.characterName ?? "未知员工";
  });
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
      });
    });
  }

  async moveNote(_campaignId: string, noteId: string, x: number, y: number) {
    return this.mutate((board) => {
      const note = board.notes.find((item) => item.id === noteId);
      if (note) Object.assign(note, { x, y });
    });
  }

  async deleteNote(_campaignId: string, noteId: string) {
    return this.mutate((board) => {
      board.notes = board.notes.filter((note) => note.id !== noteId);
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
      board.settings.sectionTitles = draft.sectionTitles;
      board.settings.hiddenSections = draft.hiddenSections;
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
