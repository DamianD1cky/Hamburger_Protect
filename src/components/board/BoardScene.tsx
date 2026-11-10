import { List, Plus, SmilePlus, Trash2 } from "lucide-react";
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
  BoardNoteLink,
  CampaignBoard,
  PinColor,
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
import { EmojiSticker } from "./EmojiSticker";
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
  onNoteLayer: (noteId: string, direction: -1 | 1) => Promise<unknown>;
  onNotePinColor: (noteId: string, color: PinColor) => Promise<unknown>;
  onCreateSticker: (emoji: string, x: number, y: number, rotation: number) => Promise<unknown>;
  onMoveSticker: (stickerId: string, x: number, y: number) => Promise<unknown>;
  onDeleteSticker: (stickerId: string) => Promise<unknown>;
  onCreateNoteLink: (
    fromNoteId: string,
    toNoteId: string,
  ) => Promise<BoardNoteLink>;
  onDeleteNoteLink: (linkId: string) => Promise<unknown>;
  onUpdateNoteLinkLabel: (
    linkId: string,
    label: string | null,
  ) => Promise<unknown>;
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
  onNotePinColor,
  onCreateSticker,
  onMoveSticker,
  onDeleteSticker,
  onDeleteNoteLink,
  onUpdateNoteLinkLabel,
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
  const pinColors: Record<PinColor, { fill: string; stroke: string }> = {
    red: { fill: "#e72b3c", stroke: "#71101a" },
    blue: { fill: "#2785d8", stroke: "#164a76" },
    green: { fill: "#36a467", stroke: "#1d5f3b" },
    yellow: { fill: "#f1c933", stroke: "#806a16" },
    black: { fill: "#343536", stroke: "#101112" },
  };
  const stickerChoices = ["😀", "⭐", "🔥", "❤️", "⚠️", "✅", "❓", "💡", "👑", "🎲", "💀", "🍔"];
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
  const pinPoint = (note: Pick<BoardNote, "x" | "y">) => ({
    x: note.x + NOTE_WIDTH / 2,
    y: note.y + PIN_Y,
  });
  const boardRef = useRef<HTMLElement>(null);
  const updateNoteLinkPosition = (noteId: string, x: number, y: number) => {
    const element = boardRef.current;
    if (!element) return;
    const point = pinPoint({ x, y });
    const lines = element.querySelectorAll<SVGLineElement>(
      "line[data-from-note-id], line[data-to-note-id]",
    );
    lines.forEach((line) => {
      if (line.dataset.fromNoteId === noteId) {
        line.setAttribute("x1", String(point.x));
        line.setAttribute("y1", String(point.y));
      }
      if (line.dataset.toNoteId === noteId) {
        line.setAttribute("x2", String(point.x));
        line.setAttribute("y2", String(point.y));
      }
    });

    element
      .querySelectorAll<SVGCircleElement>(".note-pin-cap[data-pin-note-id]")
      .forEach((pin) => {
        if (pin.dataset.pinNoteId !== noteId) return;
        pin.setAttribute("cx", String(point.x));
        pin.setAttribute("cy", String(point.y));
      });
    const visualLines = new Map<string, SVGLineElement>();
    element
      .querySelectorAll<SVGLineElement>(".note-link-line[data-link-id]")
      .forEach((line) => {
        const linkId = line.dataset.linkId;
        if (linkId) visualLines.set(linkId, line);
      });
    element
      .querySelectorAll<HTMLElement>(".note-link-label[data-link-id]")
      .forEach((label) => {
        if (
          label.dataset.fromNoteId !== noteId &&
          label.dataset.toNoteId !== noteId
        ) return;
        const line = visualLines.get(label.dataset.linkId ?? "");
        if (!line) return;
        const x1 = Number(line.getAttribute("x1"));
        const y1 = Number(line.getAttribute("y1"));
        const x2 = Number(line.getAttribute("x2"));
        const y2 = Number(line.getAttribute("y2"));
        label.style.left = (x1 + x2) / 2 + "px";
        label.style.top = (y1 + y2) / 2 + "px";
      });
  };
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [linking, setLinking] = useState<{
    fromId: string;
    x: number;
    y: number;
  } | null>(null);
  /** 正在编辑的连线纸片；新建连线后自动进入这个状态。 */
  const [editingLink, setEditingLink] = useState<{
    id: string;
    draft: string;
  } | null>(null);
  /** Esc 取消时置位，避免随后的 blur 又把空标签写回去。 */
  const cancelledEdit = useRef(false);
  const [pendingLinks, setPendingLinks] = useState<BoardNoteLink[]>([]);
  const pendingLinkCreations = useRef(
    new Map<string, Promise<BoardNoteLink>>(),
  );
  const sameLinkPair = (left: BoardNoteLink, right: BoardNoteLink) =>
    (left.fromNoteId === right.fromNoteId &&
      left.toNoteId === right.toNoteId) ||
    (left.fromNoteId === right.toNoteId &&
      left.toNoteId === right.fromNoteId);
  // 服务端确认前由临时连线占位；确认结果进入 board 后再原位替换。
  const visibleNoteLinks = [
    ...board.noteLinks.filter(
      (link) => !pendingLinks.some((pending) => sameLinkPair(link, pending)),
    ),
    ...pendingLinks,
  ];
  const handleCreateSticker = (emoji: string) => {
    const count = board.stickers.length;
    const x = 610 + ((count * 137) % 560);
    const y = 760 + ((count * 83) % 270);
    const rotation = [-9, 7, -4, 11, 3][count % 5];
    setStickerPickerOpen(false);
    void onCreateSticker(emoji, x, y, rotation);
  };

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
    const optimisticLink: BoardNoteLink = {
      id: `pending-${crypto.randomUUID()}`,
      fromNoteId: fromId,
      toNoteId: note.id,
      label: null,
    };
    const existing = visibleNoteLinks.find((link) =>
      sameLinkPair(link, optimisticLink),
    );
    if (existing) {
      setEditingLink({ id: existing.id, draft: existing.label ?? "" });
      return;
    }

    setPendingLinks((current) => [...current, optimisticLink]);
    setEditingLink({ id: optimisticLink.id, draft: "" });
    const creation = onCreateNoteLink(fromId, note.id);
    pendingLinkCreations.current.set(optimisticLink.id, creation);
    void creation
      .then((created) => {
        setPendingLinks((current) =>
          current.filter((link) => link.id !== optimisticLink.id),
        );
        setEditingLink((current) =>
          current?.id === optimisticLink.id
            ? { ...current, id: created.id }
            : current,
        );
      })
      .catch(() => {
        setPendingLinks((current) =>
          current.filter((link) => link.id !== optimisticLink.id),
        );
        setEditingLink((current) =>
          current?.id === optimisticLink.id ? null : current,
        );
      })
      .finally(() => {
        pendingLinkCreations.current.delete(optimisticLink.id);
      });
  };
  const commitLinkLabel = (linkId: string, draft: string) => {
    if (cancelledEdit.current) {
      cancelledEdit.current = false;
      return;
    }
    const trimmed = draft.trim();
    const next = trimmed ? trimmed.slice(0, 24) : null;
    const pending = pendingLinkCreations.current.get(linkId);
    const link = visibleNoteLinks.find((item) => item.id === linkId);
    setEditingLink(null);
    if (pending) {
      void pending.then((created) => {
        if (next !== created.label) {
          return onUpdateNoteLinkLabel(created.id, next);
        }
      });
      return;
    }
    if (!link) return;
    if (next === link.label) return;
    void onUpdateNoteLinkLabel(linkId, next);
  };
  const handleDeleteNoteLink = (linkId: string) => {
    const pending = pendingLinkCreations.current.get(linkId);
    setEditingLink(null);
    setPendingLinks((current) =>
      current.filter((link) => link.id !== linkId),
    );
    if (pending) {
      void pending.then((created) => onDeleteNoteLink(created.id));
      return;
    }
    void onDeleteNoteLink(linkId);
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
          {board.stickers.map((sticker) => (
            <EmojiSticker
              key={sticker.id}
              sticker={sticker}
              viewScaleRef={viewScaleRef}
              canEdit={canUpdateSharedBoard}
              onMove={onMoveSticker}
              onDelete={onDeleteSticker}
            />
          ))}

          {/* 命中层压在便签下面：点便签时不会被线抢走事件 */}
          <svg
            className="note-links-hit"
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {visibleNoteLinks.map((link) => {
              const from = board.notes.find((n) => n.id === link.fromNoteId);
              const to = board.notes.find((n) => n.id === link.toNoteId);
              if (!from || !to) return null;
              const a = pinPoint(from);
              const b = pinPoint(to);
              return (
                <line
                  key={link.id}
                  className="note-link-hit"
                  data-link-id={link.id}
                  data-from-note-id={link.fromNoteId}
                  data-to-note-id={link.toNoteId}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingLink({ id: link.id, draft: link.label ?? "" });
                  }}
                />
              );
            })}
          </svg>
          {/* 红绳在便签上方，但端点会被最上层的图钉帽盖住。 */}
          <svg
            className="note-links"
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {visibleNoteLinks.map((link) => {
              const from = board.notes.find((n) => n.id === link.fromNoteId);
              const to = board.notes.find((n) => n.id === link.toNoteId);
              if (!from || !to) return null;
              const a = pinPoint(from);
              const b = pinPoint(to);
              return (
                <line
                  key={link.id}
                  className="note-link-line"
                  data-link-id={link.id}
                  data-from-note-id={link.fromNoteId}
                  data-to-note-id={link.toNoteId}
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
                    data-from-note-id={linking.fromId}
                    x1={a.x}
                    y1={a.y}
                    x2={linking.x}
                    y2={linking.y}
                  />
                );
              })()}
          </svg>

          <svg
            className="note-pin-caps"
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {board.notes.map((note) => {
              const point = pinPoint(note);
              const color = pinColors[note.pinColor];
              return (
                <circle
                  key={note.id}
                  className="note-pin-cap"
                  data-pin-note-id={note.id}
                  cx={point.x}
                  cy={point.y}
                  r="8.5"
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth="3"
                />
              );
            })}
          </svg>

          {/* 连线上的纸片：新建连线后自动出现，留空则不保留 */}
          {visibleNoteLinks.map((link) => {
            const from = board.notes.find((n) => n.id === link.fromNoteId);
            const to = board.notes.find((n) => n.id === link.toNoteId);
            if (!from || !to) return null;
            const a = pinPoint(from);
            const b = pinPoint(to);
            const editing = editingLink?.id === link.id;
            if (!link.label && !editing) return null;
            return (
              <div
                className="note-link-label"
                key={link.id}
                data-link-id={link.id}
                data-from-note-id={link.fromNoteId}
                data-to-note-id={link.toNoteId}
                style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
              >
                {editing && editingLink ? (
                  <div className="note-link-label-editor">
                    <input
                      className="note-link-label-input"
                      value={editingLink.draft}
                      maxLength={24}
                      autoFocus
                      placeholder="写点关系…"
                      aria-label="连线说明"
                      onChange={(event) =>
                        setEditingLink({
                          id: link.id,
                          draft: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelledEdit.current = true;
                          setEditingLink(null);
                        }
                      }}
                      onBlur={(event) =>
                        commitLinkLabel(link.id, event.currentTarget.value)
                      }
                    />
                    <button
                      className="note-link-delete"
                      type="button"
                      aria-label="删除连线"
                      title="删除连线"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteNoteLink(link.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="note-link-label-text"
                    title="编辑连线说明"
                    onClick={() =>
                      setEditingLink({
                        id: link.id,
                        draft: link.label ?? "",
                      })
                    }
                  >
                    {link.label}
                  </button>
                )}
              </div>
            );
          })}
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
                    onPositionPreview={updateNoteLinkPosition}
                    onLayerChange={onNoteLayer}
                    onPinColorChange={onNotePinColor}
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

          {canUpdateSharedBoard && (
            <div className="sticker-actions">
              <button
                className="sticker-add"
                type="button"
                onClick={() => setStickerPickerOpen((open) => !open)}
                aria-label="添加 Emoji 贴纸"
                title="添加 Emoji 贴纸"
                aria-expanded={stickerPickerOpen}
              >
                <SmilePlus aria-hidden="true" />
              </button>
              {stickerPickerOpen && (
                <div className="sticker-picker" aria-label="选择 Emoji 贴纸">
                  {stickerChoices.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`添加贴纸 ${emoji}`}
                      onClick={() => handleCreateSticker(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
