import { Pin } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import {
  readableTextColor,
  resolveNoteColorHex,
} from "../../features/campaign/domain/campaignSettings";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  BoardNote,
  CampaignBoard,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

/**
 * 全部便签速览目录（纯查看与跳转点击入口）：
 * 按设计要求，便签的所有修改（置顶、图层、颜色、图钉、旋转缩放、羊皮纸/全息/燃烧 Shader 等）
 * 均统一收敛在点击单张便签后的编辑页面（ComposerDialog）内，此处不再保留散落的修改按钮。
 */
export function NotesDialog({
  board,
  onClose,
  onEdit,
  onAdd,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onEdit: (note: BoardNote, element: HTMLElement) => void;
  onAdd: (event: MouseEvent<HTMLElement>) => void;
}) {
  const canAdd =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const notes = [...board.notes].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return (
      new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf()
    );
  });

  return (
    <PaperDialog
      title={`全部便签（${notes.length} 条）`}
      className="directory-dialog notes-dialog"
      onClose={onClose}
    >
      <div className="note-directory">
        {!notes.length && <p className="editor-help">暂无便签。</p>}
        {notes.map((note) => {
          const editable =
            canAdd &&
            (board.viewer.role === "gm" || note.authorId === board.viewer.id);
          const bgHex = resolveNoteColorHex(note.color);
          const inkHex =
            note.effect?.shader === "hologram"
              ? "#d9feff"
              : readableTextColor(bgHex);
          return (
            <article
              className={
                editable ? "note-detail is-clickable" : "note-detail"
              }
              key={note.id}
              data-color={note.color}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={
                editable
                  ? (event) => onEdit(note, event.currentTarget)
                  : undefined
              }
              onKeyDown={
                editable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEdit(note, event.currentTarget);
                      }
                    }
                  : undefined
              }
              style={
                {
                  background:
                    note.effect?.shader === "hologram"
                      ? "linear-gradient(135deg, #09212a, #103946)"
                      : bgHex,
                  color: inkHex,
                } as CSSProperties
              }
            >
              <header>
                <h2>{note.title}</h2>
                <span>
                  {note.pinned && <Pin aria-label="已置顶" />}
                  {note.authorName}
                </span>
              </header>
              <p className="detail-body">{note.body}</p>
              <footer>
                <time dateTime={note.createdAt}>
                  {formatNoteTimestamp(note.createdAt)}
                </time>
                {editable && (
                  <small className="note-directory-hint">点击进入便签编辑</small>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {canAdd && (
        <button
          className="publish-button notes-add-button"
          type="button"
          onClick={onAdd}
        >
          填写便签
        </button>
      )}
    </PaperDialog>
  );
}
