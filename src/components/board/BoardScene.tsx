import { List, Plus } from "lucide-react";
import type { MouseEvent, Ref, RefObject } from "react";
import sceneUrl from "../../../assets/scene.webp";
import stickerTopLeft from "../../../assets/stickers/tl.webp";
import stickerTopRight from "../../../assets/stickers/tr.webp";
import stickerBottomLeft from "../../../assets/stickers/bl.webp";
import stickerBottomRight from "../../../assets/stickers/br.webp";
import stickerMiniOne from "../../../assets/stickers/mini1.webp";
import stickerMiniTwo from "../../../assets/stickers/mini2.webp";
import { sectionTitle } from "../../features/campaign/domain/campaignSettings";
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
import { BoardClock } from "./BoardClock";
import { NoteCard } from "./NoteCard";

interface BoardSceneProps {
  board: CampaignBoard;
  worldRef: Ref<HTMLDivElement>;
  viewScaleRef: RefObject<number>;
  onOpenResourceSheet: (group: number) => void;
  onManageChecklist: () => void;
  onManageIndex: () => void;
  onOpenNotes: () => void;
  onOpenActivity: () => void;
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
  onOpenResourceSheet,
  onManageChecklist,
  onManageIndex,
  onOpenNotes,
  onOpenActivity,
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
  const canUpdateSharedBoard =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const hidden = new Set(board.settings.hiddenSections);
  const title = (key: Parameters<typeof sectionTitle>[0]) =>
    sectionTitle(key, board.settings.sectionTitles);

  return (
    <div className="viewport">
      <div className="world" ref={worldRef}>
        <picture className="scene-picture">
          <img
            className="scene"
            src={board.settings.backgroundUrl ?? sceneUrl}
            width="2496"
            height="1664"
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            fetchPriority="high"
            onError={(event) => {
              if (event.currentTarget.src !== sceneUrl) {
                event.currentTarget.src = sceneUrl;
              }
            }}
          />
        </picture>

        <BoardClock />

        <main className="board" aria-label={board.campaign.name + "战役公告板"}>
          {!hidden.has("inventory") && (
            <InventorySection
              title={title("inventory")}
              resources={board.resources}
              canManage={canUpdateSharedBoard}
              onOpenSheet={onOpenResourceSheet}
            />
          )}
          {!hidden.has("tasks") && (
            <TaskSection
              title={title("tasks")}
              quests={board.quests}
              viewer={board.viewer}
              campaignActive={board.campaign.status === "active"}
              onCompose={onComposeQuest}
              onEdit={onEditQuest}
              onTransition={onTransitionQuest}
            />
          )}
          {!hidden.has("shifts") && (
            <ShiftSection
              title={title("shifts")}
              members={board.members}
              canExpand={board.viewer.role !== "observer"}
              onExpand={onExpandRoster}
            />
          )}
          {!hidden.has("index") && (
            <BurgerIndexSection
              title={title("index")}
              value={board.campaign.burgerIndex}
              canManage={canManage}
              onManage={onManageIndex}
            />
          )}
          {!hidden.has("activity") && (
            <MemoSection
              title={title("activity")}
              board={board}
              onOpen={onOpenActivity}
            />
          )}
          {!hidden.has("safety") && (
            <SafetySection
              title={title("safety")}
              checklist={board.checklist}
              categories={board.checklistCategories}
              canManage={canManage}
              canToggle={canUpdateSharedBoard}
              onToggle={onToggleChecklist}
              onManage={onManageChecklist}
            />
          )}

          {!hidden.has("notes") && (
            <>
              <div
                className="user-notes"
                data-section="notes"
                aria-live="polite"
              >
                <h2 className="mobile-notes-heading">{title("notes")}</h2>
                {board.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    noteTextureUrl={board.settings.noteTextureUrl}
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

              <div className="pin-actions">
                <button
                  className="pin-view"
                  type="button"
                  onClick={onOpenNotes}
                  aria-label={`查看全部便签，共 ${board.notes.length} 条`}
                  title="查看全部便签"
                >
                  <List aria-hidden="true" />
                  <span>{board.notes.length}</span>
                </button>
                {canEditNotes && (
                  <button
                    className="pin-add"
                    type="button"
                    onClick={onComposeNote}
                    aria-label="填写便签"
                    title="填写便签"
                  >
                    <Plus aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
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
