import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Toolbar panels use an anchored nonmodal popover on wide screens and a
 * native modal sheet on compact screens. Outside clicks never discard drafts. */
export function MenuPopover({ anchor, title, id, children, onClose, className = "", width: preferredWidth = 320, keepMounted = false }: {
  anchor: HTMLElement | null; title: string; id: string; children: ReactNode;
  onClose: () => void; className?: string; width?: number; keepMounted?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const dialog = ref.current;
    if (compact) dialog.showModal();
    else if (typeof dialog.showPopover === "function") dialog.showPopover();
    else dialog.show();
    const place = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      if (compact) {
        Object.assign(dialog.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`,
          maxHeight: `${height}px`, height: `${height}px` });
        dialog.dataset.positioned = "true";
        return;
      }
      if (!anchor.isConnected) { close.current(); return; }
      const source = anchor.getBoundingClientRect();
      const panelWidth = Math.min(preferredWidth, width - 24);
      const below = top + height - source.bottom - 24, above = source.top - top - 24;
      const side = below >= Math.min(360, height * .6) || below >= above ? "bottom" : "top";
      const available = side === "bottom" ? below : above;
      dialog.style.width = `${panelWidth}px`;
      dialog.style.height = "auto";
      dialog.style.maxHeight = `${Math.max(100, Math.min(620, available))}px`;
      const panelHeight = dialog.offsetHeight;
      const anchorCenter = source.left + source.width / 2;
      const x = Math.max(left + 12, Math.min(anchorCenter - panelWidth + 24, left + width - panelWidth - 12));
      const y = side === "bottom" ? source.bottom + 12 : source.top - panelHeight - 12;
      dialog.style.left = `${x}px`;
      dialog.style.top = `${Math.max(top + 12, y)}px`;
      dialog.style.setProperty("--menu-arrow-x", `${Math.max(20, Math.min(anchorCenter - x, panelWidth - 20))}px`);
      dialog.dataset.side = side;
      dialog.dataset.positioned = "true";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!compact && !dialog.contains(target) && !anchor.contains(target) &&
        !(target instanceof Element && target.closest("[data-top-menu-trigger]"))) close.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!compact && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close.current();
      }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    const first = [...dialog.querySelectorAll<HTMLElement>(
      'input:not(:disabled):not([type="file"]), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)',
    )].find((element) => element.getClientRects().length);
    (first ?? dialog).focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      const restore = dialog.contains(document.activeElement) || document.activeElement === document.body;
      if (typeof dialog.hidePopover === "function" && dialog.matches(":popover-open")) dialog.hidePopover();
      if (dialog.open) dialog.close();
      if (restore && anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, compact, preferredWidth]);
  // Stateful child forms can stay mounted while their native dialog is closed.
  if (!anchor && !keepMounted) return null;
  return createPortal(<dialog ref={ref} id={id} role="dialog" aria-label={title} aria-modal={compact}
    popover={compact ? undefined : "manual"} tabIndex={-1} data-compact={compact} data-positioned="false"
    className={`paper-dialog menu-popover ${className}`} onCancel={(event) => {
      event.preventDefault(); close.current();
    }}>
    <header className="composer-header">
      <h1>{title}</h1>
      <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X /></button>
    </header>
    <div className="paper-dialog-body">{children}</div>
  </dialog>, document.body);
}
