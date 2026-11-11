export type CampaignRole = "gm" | "player" | "observer";
export type CampaignStatus = "active" | "archived";
export type EmployeePosition = string;

import type { BoardModuleLayout } from "./boardModules";

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
export type PinColor = "red" | "blue" | "green" | "yellow" | "black";
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
  /** 战役内全局唯一的便签层级。 */
  layer: number;
  pinColor: PinColor;
  /** 便签照片的存储路径。 */
  imagePath: string | null;
  /** 由 imagePath 换来的临时访问地址。 */
  imageUrl?: string | null;
}

export interface BoardNoteLink {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  /** 线上的纸片文字；为空则不显示纸片。 */
  label: string | null;
}

export interface BoardSticker {
  id: string;
  emoji: string;
  x: number;
  y: number;
  rotation: number;
  createdBy: string;
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
  sectionColors: Partial<Record<CampaignSectionKey, string>>;
  resourceTitles: Partial<Record<string, string>>;
  hiddenSections: CampaignSectionKey[];
  /** 每个模块摆放的位置；没记录的模块用内置默认位置。 */
  moduleLayout: BoardModuleLayout;
  isPublic: boolean;
  backgroundPath: string | null;
  noteTexturePath: string | null;
  backgroundUrl: string | null;
  noteTextureUrl: string | null;
}

export interface PublicCampaign {
  id: string;
  name: string;
  burgerIndex: number;
  publishedAt: string;
  messageCount: number;
}

export interface VisitorMessage {
  id: string;
  displayName: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
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
  noteLinks: BoardNoteLink[];
  settings: CampaignSettings;
  activities: BoardActivity[];
  stickers: BoardSticker[];
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
  name: string;
  sectionTitles: Partial<Record<CampaignSectionKey, string>>;
  sectionColors: Partial<Record<CampaignSectionKey, string>>;
  resourceTitles: Partial<Record<string, string>>;
  hiddenSections: CampaignSectionKey[];
  moduleLayout: BoardModuleLayout;
}

/** 只改其中几项时用这个，未出现的键沿用当前值。 */
export type CampaignSettingsPatch = Partial<CampaignSettingsDraft>;

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
  pinColor: PinColor;
  /** null 表示这张便签不带照片。 */
  imagePath: string | null;
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
