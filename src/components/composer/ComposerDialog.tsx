import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  List,
  Palette,
  Pin,
  RotateCcw,
  RotateCw,
  Send,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  resolveNoteColorHex,
  resolvePinColorVisual,
} from "../../features/campaign/domain/campaignSettings";
import {
  defaultCardVisualEffect,
  normalizeCardVisualEffect,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  BoardNote,
  CampaignBoard,
  ComposerTarget,
  NoteDraft,
  QuestDraft,
} from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { blobToFile, compressImage } from "../../lib/imageCompress";
import { ColorField } from "../board/ColorField";
import { clampNoteScale } from "../board/NoteCard";
import { PaperDialog } from "./PaperDialog";

export type ComposeKind = "note" | "quest";
export interface ComposerState {
  open: boolean;
  kind: ComposeKind;
  target: ComposerTarget | null;
  sourceRect: DOMRect | null;
}

interface ComposerDialogProps {
  state: ComposerState;
  board: CampaignBoard;
  onClose: () => void;
  onSaveQuest: (draft: QuestDraft, id?: string) => Promise<void>;
  onSaveNote: (draft: NoteDraft, id?: string, fontSize?: number) => Promise<void>;
  onDelete: (target: ComposerTarget) => Promise<void>;
  onUploadPhoto: (file: File) => Promise<string>;
  onNoteLayer?: (noteId: string, direction: -1 | 1) => Promise<unknown>;
  onToggleNotePin?: (noteId: string, pinned: boolean) => Promise<unknown>;
  onSelectNote?: (note: BoardNote, element: HTMLElement) => void;
}

function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-180, Math.min(180, Math.round(deg)));
}

/**
 * Apple HIG 便签统一中心（新建便签 / 编辑便签 / 查看全部便签）：
 * - 已移除旧版「任务委托」分页，替换为「全部便签」目录页；
 * - 点击任意便签列表项可直接切入该便签的统一编辑页。
 */
export function ComposerDialog({
  state,
  board,
  onClose,
  onSaveQuest,
  onSaveNote,
  onDelete,
  onUploadPhoto,
  onNoteLayer,
  onToggleNotePin,
  onSelectNote,
}: ComposerDialogProps) {
  const quest =
    state.target?.kind === "quest"
      ? board.quests.find((item) => item.id === state.target?.id)
      : undefined;
  const note =
    state.target?.kind === "note"
      ? board.notes.find((item) => item.id === state.target?.id)
      : undefined;

  const kind = state.kind;
  const [noteTab, setNoteTab] = useState<"content" | "appearance" | "all">(
    "content",
  );
  const [title, setTitle] = useState(quest?.title ?? note?.title ?? "");
  const [body, setBody] = useState(quest?.body ?? note?.body ?? "");
  const [assigneeName, setAssigneeName] = useState(quest?.assigneeName ?? "");
  const [due, setDue] = useState(quest?.due ?? "");

  const [colorHex, setColorHex] = useState<string>(() =>
    resolveNoteColorHex(note?.color ?? "yellow"),
  );
  const [pinColorHex, setPinColorHex] = useState<string>(
    () => resolvePinColorVisual(note?.pinColor ?? "red").fill,
  );
  const [rotation, setRotation] = useState<number>(() =>
    normalizeAngle(note?.rotation ?? 0),
  );
  const [scale, setScale] = useState<number>(() => clampNoteScale(note?.scale));
  const [fontSize, setFontSize] = useState<number>(
    () => (note ? board.settings.styleTokens.noteFontSizes?.[note.id] : undefined) ?? 15,
  );
  const [effect] = useState<CardVisualEffect>(() =>
    normalizeCardVisualEffect(note?.effect ?? defaultCardVisualEffect()),
  );
  const [pinned, setPinned] = useState<boolean>(Boolean(note?.pinned));

  const [photoPath, setPhotoPath] = useState<string | null>(
    note?.imagePath ?? null,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const hasPhoto = Boolean(photoPath || photoFile);
  const previewSrc = photoPreview ?? note?.imageUrl ?? null;

  const imeGuard = useImeEnterGuard();
  const [submitting, setSubmitting] = useState(false);
  const [layerBusy, setLayerBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const canManage =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const canEdit =
    board.campaign.status === "active" &&
    (kind === "quest"
      ? canManage
      : board.viewer.role !== "observer" &&
        (!note || note.authorId === board.viewer.id || canManage));

  const sortedNotes = [...board.notes].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return (
      new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf()
    );
  });

  const heading = !canEdit
    ? kind === "quest"
      ? "任务委托详情"
      : "便签详情"
    : state.target
      ? kind === "quest"
        ? "编辑任务委托"
        : `编辑便签${note?.title ? `「${note.title}」` : ""}`
      : kind === "quest"
        ? "发布任务委托"
        : noteTab === "all"
          ? `全部便签（${sortedNotes.length}）`
          : "新建便签";

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("照片仅支持 JPEG、PNG、WebP");
      return;
    }
    try {
      const compressed = await compressImage(file);
      if (compressed.size > 5 * 1024 * 1024) {
        setError("照片压缩后仍超过 5 MiB，请换一张小一点的");
        return;
      }
      setError("");
      setPhotoFile(blobToFile(compressed, "note.jpg"));
      setPhotoPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(compressed);
      });
    } catch {
      setError("照片处理失败，请换一张试试");
    }
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPath(null);
    setPhotoPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const requestClose = () => {
    if (closing) return;
    const animate =
      Boolean(state.sourceRect) &&
      window.matchMedia("(min-width: 761px)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 220);
  };

  const adjustLayer = async (dir: -1 | 1) => {
    if (!note || !onNoteLayer || layerBusy || submitting) return;
    setLayerBusy(true);
    try {
      await onNoteLayer(note.id, dir);
    } catch {
      setError("调整图层顺序失败，请重试。");
    } finally {
      setLayerBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !canEdit || !title.trim()) {
      if (!title.trim()) setNoteTab("content");
      return;
    }
    if (kind === "quest" && !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      if (kind === "quest") {
        await onSaveQuest(
          {
            title: title.trim(),
            body: body.trim(),
            assigneeName: assigneeName.trim() || "待认领",
            due,
          },
          state.target?.id,
        );
      } else {
        let imagePath = photoPath;
        if (photoFile) imagePath = await onUploadPhoto(photoFile);
        await onSaveNote(
          {
            title: title.trim(),
            body: body.trim(),
            color: colorHex,
            pinColor: pinColorHex,
            imagePath,
            rotation: normalizeAngle(rotation),
            scale: clampNoteScale(scale),
            effect,
          },
          state.target?.id,
          fontSize,
        );
        if (
          note &&
          canManage &&
          onToggleNotePin &&
          pinned !== Boolean(note.pinned)
        ) {
          await onToggleNotePin(note.id, pinned);
        }
      }
      requestClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} 草稿已保留。`
          : "保存失败，请检查网络或修改权限后重试。草稿已保留。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!state.target || submitting || !canEdit) return;
    setSubmitting(true);
    setError("");
    try {
      await onDelete(state.target);
      requestClose();
    } catch {
      setError("删除失败，请刷新后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PaperDialog
      title={heading}
      className="composer-dialog note-studio-dialog hig-inspector-sheet"
      sourceRect={state.sourceRect}
      closing={closing}
      onClose={() => {
        if (!submitting) requestClose();
      }}
    >
      {!canEdit ? (
        <div className="quest-detail">
          <h2>{quest?.title ?? note?.title ?? title}</h2>
          <p className="detail-body">
            {(quest?.body ?? note?.body ?? body) || "暂无补充内容"}
          </p>
          {quest && (
            <dl>
              <dt>负责人</dt>
              <dd>{quest.assigneeName || "待认领"}</dd>
              <dt>完成时间</dt>
              <dd>{quest.due || "未指定"}</dd>
            </dl>
          )}
          <button type="button" className="text-button" onClick={requestClose}>
            返回公告板
          </button>
        </div>
      ) : (
        <>
          {kind === "note" && (
            <div
              className="hig-inspector-segmented"
              role="tablist"
              aria-label="便签功能分页"
            >
              <button
                type="button"
                role="tab"
                aria-selected={noteTab === "content"}
                className={noteTab === "content" ? "is-active" : ""}
                onClick={() => setNoteTab("content")}
              >
                <FileText aria-hidden="true" />
                {state.target ? "内容与图层" : "新建便签"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={noteTab === "appearance"}
                className={noteTab === "appearance" ? "is-active" : ""}
                onClick={() => setNoteTab("appearance")}
              >
                <Palette aria-hidden="true" />
                外观与色彩
              </button>
              {!state.target && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={noteTab === "all"}
                  className={noteTab === "all" ? "is-active" : ""}
                  onClick={() => setNoteTab("all")}
                >
                  <List aria-hidden="true" />
                  查看全部便签（{sortedNotes.length}）
                </button>
              )}
            </div>
          )}

          {kind === "note" && !state.target && noteTab === "all" ? (
            <div className="hig-editor-sections">
              {sortedNotes.length === 0 ? (
                <div className="hig-empty-card">
                  当前公告板上还没有便签，切回「新建便签」即可贴上第一条线索。
                </div>
              ) : (
                <div className="hig-grouped-list hig-all-notes-list">
                  {sortedNotes.map((item) => {
                    const editableItem =
                      board.campaign.status === "active" &&
                      (board.viewer.role === "gm" ||
                        item.authorId === board.viewer.id);
                    const swatchBg =
                      item.effect?.shader === "hologram"
                        ? "#16989f"
                        : resolveNoteColorHex(item.color);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className="hig-all-note-row"
                        disabled={!editableItem || !onSelectNote}
                        onClick={(event) => {
                          if (editableItem && onSelectNote) {
                            onSelectNote(item, event.currentTarget);
                          }
                        }}
                      >
                        <span
                          className="hig-note-swatch"
                          style={{ background: swatchBg }}
                          aria-hidden="true"
                        />
                        <span className="hig-all-note-copy">
                          <span className="hig-all-note-head">
                            <strong>{item.title}</strong>
                            {item.pinned && (
                              <span className="hig-status-pill is-online">
                                <Pin aria-hidden="true" /> 置顶
                              </span>
                            )}
                          </span>
                          <span className="hig-all-note-excerpt">
                            {item.body || "（照片便签）"}
                          </span>
                          <small>
                            {item.authorName} ·{" "}
                            <time dateTime={item.createdAt}>
                              {formatNoteTimestamp(item.createdAt)}
                            </time>
                          </small>
                        </span>
                        {editableItem && (
                          <ChevronRight
                            className="hig-sidebar-chevron"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <footer className="composer-actions hig-sheet-footer">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setNoteTab("content")}
                >
                  新建便签
                </button>
                <span className="action-spacer" />
                <button
                  type="button"
                  className="publish-button"
                  onClick={requestClose}
                >
                  完成
                </button>
              </footer>
            </div>
          ) : (
            <form onSubmit={submit} {...imeGuard}>
              <fieldset className="hig-editor-sections" disabled={submitting}>
                {(kind === "quest" || noteTab === "content") && (
                  <>
                    <section className="hig-editor-group">
                      <label className="field">
                        <span>标题</span>
                        <input
                          aria-label="标题"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          maxLength={80}
                          required
                        />
                      </label>

                      <label className="field">
                        <span>内容</span>
                        <textarea
                          aria-label="内容"
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          maxLength={1000}
                          rows={4}
                          required={kind === "quest" || !hasPhoto}
                        />
                      </label>

                      {kind === "quest" && (
                        <div className="task-fields">
                          <label className="field">
                            <span>负责人</span>
                            <input
                              value={assigneeName}
                              onChange={(e) => setAssigneeName(e.target.value)}
                              maxLength={40}
                              placeholder="待认领"
                            />
                          </label>
                          <label className="field">
                            <span>完成时间</span>
                            <input
                              value={due}
                              onChange={(e) => setDue(e.target.value)}
                              type="time"
                            />
                          </label>
                        </div>
                      )}
                    </section>

                    {kind === "note" && (
                      <section className="hig-editor-group">
                        <span className="hig-section-label">
                          线索照片（可选）
                        </span>
                        <div className="note-photo-field">
                          {previewSrc ? (
                            <div className="note-photo-preview">
                              <img src={previewSrc} alt="待上传的照片预览" />
                              <button
                                type="button"
                                className="text-button danger-button"
                                onClick={clearPhoto}
                              >
                                移除照片
                              </button>
                            </div>
                          ) : (
                            <label className="hig-inline-add-btn file-button">
                              <ImageIcon aria-hidden="true" />
                              选择照片附件
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) => void choosePhoto(event)}
                              />
                            </label>
                          )}
                        </div>
                      </section>
                    )}

                    {kind === "note" && note && (
                      <section className="hig-editor-group note-order-pin-row">
                        {onNoteLayer && (
                          <div className="note-layer-studio">
                            <span>叠放图层顺序（当前层 {note.layer}）</span>
                            <div className="note-transform-btns">
                              <button
                                type="button"
                                disabled={layerBusy}
                                onClick={() => void adjustLayer(1)}
                              >
                                <ChevronUp aria-hidden="true" />
                                上移一层
                              </button>
                              <button
                                type="button"
                                disabled={layerBusy}
                                onClick={() => void adjustLayer(-1)}
                              >
                                <ChevronDown aria-hidden="true" />
                                下移一层
                              </button>
                            </div>
                          </div>
                        )}

                        {canManage && (
                          <div className="note-pin-toggle-studio">
                            <span>
                              <Pin aria-hidden="true" /> 置顶重要便签
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-label="置顶便签"
                              aria-checked={pinned}
                              className={
                                pinned ? "hig-switch is-on" : "hig-switch"
                              }
                              onClick={() => setPinned((v) => !v)}
                            >
                              <span className="hig-switch-thumb" />
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                  </>
                )}

                {kind === "note" && noteTab === "appearance" && (
                  <>
                    <section className="hig-editor-group note-colors-grid">
                      <ColorField
                        label="便签底色"
                        accessibleLabel="便签颜色"
                        value={colorHex}
                        onChange={setColorHex}
                        disabled={submitting}
                      />
                      <ColorField
                        label="图钉颜色"
                        accessibleLabel="图钉颜色"
                        value={pinColorHex}
                        onChange={setPinColorHex}
                        disabled={submitting}
                      />
                    </section>

                    <section className="hig-editor-group note-transform-grid">
                      <div className="note-transform-control">
                        <div className="note-transform-head">
                          <span>
                            旋转角度 <strong>{rotation}°</strong>
                          </span>
                          <span className="note-transform-btns">
                            <button
                              type="button"
                              aria-label="逆时针旋转便签 15°"
                              onClick={() =>
                                setRotation((r) => normalizeAngle(r - 15))
                              }
                            >
                              <RotateCcw aria-hidden="true" />
                              15°
                            </button>
                            <button
                              type="button"
                              aria-label="便签角度归零"
                              onClick={() => setRotation(0)}
                            >
                              0°
                            </button>
                            <button
                              type="button"
                              aria-label="顺时针旋转便签 15°"
                              onClick={() =>
                                setRotation((r) => normalizeAngle(r + 15))
                              }
                            >
                              <RotateCw aria-hidden="true" />
                              15°
                            </button>
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="便签旋转角度滑杆"
                          min={-180}
                          max={180}
                          step={1}
                          value={rotation}
                          onChange={(e) => setRotation(Number(e.target.value))}
                        />
                      </div>

                      <div className="note-transform-control">
                        <div className="note-transform-head">
                          <span>
                            文字字号 <strong>{fontSize}px</strong>
                          </span>
                          <span className="note-transform-btns">
                            <button
                              type="button"
                              aria-label="恢复便签默认 15px 字号"
                              onClick={() => setFontSize(15)}
                            >
                              默认
                            </button>
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="便签文字字号滑杆"
                          min={12}
                          max={28}
                          step={1}
                          value={fontSize}
                          onChange={(e) => setFontSize(Number(e.target.value))}
                        />
                      </div>

                      <div className="note-transform-control">
                        <div className="note-transform-head">
                          <span>
                            缩放大小{" "}
                            <strong>{Math.round(scale * 100)}%</strong>
                          </span>
                          <span className="note-transform-btns">
                            <button
                              type="button"
                              aria-label="恢复便签 100% 大小"
                              onClick={() => setScale(1)}
                            >
                              100%
                            </button>
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="便签缩放大小滑杆"
                          min={0.6}
                          max={2.2}
                          step={0.05}
                          value={scale}
                          onChange={(e) =>
                            setScale(clampNoteScale(Number(e.target.value)))
                          }
                        />
                        <small className="note-transform-tip">
                          也可在公告板上直接拖拽便签右下角箭头缩放
                        </small>
                      </div>
                    </section>
                  </>
                )}
              </fieldset>

              {error && (
                <p className="access-error" role="alert">
                  {error}
                </p>
              )}

              <footer className="composer-actions hig-sheet-footer">
                {state.target && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => void remove()}
                    disabled={submitting}
                    aria-label={confirmDelete ? "确认删除" : "删除"}
                  >
                    {confirmDelete ? "确认删除" : <Trash2 />}
                  </button>
                )}
                <span className="action-spacer" />
                <button
                  type="button"
                  className="text-button"
                  disabled={submitting}
                  onClick={requestClose}
                >
                  取消
                </button>
                <button
                  className="publish-button"
                  type="submit"
                  disabled={submitting}
                >
                  <Send />
                  {submitting ? "保存中…" : "完成并保存"}
                </button>
              </footer>
            </form>
          )}
        </>
      )}
    </PaperDialog>
  );
}
