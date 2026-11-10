import { ClipboardList, Image as ImageIcon, MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  CampaignBoard,
  ComposerTarget,
  NoteColor,
  NoteDraft,
  QuestDraft,
} from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { blobToFile, compressImage } from "../../lib/imageCompress";
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
  /** 返回存储路径；失败抛错。 */
  onUploadPhoto: (file: File) => Promise<string>;
}
const colors: Array<{ value: NoteColor; label: string }> = [
  { value: "yellow", label: "黄色" },
  { value: "pink", label: "粉色" },
  { value: "blue", label: "蓝色" },
  { value: "green", label: "绿色" },
];

// Mounted per opening: background synchronization must never reset an unsaved draft.
export function ComposerDialog({
  state,
  board,
  onClose,
  onSaveQuest,
  onSaveNote,
  onDelete,
  onUploadPhoto,
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
  const [color, setColor] = useState<NoteColor>(note?.color ?? "yellow");
  const [photoPath, setPhotoPath] = useState<string | null>(note?.imagePath ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const hasPhoto = Boolean(photoPath || photoFile);
  const previewSrc = photoPreview ?? note?.imageUrl ?? null;
  const imeGuard = useImeEnterGuard();
  const [submitting, setSubmitting] = useState(false);
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
      ? "工作指示详情"
      : "便签详情"
    : state.target
      ? kind === "quest"
        ? "编辑工作指示"
        : "编辑便签"
      : kind === "quest"
        ? "发布工作指示"
        : "填写便签";
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !canEdit || !title.trim()) return;
    if (kind === "quest" && !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      if (kind === "quest")
        await onSaveQuest(
          {
            title: title.trim(),
            body: body.trim(),
            assigneeName: assigneeName.trim() || "待认领",
            due,
          },
          state.target?.id,
        );
      else {
        let imagePath = photoPath;
        if (photoFile) imagePath = await onUploadPhoto(photoFile);
        await onSaveNote(
          {
            title: title.trim(),
            body: body.trim(),
            color,
            imagePath,
          },
          state.target?.id,
        );
      }
      requestClose();
    } catch {
      setError("保存失败，请检查网络或修改权限后重试。草稿已保留。");
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
      className="composer-dialog"
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
          {!state.target && canManage && (
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
                工作指示
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
              {kind === "note" && (
                <fieldset className="color-field">
                  <legend>便签颜色</legend>
                  {colors.map((option) => (
                    <label key={option.value} title={option.label}>
                      <input
                        type="radio"
                        name="color"
                        aria-label={option.label}
                        checked={color === option.value}
                        onChange={() => setColor(option.value)}
                      />
                      <span className={`swatch swatch-${option.value}`} />
                    </label>
                  ))}
                </fieldset>
              )}
              {kind === "note" && (
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
                  <small className="note-photo-hint">
                    上传前会压到长边 1600px；带照片的便签按拍立得样式显示，标题作为照片下方的说明。
                  </small>
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
