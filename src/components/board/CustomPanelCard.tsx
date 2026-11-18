import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  Clock3,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  canPlaceRect,
  clampToBoard,
  nearestFreeSpotForRect,
  snap,
  type BoardModuleRect,
} from "../../features/campaign/domain/boardModules";
import {
  defaultCardVisualEffect,
  hasActiveCardEffect,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import {
  ATOMIC_PANEL_TEMPLATES,
  PANEL_MAX_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  normalizeCustomPanel,
  type BoardCustomPanel,
  type CustomPanelBlock,
  type CustomPanelInteraction,
  type CustomPanelInteractiveRole,
  type ResourceBlockStatus,
  type TaskBlockStatus,
} from "../../features/campaign/domain/customPanels";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { PaperDialog } from "../composer/PaperDialog";
import { BoardContentCard, BoardSectionHeader } from "./BoardSectionPrimitives";
import { CardEffectPicker, CardEffectProvider } from "./CardEffectLayer";
import { ColorField } from "./ColorField";

const RESOURCE_STATUS_LABELS: Record<ResourceBlockStatus, string> = {
  ok: "充足",
  low: "紧缺",
  out: "耗尽",
};

const TASK_STATUS_LABELS: Record<TaskBlockStatus, string> = {
  open: "待认领",
  in_progress: "进行中",
  completed: "已完成",
};

const TASK_NEXT_HINTS: Record<TaskBlockStatus, string> = {
  open: "认领并开始执行",
  in_progress: "标记委托完成",
  completed: "重新开放委托",
};

/** 原子能力交互积木渲染器（包含新增的物资库存块 resource_list、委托流转块 task_board 与带分类标签核对块）。 */
function InteractivePanelBlockView({
  block,
  actorName,
  canInteract,
  onInteract,
}: {
  block: CustomPanelBlock;
  actorName?: string;
  canInteract: boolean;
  onInteract: (blockId: string, action: CustomPanelInteraction) => void;
}) {
  const [quickDraft, setQuickDraft] = useState("");
  const [quickSubDraft, setQuickSubDraft] = useState("");

  if (block.type === "segmented") {
    return (
      <div className="hig-block hig-segmented-block">
        <span className="hig-block-label">{block.label}</span>
        <div
          className="hig-segmented-track"
          role="radiogroup"
          aria-label={block.label}
        >
          {block.options.map((opt) => {
            const selected = block.value === opt;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                key={opt}
                disabled={!canInteract}
                className={
                  selected ? "hig-segment is-selected" : "hig-segment"
                }
                onClick={() =>
                  onInteract(block.id, { type: "set_option", value: opt })
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (block.type === "select") {
    return (
      <div className="hig-block hig-row-card">
        <label className="hig-select-row">
          <span className="hig-row-title">{block.label}</span>
          <select
            className="hig-popup-select"
            aria-label={block.label}
            disabled={!canInteract}
            value={block.value}
            onChange={(e) =>
              onInteract(block.id, {
                type: "set_option",
                value: e.target.value,
              })
            }
          >
            {block.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (block.type === "toggle") {
    return (
      <div className="hig-block hig-row-card">
        <div className="hig-toggle-row">
          <div className="hig-toggle-copy">
            <span className="hig-row-title">{block.label}</span>
            {block.description && <small>{block.description}</small>}
          </div>
          <button
            type="button"
            role="switch"
            aria-label={block.label}
            aria-checked={block.checked}
            disabled={!canInteract}
            className={block.checked ? "hig-switch is-on" : "hig-switch"}
            onClick={() =>
              onInteract(block.id, {
                type: "toggle_switch",
                checked: !block.checked,
              })
            }
          >
            <span className="hig-switch-thumb" />
          </button>
        </div>
      </div>
    );
  }

  if (block.type === "checkbox_group") {
    const done = block.items.filter((i) => i.checked).length;
    const pct = block.items.length
      ? Math.round((done / block.items.length) * 100)
      : 0;
    return (
      <div className="hig-block hig-checklist-block">
        <div className="hig-block-header">
          <span className="hig-block-label">{block.label}</span>
          <small>
            {done}/{block.items.length}
          </small>
        </div>
        {block.showProgress && block.items.length > 0 && (
          <div className="hig-meter-track hig-checklist-meter" aria-hidden="true">
            <span className="hig-meter-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="hig-inset-list" role="group" aria-label={block.label}>
          {block.items.length === 0 && (
            <span className="hig-empty-inline">暂无检查项</span>
          )}
          {block.items.map((item) => (
            <button
              type="button"
              role="checkbox"
              aria-checked={item.checked}
              key={item.id}
              disabled={!canInteract}
              className={
                item.checked ? "hig-check-row is-checked" : "hig-check-row"
              }
              onClick={() =>
                onInteract(block.id, {
                  type: "toggle_checkbox",
                  itemId: item.id,
                })
              }
            >
              <span className="hig-check-box" aria-hidden="true">
                {item.checked && <Check />}
              </span>
              <span className="hig-check-text">{item.label}</span>
              {item.tag && <em className="hig-item-tag">{item.tag}</em>}
            </button>
          ))}
        </div>
        {canInteract && block.allowQuickAdd && (
          <div className="hig-quick-add-row">
            <input
              value={quickDraft}
              maxLength={64}
              placeholder="新增核对项…"
              aria-label={`向${block.label}添加核对项`}
              onChange={(e) => setQuickDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickDraft.trim()) {
                  e.preventDefault();
                  onInteract(block.id, {
                    type: "add_checkbox_item",
                    label: quickDraft.trim(),
                    tag: quickSubDraft.trim() || undefined,
                  });
                  setQuickDraft("");
                  setQuickSubDraft("");
                }
              }}
            />
            <input
              className="hig-quick-subinput"
              value={quickSubDraft}
              maxLength={16}
              placeholder="分类"
              aria-label="核对项分类标签"
              onChange={(e) => setQuickSubDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!quickDraft.trim()}
              aria-label={`确认添加核对项到${block.label}`}
              onClick={() => {
                if (!quickDraft.trim()) return;
                onInteract(block.id, {
                  type: "add_checkbox_item",
                  label: quickDraft.trim(),
                  tag: quickSubDraft.trim() || undefined,
                });
                setQuickDraft("");
                setQuickSubDraft("");
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "resource_list") {
    return (
      <div className="hig-block hig-resource-block">
        <div className="hig-block-header">
          <span className="hig-block-label">{block.label}</span>
          <small>{block.items.length} 项</small>
        </div>
        <div className="hig-inset-list" role="list" aria-label={block.label}>
          {block.items.length === 0 && (
            <span className="hig-empty-inline">暂无物资记录</span>
          )}
          {block.items.map((item) => (
            <div className="hig-resource-row" role="listitem" key={item.id}>
              <span className="hig-resource-name">{item.name}</span>
              <span className="hig-resource-controls">
                {canInteract && (
                  <button
                    type="button"
                    className="hig-mini-step"
                    aria-label={`${item.name}数量减一`}
                    disabled={item.quantity <= 0}
                    onClick={() =>
                      onInteract(block.id, {
                        type: "step_resource_qty",
                        itemId: item.id,
                        delta: -1,
                      })
                    }
                  >
                    <Minus aria-hidden="true" />
                  </button>
                )}
                <strong className="hig-resource-qty">
                  ×{item.quantity}
                  {item.unit ? ` ${item.unit}` : ""}
                </strong>
                {canInteract && (
                  <button
                    type="button"
                    className="hig-mini-step"
                    aria-label={`${item.name}数量加一`}
                    onClick={() =>
                      onInteract(block.id, {
                        type: "step_resource_qty",
                        itemId: item.id,
                        delta: 1,
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canInteract}
                  className="hig-resource-badge"
                  data-status={item.status}
                  title={canInteract ? "点击切换库存状态" : undefined}
                  aria-label={`${item.name}状态：${RESOURCE_STATUS_LABELS[item.status]}`}
                  onClick={() =>
                    onInteract(block.id, {
                      type: "cycle_resource_status",
                      itemId: item.id,
                    })
                  }
                >
                  {RESOURCE_STATUS_LABELS[item.status]}
                </button>
              </span>
            </div>
          ))}
        </div>
        {canInteract && block.allowQuickAdd && (
          <div className="hig-quick-add-row">
            <input
              value={quickDraft}
              maxLength={40}
              placeholder="补充物资名称…"
              aria-label={`向${block.label}补充物资`}
              onChange={(e) => setQuickDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickDraft.trim()) {
                  e.preventDefault();
                  onInteract(block.id, {
                    type: "add_resource_item",
                    name: quickDraft.trim(),
                    quantity: 1,
                    unit: quickSubDraft.trim() || undefined,
                  });
                  setQuickDraft("");
                  setQuickSubDraft("");
                }
              }}
            />
            <input
              className="hig-quick-subinput"
              value={quickSubDraft}
              maxLength={8}
              placeholder="单位"
              aria-label="物资单位"
              onChange={(e) => setQuickSubDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!quickDraft.trim()}
              aria-label={`确认添加物资到${block.label}`}
              onClick={() => {
                if (!quickDraft.trim()) return;
                onInteract(block.id, {
                  type: "add_resource_item",
                  name: quickDraft.trim(),
                  quantity: 1,
                  unit: quickSubDraft.trim() || undefined,
                });
                setQuickDraft("");
                setQuickSubDraft("");
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "task_board") {
    const activeCount = block.items.filter((t) => t.status !== "completed").length;
    const doneCount = block.items.length - activeCount;
    return (
      <div className="hig-block hig-task-block">
        <div className="hig-block-header">
          <span className="hig-block-label">{block.label}</span>
          <small>
            进行中 {activeCount} · 已完成 {doneCount}
          </small>
        </div>
        <div className="hig-inset-list" role="list" aria-label={block.label}>
          {block.items.length === 0 && (
            <span className="hig-empty-inline">暂无委托记录</span>
          )}
          {block.items.map((task) => {
            const StatusIcon =
              task.status === "completed"
                ? RotateCcw
                : task.status === "in_progress"
                  ? Clock3
                  : Circle;
            return (
              <div
                className={
                  task.status === "completed"
                    ? "hig-task-row is-completed"
                    : "hig-task-row"
                }
                role="listitem"
                key={task.id}
              >
                <button
                  type="button"
                  className="hig-task-trigger"
                  disabled={!canInteract}
                  data-status={task.status}
                  title={TASK_NEXT_HINTS[task.status]}
                  aria-label={`${task.title}：${TASK_NEXT_HINTS[task.status]}`}
                  onClick={() =>
                    onInteract(block.id, {
                      type: "advance_task_status",
                      itemId: task.id,
                      actorName,
                    })
                  }
                >
                  <StatusIcon aria-hidden="true" />
                </button>
                <div className="hig-task-copy">
                  <strong className="hig-task-title">{task.title}</strong>
                  {task.detail && (
                    <span className="hig-task-detail">{task.detail}</span>
                  )}
                  <span className="hig-task-meta">
                    <span>{task.assignee || "待认领"}</span>
                    {task.due && <span>{task.due}</span>}
                    <i data-status={task.status}>
                      {TASK_STATUS_LABELS[task.status]}
                    </i>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {canInteract && block.allowQuickAdd && (
          <div className="hig-quick-add-row">
            <input
              value={quickDraft}
              maxLength={60}
              placeholder="发布新委托标题…"
              aria-label={`向${block.label}发布新委托`}
              onChange={(e) => setQuickDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickDraft.trim()) {
                  e.preventDefault();
                  onInteract(block.id, {
                    type: "add_task_item",
                    title: quickDraft.trim(),
                    due: quickSubDraft.trim() || undefined,
                  });
                  setQuickDraft("");
                  setQuickSubDraft("");
                }
              }}
            />
            <input
              className="hig-quick-subinput"
              value={quickSubDraft}
              maxLength={16}
              placeholder="时限/赏金"
              aria-label="委托时限或赏金"
              onChange={(e) => setQuickSubDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!quickDraft.trim()}
              aria-label={`确认发布委托到${block.label}`}
              onClick={() => {
                if (!quickDraft.trim()) return;
                onInteract(block.id, {
                  type: "add_task_item",
                  title: quickDraft.trim(),
                  due: quickSubDraft.trim() || undefined,
                });
                setQuickDraft("");
                setQuickSubDraft("");
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "stepper") {
    const span = Math.max(1, block.max - block.min);
    const pct = Math.max(
      0,
      Math.min(100, ((block.value - block.min) / span) * 100),
    );
    return (
      <div
        className="hig-block hig-row-card hig-stepper-card"
        data-tone={block.tone ?? "neutral"}
      >
        <div className="hig-stepper-top">
          <span className="hig-row-title">{block.label}</span>
          <div className="hig-stepper-controls">
            <strong className="hig-stepper-value">
              {block.value}
              <small>
                /{block.max}
                {block.unit ? ` ${block.unit}` : ""}
              </small>
            </strong>
            {canInteract && (
              <span className="hig-stepper-capsule">
                <button
                  type="button"
                  aria-label={`${block.label}减少`}
                  disabled={block.value <= block.min}
                  onClick={() =>
                    onInteract(block.id, { type: "step_value", delta: -1 })
                  }
                >
                  <Minus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`${block.label}增加`}
                  disabled={block.value >= block.max}
                  onClick={() =>
                    onInteract(block.id, { type: "step_value", delta: 1 })
                  }
                >
                  <Plus aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="hig-meter-track" aria-hidden="true">
          <span className="hig-meter-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (block.type === "kv_list") {
    return (
      <div className="hig-block">
        {block.label && <span className="hig-block-label">{block.label}</span>}
        <div className="custom-panel-kv-grid" role="list">
          {block.rows.map((row, idx) => (
            <div
              className="custom-panel-kv-row"
              data-tone={row.tone ?? "neutral"}
              role="listitem"
              key={`${row.label}-${idx}`}
            >
              <span className="kv-label">{row.label}</span>
              <strong className="kv-value">{row.value || "—"}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        block.emphasis === "callout"
          ? "hig-block hig-note-block is-callout"
          : "hig-block hig-note-block"
      }
    >
      {block.heading && (
        <div className="hig-note-heading">
          {block.emphasis === "callout" && <AlertTriangle aria-hidden="true" />}
          <strong>{block.heading}</strong>
        </div>
      )}
      {block.text && <p className="hig-note-text">{block.text}</p>}
    </div>
  );
}

export function CustomPanelCard({
  panel,
  actorName,
  defaultEffect,
  obstacles,
  canManage,
  canMemberInteract,
  viewScaleRef,
  onEdit,
  onDelete,
  onInteract,
  onUpdateGeometry,
}: {
  panel: BoardCustomPanel;
  actorName?: string;
  defaultEffect?: CardVisualEffect | null;
  obstacles: readonly BoardModuleRect[];
  canManage: boolean;
  canMemberInteract: boolean;
  viewScaleRef: RefObject<number>;
  onEdit: (panel: BoardCustomPanel) => void;
  onDelete: (panelId: string) => void;
  onInteract: (
    panelId: string,
    blockId: string,
    action: CustomPanelInteraction,
  ) => void;
  onUpdateGeometry: (
    panelId: string,
    rect: BoardModuleRect,
  ) => Promise<unknown>;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    mode: "idle" as "idle" | "move" | "resize",
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: panel.x,
    originY: panel.y,
    originW: panel.w,
    originH: panel.h,
    x: panel.x,
    y: panel.y,
    w: panel.w,
    h: panel.h,
    moved: false,
  });
  const suppressClick = useRef(false);

  const canInteractControls =
    canManage || (canMemberInteract && panel.interactiveFor === "members");

  const resolvedEffect = hasActiveCardEffect(panel.effect)
    ? panel.effect
    : defaultEffect ?? panel.effect;
  const shaderActive = hasActiveCardEffect(resolvedEffect);

  const restore = () => {
    const el = elementRef.current;
    if (!el) return;
    el.style.left = panel.x + "px";
    el.style.top = panel.y + "px";
    el.style.width = panel.w + "px";
    el.style.height = panel.h + "px";
    el.classList.remove("is-dragging", "is-resizing", "is-blocked");
  };

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    el.style.left = panel.x + "px";
    el.style.top = panel.y + "px";
    el.style.width = panel.w + "px";
    el.style.height = panel.h + "px";
  }, [panel.x, panel.y, panel.w, panel.h]);

  useEffect(() => {
    if (!canManage) return;
    const el = elementRef.current;
    if (!el) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag.mode === "idle" || event.pointerId !== drag.pointerId) return;
      const scale = viewScaleRef.current || 1;
      const dx = (event.clientX - drag.startX) / scale;
      const dy = (event.clientY - drag.startY) / scale;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= 4) return;
        drag.moved = true;
        suppressClick.current = true;
        try {
          el.setPointerCapture?.(event.pointerId);
        } catch {
          // ignore
        }
        el.classList.add(drag.mode === "resize" ? "is-resizing" : "is-dragging");
      }
      event.preventDefault();

      if (drag.mode === "resize") {
        const w = Math.min(
          Math.max(snap(drag.originW + dx), PANEL_MIN_WIDTH),
          PANEL_MAX_WIDTH,
        );
        const h = Math.min(
          Math.max(snap(drag.originH + dy), PANEL_MIN_HEIGHT),
          PANEL_MAX_HEIGHT,
        );
        const pos = clampToBoard(drag.originX, drag.originY, w, h);
        el.classList.toggle(
          "is-blocked",
          !canPlaceRect({ ...pos, w, h }, obstacles, 0),
        );
        drag.x = pos.x;
        drag.y = pos.y;
        drag.w = w;
        drag.h = h;
        el.style.left = pos.x + "px";
        el.style.top = pos.y + "px";
        el.style.width = w + "px";
        el.style.height = h + "px";
        return;
      }

      const pos = clampToBoard(
        snap(drag.originX + dx),
        snap(drag.originY + dy),
        drag.originW,
        drag.originH,
      );
      el.classList.toggle(
        "is-blocked",
        !canPlaceRect({ ...pos, w: drag.originW, h: drag.originH }, obstacles, 0),
      );
      drag.x = pos.x;
      drag.y = pos.y;
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
    };

    const finish = () => {
      const drag = dragRef.current;
      if (drag.mode === "idle") return;
      drag.mode = "idle";
      el.classList.remove("is-dragging", "is-resizing", "is-blocked");
      try {
        if (el.hasPointerCapture?.(drag.pointerId)) {
          el.releasePointerCapture?.(drag.pointerId);
        }
      } catch {
        // ignore
      }
      const changed =
        drag.x !== panel.x ||
        drag.y !== panel.y ||
        drag.w !== panel.w ||
        drag.h !== panel.h;
      if (!drag.moved || !changed) {
        restore();
        drag.moved = false;
        return;
      }
      const spot = canPlaceRect(
        { x: drag.x, y: drag.y, w: drag.w, h: drag.h },
        obstacles,
        0,
      )
        ? { x: drag.x, y: drag.y }
        : nearestFreeSpotForRect(drag.w, drag.h, drag.x, drag.y, obstacles, 0);
      drag.moved = false;
      if (!spot) {
        restore();
        return;
      }
      void onUpdateGeometry(panel.id, {
        x: spot.x,
        y: spot.y,
        w: drag.w,
        h: drag.h,
      }).catch(() => restore());
    };

    const onPointerUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragRef.current.pointerId) return;
      finish();
    };
    const onPointerCancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragRef.current.pointerId) return;
      dragRef.current.mode = "idle";
      dragRef.current.moved = false;
      restore();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [
    canManage,
    obstacles,
    onUpdateGeometry,
    panel.id,
    panel.x,
    panel.y,
    panel.w,
    panel.h,
    viewScaleRef,
  ]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canManage || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".board-module-resize-handle")) {
      event.stopPropagation();
      dragRef.current = {
        mode: "resize",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: panel.x,
        originY: panel.y,
        originW: panel.w,
        originH: panel.h,
        x: panel.x,
        y: panel.y,
        w: panel.w,
        h: panel.h,
        moved: false,
      };
      return;
    }
    const handle = (event.target as HTMLElement).closest(".board-section-heading");
    if (!handle || (event.target as HTMLElement).closest("button, select, input")) {
      return;
    }
    dragRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panel.x,
      originY: panel.y,
      originW: panel.w,
      originH: panel.h,
      x: panel.x,
      y: panel.y,
      w: panel.w,
      h: panel.h,
      moved: false,
    };
  };

  return (
    <div
      ref={elementRef}
      className={
        canManage
          ? "board-module custom-panel-module is-draggable"
          : "board-module custom-panel-module"
      }
      data-custom-panel={panel.id}
      data-shader-active={shaderActive ? resolvedEffect.shader : undefined}
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h }}
      onPointerDown={handlePointerDown}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <CardEffectProvider effect={resolvedEffect}>
        <section className="board-section custom-panel-section">
          <BoardSectionHeader
            title={panel.title}
            color={panel.color}
            actions={
              canManage
                ? {
                    onEdit: () => onEdit(panel),
                    onHide: () => onDelete(panel.id),
                    editLabel: `编辑自由展板：${panel.title}`,
                  }
                : undefined
            }
          />
          <BoardContentCard className="paper custom-panel-card">
            {panel.blocks.length === 0 ? (
              <p className="board-empty">
                {canManage
                  ? "点击标题栏铅笔添加物资库存、委托流转、勾选单或选项控件"
                  : "暂无展板内容"}
              </p>
            ) : (
              <div className="hig-blocks-stack">
                {panel.blocks.map((block) => (
                  <InteractivePanelBlockView
                    key={block.id}
                    block={block}
                    actorName={actorName}
                    canInteract={canInteractControls}
                    onInteract={(blockId, action) =>
                      onInteract(panel.id, blockId, action)
                    }
                  />
                ))}
              </div>
            )}
          </BoardContentCard>
        </section>
      </CardEffectProvider>
      {canManage && (
        <div
          className="board-module-resize-handle"
          title="拖拽右下角调整展板尺寸"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

const BLOCK_TYPE_NAMES: Record<CustomPanelBlock["type"], string> = {
  resource_list: "物资库存积木",
  task_board: "委托流转积木",
  checkbox_group: "分类核对清单",
  segmented: "分段选项块",
  select: "下拉选择框",
  stepper: "步进数值条",
  toggle: "状态拨动开关",
  kv_list: "键值状态展示",
  note_text: "纯文本说明卡",
};

function createStarterBlock(type: CustomPanelBlock["type"]): CustomPanelBlock {
  const id = `blk-${crypto.randomUUID().slice(0, 6)}`;
  switch (type) {
    case "resource_list":
      return {
        id,
        type: "resource_list",
        label: "装备与补给",
        allowQuickAdd: true,
        items: [
          { id: `${id}-1`, name: "提灯与煤油", quantity: 3, unit: "罐", status: "ok" },
          { id: `${id}-2`, name: "急救绷带包", quantity: 1, unit: "套", status: "low" },
        ],
      };
    case "task_board":
      return {
        id,
        type: "task_board",
        label: "委托与行动任务",
        allowQuickAdd: true,
        items: [
          {
            id: `${id}-1`,
            title: "查明北码头 4 号仓异响",
            detail: "走访夜班守卫并核对进港舱单。",
            due: "今夜子时前",
            status: "open",
          },
        ],
      };
    case "segmented":
      return {
        id,
        type: "segmented",
        label: "现场警戒等级",
        options: ["平静", "盘查", "封锁", "交火"],
        value: "平静",
      };
    case "select":
      return {
        id,
        type: "select",
        label: "当前环境与天气",
        options: ["晴朗夜空", "浓雾弥漫", "暴雨雷鸣", "异常天象"],
        value: "浓雾弥漫",
      };
    case "checkbox_group":
      return {
        id,
        type: "checkbox_group",
        label: "小队行动检查单",
        showProgress: true,
        allowQuickAdd: true,
        items: [
          { id: `${id}-1`, label: "完成外围侦查", checked: true, tag: "侦查" },
          { id: `${id}-2`, label: "取得入场凭证", checked: false, tag: "潜入" },
          { id: `${id}-3`, label: "规划撤离路线", checked: false, tag: "预案" },
        ],
      };
    case "stepper":
      return {
        id,
        type: "stepper",
        label: "团队公共资源点",
        value: 4,
        min: 0,
        max: 10,
        step: 1,
        unit: "点",
        tone: "good",
      };
    case "toggle":
      return {
        id,
        type: "toggle",
        label: "潜行静默状态",
        description: "开启后全队保持低噪行动",
        checked: true,
      };
    case "kv_list":
      return {
        id,
        type: "kv_list",
        label: "区域情报摘要",
        rows: [
          { label: "掌控势力", value: "灰雾港巡夜人", tone: "neutral" },
          { label: "危险评级", value: "中度风险", tone: "warn" },
        ],
      };
    case "note_text":
      return {
        id,
        type: "note_text",
        heading: "场景规则说明",
        text: "在此直接填写通俗文字说明，无需使用任何代码或格式符号。",
        emphasis: "normal",
      };
  }
}

/**
 * 原子能力拼装展板编辑器：支持把物资库存、委托看板、分类检查单、选项块、下拉框、步进器等原子能力自由混搭。
 */
export function CustomPanelEditorDialog({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: BoardCustomPanel | null;
  onClose: () => void;
  onSave: (panel: BoardCustomPanel) => Promise<void>;
  onDelete?: (panelId: string) => Promise<void>;
}) {
  const ime = useImeEnterGuard();
  const [title, setTitle] = useState(initial?.title ?? "原子能力组合展板");
  const [color, setColor] = useState(initial?.color ?? "#2e5266");
  const [interactiveFor, setInteractiveFor] =
    useState<CustomPanelInteractiveRole>(initial?.interactiveFor ?? "members");
  const [effect, setEffect] = useState<CardVisualEffect>(
    () => structuredClone(initial?.effect ?? defaultCardVisualEffect()),
  );
  const [blocks, setBlocks] = useState<CustomPanelBlock[]>(() =>
    initial?.blocks?.length
      ? structuredClone(initial.blocks)
      : [
          createStarterBlock("resource_list"),
          createStarterBlock("task_board"),
        ],
  );
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const applyAtomicTemplate = (
    templateId: (typeof ATOMIC_PANEL_TEMPLATES)[number]["id"],
  ) => {
    const tpl = ATOMIC_PANEL_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const built = tpl.create();
    setTitle(built.title);
    setColor(built.color);
    setBlocks(structuredClone(built.blocks));
  };

  const updateBlock = (index: number, next: CustomPanelBlock) => {
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const copy = prev.slice();
      const [picked] = copy.splice(index, 1);
      copy.splice(target, 0, picked);
      return copy;
    });
  };

  const addBlock = (type: CustomPanelBlock["type"]) => {
    if (blocks.length >= 12) return;
    setBlocks((prev) => [...prev, createStarterBlock(type)]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const normalized = normalizeCustomPanel({
        id: initial?.id,
        kind: "interactive",
        title: title.trim(),
        color,
        body: "",
        rows: [],
        blocks,
        interactiveFor,
        effect,
        x: initial?.x ?? 860,
        y: initial?.y ?? 50,
        w: initial?.w ?? 460,
        h: initial?.h ?? 480,
      });
      await onSave(normalized);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存原子展板失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaperDialog
      title={initial ? `配置展板「${initial.title}」` : "拼装原子能力展板"}
      className="custom-panel-dialog hig-editor-dialog"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void submit(e)} {...ime}>
        <fieldset className="hig-editor-sections" disabled={busy}>
          <section className="hig-editor-group">
            <div className="hig-add-toolbar">
              <span className="hig-section-label">
                一键套用原子板块模板（原内置模块现已拆解为纯原子能力拼装）
              </span>
              <div className="hig-add-buttons">
                {ATOMIC_PANEL_TEMPLATES.map((tpl) => (
                  <button
                    type="button"
                    key={tpl.id}
                    onClick={() => applyAtomicTemplate(tpl.id)}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hig-editor-top-grid">
              <label className="field">
                <span>展板标题</span>
                <input
                  required
                  maxLength={40}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <ColorField
                label="标题底色"
                accessibleLabel="自由展板标题栏"
                value={color}
                onChange={setColor}
                disabled={busy}
              />
            </div>

            <div className="hig-permission-row">
              <div>
                <strong>允许全队玩家直接操作控件</strong>
                <small>
                  开启后玩家可直接增减物资、认领推进委托、勾选清单与切换选项；关闭则仅 GM 可改
                </small>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="允许全队玩家直接操作控件"
                aria-checked={interactiveFor === "members"}
                className={
                  interactiveFor === "members" ? "hig-switch is-on" : "hig-switch"
                }
                onClick={() =>
                  setInteractiveFor((cur) =>
                    cur === "members" ? "gm" : "members",
                  )
                }
              >
                <span className="hig-switch-thumb" />
              </button>
            </div>
          </section>

          <section className="hig-editor-group">
            <CardEffectPicker
              value={effect}
              disabled={busy}
              onChange={setEffect}
            />
          </section>

          <section className="hig-editor-group">
            <div className="hig-add-toolbar">
              <span className="hig-section-label">
                点击添加原子能力积木（{blocks.length}/12，自由组合）
              </span>
              <div className="hig-add-buttons">
                {(
                  [
                    ["resource_list", "+ 物资库存块"],
                    ["task_board", "+ 委托任务块"],
                    ["checkbox_group", "+ 分类检查单"],
                    ["segmented", "+ 分段选项块"],
                    ["select", "+ 下拉选择框"],
                    ["stepper", "+ 步进数值条"],
                    ["toggle", "+ 拨动开关"],
                    ["kv_list", "+ 键值列表"],
                    ["note_text", "+ 说明文字"],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    type="button"
                    key={type}
                    disabled={blocks.length >= 12}
                    onClick={() => addBlock(type)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hig-block-editors">
              {blocks.map((blk, idx) => (
                <div className="hig-block-editor-card" key={blk.id}>
                  <header className="hig-block-editor-head">
                    <strong>
                      {idx + 1}. {BLOCK_TYPE_NAMES[blk.type]}
                    </strong>
                    <div className="hig-block-editor-actions">
                      <button
                        type="button"
                        aria-label="上移控件"
                        disabled={idx === 0}
                        onClick={() => moveBlock(idx, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="下移控件"
                        disabled={idx === blocks.length - 1}
                        onClick={() => moveBlock(idx, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="移除控件"
                        onClick={() =>
                          setBlocks(blocks.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </header>

                  {blk.type === "resource_list" && (
                    <div className="hig-block-fields">
                      <label>
                        <span>物资分组标题</span>
                        <input
                          maxLength={40}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      {blk.items.map((item, itemIdx) => (
                        <div className="hig-check-edit-row" key={item.id}>
                          <input
                            maxLength={40}
                            value={item.name}
                            placeholder="物资名称"
                            onChange={(e) => {
                              const next = blk.items.slice();
                              next[itemIdx] = { ...item, name: e.target.value };
                              updateBlock(idx, { ...blk, items: next });
                            }}
                          />
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            style={{ width: 72 }}
                            value={item.quantity}
                            onChange={(e) => {
                              const qty = Math.max(0, Number(e.target.value) || 0);
                              const next = blk.items.slice();
                              next[itemIdx] = {
                                ...item,
                                quantity: qty,
                                status: qty === 0 ? "out" : qty <= 1 ? "low" : "ok",
                              };
                              updateBlock(idx, { ...blk, items: next });
                            }}
                          />
                          <input
                            maxLength={8}
                            style={{ width: 64 }}
                            value={item.unit ?? ""}
                            placeholder="单位"
                            onChange={(e) => {
                              const next = blk.items.slice();
                              next[itemIdx] = { ...item, unit: e.target.value };
                              updateBlock(idx, { ...blk, items: next });
                            }}
                          />
                          <button
                            type="button"
                            aria-label="删除物资"
                            onClick={() =>
                              updateBlock(idx, {
                                ...blk,
                                items: blk.items.filter((_, i) => i !== itemIdx),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {blk.items.length < 24 && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            updateBlock(idx, {
                              ...blk,
                              items: [
                                ...blk.items,
                                {
                                  id: `${blk.id}-${Date.now()}`,
                                  name: "新物资条目",
                                  quantity: 1,
                                  status: "ok",
                                },
                              ],
                            })
                          }
                        >
                          <Plus aria-hidden="true" /> 添加物资条目
                        </button>
                      )}
                    </div>
                  )}

                  {blk.type === "task_board" && (
                    <div className="hig-block-fields">
                      <label>
                        <span>委托栏标题</span>
                        <input
                          maxLength={40}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      {blk.items.map((task, tIdx) => (
                        <div className="hig-check-edit-row" key={task.id}>
                          <input
                            maxLength={60}
                            value={task.title}
                            placeholder="委托标题"
                            onChange={(e) => {
                              const next = blk.items.slice();
                              next[tIdx] = { ...task, title: e.target.value };
                              updateBlock(idx, { ...blk, items: next });
                            }}
                          />
                          <input
                            maxLength={24}
                            style={{ width: 110 }}
                            value={task.due ?? ""}
                            placeholder="时限 / 赏金"
                            onChange={(e) => {
                              const next = blk.items.slice();
                              next[tIdx] = { ...task, due: e.target.value };
                              updateBlock(idx, { ...blk, items: next });
                            }}
                          />
                          <button
                            type="button"
                            aria-label="删除委托"
                            onClick={() =>
                              updateBlock(idx, {
                                ...blk,
                                items: blk.items.filter((_, i) => i !== tIdx),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {blk.items.length < 20 && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            updateBlock(idx, {
                              ...blk,
                              items: [
                                ...blk.items,
                                {
                                  id: `${blk.id}-${Date.now()}`,
                                  title: "新行动委托",
                                  status: "open",
                                },
                              ],
                            })
                          }
                        >
                          <Plus aria-hidden="true" /> 添加委托条目
                        </button>
                      )}
                    </div>
                  )}

                  {(blk.type === "segmented" || blk.type === "select") && (
                    <div className="hig-block-fields">
                      <label>
                        <span>控件标题</span>
                        <input
                          maxLength={40}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      <div className="hig-option-pills-editor">
                        <span>可选项（点击设为默认选中，点 × 移除）</span>
                        <div className="hig-option-pills">
                          {blk.options.map((opt, optIdx) => (
                            <span
                              key={`${opt}-${optIdx}`}
                              className={
                                blk.value === opt
                                  ? "hig-opt-pill is-selected"
                                  : "hig-opt-pill"
                              }
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateBlock(idx, { ...blk, value: opt })
                                }
                              >
                                {opt}
                              </button>
                              {blk.options.length > 2 && (
                                <button
                                  type="button"
                                  aria-label={`删除选项 ${opt}`}
                                  onClick={() => {
                                    const nextOpts = blk.options.filter(
                                      (_, i) => i !== optIdx,
                                    );
                                    updateBlock(idx, {
                                      ...blk,
                                      options: nextOpts,
                                      value: nextOpts.includes(blk.value)
                                        ? blk.value
                                        : nextOpts[0],
                                    });
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        {blk.options.length < 8 && (
                          <div className="hig-option-add-row">
                            <input
                              placeholder="输入新选项名称…"
                              maxLength={32}
                              value={newOptionDrafts[blk.id] ?? ""}
                              onChange={(e) =>
                                setNewOptionDrafts({
                                  ...newOptionDrafts,
                                  [blk.id]: e.target.value,
                                })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = (
                                  newOptionDrafts[blk.id] ?? ""
                                ).trim();
                                if (!val || blk.options.includes(val)) return;
                                updateBlock(idx, {
                                  ...blk,
                                  options: [...blk.options, val],
                                });
                                setNewOptionDrafts({
                                  ...newOptionDrafts,
                                  [blk.id]: "",
                                });
                              }}
                            >
                              添加选项
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {blk.type === "checkbox_group" && (
                    <div className="hig-block-fields">
                      <label>
                        <span>清单组标题</span>
                        <input
                          maxLength={40}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      {blk.items.map((item, itemIdx) => (
                        <div className="hig-check-edit-row" key={item.id}>
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => {
                              const nextItems = blk.items.slice();
                              nextItems[itemIdx] = {
                                ...item,
                                checked: e.target.checked,
                              };
                              updateBlock(idx, { ...blk, items: nextItems });
                            }}
                          />
                          <input
                            maxLength={80}
                            value={item.label}
                            onChange={(e) => {
                              const nextItems = blk.items.slice();
                              nextItems[itemIdx] = {
                                ...item,
                                label: e.target.value,
                              };
                              updateBlock(idx, { ...blk, items: nextItems });
                            }}
                          />
                          <input
                            maxLength={16}
                            style={{ width: 84 }}
                            value={item.tag ?? ""}
                            placeholder="分类标签"
                            onChange={(e) => {
                              const nextItems = blk.items.slice();
                              nextItems[itemIdx] = {
                                ...item,
                                tag: e.target.value,
                              };
                              updateBlock(idx, { ...blk, items: nextItems });
                            }}
                          />
                          {blk.items.length > 1 && (
                            <button
                              type="button"
                              aria-label="删除勾选条目"
                              onClick={() =>
                                updateBlock(idx, {
                                  ...blk,
                                  items: blk.items.filter(
                                    (_, i) => i !== itemIdx,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {blk.items.length < 20 && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            updateBlock(idx, {
                              ...blk,
                              items: [
                                ...blk.items,
                                {
                                  id: `${blk.id}-${Date.now()}`,
                                  label: "新核对项",
                                  checked: false,
                                },
                              ],
                            })
                          }
                        >
                          <Plus aria-hidden="true" /> 添加勾选条目
                        </button>
                      )}
                    </div>
                  )}

                  {blk.type === "stepper" && (
                    <div className="hig-block-fields hig-stepper-edit-grid">
                      <label>
                        <span>名称</span>
                        <input
                          maxLength={40}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>当前值</span>
                        <input
                          type="number"
                          value={blk.value}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              value: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>上限</span>
                        <input
                          type="number"
                          value={blk.max}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              max: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>单位（可选）</span>
                        <input
                          maxLength={12}
                          value={blk.unit ?? ""}
                          placeholder="如：点 / % / 小时"
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, unit: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {blk.type === "toggle" && (
                    <div className="hig-block-fields hig-stepper-edit-grid">
                      <label>
                        <span>开关名称</span>
                        <input
                          maxLength={48}
                          value={blk.label}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, label: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>简短副标题（可选）</span>
                        <input
                          maxLength={80}
                          value={blk.description ?? ""}
                          onChange={(e) =>
                            updateBlock(idx, {
                              ...blk,
                              description: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {blk.type === "note_text" && (
                    <div className="hig-block-fields">
                      <div className="hig-stepper-edit-grid">
                        <label>
                          <span>小标题（可选）</span>
                          <input
                            maxLength={60}
                            value={blk.heading ?? ""}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                heading: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>展示样式</span>
                          <select
                            value={blk.emphasis ?? "normal"}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                emphasis: e.target.value as
                                  | "normal"
                                  | "callout",
                              })
                            }
                          >
                            <option value="normal">普通说明</option>
                            <option value="callout">醒目高亮提示</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>说明文字</span>
                        <textarea
                          rows={2}
                          maxLength={800}
                          value={blk.text}
                          onChange={(e) =>
                            updateBlock(idx, { ...blk, text: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {blk.type === "kv_list" && (
                    <div className="hig-block-fields">
                      {blk.rows.map((row, rIdx) => (
                        <div className="hig-check-edit-row" key={rIdx}>
                          <input
                            maxLength={32}
                            value={row.label}
                            placeholder="名称"
                            onChange={(e) => {
                              const nextRows = blk.rows.slice();
                              nextRows[rIdx] = { ...row, label: e.target.value };
                              updateBlock(idx, { ...blk, rows: nextRows });
                            }}
                          />
                          <input
                            maxLength={80}
                            value={row.value}
                            placeholder="状态数值"
                            onChange={(e) => {
                              const nextRows = blk.rows.slice();
                              nextRows[rIdx] = { ...row, value: e.target.value };
                              updateBlock(idx, { ...blk, rows: nextRows });
                            }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateBlock(idx, {
                                ...blk,
                                rows: blk.rows.filter((_, i) => i !== rIdx),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </fieldset>

        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}

        <footer className="composer-actions">
          {initial && onDelete && (
            <button
              type="button"
              className="delete-button"
              disabled={busy}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setBusy(true);
                void onDelete(initial.id)
                  .then(() => onClose())
                  .catch(() => setError("删除展板失败，请重试。"))
                  .finally(() => setBusy(false));
              }}
            >
              {confirmDelete ? "确认移除展板" : <Trash2 aria-hidden="true" />}
            </button>
          )}
          <span className="action-spacer" />
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button type="submit" className="publish-button" disabled={busy}>
            {busy ? "保存中…" : "保存展板"}
          </button>
        </footer>
      </form>
    </PaperDialog>
  );
}
