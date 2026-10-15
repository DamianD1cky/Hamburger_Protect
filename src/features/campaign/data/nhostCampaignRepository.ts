import { nhost } from "../../../lib/nhost/client";
import type { CampaignRepository } from "../domain/repository";
import type {
  CampaignBoard,
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

interface ActiveCampaignResponse {
  campaign_members: Array<{ campaign: RemoteBoard }>;
}

const ACTIVE_BOARD_QUERY = `
  query ActiveCampaignBoard($userId: uuid!) {
    campaign_members(where: { user_id: { _eq: $userId }, active: { _eq: true } }, limit: 1) {
      campaign {
        id
        name
        join_code
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

function toBoard(remote: RemoteBoard): CampaignBoard {
  const session = requireSession();
  const user = session.user!;
  const viewer = remote.members.find((member) => member.user_id === user.id);
  if (!viewer) throw new Error("Current user is not a campaign member");
  return {
    campaign: {
      id: remote.id,
      name: remote.name,
      joinCode: remote.join_code,
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
    notes: remote.notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      color: note.color,
      x: note.x,
      y: note.y,
      rotation: note.rotation,
      createdAt: new Date(note.created_at).toLocaleDateString("zh-CN"),
      authorId: note.author_id,
    })),
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
  async getBoard(_campaignId: string) {
    const session = requireSession();
    const data = await request<ActiveCampaignResponse>(ACTIVE_BOARD_QUERY, {
      userId: session.user!.id,
    });
    const remote = data.campaign_members[0]?.campaign;
    if (!remote)
      throw new Error("No active campaign found for the current user");
    return toBoard(remote);
  }

  async cycleResource(campaignId: string, resourceId: string) {
    const board = await this.getBoard(campaignId);
    const resource = board.resources.find((item) => item.id === resourceId);
    if (!resource) throw new Error("Resource not found");
    const order: ResourceStatus[] = ["ok", "low", "out"];
    const status = order[(order.indexOf(resource.status) + 1) % order.length];
    await request(
      `mutation UpdateResource($id: uuid!, $status: resource_status!) {
      update_resources_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id }
    }`,
      { id: resourceId, status },
    );
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
}

export const nhostCampaignRepository = new NhostCampaignRepository();
