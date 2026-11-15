import { ChevronLeft, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface DicePopoverAnchor {
  element: HTMLElement;
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  context?: { left: number; top: number; right: number; bottom: number };
}
export function dicePopoverAnchor(element: HTMLElement, context?: DicePopoverAnchor["context"]): DicePopoverAnchor {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return { element, rect: { left, top, right, bottom, width, height }, context };
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function DicePopover({ anchor, title, label, onClose, onBack, children, compact = false }: {
  anchor: DicePopoverAnchor;
  title: string;
  label: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CSSProperties>();
  const [closing, setClosing] = useState(false);
  const timer = useRef(0);
  const dismiss = (back = false) => {
    if (closing) return;
    const finish = back ? onBack ?? onClose : onClose;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else {
      setClosing(true);
      timer.current = window.setTimeout(finish, 140);
    }
  };
  useLayoutEffect(() => {
    const element = ref.current!;
    const place = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const left = (viewport?.offsetLeft ?? 0) + 12, top = (viewport?.offsetTop ?? 0) + 76;
      const right = left + width - 24, bottom = (viewport?.offsetTop ?? 0) + height - 20;
      const maxHeight = Math.max(100, Math.min(560, bottom - top));
      const panelWidth = Math.min(compact ? 282 : 352, width - 24);
      element.style.width = `${panelWidth}px`;
      element.style.maxHeight = `${maxHeight}px`;
      const panelHeight = element.offsetHeight;
      const source = anchor.element.isConnected && anchor.element.getClientRects().length
        ? anchor.element.getBoundingClientRect() : anchor.rect;
      const centerX = source.left + source.width / 2, centerY = source.top + source.height / 2;
      const options = onBack ? [
        { x: Math.max(source.right, anchor.context?.right ?? -Infinity) + 16, y: centerY - panelHeight / 2 },
        { x: Math.min(source.left, anchor.context?.left ?? Infinity) - panelWidth - 16, y: centerY - panelHeight / 2 },
        { x: centerX - panelWidth / 2, y: Math.max(source.bottom, anchor.context?.bottom ?? -Infinity) + 16 },
        { x: centerX - panelWidth / 2, y: Math.min(source.top, anchor.context?.top ?? Infinity) - panelHeight - 16 },
      ] : [
        { x: source.right - panelWidth, y: source.bottom + 16 },
        { x: source.left, y: source.top - panelHeight - 16 },
      ];
      const placed = options.map((point, index) => {
        const x = clamp(point.x, left, right - panelWidth), y = clamp(point.y, top, bottom - panelHeight);
        const obscuresDie = anchor.context && anchor.context.right > x && anchor.context.left < x + panelWidth &&
          anchor.context.bottom > y && anchor.context.top < y + panelHeight;
        return { x, y, cost: (point.x - x) ** 2 + (point.y - y) ** 2 + index * 100 + (obscuresDie ? 1e6 : 0) };
      }).sort((a, b) => a.cost - b.cost)[0];
      setLayout({
        left: placed.x, top: placed.y, width: panelWidth, maxHeight,
        "--popover-origin-x": `${clamp(centerX - placed.x, 0, panelWidth)}px`,
        "--popover-origin-y": `${clamp(centerY - placed.y, 0, panelHeight)}px`,
      } as CSSProperties);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [anchor, compact, onBack !== undefined]);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(timer.current);
      if (anchor.element.isConnected) anchor.element.focus({ preventScroll: true });
    };
  }, [anchor]);
  return <>
    <div className="dice-popover-dismiss" aria-hidden="true" onPointerDown={(event) => event.preventDefault()}
      onClick={() => dismiss()} />
    <div className={`dice-popover${closing ? " is-closing" : ""}`} ref={ref} role="dialog"
      aria-label={label} tabIndex={-1} style={layout} data-positioned={!!layout}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(!!onBack); }
        if (event.key === "Tab") {
          const targets = [...ref.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary")]
            .filter((target) => target.getClientRects().length);
          const first = targets[0], last = targets.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }
      }}>
      <header>
        {onBack && <button type="button" aria-label="返回骰子菜单" onClick={() => dismiss(true)}><ChevronLeft size={19} /></button>}
        <strong>{title}</strong>
        <button type="button" aria-label="收起面板" onClick={() => dismiss()}><X size={17} /></button>
      </header>
      <div className="dice-popover-content">{children}</div>
    </div>
  </>;
}
