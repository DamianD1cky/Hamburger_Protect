import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A dedicated top-layer dialog: independent of .world transforms and board
// input handling. showModal makes the underlying board inert.
export function DiceLayer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={ref} className="dice-layer dice-dialog" aria-label="3D 骰盘"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>, document.body);
}
