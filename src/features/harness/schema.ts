import type { BoardAppearance } from "../campaign/domain/boardAppearance.ts";
import type { ArchiveCategory, ArchiveVisibility } from "../campaign/domain/archiveBox.ts";
import type { CardVisualEffect } from "../campaign/domain/cardEffects.ts";
import type {
  BoardModuleKey,
  BoardModuleLayout,
} from "../campaign/domain/boardModules.ts";
import type { BoardStyleTokens } from "../campaign/domain/boardStyleTokens.ts";
import type { CampaignClockConfig } from "../campaign/domain/campaignClock.ts";
import type { DiceMaterialConfig } from "../dice/diceMaterialConfig.ts";
import type {
  BoardCustomPanel,
  CustomPanelBlock,
  CustomPanelInteractiveRole,
  CustomPanelRow,
} from "../campaign/domain/customPanels.ts";
import type { EventClockDraft } from "../campaign/domain/eventClock.ts";
import type {
  CampaignBoard,
  CampaignSectionKey,
  NoteColor,
  PinColor,
  QuestDraft,
  ResourceDraft,
} from "../campaign/domain/types.ts";

export interface HarnessModuleSpec {
  key: BoardModuleKey;
  visible?: boolean;
  title?: string | null;
  color?: string | null;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  effect?: Partial<CardVisualEffect> | null;
}

export interface HarnessCustomPanelSpec {
  id?: string;
  kind?: BoardCustomPanel["kind"];
  title: string;
  color?: string;
  body?: string;
  rows?: CustomPanelRow[];
  blocks?: CustomPanelBlock[];
  interactiveFor?: CustomPanelInteractiveRole;
  effect?: Partial<CardVisualEffect> | null;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface HarnessNoteSpec {
  refId?: string;
  title: string;
  body: string;
  color?: NoteColor;
  pinColor?: PinColor;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  effect?: Partial<CardVisualEffect> | null;
  pinned?: boolean;
}

export interface HarnessNoteUpdateSpec {
  /** 指定要修改的既有便签 ID；为空或 "*" 时可搭配 matchTitle 或修改全部现有便签。 */
  id?: string;
  matchTitle?: string;
  color?: NoteColor;
  pinColor?: PinColor;
  rotation?: number;
  scale?: number;
  effect?: Partial<CardVisualEffect> | null;
}

export interface HarnessNoteLinkSpec {
  from: string;
  to: string;
  label?: string | null;
}

export interface HarnessChecklistSpec {
  label: string;
  categoryName?: string | null;
}

export interface HarnessArchiveEntrySpec {
  id?: string;
  category?: ArchiveCategory;
  title: string;
  subtitle?: string;
  dateLabel?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  imageUrl?: string | null;
  fontSize?: number;
  visibility?: ArchiveVisibility;
  pinned?: boolean;
}

export interface AccountAssetContextItem {
  id: string;
  kind: string;
  name: string;
  source: "ai" | "custom";
  favorite: boolean;
  previewColors: string[];
}

export interface HarnessVerificationIssue {
  gate: "glsl" | "intent" | "schema" | "trpg_guardrail";
  severity: "error" | "warn";
  message: string;
}

export interface BoardHarnessBlueprint {
  summary: string;
  assistantReply?: string;
  campaignName?: string;
  appearance?: {
    room?: Partial<BoardAppearance["room"]>;
    surface?: Partial<BoardAppearance["surface"]>;
    frame?: BoardAppearance["frame"];
  };
  styleTokens?: Partial<BoardStyleTokens>;
  notesVisible?: boolean;
  notesTitle?: string | null;
  notesColor?: string | null;
  modules?: HarnessModuleSpec[];
  customPanelsMode?: "merge" | "replace";
  customPanels?: HarnessCustomPanelSpec[];
  removeCustomPanelIds?: string[];
  resourceTitles?: Partial<Record<"0" | "1" | "2", string | null>>;
  notes?: HarnessNoteSpec[];
  noteUpdates?: HarnessNoteUpdateSpec[];
  noteLinks?: HarnessNoteLinkSpec[];
  quests?: QuestDraft[];
  resources?: ResourceDraft[];
  eventClocks?: EventClockDraft[];
  checklist?: HarnessChecklistSpec[];
  clock?: Partial<CampaignClockConfig>;
  /** 新增或更新「档案盒」卷宗条目（线索 / 证据 / 人物 / 新闻）。 */
  archiveEntriesMode?: "merge" | "replace";
  archiveEntries?: HarnessArchiveEntrySpec[];
  /** 直接修改 3D 骰子材质与自定义 Shader。 */
  diceMaterial?: Partial<DiceMaterialConfig> | null;
  /** 从当前账号的个人资产库中按 ID 召回并套用已保存的 Shader / 样式 / 时钟 / 骰子资产。 */
  recallAssetIds?: string[];
}

export interface CompiledSettingsPayload {
  campaignName?: string;
  appearance: BoardAppearance;
  styleTokens: BoardStyleTokens;
  sectionTitles: Partial<Record<CampaignSectionKey, string>>;
  sectionColors: Partial<Record<CampaignSectionKey, string>>;
  resourceTitles: Partial<Record<string, string>>;
  hiddenSections: CampaignSectionKey[];
  moduleLayout: BoardModuleLayout;
  customPanels: BoardCustomPanel[];
  clock?: CampaignClockConfig;
}

export interface CompiledNoteUpdate {
  id: string;
  color?: NoteColor;
  pinColor?: PinColor;
  rotation?: number;
  scale?: number;
  effect?: CardVisualEffect | null;
}

export interface NoteRollbackEntry {
  id: string;
  color: NoteColor;
  pinColor: PinColor;
  rotation: number;
  scale: number;
  effect: CardVisualEffect | null;
}

export interface CompiledCommitPayload extends CompiledSettingsPayload {
  summary: string;
  notes: Array<{
    refId?: string;
    title: string;
    body: string;
    color: NoteColor;
    pinColor: PinColor;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    effect: CardVisualEffect | null;
    pinned: boolean;
  }>;
  noteUpdates: CompiledNoteUpdate[];
  noteLinks: Array<{
    from: string;
    to: string;
    label: string | null;
  }>;
  quests: QuestDraft[];
  resources: ResourceDraft[];
  eventClocks: EventClockDraft[];
  checklist: HarnessChecklistSpec[];
}

export interface BlueprintReceipt {
  createdNoteIds: string[];
  createdLinkIds: string[];
  createdQuestIds: string[];
  createdResourceIds: string[];
  createdClockIds: string[];
  createdChecklistIds: string[];
  updatedNotesBefore?: NoteRollbackEntry[];
}

export interface BoardUndoSnapshot {
  summary: string;
  settings: CompiledSettingsPayload;
  createdNoteIds: string[];
  createdLinkIds: string[];
  createdQuestIds: string[];
  createdResourceIds: string[];
  createdClockIds: string[];
  createdChecklistIds: string[];
  updatedNotesBefore?: NoteRollbackEntry[];
  previousDiceMaterial?: DiceMaterialConfig | null;
}

export interface CompiledBoardBlueprint {
  summary: string;
  assistantReply: string;
  previewBoard: CampaignBoard;
  commitPayload: CompiledCommitPayload;
  preApplySettings: CompiledSettingsPayload;
  diceMaterial?: DiceMaterialConfig | null;
  lintNotes: string[];
  changeBadges: string[];
  verificationIssues?: HarnessVerificationIssue[];
  repairRounds?: number;
}

export type HarnessExecutionMode = "auto" | "byok" | "offline";
export type HarnessProviderKind = "openai_compat" | "anthropic";

export interface HarnessApiConfig {
  mode: HarnessExecutionMode;
  provider: HarnessProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  rememberLocally: boolean;
}
