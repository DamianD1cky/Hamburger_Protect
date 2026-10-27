import { useState } from "react";
import type { CampaignJoinRequest } from "../../features/access/data/campaignAccess";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type { CampaignMember } from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

function JoinRequestRow({
  request,
  duplicateName,
  onReview,
}: {
  request: CampaignJoinRequest;
  duplicateName: boolean;
  onReview: (id: string, approved: boolean, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const identity = `${request.characterName}（${request.id.slice(0, 8)}）`;
  const review = async (approved: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onReview(request.id, approved, note);
    } catch {
      setError("处理失败，申请可能已撤回或被处理，请刷新后重试。");
      setBusy(false);
    }
  };
  return (
    <article className="join-request-row" aria-label={`入店申请：${identity}`}>
      <header>
        <strong>{request.characterName}</strong>
        <span>{request.jobTitle}</span>
      </header>
      <p className="join-request-meta">
        申请编号 {request.id.slice(0, 8)} ·{" "}
        <time dateTime={request.requestedAt}>
          {formatNoteTimestamp(request.requestedAt)}
        </time>
      </p>
      {duplicateName && (
        <p className="join-request-warning">
          存在同名成员或申请，请先核对是否为同一位玩家。
        </p>
      )}
      <label className="field">
        <span>审批备注（可选）</span>
        <input
          aria-label={`审批备注：${identity}`}
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          placeholder="备注会显示给申请者"
        />
      </label>
      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
      <div className="join-request-actions">
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void review(false)}
          aria-label={`拒绝入店：${identity}`}
        >
          拒绝
        </button>
        <button
          type="button"
          className="publish-button"
          disabled={busy}
          onClick={() => void review(true)}
          aria-label={`批准入店：${identity}`}
        >
          {busy ? "处理中…" : "批准加入"}
        </button>
      </div>
    </article>
  );
}

export function RosterDialog({
  members,
  onClose,
  joinInbox,
  inboxError = "",
  onRefreshInbox,
  onReviewJoin,
}: {
  members: CampaignMember[];
  onClose: () => void;
  joinInbox?: { requests: CampaignJoinRequest[]; total: number };
  inboxError?: string;
  onRefreshInbox: () => Promise<void>;
  onReviewJoin: (id: string, approved: boolean, note: string) => Promise<void>;
}) {
  const active = members.filter((member) => member.active);
  return (
    <PaperDialog title={`危机排班 · ${active.length} 人在岗`} onClose={onClose}>
      {joinInbox && (
        <section className="join-request-inbox" aria-label="待审批入店申请">
          <div className="join-inbox-heading">
            <h2>入店申请 · {joinInbox.total} 条待审批</h2>
            <button
              type="button"
              className="text-button"
              onClick={() => void onRefreshInbox()}
            >
              刷新申请
            </button>
          </div>
          <p className="editor-help">
            先联系玩家核对身份，再批准加入。班次码只能提交申请，批准前无法访问公告板。
          </p>
          {inboxError && (
            <p className="access-error" role="alert">
              申请读取失败，请刷新后重试。
            </p>
          )}
          {!joinInbox.requests.length && !inboxError && (
            <p className="editor-help">暂无待审批申请。</p>
          )}
          {joinInbox.requests.map((request) => (
            <JoinRequestRow
              key={request.id}
              request={request}
              duplicateName={
                active.some(
                  (member) => member.characterName === request.characterName,
                ) ||
                joinInbox.requests.some(
                  (other) =>
                    other.id !== request.id &&
                    other.characterName === request.characterName,
                )
              }
              onReview={onReviewJoin}
            />
          ))}
          {joinInbox.total > joinInbox.requests.length && (
            <p className="editor-help">
              显示最早的 {joinInbox.requests.length}{" "}
              条申请，处理后会自动显示后续申请。
            </p>
          )}
        </section>
      )}
      <table className="roster-table">
        <thead>
          <tr>
            <th>岗位</th>
            <th>角色名</th>
            <th>身份</th>
          </tr>
        </thead>
        <tbody>
          {active.map((member) => (
            <tr key={member.userId}>
              <td>{member.jobTitle}</td>
              <td>{member.characterName}</td>
              <td>
                {member.role === "gm"
                  ? "值班店长"
                  : member.role === "observer"
                    ? "观察者"
                    : "临时员工"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!active.length && <p>暂无在岗成员。</p>}
    </PaperDialog>
  );
}
