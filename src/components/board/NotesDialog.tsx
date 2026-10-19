import type { MouseEvent } from "react";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  BoardNote,
  CampaignBoard,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

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
  const notes = [...board.notes].sort(
    (left, right) =>
      new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf(),
  );
  return (
    <PaperDialog title={`全部便签 · ${notes.length} 条`} onClose={onClose}>
      <p className="editor-help">
        按发布时间从新到旧排列。公告板上的便签可以重叠，这里始终保留完整目录。
      </p>
      <div className="note-directory">
        {!notes.length && <p className="editor-help">暂无便签。</p>}
        {notes.map((note) => (
          <article
            className="note-detail"
            key={note.id}
            data-color={note.color}
          >
            <header>
              <h2>{note.title}</h2>
              <span>{note.authorName}</span>
            </header>
            <p className="detail-body">{note.body}</p>
            <footer>
              <time dateTime={note.createdAt}>
                {formatNoteTimestamp(note.createdAt)}
              </time>
              {canAdd &&
                (board.viewer.role === "gm" ||
                  note.authorId === board.viewer.id) && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={(event) => onEdit(note, event.currentTarget)}
                  >
                    编辑便签
                  </button>
                )}
            </footer>
          </article>
        ))}
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
