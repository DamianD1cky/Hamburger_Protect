import { useEffect, useState } from "react";
import {
  activityActor,
  activityDetails,
  activitySummary,
} from "../../features/campaign/domain/activity";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  ActivityPage,
  BoardActivity,
  CampaignBoard,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

export function ActivityDialog({
  board,
  onClose,
  loadPage,
}: {
  board: CampaignBoard;
  onClose: () => void;
  loadPage: (beforeId?: string) => Promise<ActivityPage>;
}) {
  const [older, setOlder] = useState<BoardActivity[]>(board.activities);
  useEffect(() => {
    setOlder((rows) => [
      ...new Map(
        [...rows, ...board.activities].map((event) => [event.id, event]),
      ).values(),
    ]);
  }, [board.activities]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const events = [
    ...new Map(
      [...board.activities, ...older].map((event) => [event.id, event]),
    ).values(),
  ].sort((a, b) =>
    BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0,
  );

  const loadOlder = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await loadPage(events.at(-1)?.id);
      setOlder((rows) => [...rows, ...page.items]);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记录读取失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaperDialog title="工作记录" onClose={onClose}>
      <p className="editor-help">
        按时间从新到旧记录每位员工的便签、物资、检查、工作指示和指数变更。点开可查看具体内容。
      </p>
      <div className="activity-directory">
        {!events.length && (
          <p className="editor-help">
            暂无操作记录，下一次公告板更新后会自动记录。
          </p>
        )}
        {events.map((event) => {
          const details = activityDetails(event);
          return (
            <article className="activity-entry" key={event.id}>
              <header>
                <strong>{activityActor(event, board.members)}</strong>
                <time dateTime={event.createdAt}>
                  {formatNoteTimestamp(event.createdAt)}
                </time>
              </header>
              <p>{activitySummary(event)}</p>
              {!!details.length && (
                <details>
                  <summary>查看变更内容</summary>
                  <dl className="activity-changes">
                    {details.map((change) => (
                      <div key={change.field}>
                        <dt>{change.label}</dt>
                        <dd>
                          {change.before !== null && (
                            <p>
                              <b>变更前：</b>
                              {change.before}
                            </p>
                          )}
                          {change.after !== null && (
                            <p>
                              <b>
                                {change.before === null ? "内容：" : "变更后："}
                              </b>
                              {change.after}
                            </p>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </article>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="editor-help">
          {error}
        </p>
      )}
      {(hasMore ?? board.hasMoreActivity) && (
        <button
          type="button"
          className="publish-button notes-add-button"
          disabled={loading}
          onClick={() => void loadOlder()}
        >
          {loading ? "读取中…" : "加载更早记录"}
        </button>
      )}
    </PaperDialog>
  );
}
