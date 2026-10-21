export type CampaignRole = "gm" | "player" | "observer";
export type CampaignStatus = "active" | "archived";
export type EmployeePosition = "店长" | "厨师" | "维修师" | "服务员" | "顾客";
export type QuestStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "failed";
export type ResourceStatus = "ok" | "low" | "out";
export type NoteColor = "yellow" | "pink" | "blue" | "green";

export interface CampaignSummary {
  id: string;
  name: string;
  joinCode: string;
  status: CampaignStatus;
  burgerIndex: number;
}

export interface Viewer {
  id: string;
  displayName: string;
  role: CampaignRole;
  jobTitle: EmployeePosition;
}

export interface CampaignMember {
  userId: string;
  role: CampaignRole;
  characterName: string;
  jobTitle: EmployeePosition;
  active: boolean;
  joinedAt: string;
}

export interface ResourceItem {
  id: string;
  group: number;
  name: string;
  quantity: string;
  status: ResourceStatus;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  body: string;
  assigneeName: string;
  due: string;
  status: QuestStatus;
  createdBy: string;
  pendingSubmissionId?: string;
}

export interface BoardNote {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  x: number;
  y: number;
  rotation: number;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface BoardActivity {
  id: string;
  actorId: string | null;
  actorName: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  payload: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    job_title?: string;
    character_name?: string;
    actor_name?: string;
  };
  createdAt: string;
}

export interface ActivityPage {
  items: BoardActivity[];
  hasMore: boolean;
}

export interface CampaignBoard {
  campaign: CampaignSummary;
  viewer: Viewer;
  members: CampaignMember[];
  resources: ResourceItem[];
  checklist: ChecklistItem[];
  quests: Quest[];
  notes: BoardNote[];
  activities: BoardActivity[];
  hasMoreActivity: boolean;
}

export type ResourceDraft = Pick<
  ResourceItem,
  "name" | "quantity" | "status" | "group"
>;
export interface ChecklistDraft {
  label: string;
}

export interface QuestDraft {
  title: string;
  body: string;
  assigneeName: string;
  due: string;
}

export interface NoteDraft {
  title: string;
  body: string;
  color: NoteColor;
}

export type ComposerTarget =
  { kind: "quest"; id: string } | { kind: "note"; id: string };

export function nextQuestStatus(
  role: CampaignRole,
  status: QuestStatus,
): QuestStatus | null {
  if (role === "gm") {
    if (status === "pending_review") return "completed";
    if (status === "completed" || status === "failed") return "open";
    return null;
  }

  if (role === "player") {
    if (status === "open") return "claimed";
    if (
      status === "claimed" ||
      status === "in_progress" ||
      status === "failed"
    ) {
      return "pending_review";
    }
  }

  return null;
}
