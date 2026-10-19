import { ClipboardList, MessageSquare, Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  CampaignBoard,
  ComposerTarget,
  NoteColor,
  NoteDraft,
  QuestDraft,
} from "../../features/campaign/domain/types";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      : "工作记录详情"
    : state.target
      ? kind === "quest"
        ? "编辑工作指示"
        : "编辑工作记录"
      : kind === "quest"
        ? "发布工作指示"
        : "填写工作记录";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !canEdit || !title.trim() || !body.trim()) return;
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
      else
        await onSaveNote(
          { title: title.trim(), body: body.trim(), color },
          state.target?.id,
        );
      onClose();
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
      onClose();
    } catch {
      setError("删除失败，请刷新后重试。");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <PaperDialog
      title={heading}
      onClose={() => {
        if (!submitting) onClose();
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
          <button type="button" className="text-button" onClick={onClose}>
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
                工作记录
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
          <form onSubmit={submit}>
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
                  rows={6}
                  required
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
                onClick={onClose}
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
