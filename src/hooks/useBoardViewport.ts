import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  BOARD_FRAME_INSET,
  BOARD_HEIGHT,
  BOARD_WIDTH,
} from "../features/campaign/domain/boardGeometry";
import {
  moduleRect,
  type BoardModuleKey,
  type BoardModuleLayout,
} from "../features/campaign/domain/boardModules";

export type FocusZone =
  | "overview"
  | "inventory"
  | "tasks"
  | "shifts"
  | "safety"
  | "notes";

const MIN_SCALE = 0.05;

/** 全览只包含板框；移动端区域聚焦使用模块当前坐标。 */
function focusBounds(zone: FocusZone, layout: BoardModuleLayout | undefined) {
  if (zone === "overview") {
    return {
      x: 0,
      y: 0,
      width: BOARD_WIDTH + BOARD_FRAME_INSET * 2,
      height: BOARD_HEIGHT + BOARD_FRAME_INSET * 2,
    };
  }

  const keys: BoardModuleKey[] =
    zone === "shifts"
      ? ["shifts", "index"]
      : [zone === "notes" ? "activity" : zone];
  const rects = keys.map((key) => moduleRect(key, layout));
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));

  return {
    x: left + BOARD_FRAME_INSET - 24,
    y: top + BOARD_FRAME_INSET - 24,
    width: right - left + 48,
    height: bottom - top + 48,
  };
}

function viewportBox(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const visual = window.visualViewport;
  const left = Math.max(rect.left, visual?.offsetLeft ?? 0);
  const top = Math.max(rect.top, visual?.offsetTop ?? 0);
  const right = Math.min(
    rect.right,
    (visual?.offsetLeft ?? 0) + (visual?.width ?? innerWidth),
  );
  const bottom = Math.min(
    rect.bottom,
    (visual?.offsetTop ?? 0) + (visual?.height ?? innerHeight),
  );

  return {
    left: left - rect.left,
    top: top - rect.top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function useBoardViewport(moduleLayout?: BoardModuleLayout) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState<HTMLDivElement | null>(null);
  const worldRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
    setWorld(element);
  }, []);
  const viewScaleRef = useRef(1);
  const layoutRef = useRef(moduleLayout);
  layoutRef.current = moduleLayout;
  const zoneRef = useRef<FocusZone>("overview");
  const [focusZone, updateFocusZone] = useState<FocusZone>("overview");

  const fit = useCallback((animate = false) => {
    const element = elementRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const viewport = viewportBox(container);
    const bounds = focusBounds(zoneRef.current, layoutRef.current);
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        (viewport.width - 24) / bounds.width,
        (viewport.height - 24) / bounds.height,
        1.3,
      ),
    );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const x = viewport.left + viewport.width / 2 - centerX * scale;
    const y = viewport.top + viewport.height / 2 - centerY * scale;

    element.style.transition =
      animate &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    viewScaleRef.current = scale;
  }, []);

  const setFocusZone = useCallback(
    (zone: FocusZone) => {
      zoneRef.current = zone;
      updateFocusZone(zone);
      fit(true);
    },
    [fit],
  );

  useLayoutEffect(() => {
    fit();
  }, [moduleLayout, fit]);

  useLayoutEffect(() => {
    const container = world?.parentElement;
    if (!world || !container) return;

    const visual = window.visualViewport;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fit());
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    schedule();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
    };
  }, [fit, world]);

  return { worldRef, viewScaleRef, focusZone, setFocusZone };
}
