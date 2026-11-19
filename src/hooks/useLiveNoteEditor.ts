import { useEffect, useRef, useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../features/campaign/domain/boardGeometry";
import { defaultCardVisualEffect } from "../features/campaign/domain/cardEffects";
import { createLiveNoteDraft, liveDraftToNoteInput, mergeLiveNoteDraft, noteEditableFields, type LiveNoteDraft } from "../features/campaign/domain/liveNoteDraft";
import type { BoardNote, CampaignBoard, NoteDraft } from "../features/campaign/domain/types";

interface NoteEditorActions {
  saveNote: (draft: NoteDraft, id?: string) => Promise<CampaignBoard>;
  uploadNotePhoto: (file: File) => Promise<string>;
  deleteNote: (id: string) => Promise<unknown>;
}
export function useLiveNoteEditor(board: CampaignBoard | undefined, actions: NoteEditorActions, focusNote: (note: BoardNote) => void) {
  const [draft, setDraftState] = useState<LiveNoteDraft | null>(null);
  const draftRef = useRef(draft);
  const boardRef = useRef(board); boardRef.current = board;
  const actionsRef = useRef(actions); actionsRef.current = actions;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const navigation = useRef(0);
  const setDraft = (value: LiveNoteDraft | null) => { draftRef.current = value; setDraftState(value); };
  useEffect(() => {
    const current = draftRef.current;
    if (!current || current.isNew || !board || saving.current) return;
    const latest = board.notes.find((note) => note.id === current.note.id);
    const latestSize = board.settings.styleTokens.noteFontSizes?.[current.note.id] ?? 15;
    const changed = !latest || JSON.stringify(noteEditableFields(latest, latestSize)) !== JSON.stringify(noteEditableFields(current.baseline, current.baselineFontSize));
    if (!changed) return;
    if (current.dirty || !latest) {
      if (!current.conflict) setDraft({ ...current, conflict: true });
    } else {
      setDraft(createLiveNoteDraft(latest, board));
    }
  }, [board]);
  useEffect(() => () => {
    const url = draftRef.current?.photoPreview;
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }, []);
  const restore = () => {
    const current = draftRef.current; if (!current) return;
    if (current.photoPreview?.startsWith("blob:")) URL.revokeObjectURL(current.photoPreview);
    const latest = boardRef.current?.notes.find((note) => note.id === current.note.id);
    setDraft(latest && boardRef.current ? createLiveNoteDraft(latest, boardRef.current)
      : { ...current, note: structuredClone(current.baseline), fontSize: current.baselineFontSize, dirty: false, photoFile: null, photoPreview: null, conflict: false });
    setError("");
  };
  const save = (): Promise<boolean> => {
    if (saving.current) return saving.current;
    const current = draftRef.current, base = boardRef.current;
    if (!current || !base || !current.dirty) return Promise.resolve(true);
    if (current.conflict) { setError("此便签已被其他成员更新，请先选择加载最新版或保留我的修改。"); return Promise.resolve(false); }
    if (!current.note.title.trim() && !current.note.body.trim() && !current.photoFile && !current.note.imagePath) {
      if (current.isNew) return Promise.resolve(true);
      setError("便签不能为空。"); return Promise.resolve(false);
    }
    setBusy(true); setError("");
    saving.current = (async () => {
      try {
        const imagePath = current.photoFile ? await actionsRef.current.uploadNotePhoto(current.photoFile) : current.note.imagePath;
        const result = await actionsRef.current.saveNote(liveDraftToNoteInput(current, imagePath), current.isNew ? undefined : current.note.id);
        const ids = new Set(base.notes.map((note) => note.id));
        const saved = current.isNew ? result.notes.find((note) => !ids.has(note.id)) : result.notes.find((note) => note.id === current.note.id);
        if (!saved) throw new Error("保存已提交，但未能确认便签，请重试。");
        if (current.photoPreview?.startsWith("blob:")) URL.revokeObjectURL(current.photoPreview);
        setDraft(createLiveNoteDraft(saved, result));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存失败";
        setError(`${message}，草稿已保留。`);
        if (/NOTE_CONFLICT/.test(message)) setDraft({ ...current, conflict: true });
        return false;
      } finally { saving.current = null; setBusy(false); }
    })();
    return saving.current;
  };
  const select = async (note: BoardNote | null, focus = false) => {
    const token = ++navigation.current;
    if (note && note.id === draftRef.current?.note.id) { if (focus) focusNote(note); return; }
    if (!(await save()) || token !== navigation.current) return;
    const base = boardRef.current; if (!base) return;
    if (!note) {
      const id = "__draft_new__";
      const rect = document.querySelector(".board")?.getBoundingClientRect();
      const scale = rect ? rect.width / BOARD_WIDTH : 1;
      const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
      const centerX = (viewport?.left ?? 0) + (viewport?.width ?? innerWidth) / 2;
      const centerY = (viewport?.top ?? 0) + (viewport?.height ?? innerHeight) / 2;
      const x = Math.round(Math.max(18, Math.min(BOARD_WIDTH - 310, rect ? (centerX - rect.left) / scale - 138 : 950)));
      const y = Math.round(Math.max(18, Math.min(BOARD_HEIGHT - 250, rect ? (centerY - rect.top) / scale - 98 : 580)));
      note = { id, title: "", body: "", color: "#f6e7a6", pinColor: "red", x, y, rotation: 0, scale: 1,
        effect: defaultCardVisualEffect(), createdAt: new Date().toISOString(), authorId: base.viewer.id,
        authorName: base.viewer.displayName, pinned: false, pinnedAt: null, imagePath: null, layer: Math.max(0, ...base.notes.map((item) => item.layer)) + 1 };
    }
    const selected = base.notes.find((item) => item.id === note!.id) ?? note;
    setDraft(createLiveNoteDraft(selected, base, selected.id === "__draft_new__"));
    setError(""); setDragging(false);
    const element = [...document.querySelectorAll<HTMLElement>("[data-note-id]")].find((item) => item.dataset.noteId === selected.id);
    const rect = element?.getBoundingClientRect();
    if (focus || window.innerWidth <= 768 || !rect || (innerWidth - rect.right < 370 && rect.left < 370)) focusNote(selected);
  };
  const close = async (discard = false) => {
    if (discard) {
      if (saving.current) return false;
      const url = draftRef.current?.photoPreview;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      setDraft(null); setError(""); return true;
    }
    if (!(await save())) return false;
    setDraft(null); setError(""); return true;
  };
  const patch = (changes: Partial<BoardNote>, fontSize?: number, photoFile?: File | null, photoPreview?: string | null) => {
    const current = draftRef.current; if (!current || saving.current) return;
    setDraft({ ...current, note: { ...current.note, ...changes }, dirty: true,
      fontSize: fontSize ?? current.fontSize,
      photoFile: photoFile === undefined ? current.photoFile : photoFile,
      photoPreview: photoPreview === undefined ? current.photoPreview : photoPreview });
  };
  return {
    draft, busy, error, dragging, setDragging, save, select, close, patch, restore,
    previewBoard: board ? mergeLiveNoteDraft(board, draft) : undefined,
    keepMine: () => {
      const current = draftRef.current, base = boardRef.current;
      const latest = base?.notes.find((note) => note.id === current?.note.id);
      if (!current || !base || !latest) { setError("此便签已被删除，请复制内容后新建。"); return; }
      setDraft({ ...current, baseline: structuredClone(latest), baselineFontSize: base.settings.styleTokens.noteFontSizes?.[latest.id] ?? 15, conflict: false }); setError("");
    },
    remove: async () => {
      const current = draftRef.current; if (!current || busy) return;
      if (current.isNew) { await close(true); return; }
      setBusy(true); setError("");
      try { await actionsRef.current.deleteNote(current.note.id); setDraft(null); }
      catch (err) { setError(err instanceof Error ? err.message : "删除失败"); }
      finally { setBusy(false); }
    },
  };
}
