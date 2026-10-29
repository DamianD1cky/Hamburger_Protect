import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type { BoardNote } from "../../features/campaign/domain/types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface NoteCardProps {
  note: BoardNote;
  viewScaleRef: RefObject<number>;
  canEdit: boolean;
  noteTextureUrl: string | null;
  onEdit: (note: BoardNote, element: HTMLElement) => void;
  onMove: (noteId: string, x: number, y: number) => Promise<unknown>;
}

export function NoteCard({
  note,
  viewScaleRef,
  canEdit,
  noteTextureUrl,
  onEdit,
  onMove,
}: NoteCardProps) {
  const elementRef = useRef<HTMLElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });
  const escapeListener = useRef<((event: globalThis.KeyboardEvent) => void) | null>(
    null,
  );

  // One cancel path for Escape / pointercancel / failed save: put the note
  // back at its server coordinates and fully reset the drag state machine.
  const cancelDrag = () => {
    const element = elementRef.current;
    if (element) {
      element.style.left = note.x + "px";
      element.style.top = note.y + "px";
      element.style.zIndex = "";
    }
    dragRef.current.pointerId = -1;
    dragRef.current.moved = false;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      !canEdit ||
      event.button !== 0 ||
      window.matchMedia("(max-width: 1024px)").matches
    )
      return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: note.x,
      originY: note.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.zIndex = "20";
    event.preventDefault();
    const onEscape = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelDrag();
    };
    escapeListener.current = onEscape;
    window.addEventListener("keydown", onEscape, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (event.pointerId !== drag.pointerId) return;
    const scale = viewScaleRef.current || 1;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (Math.hypot(dx, dy) > 8) drag.moved = true;
    if (!drag.moved) return;
    event.currentTarget.style.left = clamp(drag.originX + dx, 18, 1172) + "px";
    event.currentTarget.style.top = clamp(drag.originY + dy, 110, 980) + "px";
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.zIndex = "";
    drag.pointerId = -1;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }

    if (drag.moved) {
      drag.moved = false;
      const x = Math.round(Number.parseFloat(event.currentTarget.style.left));
      const y = Math.round(Number.parseFloat(event.currentTarget.style.top));
      // If the save fails, roll back to the server coordinates instead of
      // leaving the note stranded at the dropped position.
      void onMove(note.id, x, y).catch(() => cancelDrag());
    } else {
      onEdit(note, event.currentTarget);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!canEdit || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (elementRef.current) onEdit(note, elementRef.current);
  };

  return (
    <article
      ref={elementRef}
      className="user-note"
      data-note-id={note.id}
      data-color={note.color}
      data-pinned={note.pinned}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : -1}
      aria-label={canEdit ? "编辑工作记录：" + note.title : undefined}
      style={{
        left: note.x,
        top: note.y,
        transform: "rotate(" + note.rotation + "deg)",
        backgroundImage: noteTextureUrl ? `url(${noteTextureUrl})` : undefined,
      }}
      onClick={(event) => {
        if (canEdit && window.matchMedia("(max-width: 1024px)").matches)
          onEdit(note, event.currentTarget);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => cancelDrag()}
      onKeyDown={handleKeyDown}
    >
      <h3>{note.title}</h3>
      <p>{note.body}</p>
      <footer className="note-meta">
        <span>{note.authorName}</span>
        <time dateTime={note.createdAt}>
          {formatNoteTimestamp(note.createdAt)}
        </time>
      </footer>
    </article>
  );
}
