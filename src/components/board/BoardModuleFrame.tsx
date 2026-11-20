import {
  useEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  canPlace,
  canPlaceRect,
  clampModuleSize,
  clampToBoard,
  nearestFreeSpot,
  nearestFreeRect,
  snap,
  type BoardModuleKey,
  type BoardModuleLayout,
  type BoardModuleRect,
  type ModulePlacementContext,
} from "../../features/campaign/domain/boardModules";

import type { CardVisualEffect } from "../../features/campaign/domain/cardEffects";

/**
 * 包住一个公告板区块，支持 GM 拖动位置、右下角缩放宽高。
 */
export function BoardModuleFrame({
  moduleKey,
  rect,
  effect: _effect,
  layout,
  canDrag,
  viewScaleRef,
  placementContext,
  onMove,
  onResize,
  children,
  obstacles,
  instanceId,
}: {
  moduleKey: BoardModuleKey;
  rect: BoardModuleRect;
  effect?: CardVisualEffect | null;
  layout: BoardModuleLayout | null | undefined;
  canDrag: boolean;
  viewScaleRef: RefObject<number>;
  placementContext?: ModulePlacementContext;
  onMove: (key: BoardModuleKey, x: number, y: number) => Promise<unknown>;
  onResize?: (
    key: BoardModuleKey,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => Promise<unknown>;
  children: ReactNode;
  obstacles?: BoardModuleRect[];
  instanceId?: string;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    mode: "idle" as "idle" | "move" | "resize",
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: rect.x,
    originY: rect.y,
    originW: rect.w,
    originH: rect.h,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    moved: false,
  });
  const suppressClick = useRef(false);

  const restore = () => {
    const element = elementRef.current;
    if (!element) return;
    element.style.left = rect.x + "px";
    element.style.top = rect.y + "px";
    element.style.width = rect.w + "px";
    element.style.height = rect.h + "px";
    element.classList.remove("is-dragging", "is-resizing", "is-blocked");
  };

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.style.left = rect.x + "px";
    element.style.top = rect.y + "px";
    element.style.width = rect.w + "px";
    element.style.height = rect.h + "px";
    dragRef.current.originX = rect.x;
    dragRef.current.originY = rect.y;
    dragRef.current.originW = rect.w;
    dragRef.current.originH = rect.h;
    dragRef.current.x = rect.x;
    dragRef.current.y = rect.y;
    dragRef.current.w = rect.w;
    dragRef.current.h = rect.h;
  }, [rect.x, rect.y, rect.w, rect.h]);

  useEffect(() => {
    if (!canDrag) return;
    const element = elementRef.current;
    if (!element) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag.mode === "idle" || event.pointerId !== drag.pointerId) return;
      const scale = viewScaleRef.current || 1;
      const dx = (event.clientX - drag.startX) / scale;
      const dy = (event.clientY - drag.startY) / scale;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= 4) return;
        drag.moved = true;
        suppressClick.current = true;
        try {
          element.setPointerCapture?.(event.pointerId);
        } catch {
          // ignore
        }
        element.classList.add(
          drag.mode === "resize" ? "is-resizing" : "is-dragging",
        );
      }
      event.preventDefault();

      if (drag.mode === "resize") {
        const size = clampModuleSize(
          moduleKey,
          drag.originW + dx,
          drag.originH + dy,
        );
        const clampedPos = clampToBoard(
          drag.originX,
          drag.originY,
          size.w,
          size.h,
        );
        const ctx: ModulePlacementContext = {
          ...placementContext,
          overrideSize: size,
        };
        element.classList.toggle(
          "is-blocked",
          !(obstacles
            ? canPlaceRect({ ...clampedPos, ...size }, obstacles)
            : canPlace(moduleKey, clampedPos.x, clampedPos.y, layout, 0, ctx)),
        );
        drag.x = clampedPos.x;
        drag.y = clampedPos.y;
        drag.w = size.w;
        drag.h = size.h;
        element.style.left = clampedPos.x + "px";
        element.style.top = clampedPos.y + "px";
        element.style.width = size.w + "px";
        element.style.height = size.h + "px";
        return;
      }

      const target = clampToBoard(
        snap(drag.originX + dx),
        snap(drag.originY + dy),
        drag.originW,
        drag.originH,
      );
      element.classList.toggle(
        "is-blocked",
        !(obstacles
          ? canPlaceRect({ ...rect, ...target }, obstacles)
          : canPlace(moduleKey, target.x, target.y, layout, 0, placementContext)),
      );
      drag.x = target.x;
      drag.y = target.y;
      element.style.left = target.x + "px";
      element.style.top = target.y + "px";
    };

    const finish = () => {
      const drag = dragRef.current;
      if (drag.mode === "idle") return;
      const mode = drag.mode;
      drag.mode = "idle";
      element.classList.remove("is-dragging", "is-resizing", "is-blocked");
      try {
        if (element.hasPointerCapture?.(drag.pointerId)) {
          element.releasePointerCapture?.(drag.pointerId);
        }
      } catch {
        // ignore
      }

      if (mode === "resize" && onResize) {
        const changed =
          drag.w !== rect.w ||
          drag.h !== rect.h ||
          drag.x !== rect.x ||
          drag.y !== rect.y;
        if (!drag.moved || !changed) {
          restore();
          drag.moved = false;
          return;
        }
        const ctx: ModulePlacementContext = {
          ...placementContext,
          overrideSize: { w: drag.w, h: drag.h },
        };
        const spot = canPlace(moduleKey, drag.x, drag.y, layout, 0, ctx)
          ? { x: drag.x, y: drag.y }
          : nearestFreeSpot(moduleKey, drag.x, drag.y, layout, ctx);
        drag.moved = false;
        if (!spot) {
          restore();
          return;
        }
        void onResize(moduleKey, spot.x, spot.y, drag.w, drag.h).catch(() =>
          restore(),
        );
        return;
      }

      const changed = drag.x !== rect.x || drag.y !== rect.y;
      if (!drag.moved || !changed) {
        restore();
        drag.moved = false;
        return;
      }
      const target = { ...rect, x: drag.x, y: drag.y };
      const fits = obstacles
        ? canPlaceRect(target, obstacles)
        : canPlace(moduleKey, drag.x, drag.y, layout, 0, placementContext);
      const spot = fits
        ? { x: drag.x, y: drag.y }
        : obstacles
          ? nearestFreeRect(target, obstacles)
          : nearestFreeSpot(moduleKey, drag.x, drag.y, layout, placementContext);
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
      dragRef.current.mode = "idle";
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
  }, [
    canDrag,
    layout,
    moduleKey,
    obstacles,
    onMove,
    onResize,
    placementContext,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    viewScaleRef,
  ]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDrag || event.button !== 0) return;
    const resizeGrip = (event.target as HTMLElement).closest(
      ".board-module-resize-handle",
    );
    if (resizeGrip && onResize) {
      event.stopPropagation();
      dragRef.current = {
        mode: "resize",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.x,
        originY: rect.y,
        originW: rect.w,
        originH: rect.h,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        moved: false,
      };
      return;
    }

    const handle = (event.target as HTMLElement).closest(
      ".board-section-heading, .board-module-handle",
    );
    if (!handle) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.x,
      originY: rect.y,
      originW: rect.w,
      originH: rect.h,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      moved: false,
    };
  };

  return (
    <div
      ref={elementRef}
      className={canDrag ? "board-module is-draggable" : "board-module"}
      data-module={instanceId ?? moduleKey}
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
      {canDrag && onResize && (
        <div
          className="board-module-resize-handle"
          title="拖拽右下角调整模块尺寸"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
