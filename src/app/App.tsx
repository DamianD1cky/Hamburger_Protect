import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Copy, LogOut, RefreshCw } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { BoardEditorKind } from "../components/board/BoardEditorDialog";
import { FocusDock } from "../components/board/FocusDock";
import type {
  ComposeKind,
  ComposerState,
} from "../components/composer/ComposerDialog";
import { AccessPortal } from "../features/access/components/AccessPortal";
import {
  createCampaign,
  getActiveCampaign,
  getGmAccess,
  joinCampaign,
  registerGm,
  signInGm,
  signOut,
} from "../features/access/data/nhostCampaignAccess";
import { useNhostSession } from "../features/access/hooks/useNhostSession";
import { defaultBoard } from "../features/campaign/domain/defaults";
import type {
  ComposerTarget,
  EmployeePosition,
  Quest,
  QuestStatus,
} from "../features/campaign/domain/types";
import { useCampaignBoard } from "../features/campaign/hooks/useCampaignBoard";
import { useBoardViewport } from "../hooks/useBoardViewport";
import { isNhostConfigured } from "../lib/nhost/client";

const BoardScene = lazy(() =>
  import("../components/board/BoardScene").then((module) => ({
    default: module.BoardScene,
  })),
);
const ComposerDialog = lazy(() =>
  import("../components/composer/ComposerDialog").then((module) => ({
    default: module.ComposerDialog,
  })),
);
const HandbookDialog = lazy(() =>
  import("../components/handbook/HandbookDialog").then((module) => ({
    default: module.HandbookDialog,
  })),
);

const BoardEditorDialog = lazy(() =>
  import("../components/board/BoardEditorDialog").then((module) => ({
    default: module.BoardEditorDialog,
  })),
);
const RosterDialog = lazy(() =>
  import("../components/board/RosterDialog").then((module) => ({
    default: module.RosterDialog,
  })),
);
const ResourceSheetDialog = lazy(() =>
  import("../components/board/ResourceSheetDialog").then((module) => ({
    default: module.ResourceSheetDialog,
  })),
);
const ActivityDialog = lazy(() =>
  import("../components/board/ActivityDialog").then((module) => ({
    default: module.ActivityDialog,
  })),
);

const NotesDialog = lazy(() =>
  import("../components/board/NotesDialog").then((module) => ({
    default: module.NotesDialog,
  })),
);

const closedComposer: ComposerState = {
  open: false,
  kind: "note",
  target: null,
  sourceRect: null,
};

export function App() {
  if (!isNhostConfigured) {
    return (
      <CampaignBoardWorkspace campaignId={defaultBoard.campaign.id} demo />
    );
  }
  return <CloudCampaignApp />;
}

function CloudCampaignApp() {
  const queryClient = useQueryClient();
  const session = useNhostSession();

  const regularUser = Boolean(session?.user && !session.user.isAnonymous);
  const gmAccessQuery = useQuery({
    queryKey: ["gm-access", session?.user?.id ?? "signed-out"],
    queryFn: getGmAccess,
    enabled: regularUser,
    staleTime: 5_000,
    refetchInterval: regularUser ? 5_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const approved = gmAccessQuery.data?.status === "approved";

  const accessQuery = useQuery({
    queryKey: ["active-campaign", session?.user?.id ?? "signed-out"],
    queryFn: getActiveCampaign,
    enabled: Boolean(session?.user) && (!regularUser || approved),
    staleTime: 5_000,
    retry: 1,
  });

  const refreshAccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ["active-campaign"] });
  };

  const handleSignOut = async () => {
    await signOut();
    queryClient.removeQueries({ queryKey: ["gm-access"] });
    queryClient.removeQueries({ queryKey: ["active-campaign"] });
    queryClient.removeQueries({ queryKey: ["campaign-board"] });
  };

  if (regularUser && gmAccessQuery.isLoading) {
    return <CloudStatus message="正在核对 GM 审批状态" />;
  }

  if (regularUser && approved && accessQuery.isLoading) {
    return <CloudStatus message="正在核对本次排班" />;
  }

  if (accessQuery.data?.status === "active" && (!regularUser || approved)) {
    return (
      <CampaignBoardWorkspace
        campaignId={accessQuery.data.campaignId}
        onExit={handleSignOut}
      />
    );
  }

  return (
    <AccessPortal
      session={session}
      gmAccess={gmAccessQuery.data ?? null}
      onRefreshGmAccess={async () => {
        await gmAccessQuery.refetch();
      }}
      accessError={
        gmAccessQuery.error instanceof Error
          ? gmAccessQuery.error.message
          : accessQuery.error instanceof Error
            ? accessQuery.error.message
            : ""
      }
      onSignInGm={async (input) => {
        await signInGm(input);
      }}
      onRegisterGm={async (input) => {
        await registerGm(input);
      }}
      onSignOut={handleSignOut}
      onCreateCampaign={async (name, characterName) => {
        await createCampaign({ name, characterName });
        await refreshAccess();
      }}
      onJoinCampaign={async (input: {
        joinCode: string;
        characterName: string;
        jobTitle: Exclude<EmployeePosition, "店长">;
      }) => {
        await joinCampaign(input);
        await refreshAccess();
      }}
    />
  );
}

function CloudStatus({ message }: { message: string }) {
  return (
    <div className="cloud-status-screen">
      <div className="backdrop" aria-hidden="true" />
      <span className="verification-spinner" aria-hidden="true" />
      <strong>{message}</strong>
      <small>请勿擅自离岗</small>
    </div>
  );
}

interface CampaignBoardWorkspaceProps {
  campaignId: string;
  demo?: boolean;
  onExit?: () => Promise<void>;
}

function CampaignBoardWorkspace({
  campaignId,
  demo = false,
  onExit,
}: CampaignBoardWorkspaceProps) {
  const campaign = useCampaignBoard(campaignId);
  const { worldRef, viewScaleRef, focusZone, setFocusZone } =
    useBoardViewport();
  const [composer, setComposer] = useState<ComposerState>(closedComposer);
  const [boardEditor, setBoardEditor] = useState<BoardEditorKind | null>(null);
  const [resourceSheet, setResourceSheet] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [handbookOpen, setHandbookOpen] = useState(false);
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
      const reduceMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        window.matchMedia("(max-width: 1024px)").matches;
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

      try {
        await campaign.transitionQuest(quest.id, status);
      } catch {
        flyer?.remove();
        showToast("更新失败，请检查任务状态或权限后重试");
        return;
      }
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
          ? "工作报告已由店长确认"
          : status === "open"
            ? "任务已重新张贴"
            : "工作记录已更新",
      );
    },
    [campaign, showToast],
  );

  if (campaign.error && !campaign.board) {
    return (
      <div className="cloud-status-screen is-error">
        <div className="backdrop" aria-hidden="true" />
        <strong>公告板读取失败</strong>
        <small>{campaign.error.message}</small>
        <button type="button" onClick={() => void campaign.refetch()}>
          <RefreshCw aria-hidden="true" />
          重新读取
        </button>
      </div>
    );
  }

  if (campaign.isLoading || !campaign.board) {
    return <CloudStatus message="正在展开危机营业公告板" />;
  }

  const board = campaign.board;
  const roleLabel =
    board.viewer.role === "gm"
      ? "GM / 值班店长"
      : board.viewer.role === "player"
        ? board.viewer.jobTitle
        : "观察者";

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <Suspense fallback={<CloudStatus message="正在展开危机营业公告板" />}>
        <BoardScene
          board={board}
          worldRef={worldRef}
          viewScaleRef={viewScaleRef}
          onOpenResourceSheet={setResourceSheet}
          onManageChecklist={() => setBoardEditor("checklist")}
          onManageIndex={() => setBoardEditor("index")}
          onExpandRoster={() => setRosterOpen(true)}
          onOpenNotes={() => setNotesOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onToggleChecklist={(id) =>
            void campaign
              .toggleChecklist(id)
              .then(() => showToast("防御检查已更新"))
              .catch(() => showToast("检查更新失败，请重试"))
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
      </Suspense>

      <div className="shop-status" aria-label="战役状态">
        <span className="status-dot" />
        <span className="shop-status-name">
          {board.campaign.name} · {board.viewer.displayName} · {roleLabel}
        </span>
        <span className="shop-room-code">
          {demo ? "演示班次" : "班次码 " + board.campaign.joinCode}
        </span>
        {!demo && (
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(board.campaign.joinCode)
                .then(() => showToast("班次码已复制"))
            }
            aria-label="复制班次码"
            title="复制班次码"
          >
            <Copy aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setHandbookOpen(true)}
          aria-label="打开员工手册"
          title="员工手册"
        >
          <BookOpen aria-hidden="true" />
        </button>
        {onExit && (
          <button
            type="button"
            onClick={() => void onExit()}
            aria-label="退出本次值班"
            title="退出"
          >
            <LogOut aria-hidden="true" />
          </button>
        )}
      </div>

      <FocusDock active={focusZone} onChange={setFocusZone} />

      <Suspense fallback={<CloudStatus message="正在打开详情" />}>
        {composer.open && (
          <ComposerDialog
            state={composer}
            board={board}
            onClose={closeComposer}
            onSaveQuest={async (draft, id) => {
              await campaign.saveQuest(draft, id);
              showToast(id ? "任务已更新" : "任务已张贴");
            }}
            onSaveNote={async (draft, id) => {
              await campaign.saveNote(draft, id);
              showToast(id ? "工作记录已更新" : "工作记录已贴上公告板");
            }}
            onDelete={async (target) => {
              if (target.kind === "quest") {
                await campaign.deleteQuest(target.id);
                showToast("任务已撤下");
              } else {
                await campaign.deleteNote(target.id);
                showToast("工作记录已取下");
              }
              closeComposer();
            }}
          />
        )}
        {boardEditor && (
          <BoardEditorDialog
            kind={boardEditor}
            board={board}
            onClose={() => setBoardEditor(null)}
            onSaveChecklist={campaign.saveChecklistItem}
            onDeleteChecklist={campaign.deleteChecklistItem}
            onSetIndex={campaign.setBurgerIndex}
          />
        )}
        {resourceSheet !== null && (
          <ResourceSheetDialog
            group={resourceSheet}
            board={board}
            onClose={() => setResourceSheet(null)}
            onSave={campaign.saveResource}
            onDelete={campaign.deleteResource}
          />
        )}
        {activityOpen && (
          <ActivityDialog
            board={board}
            onClose={() => setActivityOpen(false)}
            loadPage={campaign.getActivities}
          />
        )}
        {notesOpen && (
          <NotesDialog
            board={board}
            onClose={() => setNotesOpen(false)}
            onEdit={(note, element) => {
              setNotesOpen(false);
              openComposer("note", { kind: "note", id: note.id }, element);
            }}
            onAdd={(event) => {
              setNotesOpen(false);
              openComposer("note", null, event.currentTarget);
            }}
          />
        )}
        {rosterOpen && (
          <RosterDialog
            members={board.members}
            onClose={() => setRosterOpen(false)}
          />
        )}

        {handbookOpen && (
          <HandbookDialog
            open={handbookOpen}
            onClose={() => setHandbookOpen(false)}
          />
        )}
      </Suspense>

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
