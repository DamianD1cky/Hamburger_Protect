import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal keeps focus inside and remains scrollable above the phone keyboard. */
export function PaperDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      // Phones get a full-screen sheet: no floating card, no wasted margins.
      const fullScreen = window.innerWidth <= 760;
      dialog.style.maxHeight = `${Math.max(100, height - (fullScreen ? 0 : 24))}px`;
      dialog.style.top = `${(viewport?.offsetTop ?? 0) + (fullScreen ? 0 : 12)}px`;
    };
    resize();
    dialog.showModal();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`paper-dialog ${className}`.trim()}
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
          aria-label="关闭"
          autoFocus
        >
          <X />
        </button>
      </header>
      <div className="paper-dialog-body">{children}</div>
    </dialog>
  );
}
