import { List, Plus } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type Ref, type RefObject } from "react";
import sceneUrl from "../../../assets/scene.webp";
import stickerTopLeft from "../../../assets/stickers/tl.webp";
import stickerTopRight from "../../../assets/stickers/tr.webp";
import stickerBottomLeft from "../../../assets/stickers/bl.webp";
import stickerBottomRight from "../../../assets/stickers/br.webp";
import stickerMiniOne from "../../../assets/stickers/mini1.webp";
import stickerMiniTwo from "../../../assets/stickers/mini2.webp";
import {
  sectionColor,
  sectionTitle,
  titleColorStyle,
} from "../../features/campaign/domain/campaignSettings";
import type {
  BoardNote,
  CampaignBoard,
  CampaignSectionKey,
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
  type SectionActions,
} from "./BoardSections";
import { BoardClock } from "./BoardClock";
import { BoardModuleFrame } from "./BoardModuleFrame";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../../features/campaign/domain/boardModules";
import { NoteCard } from "./NoteCard";
import {
  moduleRect,
  type BoardModuleKey,
  type BoardModuleLayout,
} from "../../features/campaign/domain/boardModules";

interface BoardSceneProps {
  board: CampaignBoard;
  worldRef: Ref<HTMLDivElement>;
  viewScaleRef: RefObject<number>;
  onOpenResourceSheet: (group: number) => void;
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
  onNoteLayer: (noteId: string, layer: number) => Promise<unknown>;
  onCreateNoteLink: (fromNoteId: string, toNoteId: string) => Promise<unknown>;
  onDeleteNoteLink: (linkId: string) => Promise<unknown>;
  onEditSection: (key: CampaignSectionKey) => void;
  onHideSection: (key: CampaignSectionKey) => void;
  moduleLayout: BoardModuleLayout;
  onMoveModule: (
    key: BoardModuleKey,
    x: number,
    y: number,
  ) => Promise<unknown>;
}

export function BoardScene({
  board,
  worldRef,
  viewScaleRef,
  onOpenResourceSheet,
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
  onNoteLayer,
  onCreateNoteLink,
  onDeleteNoteLink,
  onEditSection,
  onHideSection,
  moduleLayout,
  onMoveModule,
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
  const hasCustomBackground = Boolean(board.settings.backgroundUrl);
  const color = (key: Parameters<typeof sectionTitle>[0]) => {
    const custom = board.settings.sectionColors ?? {};
    return custom[key] ? sectionColor(key, custom) : undefined;
  };
  const actionsFor = (key: CampaignSectionKey): SectionActions | undefined =>
    canManage
      ? {
          onEdit: () => onEditSection(key),
          onHide: () => onHideSection(key),
        }
      : undefined;
  // 连线的锚点固定在便签顶部的图钉上，所以只跟 x 和固定偏移有关。
  const NOTE_WIDTH = 276;
  const PIN_Y = 16.5;
  const pinPoint = (note: BoardNote) => ({
    x: note.x + NOTE_WIDTH / 2,
    y: note.y + PIN_Y,
  });
  const boardRef = useRef<HTMLElement>(null);
  const [linking, setLinking] = useState<{
    fromId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!linking) return;
    const toBoardPoint = (clientX: number, clientY: number) => {
      const element = boardRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const scale = viewScaleRef.current || 1;
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    };
    const onMove = (event: globalThis.PointerEvent) => {
      const point = toBoardPoint(event.clientX, event.clientY);
      if (!point) return;
      setLinking((current) =>
        current ? { ...current, x: point.x, y: point.y } : current,
      );
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLinking(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [linking, viewScaleRef]);

  const handlePinClick = (note: BoardNote) => {
    if (!linking) {
      const point = pinPoint(note);
      setLinking({ fromId: note.id, x: point.x, y: point.y });
      return;
    }
    if (linking.fromId === note.id) {
      setLinking(null);
      return;
    }
    const fromId = linking.fromId;
    setLinking(null);
    void onCreateNoteLink(fromId, note.id);
  };
  const resourceTitles = board.settings.resourceTitles ?? {};
  const notesColor = color("notes");
  /** 把区块包进可拖拽模块；位置来自 module_layout，缺省时用内置位置。 */
  const moduleFrame = (key: BoardModuleKey, node: ReactNode) => (
    <BoardModuleFrame
      moduleKey={key}
      rect={moduleRect(key, moduleLayout)}
      layout={moduleLayout}
      canDrag={canManage}
      viewScaleRef={viewScaleRef}
      onMove={onMoveModule}
    >
      {node}
    </BoardModuleFrame>
  );
  const sceneSrc = board.settings.backgroundUrl ?? sceneUrl;
  const fallBackToDefaultScene = (event: {
    currentTarget: HTMLImageElement;
  }) => {
    if (event.currentTarget.src !== sceneUrl) {
      event.currentTarget.src = sceneUrl;
    }
  };

  return (
    <div className="viewport">
      {/* Full-bleed fill: the scaled world is sized to keep the board fully
          visible, which can leave margins around the scene on extreme
          window shapes. This blurred copy of the same scene always covers
          the whole viewport, so the page backdrop can never show through. */}
      <img
        className="scene-fill"
        src={sceneSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        onError={fallBackToDefaultScene}
      />
      <div
        className="world"
        data-has-custom-background={hasCustomBackground || undefined}
        ref={worldRef}
      >
        <picture className="scene-picture">
          <img
            className="scene"
            src={sceneSrc}
            width="2496"
            height="1664"
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            fetchPriority="high"
            onError={fallBackToDefaultScene}
          />
        </picture>

        {hasCustomBackground && (
          <div className="scene-frame" aria-hidden="true">
            <span className="scene-frame-top" />
            <span className="scene-frame-right" />
            <span className="scene-frame-bottom" />
            <span className="scene-frame-left" />
          </div>
        )}

        <BoardClock />

        <main
          className="board"
          aria-label={board.campaign.name + " 公告板"}
          ref={boardRef}
        >
                    {/* 命中层压在便签下面：点便签时不会被线抢走事件 */}
          <svg
            className="note-links-hit"
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {board.noteLinks.map((link) => {
              const from = board.notes.find((n) => n.id === link.fromNoteId);
              const to = board.notes.find((n) => n.id === link.toNoteId);
              if (!from || !to) return null;
              const a = pinPoint(from);
              const b = pinPoint(to);
              return (
                <line
                  key={link.id}
                  className="note-link-hit"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    void onDeleteNoteLink(link.id);
                  }}
                />
              );
            })}
          </svg>
          {/* 视觉层盖在便签上面：红绳从一颗图钉直接连到另一颗 */}
          <svg
            className="note-links"
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {board.noteLinks.map((link) => {
              const from = board.notes.find((n) => n.id === link.fromNoteId);
              const to = board.notes.find((n) => n.id === link.toNoteId);
              if (!from || !to) return null;
              const a = pinPoint(from);
              const b = pinPoint(to);
              return (
                <line
                  key={link.id}
                  className="note-link-line"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}
            {linking &&
              (() => {
                const from = board.notes.find((n) => n.id === linking.fromId);
                if (!from) return null;
                const a = pinPoint(from);
                return (
                  <line
                    className="note-link-line is-preview"
                    x1={a.x}
                    y1={a.y}
                    x2={linking.x}
                    y2={linking.y}
                  />
                );
              })()}
          </svg>
          {!hidden.has("inventory") &&
            moduleFrame(
              "inventory",
              <InventorySection
                title={title("inventory")}
                color={color("inventory")}
                resourceTitles={resourceTitles}
                actions={actionsFor("inventory")}
                resources={board.resources}
                canManage={canUpdateSharedBoard}
                onOpenSheet={onOpenResourceSheet}
              />,
            )}
          {!hidden.has("tasks") &&
            moduleFrame(
              "tasks",
              <TaskSection
                title={title("tasks")}
                color={color("tasks")}
                actions={actionsFor("tasks")}
                quests={board.quests}
                viewer={board.viewer}
                campaignActive={board.campaign.status === "active"}
                onCompose={onComposeQuest}
                onEdit={onEditQuest}
                onTransition={onTransitionQuest}
              />,
            )}
          {!hidden.has("shifts") &&
            moduleFrame(
              "shifts",
              <ShiftSection
                title={title("shifts")}
                color={color("shifts")}
                actions={actionsFor("shifts")}
                members={board.members}
                canExpand={board.viewer.role !== "observer"}
                onExpand={onExpandRoster}
              />,
            )}
          {!hidden.has("index") &&
            moduleFrame(
              "index",
              <BurgerIndexSection
                title={title("index")}
                color={color("index")}
                actions={actionsFor("index")}
                value={board.campaign.burgerIndex}
                canManage={canManage}
                onManage={onManageIndex}
              />,
            )}
          {!hidden.has("activity") &&
            moduleFrame(
              "activity",
              <MemoSection
                title={title("activity")}
                color={color("activity")}
                actions={actionsFor("activity")}
                board={board}
                onOpen={onOpenActivity}
              />,
            )}
          {!hidden.has("safety") &&
            moduleFrame(
              "safety",
              <SafetySection
                title={title("safety")}
                color={color("safety")}
                actions={actionsFor("safety")}
                checklist={board.checklist}
                categories={board.checklistCategories}
                canManage={canManage}
                canToggle={canUpdateSharedBoard}
                onToggle={onToggleChecklist}
              />,
            )}

          {!hidden.has("notes") && (
            <>
              <div
                className="user-notes"
                data-section="notes"
                aria-live="polite"
              >
                <h2
                  className="mobile-notes-heading"
                  style={notesColor ? titleColorStyle(notesColor) : undefined}
                >
                  {title("notes")}
                </h2>
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
                    onLayerChange={onNoteLayer}
                    canLink={canUpdateSharedBoard}
                    linkingFrom={linking?.fromId === note.id}
                    onPinClick={handlePinClick}
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
