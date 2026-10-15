export type CampaignRole = "gm" | "player" | "observer";
export type CampaignStatus = "active" | "archived";
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
}

export interface Viewer {
  id: string;
  displayName: string;
  role: CampaignRole;
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
}

export interface CampaignBoard {
  campaign: CampaignSummary;
  viewer: Viewer;
  resources: ResourceItem[];
  checklist: ChecklistItem[];
  quests: Quest[];
  notes: BoardNote[];
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
  | { kind: "quest"; id: string }
  | { kind: "note"; id: string };

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
