import { useEffect, useRef } from "react";
import type { BackgroundFit, PerspectiveScene } from "../campaign/domain/boardAppearance";
import { perspectiveState, renderPerspective } from "./renderer.js";

export function PerspectiveBackground({ scene, animated, preview, fit, positionX, positionY }: {
  scene: PerspectiveScene; animated: boolean; preview: boolean;
  fit: BackgroundFit; positionX: number; positionY: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, running = false, stopped = false, pointerActive = false;
    let time = scene === "station" ? .65 : .9;
    let previousTime = 0, lastPaint = 0, signature = "";
    const duration = scene === "station" ? 28 / 3 : 7;
    const draw = () => {
      const state = perspectiveState(scene, time);
      const next = [state.depth, state.vx, state.hy, state.layout, state.blue]
        .map((value) => value.toFixed(4)).join(":");
      if (next === signature) return;
      signature = next;
      renderPerspective(ctx, scene, time);
      canvas.dataset.time = time.toFixed(3);
      canvas.dataset.ready = "true";
    };
    const tick = (now: number) => {
      if (!running || stopped) return;
      if (previousTime) time = (time + Math.min((now - previousTime) / 1000, .1)) % duration;
      previousTime = now;
      const interval = canvas.clientWidth < 680 ? 1000 / 15 : 1000 / 24;
      if (now - lastPaint >= interval) { draw(); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      const next = !preview && animated && !motion.matches && !document.hidden &&
        !document.querySelector("dialog[open]") && !pointerActive;
      if (next === running) return;
      running = next;
      canvas.dataset.playing = String(running);
      cancelAnimationFrame(frame);
      previousTime = 0;
      if (running) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const parent = canvas.parentElement!;
      const maxWidth = preview ? 480 : innerWidth < 680 ? 960 : 1280;
      const width = Math.round(Math.min(maxWidth, Math.max(320,
        parent.clientWidth * Math.min(devicePixelRatio, 1.5), parent.clientHeight * 16 / 9)));
      canvas.width = width; canvas.height = Math.round(width * 9 / 16);
      signature = ""; draw();
    };
    const pointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".viewport, .board-tool-dock")) {
        pointerActive = true; sync();
      }
    };
    const pointerUp = () => { pointerActive = false; sync(); };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);
    // Dialogs are portaled to body; stop the wallpaper while an editor or the
    // WebGL dice tray is open, and resume from the same local frame on close.
    const dialogs = new MutationObserver(sync);
    dialogs.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["open"] });
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    window.addEventListener("blur", pointerUp);
    motion.addEventListener("change", sync);
    canvas.dataset.playing = "false";
    resize(); sync();
    return () => {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect(); dialogs.disconnect();
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      window.removeEventListener("blur", pointerUp);
      motion.removeEventListener("change", sync);
      canvas.width = canvas.height = 0;
    };
  }, [scene, animated, preview]);
  return <canvas className="perspective-background" ref={ref} data-perspective-scene={scene} aria-hidden="true"
    style={{ objectFit: fit === "contain" ? "contain" : "cover", objectPosition: `${positionX}% ${positionY}%` }} />;
}
