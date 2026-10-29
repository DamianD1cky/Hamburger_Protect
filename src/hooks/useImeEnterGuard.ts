import {
  useRef,
  type CompositionEvent,
  type KeyboardEvent,
} from "react";

/**
 * CJK IME guard for form submission.
 *
 * When a Chinese/Japanese/Korean IME confirms a candidate with Enter, some
 * browsers deliver a second, synthetic-looking Enter keydown right after
 * `compositionend` — without a guard it submits the whole form while the
 * user is still typing. We timestamp `compositionend` and swallow a single
 * Enter that lands within 500ms of it, then reset so the next deliberate
 * Enter goes through. Enters during composition itself are left alone:
 * the IME owns them.
 *
 * Spread the returned handlers onto the <form> element.
 */
export function useImeEnterGuard() {
  const guardUntil = useRef(0);

  const onCompositionEnd = (_event: CompositionEvent<HTMLElement>) => {
    guardUntil.current = Date.now() + 500;
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
      return;
    if (Date.now() <= guardUntil.current) {
      guardUntil.current = 0;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return { onCompositionEnd, onKeyDownCapture };
}
