import { LogOut, Pencil, UserRound } from "lucide-react";
import { useState } from "react";
import type { CampaignJoinRequest } from "../../features/access/data/campaignAccess";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  CampaignBoard,
  CampaignMember,
  MemberProfileDraft,
} from "../../features/campaign/domain/types";
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
        申请编号 {request.id.slice(0, 8)}　
        <time dateTime={request.requestedAt}>
          {formatNoteTimestamp(request.requestedAt)}
        </time>
      </p>
      {duplicateName && (
        <p className="join-request-warning">
          存在同名成员或申请，请先核对编号与本人身份。
        </p>
      )}
      {request.profileText && (
        <p className="join-request-profile">{request.profileText}</p>
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
        >
          拒绝
        </button>
        <button
          type="button"
          className="publish-button"
          disabled={busy}
          onClick={() => void review(true)}
        >
          {busy ? "处理中…" : "批准加入"}
        </button>
      </div>
    </article>
  );
}

function MemberDetail({
  member,
  board,
  onUpdateProfile,
  onRemoveMember,
}: {
  member: CampaignMember;
  board: CampaignBoard;
  onUpdateProfile: (draft: MemberProfileDraft) => Promise<unknown>;
  onRemoveMember: (userId: string, note: string) => Promise<unknown>;
}) {
  const own = member.userId === board.viewer.id;
  const canRemove =
    board.viewer.role === "gm" &&
    member.role === "player" &&
    member.active &&
    board.campaign.status === "active";
  const [editing, setEditing] = useState(false);
  const [characterName, setCharacterName] = useState(member.characterName);
  const [jobTitle, setJobTitle] = useState(member.jobTitle);
  const [profileText, setProfileText] = useState(member.profileText);
  const [removalNote, setRemovalNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unfinished = board.quests.filter(
    (quest) =>
      quest.claimedBy === member.userId && quest.status !== "completed",
  );
  const save = async () => {
    if (busy || !characterName.trim() || !jobTitle.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onUpdateProfile({
        characterName: characterName.trim(),
        jobTitle: jobTitle.trim(),
        profileText: profileText.trim(),
      });
      setEditing(false);
    } catch {
      setError("资料保存失败，请检查当前成员资格后重试。");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRemoveMember(member.userId, removalNote.trim());
    } catch {
      setError("移出失败，成员状态可能已变化，请刷新排班。");
      setBusy(false);
    }
  };
  return (
    <section
      className="member-detail"
      aria-label={`${member.characterName}资料`}
    >
      <header>
        <div>
          <small>
            成员编号 {member.userId.slice(0, 8)}　
            {member.active ? "在岗" : "已离岗"}
          </small>
          <h2>{member.characterName}</h2>
          <p>{member.jobTitle}</p>
        </div>
        {own && member.active && board.campaign.status === "active" && (
          <button
            type="button"
            className="icon-button"
            onClick={() => setEditing((value) => !value)}
            aria-label="编辑自己的角色资料"
            title="编辑资料"
          >
            <Pencil />
          </button>
        )}
      </header>
      {editing ? (
        <fieldset className="editor-fields" disabled={busy}>
          <label className="field">
            <span>角色名字</span>
            <input
              value={characterName}
              onChange={(event) => setCharacterName(event.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label className="field">
            <span>岗位 / 身份称呼</span>
            <input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label className="field">
            <span>角色资料（房间成员可见）</span>
            <textarea
              value={profileText}
              onChange={(event) => setProfileText(event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
          <div className="member-detail-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="publish-button"
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "保存资料"}
            </button>
          </div>
        </fieldset>
      ) : (
        <p className="member-profile-text">
          {member.profileText || "这位成员还没有填写角色资料。"}
        </p>
      )}
      {canRemove && (
        <div className="member-removal">
          <p>
            未完成任务：<strong>{unfinished.length}</strong>{" "}
            项。尚未提交的任务会释放，待审核报告会保留给 GM 处理。
          </p>
          {confirmRemove && (
            <label className="field">
              <span>移出备注（可选）</span>
              <input
                value={removalNote}
                onChange={(event) => setRemovalNote(event.target.value)}
                maxLength={200}
                placeholder="例：重复身份"
              />
            </label>
          )}
          <button
            type="button"
            className="text-button danger-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            <LogOut />
            {confirmRemove ? "确认移出房间" : "移出房间"}
          </button>
        </div>
      )}
      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function RosterDialog({
  board,
  onClose,
  joinInbox,
  inboxError = "",
  onRefreshInbox,
  onReviewJoin,
  onUpdateProfile,
  onRemoveMember,
}: {
  board: CampaignBoard;
  onClose: () => void;
  joinInbox?: { requests: CampaignJoinRequest[]; total: number };
  inboxError?: string;
  onRefreshInbox: () => Promise<void>;
  onReviewJoin: (id: string, approved: boolean, note: string) => Promise<void>;
  onUpdateProfile: (draft: MemberProfileDraft) => Promise<unknown>;
  onRemoveMember: (userId: string, note: string) => Promise<unknown>;
}) {
  const active = board.members.filter((member) => member.active);
  const inactive = board.members.filter((member) => !member.active);
  const [selectedId, setSelectedId] = useState(
    board.members.find((member) => member.userId === board.viewer.id)?.userId ??
      active[0]?.userId ??
      "",
  );
  const selected = board.members.find((member) => member.userId === selectedId);
  return (
    <PaperDialog
      title={`危机排班（${active.length} 人在岗）`}
      className="roster-dialog"
      onClose={onClose}
    >
      <div className={joinInbox ? "roster-shell has-inbox" : "roster-shell"}>
      {joinInbox && (
        <section className="join-request-inbox" aria-label="待审批入店申请">
          <div className="join-inbox-heading">
            <h2>入店申请（{joinInbox.total} 条待审批）</h2>
            <button
              type="button"
              className="text-button"
              onClick={() => void onRefreshInbox()}
            >
              刷新申请
            </button>
          </div>
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
        </section>
      )}
      <div className="roster-layout">
        <div className="roster-member-list" role="list" aria-label="房间成员">
          {active.map((member) => (
            <button
              type="button"
              role="listitem"
              className={selectedId === member.userId ? "is-selected" : ""}
              key={member.userId}
              onClick={() => setSelectedId(member.userId)}
            >
              <UserRound />
              <span>
                <strong>{member.characterName}</strong>
                <small>{member.jobTitle}</small>
              </span>
            </button>
          ))}
          {inactive.length > 0 && (
            <details className="inactive-members">
              <summary>已离岗（{inactive.length}）</summary>
              {inactive.map((member) => (
                <button
                  type="button"
                  className={selectedId === member.userId ? "is-selected" : ""}
                  key={member.userId}
                  onClick={() => setSelectedId(member.userId)}
                >
                  <UserRound />
                  <span>
                    <strong>{member.characterName}</strong>
                    <small>{member.jobTitle}</small>
                  </span>
                </button>
              ))}
            </details>
          )}
        </div>
        {selected && (
          <MemberDetail
            key={selected.userId}
            member={selected}
            board={board}
            onUpdateProfile={onUpdateProfile}
            onRemoveMember={onRemoveMember}
          />
        )}
      </div>
      </div>
    </PaperDialog>
  );
}
