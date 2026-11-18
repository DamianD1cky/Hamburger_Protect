import type {
  CampaignBoard,
  BoardNoteLink,
  BoardSticker,
  ActivityPage,
  ResourceDraft,
  ChecklistDraft,
  CampaignMediaKind,
  CampaignSettingsUpdate,
  CampaignSettingsPatch,
  MemberProfileDraft,
  NoteDraft,
  QuestDraft,
  QuestStatus,
} from "./types";
import type { BoardAppearance, BoardAppearanceFiles } from "./boardAppearance";
import type { CardVisualEffect } from "./cardEffects";
import type { BoardStyleTokens } from "./boardStyleTokens";
import type { BoardModuleKey, BoardModuleLayout } from "./boardModules";
import type { CampaignClockConfig } from "./campaignClock";
import type {
  BoardCustomPanel,
  CustomPanelInteraction,
} from "./customPanels";
import type { EventClock, EventClockDraft } from "./eventClock";
import type {
  BlueprintReceipt,
  BoardUndoSnapshot,
  CompiledCommitPayload,
} from "../../harness/schema";

export interface CampaignRepository {
  getBoard(campaignId: string): Promise<CampaignBoard>;
  getActivities(campaignId: string, beforeId?: string): Promise<ActivityPage>;
  saveResource(
    campaignId: string,
    draft: ResourceDraft,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteResource(campaignId: string, id: string): Promise<CampaignBoard>;
  saveChecklistItem(
    campaignId: string,
    draft: ChecklistDraft,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteChecklistItem(campaignId: string, id: string): Promise<CampaignBoard>;
  saveChecklistCategory(
    campaignId: string,
    name: string,
    id?: string,
  ): Promise<CampaignBoard>;
  deleteChecklistCategory(
    campaignId: string,
    id: string,
  ): Promise<CampaignBoard>;
  saveEventClock(campaignId: string, draft: EventClockDraft, id?: string, revision?: number): Promise<EventClock>;
  setEventClockProgress(campaignId: string, id: string, progress: number, revision: number): Promise<EventClock>;
  moveEventClock(campaignId: string, id: string, x: number, y: number, revision: number): Promise<EventClock>;
  deleteEventClock(campaignId: string, id: string, revision: number): Promise<string>;
  toggleChecklist(campaignId: string, itemId: string): Promise<CampaignBoard>;
  saveQuest(
    campaignId: string,
    draft: QuestDraft,
    questId?: string,
  ): Promise<CampaignBoard>;
  transitionQuest(
    campaignId: string,
    questId: string,
    status: QuestStatus,
  ): Promise<CampaignBoard>;
  deleteQuest(campaignId: string, questId: string): Promise<CampaignBoard>;
  saveNote(
    campaignId: string,
    draft: NoteDraft,
    noteId?: string,
  ): Promise<CampaignBoard>;
  moveNote(
    campaignId: string,
    noteId: string,
    x: number,
    y: number,
  ): Promise<CampaignBoard>;
  resizeNote(
    campaignId: string,
    noteId: string,
    scale: number,
  ): Promise<CampaignBoard>;
  deleteNote(campaignId: string, noteId: string): Promise<CampaignBoard>;
  setNotePinned(
    campaignId: string,
    noteId: string,
    pinned: boolean,
  ): Promise<CampaignBoard>;
  moveNoteLayer(
    campaignId: string,
    noteId: string,
    direction: -1 | 1,
  ): Promise<CampaignBoard>;
  createBoardSticker(
    campaignId: string,
    emoji: string,
    x: number,
    y: number,
    rotation: number,
  ): Promise<BoardSticker>;
  moveBoardSticker(
    campaignId: string,
    stickerId: string,
    x: number,
    y: number,
  ): Promise<BoardSticker>;
  deleteBoardSticker(campaignId: string, stickerId: string): Promise<string>;
  resizeBoardSticker(campaignId: string, stickerId: string, scale: number): Promise<BoardSticker>;
  rotateBoardSticker(campaignId: string, stickerId: string, rotation: number): Promise<BoardSticker>;
  uploadNotePhoto(campaignId: string, file: File): Promise<string>;
  createNoteLink(
    campaignId: string,
    fromNoteId: string,
    toNoteId: string,
  ): Promise<BoardNoteLink>;
  deleteNoteLink(campaignId: string, linkId: string): Promise<CampaignBoard>;
  updateNoteLinkLabel(
    campaignId: string,
    linkId: string,
    label: string | null,
  ): Promise<CampaignBoard>;
  updateMemberProfile(
    campaignId: string,
    draft: MemberProfileDraft,
  ): Promise<CampaignBoard>;
  removeMember(
    campaignId: string,
    userId: string,
    note?: string,
  ): Promise<CampaignBoard>;
  updateCampaignSettings(
    campaignId: string,
    update: CampaignSettingsUpdate,
  ): Promise<CampaignSettingsPatch>;
  moveBoardModule(
    campaignId: string,
    key: BoardModuleKey,
    x: number,
    y: number,
  ): Promise<BoardModuleLayout>;
  resizeBoardModule(
    campaignId: string,
    key: BoardModuleKey,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Promise<BoardModuleLayout>;
  setBoardModuleEffect(
    campaignId: string,
    key: BoardModuleKey,
    effect: CardVisualEffect | null,
  ): Promise<BoardModuleLayout>;
  saveBoardStyleTokens(
    campaignId: string,
    tokens: BoardStyleTokens,
  ): Promise<BoardStyleTokens>;
  saveCustomPanels(
    campaignId: string,
    panels: BoardCustomPanel[],
  ): Promise<BoardCustomPanel[]>;
  interactCustomPanel(
    campaignId: string,
    panelId: string,
    blockId: string,
    interaction: CustomPanelInteraction,
  ): Promise<BoardCustomPanel[]>;
  applyBoardBlueprint(
    campaignId: string,
    payload: CompiledCommitPayload,
  ): Promise<{ board: CampaignBoard; receipt: BlueprintReceipt }>;
  rollbackBoardBlueprint(
    campaignId: string,
    snapshot: BoardUndoSnapshot,
  ): Promise<CampaignBoard>;
  saveCampaignClock(
    campaignId: string,
    config: CampaignClockConfig,
  ): Promise<CampaignClockConfig>;
  saveBoardAppearance(
    campaignId: string,
    appearance: BoardAppearance,
    files: BoardAppearanceFiles,
    expected: BoardAppearance,
  ): Promise<CampaignBoard>;
  setCampaignPublic(
    campaignId: string,
    isPublic: boolean,
  ): Promise<CampaignBoard>;
  uploadCampaignMedia(
    campaignId: string,
    kind: CampaignMediaKind,
    file: File,
  ): Promise<CampaignBoard>;
  clearCampaignMedia(
    campaignId: string,
    kind: CampaignMediaKind,
  ): Promise<CampaignBoard>;
}
