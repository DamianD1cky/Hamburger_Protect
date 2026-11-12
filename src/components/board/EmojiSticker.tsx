import { X } from "lucide-react";
import { useRef, type PointerEvent, type RefObject } from "react";
import type { BoardSticker } from "../../features/campaign/domain/types";
import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "../../features/campaign/domain/boardGeometry";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface EmojiStickerProps {
  sticker: BoardSticker;
  viewScaleRef: RefObject<number>;
  canEdit: boolean;
  onMove: (stickerId: string, x: number, y: number) => Promise<unknown>;
  onDelete: (stickerId: string) => Promise<unknown>;
}

export function EmojiSticker({
  sticker,
  viewScaleRef,
  canEdit,
  onMove,
  onDelete,
}: EmojiStickerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const rollback = () => {
    const element = elementRef.current;
    if (!element) return;
    element.style.left = sticker.x + "px";
    element.style.top = sticker.y + "px";
    element.classList.remove("is-dragging");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canEdit || (event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: sticker.x,
      originY: sticker.y,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone on a cancelled gesture.
    }
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.pointerId !== drag.pointerId) return;
    const scale = viewScaleRef.current || 1;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      event.currentTarget.classList.add("is-dragging");
    }
    if (!drag.moved) return;
    event.currentTarget.style.left = clamp(drag.originX + dx, 0, BOARD_WIDTH - STICKER_SIZE) + "px";
    event.currentTarget.style.top = clamp(drag.originY + dy, 0, BOARD_HEIGHT - STICKER_SIZE) + "px";
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.pointerId = -1;
    event.currentTarget.classList.remove("is-dragging");
    if (!drag.moved) return;
    drag.moved = false;
    const x = Math.round(Number.parseFloat(event.currentTarget.style.left));
    const y = Math.round(Number.parseFloat(event.currentTarget.style.top));
    event.currentTarget.style.left = x + "px";
    event.currentTarget.style.top = y + "px";
    void onMove(sticker.id, x, y).catch(rollback);
  };

  return (
    <div
      ref={elementRef}
      className="board-emoji-sticker"
      data-sticker-id={sticker.id}
      style={{ left: sticker.x, top: sticker.y, rotate: `${sticker.rotation}deg` }}
      aria-label={`Emoji 贴纸 ${sticker.emoji}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={rollback}
    >
      <span aria-hidden="true">{sticker.emoji}</span>
      {canEdit && (
        <button
          type="button"
          className="board-emoji-delete"
          aria-label={`删除贴纸 ${sticker.emoji}`}
          title="删除贴纸"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(sticker.id).catch(() => undefined);
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
