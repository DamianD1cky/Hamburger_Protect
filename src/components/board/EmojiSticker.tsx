import { X, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useRef, useState, type PointerEvent, type RefObject } from "react";
import type { BoardSticker } from "../../features/campaign/domain/types";
import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "../../features/campaign/domain/boardGeometry";
import { normalizeStickerRotation, stickerPosition } from "../../features/campaign/domain/stickerGeometry";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface EmojiStickerProps {
  sticker: BoardSticker;
  viewScaleRef: RefObject<number>;
  canEdit: boolean;
  onMove: (stickerId: string, x: number, y: number) => Promise<unknown>;
  onDelete: (stickerId: string) => Promise<unknown>;
  onResize: (stickerId: string, scale: number) => Promise<unknown>;
  onRotate: (stickerId: string, rotation: number) => Promise<unknown>;
}

export function EmojiSticker({
  sticker,
  viewScaleRef,
  canEdit,
  onMove,
  onDelete,
  onResize,
  onRotate,
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
    const position = stickerPosition(drag.originX + dx, drag.originY + dy, sticker.scale ?? 1, sticker.rotation);
    event.currentTarget.style.left = position.x + "px";
    event.currentTarget.style.top = position.y + "px";
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
  const rotate = (rotation: number) => {
    setBusy(true);
    void onRotate(sticker.id, normalizeStickerRotation(rotation)).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <div
      ref={elementRef}
      className="board-emoji-sticker"
      data-sticker-id={sticker.id}
      style={{ left: sticker.x, top: sticker.y, width: size, height: size, fontSize: size * 58 / 72 }}
      tabIndex={canEdit ? 0 : undefined}
      data-scale={sticker.scale ?? 1}
      data-rotation={sticker.rotation}
      aria-label={`Emoji 贴纸 ${sticker.emoji}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={rollback}
    >
      <span className="board-emoji-glyph" aria-hidden="true" style={{ rotate: `${sticker.rotation}deg` }}>{sticker.emoji}</span>
      {canEdit && <>
        <div className="board-emoji-size" onPointerDown={(event) => event.stopPropagation()}
          style={{
            left: clamp(size / 2, 58 - sticker.x, BOARD_WIDTH - sticker.x - 58),
            ...(sticker.y + size + 72 > BOARD_HEIGHT ? { top: "auto", bottom: "calc(100% + 5px)" } : {}),
          }}>
          <button type="button" aria-label={`缩小贴纸 ${sticker.emoji}`} disabled={busy || sticker.scale <= .5}
            onClick={() => resize(Math.max(.5, (sticker.scale ?? 1) - .25))}><Minus size={16} /></button>
          <button type="button" aria-label={`恢复贴纸大小 ${sticker.emoji}`} disabled={busy}
            onClick={() => resize(1)}>{Math.round((sticker.scale ?? 1) * 100)}%</button>
          <button type="button" aria-label={`放大贴纸 ${sticker.emoji}`} disabled={busy || sticker.scale >= 2.5}
            onClick={() => resize(Math.min(2.5, (sticker.scale ?? 1) + .25))}><Plus size={16} /></button>
          <button type="button" aria-label={`逆时针旋转贴纸 ${sticker.emoji}`} title="逆时针旋转 15°" disabled={busy}
            onClick={() => rotate(sticker.rotation - 15)}><RotateCcw size={16} /></button>
          <button type="button" aria-label={`恢复贴纸角度 ${sticker.emoji}`} title="恢复为 0°" disabled={busy}
            onClick={() => rotate(0)}>{sticker.rotation}°</button>
          <button type="button" aria-label={`顺时针旋转贴纸 ${sticker.emoji}`} title="顺时针旋转 15°" disabled={busy}
            onClick={() => rotate(sticker.rotation + 15)}><RotateCw size={16} /></button>
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
