import { ArrowDown, ArrowUp, Image as ImageIcon, List, Palette, Pin, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { resolveNoteColorHex, resolvePinColorVisual } from "../../features/campaign/domain/campaignSettings";
import { defaultCardVisualEffect } from "../../features/campaign/domain/cardEffects";
import type { BoardNote, CampaignBoard } from "../../features/campaign/domain/types";
import type { useLiveNoteEditor } from "../../hooks/useLiveNoteEditor";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { blobToFile, compressImage } from "../../lib/imageCompress";
import { CardEffectPicker } from "../board/CardEffectLayer";
import { ColorField } from "../board/ColorField";

export function NoteLiveInspector({ editor, board, onLayer }: {
  editor: ReturnType<typeof useLiveNoteEditor>;
  board: CampaignBoard;
  onLayer: (id: string, direction: -1 | 1) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"content" | "appearance" | "all">("content");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; placement: string }>({ left: 16, top: 84, maxHeight: 600, placement: "right" });
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ime = useImeEnterGuard();
  const draft = editor.draft;
  const note = draft?.note;
  const isGm = board.viewer.role === "gm";
  useEffect(() => { setConfirmDelete(false); setLocalError(""); }, [note?.id]);
  useEffect(() => {
    let frame = 0, previousTime = 0;
    const measure = (time: number) => {
      frame = requestAnimationFrame(measure);
      if (time - previousTime < 32 || !panelRef.current || !note) return;
      previousTime = time;
      const el = [...document.querySelectorAll<HTMLElement>("[data-note-id]")].find((item) => item.dataset.noteId === note.id);
      const rect = el?.getBoundingClientRect();
      if (!rect || innerWidth <= 768) return;
      const topbar = document.querySelector(".shop-status")?.getBoundingClientRect();
      const dock = [...document.querySelectorAll(".macos-dock,.focus-dock")]
        .map((element) => element.getBoundingClientRect()).filter((rect) => rect.height > 0 && rect.width > 0)
        .sort((a, b) => a.top - b.top)[0];
      const drawer = document.querySelector(".harness-drawer")?.getBoundingClientRect();
      const top = Math.max(16, (topbar?.bottom ?? 64) + 12);
      const bottom = Math.min(innerHeight - 16, dock ? dock.top - 12 : innerHeight - 88);
      const right = Math.max(360, Math.min(innerWidth - 16, drawer?.left ? drawer.left - 16 : innerWidth - 16));
      const width = 344, maxHeight = Math.max(180, bottom - top);
      const height = Math.min(panelRef.current.offsetHeight, maxHeight);
      const placement = right - rect.right >= width + 16 ? "right" : rect.left >= width + 32 ? "left" : "edge";
      const left = placement === "right" ? rect.right + 16 : placement === "left" ? rect.left - width - 16 : Math.max(16, right - width);
      const next = { left: Math.max(16, Math.min(left, right - width)), top: Math.max(top, Math.min(rect.top - 12, bottom - height)), maxHeight, placement };
      setPosition((old) => Math.abs(old.left - next.left) < 1 && Math.abs(old.top - next.top) < 1 && old.maxHeight === maxHeight && old.placement === placement ? old : next);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [note?.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || document.querySelector("dialog[open],.atomic-image-lightbox")) return;
      if ((event.target as HTMLElement)?.closest(".card-effect-picker select")) return;
      event.preventDefault(); void editor.close();
    };
    const onBodyFocus = () => { setTab("content"); requestAnimationFrame(() => { bodyRef.current?.focus(); bodyRef.current?.select(); }); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("veilboard:focus-note-body", onBodyFocus);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("veilboard:focus-note-body", onBodyFocus); };
  });
  if (!draft || !note) return null;
  const patch = (changes: Partial<BoardNote>) => editor.patch(changes);
  const disabled = editor.busy || photoBusy;
  return createPortal(<aside ref={panelRef} className="note-live-inspector hig-inspector-sheet" role="dialog" aria-label="便签实时编辑"
    data-placement={position.placement} data-dragging={editor.dragging || undefined}
    style={{ left: position.left, top: position.top, maxHeight: position.maxHeight } as CSSProperties}>
    <header className="note-inspector-header">
      <span className="note-inspector-swatch" style={{ background: resolveNoteColorHex(note.color) }} />
      <strong>{draft.isNew ? "新建便签" : "便签"}</strong>
      {draft.dirty && <small>{editor.busy ? "保存中…" : "未保存"}</small>}
      <button type="button" aria-label="关闭便签编辑" disabled={disabled} onClick={() => void editor.close()}><X size={17} /></button>
    </header>
    <nav className="hig-inspector-segmented" role="tablist" aria-label="便签编辑分页">
      <button type="button" role="tab" aria-selected={tab === "content"} className={tab === "content" ? "is-active" : ""} onClick={() => setTab("content")}>内容</button>
      <button type="button" role="tab" aria-selected={tab === "appearance"} className={tab === "appearance" ? "is-active" : ""} onClick={() => setTab("appearance")}><Palette size={13} />外观与材质</button>
      <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}><List size={13} />全部</button>
    </nav>
    {draft.conflict && <div className="note-inspector-conflict" role="alert"><span>其他成员更新了此便签</span>
      <button type="button" onClick={editor.restore}>加载最新版</button><button type="button" onClick={editor.keepMine}>保留我的修改</button></div>}
    {(editor.error || localError) && <p className="note-inspector-error" role="alert">{editor.error || localError}</p>}
    <div className="note-inspector-scroll" {...ime}>
      <fieldset disabled={disabled}>
        {tab === "content" && <>
          <label className="field"><span>标题</span><input aria-label="便签标题" value={note.title} maxLength={80} onChange={(event) => patch({ title: event.target.value })} /></label>
          <label className="field"><span>正文</span><textarea ref={bodyRef} aria-label="便签正文" rows={6} maxLength={1000} value={note.body} onChange={(event) => patch({ body: event.target.value })} /></label>
          <label className="field"><span>字号 {draft.fontSize}px</span><input aria-label="便签文字字号" type="range" min={12} max={28} value={draft.fontSize}
            onChange={(event) => editor.patch({}, Number(event.target.value))} /></label>
          <label className="note-inspector-upload"><ImageIcon size={16} /><span>上传 / 替换照片</span><input type="file" aria-label="上传便签照片" accept="image/*" onChange={async (event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            setPhotoBusy(true); setLocalError("");
            try {
              const compressed = blobToFile(await compressImage(file), file.name);
              if (draft.photoPreview?.startsWith("blob:")) URL.revokeObjectURL(draft.photoPreview);
              editor.patch({ imagePath: null }, undefined, compressed, URL.createObjectURL(compressed));
            } catch (err) { setLocalError(err instanceof Error ? err.message : "照片读取失败"); }
            finally { setPhotoBusy(false); }
          }} /></label>
          {(draft.photoPreview || note.imagePath) && <button type="button" onClick={() => {
            if (draft.photoPreview?.startsWith("blob:")) URL.revokeObjectURL(draft.photoPreview);
            editor.patch({ imagePath: null, imageUrl: null }, undefined, null, null);
          }}>移除照片</button>}
          {!draft.isNew && <div className="note-inspector-layer">
            <button type="button" onClick={async () => { try { await onLayer(note.id, 1); } catch (err) { setLocalError(err instanceof Error ? err.message : "图层移动失败"); } }}><ArrowUp size={14} />上移</button>
            <button type="button" onClick={async () => { try { await onLayer(note.id, -1); } catch (err) { setLocalError(err instanceof Error ? err.message : "图层移动失败"); } }}><ArrowDown size={14} />下移</button>
            {isGm && <label><input type="checkbox" checked={note.pinned} onChange={(event) => patch({ pinned: event.target.checked })} /><Pin size={14} />置顶</label>}
          </div>}
        </>}
        {tab === "appearance" && <>
          <ColorField label="便签底色" value={resolveNoteColorHex(note.color)} onChange={(color) => patch({ color })} />
          <ColorField label="图钉颜色" value={resolvePinColorVisual(note.pinColor).fill} onChange={(pinColor) => patch({ pinColor })} />
          <label className="field"><span>旋转 {note.rotation}°</span><input type="range" aria-label="便签旋转角度" min={-180} max={180} value={note.rotation} onChange={(event) => patch({ rotation: Number(event.target.value) })} /></label>
          <div className="note-inspector-presets">{[-15, 0, 15].map((rotation) => <button type="button" key={rotation} onClick={() => patch({ rotation })}>{rotation > 0 ? "+" : ""}{rotation}°</button>)}</div>
          <label className="field"><span>缩放 <button type="button" onClick={() => patch({ scale: 1 })}>{Math.round((note.scale ?? 1) * 100)}%</button></span>
            <input type="range" aria-label="便签缩放" min={60} max={220} step={5} value={Math.round((note.scale ?? 1) * 100)} onChange={(event) => patch({ scale: Number(event.target.value) / 100 })} /></label>
          <CardEffectPicker mode="note" showPreview={false} value={note.effect ?? defaultCardVisualEffect()} basePreviewHex={resolveNoteColorHex(note.color)}
            onChange={(effect) => patch({ effect })} onRecommendColors={(color, pinColor) => patch({ color, pinColor })} />
        </>}
        {tab === "all" && <div className="note-inspector-directory">{board.notes.filter((entry) => entry.id !== "__draft_new__").map((entry) =>
          <button type="button" key={entry.id} disabled={!isGm && entry.authorId !== board.viewer.id} aria-current={entry.id === note.id ? "true" : undefined}
            onClick={() => { void editor.select(entry, true).then(() => setTab("content")); }}>
            <i style={{ background: resolveNoteColorHex(entry.color) }} /><span><strong>{entry.title || "照片便签"}</strong><small>{entry.authorName}</small></span>
          </button>)}</div>}
      </fieldset>
    </div>
    {confirmDelete && <div className="note-inspector-confirm" role="alert">取下这张便签？
      <button type="button" disabled={disabled} onClick={() => void editor.remove()}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>保留</button></div>}
    <footer className="note-inspector-footer">
      <button type="button" aria-label="删除便签" disabled={disabled} onClick={() => draft.isNew ? void editor.close(true) : setConfirmDelete(true)}><Trash2 size={16} /></button>
      <span />
      <button type="button" disabled={disabled || !draft.dirty} onClick={editor.restore}><RotateCcw size={13} />还原</button>
      <button type="button" className="publish-button" disabled={disabled || !draft.dirty || draft.conflict} onClick={() => void editor.save()}>保存</button>
    </footer>
  </aside>, document.body);
}
