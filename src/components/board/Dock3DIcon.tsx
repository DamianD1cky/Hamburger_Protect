import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderDock3DIcon, type Dock3DKind } from "../../features/dock/dock3dModels";

/**
 * 程序坞 3D 实体图标渲染器：
 * - 共用唯一离屏 Three.js WebGLRenderer（不增加 WebGL 上下文数量）；
 * - 静止时 0% 持续 GPU 占用，仅在鼠标悬停该图标时触发平滑 3D 微旋转与悬浮回弹；
 * - WebGL 不可用时静默回退到传入的矢量图标。
 */
export function Dock3DIcon({
  kind,
  fallback,
}: {
  kind: Dock3DKind;
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const hoverTarget = useRef(0);
  const hoverCurrent = useRef(0);
  const phaseRef = useRef(0);
  const rafRef = useRef(0);
  const lastMsRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ok = renderDock3DIcon(canvas, kind, 0, 0);
    if (!ok) {
      setFailed(true);
      return;
    }

    const hostBtn = canvas.closest("button");
    if (!hostBtn) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = (now: number) => {
      if (!canvasRef.current) {
        rafRef.current = 0;
        return;
      }
      const diceOpen = Boolean(document.querySelector(".dice-dialog[open]"));
      const dt = Math.min(0.05, Math.max(0.008, (now - lastMsRef.current) / 1000));
      lastMsRef.current = now;

      const target = hoverTarget.current;
      hoverCurrent.current += (target - hoverCurrent.current) * Math.min(1, dt * 10);
      if (target > 0.01) {
        phaseRef.current += dt * 2.2;
      }

      if (!document.hidden && !diceOpen) {
        renderDock3DIcon(
          canvasRef.current,
          kind,
          hoverCurrent.current,
          phaseRef.current,
        );
      }

      if (target > 0.01 || Math.abs(hoverCurrent.current - target) > 0.01) {
        rafRef.current = window.requestAnimationFrame(animate);
      } else {
        hoverCurrent.current = 0;
        phaseRef.current = 0;
        if (!document.hidden && !diceOpen) {
          renderDock3DIcon(canvasRef.current, kind, 0, 0);
        }
        rafRef.current = 0;
      }
    };

    const startLoop = () => {
      if (reduced || rafRef.current) return;
      lastMsRef.current = performance.now();
      rafRef.current = window.requestAnimationFrame(animate);
    };

    const onEnter = () => {
      hoverTarget.current = 1;
      startLoop();
    };
    const onLeave = () => {
      hoverTarget.current = 0;
      startLoop();
    };

    hostBtn.addEventListener("pointerenter", onEnter);
    hostBtn.addEventListener("pointerleave", onLeave);
    hostBtn.addEventListener("focus", onEnter);
    hostBtn.addEventListener("blur", onLeave);

    return () => {
      hostBtn.removeEventListener("pointerenter", onEnter);
      hostBtn.removeEventListener("pointerleave", onLeave);
      hostBtn.removeEventListener("focus", onEnter);
      hostBtn.removeEventListener("blur", onLeave);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [kind]);

  if (failed) {
    return <span className="macos-dock-icon" aria-hidden="true">{fallback}</span>;
  }

  return (
    <span className="macos-dock-icon is-3d-entity" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="macos-dock-3d-canvas"
        width={144}
        height={144}
      />
    </span>
  );
}
