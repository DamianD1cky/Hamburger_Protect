import type { MouseEvent } from "react";
import type { CampaignBoard, Quest, QuestStatus } from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";
import { TaskItem } from "./BoardSections";

export type BoardDetailsKind = "active-tasks" | "completed-tasks" | "checklist";

/** Full lists live outside the fixed board cards and use the dialog's one scroll area. */
export function BoardDetailsDialog({ kind, board, onClose, onEditQuest, onTransitionQuest, onToggleChecklist }: {
  kind: BoardDetailsKind;
  board: CampaignBoard;
  onClose: () => void;
  onEditQuest: (quest: Quest, event: MouseEvent<HTMLElement>) => void;
  onTransitionQuest: (quest: Quest, status: QuestStatus, source: HTMLElement) => Promise<void>;
  onToggleChecklist: (id: string) => void;
}) {
  const title = kind === "checklist" ? "每日检查清单" :
    kind === "active-tasks" ? "进行中的工作指示" : "已完成的工作指示";
  const active = board.campaign.status === "active";
  const canToggle = active && board.viewer.role !== "observer";
  const quests = board.quests.filter((quest) =>
    (quest.status === "completed") === (kind === "completed-tasks"));
  return <PaperDialog title={title} className="board-details-dialog" onClose={onClose}>
    {kind === "checklist" ? <div className="checklist-directory">
      {[...board.checklistCategories, { id: "", name: "未分类" }].map((category) => {
        const items = board.checklist.filter((item) => (item.categoryId ?? "") === category.id);
        if (!items.length) return null;
        return <section key={category.id} className="safety-group">
          <h2>{category.name} <small>{items.length}</small></h2>
          {items.map((item) => <button type="button" key={item.id}
            className={`safety-item ${item.completed ? "is-done" : ""}`}
            disabled={!canToggle} onClick={() => onToggleChecklist(item.id)}>
            <span className="safety-box" aria-hidden="true" /><span>{item.label}</span>
          </button>)}
        </section>;
      })}
    </div> : <div className="task-directory">
      {quests.map((quest) => <TaskItem key={quest.id} quest={quest} viewer={board.viewer}
        campaignActive={active} onEdit={onEditQuest} onTransition={onTransitionQuest} />)}
    </div>}
  </PaperDialog>;
}
