import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type FocusZone =
  "overview" | "inventory" | "tasks" | "shifts" | "safety" | "notes";

const COMPACT_QUERY = "(max-width: 1024px)";
const zones: Record<
  FocusZone,
  { cx: number; cy: number; width: number; height: number }
> = {
  overview: { cx: 1244, cy: 772, width: 1620, height: 1390 },
  inventory: { cx: 760, cy: 760, width: 720, height: 1240 },
  tasks: { cx: 1270, cy: 500, width: 780, height: 850 },
  shifts: { cx: 1755, cy: 570, width: 690, height: 1040 },
  safety: { cx: 1325, cy: 1050, width: 870, height: 700 },
  notes: { cx: 760, cy: 1110, width: 720, height: 580 },
};

function viewportBox(container: HTMLElement) {
  const visual = window.visualViewport;
  return {
    width: Math.min(
      container.clientWidth,
      visual?.width ?? container.clientWidth,
    ),
    height: Math.min(
      container.clientHeight,
      visual?.height ?? container.clientHeight,
    ),
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0,
  };
}

export function useBoardViewport() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState<HTMLDivElement | null>(null);
  const worldRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
    setWorld(element);
  }, []);
  const viewScaleRef = useRef(1);
  const previousZone = useRef<FocusZone | null>(null);
  const [focusZone, setFocusZone] = useState<FocusZone>("overview");

  const layout = useCallback(() => {
    const element = elementRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    const compact = window.matchMedia(COMPACT_QUERY).matches;
    const viewport = viewportBox(container);
    const zone = compact ? zones[focusZone] : zones.overview;
    const top = compact ? 10 : 76;
    const bottom = compact ? 10 : 14;
    const availableHeight = Math.max(1, viewport.height - top - bottom);
    const gutter = compact ? 8 : 32;
    const maxScale = compact ? (focusZone === "overview" ? 0.38 : 0.72) : 1.3;
    const scale = Math.max(
      0.05,
      Math.min(
        (viewport.width - gutter) / zone.width,
        availableHeight / zone.height,
        maxScale,
      ),
    );
    const x = viewport.left + viewport.width / 2 - zone.cx * scale;
    const y = viewport.top + top + availableHeight / 2 - zone.cy * scale;
    const changed =
      previousZone.current !== null && previousZone.current !== focusZone;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewScaleRef.current = scale;
    element.style.transition =
      changed && !reduceMotion
        ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    previousZone.current = focusZone;
  }, [focusZone]);

  useLayoutEffect(() => {
    const container = world?.parentElement;
    if (!world || !container) return;
    const visual = window.visualViewport;
    const compact = window.matchMedia(COMPACT_QUERY);
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    compact.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      compact.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
    };
  }, [layout, world]);

  return { worldRef, viewScaleRef, focusZone, setFocusZone };
}
