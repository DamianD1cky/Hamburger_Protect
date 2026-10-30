import { useLayoutEffect, useRef } from "react";

/** Only the decorative projection waits for motion; accessible text stays current. */
export function MotionText({ value }: { value: string | number }) {
  const visualRef = useRef<HTMLSpanElement>(null);
  const updateRef = useRef<((next: string) => void) | null>(null);
  const text = String(value);

  useLayoutEffect(() => {
    const visual = visualRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let latest = text;
    let outgoing = false;
    let animation: Animation | null = null;
    let disposed = false;
    visual.textContent = latest;

    const showLatest = () => {
      outgoing = false;
      animation?.cancel();
      animation = null;
      visual.textContent = latest;
    };
    updateRef.current = (next) => {
      latest = next;
      if (reduced.matches || !visual.animate) {
        showLatest();
        return;
      }
      // Coalesce bursts during the outgoing phase instead of queuing values.
      if (outgoing || visual.textContent === latest) return;
      animation?.cancel();
      outgoing = true;
      const exit = visual.animate(
        [
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          { opacity: 0, transform: "translateY(-3px)", filter: "blur(3px)" },
        ],
        { duration: 120, easing: "ease-in", fill: "forwards" },
      );
      animation = exit;
      void exit.finished.then(() => {
        if (disposed || animation !== exit) return;
        showLatest();
        const entrance = visual.animate(
          [
            { opacity: 0, transform: "translateY(3px)", filter: "blur(3px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
        animation = entrance;
        void entrance.finished.then(() => {
          if (animation === entrance) animation = null;
        }, () => {});
      }, () => {});
    };
    const onPreference = () => {
      if (reduced.matches) showLatest();
    };
    reduced.addEventListener("change", onPreference);
    return () => {
      disposed = true;
      animation?.cancel();
      updateRef.current = null;
      reduced.removeEventListener("change", onPreference);
    };
  }, []);

  useLayoutEffect(() => {
    updateRef.current?.(text);
  }, [text]);

  return (
    <span className="motion-text">
      <span className="motion-text-value" aria-hidden="true" ref={visualRef} />
      <span className="motion-text-accessible">{text}</span>
    </span>
  );
}
