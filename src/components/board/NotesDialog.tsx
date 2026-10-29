import { Pin, PinOff } from "lucide-react";
import { useState, type MouseEvent } from "react";
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
  onTogglePin,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onEdit: (note: BoardNote, element: HTMLElement) => void;
  onAdd: (event: MouseEvent<HTMLElement>) => void;
  onTogglePin: (noteId: string, pinned: boolean) => Promise<unknown>;
}) {
  const [pinning, setPinning] = useState("");
  const canAdd =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const notes = [...board.notes].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return (
      new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf()
    );
  });
  const togglePin = async (note: BoardNote) => {
    if (pinning) return;
    setPinning(note.id);
    try {
      await onTogglePin(note.id, !note.pinned);
    } finally {
      setPinning("");
    }
  };
  return (
    <PaperDialog
      title={`全部便签 · ${notes.length} 条`}
      className="directory-dialog notes-dialog"
      onClose={onClose}
    >
      <p className="editor-help">
        置顶便签优先并显示在公告板便签堆顶层，其余按发布时间从新到旧排列。
      </p>
      <div className="note-directory">
        {!notes.length && <p className="editor-help">暂无便签。</p>}
        {notes.map((note) => (
          <article
            className="note-detail"
            key={note.id}
            data-color={note.color}
            style={{
              backgroundImage: board.settings.noteTextureUrl
                ? `url(${board.settings.noteTextureUrl})`
                : undefined,
            }}
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
              <span className="note-directory-actions">
                {board.viewer.role === "gm" &&
                  board.campaign.status === "active" && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void togglePin(note)}
                      disabled={pinning === note.id}
                      aria-label={note.pinned ? "取消置顶便签" : "置顶便签"}
                      title={note.pinned ? "取消置顶" : "置顶"}
                    >
                      {note.pinned ? <PinOff /> : <Pin />}
                    </button>
                  )}
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
              </span>
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
