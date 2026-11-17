import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Settings,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BoardDetailsKind } from "../components/board/BoardDetailsDialog";
import { FocusDock } from "../components/board/FocusDock";
import type {
  ComposeKind,
  ComposerState,
} from "../components/composer/ComposerDialog";
import { AccessPortal } from "../features/access/components/AccessPortal";
import {
  applyForGm,
  getAccessErrorMessage,
  createCampaign,
  cancelCampaignJoin,
  getCampaignJoinInbox,
  getVisitorMessages,
  getOwnJoinRequest,
  deleteVisitorMessage,
  registerAccount,
  reviewCampaignJoin,
  getActiveCampaigns,
  getGmAccess,
  joinCampaign,
  listPublicCampaigns,
  signInAccount,
  signOut,
  submitVisitorMessage,
} from "../features/access/data/campaignAccess";
import { clearStuckIdentities, getSupabaseAppSession } from "../features/access/data/supabaseSession";
import { useAuthSession } from "../features/access/hooks/useAuthSession";
import { defaultBoard } from "../features/campaign/domain/defaults";
import type {
  CampaignSectionKey,
  ComposerTarget,
  Quest,
  QuestStatus,
} from "../features/campaign/domain/types";
import { campaignBoardQueryOptions, useCampaignBoard } from "../features/campaign/hooks/useCampaignBoard";
import { transitionCampaignView } from "../lib/motion";
import { MotionText } from "../components/MotionText";
import { useBoardViewport } from "../hooks/useBoardViewport";
import { backend, backendError } from "../lib/backend";
import { rpc } from "../lib/supabase/client";
import { settingsUpdate } from "../features/campaign/domain/settingsUpdate";
import { getSiteAdminAccess } from "../features/access/data/siteAdministration";
import { HelpButton } from "../features/help/HelpButton";

const loadBoardScene = () => import("../components/board/BoardScene").then(
  (module) => ({ default: module.BoardScene }),
);
const BoardScene = lazy(loadBoardScene);
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

const ChecklistEditor = lazy(() => import("../components/board/BoardEditorDialog")
  .then((module) => ({ default: module.ChecklistEditor })));
const EventClockManager = lazy(() => import("../components/board/EventClockManager")
  .then((module) => ({ default: module.EventClockManager })));
const ResourceCategorySettings = lazy(() => import("../components/board/ResourceCategorySettings")
  .then((module) => ({ default: module.ResourceCategorySettings })));
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
const BoardDetailsDialog = lazy(() => import("../components/board/BoardDetailsDialog")
  .then((module) => ({ default: module.BoardDetailsDialog })));

const NotesDialog = lazy(() =>
  import("../components/board/NotesDialog").then((module) => ({
    default: module.NotesDialog,
  })),
);
const RoomSettingsDialog = lazy(() =>
  import("../components/board/RoomSettingsDialog").then((module) => ({
    default: module.RoomSettingsDialog,
  })),
);
const VisitorMessagesDialog = lazy(() =>
  import("../components/board/VisitorMessagesDialog").then((module) => ({
    default: module.VisitorMessagesDialog,
  })),
);
const SectionSettingsDialog = lazy(() =>
  import("../components/board/SectionSettingsDialog").then((module) => ({
    default: module.SectionSettingsDialog,
  })),
);
const SectionVisibilityDialog = lazy(() =>
  import("../components/board/SectionVisibilityDialog").then((module) => ({
    default: module.SectionVisibilityDialog,
  })),
);
const ClockSettingsDialog = lazy(() =>
  import("../components/board/ClockSettingsDialog").then((module) => ({
    default: module.ClockSettingsDialog,
  })),
);
const DiceWorkspace = lazy(() =>
  import("../features/dice/DiceWorkspace").then((module) => ({
    default: module.DiceWorkspace,
  })),
);

const closedComposer: ComposerState = {
  open: false,
  kind: "note",
  target: null,
  sourceRect: null,
};

export function App() {
  if (backendError) return <CloudStatus message={backendError} />;
  if (backend === "local") {
    return (
      <CampaignBoardWorkspace campaignId={defaultBoard.campaign.id} demo />
    );
  }
  return <SupabaseEntry />;
}

function SupabaseEntry() {
  const status = useQuery({
    queryKey: ["service-status", "supabase"],
    queryFn: () => rpc<"ready" | "maintenance">("get_service_status"),
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  if (status.isLoading) return <CloudStatus message="正在连接公告板" />;
  if (status.error)
    return <CloudStatus message="暂时无法连接公告板，请稍后重试" retry error />;
  if (status.data !== "ready")
    return <CloudStatus message="公告板正在迁移，请稍候。完成后会自动进入。" />;
  return <CloudCampaignApp />;
}

function CloudCampaignApp() {
  const queryClient = useQueryClient();
  const auth = useAuthSession();
  const session = auth.session;
  const lastAccount = useRef(session?.user.authUserId);
  useEffect(() => {
    if (lastAccount.current !== session?.user.authUserId) {
      const isPreviousAccountQuery = (query: Query) => {
        if (["service-status", "public-campaigns"].includes(String(query.queryKey[0]))) return false;
        // Preserve new-account requests which may already be in flight.
        return !session || !query.queryKey.some((part) =>
          part === session.user.id || part === session.user.authUserId,
        );
      };
      void queryClient.cancelQueries({ predicate: isPreviousAccountQuery });
      queryClient.removeQueries({ predicate: isPreviousAccountQuery });
      lastAccount.current = session?.user.authUserId;
    }
  }, [session?.user.id, session?.user.authUserId, queryClient]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [enteringCampaignId, setEnteringCampaignId] = useState("");
  const [navigationError, setNavigationError] = useState("");
  const navigationLock = useRef(false);
  const [publicCampaignId, setPublicCampaignId] = useState(
    () => new URLSearchParams(window.location.search).get("visit") ?? "",
  );
  const inLobby = !session || (!selectedCampaignId && !publicCampaignId);
  useEffect(() => {
    const syncPublicVisit = () =>
      setPublicCampaignId(
        new URLSearchParams(window.location.search).get("visit") ?? "",
      );
    window.addEventListener("popstate", syncPublicVisit);
    return () => window.removeEventListener("popstate", syncPublicVisit);
  }, []);
  useEffect(() => {
    for (const key of [
      "gm-access",
      "active-campaigns",
      "campaign-board",
      "join-request",
      "join-inbox",
      "visitor-messages",
      "site-admin-access",
      "site-gm-applications",
    ]) {
      queryClient.removeQueries({ queryKey: [key], type: "inactive" });
    }
  }, [queryClient, session?.user.id, session?.user.authUserId]);

  // Every signed-in account has a read-only GM status (null until the
  // account explicitly applies); accounts of any kind can be employees.
  const gmAccessQuery = useQuery({
    queryKey: ["gm-access", session?.user?.id ?? "signed-out"],
    queryFn: getGmAccess,
    enabled: Boolean(session?.user) && inLobby,
    staleTime: 5_000,
    refetchInterval: session?.user ? 5_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const siteAdminQuery = useQuery({
    queryKey: ["site-admin-access", session?.user.id ?? "signed-out"],
    queryFn: getSiteAdminAccess,
    enabled: Boolean(session?.user) && inLobby,
    staleTime: 5_000,
    refetchInterval: session?.user && inLobby ? 30_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const publicCampaignsQuery = useQuery({
    queryKey: ["public-campaigns"],
    queryFn: listPublicCampaigns,
    enabled: inLobby,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const accessQuery = useQuery({
    queryKey: ["active-campaigns", session?.user?.id ?? "signed-out"],
    queryFn: getActiveCampaigns,
    enabled: Boolean(session?.user) && inLobby,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const activeCampaigns = accessQuery.data ?? [];
  const activePlayerCampaign = activeCampaigns.find(
    (campaign) => campaign.role === "player",
  );
  const joinRequestQuery = useQuery({
    queryKey: ["join-request", session?.user?.id ?? "signed-out"],
    queryFn: getOwnJoinRequest,
    enabled: Boolean(session?.user) && inLobby && !activePlayerCampaign,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    setSelectedCampaignId("");
  }, [session?.user.authUserId]);

  // Anonymous identities are retired: any surviving anonymous session is
  // signed out on sight and the visitor starts over with an account.
  const [legacyCutoff, setLegacyCutoff] = useState(false);
  const anonymousSession = Boolean(session?.user?.isAnonymous);
  useEffect(() => {
    if (!anonymousSession) return;
    setLegacyCutoff(true);
    void handleSignOut();
  }, [anonymousSession]);

  const refreshAccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ["active-campaigns"] });
    await queryClient.invalidateQueries({ queryKey: ["join-request"] });
  };

  const handleSignOut = async () => {
    await signOut();
    setSelectedCampaignId("");
    queryClient.removeQueries({ queryKey: ["gm-access"] });
    queryClient.removeQueries({ queryKey: ["active-campaigns"] });
    queryClient.removeQueries({ queryKey: ["campaign-board"] });
    queryClient.removeQueries({ queryKey: ["join-request"] });
    queryClient.removeQueries({ queryKey: ["join-inbox"] });
    queryClient.removeQueries({ queryKey: ["site-admin-access"] });
    queryClient.removeQueries({ queryKey: ["site-gm-applications"] });
  };

  const enterCampaign = async (campaignId: string, publicView = false) => {
    if (navigationLock.current || !session) return;
    navigationLock.current = true;
    setEnteringCampaignId(campaignId);
    setNavigationError("");
    const authId = session.user.authUserId;
    try {
      // Load code and data immediately; the old view stays useful on failure.
      await Promise.all([
        loadBoardScene(),
        queryClient.fetchQuery(campaignBoardQueryOptions(campaignId, publicView)),
      ]);
      if (getSupabaseAppSession()?.user.authUserId !== authId) return;
      await transitionCampaignView("enter", campaignId, publicView, () => {
        if (getSupabaseAppSession()?.user.authUserId !== authId) return;
        if (publicView) {
          const url = new URL(window.location.href);
          url.search = "";
          url.searchParams.set("visit", campaignId);
          window.history.pushState(null, "", url);
          setPublicCampaignId(campaignId);
        } else {
          setSelectedCampaignId(campaignId);
        }
      });
    } catch (error) {
      if (getSupabaseAppSession()?.user.authUserId === authId)
        setNavigationError(getAccessErrorMessage(error));
    } finally {
      navigationLock.current = false;
      setEnteringCampaignId("");
    }
  };

  if (auth.loading) return <CloudStatus message="正在恢复登录身份" />;
  if (auth.error)
    return <CloudStatus message={auth.error} retry error resetIdentity />;
  if (anonymousSession) return <CloudStatus message="正在退出旧身份" />;

  // Visiting a public campaign requires a registered identity first:
  // without a session the portal stays up (registration), and this branch
  // takes over automatically once the visitor registers.
  if (publicCampaignId && session?.user) {
    return (
      <CampaignBoardWorkspace
        campaignId={publicCampaignId}
        publicView
        onExit={() => transitionCampaignView("exit", publicCampaignId, true, () => {
          setPublicCampaignId("");
          const url = new URL(window.location.href);
          url.searchParams.delete("visit");
          window.history.replaceState(null, "", url);
        })}
      />
    );
  }

  if (
    session?.user && inLobby &&
    (gmAccessQuery.isLoading ||
      accessQuery.isLoading ||
      joinRequestQuery.isLoading)
  ) {
    return <CloudStatus message="正在核对账号与排班" />;
  }

  if (selectedCampaignId && session?.user) {
    return (
      <CampaignBoardWorkspace
        key={`${session.user.authUserId}:${selectedCampaignId}`}
        campaignId={selectedCampaignId}
        onExit={() => transitionCampaignView("exit", selectedCampaignId, false,
          () => setSelectedCampaignId(""))}
      />
    );
  }

  return (
    <AccessPortal
      key={session?.user.authUserId ?? "signed-out"}
      session={session}
      legacyCutoff={legacyCutoff}
      gmAccess={gmAccessQuery.data ?? null}
      isSiteAdmin={siteAdminQuery.data === true}
      activeCampaigns={activeCampaigns}
      joinRequest={
        activePlayerCampaign ? null : (joinRequestQuery.data ?? null)
      }
      enteringCampaignId={enteringCampaignId}
      onEnterCampaign={(id) => void enterCampaign(id)}
      onRefreshJoinRequest={refreshAccess}
      onCancelJoinRequest={async (id) => {
        await cancelCampaignJoin(id);
        await refreshAccess();
      }}
      onRefreshGmAccess={async () => {
        await gmAccessQuery.refetch();
      }}
      accessError={
        joinRequestQuery.error || gmAccessQuery.error || accessQuery.error
          ? getAccessErrorMessage(joinRequestQuery.error ?? gmAccessQuery.error ?? accessQuery.error)
          : navigationError
      }
      publicCampaigns={publicCampaignsQuery.data ?? []}
      publicCampaignsLoading={publicCampaignsQuery.isLoading}
      onVisitPublicCampaign={(campaignId) => {
        if (session) {
          void enterCampaign(campaignId, true);
          return;
        }
        const url = new URL(window.location.href);
        url.search = "";
        url.searchParams.set("visit", campaignId);
        window.history.pushState(null, "", url);
        setPublicCampaignId(campaignId);
      }}
      onSignInAccount={async (input) => {
        await signInAccount(input);
      }}
      onRegisterAccount={async (input) => {
        await registerAccount(input);
      }}
      onApplyGm={async () => {
        await applyForGm();
        await gmAccessQuery.refetch();
      }}
      onAccountUpdated={async () => {
        await auth.refresh();
        await gmAccessQuery.refetch();
      }}
      onSignOut={handleSignOut}
      onCreateCampaign={async (name, characterName) => {
        const campaignId = await createCampaign({ name, characterName });
        await refreshAccess();
        await enterCampaign(campaignId);
      }}
      onJoinCampaign={async (input: {
        joinCode: string;
        characterName: string;
        jobTitle: string;
        profileText: string;
      }) => {
        await joinCampaign(input);
        await refreshAccess();
      }}
    />
  );
}

function CloudStatus({
  message,
  retry = false,
  error = false,
  resetIdentity = false,
}: {
  message: string;
  retry?: boolean;
  error?: boolean;
  resetIdentity?: boolean;
}) {
  // Error states are terminal, not loading: no spinner (it reads as an
  // endless hang), and identity errors get an escape hatch that clears
  // the stuck local sessions instead of reloading into the same failure.
  return (
    <div className="cloud-status-screen">
      <div className="backdrop" aria-hidden="true" />
      {error ? (
        <ShieldAlert className="cloud-status-icon" aria-hidden="true" />
      ) : (
        <span className="verification-spinner" aria-hidden="true" />
      )}
      <strong>{message}</strong>
      <small>请勿擅自离岗</small>
      {retry && (
        <button type="button" onClick={() => window.location.reload()}>
          重试
        </button>
      )}
      {resetIdentity && (
        <button
          type="button"
          onClick={() => {
            void clearStuckIdentities().finally(() => window.location.reload());
          }}
        >
          清除浏览器登录状态并重新开始
        </button>
      )}
    </div>
  );
}

interface CampaignBoardWorkspaceProps {
  campaignId: string;
  demo?: boolean;
  publicView?: boolean;
  onExit?: () => Promise<void>;
}

function CampaignBoardWorkspace({
  campaignId,
  demo = false,
  publicView = false,
  onExit,
}: CampaignBoardWorkspaceProps) {
  const queryClient = useQueryClient();
  const campaign = useCampaignBoard(campaignId, publicView);
  const { worldRef, viewScaleRef, focusZone, setFocusZone } =
    useBoardViewport(campaign.board?.settings.moduleLayout);
  const [composer, setComposer] = useState<ComposerState>(closedComposer);
  const [resourceSheet, setResourceSheet] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [boardDetails, setBoardDetails] = useState<BoardDetailsKind | null>(null);
  const rosterTrigger = useRef<HTMLButtonElement>(null);
  const [topMenu, setTopMenu] = useState<{
    kind: "room" | "visibility" | "roster" | "visitors"; anchor: HTMLElement;
  } | null>(null);
  const [clockSettingsOpen, setClockSettingsOpen] = useState(false);
  const openRoster = () => {
    if (rosterTrigger.current) setTopMenu({ kind: "roster", anchor: rosterTrigger.current });
  };
  const [sectionSettingsKey, setSectionSettingsKey] =
    useState<CampaignSectionKey | null>(null);
  const visitorMessages = useQuery({
    queryKey: ["visitor-messages", campaignId, campaign.board?.viewer.id],
    queryFn: () => getVisitorMessages(campaignId),
    enabled:
      !demo &&
      topMenu?.kind === "visitors" && Boolean(campaign.board) &&
      (publicView ||
        campaign.board?.viewer.role === "gm" ||
        Boolean(campaign.board?.settings.isPublic)),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: 1,
  });
  const joinInbox = useQuery({
    queryKey: [
      "join-inbox",
      campaignId,
      campaign.board?.viewer.id ?? "loading",
    ],
    queryFn: () => getCampaignJoinInbox(campaignId),
    enabled:
      !demo &&
      campaign.board?.viewer.role === "gm" &&
      campaign.board.campaign.status === "active",
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: 1,
  });
  const reviewJoinRequest = async (
    id: string,
    approved: boolean,
    note: string,
  ) => {
    await reviewCampaignJoin(id, approved, note);
    await Promise.all([joinInbox.refetch(), campaign.refetch()]);
  };
  const [handbookOpen, setHandbookOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const lastPendingCount = useRef<number | null>(null);
  useEffect(() => {
    const count = joinInbox.data?.total;
    if (count === undefined) return;
    if (count > (lastPendingCount.current ?? 0)) {
      showToast(`有 ${count} 条入店申请等待审批`);
    }
    lastPendingCount.current = count;
  }, [joinInbox.data?.total, showToast]);
  useEffect(() => {
    const hidden = campaign.board?.settings.hiddenSections ?? [];
    const sectionByZone = {
      inventory: "inventory",
      tasks: "tasks",
      shifts: "shifts",
      safety: "safety",
      notes: "activity",
    } as const;
    if (focusZone !== "overview" && hidden.includes(sectionByZone[focusZone])) {
      setFocusZone("overview");
    }
  }, [campaign.board?.settings.hiddenSections, focusZone, setFocusZone]);

  const openComposer = useCallback(
    (
      kind: ComposeKind,
      target: ComposerTarget | null,
      element: HTMLElement,
    ) => {
      setTopMenu(null);
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
          : status === "failed"
            ? "工作报告已退回重试"
            : status === "open"
              ? "任务已重新张贴"
              : "工作记录已更新",
      );
    },
    [campaign, showToast],
  );

  const accessDenied = campaign.error && /AUTH_REQUIRED|ACCOUNT_DISABLED|CAMPAIGN_ACCESS_REQUIRED|读取权限|not a campaign member/.test(campaign.error.message);
  if (campaign.error && (!campaign.board || publicView || accessDenied)) {
    return (
      <div className="cloud-status-screen is-error">
        <div className="backdrop" aria-hidden="true" />
        <strong>公告板读取失败</strong>
        <small>{campaign.error.message}</small>
        <button type="button" onClick={() => void campaign.refetch()}>
          <RefreshCw aria-hidden="true" />
          重新读取
        </button>
        {onExit && (
          <button type="button" onClick={() => void onExit()}>
            {publicView ? "返回签到处" : "返回账号与战役"}
          </button>
        )}
      </div>
    );
  }

  if (campaign.isLoading || !campaign.board) {
    return <CloudStatus message="正在展开危机营业公告板" />;
  }

  const board = campaign.board;
  const patchBoardSettings = campaign.updateCampaignSettings;
  const roleLabel = publicView
    ? "访客 / 只读参观"
    : board.viewer.role === "gm"
      ? "GM / 值班店长"
      : board.viewer.role === "player"
        ? board.viewer.jobTitle
        : "观察者";
  const toggleChecklist = (id: string) =>
    void campaign.toggleChecklist(id)
      .then(() => showToast("防御检查已更新"))
      .catch(() => showToast("检查更新失败，请重试"));

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <Suspense fallback={<CloudStatus message="正在展开危机营业公告板" />}>
        <BoardScene
          board={board}
          worldRef={worldRef}
          viewScaleRef={viewScaleRef}
          onOpenResourceSheet={setResourceSheet}
          onEventClockProgress={campaign.setEventClockProgress}
          onViewChecklist={() => setBoardDetails("checklist")}
          onViewQuests={(completed) => setBoardDetails(completed ? "completed-tasks" : "active-tasks")}
          onExpandRoster={openRoster}
          onOpenNotes={() => setNotesOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onToggleChecklist={toggleChecklist}
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
          onNoteLayer={campaign.moveNoteLayer}
          onCreateSticker={async (emoji, x, y, rotation) => {
            const created = await campaign.createBoardSticker(emoji, x, y, rotation);
            showToast("贴纸已贴上公告板");
            return created;
          }}
          onMoveSticker={async (id, x, y) => {
            try {
              return await campaign.moveBoardSticker(id, x, y);
            } catch (error) {
              showToast(error instanceof Error ? error.message : "贴纸移动失败，请重试。");
              throw error;
            }
          }}
          onDeleteSticker={async (id) => {
            try {
              return await campaign.deleteBoardSticker(id);
            } catch (error) {
              showToast(error instanceof Error ? error.message : "贴纸删除失败，请重试。");
              throw error;
            }
          }}
          onResizeSticker={async (id, scale) => {
            try { return await campaign.resizeBoardSticker(id, scale); }
            catch (error) {
              showToast(error instanceof Error ? error.message : "贴纸缩放失败，请重试。");
              throw error;
            }
          }}
          onCreateNoteLink={campaign.createNoteLink}
          onDeleteNoteLink={campaign.deleteNoteLink}
          onUpdateNoteLinkLabel={campaign.updateNoteLinkLabel}
          onEditSection={(key) => setSectionSettingsKey(key)}
          onHideSection={(key) => {
            void patchBoardSettings(settingsUpdate(board, { hiddenSections: { [key]: true } }))
              .then(() => showToast("区块已隐藏，可在顶栏恢复"))
              .catch((error) => showToast(error instanceof Error ? error.message : "隐藏失败，请重试"));
          }}
          moduleLayout={board.settings.moduleLayout}
          onMoveModule={campaign.moveBoardModule}
          onOpenClockSettings={() => setClockSettingsOpen(true)}
          diceTool={!publicView && board.viewer.role !== "observer"
            ? <DiceWorkspace key={`${board.campaign.id}:${board.viewer.id}`} board={board} /> : undefined}
        />
      </Suspense>

      <div className="shop-status" aria-label="战役状态">
        <span className="status-dot" />
        <span className="shop-status-name">
          <span className="status-part campaign-scene-title">{board.campaign.name}</span>
          <span className="status-part">{board.viewer.displayName}</span>
          <span className="status-part">{roleLabel}</span>
        </span>
        <span className="shop-room-code">
          {publicView
            ? "公开参观（只读）"
            : demo
              ? "演示班次"
              : "班次码 " + board.campaign.joinCode}
        </span>
        {!demo && !publicView && (
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
        {!publicView && board.viewer.role !== "observer" && (
          <button
            type="button"
            ref={rosterTrigger}
            className={
              (joinInbox.data?.total ?? 0) > 0
                ? "join-inbox-button has-pending"
                : "join-inbox-button"
            }
            data-top-menu-trigger="roster"
            aria-haspopup="dialog"
            aria-expanded={topMenu?.kind === "roster"}
            aria-controls="roster-menu"
            onClick={(event) => setTopMenu(topMenu?.kind === "roster" ? null :
              { kind: "roster", anchor: event.currentTarget })}
            aria-label={board.viewer.role === "gm" ? `危机排班，${joinInbox.data?.total ?? 0} 条待审批` : "危机排班"}
            title="危机排班"
          >
            <UserPlus aria-hidden="true" />
            {board.viewer.role === "gm" && <MotionText value={joinInbox.data?.total ?? 0} />}
          </button>
        )}
        {board.viewer.role === "gm" && (
          <button
            type="button"
            className="section-visibility-button"
            data-top-menu-trigger="visibility"
            aria-haspopup="dialog"
            aria-expanded={topMenu?.kind === "visibility"}
            aria-controls="board-visibility-menu"
            onClick={(event) => setTopMenu(topMenu?.kind === "visibility" ? null :
              { kind: "visibility", anchor: event.currentTarget })}
            aria-label={
              "管理公告板区块" +
              (board.settings.hiddenSections.length
                ? `，${board.settings.hiddenSections.length} 个已隐藏`
                : "")
            }
            title="管理区块显示"
          >
            <LayoutGrid aria-hidden="true" />
            {board.settings.hiddenSections.length > 0 && (
              <MotionText value={board.settings.hiddenSections.length} />
            )}
          </button>
        )}
        {board.viewer.role === "gm" && (
          <button
            type="button"
            data-top-menu-trigger="room"
            aria-haspopup="dialog"
            aria-expanded={topMenu?.kind === "room"}
            aria-controls="room-settings-menu"
            onClick={(event) => setTopMenu(topMenu?.kind === "room" ? null :
              { kind: "room", anchor: event.currentTarget })}
            aria-label="打开房间配置"
            title="房间配置"
          >
            <Settings aria-hidden="true" />
          </button>
        )}
        {!demo &&
          (publicView ||
            board.viewer.role === "gm" ||
            board.settings.isPublic) && (
            <button
              type="button"
              className="visitor-message-button"
              data-top-menu-trigger="visitors"
              aria-haspopup="dialog"
              aria-expanded={topMenu?.kind === "visitors"}
              aria-controls="visitor-messages-menu"
              onClick={(event) => setTopMenu(topMenu?.kind === "visitors" ? null :
                { kind: "visitors", anchor: event.currentTarget })}
              aria-label={visitorMessages.data ? `访客留言，${visitorMessages.data.length} 条` : "访客留言"}
              title="访客留言"
            >
              <MessageSquare aria-hidden="true" />
              {visitorMessages.data && <MotionText value={visitorMessages.data.length} />}
            </button>
          )}
        <button
          type="button"
          onClick={() => { setTopMenu(null); setHandbookOpen(true); }}
          aria-label="打开员工手册"
          title="员工手册"
        >
          <BookOpen aria-hidden="true" />
        </button>
        <HelpButton iconOnly onOpen={() => setTopMenu(null)} />
        {onExit && (
          <button
            type="button"
            onClick={() => void onExit()}
            aria-label={publicView ? "返回签到处" : "返回账号与战役"}
            title={publicView ? "返回签到处" : "返回账号与战役"}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
      </div>

      <FocusDock
        active={focusZone}
        hiddenSections={board.settings.hiddenSections}
        onChange={setFocusZone}
      />

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
            onUploadPhoto={(file) => campaign.uploadNotePhoto(file)}
            onDelete={async (target) => {
              if (target.kind === "quest") {
                await campaign.deleteQuest(target.id);
                showToast("任务已撤下");
              } else {
                await campaign.deleteNote(target.id);
                showToast("工作记录已取下");
              }
            }}
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
        {boardDetails && <BoardDetailsDialog kind={boardDetails} board={board}
          onClose={() => setBoardDetails(null)}
          onToggleChecklist={toggleChecklist}
          onTransitionQuest={transitionQuest}
          onEditQuest={(quest, event) => {
            setBoardDetails(null);
            openComposer("quest", { kind: "quest", id: quest.id }, event.currentTarget);
          }} />}
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
            onTogglePin={campaign.setNotePinned}
          />
        )}
        {!publicView && board.viewer.role === "gm" && (
          <RoomSettingsDialog
            anchor={topMenu?.kind === "room" ? topMenu.anchor : null}
            board={board}
            onClose={() => setTopMenu((current) => current?.kind === "room" ? null : current)}
            onSave={async (draft) => {
              const saved = await campaign.updateCampaignSettings(draft);
              showToast("房间配置已保存");
              return saved;
            }}
            onSaveAppearance={async (appearance, files, expected) => {
              await campaign.saveBoardAppearance(appearance, files, expected);
              showToast("公告板外观已保存");
            }}
            onUpload={async (kind, file) => {
              await campaign.uploadCampaignMedia(kind, file);
              showToast("房间图片已更新");
            }}
            onClearMedia={async (kind) => {
              await campaign.clearCampaignMedia(kind);
              showToast("已恢复默认图片");
            }}
            onSetPublic={async (isPublic) => {
              await campaign.setCampaignPublic(isPublic);
              await queryClient.invalidateQueries({
                queryKey: ["public-campaigns"],
              });
              showToast(isPublic ? "房间已开放参观" : "房间已关闭参观");
            }}
            onOpenRoster={openRoster}
          />
        )}
        {clockSettingsOpen && (
          <ClockSettingsDialog
            config={board.settings.clock}
            onClose={() => setClockSettingsOpen(false)}
            onSave={async (config) => {
              await campaign.saveCampaignClock(config);
              showToast("战役时钟已更新");
            }}
          />
        )}
        {sectionSettingsKey && (
          <SectionSettingsDialog
            sectionKey={sectionSettingsKey}
            board={board}
            onClose={() => setSectionSettingsKey(null)}
            key={sectionSettingsKey}
            renderContent={(onBusyChange) => {
              const openContent = (open: () => void) => { setSectionSettingsKey(null); open(); };
              switch (sectionSettingsKey) {
                case "inventory":
                  return <ResourceCategorySettings board={board} onBusyChange={onBusyChange}
                    onSave={patchBoardSettings} onOpenSheet={(group) => openContent(() => setResourceSheet(group))} />;
                case "index":
                  return <EventClockManager board={board} onSave={campaign.saveEventClock}
                    onDelete={campaign.deleteEventClock} onBusyChange={onBusyChange} />;
                case "safety":
                  return <ChecklistEditor kind="checklist" board={board} onBusyChange={onBusyChange}
                    onSaveChecklist={campaign.saveChecklistItem} onDeleteChecklist={campaign.deleteChecklistItem}
                    onSaveCategory={campaign.saveChecklistCategory} onDeleteCategory={campaign.deleteChecklistCategory} />;
                case "tasks":
                  return <div className="module-content-directory">
                    <button type="button" className="publish-button" onClick={(event) => {
                      setSectionSettingsKey(null); openComposer("quest", null, event.currentTarget);
                    }}>发布工作指示</button>
                    {board.quests.map((quest) => <button type="button" className="module-content-row" key={quest.id}
                      onClick={(event) => {
                        setSectionSettingsKey(null); openComposer("quest", { kind: "quest", id: quest.id }, event.currentTarget);
                      }}>{quest.title}</button>)}
                  </div>;
                case "shifts":
                  return <div className="module-content-directory">
                    <button type="button" className="text-button" onClick={() => openContent(openRoster)}>
                      管理成员与角色
                    </button>
                    {board.members.filter((member) => member.active).map((member) =>
                      <div className="module-content-row" key={member.userId}><span>{member.characterName}</span><span>{member.jobTitle}</span></div>)}
                  </div>;
                case "activity":
                  return <div className="module-content-directory">
                    <strong>{board.activities.length}{board.hasMoreActivity ? "+" : ""} 条操作记录</strong>
                    <button type="button" className="text-button" onClick={() => openContent(() => setActivityOpen(true))}>
                      查看工作记录
                    </button>
                  </div>;
                default:
                  return null;
              }
            }}
            onSave={async (patch) => {
              const saved = await patchBoardSettings(patch);
              showToast("区块设置已保存");
              return saved;
            }}
          />
        )}
        {topMenu?.kind === "visibility" && (
          <SectionVisibilityDialog
            anchor={topMenu.anchor}
            board={board}
            onClose={() => setTopMenu(null)}
            onSave={async (patch) => {
              await patchBoardSettings(patch);
            }}
          />
        )}
        {!demo && (publicView || board.viewer.role === "gm" || board.settings.isPublic) && (
          <VisitorMessagesDialog
            anchor={topMenu?.kind === "visitors" ? topMenu.anchor : null}
            messages={visitorMessages.data ?? []}
            loading={visitorMessages.isFetching && !visitorMessages.data}
            loadError={visitorMessages.error instanceof Error ? visitorMessages.error.message : ""}
            defaultName={board.viewer.displayName}
            canModerate={!publicView && board.viewer.role === "gm"}
            onClose={() => setTopMenu((current) => current?.kind === "visitors" ? null : current)}
            onSubmit={async (displayName, body) => {
              await submitVisitorMessage({
                campaignId,
                displayName,
                body,
              });
              await visitorMessages.refetch();
              await queryClient.invalidateQueries({
                queryKey: ["public-campaigns"],
              });
            }}
            onDelete={async (messageId) => {
              await deleteVisitorMessage(campaignId, messageId);
              await visitorMessages.refetch();
              await queryClient.invalidateQueries({
                queryKey: ["public-campaigns"],
              });
            }}
          />
        )}
        {!publicView && board.viewer.role !== "observer" && (
          <RosterDialog
            anchor={topMenu?.kind === "roster" ? topMenu.anchor : null}
            board={board}
            joinInbox={
              board.viewer.role === "gm" && !demo
                ? (joinInbox.data ?? { requests: [], total: 0 })
                : undefined
            }
            inboxError={
              joinInbox.error instanceof Error ? joinInbox.error.message : ""
            }
            onRefreshInbox={async () => {
              await joinInbox.refetch();
            }}
            onReviewJoin={reviewJoinRequest}
            onUpdateProfile={async (draft) => {
              await campaign.updateMemberProfile(draft);
              showToast("角色资料已更新");
            }}
            onRemoveMember={async (userId, note) => {
              await campaign.removeMember(userId, note);
              await joinInbox.refetch();
              showToast("成员已移出，未提交任务已释放");
            }}
            onClose={() => setTopMenu((current) => current?.kind === "roster" ? null : current)}
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
