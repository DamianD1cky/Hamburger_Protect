export type CampaignRole = "gm" | "player" | "observer";
export type CampaignStatus = "active" | "archived";
export type EmployeePosition = string;
export type CampaignSectionKey =
  "inventory" | "tasks" | "shifts" | "index" | "activity" | "safety" | "notes";
export type CampaignMediaKind = "background" | "noteTexture";
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
  profileText: string;
  active: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export interface ResourceItem {
  id: string;
  group: number;
  name: string;
  quantity: string;
  status: ResourceStatus;
}

export interface ChecklistCategory {
  id: string;
  name: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  categoryId: string | null;
}

export interface Quest {
  id: string;
  title: string;
  body: string;
  assigneeName: string;
  due: string;
  status: QuestStatus;
  createdBy: string;
  claimedBy: string | null;
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
  pinned: boolean;
  pinnedAt: string | null;
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

export interface CampaignSettings {
  sectionTitles: Partial<Record<CampaignSectionKey, string>>;
  hiddenSections: CampaignSectionKey[];
  backgroundPath: string | null;
  noteTexturePath: string | null;
  backgroundUrl: string | null;
  noteTextureUrl: string | null;
}

export interface CampaignBoard {
  campaign: CampaignSummary;
  viewer: Viewer;
  members: CampaignMember[];
  resources: ResourceItem[];
  checklistCategories: ChecklistCategory[];
  checklist: ChecklistItem[];
  quests: Quest[];
  notes: BoardNote[];
  settings: CampaignSettings;
  activities: BoardActivity[];
  hasMoreActivity: boolean;
}

export type ResourceDraft = Pick<
  ResourceItem,
  "name" | "quantity" | "status" | "group"
>;
export interface ChecklistDraft {
  label: string;
  categoryId: string | null;
}

export interface MemberProfileDraft {
  characterName: string;
  jobTitle: string;
  profileText: string;
}

export interface CampaignSettingsDraft {
  sectionTitles: Partial<Record<CampaignSectionKey, string>>;
  hiddenSections: CampaignSectionKey[];
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
