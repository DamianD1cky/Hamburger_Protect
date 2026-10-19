import { Circle, Plus, RotateCcw, ShieldCheck, Pencil } from "lucide-react";
import type { MouseEvent } from "react";
import type {
  CampaignBoard,
  Quest,
  QuestStatus,
} from "../../features/campaign/domain/types";
import { burgerIndexInfo } from "../../features/campaign/domain/burgerIndex";
import {
  resourceGroups,
  resourceLabels,
} from "../../features/campaign/domain/resources";
import { nextQuestStatus } from "../../features/campaign/domain/types";

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
  canManage,
  onOpenSheet,
}: {
  resources: CampaignBoard["resources"];
  canManage: boolean;
  onOpenSheet: (group: number) => void;
}) {
  return (
    <section
      className="board-section inventory-section"
      data-section="inventory"
    >
      <div className="sign sign-red section-heading">
        <span>可用物资与设施</span>
      </div>
      <div className="inventory-stack">
        {resourceGroups.map((sheet) => {
          const items = resources.filter((item) => item.group === sheet.id);
          return (
            <button
              className="inventory-card"
              type="button"
              key={sheet.id}
              onClick={() => onOpenSheet(sheet.id)}
              aria-label={`${canManage ? "编辑" : "查看"}便签：${sheet.title}`}
              aria-haspopup="dialog"
            >
              <span className="inventory-sheet-title">
                {sheet.title}
                <small>{items.length} 项</small>
              </span>
              <span className="inventory-preview">
                {items.slice(0, 3).map((item) => (
                  <span className="inventory-row" key={item.id}>
                    <span className="quantity">
                      {item.name}　{item.quantity}
                    </span>
                    <span className="inventory-status" data-state={item.status}>
                      {resourceLabels[item.status]}
                    </span>
                  </span>
                ))}
              </span>
              {!items.length && (
                <span className="sheet-empty">
                  {canManage ? "空白便签 · 点开登记" : "等待 GM 登记"}
                </span>
              )}
              <span className="inventory-sheet-hint">
                {items.length > 3 ? `共 ${items.length} 项 · ` : ""}点开
                {canManage ? "修改" : "查看"} →
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface TaskSectionProps {
  quests: Quest[];
  role: CampaignBoard["viewer"]["role"];
  campaignActive: boolean;
  onCompose: (event: MouseEvent<HTMLElement>) => void;
  onEdit: (quest: Quest, event: MouseEvent<HTMLElement>) => void;
  onTransition: (
    quest: Quest,
    status: QuestStatus,
    source: HTMLElement,
  ) => Promise<void>;
}

function TaskItem({
  quest,
  role,
  campaignActive,
  onEdit,
  onTransition,
}: Omit<TaskSectionProps, "quests" | "onCompose"> & { quest: Quest }) {
  const nextStatus = campaignActive
    ? nextQuestStatus(role, quest.status)
    : null;
  const completed = quest.status === "completed";
  const review = quest.status === "pending_review";
  const ActionIcon = completed ? RotateCcw : review ? ShieldCheck : Circle;
  const actionLabel = nextStatus
    ? transitionLabels[quest.status]
    : "等待玩家推进";

  return (
    <div className="task-item" data-task-id={quest.id}>
      <button
        className="task-check"
        type="button"
        disabled={!nextStatus}
        aria-label={actionLabel}
        title={actionLabel}
        onClick={(event) => {
          if (!nextStatus) return;
          void onTransition(
            quest,
            nextStatus,
            event.currentTarget.closest(".task-item") as HTMLElement,
          );
        }}
      >
        <ActionIcon aria-hidden="true" />
      </button>
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
          {quest.due ? " · " + quest.due : ""}
          <i data-status={quest.status}> · {questLabels[quest.status]}</i>
        </span>
      </button>
    </div>
  );
}

export function TaskSection({
  quests,
  role,
  campaignActive,
  onCompose,
  onEdit,
  onTransition,
}: TaskSectionProps) {
  const active = quests.filter((quest) => quest.status !== "completed");
  const completed = quests.filter((quest) => quest.status === "completed");

  return (
    <section className="board-section task-section" data-section="tasks">
      <div className="sign sign-red task-sign">
        <span>工作指示与报告</span>
        {role === "gm" && campaignActive && (
          <button
            className="sign-action"
            type="button"
            onClick={onCompose}
            aria-label="发布工作指示"
            title="发布工作指示"
          >
            <Plus aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="task-papers">
        <article className="paper task-paper todo-paper">
          <h2>进行中</h2>
          <div className="task-list">
            {!active.length && <p className="board-empty">暂无工作指示</p>}
            {active.map((quest) => (
              <TaskItem
                key={quest.id}
                quest={quest}
                role={role}
                campaignActive={campaignActive}
                onEdit={onEdit}
                onTransition={onTransition}
              />
            ))}
          </div>
        </article>
        <article className="paper task-paper done-paper">
          <h2>已完成</h2>
          <div className="task-list">
            {!completed.length && <p className="board-empty">暂无完成记录</p>}
            {completed.map((quest) => (
              <TaskItem
                key={quest.id}
                quest={quest}
                role={role}
                campaignActive={campaignActive}
                onEdit={onEdit}
                onTransition={onTransition}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export function ShiftSection({
  members,
  onExpand,
}: {
  members: CampaignBoard["members"];
  onExpand: () => void;
}) {
  const active = members.filter((member) => member.active);
  return (
    <section className="board-section shift-section" data-section="shifts">
      <div className="sign sign-blue">危机排班</div>
      <button
        className="shift-paper roster-preview"
        type="button"
        onClick={onExpand}
        aria-label={`查看全部 ${active.length} 位在岗成员`}
        aria-haspopup="dialog"
      >
        <strong>{active.length} 人在岗</strong>
        <span className="roster-preview-list">
          {active.slice(0, 3).map((member) => (
            <span key={member.userId}>
              <b>{member.jobTitle}</b>
              <span>{member.characterName}</span>
            </span>
          ))}
        </span>
        <span className="roster-more">
          {active.length > 3 ? `还有 ${active.length - 3} 人 · ` : ""}
          点击查看完整排班 →
        </span>
      </button>
    </section>
  );
}

export function BurgerIndexSection({
  value,
  canManage,
  onManage,
}: {
  value: number;
  canManage: boolean;
  onManage: () => void;
}) {
  const info = burgerIndexInfo(value);
  return (
    <section
      className="board-section burger-index-section"
      data-section="index"
      data-color={info.color}
    >
      <div className="index-heading">
        <span>汉堡屋指数</span>
        {canManage && (
          <button
            type="button"
            className="icon-button"
            onClick={onManage}
            aria-label="调整汉堡屋指数"
          >
            <Pencil />
          </button>
        )}
      </div>
      <div className="index-current">
        <strong>{info.label}</strong>
        <span>{info.service}</span>
      </div>
      <div className="index-track" aria-label={`当前指数 ${info.label}`}>
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            data-color={i < 3 ? "red" : i < 6 ? "yellow" : "green"}
            className={value === i + 1 ? "is-current" : ""}
          />
        ))}
      </div>
      <p className="index-bonus">{info.bonus}</p>
      <p className="index-description">
        {value === 1 ? "红1：立即败北，请由 GM 处理结局。" : info.description}
      </p>
    </section>
  );
}

export function MemoSection({
  notes,
  onOpen,
}: {
  notes: CampaignBoard["notes"];
  onOpen: () => void;
}) {
  return (
    <section className="board-section memo-section" data-section="notes">
      <div className="sign sign-yellow">工作记录</div>
      <button
        className="paper memo-paper notes-preview"
        type="button"
        onClick={onOpen}
        aria-label="查看全部工作记录"
        aria-haspopup="dialog"
      >
        <strong>{notes.length} 条记录</strong>
        {notes.slice(0, 2).map((note) => (
          <span key={note.id}>{note.title}</span>
        ))}
        {!notes.length && <span>空白记录 · 等待张贴</span>}
        <small>点开查看与填写 →</small>
      </button>
    </section>
  );
}

interface SafetySectionProps {
  checklist: CampaignBoard["checklist"];
  canManage: boolean;
  onToggle: (id: string) => void;
  onManage: () => void;
}

export function SafetySection({
  checklist,
  canManage,
  onToggle,
  onManage,
}: SafetySectionProps) {
  return (
    <section className="board-section safety-section" data-section="safety">
      <div className="sign sign-green section-heading">
        <span>每日检查清单</span>
        {canManage && (
          <button
            className="sign-action"
            type="button"
            onClick={onManage}
            aria-label="编辑每日检查清单"
          >
            <Pencil />
          </button>
        )}
      </div>
      <article className="paper safety-paper">
        <div className="safety-list">
          {!checklist.length && (
            <p className="board-empty">
              暂无检查项{canManage ? "，点击铅笔添加。" : "，等待 GM 登记。"}
            </p>
          )}
          {checklist.map((item) => (
            <button
              className={"safety-item " + (item.completed ? "is-done" : "")}
              type="button"
              key={item.id}
              disabled={!canManage}
              title={canManage ? "切换检查状态" : "仅 GM 可以更新检查项"}
              onClick={() => onToggle(item.id)}
            >
              <span className="safety-box" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="inspection-stamp" aria-hidden="true">
          <small>汉堡店防御检查</small>
          <strong>戒备</strong>
          <small>每日一检</small>
        </div>
      </article>
    </section>
  );
}
