import { Archive, Plus, SmilePlus, StickyNote, Trash2 } from "lucide-react";
import { visibleArchiveEntriesForRole } from "../../features/campaign/domain/archiveBox";
import { Dock3DIcon } from "./Dock3DIcon";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type Ref, type RefObject } from "react";
import {
  resolvePinColorVisual,
  sectionColor,
  sectionTitle,
  titleColorStyle,
} from "../../features/campaign/domain/campaignSettings";
import type {
  BoardNote,
  BoardNoteLink,
  CampaignBoard,
  CampaignSectionKey,
  Quest,
  QuestStatus,
} from "../../features/campaign/domain/types";
import {
  InventorySection,
  MemoSection,
  SafetySection,
  ShiftSection,
  TaskSection,
  type SectionActions,
} from "./BoardSections";
import { BoardClock } from "./BoardClock";
import { EventClockSection } from "./EventClockSection";
import { RoomBackground, BoardSurface, BoardFrame } from "./BoardAppearance";
import { EmojiSticker } from "./EmojiSticker";
import { BoardModuleFrame } from "./BoardModuleFrame";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../../features/campaign/domain/boardModules";
import { boardGeometryStyle } from "../../features/campaign/domain/boardGeometry";
import { boardStyleVariables } from "../../features/campaign/domain/boardStyleTokens";
import type {
  BoardCustomPanel,
  CustomPanelInteraction,
} from "../../features/campaign/domain/customPanels";
import { BASE_NOTE_WIDTH, clampNoteScale, NoteCard } from "./NoteCard";
import { CustomPanelCard } from "./CustomPanelCard";
import {
  boardModuleKeys,
  moduleRect,
  resolveModuleCardEffect,
  type BoardModuleKey,
  type BoardModuleLayout,
  type BoardModuleRect,
} from "../../features/campaign/domain/boardModules";
import { eventClockRects } from "../../features/campaign/domain/eventClockLayout";

interface BoardSceneProps {
  board: CampaignBoard;
  worldRef: Ref<HTMLDivElement>;
  viewScaleRef: RefObject<number>;
  onOpenResourceSheet: (group: number) => void;
  onEventClockProgress: (id: string, progress: number, revision: number) => Promise<unknown>;
  onMoveEventClock: (id: string, x: number, y: number, revision: number) => Promise<unknown>;
  onEditEventClock: (id: string) => void;
  onViewChecklist: () => void;
  onViewQuests: (completed: boolean) => void;
  onOpenNotes: () => void;
  onOpenActivity: () => void;
  onExpandRoster: () => void;
  onToggleChecklist: (id: string) => void;
  onComposeQuest: (event: MouseEvent<HTMLElement>) => void;
  onComposeNote: (event: MouseEvent<HTMLElement>) => void;
  onEditQuest: (quest: Quest, event: MouseEvent<HTMLElement>) => void;
  onEditNote: (note: BoardNote, element: HTMLElement) => void;
  selectedNoteId?: string;
  onBlankClick?: () => void;
  onNoteGesture?: (noteId: string, active: boolean) => void;
  onNoteScalePreview?: (noteId: string, scale?: number) => void;
  onPostCustomPanelNote?: (title: string, body: string) => Promise<unknown>;
  onTransitionQuest: (
    quest: Quest,
    status: QuestStatus,
    source: HTMLElement,
  ) => Promise<void>;
  onMoveNote: (noteId: string, x: number, y: number) => Promise<unknown>;
  onResizeNote?: (noteId: string, scale: number) => Promise<unknown>;
  onNoteLayer: (noteId: string, direction: -1 | 1) => Promise<unknown>;
  onCreateSticker: (emoji: string, x: number, y: number, rotation: number) => Promise<unknown>;
  onMoveSticker: (stickerId: string, x: number, y: number) => Promise<unknown>;
  onResizeSticker: (stickerId: string, scale: number) => Promise<unknown>;
  onRotateSticker: (stickerId: string, rotation: number) => Promise<unknown>;
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
  onResizeModule?: (
    key: BoardModuleKey,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => Promise<unknown>;
  onEditCustomPanel?: (panel: BoardCustomPanel) => void;
  onHideCustomPanel?: (panelId: string) => void;
  onDeleteCustomPanel?: (panelId: string) => void;
  onInteractCustomPanel?: (
    panelId: string,
    blockId: string,
    action: CustomPanelInteraction,
  ) => void;
  onUpdateCustomPanelGeometry?: (
    panelId: string,
    rect: BoardModuleRect,
  ) => Promise<unknown>;
  onOpenClockSettings: () => void;
  onOpenArchiveBox: () => void;
  diceTool?: ReactNode;
}

export function BoardScene({
  board,
  worldRef,
  viewScaleRef,
  onOpenResourceSheet,
  onEventClockProgress,
  onMoveEventClock,
  onEditEventClock,
  onViewChecklist,
  onViewQuests,
  onOpenNotes,
  onOpenActivity,
  onExpandRoster,
  onToggleChecklist,
  onComposeQuest,
  onComposeNote,
  onEditQuest,
  onEditNote,
  selectedNoteId,
  onBlankClick,
  onNoteGesture,
  onNoteScalePreview,
  onPostCustomPanelNote,
  onTransitionQuest,
  onMoveNote,
  onResizeNote,
  onNoteLayer: _onNoteLayer,
  onCreateNoteLink,
  onCreateSticker,
  onMoveSticker,
  onResizeSticker,
  onRotateSticker,
  onDeleteSticker,
  onDeleteNoteLink,
  onUpdateNoteLinkLabel,
  onEditSection,
  onHideSection,
  moduleLayout,
  onMoveModule,
  onResizeModule,
  onEditCustomPanel,
  onHideCustomPanel,
  onDeleteCustomPanel,
  onInteractCustomPanel,
  onUpdateCustomPanelGeometry,
  onOpenClockSettings,
  onOpenArchiveBox,
  diceTool,
}: BoardSceneProps) {
  const canEditNotes =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const canManage =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const canUpdateSharedBoard =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const stickerChoices = ["😀", "⭐", "🔥", "❤️", "⚠️", "✅", "❓", "💡", "👑", "🎲", "💀", "🍔"];
  const hidden = new Set(board.settings.hiddenSections);
  const clockRects = eventClockRects(board.eventClocks, moduleLayout, board.settings.hiddenSections);
  const occupiedModules = boardModuleKeys.filter((key) => key !== "index" && !hidden.has(key))
    .map((key) => ({ key, rect: moduleRect(key, moduleLayout) }));
  const visibleClockRects = hidden.has("index") ? [] : [...clockRects.values()];
  const title = (key: Parameters<typeof sectionTitle>[0]) =>
    sectionTitle(key, board.settings.sectionTitles);
  const color = (key: Parameters<typeof sectionTitle>[0]) => {
    const custom = board.settings.sectionColors ?? {};
    return custom[key] ? sectionColor(key, custom) : undefined;
  };
  const actionsFor = (key: CampaignSectionKey): SectionActions | undefined =>
    canManage
      ? {
          onEdit: () => onEditSection(key),
          onHide: () => onHideSection(key),
          editLabel: `编辑${title(key)}模块`,
        }
      : undefined;
  // 连线的锚点固定在便签顶部中点的图钉上（缩放时随便签宽度居中，旋转绕此图钉孔转动所以不偏移）。
  const PIN_Y = 16.5;
  const pinPoint = (note: Pick<BoardNote, "x" | "y"> & { scale?: number }) => ({
    x: note.x + Math.round(BASE_NOTE_WIDTH * clampNoteScale(note.scale)) / 2,
    y: note.y + PIN_Y,
  });
  const boardRef = useRef<HTMLElement>(null);
  const blankPress = useRef({ x: 0, y: 0, time: 0 });
  const updateNoteLinkPosition = (
    noteId: string,
    x: number,
    y: number,
    scale?: number,
  ) => {
    const element = boardRef.current;
    if (!element) return;
    const currentNote = board.notes.find((n) => n.id === noteId);
    const point = pinPoint({ x, y, scale: scale ?? currentNote?.scale });
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
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [stickerPlacement, setStickerPlacement] = useState<{ x: number; y: number } | null>(null);
  const [stickerSaving, setStickerSaving] = useState(false);
  const [stickerError, setStickerError] = useState("");
  const stickerSavingRef = useRef(false);
  const suppressStickerClick = useRef(false);
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
  const chooseSticker = (emoji: string) => {
    setStickerError("");
    setLinking(null);
    setSelectedEmoji(emoji);
    setStickerPlacement(null);
    setStickerPickerOpen(false);
  };
  const stickerPoint = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = viewScaleRef.current || 1;
    return {
      x: Math.round(Math.max(0, Math.min(BOARD_WIDTH - 72, (event.clientX - rect.left) / scale - 36))),
      y: Math.round(Math.max(0, Math.min(BOARD_HEIGHT - 72, (event.clientY - rect.top) / scale - 36))),
    };
  };
  const placeSticker = (event: PointerEvent<HTMLElement>) => {
    if (!selectedEmoji || (event.target as HTMLElement).closest(".sticker-actions")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    suppressStickerClick.current = true;
    if (stickerSavingRef.current) return;
    const point = stickerPoint(event);
    setStickerPlacement(point);
    stickerSavingRef.current = true;
    setStickerSaving(true);
    void onCreateSticker(selectedEmoji, point.x, point.y, 0)
      .then(() => {
        setSelectedEmoji(null);
        setStickerPlacement(null);
      })
      .catch((error: unknown) => {
        setStickerError(error instanceof Error ? error.message : "贴纸保存失败，请重试。");
        setSelectedEmoji(null);
        setStickerPlacement(null);
        setStickerPickerOpen(true);
      })
      .finally(() => {
        stickerSavingRef.current = false;
        setStickerSaving(false);
      });
  };

  useEffect(() => {
    if (!selectedEmoji) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || stickerSavingRef.current) return;
      setSelectedEmoji(null);
      setStickerPlacement(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selectedEmoji]);

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
  const hiddenPanelIds = new Set(
    board.settings.styleTokens?.hiddenPanelIds ?? [],
  );
  const customPanels = (board.settings.customPanels ?? []).filter(
    (panel) => !hiddenPanelIds.has(panel.id),
  );
  const hiddenModuleSet = new Set(
    board.settings.hiddenSections.filter((s): s is BoardModuleKey =>
      boardModuleKeys.includes(s as BoardModuleKey),
    ),
  );
  const customPanelRects: BoardModuleRect[] = customPanels.map((p) => ({
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
  }));
  const defaultCardEffect = board.settings.styleTokens?.defaultCardEffect;
  /** 把区块包进可拖拽与缩放模块；位置、尺寸与卡片装饰效果来自 module_layout。 */
  const moduleFrame = (key: BoardModuleKey, node: ReactNode) => (
    <BoardModuleFrame
      moduleKey={key}
      rect={moduleRect(key, moduleLayout)}
      effect={resolveModuleCardEffect(key, moduleLayout, defaultCardEffect)}
      layout={moduleLayout}
      canDrag={canManage}
      viewScaleRef={viewScaleRef}
      placementContext={{
        hiddenKeys: hiddenModuleSet,
        extraObstacles: customPanelRects,
      }}
      onMove={onMoveModule}
      onResize={onResizeModule}
      obstacles={[
        ...occupiedModules.filter((module) => module.key !== key).map((module) => module.rect),
        ...visibleClockRects,
        ...customPanelRects,
        ...(!hidden.has("index") && !board.eventClocks.length && key !== "index" ? [moduleRect("index", moduleLayout)] : []),
      ]}
    >
      {node}
    </BoardModuleFrame>
  );
  return (
    <>
    <RoomBackground appearance={board.settings.appearance} imageUrl={board.settings.backgroundUrl} fullscreen />
    <BoardClock
      config={board.settings.clock}
      clockAppearance={board.settings.styleTokens?.clockAppearance}
      boardAppearance={board.settings.appearance}
      styleTokens={board.settings.styleTokens}
      canManage={canManage}
      onOpenSettings={onOpenClockSettings}
    />
    <div className="viewport"
      onPointerDownCapture={(event) => { blankPress.current = { x: event.clientX, y: event.clientY, time: performance.now() }; }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(".board,.user-note,.board-module-frame,button,input,textarea,select,.board-sticker")) return;
        if (Math.hypot(event.clientX - blankPress.current.x, event.clientY - blankPress.current.y) <= 6 && performance.now() - blankPress.current.time < 350) onBlankClick?.();
      }}>
      <div
        className="world"
        ref={worldRef}
        style={
          {
            ...boardGeometryStyle,
            ...boardStyleVariables(board.settings.styleTokens),
          } as CSSProperties
        }
      >
        <BoardFrame
          frame={board.settings.appearance.frame}
          shader={board.settings.styleTokens?.frameShader}
        />

        <main
          className="board"
          aria-label={board.campaign.name + " 公告板"}
          ref={boardRef}
          data-placing-sticker={selectedEmoji ? "true" : undefined}
          onPointerDownCapture={placeSticker}
          onClickCapture={(event) => {
            if (!selectedEmoji && !(event.target as HTMLElement).closest(".user-note,.board-module-frame,button,input,textarea,select,.note-link,.note-link-label,.board-sticker")) onBlankClick?.();
            if (!suppressStickerClick.current) return;
            suppressStickerClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMoveCapture={(event) => {
            if (!selectedEmoji || stickerSavingRef.current) return;
            if ((event.target as HTMLElement).closest(".sticker-actions")) return;
            setStickerPlacement(stickerPoint(event));
          }}
        >
          <BoardSurface
            appearance={board.settings.appearance}
            imageUrl={board.settings.boardTextureUrl}
            shader={board.settings.styleTokens?.surfaceShader}
          />
          {selectedEmoji && stickerPlacement && (
            <div
              className="board-emoji-placement"
              style={{ left: stickerPlacement.x, top: stickerPlacement.y }}
              aria-hidden="true"
            >
              {selectedEmoji}
            </div>
          )}
          {board.stickers.map((sticker) => (
            <EmojiSticker
              key={sticker.id}
              sticker={sticker}
              viewScaleRef={viewScaleRef}
              canEdit={canUpdateSharedBoard}
              onMove={onMoveSticker}
              onResize={onResizeSticker}
              onRotate={onRotateSticker}
              onDelete={onDeleteSticker}
            />
          ))}

          {!hidden.has("notes") && (
            <>
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
              const color = resolvePinColorVisual(note.pinColor);
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
            </>
          )}
          {!hidden.has("inventory") &&
            moduleFrame(
              "inventory",
              <InventorySection
                title={title("inventory")}
                color={color("inventory")}
                resourceTitles={resourceTitles}
                actions={actionsFor("inventory")}
                resources={board.resources}
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
                onViewMore={onViewQuests}
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
          {!hidden.has("index") && !board.eventClocks.length &&
            moduleFrame(
              "index",
              <EventClockSection
                title={title("index")}
                color={color("index")}
                actions={actionsFor("index")}
                canManage={canManage}
                onProgress={onEventClockProgress}
              />,
            )}
          {!hidden.has("index") && board.eventClocks.map((clock, i) => (
            <BoardModuleFrame key={clock.id} moduleKey="index"
              instanceId={i === 0 ? "index" : `event-clock:${clock.id}`}
              rect={clockRects.get(clock.id)!}
              effect={resolveModuleCardEffect("index", moduleLayout, defaultCardEffect)}
              layout={moduleLayout} canDrag={canManage}
              viewScaleRef={viewScaleRef}
              obstacles={[...occupiedModules.map((module) => module.rect),
                ...customPanelRects,
                ...[...clockRects].filter(([id]) => id !== clock.id).map(([, rect]) => rect)]}
              onMove={(_key, x, y) => onMoveEventClock(clock.id, x, y, clock.revision)}>
              <EventClockSection clock={clock} title={title("index")} color={color("index")} canManage={canManage}
                onProgress={onEventClockProgress}
                actions={canManage ? {
                  onEdit: () => onEditEventClock(clock.id), onHide: () => onHideSection("index"),
                  editLabel: i === 0 ? `编辑${title("index")}模块` : `编辑事件钟：${clock.name}`,
                } : undefined} />
            </BoardModuleFrame>
          ))}
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
                canToggle={canUpdateSharedBoard}
                onToggle={onToggleChecklist}
                onViewMore={onViewChecklist}
              />,
            )}

          {customPanels.map((panel) => {
            const visibleModuleRects = [
              ...occupiedModules.map((m) => m.rect),
              ...visibleClockRects,
              ...(!hidden.has("index") && !board.eventClocks.length ? [moduleRect("index", moduleLayout)] : []),
            ];
            const otherPanelRects = customPanels
              .filter((other) => other.id !== panel.id)
              .map((other) => ({
                x: other.x,
                y: other.y,
                w: other.w,
                h: other.h,
              }));
            return (
              <CustomPanelCard
                key={panel.id}
                panel={panel}
                board={board}
                actorName={board.viewer.displayName}
                defaultEffect={defaultCardEffect}
                obstacles={[...visibleModuleRects, ...otherPanelRects]}
                canManage={canManage}
                canMemberInteract={canUpdateSharedBoard}
                viewScaleRef={viewScaleRef}
                onExpandRoster={
                  board.viewer.role !== "observer" ? onExpandRoster : undefined
                }
                onOpenActivity={onOpenActivity}
                onPostNote={onPostCustomPanelNote}
                onEdit={(target) => onEditCustomPanel?.(target)}
                onHide={(id) => onHideCustomPanel?.(id)}
                onDelete={(id) => onDeleteCustomPanel?.(id)}
                onInteract={(id, blockId, action) =>
                  onInteractCustomPanel?.(id, blockId, action)
                }
                onUpdateGeometry={async (id, nextRect) => {
                  if (onUpdateCustomPanelGeometry) {
                    await onUpdateCustomPanelGeometry(id, nextRect);
                  }
                }}
              />
            );
          })}

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
                    defaultEffect={board.settings.styleTokens?.defaultNoteEffect}
                    fontSize={board.settings.styleTokens?.noteFontSizes?.[note.id]}
                    noteTextureUrl={board.settings.noteTextureUrl}
                    viewScaleRef={viewScaleRef}
                    canEdit={
                      canEditNotes &&
                      (board.viewer.role === "gm" ||
                        note.authorId === board.viewer.id)
                    }
                    onEdit={onEditNote}
                    selected={selectedNoteId === note.id}
                    onGesture={onNoteGesture}
                    onMove={onMoveNote}
                    onResize={onResizeNote}
                    onPositionPreview={(id, x, y, scale) => {
                      updateNoteLinkPosition(id, x, y, scale);
                      onNoteScalePreview?.(id, scale);
                    }}
                    canLink={canUpdateSharedBoard && note.id !== "__draft_new__"}
                    linkingFrom={linking?.fromId === note.id}
                    onPinClick={handlePinClick}
                  />
                ))}
              </div>

            </>
          )}
        </main>

      </div>
    </div>
    <nav className="board-tool-dock hig-tool-dock macos-dock" aria-label="公告板程序坞">
      {!hidden.has("notes") && (canEditNotes ? (
        <button className="board-tool-button macos-dock-item is-note" type="button" onClick={onComposeNote}
          aria-label="填写便签" title="便签与全部便签">
          <Dock3DIcon kind="note" fallback={<Plus />} />
          <span className="macos-dock-label">便签</span>
          {board.notes.length > 0 && (
            <span className="macos-dock-badge">{board.notes.length}</span>
          )}
        </button>
      ) : (
        <button className="board-tool-button macos-dock-item is-note" type="button" onClick={onOpenNotes}
          aria-label={`查看全部便签，共 ${board.notes.length} 条`} title="查看全部便签">
          <Dock3DIcon kind="note" fallback={<StickyNote />} />
          <span className="macos-dock-label">便签</span>
          {board.notes.length > 0 && (
            <span className="macos-dock-badge">{board.notes.length}</span>
          )}
        </button>
      ))}
      {canUpdateSharedBoard && <div className="board-sticker-tool">
        <button className="board-tool-button macos-dock-item is-sticker" type="button" aria-label="添加 Emoji 贴纸" title="贴纸"
          aria-expanded={stickerPickerOpen} disabled={stickerSaving} onClick={() => {
            setSelectedEmoji(null); setStickerPlacement(null); setStickerPickerOpen((open) => !open);
          }}>
          <Dock3DIcon kind="sticker" fallback={<SmilePlus />} />
          <span className="macos-dock-label">贴纸</span>
        </button>
        {selectedEmoji && <span className="sticker-placement-status" role="status">
          {stickerSaving ? "正在保存贴纸…" : "点击公告板放置，Esc 取消"}
        </span>}
        {stickerPickerOpen && <div className="sticker-picker" aria-label="选择 Emoji 贴纸">
          {stickerError && <p className="sticker-error" role="alert">{stickerError}</p>}
          {stickerChoices.map((emoji) => <button type="button" key={emoji} aria-label={`添加贴纸 ${emoji}`}
            onClick={() => chooseSticker(emoji)}>{emoji}</button>)}
        </div>}
      </div>}
      {(() => {
        const visibleArchiveCount = visibleArchiveEntriesForRole(
          board.settings.styleTokens?.archiveEntries ?? [],
          board.viewer.role === "gm",
        ).length;
        return (
          <button
            className="board-tool-button macos-dock-item is-archive"
            type="button"
            onClick={onOpenArchiveBox}
            aria-label={
              visibleArchiveCount > 0
                ? `打开档案盒，共 ${visibleArchiveCount} 份归档`
                : "打开档案盒"
            }
            title={
              board.viewer.role === "gm"
                ? "档案盒（线索 / 证据 / 人物 / 新闻 · GM 可编辑）"
                : "档案盒（线索 / 证据 / 人物 / 新闻 · 只读）"
            }
          >
            <Dock3DIcon kind="archive" fallback={<Archive />} />
            <span className="macos-dock-label">档案盒</span>
            {visibleArchiveCount > 0 && (
              <span className="macos-dock-badge">{visibleArchiveCount}</span>
            )}
          </button>
        );
      })()}
      {diceTool && <span className="macos-dock-divider" aria-hidden="true" />}
      {diceTool}
    </nav>
    </>
  );
}
