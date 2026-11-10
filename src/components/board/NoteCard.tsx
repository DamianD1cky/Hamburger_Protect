import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  onLayerChange: (noteId: string, layer: number) => Promise<unknown>;
  /** 允许从这张便签发起点/终点连线。 */
  canLink: boolean;
  /** 正在从这张便签拉线。 */
  linkingFrom: boolean;
  onPinClick: (note: BoardNote) => void;
}

export function NoteCard({
  note,
  viewScaleRef,
  canEdit,
  noteTextureUrl,
  onEdit,
  onMove,
  onLayerChange,
  canLink,
  linkingFrom,
  onPinClick,
}: NoteCardProps) {
  // pinned 永远压在最上面，其余按 layer 叠；拖拽时再临时抬高。
  const baseZ = (note.pinned ? 1000 : 50) + (note.layer ?? 0);
  const dragZ = baseZ + 200;
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

  const playFeedback = (element: HTMLElement, className: string) => {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener(
      "animationend",
      () => element.classList.remove(className),
      { once: true },
    );
  };

  // One cancel path for Escape / pointercancel / failed save: put the note
  // back at its server coordinates and fully reset the drag state machine.
  const cancelDrag = (animate = true) => {
    const element = elementRef.current;
    const pointerId = dragRef.current.pointerId;
    if (element) {
      const currentX = Number.parseFloat(element.style.left);
      const currentY = Number.parseFloat(element.style.top);
      if (pointerId >= 0 && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      element.classList.remove("is-dragging", "is-settling");
      element.style.left = note.x + "px";
      element.style.top = note.y + "px";
      element.style.zIndex = String(baseZ);
      const dx = (Number.isFinite(currentX) ? currentX : note.x) - note.x;
      const dy = (Number.isFinite(currentY) ? currentY : note.y) - note.y;
      if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
          (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        const rollback = element.animate(
          [{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }],
          {
            duration: 240,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
        void rollback.finished.then(
          () => rollback.cancel(),
          () => rollback.cancel(),
        );
      }
    }
    dragRef.current.pointerId = -1;
    dragRef.current.moved = false;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (escapeListener.current) {
        window.removeEventListener("keydown", escapeListener.current, true);
      }
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    // Touch and pen drag on the same path as the mouse: narrow viewports used
    // to be excluded here, which left phone users unable to move a note.
    // A drag already in flight wins, so a second finger cannot hijack it.
    if (!canEdit || dragRef.current.pointerId >= 0) return;
    // 点图层按钮之类的控件不应该把便签拖走。
    if ((event.target as HTMLElement).closest("button")) return;
    // Only the primary mouse button starts a drag; touch and pen always do.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: note.x,
      originY: note.y,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 指针已经释放时捕获会抛错，跳过即可，不影响后续拖动判断。
    }
    event.currentTarget.style.zIndex = String(dragZ);
    // Mouse lifts immediately for direct-manipulation feedback; a finger waits
    // until real movement, otherwise a plain tap flashes the drag styling.
    if (event.pointerType === "mouse")
      event.currentTarget.classList.add("is-dragging");
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
    if (Math.hypot(dx, dy) > 8) {
      if (!drag.moved) {
        drag.moved = true;
        // Lift the note only once it actually moves, so a plain tap does not
        // flash the drag styling on a touch screen.
        event.currentTarget.classList.add("is-dragging");
      }
    }
    if (!drag.moved) return;
    event.currentTarget.style.left = clamp(drag.originX + dx, 18, 1172) + "px";
    event.currentTarget.style.top = clamp(drag.originY + dy, 110, 980) + "px";
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const element = event.currentTarget;
    if (event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.zIndex = String(baseZ);
    event.currentTarget.classList.remove("is-dragging");
    drag.pointerId = -1;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }

    if (drag.moved) {
      drag.moved = false;
      playFeedback(event.currentTarget, "is-settling");
      const x = Math.round(Number.parseFloat(event.currentTarget.style.left));
      const y = Math.round(Number.parseFloat(event.currentTarget.style.top));
      // If the save fails, roll back to the server coordinates instead of
      // leaving the note stranded at the dropped position.
      void onMove(note.id, x, y)
        .then(() => {
          if (element.isConnected) playFeedback(element, "is-saved");
        })
        .catch(() => cancelDrag());
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
      data-photo={note.imageUrl || note.imagePath ? "true" : undefined}
      data-linking={linkingFrom ? "true" : undefined}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : -1}
      aria-label={canEdit ? "编辑工作记录：" + note.title : undefined}
      style={{
        left: note.x,
        top: note.y,
        zIndex: baseZ,
        transform: "rotate(" + note.rotation + "deg)",
        backgroundImage: noteTextureUrl ? `url(${noteTextureUrl})` : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => cancelDrag()}
      onKeyDown={handleKeyDown}
    >
      {canLink && (
        <button
          className={linkingFrom ? "note-pin is-arming" : "note-pin"}
          type="button"
          aria-label={
            linkingFrom
              ? "选择这张便签完成连线"
              : "从这里拉一条线连接到另一张便签"
          }
          title={linkingFrom ? "点这里连上" : "连线"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPinClick(note);
          }}
        />
      )}
      {note.imageUrl || note.imagePath ? (
        <figure className="note-photo">
          <img
            src={note.imageUrl ?? note.imagePath ?? ""}
            alt={note.title || "线索照片"}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          {note.title.trim() && <figcaption>{note.title}</figcaption>}
        </figure>
      ) : (
        <>
          <h3>{note.title}</h3>
          <p>{note.body}</p>
        </>
      )}
      {canEdit && (
        <footer className="note-meta">
          <span className="note-layer-actions">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onLayerChange(note.id, note.layer + 1);
              }}
              aria-label="上移一层"
              title="上移一层"
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onLayerChange(note.id, note.layer - 1);
              }}
              aria-label="下移一层"
              title="下移一层"
            >
              <ChevronDown aria-hidden="true" />
            </button>
          </span>
        </footer>
      )}
    </article>
  );
}
