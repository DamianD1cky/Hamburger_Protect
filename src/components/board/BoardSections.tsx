import { Circle, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import type { MouseEvent } from "react";
import type {
  CampaignBoard,
  Quest,
  QuestStatus,
  ResourceStatus,
} from "../../features/campaign/domain/types";
import { nextQuestStatus } from "../../features/campaign/domain/types";

const resourceLabels: Record<ResourceStatus, string> = {
  ok: "已备",
  low: "待补",
  out: "耗尽",
};

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

interface InventorySectionProps {
  resources: CampaignBoard["resources"];
  canManage: boolean;
  onCycle: (id: string) => void;
}

export function InventorySection({
  resources,
  canManage,
  onCycle,
}: InventorySectionProps) {
  const groups = [0, 1, 2].map((group) =>
    resources.filter((resource) => resource.group === group),
  );

  return (
    <section
      className="board-section inventory-section"
      data-section="inventory"
    >
      <div className="sign sign-red">明日要准备的物资</div>
      <div className="inventory-stack">
        {groups.map((group, index) => (
          <article className="inventory-card" key={index}>
            {group.map((item) => (
              <button
                className="inventory-row"
                type="button"
                key={item.id}
                disabled={!canManage}
                title={canManage ? "切换物资状态" : "仅 GM 可以管理物资"}
                onClick={() => onCycle(item.id)}
              >
                <span className="quantity">
                  {item.name}　{item.quantity}
                </span>
                <span className="inventory-status" data-state={item.status}>
                  （{resourceLabels[item.status]}）
                </span>
              </button>
            ))}
          </article>
        ))}
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
  const canEdit = campaignActive && role === "gm";
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
        disabled={!canEdit}
        title={canEdit ? "编辑任务" : "仅 GM 可以编辑任务"}
        onClick={(event) => onEdit(quest, event)}
      >
        <span className="task-title">{quest.title}</span>
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
        <span>要执行的任务</span>
        {role === "gm" && campaignActive && (
          <button
            className="sign-action"
            type="button"
            onClick={onCompose}
            aria-label="发布任务"
            title="发布任务"
          >
            <Plus aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="task-papers">
        <article className="paper task-paper todo-paper">
          <h2>进行中</h2>
          <div className="task-list">
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

export function ShiftSection() {
  const rows = [
    ["5.20", "侦查", "张三", "09:00"],
    ["5.20", "备料", "李四", "09:00"],
    ["5.20", "前门", "赵六", "11:00"],
    ["5.20", "后门", "孙七", "17:00"],
    ["5.20", "支援", "周八", "17:00"],
    ["5.20", "守夜", "吴九", "22:00"],
  ];
  return (
    <section className="board-section shift-section" data-section="shifts">
      <div className="sign sign-blue">队员排班</div>
      <article className="shift-paper">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>岗位</th>
              <th>姓名</th>
              <th>到岗</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

export function MemoSection() {
  return (
    <section className="board-section memo-section" data-section="notes">
      <div className="sign sign-yellow">今日特别情报</div>
      <article className="paper memo-paper">
        <ul>
          <li>西侧卷帘门有抓痕</li>
          <li>冷库物资优先转移</li>
          <li>午夜前完成布防</li>
        </ul>
      </article>
    </section>
  );
}

interface SafetySectionProps {
  checklist: CampaignBoard["checklist"];
  canManage: boolean;
  onToggle: (id: string) => void;
}

export function SafetySection({
  checklist,
  canManage,
  onToggle,
}: SafetySectionProps) {
  return (
    <section className="board-section safety-section" data-section="safety">
      <div className="sign sign-green">每日防御与卫生提示</div>
      <article className="paper safety-paper">
        <div className="safety-list">
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
