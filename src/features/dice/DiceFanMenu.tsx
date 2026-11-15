import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DiceSelection } from "./DiceScene";
import { layoutDiceFan } from "./fanLayout";

export interface DiceFanAction {
  id: string;
  label: string;
  accessibleLabel: string;
  icon: ReactNode;
  onClick: (button: HTMLButtonElement) => void;
  disabled?: boolean;
  tone?: "primary" | "destructive";
}

export function DiceFanMenu({ selection, label, actions, onClose }: {
  selection: DiceSelection;
  label: string;
  actions: DiceFanAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [closing, setClosing] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const selectionKey = selection.ids.join("|");
  const [size, setSize] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const stage = ref.current!.parentElement!;
    const resize = () => setSize({ x: stage.clientWidth, y: stage.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    // A touch pointerup opens the menu before the browser synthesizes its
    // click. The emerging petals must not receive that initiating click.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ready = window.setTimeout(() => setInteractive(true), reduced ? 40 : 340 + (actions.length - 1) * 24);
    return () => clearTimeout(ready);
  }, [selectionKey, actions.length]);
  useEffect(() => {
    if (size.x && size.y && interactive) {
      ref.current?.querySelector<HTMLButtonElement>(".dice-fan-action:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [selectionKey, !!size.x, interactive]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) onClose();
    else timer.current = window.setTimeout(onClose, 160);
  };
  const layout = size.x && size.y ? layoutDiceFan(selection, size, actions.length) : null;
  return <div ref={ref} role="group" aria-label="骰子选项"
    className={`dice-object-menu dice-fan-menu${closing ? " is-closing" : ""}`}
    data-fan-ready={layout !== null}
    data-interactive={interactive}
    style={{ "--fan-width": `${layout?.width ?? 80}px` } as CSSProperties}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      }
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>(".dice-fan-action:not(:disabled)")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
    }}>
    {layout && actions.map((action, index) => {
      const point = layout.points[index];
      return <button key={action.id} type="button" className="dice-fan-action"
        aria-label={action.accessibleLabel} disabled={closing || action.disabled}
        data-tone={action.tone ?? "neutral"}
        style={{
          left: point.x - layout.width / 2, top: point.y - layout.height / 2,
          "--fan-from-x": `${selection.x - point.x}px`,
          "--fan-from-y": `${selection.y - point.y}px`,
          "--fan-delay": `${index * 24}ms`,
        } as CSSProperties}
        onClick={(event) => action.onClick(event.currentTarget)}>
        <span className="dice-fan-glass" aria-hidden="true">{action.icon}</span>
        <span className="dice-fan-label">{action.label}</span>
      </button>;
    })}
    {layout && <button type="button" className="dice-fan-hub"
      aria-label="关闭骰子选项" disabled={closing} onClick={close}
      style={{ left: layout.hub.x, top: layout.hub.y }}>
      <span>{label}</span><X size={13} aria-hidden="true" />
    </button>}
  </div>;
}
