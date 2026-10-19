import { Plus } from "lucide-react";
import type { MouseEvent, Ref, RefObject } from "react";
import sceneUrl from "../../../assets/scene.webp";
import stickerTopLeft from "../../../assets/stickers/tl.webp";
import stickerTopRight from "../../../assets/stickers/tr.webp";
import stickerBottomLeft from "../../../assets/stickers/bl.webp";
import stickerBottomRight from "../../../assets/stickers/br.webp";
import stickerMiniOne from "../../../assets/stickers/mini1.webp";
import stickerMiniTwo from "../../../assets/stickers/mini2.webp";
import type {
  BoardNote,
  CampaignBoard,
  Quest,
  QuestStatus,
} from "../../features/campaign/domain/types";
import {
  BurgerIndexSection,
  InventorySection,
  MemoSection,
  SafetySection,
  ShiftSection,
  TaskSection,
} from "./BoardSections";
import { NoteCard } from "./NoteCard";

interface BoardSceneProps {
  board: CampaignBoard;
  worldRef: Ref<HTMLDivElement>;
  viewScaleRef: RefObject<number>;
  onCycleResource: (id: string) => void;
  onManageResources: () => void;
  onManageChecklist: () => void;
  onManageIndex: () => void;
  onExpandRoster: () => void;
  onToggleChecklist: (id: string) => void;
  onComposeQuest: (event: MouseEvent<HTMLElement>) => void;
  onComposeNote: (event: MouseEvent<HTMLElement>) => void;
  onEditQuest: (quest: Quest, event: MouseEvent<HTMLElement>) => void;
  onEditNote: (note: BoardNote, element: HTMLElement) => void;
  onTransitionQuest: (
    quest: Quest,
    status: QuestStatus,
    source: HTMLElement,
  ) => Promise<void>;
  onMoveNote: (noteId: string, x: number, y: number) => Promise<unknown>;
}

export function BoardScene({
  board,
  worldRef,
  viewScaleRef,
  onCycleResource,
  onManageResources,
  onManageChecklist,
  onManageIndex,
  onExpandRoster,
  onToggleChecklist,
  onComposeQuest,
  onComposeNote,
  onEditQuest,
  onEditNote,
  onTransitionQuest,
  onMoveNote,
}: BoardSceneProps) {
  const canEditNotes =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const canManage =
    board.viewer.role === "gm" && board.campaign.status === "active";

  return (
    <div className="viewport">
      <div className="world" ref={worldRef}>
        <picture className="scene-picture">
          <img
            className="scene"
            src={sceneUrl}
            width="2496"
            height="1664"
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            fetchPriority="high"
          />
        </picture>

        <main className="board" aria-label={board.campaign.name + "战役公告板"}>
          <InventorySection
            resources={board.resources}
            canManage={canManage}
            onCycle={onCycleResource}
            onManage={onManageResources}
          />
          <TaskSection
            quests={board.quests}
            role={board.viewer.role}
            campaignActive={board.campaign.status === "active"}
            onCompose={onComposeQuest}
            onEdit={onEditQuest}
            onTransition={onTransitionQuest}
          />
          <ShiftSection members={board.members} onExpand={onExpandRoster} />
          <BurgerIndexSection
            value={board.campaign.burgerIndex}
            canManage={canManage}
            onManage={onManageIndex}
          />
          <MemoSection />
          <SafetySection
            checklist={board.checklist}
            canManage={canManage}
            onToggle={onToggleChecklist}
            onManage={onManageChecklist}
          />

          <div className="user-notes" data-section="notes" aria-live="polite">
            <h2 className="mobile-notes-heading">工作记录</h2>
            {board.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                viewScaleRef={viewScaleRef}
                canEdit={
                  canEditNotes &&
                  (board.viewer.role === "gm" ||
                    note.authorId === board.viewer.id)
                }
                onEdit={onEditNote}
                onMove={onMoveNote}
              />
            ))}
          </div>

          {canEditNotes && (
            <button
              className="pin-add"
              type="button"
              onClick={onComposeNote}
              aria-label="填写工作记录"
              title="填写工作记录"
            >
              <Plus aria-hidden="true" />
            </button>
          )}
        </main>

        <img
          className="sticker sticker-tl"
          src={stickerTopLeft}
          alt=""
          aria-hidden="true"
        />
        <img
          className="sticker sticker-tr"
          src={stickerTopRight}
          alt=""
          aria-hidden="true"
        />
        <img
          className="sticker sticker-bl"
          src={stickerBottomLeft}
          alt=""
          aria-hidden="true"
        />
        <img
          className="sticker sticker-br"
          src={stickerBottomRight}
          alt=""
          aria-hidden="true"
        />
        <img
          className="sticker sticker-mini1"
          src={stickerMiniOne}
          alt=""
          aria-hidden="true"
        />
        <img
          className="sticker sticker-mini2"
          src={stickerMiniTwo}
          alt=""
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
