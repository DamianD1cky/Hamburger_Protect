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
  overview: { cx: 1245, cy: 770, width: 1620, height: 1390 },
  inventory: { cx: 760, cy: 760, width: 720, height: 1240 },
  tasks: { cx: 1270, cy: 500, width: 780, height: 850 },
  shifts: { cx: 1755, cy: 480, width: 690, height: 760 },
  safety: { cx: 1325, cy: 1050, width: 870, height: 700 },
  notes: { cx: 1650, cy: 1040, width: 800, height: 700 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function useBoardViewport() {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewScaleRef = useRef(1);
  const layoutReady = useRef(false);
  const [focusZone, setFocusZone] = useState<FocusZone>("overview");

  const layout = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;

    const mobile = window.innerWidth <= 760;
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
      const availableHeight = window.innerHeight - top - bottom;
      scale = Math.min(
        (window.innerWidth - 8) / zone.width,
        (availableHeight - 8) / zone.height,
      );
      scale = clamp(scale, 0.22, 0.64);
      tx = window.innerWidth / 2 - zone.cx * scale;
      ty = top + availableHeight / 2 - zone.cy * scale;
    } else {
      const frame = { cx: 1248, cy: 768, width: 1585, height: 1325 };
      scale = Math.min(
        (window.innerWidth - 32) / frame.width,
        (window.innerHeight - 24) / frame.height,
      );
      scale = clamp(scale, 0.38, 1.22);
      tx = window.innerWidth / 2 - frame.cx * scale;
      ty = window.innerHeight / 2 - frame.cy * scale;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewScaleRef.current = scale;
    world.style.transition =
      layoutReady.current && !reduceMotion
        ? "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
    world.style.transform =
      "translate3d(" + tx + "px, " + ty + "px, 0) scale(" + scale + ")";
    layoutReady.current = true;
  }, [focusZone]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = requestAnimationFrame(layout);
    window.addEventListener("resize", layout);
    media.addEventListener("change", layout);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", layout);
      media.removeEventListener("change", layout);
      document.body.classList.remove("is-focused");
    };
  }, [layout]);

  return { worldRef, viewScaleRef, focusZone, setFocusZone };
}
