import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  readableTextColor,
  resolveNoteColorHex,
  resolvePinColorVisual,
} from "../../features/campaign/domain/campaignSettings";
import {
  hasActiveCardEffect,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import type { BoardNote } from "../../features/campaign/domain/types";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
} from "../../features/campaign/domain/boardGeometry";
import { CardShaderCanvas } from "./CardEffectLayer";

export const BASE_NOTE_WIDTH = 276;
export const BASE_NOTE_MIN_HEIGHT = 196;
export const NOTE_SCALE_MIN = 0.6;
export const NOTE_SCALE_MAX = 2.2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function clampNoteScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) return 1;
  return Number(clamp(scale, NOTE_SCALE_MIN, NOTE_SCALE_MAX).toFixed(2));
}

interface NoteCardProps {
  note: BoardNote;
  defaultEffect?: CardVisualEffect | null;
  viewScaleRef: RefObject<number>;
  canEdit: boolean;
  noteTextureUrl: string | null;
  onEdit: (note: BoardNote, element: HTMLElement) => void;
  onMove: (noteId: string, x: number, y: number) => Promise<unknown>;
  onResize?: (noteId: string, scale: number) => Promise<unknown>;
  onPositionPreview: (
    noteId: string,
    x: number,
    y: number,
    scale?: number,
  ) => void;
  canLink: boolean;
  linkingFrom: boolean;
  onPinClick: (note: BoardNote) => void;
}

export function NoteCard({
  note,
  defaultEffect,
  viewScaleRef,
  canEdit,
  noteTextureUrl,
  onEdit,
  onMove,
  onResize,
  onPositionPreview,
  canLink,
  linkingFrom,
  onPinClick,
}: NoteCardProps) {
  const baseZ = 100 + note.layer;
  const dragZ = 1300;
  const elementRef = useRef<HTMLElement>(null);
  const [shaderHost, setShaderHost] = useState<HTMLElement | null>(null);
  const [contentMaskUrl, setContentMaskUrl] = useState<string | null>(null);

  const noteScale = clampNoteScale(note.scale);
  const noteWidth = Math.round(BASE_NOTE_WIDTH * noteScale);
  const noteMinHeight = Math.round(BASE_NOTE_MIN_HEIGHT * noteScale);

  const resolvedEffect = hasActiveCardEffect(note.effect)
    ? note.effect!
    : hasActiveCardEffect(defaultEffect)
      ? defaultEffect!
      : null;
  const shaderActive = Boolean(resolvedEffect);

  const noteBgHex = resolveNoteColorHex(note.color);
  const noteInk =
    resolvedEffect?.shader === "hologram"
      ? "#d9feff"
      : resolvedEffect?.shader === "parchment"
        ? "#2c1d0f"
        : readableTextColor(noteBgHex);
  const pinVisual = resolvePinColorVisual(note.pinColor);

  const dragRef = useRef({
    mode: "idle" as "idle" | "move" | "resize",
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    originScale: 1,
    nextScale: 1,
    moved: false,
  });
  const escapeListener = useRef<
    ((event: globalThis.KeyboardEvent) => void) | null
  >(null);

  const playFeedback = (element: HTMLElement, className: string) => {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener(
      "animationend",
      () => element.classList.remove(className),
      { once: true },
    );
  };

  const cancelDrag = (animate = true) => {
    const element = elementRef.current;
    const pointerId = dragRef.current.pointerId;
    if (element) {
      const currentX = Number.parseFloat(element.style.left);
      const currentY = Number.parseFloat(element.style.top);
      if (pointerId >= 0 && element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      element.classList.remove("is-dragging", "is-resizing", "is-settling");
      element.style.left = note.x + "px";
      element.style.top = note.y + "px";
      element.style.width = Math.round(BASE_NOTE_WIDTH * noteScale) + "px";
      element.style.minHeight =
        Math.round(BASE_NOTE_MIN_HEIGHT * noteScale) + "px";
      element.style.setProperty("--note-scale", String(noteScale));
      element.style.zIndex = String(baseZ);
      const dx = (Number.isFinite(currentX) ? currentX : note.x) - note.x;
      const dy = (Number.isFinite(currentY) ? currentY : note.y) - note.y;
      if (
        animate &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        (Math.abs(dx) > 1 || Math.abs(dy) > 1)
      ) {
        const rollback = element.animate(
          [{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }],
          {
            duration: 240,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
        void rollback.finished.then(
          () => rollback.cancel(),
          () => rollback.cancel(),
        );
      }
    }
    onPositionPreview(note.id, note.x, note.y, noteScale);
    dragRef.current.mode = "idle";
    dragRef.current.pointerId = -1;
    dragRef.current.moved = false;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (escapeListener.current) {
        window.removeEventListener("keydown", escapeListener.current, true);
      }
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!canEdit || dragRef.current.pointerId >= 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const isResizeGrip = Boolean(
      (event.target as HTMLElement).closest(".note-resize-handle"),
    );

    dragRef.current = {
      mode: isResizeGrip && onResize ? "resize" : "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: note.x,
      originY: note.y,
      originScale: noteScale,
      nextScale: noteScale,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    event.currentTarget.style.zIndex = String(dragZ);
    if (event.pointerType === "mouse") {
      event.currentTarget.classList.add(
        dragRef.current.mode === "resize" ? "is-resizing" : "is-dragging",
      );
    }
    event.preventDefault();
    const onEscape = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelDrag();
    };
    escapeListener.current = onEscape;
    window.addEventListener("keydown", onEscape, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag.mode === "idle" || event.pointerId !== drag.pointerId) return;
    const viewScale = viewScaleRef.current || 1;
    const dx = (event.clientX - drag.startX) / viewScale;
    const dy = (event.clientY - drag.startY) / viewScale;

    if (drag.mode === "resize") {
      if (Math.hypot(dx, dy) > 4 && !drag.moved) {
        drag.moved = true;
        event.currentTarget.classList.add("is-resizing");
      }
      if (!drag.moved) return;
      const originW = BASE_NOTE_WIDTH * drag.originScale;
      const rawScale = (originW + (dx + dy * 0.5)) / BASE_NOTE_WIDTH;
      const snappedScale = clampNoteScale(Math.round(rawScale * 20) / 20);
      drag.nextScale = snappedScale;
      const nextW = Math.round(BASE_NOTE_WIDTH * snappedScale);
      const nextMinH = Math.round(BASE_NOTE_MIN_HEIGHT * snappedScale);
      event.currentTarget.style.width = nextW + "px";
      event.currentTarget.style.minHeight = nextMinH + "px";
      event.currentTarget.style.setProperty("--note-scale", String(snappedScale));
      onPositionPreview(note.id, note.x, note.y, snappedScale);
      return;
    }

    if (Math.hypot(dx, dy) > 8 && !drag.moved) {
      drag.moved = true;
      event.currentTarget.classList.add("is-dragging");
    }
    if (!drag.moved) return;
    const x = clamp(
      drag.originX + dx,
      18,
      BOARD_WIDTH - event.currentTarget.offsetWidth - 18,
    );
    const y = clamp(
      drag.originY + dy,
      18,
      BOARD_HEIGHT - event.currentTarget.offsetHeight - 18,
    );
    event.currentTarget.style.left = x + "px";
    event.currentTarget.style.top = y + "px";
    onPositionPreview(note.id, x, y, noteScale);
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const element = event.currentTarget;
    if (drag.mode === "idle" || event.pointerId !== drag.pointerId) return;
    if (element.hasPointerCapture?.(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    const completedMode = drag.mode;
    const targetScale = drag.nextScale;
    element.style.zIndex = String(baseZ);
    element.classList.remove("is-dragging", "is-resizing");
    drag.mode = "idle";
    drag.pointerId = -1;
    if (escapeListener.current) {
      window.removeEventListener("keydown", escapeListener.current, true);
      escapeListener.current = null;
    }

    if (completedMode === "resize") {
      if (drag.moved && onResize && Math.abs(targetScale - noteScale) > 0.01) {
        drag.moved = false;
        void onResize(note.id, targetScale)
          .then(() => {
            if (element.isConnected) playFeedback(element, "is-saved");
          })
          .catch(() => cancelDrag(false));
      } else {
        drag.moved = false;
        cancelDrag(false);
      }
      return;
    }

    if (drag.moved) {
      drag.moved = false;
      playFeedback(element, "is-settling");
      const x = Math.round(Number.parseFloat(element.style.left));
      const y = Math.round(Number.parseFloat(element.style.top));
      element.style.left = x + "px";
      element.style.top = y + "px";
      onPositionPreview(note.id, x, y, noteScale);
      void onMove(note.id, x, y)
        .then(() => {
          if (element.isConnected) playFeedback(element, "is-saved");
        })
        .catch(() => cancelDrag());
    } else {
      onEdit(note, element);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!canEdit || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (elementRef.current) onEdit(note, elementRef.current);
  };

  const contentMaskStyle: CSSProperties | undefined =
    shaderActive && contentMaskUrl
      ? ({
          WebkitMaskImage: `url("${contentMaskUrl}")`,
          maskImage: `url("${contentMaskUrl}")`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        } as CSSProperties)
      : undefined;

  return (
    <article
      ref={(el) => {
        elementRef.current = el;
        setShaderHost(el);
      }}
      className="user-note"
      data-note-id={note.id}
      data-color={note.color}
      data-pinned={note.pinned}
      data-pin-color={note.pinColor}
      data-note-shader={shaderActive ? resolvedEffect!.shader : undefined}
      data-photo={note.imageUrl || note.imagePath ? "true" : undefined}
      data-linking={linkingFrom ? "true" : undefined}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : -1}
      aria-label={canEdit ? "编辑便签：" + note.title : undefined}
      style={
        {
          left: note.x,
          top: note.y,
          width: noteWidth,
          minHeight: noteMinHeight,
          zIndex: baseZ,
          // 绕顶部中心图钉孔旋转，确保任意角度旋转时红绳与图钉锚点 100% 锁定不偏离！
          transformOrigin: "50% 16.5px",
          transform: `rotate(${note.rotation}deg)`,
          "--note-scale": noteScale,
          "--note-custom-bg": noteBgHex,
          "--note-custom-ink": noteInk,
          "--pin-custom-fill": pinVisual.fill,
          "--pin-custom-stroke": pinVisual.stroke,
          "--pin-custom-hi": pinVisual.highlight,
          backgroundImage:
            !shaderActive && noteTextureUrl
              ? `url(${noteTextureUrl})`
              : undefined,
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => cancelDrag()}
      onKeyDown={handleKeyDown}
    >
      {shaderActive && resolvedEffect && (
        <CardShaderCanvas
          hostElement={shaderHost}
          effect={resolvedEffect}
          baseColorOverride={noteBgHex}
          onContentMaskChange={setContentMaskUrl}
        />
      )}

      {canLink && (
        <button
          className={linkingFrom ? "note-pin is-arming" : "note-pin"}
          type="button"
          aria-label={
            linkingFrom
              ? "选择这张便签完成连线"
              : "从这里拉一条线连接到另一张便签"
          }
          title={linkingFrom ? "点这里连上" : "连线"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPinClick(note);
          }}
        />
      )}

      <div className="user-note-content" style={contentMaskStyle}>
        {note.imageUrl || note.imagePath ? (
          <figure className="note-photo">
            <img
              src={note.imageUrl ?? note.imagePath ?? ""}
              alt={note.title || "线索照片"}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            {note.title.trim() && <figcaption>{note.title}</figcaption>}
          </figure>
        ) : (
          <>
            <h3>{note.title}</h3>
            <p>{note.body}</p>
          </>
        )}
      </div>

      {canEdit && onResize && (
        <span
          className="board-module-resize-handle note-resize-handle"
          title="拖拽右下角缩放便签尺寸"
          aria-hidden="true"
        />
      )}
    </article>
  );
}
