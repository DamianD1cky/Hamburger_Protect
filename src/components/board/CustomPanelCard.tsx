import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Layers,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  activityActor,
  activitySummary,
} from "../../features/campaign/domain/activity";
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
  createExtendedPanelBlock,
  TASK_BOARD_STATUS_LABELS,
  type BoardCustomPanel,
  type CustomPanelBlock,
  type CustomPanelInteraction,
  type CustomPanelInteractiveRole,
  type ResourceBlockStatus,
  type TaskBlockStatus,
} from "../../features/campaign/domain/customPanels";
import type { CampaignBoard } from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { MotionText } from "../MotionText";
import { PaperDialog } from "../composer/PaperDialog";
import { BoardContentCard, BoardSectionHeader } from "./BoardSectionPrimitives";
import { CardEffectPicker, CardEffectProvider } from "./CardEffectLayer";
import { ColorField } from "./ColorField";
import { AdditionalBlockFields, ExtendedPanelBlockView, isExtendedBlock, MeterVisual } from "./ExtendedPanelBlocks";
import { CampaignImage } from "./CampaignImage";

const RESOURCE_STATUS_LABELS: Record<ResourceBlockStatus, string> = {
  ok: "充足",
  low: "紧缺",
  out: "耗尽",
};

const TASK_NEXT_STATUS: Record<TaskBlockStatus, TaskBlockStatus> = {
  open: "in_progress",
  in_progress: "completed",
  completed: "open",
};

/**
 * 15 类原子能力统一渲染器：
 * 涵盖核心房间能力（成员名册 member_roster / 事件钟 event_clock / 工作记录 activity_feed）
 * 以及业务与交互积木（物资库存 / 委托看板 / 分类检查单 / 分段选项 / 下拉框 / 步进数值 / 开关 / 键值列表 / 文本说明）。
 */
function InteractivePanelBlockView({
  block,
  board,
  actorName,
  canInteract,
  onInteract,
  onExpandRoster,
  onOpenActivity,
  onPostNote,
}: {
  block: CustomPanelBlock;
  board?: CampaignBoard;
  actorName?: string;
  canInteract: boolean;
  onInteract: (blockId: string, action: CustomPanelInteraction) => void;
  onExpandRoster?: () => void;
  onOpenActivity?: () => void;
  onPostNote?: (title: string, body: string) => Promise<unknown>;
}) {
  const [quickDraft, setQuickDraft] = useState("");
  const [quickSubDraft, setQuickSubDraft] = useState("");

  if (isExtendedBlock(block)) return <ExtendedPanelBlockView block={block} board={board}
    canInteract={canInteract} onInteract={onInteract} onPostNote={onPostNote} />;

  if (block.type === "member_roster") {
    const activeMembers = (board?.members ?? []).filter((m) => m.active);
    const canOpenRoster =
      Boolean(onExpandRoster) && board?.viewer.role !== "observer";
    return (
      <div className="hig-block hig-roster-block">
        <div className="hig-block-header">
          <span className="hig-block-label">{block.label}</span>
          <small>
            <MotionText value={`${activeMembers.length} 人在场`} />
          </small>
        </div>
        <div className="hig-inset-list" role="list" aria-label={block.label}>
          {activeMembers.length === 0 && (
            <span className="hig-empty-inline">暂无在场成员</span>
          )}
          {activeMembers.slice(0, block.maxItems).map((member) => (
            <div className="hig-roster-row" role="listitem" key={member.userId}>
              <span className="hig-roster-avatar" aria-hidden="true">
                {member.characterName.slice(0, 1)}
              </span>
              <span className="hig-roster-name">{member.characterName}</span>
              {block.showRoleBadge && (
                <em
                  className={
                    member.role === "gm"
                      ? "hig-item-tag is-accent"
                      : "hig-item-tag"
                  }
                >
                  {member.jobTitle || (member.role === "gm" ? "主持人" : "成员")}
                </em>
              )}
            </div>
          ))}
          {canOpenRoster && (
            <button
              type="button"
              className="hig-disclosure-row"
              aria-label={`查看全部 ${activeMembers.length} 位在场成员`}
              onClick={onExpandRoster}
            >
              <Users aria-hidden="true" />
              <span>
                {activeMembers.length > block.maxItems
                  ? `查看全部成员（+${activeMembers.length - block.maxItems}）`
                  : "管理名册与角色资料"}
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "event_clock") {
    const isFull = block.progress >= block.segments;
    return (
      <div
        className={
          isFull
            ? "hig-block hig-row-card hig-clock-block is-complete"
            : "hig-block hig-row-card hig-clock-block"
        }
        style={{ "--clock-color": block.color } as CSSProperties}
      >
        <div className="hig-clock-top">
          <strong className="hig-row-title">{block.name}</strong>
          <div className="hig-stepper-controls">
            {isFull && (
              <span className="hig-clock-full-pill" role="status">
                事件已满
              </span>
            )}
            <strong className="hig-stepper-value">
              <MotionText value={`${block.progress}/${block.segments}`} />
            </strong>
            {canInteract && (
              <span className="hig-stepper-capsule">
                <button
                  type="button"
                  aria-label={`${block.name}进度减一`}
                  disabled={block.progress <= 0}
                  onClick={() =>
                    onInteract(block.id, { type: "step_event_clock", delta: -1 })
                  }
                >
                  <Minus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`${block.name}进度加一`}
                  disabled={block.progress >= block.segments}
                  onClick={() =>
                    onInteract(block.id, { type: "step_event_clock", delta: 1 })
                  }
                >
                  <Plus aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </div>

        <div
          className="hig-clock-segments"
          role="progressbar"
          aria-label={`${block.name}进度`}
          aria-valuemin={0}
          aria-valuemax={block.segments}
          aria-valuenow={block.progress}
          style={
            {
              "--segments": block.segments,
              "--clock-color": block.color,
            } as CSSProperties
          }
        >
          {Array.from({ length: block.segments }, (_, idx) => (
            <span
              key={idx}
              className={
                idx < block.progress
                  ? "hig-clock-seg is-filled"
                  : "hig-clock-seg"
              }
            />
          ))}
        </div>

        {block.consequence && (
          <p className="hig-clock-consequence">{block.consequence}</p>
        )}
      </div>
    );
  }

  if (block.type === "activity_feed") {
    const activities = board?.activities ?? [];
    const members = board?.members ?? [];
    const totalLabel = `${activities.length}${board?.hasMoreActivity ? "+" : ""} 条`;
    return (
      <div className="hig-block hig-activity-block">
        <div className="hig-block-header">
          <span className="hig-block-label">{block.label}</span>
          <small>
            <MotionText value={totalLabel} />
          </small>
        </div>
        <div className="hig-inset-list" role="list" aria-label={block.label}>
          {activities.length === 0 && (
            <span className="hig-empty-inline">暂无操作记录</span>
          )}
          {activities.slice(0, block.maxItems).map((event) => (
            <div className="hig-activity-row" role="listitem" key={event.id}>
              <b>{activityActor(event, members)}</b>
              <span>{activitySummary(event)}</span>
            </div>
          ))}
          {onOpenActivity && (
            <button
              type="button"
              className="hig-disclosure-row"
              aria-label="查看全部行动记录"
              onClick={onOpenActivity}
            >
              <span>查看完整工作记录</span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "choice_selector" && (block.display === "segmented" || (block.display !== "dropdown" && block.options.length <= 4))) {
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

  if (block.type === "choice_selector") {
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
    const statusLabels = TASK_BOARD_STATUS_LABELS[block.variant ?? "quest"];
    const activeCount = block.items.filter((t) => t.status !== "completed").length;
    const doneCount = block.items.length - activeCount;
    return (
      <div className="hig-block hig-task-block" data-variant={block.variant ?? "quest"}>
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
                {task.imageUrl && <CampaignImage className="atomic-task-portrait" src={task.imageUrl} alt={task.title} loading="lazy" />}
                <button
                  type="button"
                  className="hig-task-trigger"
                  disabled={!canInteract}
                  data-status={task.status}
                  title={`推进为${statusLabels[TASK_NEXT_STATUS[task.status]]}`}
                  aria-label={`${task.title}：推进为${statusLabels[TASK_NEXT_STATUS[task.status]]}`}
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
                  {(task.reward || task.badge) && <span className="atomic-task-reward">
                    {task.reward && <b>{task.reward}</b>}{task.badge && <em>{task.badge}</em>}
                  </span>}
                  {task.detail && (
                    <span className="hig-task-detail">{task.detail}</span>
                  )}
                  <span className="hig-task-meta">
                    <span>{task.assignee || "待认领"}</span>
                    {task.due && <span>{task.due}</span>}
                    <i data-status={task.status}>
                      {statusLabels[task.status]}
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
                    reward: quickSubDraft.trim() || undefined,
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
              placeholder="赏金"
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
                  reward: quickSubDraft.trim() || undefined,
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

  if (block.type === "meter_counter") {
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
        <MeterVisual block={block} canInteract={canInteract} onSetValue={(value) => onInteract(block.id, { type: "set_value", value })} />
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
      style={block.fontSize ? { fontSize: block.fontSize } : undefined}
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
  board,
  actorName,
  defaultEffect,
  obstacles,
  canManage,
  canMemberInteract,
  viewScaleRef,
  onEdit,
  onHide,
  onDelete: _onDelete,
  onInteract,
  onUpdateGeometry,
  onExpandRoster,
  onOpenActivity,
  onPostNote,
}: {
  panel: BoardCustomPanel;
  board?: CampaignBoard;
  actorName?: string;
  defaultEffect?: CardVisualEffect | null;
  obstacles: readonly BoardModuleRect[];
  canManage: boolean;
  canMemberInteract: boolean;
  viewScaleRef: RefObject<number>;
  onEdit: (panel: BoardCustomPanel) => void;
  onHide?: (panelId: string) => void;
  onDelete?: (panelId: string) => void;
  onInteract: (
    panelId: string,
    blockId: string,
    action: CustomPanelInteraction,
  ) => void;
  onUpdateGeometry: (
    panelId: string,
    rect: BoardModuleRect,
  ) => Promise<unknown>;
  onExpandRoster?: () => void;
  onOpenActivity?: () => void;
  onPostNote?: (title: string, body: string) => Promise<unknown>;
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
      style={
        {
          left: panel.x,
          top: panel.y,
          width: panel.w,
          height: panel.h,
          ...(panel.fontSize
            ? { "--panel-font-size": `${panel.fontSize}px` }
            : {}),
        } as CSSProperties
      }
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
                    ...(onHide ? { onHide: () => onHide(panel.id) } : {}),
                    editLabel: `编辑板块：${panel.title}`,
                    hideLabel: `隐藏板块：${panel.title}`,
                  }
                : undefined
            }
          />
          <BoardContentCard className="paper custom-panel-card">
            {panel.blocks.length === 0 ? (
              <p className="board-empty">
                {canManage
                  ? "点击标题栏编辑图标添加原子积木"
                  : "暂无板块内容"}
              </p>
            ) : (
              <div className="hig-blocks-stack">
                {panel.blocks.map((block) => (
                  <InteractivePanelBlockView
                    key={block.id}
                    block={block}
                    board={board}
                    actorName={actorName}
                    canInteract={canInteractControls}
                    onExpandRoster={onExpandRoster}
                    onOpenActivity={onOpenActivity}
                    onPostNote={onPostNote}
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
          title="拖拽右下角调整板块尺寸"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

const BLOCK_TYPE_NAMES: Record<CustomPanelBlock["type"], string> = {
  member_roster: "在场成员名册",
  event_clock: "事件钟进度条",
  activity_feed: "工作记录动态流",
  resource_list: "物资库存积木",
  task_board: "委托流转积木",
  checkbox_group: "分类核对清单",
  choice_selector: "单选状态器",
  meter_counter: "数值与状态计量",
  image_media: "图片与地图",
  dice_macro: "快捷检定",
  initiative_track: "先攻与行动轮次",
  roll_table: "随机表",
  toggle: "状态拨动开关",
  kv_list: "键值状态行",
  note_text: "文本说明卡",
};

function createStarterBlock(type: CustomPanelBlock["type"]): CustomPanelBlock {
  const id = `blk-${crypto.randomUUID().slice(0, 6)}`;
  switch (type) {
    case "member_roster":
      return {
        id,
        type: "member_roster",
        label: "在场成员",
        maxItems: 4,
        showRoleBadge: true,
      };
    case "event_clock":
      return {
        id,
        type: "event_clock",
        name: "新事件进度钟",
        segments: 6,
        progress: 0,
        color: "#b24b37",
        consequence: "格数填满时触发关键局势升级。",
      };
    case "activity_feed":
      return {
        id,
        type: "activity_feed",
        label: "最近工作记录",
        maxItems: 5,
      };
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
    case "image_media":
    case "dice_macro":
    case "initiative_track":
    case "roll_table":
      return createExtendedPanelBlock(type, id);
    case "choice_selector":
      return {
        id,
        type: "choice_selector",
        display: "auto",
        label: "现场警戒等级",
        options: ["平静", "盘查", "封锁", "交火"],
        value: "平静",
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
        ],
      };
    case "meter_counter":
      return {
        id,
        type: "meter_counter",
        variant: "stepper",
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
        heading: "场景说明",
        text: "在此填写直观文字说明，无需任何语法符号。",
        emphasis: "normal",
      };
  }
}

/**
 * 遵循 Apple Human Interface Guidelines 设计原则（清晰 Clarity、层次感 Depth、一致性 Consistency、渐进披露）
 * 的统一板块检查器（成员名册、事件钟、工作记录及所有自定义板块共用同一套编辑界面）。
 */
export function CustomPanelEditorDialog({
  initial,
  onClose,
  onSave,
  onDelete,
  onUploadPhoto,
}: {
  initial: BoardCustomPanel | null;
  onClose: () => void;
  onSave: (panel: BoardCustomPanel) => Promise<void>;
  onDelete?: (panelId: string) => Promise<void>;
  onUploadPhoto?: (file: File) => Promise<string>;
}) {
  const ime = useImeEnterGuard();
  const [inspectorTab, setInspectorTab] = useState<"blocks" | "appearance">(
    "blocks",
  );
  const [title, setTitle] = useState(initial?.title ?? "新建展示板块");
  const [color, setColor] = useState(initial?.color ?? "#254e70");
  const [fontSize, setFontSize] = useState<number>(initial?.fontSize ?? 14);
  const [interactiveFor, setInteractiveFor] =
    useState<CustomPanelInteractiveRole>(initial?.interactiveFor ?? "members");
  const [effect, setEffect] = useState<CardVisualEffect>(
    () => structuredClone(initial?.effect ?? defaultCardVisualEffect()),
  );
  const [blocks, setBlocks] = useState<CustomPanelBlock[]>(() =>
    initial?.blocks?.length
      ? structuredClone(initial.blocks)
      : [createStarterBlock("event_clock")],
  );
  const [newOptionDrafts, setNewOptionDrafts] = useState<
    Record<string, string>
  >({});
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
    setInteractiveFor(built.interactiveFor);
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
        fontSize,
        x: initial?.x ?? 880,
        y: initial?.y ?? 50,
        w: initial?.w ?? 420,
        h: initial?.h ?? 380,
      });
      await onSave(normalized);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存板块失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaperDialog
      title={initial ? `编辑「${initial.title}」` : "新建展示板块"}
      className="custom-panel-dialog hig-inspector-sheet"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="hig-inspector-segmented"
        role="tablist"
        aria-label="板块编辑分页"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inspectorTab === "blocks"}
          className={inspectorTab === "blocks" ? "is-active" : ""}
          onClick={() => setInspectorTab("blocks")}
        >
          <Layers aria-hidden="true" />
          内容与原子积木（{blocks.length}）
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inspectorTab === "appearance"}
          className={inspectorTab === "appearance" ? "is-active" : ""}
          onClick={() => setInspectorTab("appearance")}
        >
          <Palette aria-hidden="true" />
          外观与材质着色
        </button>
      </div>

      <form onSubmit={(e) => void submit(e)} {...ime}>
        <fieldset className="hig-editor-sections" disabled={busy}>
          {inspectorTab === "appearance" ? (
            <>
              <section className="hig-editor-group">
                <span className="hig-section-label">板块标识与标题色</span>
                <div className="hig-editor-top-grid">
                  <label className="field">
                    <span>板块标题</span>
                    <input
                      required
                      maxLength={40}
                      aria-label="板块标题"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <ColorField
                    label="标题栏底色"
                    accessibleLabel="板块标题栏"
                    value={color}
                    onChange={setColor}
                    disabled={busy}
                  />
                </div>

                <label className="hig-range-field">
                  <span>
                    板块文字字号 <strong>{fontSize}px</strong>
                  </span>
                  <input
                    type="range"
                    aria-label="板块文字字号"
                    min={11}
                    max={24}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                  />
                </label>

                <div className="hig-permission-row">
                  <div>
                    <strong>允许房间内玩家直接操作控件</strong>
                    <small>
                      开启后玩家可直接在板面上增减物资、认领委托或推进进度；关闭则仅主持人可修改
                    </small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="允许全队玩家直接操作控件"
                    aria-checked={interactiveFor === "members"}
                    className={
                      interactiveFor === "members"
                        ? "hig-switch is-on"
                        : "hig-switch"
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
            </>
          ) : (
            <>
              <section className="hig-editor-group">
                <div className="hig-add-toolbar">
                  <span className="hig-section-label">
                    一键载入预设板块方案（将覆盖当前积木组合）
                  </span>
                  <div className="hig-add-buttons">
                    {ATOMIC_PANEL_TEMPLATES.map((tpl) => (
                      <button
                        type="button"
                        key={tpl.id}
                        onClick={() => applyAtomicTemplate(tpl.id)}
                      >
                        {tpl.label.replace("（原子拼装）", "")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hig-add-toolbar" style={{ marginTop: 6 }}>
                  <span className="hig-section-label">
                    添加原子能力积木（{blocks.length}/12，任意板块均可自由混搭）
                  </span>
                  <div className="hig-add-buttons">
                    {(
                      [
                        ["member_roster", "+ 成员名册"],
                        ["event_clock", "+ 事件钟"],
                        ["activity_feed", "+ 工作记录"],
                        ["resource_list", "+ 物资库存"],
                        ["task_board", "+ 委托任务"],
                        ["checkbox_group", "+ 分类检查单"],
                        ["choice_selector", "+ 单选状态"],
                        ["meter_counter", "+ 数值计量"],
                        ["image_media", "+ 图片地图"],
                        ["dice_macro", "+ 快捷检定"],
                        ["initiative_track", "+ 先攻顺位"],
                        ["roll_table", "+ 随机表"],
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
              </section>

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

                    <AdditionalBlockFields block={blk} onChange={(next) => updateBlock(idx, next)} onUploadPhoto={onUploadPhoto} />

                    {blk.type === "member_roster" && (
                      <div className="hig-block-fields hig-stepper-edit-grid">
                        <label>
                          <span>分组标题</span>
                          <input
                            maxLength={40}
                            value={blk.label}
                            onChange={(e) =>
                              updateBlock(idx, { ...blk, label: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>卡片内最多预览人数</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={blk.maxItems}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                maxItems: Math.max(
                                  1,
                                  Math.min(12, Number(e.target.value) || 4),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    )}

                    {blk.type === "event_clock" && (
                      <div className="hig-block-fields">
                        <div className="hig-stepper-edit-grid">
                          <label>
                            <span>事件钟名称</span>
                            <input
                              maxLength={60}
                              aria-label="事件钟名称"
                              value={blk.name}
                              onChange={(e) =>
                                updateBlock(idx, {
                                  ...blk,
                                  name: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>总格数（2–24）</span>
                            <input
                              type="number"
                              min={2}
                              max={24}
                              value={blk.segments}
                              onChange={(e) => {
                                const segs = Math.max(
                                  2,
                                  Math.min(24, Number(e.target.value) || 6),
                                );
                                updateBlock(idx, {
                                  ...blk,
                                  segments: segs,
                                  progress: Math.min(blk.progress, segs),
                                });
                              }}
                            />
                          </label>
                          <label>
                            <span>当前进度</span>
                            <input
                              type="number"
                              min={0}
                              max={blk.segments}
                              value={blk.progress}
                              onChange={(e) =>
                                updateBlock(idx, {
                                  ...blk,
                                  progress: Math.max(
                                    0,
                                    Math.min(
                                      blk.segments,
                                      Number(e.target.value) || 0,
                                    ),
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>填满后果描述</span>
                          <input
                            maxLength={240}
                            value={blk.consequence}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                consequence: e.target.value,
                              })
                            }
                          />
                        </label>
                        <ColorField
                          label="进度条颜色"
                          accessibleLabel={`事件钟${blk.name}`}
                          value={blk.color}
                          onChange={(c) =>
                            updateBlock(idx, { ...blk, color: c })
                          }
                          disabled={busy}
                        />
                      </div>
                    )}

                    {blk.type === "activity_feed" && (
                      <div className="hig-block-fields hig-stepper-edit-grid">
                        <label>
                          <span>分组标题</span>
                          <input
                            maxLength={40}
                            value={blk.label}
                            onChange={(e) =>
                              updateBlock(idx, { ...blk, label: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>卡片内显示最近条数</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={blk.maxItems}
                            onChange={(e) =>
                              updateBlock(idx, {
                                ...blk,
                                maxItems: Math.max(
                                  1,
                                  Math.min(12, Number(e.target.value) || 5),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    )}

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
                                next[itemIdx] = {
                                  ...item,
                                  name: e.target.value,
                                };
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
                                const qty = Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                );
                                const next = blk.items.slice();
                                next[itemIdx] = {
                                  ...item,
                                  quantity: qty,
                                  status:
                                    qty === 0 ? "out" : qty <= 1 ? "low" : "ok",
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
                                next[itemIdx] = {
                                  ...item,
                                  unit: e.target.value,
                                };
                                updateBlock(idx, { ...blk, items: next });
                              }}
                            />
                            <button
                              type="button"
                              aria-label="删除物资"
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
                          </div>
                        ))}
                        {blk.items.length < 24 && (
                          <button
                            type="button"
                            className="hig-inline-add-btn"
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
                            className="hig-inline-add-btn"
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

                    {blk.type === "choice_selector" && (
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
                            className="hig-inline-add-btn"
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

                    {blk.type === "meter_counter" && (
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
                                max: Number(e.target.value) || 1,
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
                                nextRows[rIdx] = {
                                  ...row,
                                  label: e.target.value,
                                };
                                updateBlock(idx, { ...blk, rows: nextRows });
                              }}
                            />
                            <input
                              maxLength={80}
                              value={row.value}
                              placeholder="状态数值"
                              onChange={(e) => {
                                const nextRows = blk.rows.slice();
                                nextRows[rIdx] = {
                                  ...row,
                                  value: e.target.value,
                                };
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
            </>
          )}
        </fieldset>

        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}

        <footer className="composer-actions hig-sheet-footer">
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
                  .catch(() => setError("移除板块失败，请重试。"))
                  .finally(() => setBusy(false));
              }}
            >
              {confirmDelete ? "确认移除板块" : <Trash2 aria-hidden="true" />}
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
            {busy ? "保存中…" : "完成并保存"}
          </button>
        </footer>
      </form>
    </PaperDialog>
  );
}
