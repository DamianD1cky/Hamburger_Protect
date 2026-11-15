import { X, Minus, Plus } from "lucide-react";
import { useRef, useState, type PointerEvent, type RefObject } from "react";
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
  onResize: (stickerId: string, scale: number) => Promise<unknown>;
}

export function EmojiSticker({
  sticker,
  viewScaleRef,
  canEdit,
  onMove,
  onDelete,
  onResize,
}: EmojiStickerProps) {
  const [busy, setBusy] = useState(false);
  const size = STICKER_SIZE * (sticker.scale ?? 1);
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
    dragRef.current.pointerId = -1;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canEdit || busy || (event.target as HTMLElement).closest("button")) return;
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
    event.currentTarget.style.left = clamp(drag.originX + dx, 0, BOARD_WIDTH - size) + "px";
    event.currentTarget.style.top = clamp(drag.originY + dy, 0, BOARD_HEIGHT - size) + "px";
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.pointerId = -1;
    event.currentTarget.classList.remove("is-dragging");
    if (!drag.moved) { event.currentTarget.focus({ preventScroll: true }); return; }
    drag.moved = false;
    const x = Math.round(Number.parseFloat(event.currentTarget.style.left));
    const y = Math.round(Number.parseFloat(event.currentTarget.style.top));
    event.currentTarget.style.left = x + "px";
    event.currentTarget.style.top = y + "px";
    setBusy(true);
    void onMove(sticker.id, x, y).catch(rollback).finally(() => setBusy(false));
  };
  const resize = (scale: number) => {
    setBusy(true);
    void onResize(sticker.id, scale).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <div
      ref={elementRef}
      className="board-emoji-sticker"
      data-sticker-id={sticker.id}
      style={{ left: sticker.x, top: sticker.y, width: size, height: size, fontSize: size * 58 / 72, rotate: `${sticker.rotation}deg` }}
      tabIndex={canEdit ? 0 : undefined}
      data-scale={sticker.scale ?? 1}
      aria-label={`Emoji 贴纸 ${sticker.emoji}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={rollback}
    >
      <span aria-hidden="true">{sticker.emoji}</span>
      {canEdit && <>
        <div className="board-emoji-size" onPointerDown={(event) => event.stopPropagation()}
          style={{
            left: clamp(size / 2, 54 - sticker.x, BOARD_WIDTH - sticker.x - 54),
            ...(sticker.y + size + 38 > BOARD_HEIGHT ? { top: "auto", bottom: "calc(100% + 5px)" } : {}),
          }}>
          <button type="button" aria-label={`缩小贴纸 ${sticker.emoji}`} disabled={busy || sticker.scale <= .5}
            onClick={() => resize(Math.max(.5, (sticker.scale ?? 1) - .25))}><Minus size={16} /></button>
          <button type="button" aria-label={`恢复贴纸大小 ${sticker.emoji}`} disabled={busy}
            onClick={() => resize(1)}>{Math.round((sticker.scale ?? 1) * 100)}%</button>
          <button type="button" aria-label={`放大贴纸 ${sticker.emoji}`} disabled={busy || sticker.scale >= 2.5}
            onClick={() => resize(Math.min(2.5, (sticker.scale ?? 1) + .25))}><Plus size={16} /></button>
        </div>
        <button
          type="button"
          className="board-emoji-delete"
          aria-label={`删除贴纸 ${sticker.emoji}`}
          title="删除贴纸"
          disabled={busy}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(sticker.id).catch(() => undefined);
          }}
        >
          <X aria-hidden="true" />
        </button>
      </>}
    </div>
  );
}
