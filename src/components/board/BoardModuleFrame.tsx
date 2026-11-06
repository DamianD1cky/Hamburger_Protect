import { useEffect, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  boardModules,
  canPlace,
  clampToBoard,
  nearestFreeSpot,
  snap,
  type BoardModuleKey,
  type BoardModuleLayout,
  type BoardModuleRect,
} from "../../features/campaign/domain/boardModules";

/**
 * 包住一个公告板区块，让它能被 GM 拖动。
 *
 * 拖动只认标题牌（.sign / .index-heading）：按在正文里的按钮上仍然是正常点击，
 * 不会因为手抖把整块面板拖走。移动超过 4px 才算拖动，吸附到 10px 网格，
 * 目标位置压到别的模块时原地不动，松手后保存最后一次合法位置。
 */
export function BoardModuleFrame({
  moduleKey,
  rect,
  layout,
  canDrag,
  viewScaleRef,
  onMove,
  children,
}: {
  moduleKey: BoardModuleKey;
  rect: BoardModuleRect;
  layout: BoardModuleLayout | null | undefined;
  canDrag: boolean;
  viewScaleRef: RefObject<number>;
  onMove: (key: BoardModuleKey, x: number, y: number) => Promise<unknown>;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: rect.x,
    originY: rect.y,
    x: rect.x,
    y: rect.y,
    moved: false,
  });
  /** 刚拖完的那次 click 要吃掉，否则松手会误触下面的按钮。 */
  const suppressClick = useRef(false);

  const restore = () => {
    const element = elementRef.current;
    if (!element) return;
    element.style.left = rect.x + "px";
    element.style.top = rect.y + "px";
    element.classList.remove("is-dragging", "is-blocked");
  };

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.style.left = rect.x + "px";
    element.style.top = rect.y + "px";
    dragRef.current.originX = rect.x;
    dragRef.current.originY = rect.y;
    dragRef.current.x = rect.x;
    dragRef.current.y = rect.y;
  }, [rect.x, rect.y]);

  useEffect(() => {
    if (!canDrag) return;
    const element = elementRef.current;
    if (!element) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const scale = viewScaleRef.current || 1;
      const dx = (event.clientX - drag.startX) / scale;
      const dy = (event.clientY - drag.startY) / scale;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= 4) return;
        drag.moved = true;
        suppressClick.current = true;
        element.setPointerCapture?.(event.pointerId);
        element.classList.add("is-dragging");
      }
      event.preventDefault();

      const base = boardModules[moduleKey].rect;
      const target = clampToBoard(
        snap(drag.originX + dx),
        snap(drag.originY + dy),
        base.w,
        base.h,
      );
      // 始终跟着指针走，只在压到别人时标个「放不下」，松手再找落脚点。
      // 否则中途遇到障碍就完全拖不动了。
      element.classList.toggle(
        "is-blocked",
        !canPlace(moduleKey, target.x, target.y, layout),
      );
      drag.x = target.x;
      drag.y = target.y;
      element.style.left = target.x + "px";
      element.style.top = target.y + "px";
    };

    const finish = () => {
      const drag = dragRef.current;
      if (!drag.active) return;
      drag.active = false;
      element.classList.remove("is-dragging", "is-blocked");
      if (element.hasPointerCapture?.(drag.pointerId)) {
        element.releasePointerCapture?.(drag.pointerId);
      }
      const changed = drag.x !== rect.x || drag.y !== rect.y;
      if (!drag.moved || !changed) {
        restore();
        drag.moved = false;
        return;
      }
      // 落点压到别的模块时，就近找一个空位，保证松手后一定能放下。
      const spot = canPlace(moduleKey, drag.x, drag.y, layout)
        ? { x: drag.x, y: drag.y }
        : nearestFreeSpot(moduleKey, drag.x, drag.y, layout);
      drag.moved = false;
      if (!spot) {
        restore();
        return;
      }
      void onMove(moduleKey, spot.x, spot.y).catch(() => restore());
    };

    const onPointerUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragRef.current.pointerId) return;
      finish();
    };
    const onPointerCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragRef.current.pointerId) return;
      dragRef.current.active = false;
      dragRef.current.moved = false;
      restore();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [canDrag, layout, moduleKey, onMove, rect.x, rect.y, viewScaleRef]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDrag || event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest(
      ".sign, .index-heading, .board-module-handle",
    );
    if (!handle) return;
    // 标题牌上的操作按钮不触发拖动。
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.x,
      originY: rect.y,
      x: rect.x,
      y: rect.y,
      moved: false,
    };
  };

  return (
    <div
      ref={elementRef}
      className={canDrag ? "board-module is-draggable" : "board-module"}
      data-module={moduleKey}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={handlePointerDown}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      {children}
    </div>
  );
}
