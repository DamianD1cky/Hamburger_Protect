import {
  activityActor,
  activitySummary,
} from "../../features/campaign/domain/activity";
import { Circle, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type {
  CampaignBoard,
  Quest,
  QuestStatus,
} from "../../features/campaign/domain/types";
import {
  resourceGroupTitle,
  resourceGroups,
  resourceLabels,
} from "../../features/campaign/domain/resources";
import { defaultSectionColors } from "../../features/campaign/domain/campaignSettings";
import { BoardContentCard, BoardSectionHeader, type SectionActions } from "./BoardSectionPrimitives";
export type { SectionActions } from "./BoardSectionPrimitives";
import { nextQuestStatus } from "../../features/campaign/domain/types";
import { MotionText } from "../MotionText";

const questLabels: Record<QuestStatus, string> = {
  open: "可领取",
  claimed: "已领取",
  in_progress: "进行中",
  pending_review: "待审核",
  completed: "已完成",
  failed: "需重试",
};

const transitionLabels: Partial<Record<QuestStatus, string>> = {
  open: "领取任务",
  claimed: "提交审核",
  in_progress: "提交审核",
  pending_review: "审核通过",
  completed: "重新开放",
  failed: "重新执行",
};

export function InventorySection({
  resources,
  onOpenSheet,
  title,
  color,
  resourceTitles = {},
  actions,
}: {
  resources: CampaignBoard["resources"];
  onOpenSheet: (group: number) => void;
  title: string;
  color?: string;
  resourceTitles?: Partial<Record<string, string>>;
  actions?: SectionActions;
}) {
  return (
    <section
      className="board-section inventory-section"
      data-section="inventory"
    >
      <BoardSectionHeader title={title} color={color ?? defaultSectionColors.inventory} actions={actions} />
      <div className="inventory-stack">
        {resourceGroups.map((sheet) => {
          const items = resources.filter((item) => item.group === sheet.id);
          const sheetTitle = resourceGroupTitle(sheet.id, resourceTitles);
          return (
            <BoardContentCard
              className="inventory-card"
              key={sheet.id}
              label={sheetTitle}
            >
              <div className="inventory-sheet-title">
                {sheetTitle}
                <small>{items.length} 项</small>
              </div>
              <div className="inventory-preview" role="list" aria-label={`${sheetTitle}条目`}>
                {items.slice(0, 3).map((item) => (
                  <div className="inventory-row" role="listitem" key={item.id}>
                    <span className="quantity">
                      {item.name}　{item.quantity}
                    </span>
                    <span className="inventory-status" data-state={item.status}>
                      {resourceLabels[item.status]}
                    </span>
                  </div>
                ))}
                {!items.length && (
                  <span className="sheet-empty">
                    暂无物资
                  </span>
                )}
              </div>
              <button className="board-view-more" type="button"
                aria-label={`${items.length > 3 ? "查看更多" : "查看"}${sheetTitle}，共 ${items.length} 项`} aria-haspopup="dialog"
                onClick={() => onOpenSheet(sheet.id)}>
                {items.length > 3 ? "查看更多" : "查看明细"}
                {items.length > 3 && <span>+{items.length - 3}</span>}
              </button>
            </BoardContentCard>
          );
        })}
      </div>
    </section>
  );
}

interface TaskSectionProps {
  quests: Quest[];
  viewer: CampaignBoard["viewer"];
  title: string;
  color?: string;
  campaignActive: boolean;
  onCompose: (event: MouseEvent<HTMLElement>) => void;
  onEdit: (quest: Quest, event: MouseEvent<HTMLElement>) => void;
  onViewMore: (completed: boolean) => void;
  onTransition: (
    quest: Quest,
    status: QuestStatus,
    source: HTMLElement,
  ) => Promise<void>;
}

export function TaskItem({
  quest,
  viewer,
  campaignActive,
  onEdit,
  onTransition,
}: Pick<TaskSectionProps, "viewer" | "campaignActive" | "onEdit" | "onTransition"> & {
  quest: Quest;
}) {
  const [busy, setBusy] = useState(false);
  const proposedStatus = campaignActive
    ? nextQuestStatus(viewer.role, quest.status)
    : null;
  const nextStatus =
    viewer.role === "player" &&
    proposedStatus === "pending_review" &&
    quest.claimedBy !== viewer.id
      ? null
      : proposedStatus;
  const completed = quest.status === "completed";
  const review = quest.status === "pending_review";
  const ActionIcon = completed ? RotateCcw : review ? ShieldCheck : Circle;
  const progressLabel =
    viewer.role === "gm" && ["claimed", "in_progress"].includes(quest.status)
      ? "等待玩家提交"
      : questLabels[quest.status];
  const actionLabel = !campaignActive
    ? "战役已归档"
    : nextStatus
      ? transitionLabels[quest.status]
      : viewer.role === "gm" &&
          ["open", "claimed", "in_progress"].includes(quest.status)
        ? "等待玩家提交"
        : "当前身份不能推进";
  const transition = async (status: QuestStatus, source: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    try {
      await onTransition(quest, status, source);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="task-item"
      data-task-id={quest.id}
      aria-busy={busy || undefined}
    >
      <span className="task-actions">
        <button
          className="task-check"
          type="button"
          disabled={!nextStatus || busy}
          aria-label={actionLabel}
          title={actionLabel}
          onClick={(event) => {
            if (!nextStatus) return;
            void transition(
              nextStatus,
              event.currentTarget.closest(".task-item") as HTMLElement,
            );
          }}
        >
          <ActionIcon aria-hidden="true" />
        </button>
        {review && viewer.role === "gm" && campaignActive && (
          <button
            className="task-reject"
            type="button"
            disabled={busy}
            aria-label="退回任务重试"
            title="退回重试"
            onClick={(event) =>
              void transition(
                "failed",
                event.currentTarget.closest(".task-item") as HTMLElement,
              )
            }
          >
            <RotateCcw aria-hidden="true" />
          </button>
        )}
      </span>
      <button
        className="task-content"
        type="button"
        title="查看完整工作指示"
        aria-label={"查看工作指示：" + quest.title}
        onClick={(event) => onEdit(quest, event)}
      >
        <span className="task-title">{quest.title}</span>
        <span className="task-excerpt">{quest.body || "暂无补充内容"}</span>
        <span className="task-meta">
          {quest.assigneeName || "待认领"}
          {quest.due ? "　" + quest.due : ""}
          <i data-status={quest.status}>　<MotionText value={progressLabel} /></i>
        </span>
      </button>
    </div>
  );
}

export function TaskSection({
  quests,
  viewer,
  title,
  color,
  campaignActive,
  onCompose,
  onEdit,
  onTransition,
  onViewMore,
  actions,
}: TaskSectionProps & { actions?: SectionActions }) {
  const active = quests.filter((quest) => quest.status !== "completed");
  const completed = quests.filter((quest) => quest.status === "completed");

  return (
    <section className="board-section task-section" data-section="tasks">
      <BoardSectionHeader title={title} color={color ?? defaultSectionColors.tasks} actions={actions} />
      <div className="task-papers">
        <BoardContentCard className="paper task-paper todo-paper">
          <h2><span>进行中 <small className="task-count"><MotionText value={active.length} /></small></span>
            {viewer.role === "gm" && campaignActive && <button type="button" className="card-action"
              onClick={onCompose} aria-label="发布工作指示" title="发布工作指示"><Plus aria-hidden="true" /></button>}
          </h2>
          <div className="task-list">
            {!active.length && <p className="board-empty">暂无工作指示</p>}
            {active.slice(0, 4).map((quest) => (
              <TaskItem
                key={quest.id}
                quest={quest}
                viewer={viewer}
                campaignActive={campaignActive}
                onEdit={onEdit}
                onTransition={onTransition}
              />
            ))}
          </div>
          {active.length > 4 && <button type="button" className="board-view-more"
            aria-label={`查看更多进行中的工作指示，共 ${active.length} 项`} aria-haspopup="dialog"
            onClick={() => onViewMore(false)}>查看更多 <span>+{active.length - 4}</span></button>}
        </BoardContentCard>
        <BoardContentCard className="paper task-paper done-paper">
          <h2>已完成 <small className="task-count"><MotionText value={completed.length} /></small></h2>
          <div className="task-list">
            {!completed.length && <p className="board-empty">暂无完成记录</p>}
            {completed.slice(0, 4).map((quest) => (
              <TaskItem
                key={quest.id}
                quest={quest}
                viewer={viewer}
                campaignActive={campaignActive}
                onEdit={onEdit}
                onTransition={onTransition}
              />
            ))}
          </div>
          {completed.length > 4 && <button type="button" className="board-view-more"
            aria-label={`查看更多已完成的工作指示，共 ${completed.length} 项`} aria-haspopup="dialog"
            onClick={() => onViewMore(true)}>查看更多 <span>+{completed.length - 4}</span></button>}
        </BoardContentCard>
      </div>
    </section>
  );
}

export function ShiftSection({
  members,
  canExpand,
  onExpand,
  title,
  color,
  actions,
}: {
  members: CampaignBoard["members"];
  canExpand: boolean;
  onExpand: () => void;
  title: string;
  color?: string;
  actions?: SectionActions;
}) {
  const active = members.filter((member) => member.active);
  return (
    <section className="board-section shift-section" data-section="shifts">
      <BoardSectionHeader title={title} color={color ?? defaultSectionColors.shifts} actions={actions} />
      <BoardContentCard
        className="shift-paper roster-preview"
        disabled={!canExpand}
        onClick={onExpand}
        label={
          canExpand
            ? `查看全部 ${active.length} 位在岗成员`
            : `${active.length} 位成员在岗`
        }
      >
        <strong><MotionText value={`${active.length} 人在岗`} /></strong>
        <span className="roster-preview-list">
          {active.slice(0, 3).map((member) => (
            <span key={member.userId}>
              <b>{member.jobTitle}</b>
              <span>{member.characterName}</span>
            </span>
          ))}
        </span>
        {active.length > 3 && <span className="board-view-more">查看更多 <span>+{active.length - 3}</span></span>}
      </BoardContentCard>
    </section>
  );
}

export function MemoSection({
  board,
  onOpen,
  title,
  color,
  actions,
}: {
  board: CampaignBoard;
  onOpen: () => void;
  title: string;
  color?: string;
  actions?: SectionActions;
}) {
  return (
    <section className="board-section memo-section" data-section="activity">
      <BoardSectionHeader title={title} color={color ?? defaultSectionColors.activity} actions={actions} />
      <BoardContentCard
        className="paper memo-paper notes-preview"
        onClick={onOpen}
        label="查看全部工作记录"
      >
        <strong>
          <MotionText value={`${board.activities.length}${board.hasMoreActivity ? "+" : ""} 条操作记录`} />
        </strong>
        {board.activities.length ? <span className="activity-preview-list" role="list" aria-label="最近工作记录">
          {board.activities.slice(0, 5).map((event) => (
            <span className="activity-preview-row" role="listitem" key={event.id}>
              <b>{activityActor(event, board.members)}</b>
              <span>{activitySummary(event)}</span>
            </span>
          ))}
        </span> : <span>暂无操作记录</span>}
        {(board.activities.length > 5 || board.hasMoreActivity) &&
          <span className="board-view-more activity-view-more">查看更多</span>}
      </BoardContentCard>
    </section>
  );
}

interface SafetySectionProps {
  checklist: CampaignBoard["checklist"];
  categories: CampaignBoard["checklistCategories"];
  title: string;
  color?: string;
  canToggle: boolean;
  onToggle: (id: string) => void;
  onViewMore: () => void;
  actions?: SectionActions;
}

export function SafetySection({
  checklist,
  categories,
  title,
  color,
  canToggle,
  onToggle,
  onViewMore,
  actions,
}: SafetySectionProps) {
  const preview = checklist.slice(0, 8);
  return (
    <section className="board-section safety-section" data-section="safety">
      <BoardSectionHeader title={title} color={color ?? defaultSectionColors.safety} actions={actions} />
      <BoardContentCard className="paper safety-paper">
        <div className="card-content-heading">
          <strong><MotionText value={`${checklist.filter((item) => item.completed).length}/${checklist.length}`} /></strong>
        </div>
        <div className="safety-list">
          {!checklist.length && (
            <p className="board-empty">
              暂无检查项
            </p>
          )}
          {preview.map((item) => {
            const category = categories.find((category) => category.id === item.categoryId)?.name ?? "未分类";
            return <button
              className={`safety-item ${item.completed ? "is-done" : ""}`}
              type="button" key={item.id} disabled={!canToggle}
              aria-label={`${item.label}，${category}`}
              title={canToggle ? "更新检查状态" : "仅在岗员工可以更新检查状态"}
              onClick={() => onToggle(item.id)}>
              <span className="safety-box" aria-hidden="true" />
              <span className="safety-label">{item.label}</span>
              <small className="safety-category">{category}</small>
            </button>;
          })}
        </div>
        {checklist.length > preview.length && <button type="button" className="board-view-more"
          aria-label={`查看更多检查项，共 ${checklist.length} 项`} aria-haspopup="dialog"
          onClick={onViewMore}>查看更多 <span>+{checklist.length - preview.length}</span></button>}
      </BoardContentCard>
    </section>
  );
}
