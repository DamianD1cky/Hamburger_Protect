import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const ORIGIN_MOTION_QUERY = "(min-width: 761px)";

function originTransform(dialog: HTMLDialogElement, sourceRect?: DOMRect | null) {
  if (
    !sourceRect ||
    !window.matchMedia(ORIGIN_MOTION_QUERY).matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return null;
  const targetRect = dialog.getBoundingClientRect();
  if (
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.right < 0 ||
    sourceRect.bottom < 0 ||
    sourceRect.left > window.innerWidth ||
    sourceRect.top > window.innerHeight ||
    targetRect.width <= 0 ||
    targetRect.height <= 0
  )
    return null;
  return `translate3d(${sourceRect.left - targetRect.left}px, ${
    sourceRect.top - targetRect.top
  }px, 0) scale(${Math.max(0.08, sourceRect.width / targetRect.width)}, ${
    Math.max(0.08, sourceRect.height / targetRect.height)
  }) rotate(-1deg)`;
}

/** Native modal keeps focus inside and remains scrollable above the phone keyboard. */
export function PaperDialog({
  title,
  children,
  onClose,
  className = "",
  sourceRect,
  closing = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  sourceRect?: DOMRect | null;
  closing?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      // Phones get a full-screen sheet: no floating card, no wasted margins.
      // On desktop reserve 44px vertically so the dialog's hard offset
      // shadow (18px, plus spread) is never clipped by the window edge.
      const fullScreen = window.innerWidth <= 760;
      dialog.style.maxHeight = `${Math.max(100, height - (fullScreen ? 0 : 44))}px`;
      dialog.style.top = `${(viewport?.offsetTop ?? 0) + (fullScreen ? 0 : 22)}px`;
    };
    resize();
    dialog.showModal();
    const transform = originTransform(dialog, sourceRect);
    const opening = transform
      ? dialog.animate(
          [
            { transform, opacity: 0.28, borderRadius: "18px" },
            {
              transform: "translate3d(0, 0, 0) scale(1) rotate(0)",
              opacity: 1,
              borderRadius: getComputedStyle(dialog).borderRadius,
            },
          ],
          {
            duration: 280,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        )
      : null;
    if (opening) {
      dialog.classList.add("has-origin-motion");
      void opening.finished.then(
        () => opening.cancel(),
        () => opening.cancel(),
      );
    }
    // Focus the first editable field when there is one (creating/editing is
    // the point of most dialogs); otherwise keep the close button focused.
    const firstField = dialog.querySelector<HTMLElement>(
      'input:not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    firstField?.focus({ preventScroll: true });
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      opening?.cancel();
      dialog.close();
      // Return focus to whatever opened the dialog, if it is still around.
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [sourceRect]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !closing) return;
    dialog.inert = true;
    const transform = originTransform(dialog, sourceRect);
    if (!transform) return;
    const animation = dialog.animate(
      [
        {
          transform: "translate3d(0, 0, 0) scale(1) rotate(0)",
          opacity: 1,
        },
        { transform, opacity: 0.18, borderRadius: "18px" },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(0.4, 0, 0.8, 0.2)",
        fill: "forwards",
      },
    );
    return () => animation.cancel();
  }, [closing, sourceRect]);
  return (
    <dialog
      ref={ref}
      className={`paper-dialog ${className} ${closing ? "is-closing" : ""}`.trim()}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="composer-header">
        <div>
          <h1>{title}</h1>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={closing}
          aria-label="关闭"
        >
          <X />
        </button>
      </header>
      <div className="paper-dialog-body">{children}</div>
    </dialog>
  );
}
