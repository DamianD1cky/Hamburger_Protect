import { nhost } from "../../../lib/nhost/client";
import type { CampaignRepository } from "../domain/repository";
import type {
  CampaignBoard,
  BoardActivity,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSettingsDraft,
  MemberProfileDraft,
  NoteColor,
  EmployeePosition,
  NoteDraft,
  QuestDraft,
  QuestStatus,
  ResourceStatus,
} from "../domain/types";

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
    profile_text?: string;
    active: boolean;
    joined_at: string;
    left_at?: string | null;
  }>;
  resources: Array<{
    id: string;
    group_index: number;
    name: string;
    quantity: string;
    status: ResourceStatus;
  }>;
  checklist_categories?: Array<{ id: string; name: string }>;
  checklist_items: Array<{
    id: string;
    label: string;
    completed: boolean;
    category_id?: string | null;
  }>;
  quests: Array<{
    id: string;
    title: string;
    body: string;
    assignee_label: string;
    due_at: string | null;
    status: QuestStatus;
    created_by: string;
    claimed_by?: string | null;
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
    pinned?: boolean;
    pinned_at?: string | null;
  }>;
  settings?: {
    section_titles?: Record<string, string>;
    hidden_sections?: string[];
    background_path?: string | null;
    note_texture_path?: string | null;
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

const ACTIVITY_FIELDS =
  "id actor_id event_type entity_type entity_id payload created_at";
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

interface ActiveCampaignResponse {
  campaign_members: Array<{ campaign: RemoteBoard }>;
  event_log: RemoteActivity[];
}

const ACTIVE_BOARD_QUERY = `
  query ActiveCampaignBoard($userId: uuid!, $campaignId: uuid!) {
    event_log(where: {campaign_id: {_eq: $campaignId}}, order_by: {id: desc}, limit: 31) { ${ACTIVITY_FIELDS} }
    campaign_members(where: { campaign_id: { _eq: $campaignId }, user_id: { _eq: $userId }, active: { _eq: true } }, limit: 1) {
      campaign {
        id
        name
        join_code
        burger_index
        status
        members(order_by: { joined_at: asc }) { user_id role character_name job_title active joined_at }
        resources(order_by: [{ group_index: asc }, { sort_order: asc }]) { id group_index name quantity status }
        checklist_items(order_by: { sort_order: asc }) { id label completed }
        quests(order_by: [{ sort_order: asc }, { created_at: asc }]) {
          id title body assignee_label due_at status created_by
          submissions(where: { reviewed_at: { _is_null: true } }, limit: 1) { id }
        }
        notes(order_by: { created_at: asc }) { id title body color x y rotation created_at author_id }
      }
    }
  }
`;

function requireClient() {
  if (!nhost) throw new Error("Nhost client is not configured");
  return nhost;
}

function requireSession() {
  const session = requireClient().getUserSession();
  if (!session?.user) throw new Error("Nhost session is required");
  return session;
}

async function request<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await requireClient().graphql.request<T>({
    query,
    variables,
  });
  if (response.body.errors?.length) {
    throw new Error(
      response.body.errors.map((error) => error.message).join("; "),
    );
  }
  if (!response.body.data) throw new Error("Nhost returned no GraphQL data");
  return response.body.data;
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
  const session = requireSession();
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
      profileText: member.profile_text ?? "",
      active: member.active,
      joinedAt: member.joined_at,
      leftAt: member.left_at ?? null,
    })),
    resources: remote.resources.map((item) => ({
      id: item.id,
      group: item.group_index,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
    checklistCategories: (remote.checklist_categories ?? []).map(
      (category) => ({
        id: category.id,
        name: category.name,
      }),
    ),
    checklist: remote.checklist_items.map((item) => ({
      id: item.id,
      label: item.label,
      completed: item.completed,
      categoryId: item.category_id ?? null,
    })),
    quests: remote.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      body: quest.body,
      assigneeName: quest.assignee_label,
      due: dueTime(quest.due_at),
      status: quest.status,
      createdBy: quest.created_by,
      claimedBy: quest.claimed_by ?? null,
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
      pinned: note.pinned ?? false,
      pinnedAt: note.pinned_at ?? null,
    })),
    settings: {
      sectionTitles: remote.settings?.section_titles ?? {},
      hiddenSections: [],
      isPublic: false,
      backgroundPath: remote.settings?.background_path ?? null,
      noteTexturePath: remote.settings?.note_texture_path ?? null,
      backgroundUrl: null,
      noteTextureUrl: null,
    },
  };
}

async function callFunction(name: string, args: Record<string, unknown>) {
  const query =
    "mutation Run($args: " +
    name +
    "_args!) { " +
    name +
    "(args: $args) { id } }";
  await request(query, { args });
}

class NhostCampaignRepository implements CampaignRepository {
  async getBoard(campaignId: string) {
    const session = requireSession();
    const data = await request<ActiveCampaignResponse>(ACTIVE_BOARD_QUERY, {
      userId: session.user!.id,
      campaignId,
    });
    const remote = data.campaign_members[0]?.campaign;
    if (!remote)
      throw new Error("No active campaign found for the current user");
    return toBoard(remote, data.event_log);
  }

  async getActivities(campaignId: string, beforeId?: string) {
    const data = await request<{ event_log: RemoteActivity[] }>(
      `query Activity($campaignId: uuid!, $before: bigint_comparison_exp!) {
        event_log(where: {campaign_id: {_eq: $campaignId}, id: $before}, order_by: {id: desc}, limit: 31) { ${ACTIVITY_FIELDS} }
      }`,
      { campaignId, before: beforeId ? { _lt: beforeId } : {} },
    );
    return activityPage(data.event_log);
  }

  async saveResource(campaignId: string, draft: ResourceDraft, id?: string) {
    const changes = {
      name: draft.name,
      quantity: draft.quantity,
      status: draft.status,
      group_index: draft.group,
    };
    const data = id
      ? await request<{ result: { id: string } | null }>(
          `mutation EditResource($id: uuid!, $changes: resources_set_input!) {
          result: update_resources_by_pk(pk_columns: {id: $id}, _set: $changes) { id }
        }`,
          { id, changes },
        )
      : await request<{ result: { id: string } | null }>(
          `mutation AddResource($item: resources_insert_input!) {
          result: insert_resources_one(object: $item) { id }
        }`,
          { item: { ...changes, campaign_id: campaignId } },
        );
    if (!data.result) throw new Error("物资不存在或没有修改权限");
    return this.getBoard(campaignId);
  }

  async deleteResource(campaignId: string, id: string) {
    const data = await request<{ result: { id: string } | null }>(
      `mutation DeleteResource($id: uuid!) {
      result: delete_resources_by_pk(id: $id) { id }
    }`,
      { id },
    );
    if (!data.result) throw new Error("物资不存在或没有删除权限");
    return this.getBoard(campaignId);
  }

  async saveChecklistItem(
    campaignId: string,
    draft: ChecklistDraft,
    id?: string,
  ) {
    const data = id
      ? await request<{ result: { id: string } | null }>(
          `mutation EditCheck($id: uuid!, $label: String!) {
          result: update_checklist_items_by_pk(pk_columns: {id: $id}, _set: { label: $label }) { id }
        }`,
          { id, label: draft.label },
        )
      : await request<{ result: { id: string } | null }>(
          `mutation AddCheck($item: checklist_items_insert_input!) {
          result: insert_checklist_items_one(object: $item) { id }
        }`,
          { item: { label: draft.label, campaign_id: campaignId } },
        );
    if (!data.result) throw new Error("检查项不存在或没有修改权限");
    return this.getBoard(campaignId);
  }

  async deleteChecklistItem(campaignId: string, id: string) {
    const data = await request<{ result: { id: string } | null }>(
      `mutation DeleteCheck($id: uuid!) {
      result: delete_checklist_items_by_pk(id: $id) { id }
    }`,
      { id },
    );
    if (!data.result) throw new Error("检查项不存在或没有删除权限");
    return this.getBoard(campaignId);
  }

  async setBurgerIndex(campaignId: string, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 9)
      throw new Error("指数必须在红1到绿3之间");
    const data = await request<{ result: { id: string } | null }>(
      `mutation SetBurgerIndex($id: uuid!, $value: Int!) {
      result: update_campaigns_by_pk(pk_columns: { id: $id }, _set: { burger_index: $value }) { id }
    }`,
      { id: campaignId, value },
    );
    if (!data.result) throw new Error("没有修改汉堡屋指数的权限");
    return this.getBoard(campaignId);
  }

  async toggleChecklist(campaignId: string, itemId: string) {
    const board = await this.getBoard(campaignId);
    const item = board.checklist.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Checklist item not found");
    await request(
      `mutation UpdateChecklist($id: uuid!, $completed: Boolean!) {
      update_checklist_items_by_pk(pk_columns: { id: $id }, _set: { completed: $completed }) { id }
    }`,
      { id: itemId, completed: !item.completed },
    );
    return this.getBoard(campaignId);
  }

  async saveQuest(campaignId: string, draft: QuestDraft, questId?: string) {
    await callFunction(questId ? "update_quest" : "create_quest", {
      ...(questId ? { p_quest_id: questId } : { p_campaign_id: campaignId }),
      p_title: draft.title,
      p_body: draft.body,
      p_assignee_label: draft.assigneeName,
      p_due_at: dueTimestamp(draft.due),
    });
    return this.getBoard(campaignId);
  }

  async transitionQuest(
    campaignId: string,
    questId: string,
    status: QuestStatus,
  ) {
    const board = await this.getBoard(campaignId);
    const quest = board.quests.find((item) => item.id === questId);
    if (!quest) throw new Error("Quest not found");
    if (status === "claimed")
      await callFunction("claim_quest", { p_quest_id: questId });
    else if (status === "pending_review")
      await callFunction("submit_quest", {
        p_quest_id: questId,
        p_message: "",
      });
    else if (status === "completed" && quest.pendingSubmissionId) {
      await callFunction("review_quest_submission", {
        p_submission_id: quest.pendingSubmissionId,
        p_approved: true,
        p_message: "",
      });
    } else if (status === "open")
      await callFunction("reopen_quest", { p_quest_id: questId });
    else throw new Error("Unsupported quest transition");
    return this.getBoard(campaignId);
  }

  async deleteQuest(campaignId: string, questId: string) {
    await callFunction("delete_quest", { p_quest_id: questId });
    return this.getBoard(campaignId);
  }

  async saveNote(campaignId: string, draft: NoteDraft, noteId?: string) {
    if (noteId) {
      await request(
        `mutation UpdateNote($id: uuid!, $changes: notes_set_input!) {
        update_notes_by_pk(pk_columns: { id: $id }, _set: $changes) { id }
      }`,
        { id: noteId, changes: draft },
      );
    } else {
      const current = await this.getBoard(campaignId);
      const count = current.notes.length;
      await request(
        `mutation CreateNote($note: notes_insert_input!) { insert_notes_one(object: $note) { id } }`,
        {
          note: {
            campaign_id: campaignId,
            ...draft,
            x: 1098 + (count % 2) * 36,
            y: 605 + (count % 3) * 168,
            rotation: [-2.4, 1.8, -0.8][count % 3],
          },
        },
      );
    }
    return this.getBoard(campaignId);
  }

  async moveNote(campaignId: string, noteId: string, x: number, y: number) {
    await request(
      `mutation MoveNote($id: uuid!, $x: Int!, $y: Int!) {
      update_notes_by_pk(pk_columns: { id: $id }, _set: { x: $x, y: $y }) { id }
    }`,
      { id: noteId, x, y },
    );
    return this.getBoard(campaignId);
  }

  async deleteNote(campaignId: string, noteId: string) {
    await request(
      `mutation DeleteNote($id: uuid!) { delete_notes_by_pk(id: $id) { id } }`,
      { id: noteId },
    );
    return this.getBoard(campaignId);
  }
  async saveChecklistCategory(
    _campaignId: string,
    _name: string,
    _id?: string,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async deleteChecklistCategory(
    _campaignId: string,
    _id: string,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async setNotePinned(
    _campaignId: string,
    _id: string,
    _pinned: boolean,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async updateMemberProfile(
    _campaignId: string,
    _draft: MemberProfileDraft,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async removeMember(
    _campaignId: string,
    _userId: string,
    _note?: string,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async updateCampaignSettings(
    _campaignId: string,
    _draft: CampaignSettingsDraft,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async setCampaignPublic(
    _campaignId: string,
    _isPublic: boolean,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async uploadCampaignMedia(
    _campaignId: string,
    _kind: CampaignMediaKind,
    _file: File,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
  async clearCampaignMedia(
    _campaignId: string,
    _kind: CampaignMediaKind,
  ): Promise<CampaignBoard> {
    throw new Error("Nhost 已冻结，请使用 Supabase 后端");
  }
}

export const nhostCampaignRepository = new NhostCampaignRepository();
