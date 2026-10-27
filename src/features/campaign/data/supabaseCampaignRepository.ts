import type { CampaignRepository } from "../domain/repository";
import type {
  CampaignBoard,
  BoardActivity,
  ResourceDraft,
  ChecklistDraft,
  NoteColor,
  EmployeePosition,
  NoteDraft,
  QuestDraft,
  QuestStatus,
  ResourceStatus,
} from "../domain/types";
import { rpc } from "../../../lib/supabase/client";
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
    active: boolean;
    joined_at: string;
  }>;
  resources: Array<{
    id: string;
    group_index: number;
    name: string;
    quantity: string;
    status: ResourceStatus;
  }>;
  checklist_items: Array<{ id: string; label: string; completed: boolean }>;
  quests: Array<{
    id: string;
    title: string;
    body: string;
    assignee_label: string;
    due_at: string | null;
    status: QuestStatus;
    created_by: string;
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
  }>;
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

function toBoard(remote: RemoteBoard, events: RemoteActivity[]): CampaignBoard {
  const session = getSupabaseAppSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const user = session.user!;
  const viewer = remote.members.find((member) => member.user_id === user.id);
  if (!viewer) throw new Error("Current user is not a campaign member");
  return {
    campaign: {
      id: remote.id,
      name: remote.name,
      joinCode: remote.join_code,
      burgerIndex: remote.burger_index,
      status: remote.status,
    },
    viewer: {
      id: user.id,
      displayName: viewer.character_name || user.displayName,
      role: viewer.role,
      jobTitle: viewer.job_title,
    },
    members: remote.members.map((member) => ({
      userId: member.user_id,
      role: member.role,
      characterName: member.character_name,
      jobTitle: member.job_title,
      active: member.active,
      joinedAt: member.joined_at,
    })),
    resources: remote.resources.map((item) => ({
      id: item.id,
      group: item.group_index,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
    checklist: remote.checklist_items.map((item) => ({
      id: item.id,
      label: item.label,
      completed: item.completed,
    })),
    quests: remote.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      body: quest.body,
      assigneeName: quest.assignee_label,
      due: dueTime(quest.due_at),
      status: quest.status,
      createdBy: quest.created_by,
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
    })),
  };
}

class SupabaseCampaignRepository implements CampaignRepository {
  async getBoard(campaignId: string) {
    await requireSupabaseSession();
    const data = await rpc<(RemoteBoard & { events: RemoteActivity[] }) | null>(
      "get_campaign_board",
      { p_campaign_id: campaignId },
    );
    if (!data) throw new Error("没有本次班次的读取权限");
    return toBoard(data, data.events);
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
    });
    return this.getBoard(campaignId);
  }
  async deleteChecklistItem(campaignId: string, id: string) {
    await rpc("delete_checklist_item", { p_campaign_id: campaignId, p_id: id });
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
    else if (status === "completed") {
      const quest = (await this.getBoard(campaignId)).quests.find(
        (q) => q.id === id,
      );
      if (!quest?.pendingSubmissionId) throw new Error("没有待审核报告");
      await rpc("review_quest_submission", {
        p_submission_id: quest.pendingSubmissionId,
        p_approved: true,
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
}
export const supabaseCampaignRepository = new SupabaseCampaignRepository();
