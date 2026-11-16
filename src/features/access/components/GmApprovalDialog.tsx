import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { PaperDialog } from "../../../components/composer/PaperDialog";
import {
  listGmApplications, reviewGmApplication, siteAdminError,
  type GmApplication, type GmApplicationView,
} from "../data/siteAdministration";

const statusLabels = { pending: "待审批", approved: "已批准", rejected: "已拒绝", revoked: "已撤销" };
const dateText = (date: string) => new Date(date).toLocaleString("zh-CN", { hour12: false });

export function GmApprovalDialog({ actorId, onClose }: { actorId: string; onClose: () => void }) {
  const cache = useQueryClient();
  const [view, setView] = useState<GmApplicationView>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["site-gm-applications", actorId, view],
    initialPageParam: undefined as { requestedAt: string; userId: string } | undefined,
    queryFn: ({ pageParam }) => listGmApplications(view, pageParam),
    getNextPageParam: (page) => {
      const last = page.applications.at(-1);
      return page.hasMore && last ? { requestedAt: last.requestedAt, userId: last.userId } : undefined;
    },
    staleTime: 0, retry: 1, refetchOnWindowFocus: true,
  });
  const applications = [...new Map(query.data?.pages.flatMap((page) =>
    page.applications.map((item) => [item.userId, item] as const)) ?? []).values()];
  const review = async (application: GmApplication, approved: boolean) => {
    if (lock.current) return;
    lock.current = true; setWorking(application.userId); setError(""); setFeedback("");
    try {
      await reviewGmApplication(application, approved, notes[application.userId] ?? "");
      setFeedback(`${application.accountName.split("@")[0]} ${approved ? "已批准" : "已拒绝"}`);
      setNotes((current) => {
        const next = { ...current }; delete next[application.userId]; return next;
      });
    } catch (cause) { setError(siteAdminError(cause)); }
    finally {
      await cache.invalidateQueries({ queryKey: ["site-gm-applications", actorId] });
      await cache.invalidateQueries({ queryKey: ["gm-access", actorId] });
      await cache.invalidateQueries({ queryKey: ["site-admin-access", actorId] });
      lock.current = false; setWorking(null);
    }
  };
  return <PaperDialog title="GM 申请审批" className="gm-review-dialog" onClose={onClose}>
    <div className="gm-review-toolbar">
      <nav className="access-tabs" aria-label="审批列表">
        <button type="button" className={view === "pending" ? "is-active" : ""} aria-pressed={view === "pending"}
          disabled={!!working} onClick={() => { setView("pending"); setError(""); setFeedback(""); }}>待审批</button>
        <button type="button" className={view === "reviewed" ? "is-active" : ""} aria-pressed={view === "reviewed"}
          disabled={!!working} onClick={() => { setView("reviewed"); setError(""); setFeedback(""); }}>已处理</button>
      </nav>
      <button type="button" className="icon-button" aria-label="刷新 GM 申请" disabled={query.isFetching || !!working}
        onClick={() => void query.refetch()}><RefreshCw size={18} /></button>
    </div>
    {feedback && <p className="account-settings-success" role="status">{feedback}</p>}
    {(error || query.error) && <p className="dice-error" role="alert">{error || siteAdminError(query.error)}</p>}
    {query.isPending ? <p role="status">正在读取申请…</p> : !query.error && !applications.length ?
      <p className="gm-review-empty">{view === "pending" ? "暂无待审批申请" : "暂无处理记录"}</p> :
      <div className="gm-review-list">{applications.map((item) =>
        <article className="gm-review-row" key={item.userId} aria-label={`GM 申请：${item.accountName.split("@")[0]}`}>
          <header>
            <div><strong>{item.accountName.split("@")[0]}</strong><span>{item.displayName}</span></div>
            <time dateTime={item.requestedAt}>{dateText(item.requestedAt)}</time>
          </header>
          {view === "pending" ? <>
            {item.unavailable && <p className="dice-error">账号已停用或封禁</p>}
            <label className="gm-review-note">备注
              <textarea rows={2} maxLength={500} aria-label={`给 ${item.accountName.split("@")[0]} 的审批备注`}
                disabled={!!working} value={notes[item.userId] ?? ""}
                onChange={(event) => setNotes({ ...notes, [item.userId]: event.target.value })} />
            </label>
            <div className="gm-review-actions">
              <button type="button" className="gm-review-reject" disabled={!!working}
                onClick={() => void review(item, false)}>拒绝</button>
              <button type="button" className="publish-button" disabled={!!working || item.unavailable}
                onClick={() => void review(item, true)}>{working === item.userId ? "正在保存…" : "批准"}</button>
            </div>
          </> : <div className="gm-review-history">
            <strong>{statusLabels[item.status]}</strong>
            {item.reviewedAt && <span>{dateText(item.reviewedAt)}{item.reviewerName && ` · ${item.reviewerName}`}</span>}
            {item.reviewNote && <p>{item.reviewNote}</p>}
          </div>}
        </article>,
      )}</div>}
    {query.hasNextPage && <button type="button" className="access-signout gm-review-more" disabled={query.isFetching || !!working}
      onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "正在读取…" : "加载更多"}</button>}
  </PaperDialog>;
}
