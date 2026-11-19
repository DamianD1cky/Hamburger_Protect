import { ChevronRight, LogOut, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CampaignJoinRequest } from "../../features/access/data/campaignAccess";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type {
  CampaignBoard,
  CampaignMember,
  MemberProfileDraft,
} from "../../features/campaign/domain/types";
import { MenuPopover } from "./MenuPopover";

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
    <article
      className="join-request-row hig-editor-group"
      aria-label={`加入申请：${identity}`}
    >
      <header className="hig-request-head">
        <span className="hig-roster-avatar" aria-hidden="true">
          {request.characterName.slice(0, 1)}
        </span>
        <div className="hig-request-titles">
          <strong>{request.characterName}</strong>
          <small>
            {request.jobTitle} · 编号 {request.id.slice(0, 8)} ·{" "}
            <time dateTime={request.requestedAt}>
              {formatNoteTimestamp(request.requestedAt)}
            </time>
          </small>
        </div>
      </header>
      {duplicateName && (
        <p className="hig-inline-warning">
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
      setError("移出失败，成员状态可能已变化，请刷新名册。");
      setBusy(false);
    }
  };

  return (
    <section
      className="member-detail hig-member-detail-card"
      aria-label={`${member.characterName}资料`}
    >
      <header className="hig-member-detail-head">
        <span
          className={
            member.role === "gm"
              ? "hig-member-avatar-lg is-gm"
              : "hig-member-avatar-lg"
          }
          aria-hidden="true"
        >
          {member.characterName.slice(0, 1)}
        </span>
        <div className="hig-member-detail-titles">
          <div className="hig-member-name-row">
            <h2>{member.characterName}</h2>
            <span
              className={
                member.active
                  ? "hig-status-pill is-online"
                  : "hig-status-pill"
              }
            >
              {member.active ? "在场" : "已离场"}
            </span>
          </div>
          <p>
            {member.jobTitle} · 编号 {member.userId.slice(0, 8)}
          </p>
        </div>
        {own && member.active && board.campaign.status === "active" && (
          <button
            type="button"
            className="hig-pill-action"
            onClick={() => setEditing((value) => !value)}
            aria-label="编辑自己的角色资料"
            title="编辑资料"
          >
            <Pencil aria-hidden="true" />
            {editing ? "预览" : "编辑"}
          </button>
        )}
      </header>

      {editing ? (
        <fieldset className="hig-editor-sections" disabled={busy}>
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
            <span>身份 / 职业称呼</span>
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
              aria-label="角色资料（房间成员可见）"
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
        <div className="hig-member-bio-box">
          <span className="hig-section-label">角色简介</span>
          <p className="member-profile-text">
            {member.profileText || "这位成员还没有填写角色资料。"}
          </p>
        </div>
      )}

      {canRemove && (
        <div className="member-removal hig-member-danger-zone">
          <p>
            未完成任务：<strong>{unfinished.length}</strong>{" "}
            项。移出后尚未提交的任务会自动释放。
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
            className="delete-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            <LogOut aria-hidden="true" />
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

/**
 * Apple HIG 主从分栏成员名册浮层（macOS Sidebar + Detail Card）。
 */
export function RosterDialog({
  anchor,
  board,
  onClose,
  joinInbox,
  inboxError = "",
  onRefreshInbox,
  onReviewJoin,
  onUpdateProfile,
  onRemoveMember,
}: {
  anchor: HTMLElement | null;
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
  const [tab, setTab] = useState<"members" | "requests">("members");

  return (
    <MenuPopover
      anchor={anchor}
      id="roster-menu"
      keepMounted
      width={580}
      title="成员名册"
      className="roster-dialog hig-popover"
      onClose={onClose}
    >
      {joinInbox && (
        <div
          className="hig-inspector-segmented"
          role="tablist"
          aria-label="名册分类"
        >
          {(
            [
              ["members", `在场成员 · ${active.length}`],
              ["requests", `加入申请 · ${joinInbox.total}`],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              role="tab"
              key={key}
              aria-selected={tab === key}
              aria-controls={`roster-panel-${key}`}
              id={`roster-tab-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "members"
                    : event.key === "End"
                      ? "requests"
                      : tab === "members"
                        ? "requests"
                        : "members";
                setTab(next);
                document.getElementById(`roster-tab-${next}`)?.focus();
              }}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="roster-shell">
        {joinInbox && (
          <section
            className="join-request-inbox"
            aria-label="待审批加入申请"
            id="roster-panel-requests"
            role="tabpanel"
            aria-labelledby="roster-tab-requests"
            hidden={tab !== "requests"}
          >
            <div className="hig-popover-section-head">
              <span className="hig-section-label">
                加入申请（{joinInbox.total} 条待审批）
              </span>
              <button
                type="button"
                className="hig-pill-action"
                onClick={() => void onRefreshInbox()}
              >
                <RefreshCw aria-hidden="true" />
                刷新申请
              </button>
            </div>
            {inboxError && (
              <p className="access-error" role="alert">
                申请读取失败，请刷新后重试。
              </p>
            )}
            {!joinInbox.requests.length && !inboxError && (
              <div className="hig-empty-card">暂无待审批的加入申请</div>
            )}
            <div className="hig-editor-sections">
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
            </div>
          </section>
        )}

        <div
          className="roster-layout hig-roster-split"
          id="roster-panel-members"
          role={joinInbox ? "tabpanel" : undefined}
          aria-labelledby={joinInbox ? "roster-tab-members" : undefined}
          hidden={!!joinInbox && tab !== "members"}
        >
          <div className="hig-sidebar-list" role="list" aria-label="房间成员">
            {active.map((member) => (
              <button
                type="button"
                role="listitem"
                className={
                  selectedId === member.userId
                    ? "hig-sidebar-item is-selected"
                    : "hig-sidebar-item"
                }
                key={member.userId}
                onClick={() => setSelectedId(member.userId)}
              >
                <span
                  className={
                    member.role === "gm"
                      ? "hig-roster-avatar is-gm"
                      : "hig-roster-avatar"
                  }
                  aria-hidden="true"
                >
                  {member.characterName.slice(0, 1)}
                </span>
                <span className="hig-sidebar-copy">
                  <strong>{member.characterName}</strong>
                  <small>{member.jobTitle}</small>
                </span>
                <ChevronRight className="hig-sidebar-chevron" aria-hidden="true" />
              </button>
            ))}

            {inactive.length > 0 && (
              <details className="hig-inactive-disclosure">
                <summary>已离场（{inactive.length}）</summary>
                {inactive.map((member) => (
                  <button
                    type="button"
                    className={
                      selectedId === member.userId
                        ? "hig-sidebar-item is-selected"
                        : "hig-sidebar-item"
                    }
                    key={member.userId}
                    onClick={() => setSelectedId(member.userId)}
                  >
                    <span className="hig-roster-avatar" aria-hidden="true">
                      {member.characterName.slice(0, 1)}
                    </span>
                    <span className="hig-sidebar-copy">
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

      <footer className="composer-actions hig-sheet-footer">
        <span className="action-spacer" />
        <button type="button" className="publish-button" onClick={onClose}>
          完成
        </button>
      </footer>
    </MenuPopover>
  );
}
