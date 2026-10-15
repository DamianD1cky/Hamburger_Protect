import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { BoardScene } from "../components/board/BoardScene";
import { FocusDock } from "../components/board/FocusDock";
import {
  ComposerDialog,
  type ComposeKind,
  type ComposerState,
} from "../components/composer/ComposerDialog";
import { useCampaignBoard } from "../features/campaign/hooks/useCampaignBoard";
import type {
  BoardNote,
  ComposerTarget,
  Quest,
  QuestStatus,
} from "../features/campaign/domain/types";
import { useBoardViewport } from "../hooks/useBoardViewport";

const closedComposer: ComposerState = {
  open: false,
  kind: "note",
  target: null,
  sourceRect: null,
};

export function App() {
  const campaign = useCampaignBoard();
  const { worldRef, viewScaleRef, focusZone, setFocusZone } =
    useBoardViewport();
  const [composer, setComposer] = useState<ComposerState>(closedComposer);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const openComposer = useCallback(
    (
      kind: ComposeKind,
      target: ComposerTarget | null,
      element: HTMLElement,
    ) => {
      setComposer({
        open: true,
        kind,
        target,
        sourceRect: element.getBoundingClientRect(),
      });
    },
    [],
  );

  const closeComposer = useCallback(() => {
    setComposer((current) => ({ ...current, open: false, sourceRect: null }));
  }, []);

  const transitionQuest = useCallback(
    async (quest: Quest, status: QuestStatus, source: HTMLElement) => {
      const sourceRect = source.getBoundingClientRect();
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const flyer = reduceMotion
        ? null
        : (source.cloneNode(true) as HTMLElement);
      if (flyer) {
        flyer.classList.add("task-flyer");
        Object.assign(flyer.style, {
          left: sourceRect.left + "px",
          top: sourceRect.top + "px",
          width: sourceRect.width + "px",
          height: sourceRect.height + "px",
        });
        document.body.appendChild(flyer);
      }

      await campaign.transitionQuest(quest.id, status);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const destination = document.querySelector<HTMLElement>(
        '[data-task-id="' + CSS.escape(quest.id) + '"]',
      );

      if (flyer && destination) {
        const targetRect = destination.getBoundingClientRect();
        destination.style.opacity = "0";
        const dx = targetRect.left - sourceRect.left;
        const dy = targetRect.top - sourceRect.top;
        const animation = flyer.animate(
          [
            { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
            {
              transform:
                "translate3d(" +
                dx * 0.58 +
                "px," +
                (dy * 0.34 - 26) +
                "px,0) scale(1.06) rotate(-2deg)",
              opacity: 1,
              offset: 0.54,
            },
            {
              transform:
                "translate3d(" +
                dx +
                "px," +
                dy +
                "px,0) scale(" +
                targetRect.width / sourceRect.width +
                "," +
                targetRect.height / sourceRect.height +
                ")",
              opacity: 0.9,
            },
          ],
          {
            duration: 560,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
          },
        );
        const cleanup = () => {
          flyer.remove();
          destination.style.opacity = "";
        };
        animation.finished.then(cleanup, cleanup);
        window.setTimeout(cleanup, 760);
      } else {
        flyer?.remove();
      }

      showToast(
        status === "completed"
          ? "任务审核通过"
          : status === "open"
            ? "任务已重新开放"
            : "任务状态已更新",
      );
    },
    [campaign, showToast],
  );

  const board = campaign.board;
  const roleLabel =
    board.viewer.role === "gm"
      ? "GM"
      : board.viewer.role === "player"
        ? "玩家"
        : "观察者";

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <BoardScene
        board={board}
        worldRef={worldRef}
        viewScaleRef={viewScaleRef}
        onCycleResource={(id) =>
          void campaign
            .cycleResource(id)
            .then(() => showToast("物资状态已更新"))
        }
        onToggleChecklist={(id) =>
          void campaign
            .toggleChecklist(id)
            .then(() => showToast("检查项已更新"))
        }
        onComposeQuest={(event) =>
          openComposer("quest", null, event.currentTarget)
        }
        onComposeNote={(event) =>
          openComposer("note", null, event.currentTarget)
        }
        onEditQuest={(quest, event) =>
          openComposer(
            "quest",
            { kind: "quest", id: quest.id },
            event.currentTarget,
          )
        }
        onEditNote={(note, element) =>
          openComposer("note", { kind: "note", id: note.id }, element)
        }
        onTransitionQuest={transitionQuest}
        onMoveNote={campaign.moveNote}
      />

      <div className="shop-status" aria-label="战役状态">
        <span className="status-dot" />
        <span>
          {board.campaign.name} · {roleLabel}
        </span>
      </div>

      <FocusDock active={focusZone} onChange={setFocusZone} />

      <ComposerDialog
        state={composer}
        board={board}
        onClose={closeComposer}
        onSaveQuest={async (draft, id) => {
          await campaign.saveQuest(draft, id);
          showToast(id ? "任务已更新" : "任务已发布");
        }}
        onSaveNote={async (draft, id) => {
          await campaign.saveNote(draft, id);
          showToast(id ? "留言已更新" : "留言已贴上公告板");
        }}
        onDelete={async (target) => {
          if (target.kind === "quest") {
            await campaign.deleteQuest(target.id);
            showToast("任务已删除");
          } else {
            await campaign.deleteNote(target.id);
            showToast("留言已取下");
          }
          closeComposer();
        }}
      />

      <div
        className={"toast " + (toast ? "is-visible" : "")}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </>
  );
}
