import type { MouseEvent } from "react";
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
  return (
    <PaperDialog title="工作记录" onClose={onClose}>
      {!board.notes.length && <p className="editor-help">暂无工作记录。</p>}
      {board.notes.map((note) => (
        <article className="note-detail" key={note.id} data-color={note.color}>
          <h2>{note.title}</h2>
          <p className="detail-body">{note.body}</p>
          {canAdd &&
            (board.viewer.role === "gm" ||
              note.authorId === board.viewer.id) && (
              <button
                type="button"
                className="text-button"
                onClick={(e) => onEdit(note, e.currentTarget)}
              >
                编辑记录
              </button>
            )}
        </article>
      ))}
      {canAdd && (
        <button className="publish-button" type="button" onClick={onAdd}>
          填写工作记录
        </button>
      )}
    </PaperDialog>
  );
}
