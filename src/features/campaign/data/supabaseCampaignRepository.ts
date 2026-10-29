import type { CampaignRepository } from "../domain/repository";
import type {
  CampaignBoard,
  BoardActivity,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSectionKey,
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteColor,
  EmployeePosition,
  NoteDraft,
  QuestDraft,
  QuestStatus,
  ResourceStatus,
} from "../domain/types";
import { requireSupabase, rpc } from "../../../lib/supabase/client";
import {
  getSupabaseAppSession,
  requireSupabaseSession,
} from "../../access/data/supabaseSession";
interface RemoteBoard {
  id: string;
  name: string;
  join_code: string;
  burger_index: number;
  status: "active" | "archived";
  members: Array<{
    user_id: string;
    role: "gm" | "player" | "observer";
    character_name: string;
    job_title: EmployeePosition;
    profile_text: string;
    active: boolean;
    joined_at: string;
    left_at: string | null;
  }>;
  resources: Array<{
    id: string;
    group_index: number;
    name: string;
    quantity: string;
    status: ResourceStatus;
  }>;
  checklist_categories: Array<{ id: string; name: string }>;
  checklist_items: Array<{
    id: string;
    label: string;
    completed: boolean;
    category_id: string | null;
  }>;
  quests: Array<{
    id: string;
    title: string;
    body: string;
    assignee_label: string;
    due_at: string | null;
    status: QuestStatus;
    created_by: string;
    claimed_by: string | null;
    submissions: Array<{ id: string }>;
  }>;
  notes: Array<{
    id: string;
    title: string;
    body: string;
    color: NoteColor;
    x: number;
    y: number;
    rotation: number;
    created_at: string;
    author_id: string;
    pinned: boolean;
    pinned_at: string | null;
  }>;
  settings: {
    section_titles: Partial<Record<CampaignSectionKey, string>>;
    hidden_sections: CampaignSectionKey[];
    is_public: boolean;
    background_path: string | null;
    note_texture_path: string | null;
  };
}

interface RemoteActivity {
  id: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: BoardActivity["payload"];
  created_at: string;
}

const ACTIVITY_PAGE_SIZE = 30;

const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function signedMediaUrl(path: string | null, publicView: boolean) {
  if (!path) return null;
  const cacheKey = `${publicView ? "public" : "member"}:${path}`;
  const cached = mediaUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  try {
    const expiresIn = publicView ? 60 : 3600;
    const { data, error } = await requireSupabase()
      .storage.from("campaign-media")
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    mediaUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + (publicView ? 45 : 50 * 60) * 1000,
    });
    return data.signedUrl;
  } catch {
    return null;
  }
}

function activityPage(rows: RemoteActivity[]) {
  return {
    items: rows.slice(0, ACTIVITY_PAGE_SIZE).map((row): BoardActivity => ({
      id: String(row.id),
      actorId: row.actor_id,
      actorName: row.payload.actor_name ?? null,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload,
      createdAt: row.created_at,
    })),
    hasMore: rows.length > ACTIVITY_PAGE_SIZE,
  };
}

function dueTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function dueTimestamp(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function toBoard(
  remote: RemoteBoard,
  events: RemoteActivity[],
  publicView = false,
): Promise<CampaignBoard> {
  const session = getSupabaseAppSession();
  const user = session?.user;
  const viewer = publicView
    ? null
    : remote.members.find((member) => member.user_id === user?.id);
  if (!publicView && !user) throw new Error("AUTH_REQUIRED");
  if (!publicView && !viewer)
    throw new Error("Current user is not a campaign member");
  const [backgroundUrl, noteTextureUrl] = await Promise.all([
    signedMediaUrl(remote.settings.background_path, publicView),
    signedMediaUrl(remote.settings.note_texture_path, publicView),
  ]);
  return {
    campaign: {
      id: remote.id,
      name: remote.name,
      joinCode: remote.join_code,
      burgerIndex: remote.burger_index,
      status: remote.status,
    },
    viewer: publicView
      ? {
          id: user?.id ?? "public-visitor",
          displayName: user?.displayName ?? "访客",
          role: "observer",
          jobTitle: "访客",
        }
      : {
          id: user!.id,
          displayName: viewer!.character_name || user!.displayName,
          role: viewer!.role,
          jobTitle: viewer!.job_title,
        },
    members: remote.members.map((member) => ({
      userId: member.user_id,
      role: member.role,
      characterName: member.character_name,
      jobTitle: member.job_title,
      profileText: member.profile_text,
      active: member.active,
      joinedAt: member.joined_at,
      leftAt: member.left_at,
    })),
    resources: remote.resources.map((item) => ({
      id: item.id,
      group: item.group_index,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
    checklistCategories: remote.checklist_categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    checklist: remote.checklist_items.map((item) => ({
      id: item.id,
      label: item.label,
      completed: item.completed,
      categoryId: item.category_id,
    })),
    quests: remote.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      body: quest.body,
      assigneeName: quest.assignee_label,
      due: dueTime(quest.due_at),
      status: quest.status,
      createdBy: quest.created_by,
      claimedBy: quest.claimed_by,
      pendingSubmissionId: quest.submissions[0]?.id,
    })),
    activities: activityPage(events).items,
    hasMoreActivity: activityPage(events).hasMore,
    notes: remote.notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      color: note.color,
      x: note.x,
      y: note.y,
      rotation: note.rotation,
      createdAt: note.created_at,
      authorId: note.author_id,
      authorName:
        remote.members.find((member) => member.user_id === note.author_id)
          ?.character_name ?? "未知员工",
      pinned: note.pinned,
      pinnedAt: note.pinned_at,
    })),
    settings: {
      sectionTitles: remote.settings.section_titles ?? {},
      hiddenSections: remote.settings.hidden_sections ?? [],
      isPublic: remote.settings.is_public ?? false,
      backgroundPath: remote.settings.background_path,
      noteTexturePath: remote.settings.note_texture_path,
      backgroundUrl,
      noteTextureUrl,
    },
  };
}

export async function getPublicCampaignBoard(campaignId: string) {
  const data = await rpc<(RemoteBoard & { events: RemoteActivity[] }) | null>(
    "get_public_campaign_board",
    { p_campaign_id: campaignId },
  );
  if (!data) throw new Error("该房间当前未开放参观");
  return toBoard(data, data.events, true);
}

export async function getPublicActivities(
  campaignId: string,
  beforeId?: string,
) {
  return activityPage(
    await rpc<RemoteActivity[]>("get_public_activities", {
      p_campaign_id: campaignId,
      p_before: beforeId ?? null,
    }),
  );
}

class SupabaseCampaignRepository implements CampaignRepository {
  async getBoard(campaignId: string) {
    await requireSupabaseSession();
    const data = await rpc<(RemoteBoard & { events: RemoteActivity[] }) | null>(
      "get_campaign_board",
      { p_campaign_id: campaignId },
    );
    if (!data) throw new Error("没有本次班次的读取权限");
    return await toBoard(data, data.events);
  }
  async getActivities(campaignId: string, beforeId?: string) {
    return activityPage(
      await rpc<RemoteActivity[]>("get_activities", {
        p_campaign_id: campaignId,
        p_before: beforeId ?? null,
      }),
    );
  }
  async saveResource(campaignId: string, draft: ResourceDraft, id?: string) {
    await rpc("save_resource", {
      p_campaign_id: campaignId,
      p_id: id ?? null,
      p_name: draft.name,
      p_quantity: draft.quantity,
      p_status: draft.status,
      p_group: draft.group,
    });
    return this.getBoard(campaignId);
  }
  async deleteResource(campaignId: string, id: string) {
    await rpc("delete_resource", { p_campaign_id: campaignId, p_id: id });
    return this.getBoard(campaignId);
  }
  async saveChecklistItem(
    campaignId: string,
    draft: ChecklistDraft,
    id?: string,
  ) {
    await rpc("save_checklist_item", {
      p_campaign_id: campaignId,
      p_id: id ?? null,
      p_label: draft.label,
      p_category_id: draft.categoryId,
    });
    return this.getBoard(campaignId);
  }
  async deleteChecklistItem(campaignId: string, id: string) {
    await rpc("delete_checklist_item", { p_campaign_id: campaignId, p_id: id });
    return this.getBoard(campaignId);
  }
  async saveChecklistCategory(campaignId: string, name: string, id?: string) {
    await rpc("save_checklist_category", {
      p_campaign_id: campaignId,
      p_id: id ?? null,
      p_name: name,
    });
    return this.getBoard(campaignId);
  }
  async deleteChecklistCategory(campaignId: string, id: string) {
    await rpc("delete_checklist_category", {
      p_campaign_id: campaignId,
      p_id: id,
    });
    return this.getBoard(campaignId);
  }
  async setBurgerIndex(campaignId: string, value: number) {
    await rpc("set_burger_index", {
      p_campaign_id: campaignId,
      p_value: value,
    });
    return this.getBoard(campaignId);
  }
  async toggleChecklist(campaignId: string, id: string) {
    await rpc("toggle_checklist", { p_campaign_id: campaignId, p_id: id });
    return this.getBoard(campaignId);
  }
  async saveQuest(campaignId: string, draft: QuestDraft, id?: string) {
    await rpc(id ? "update_quest" : "create_quest", {
      ...(id ? { p_quest_id: id } : { p_campaign_id: campaignId }),
      p_title: draft.title,
      p_body: draft.body,
      p_assignee_label: draft.assigneeName,
      p_due_at: dueTimestamp(draft.due),
    });
    return this.getBoard(campaignId);
  }
  async transitionQuest(campaignId: string, id: string, status: QuestStatus) {
    if (status === "claimed") await rpc("claim_quest", { p_quest_id: id });
    else if (status === "pending_review")
      await rpc("submit_quest", { p_quest_id: id, p_message: "" });
    else if (status === "open") await rpc("reopen_quest", { p_quest_id: id });
    else if (status === "completed" || status === "failed") {
      const quest = (await this.getBoard(campaignId)).quests.find(
        (q) => q.id === id,
      );
      if (!quest?.pendingSubmissionId) throw new Error("没有待审核报告");
      await rpc("review_quest_submission", {
        p_submission_id: quest.pendingSubmissionId,
        p_approved: status === "completed",
        p_message: "",
      });
    } else throw new Error("不支持该任务状态变更");
    return this.getBoard(campaignId);
  }
  async deleteQuest(campaignId: string, id: string) {
    await rpc("delete_quest", { p_quest_id: id });
    return this.getBoard(campaignId);
  }
  async saveNote(campaignId: string, draft: NoteDraft, id?: string) {
    const count = id ? 0 : (await this.getBoard(campaignId)).notes.length;
    await rpc("save_note", {
      p_campaign_id: campaignId,
      p_id: id ?? null,
      p_title: draft.title,
      p_body: draft.body,
      p_color: draft.color,
      p_x: 1098 + (count % 2) * 36,
      p_y: 605 + (count % 3) * 168,
      p_rotation: [-2.4, 1.8, -0.8][count % 3],
    });
    return this.getBoard(campaignId);
  }
  async moveNote(campaignId: string, id: string, x: number, y: number) {
    await rpc("move_note", {
      p_campaign_id: campaignId,
      p_id: id,
      p_x: x,
      p_y: y,
    });
    return this.getBoard(campaignId);
  }
  async deleteNote(campaignId: string, id: string) {
    await rpc("delete_note", { p_campaign_id: campaignId, p_id: id });
    return this.getBoard(campaignId);
  }
  async setNotePinned(campaignId: string, id: string, pinned: boolean) {
    await rpc("set_note_pinned", {
      p_campaign_id: campaignId,
      p_note_id: id,
      p_pinned: pinned,
    });
    return this.getBoard(campaignId);
  }
  async updateMemberProfile(campaignId: string, draft: MemberProfileDraft) {
    await rpc("update_member_profile", {
      p_campaign_id: campaignId,
      p_character_name: draft.characterName,
      p_job_title: draft.jobTitle,
      p_profile_text: draft.profileText,
    });
    return this.getBoard(campaignId);
  }
  async removeMember(campaignId: string, userId: string, note = "") {
    await rpc("remove_campaign_member", {
      p_campaign_id: campaignId,
      p_user_id: userId,
      p_note: note,
    });
    return this.getBoard(campaignId);
  }
  async updateCampaignSettings(
    campaignId: string,
    draft: CampaignSettingsDraft,
  ) {
    const board = await this.getBoard(campaignId);
    const name = draft.name.trim();
    if (!name || name.length > 80) throw new Error("战役名称需要 1–80 个字符");
    if (name !== board.campaign.name) {
      await rpc("rename_campaign", {
        p_campaign_id: campaignId,
        p_name: name,
      });
    }
    await this.persistSettings(campaignId, board, {
      sectionTitles: draft.sectionTitles,
      hiddenSections: draft.hiddenSections,
    });
    return this.getBoard(campaignId);
  }
  async setCampaignPublic(campaignId: string, isPublic: boolean) {
    await rpc("set_campaign_public", {
      p_campaign_id: campaignId,
      p_is_public: isPublic,
    });
    return this.getBoard(campaignId);
  }
  async uploadCampaignMedia(
    campaignId: string,
    kind: CampaignMediaKind,
    file: File,
  ) {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) {
      throw new Error("图片仅支持 JPEG、PNG、WebP，且不能超过 5 MiB");
    }
    const board = await this.getBoard(campaignId);
    const path = `${campaignId}/${kind}-${crypto.randomUUID()}.${extension}`;
    const bucket = requireSupabase().storage.from("campaign-media");
    const upload = await bucket.upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) throw new Error("图片上传失败");
    try {
      await this.persistSettings(campaignId, board, {
        [kind === "background" ? "backgroundPath" : "noteTexturePath"]: path,
      });
    } catch (error) {
      await bucket.remove([path]);
      throw error;
    }
    const previous =
      kind === "background"
        ? board.settings.backgroundPath
        : board.settings.noteTexturePath;
    if (previous) {
      await bucket.remove([previous]);
      mediaUrlCache.delete(`member:${previous}`);
      mediaUrlCache.delete(`public:${previous}`);
    }
    return this.getBoard(campaignId);
  }
  async clearCampaignMedia(campaignId: string, kind: CampaignMediaKind) {
    const board = await this.getBoard(campaignId);
    const previous =
      kind === "background"
        ? board.settings.backgroundPath
        : board.settings.noteTexturePath;
    await this.persistSettings(campaignId, board, {
      [kind === "background" ? "backgroundPath" : "noteTexturePath"]: null,
    });
    if (previous) {
      await requireSupabase().storage.from("campaign-media").remove([previous]);
      mediaUrlCache.delete(`member:${previous}`);
      mediaUrlCache.delete(`public:${previous}`);
    }
    return this.getBoard(campaignId);
  }
  private async persistSettings(
    campaignId: string,
    board: CampaignBoard,
    changes: Partial<{
      sectionTitles: CampaignSettingsDraft["sectionTitles"];
      hiddenSections: CampaignSettingsDraft["hiddenSections"];
      backgroundPath: string | null;
      noteTexturePath: string | null;
    }>,
  ) {
    await rpc("update_campaign_settings", {
      p_campaign_id: campaignId,
      p_section_titles: changes.sectionTitles ?? board.settings.sectionTitles,
      p_hidden_sections:
        changes.hiddenSections ?? board.settings.hiddenSections,
      p_background_path:
        changes.backgroundPath === undefined
          ? board.settings.backgroundPath
          : changes.backgroundPath,
      p_note_texture_path:
        changes.noteTexturePath === undefined
          ? board.settings.noteTexturePath
          : changes.noteTexturePath,
    });
  }
}
export const supabaseCampaignRepository = new SupabaseCampaignRepository();
