import { defaultCardVisualEffect } from "./cardEffects.ts";
import type { BoardNote, CampaignBoard, NoteDraft } from "./types.ts";

export interface LiveNoteDraft {
  note: BoardNote;
  baseline: BoardNote;
  fontSize: number;
  baselineFontSize: number;
  isNew: boolean;
  dirty: boolean;
  photoFile: File | null;
  photoPreview: string | null;
  conflict: boolean;
}
export function noteEditableFields(note: BoardNote, fontSize = 15): Record<string, unknown> {
  return { title: note.title, body: note.body, color: note.color, pinColor: note.pinColor,
    imagePath: note.imagePath, rotation: note.rotation, scale: note.scale ?? 1,
    effect: note.effect ?? null, pinned: note.pinned, fontSize };
}
export function createLiveNoteDraft(note: BoardNote, board: CampaignBoard, isNew = false): LiveNoteDraft {
  const fontSize = board.settings.styleTokens.noteFontSizes?.[note.id] ?? 15;
  return { note: structuredClone(note), baseline: structuredClone(note), fontSize, baselineFontSize: fontSize,
    isNew, dirty: false, photoFile: null, photoPreview: null, conflict: false };
}
export function mergeLiveNoteDraft(board: CampaignBoard, draft: LiveNoteDraft | null): CampaignBoard {
  if (!draft) return board;
  const override = (note: BoardNote) => ({ ...note, ...noteEditableFields(draft.note, draft.fontSize),
    x: draft.isNew ? draft.note.x : note.x, y: draft.isNew ? draft.note.y : note.y,
    layer: note.layer, imageUrl: draft.photoPreview ?? draft.note.imageUrl }) as BoardNote;
  const notes = draft.isNew ? [...board.notes, override(draft.note)]
    : board.notes.map((note) => note.id === draft.note.id ? override(note) : note);
  return { ...board, notes, settings: { ...board.settings, styleTokens: { ...board.settings.styleTokens,
    noteFontSizes: { ...board.settings.styleTokens.noteFontSizes, [draft.note.id]: draft.fontSize } } } };
}
export function liveDraftToNoteInput(draft: LiveNoteDraft, imagePath: string | null): NoteDraft {
  return { title: draft.note.title.trim() || (imagePath ? "线索照片" : "便签"), body: draft.note.body.trim(), color: draft.note.color, pinColor: draft.note.pinColor,
    rotation: draft.note.rotation, scale: draft.note.scale ?? 1, effect: draft.note.effect ?? defaultCardVisualEffect(),
    imagePath, x: draft.note.x, y: draft.note.y, fontSize: draft.fontSize, pinned: draft.note.pinned,
    expected: draft.isNew ? undefined : noteEditableFields(draft.baseline, draft.baselineFontSize) };
}
