import { useCallback, useLayoutEffect, useRef, useState } from "react";
export type FocusZone =
  "overview" | "inventory" | "tasks" | "shifts" | "safety" | "notes";
const COMPACT_QUERY = "(max-width: 1024px)";

export function useBoardViewport() {
  const [world, setWorld] = useState<HTMLDivElement | null>(null);
  const worldRef = useCallback(
    (element: HTMLDivElement | null) => setWorld(element),
    [],
  );
  const viewScaleRef = useRef(1);
  const [focusZone, setFocus] = useState<FocusZone>("overview");
  const setFocusZone = useCallback(
    (zone: FocusZone) => {
      setFocus(zone);
      if (!world || !window.matchMedia(COMPACT_QUERY).matches) return;
      const viewport = world.parentElement;
      const target =
        zone === "overview"
          ? world
          : world.querySelector<HTMLElement>(`[data-section="${zone}"]`);
      if (!viewport || !target) return;
      const top =
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop -
        14;
      viewport.scrollTo({
        top: Math.max(0, top),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    },
    [world],
  );

  useLayoutEffect(() => {
    if (!world?.parentElement) return;
    const viewport = world.parentElement;
    const compact = window.matchMedia(COMPACT_QUERY);
    let frame = 0;
    const layout = () => {
      if (compact.matches) {
        viewScaleRef.current = 1;
        world.style.transform = "none";
        world.style.transition = "none";
        return;
      }
      // Fit the board below the duty bar; initialize after the async board mounts.
      viewport.scrollTop = 0;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const top = 78;
      const availableHeight = Math.max(1, height - top - 18);
      const scale = Math.max(
        0.01,
        Math.min((width - 32) / 1620, availableHeight / 1350, 1.3),
      );
      viewScaleRef.current = scale;
      world.style.transition = "none";
      world.style.transform = `translate3d(${width / 2 - 1248 * scale}px,${top + availableHeight / 2 - 770 * scale}px,0) scale(${scale})`;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    compact.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    layout();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      compact.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [world]);
  return { worldRef, viewScaleRef, focusZone, setFocusZone };
}
