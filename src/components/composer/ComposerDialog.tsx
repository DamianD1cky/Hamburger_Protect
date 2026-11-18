import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Image as ImageIcon,
  MessageSquare,
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
import type {
  CampaignBoard,
  ComposerTarget,
  NoteDraft,
  QuestDraft,
} from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { blobToFile, compressImage } from "../../lib/imageCompress";
import { CardEffectPicker } from "../board/CardEffectLayer";
import { ColorField, type ColorPresetOption } from "../board/ColorField";
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
  onSaveNote: (draft: NoteDraft, id?: string) => Promise<void>;
  onDelete: (target: ComposerTarget) => Promise<void>;
  onUploadPhoto: (file: File) => Promise<string>;
  onNoteLayer?: (noteId: string, direction: -1 | 1) => Promise<unknown>;
  onToggleNotePin?: (noteId: string, pinned: boolean) => Promise<unknown>;
}

const NOTE_COLOR_PRESETS: readonly ColorPresetOption[] = [
  { value: "#f8e98e", label: "经典柠檬黄" },
  { value: "#f4c7d0", label: "樱花粉" },
  { value: "#c2dff8", label: "晴空蓝" },
  { value: "#c9e8c2", label: "薄荷绿" },
  { value: "#ead6b1", label: "陈年羊皮纸" },
  { value: "#0b2530", label: "全息投影深青" },
];

const PIN_COLOR_PRESETS: readonly ColorPresetOption[] = [
  { value: "#e72b3c", label: "图钉朱砂红" },
  { value: "#2785d8", label: "图钉钴蓝" },
  { value: "#36a467", label: "图钉松石绿" },
  { value: "#f1c933", label: "图钉琥珀黄" },
  { value: "#343536", label: "图钉曜石黑" },
  { value: "#2be4dc", label: "图钉全息青" },
];

function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-180, Math.min(180, Math.round(deg)));
}

/**
 * 便签全功能统一编辑页（点击任意便签打开）：
 * 集中承载便签内容、羊皮纸/全息投影/烈焰烧焦/AI 着色器预设、全站统一 RGB+#hex 便签与图钉取色、
 * 旋转角度、缩放倍率、叠放图层调整、GM 置顶以及删除操作。
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
}: ComposerDialogProps) {
  const quest =
    state.target?.kind === "quest"
      ? board.quests.find((item) => item.id === state.target?.id)
      : undefined;
  const note =
    state.target?.kind === "note"
      ? board.notes.find((item) => item.id === state.target?.id)
      : undefined;

  const [kind, setKind] = useState(state.kind);
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
  const [effect, setEffect] = useState<CardVisualEffect>(() =>
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

  const heading = !canEdit
    ? kind === "quest"
      ? "任务委托详情"
      : "便签详情"
    : state.target
      ? kind === "quest"
        ? "编辑任务委托"
        : "编辑便签与外观着色"
      : kind === "quest"
        ? "发布任务委托"
        : "填写新便签";

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
    if (submitting || !canEdit || !title.trim()) return;
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
      className="composer-dialog note-studio-dialog"
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
          {!state.target && canManage && !board.settings.hiddenSections.includes("tasks") && (
            <div className="compose-type" role="tablist" aria-label="发布类型">
              <button
                type="button"
                role="tab"
                aria-selected={kind === "note"}
                className={kind === "note" ? "is-active" : ""}
                onClick={() => setKind("note")}
              >
                <MessageSquare />
                便签
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === "quest"}
                className={kind === "quest" ? "is-active" : ""}
                onClick={() => setKind("quest")}
              >
                <ClipboardList />
                任务委托
              </button>
            </div>
          )}

          <form onSubmit={submit} {...imeGuard}>
            <fieldset className="editor-fields" disabled={submitting}>
              <label className="field">
                <span>标题</span>
                <input
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
                  rows={3}
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

              {kind === "note" && (
                <div className="note-studio-sections">
                  <section className="hig-editor-group">
                    <CardEffectPicker
                      mode="note"
                      value={effect}
                      basePreviewHex={colorHex}
                      disabled={submitting}
                      onChange={setEffect}
                      onRecommendColors={(recNote, recPin) => {
                        setColorHex(recNote);
                        setPinColorHex(recPin);
                      }}
                    />
                  </section>

                  <section className="hig-editor-group note-colors-grid">
                    <ColorField
                      label="便签底色"
                      accessibleLabel="便签颜色"
                      value={colorHex}
                      onChange={setColorHex}
                      disabled={submitting}
                      presets={NOTE_COLOR_PRESETS}
                    />
                    <ColorField
                      label="图钉颜色"
                      accessibleLabel="图钉颜色"
                      value={pinColorHex}
                      onChange={setPinColorHex}
                      disabled={submitting}
                      presets={PIN_COLOR_PRESETS}
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

                  {note && (
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

                  <div className="note-photo-field">
                    <span className="note-photo-label">线索照片（可选）</span>
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
                      <label className="text-button file-button">
                        <ImageIcon aria-hidden="true" />
                        插入照片
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => void choosePhoto(event)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </fieldset>

            {error && (
              <p className="access-error" role="alert">
                {error}
              </p>
            )}

            <footer className="composer-actions">
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
                {submitting ? "保存中" : "保存"}
              </button>
            </footer>
          </form>
        </>
      )}
    </PaperDialog>
  );
}
