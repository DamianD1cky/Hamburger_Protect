import { useCallback, useEffect, useRef, useState } from "react";

export type FocusZone =
  | "overview"
  | "inventory"
  | "tasks"
  | "shifts"
  | "safety"
  | "notes";

const zones: Record<
  FocusZone,
  { cx: number; cy: number; width: number; height: number }
> = {
  overview: { cx: 1244, cy: 772, width: 1545, height: 1285 },
  inventory: { cx: 760, cy: 760, width: 720, height: 1240 },
  tasks: { cx: 1270, cy: 500, width: 780, height: 850 },
  shifts: { cx: 1755, cy: 480, width: 690, height: 760 },
  safety: { cx: 1325, cy: 1050, width: 870, height: 700 },
  notes: { cx: 1650, cy: 1040, width: 800, height: 700 },
};

const DESKTOP_BREAKPOINT = 760;

function getViewportSize(world: HTMLDivElement) {
  const container = world.parentElement;
  const visualViewport = window.visualViewport;
  const layoutWidth =
    container?.clientWidth || document.documentElement.clientWidth;
  const layoutHeight =
    container?.clientHeight || document.documentElement.clientHeight;

  return {
    width: Math.min(layoutWidth, visualViewport?.width ?? layoutWidth),
    height: Math.min(layoutHeight, visualViewport?.height ?? layoutHeight),
    offsetLeft: visualViewport?.offsetLeft ?? 0,
    offsetTop: visualViewport?.offsetTop ?? 0,
  };
}

export function useBoardViewport() {
  const worldElementRef = useRef<HTMLDivElement>(null);
  const [worldElement, setWorldElement] = useState<HTMLDivElement | null>(null);
  const worldRef = useCallback((element: HTMLDivElement | null) => {
    worldElementRef.current = element;
    setWorldElement(element);
  }, []);
  const viewScaleRef = useRef(1);
  const layoutReady = useRef(false);
  const previousFocusZone = useRef<FocusZone | null>(null);
  const [focusZone, setFocusZone] = useState<FocusZone>("overview");

  const layout = useCallback(() => {
    const world = worldElementRef.current;
    if (!world) return;

    const viewport = getViewportSize(world);
    const mobile = viewport.width <= DESKTOP_BREAKPOINT;
    document.body.classList.toggle(
      "is-focused",
      mobile && focusZone !== "overview",
    );
    let scale: number;
    let tx: number;
    let ty: number;

    if (mobile) {
      const zone = zones[focusZone];
      const top = 48;
      const bottom = 78;
      const availableWidth = Math.max(1, viewport.width - 16);
      const availableHeight = Math.max(1, viewport.height - top - bottom);
      scale = Math.max(
        0.05,
        Math.min(
          availableWidth / zone.width,
          availableHeight / zone.height,
          0.64,
        ),
      );
      tx = viewport.offsetLeft + viewport.width / 2 - zone.cx * scale;
      ty =
        viewport.offsetTop + top + availableHeight / 2 - zone.cy * scale;
    } else {
      const frame = zones.overview;
      const top = 64;
      const bottom = 12;
      const availableHeight = Math.max(1, viewport.height - top - bottom);
      scale = Math.max(
        0.05,
        Math.min(
          (viewport.width - 32) / frame.width,
          availableHeight / frame.height,
          1.22,
        ),
      );
      tx = viewport.offsetLeft + viewport.width / 2 - frame.cx * scale;
      ty =
        viewport.offsetTop + top + availableHeight / 2 - frame.cy * scale;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const focusChanged =
      previousFocusZone.current !== null &&
      previousFocusZone.current !== focusZone;
    viewScaleRef.current = scale;
    world.style.transition =
      layoutReady.current && focusChanged && !reduceMotion
        ? "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
    world.style.transform =
      "translate3d(" + tx + "px, " + ty + "px, 0) scale(" + scale + ")";
    layoutReady.current = true;
    previousFocusZone.current = focusZone;
  }, [focusZone]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visualViewport = window.visualViewport;
    const world = worldElement;
    let frame = 0;

    const scheduleLayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const resizeObserver = new ResizeObserver(scheduleLayout);

    if (world?.parentElement) resizeObserver.observe(world.parentElement);
    scheduleLayout();
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("orientationchange", scheduleLayout);
    visualViewport?.addEventListener("resize", scheduleLayout);
    visualViewport?.addEventListener("scroll", scheduleLayout);
    media.addEventListener("change", scheduleLayout);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("orientationchange", scheduleLayout);
      visualViewport?.removeEventListener("resize", scheduleLayout);
      visualViewport?.removeEventListener("scroll", scheduleLayout);
      media.removeEventListener("change", scheduleLayout);
      document.body.classList.remove("is-focused");
    };
  }, [layout, worldElement]);

  return { worldRef, viewScaleRef, focusZone, setFocusZone };
}
