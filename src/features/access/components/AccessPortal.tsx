import type { AppSession } from "../domain/types";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChefHat,
  Eye,
  KeyRound,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  ShieldAlert,
  Store,
  UserPlus,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { PasswordField } from "./PasswordField";
import { validateNewPassword } from "../domain/account";
import { useImeEnterGuard } from "../../../hooks/useImeEnterGuard";
import type { PublicCampaign } from "../../campaign/domain/types";
import {
  getAccessErrorMessage,
  GM_PASSWORD_MIN_LENGTH,
  type GmAccess,
  type CampaignJoinRequest,
  type ActiveCampaignAccess,
} from "../data/campaignAccess";

const AccountSettingsDialog = lazy(() => import("./AccountSettingsDialog").then(
  (module) => ({ default: module.AccountSettingsDialog }),
));

const employeePositions = ["厨师", "维修师", "服务员", "顾客"] as const;

function campaignRoleLabel(campaign: ActiveCampaignAccess) {
  if (campaign.role === "gm") return "GM / 店长";
  if (campaign.role === "player") return campaign.jobTitle;
  return "观察者";
}

interface AccessPortalProps {
  session: AppSession | null;
  legacyCutoff?: boolean;
  gmAccess: GmAccess | null;
  activeCampaigns: ActiveCampaignAccess[];
  joinRequest: CampaignJoinRequest | null;
  onEnterCampaign: (campaignId: string) => void;
  onRefreshJoinRequest: () => Promise<void>;
  onCancelJoinRequest: (id: string) => Promise<void>;
  onRefreshGmAccess: () => Promise<void>;
  accessError: string;
  publicCampaigns: PublicCampaign[];
  publicCampaignsLoading: boolean;
  onVisitPublicCampaign: (campaignId: string) => void;
  onSignInAccount: (input: { username: string; password: string }) => Promise<void>;
  onRegisterAccount: (input: {
    username: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  onApplyGm: () => Promise<void>;
  onCreateCampaign: (name: string, characterName: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onAccountUpdated: () => Promise<void>;
  onJoinCampaign: (input: {
    joinCode: string;
    characterName: string;
    jobTitle: string;
    profileText: string;
  }) => Promise<void>;
}

export function AccessPortal({
  session,
  legacyCutoff = false,
  gmAccess,
  activeCampaigns,
  joinRequest,
  onEnterCampaign,
  onRefreshJoinRequest,
  onCancelJoinRequest,
  onRefreshGmAccess,
  accessError,
  publicCampaigns,
  publicCampaignsLoading,
  onVisitPublicCampaign,
  onSignInAccount,
  onRegisterAccount,
  onApplyGm,
  onCreateCampaign,
  onSignOut,
  onAccountUpdated,
  onJoinCampaign,
}: AccessPortalProps) {
  const imeGuard = useImeEnterGuard();
  const [signedOutMode, setSignedOutMode] = useState<"signin" | "signup">("signin");
  const [accountTab, setAccountTab] = useState<"employee" | "gm">("employee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const busyRef = useRef(false);
  const [nickname, setNickname] = useState("");
  const [characterName, setCharacterName] = useState(
    session?.user?.displayName ?? "",
  );
  const [jobTitle, setJobTitle] = useState("服务员");
  const [profileText, setProfileText] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [campaignName, setCampaignName] = useState("汉○王夜班危机营业");
  const [gmCharacterName, setGmCharacterName] = useState(
    session?.user?.displayName ?? "",
  );
  // Accounts with campaigns land on the campaign list only; starting a
  // new campaign is an explicit step away from that list.
  const [startNew, setStartNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(
    null,
  );
  const shownNoticeKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!legacyCutoff) return;
    setNotice({
      title: "旧匿名身份已停用",
      body: "之前无需注册的匿名身份已全部停用，旧记录不会带入新账号。请注册一个账号名 + 密码的账号重新开始；想回到原来的战役，用班次码重新提交入店申请即可。",
    });
  }, [legacyCutoff]);

  useEffect(() => {
    if (!session?.user) return;
    setCharacterName((current) => current || session.user.displayName);
    setGmCharacterName((current) => current || session.user.displayName);
  }, [session?.user]);

  // Approval reminders are one-off popups, shown once per status.
  useEffect(() => {
    if (!session?.user) return;
    if (joinRequest && joinRequest.status !== "approved") {
      const key = `join:${joinRequest.id}:${joinRequest.status}`;
      if (shownNoticeKeys.current.has(key)) return;
      shownNoticeKeys.current.add(key);
      setNotice({
        title: "入店申请需要 GM 审批",
        body:
          joinRequest.status === "rejected"
            ? "你的入店申请未通过。请先联系 GM 核对身份与班次码，确认后再重新提交。"
            : "你的入店申请已提交。批准前无法访问公告板，请先联系 GM 核对身份；批准后会出现在「进行中的战役」列表。",
      });
      return;
    }
    if (gmAccess && gmAccess.status !== "approved") {
      const key = `gm:${gmAccess.userId}:${gmAccess.status}`;
      if (shownNoticeKeys.current.has(key)) return;
      shownNoticeKeys.current.add(key);
      setNotice({
        title: "GM 申请需要站长审批",
        body: "你的 GM 申请尚未通过站长审批，暂时不能创建战役或使用 GM 功能。请把账号名发给站长（不要发密码），批准后即可创建战役。",
      });
    }
  }, [session?.user, joinRequest, gmAccess]);

  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (operationError) {
      // Never log the raw error object; only mapped messages reach the user.
      setError(getAccessErrorMessage(operationError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (signedOutMode === "signup") {
        validateNewPassword(password, confirmPassword);
        await onRegisterAccount({
          username,
          password,
          displayName: nickname,
        });
      } else {
        await onSignInAccount({ username, password });
      }
    });
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    void run(() =>
      onJoinCampaign({ joinCode, characterName, jobTitle, profileText }),
    );
  };

  const submitCampaign = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onCreateCampaign(campaignName, gmCharacterName));
  };

  const visitPublicCampaign = (campaignId: string) => {
    if (session?.user) {
      onVisitPublicCampaign(campaignId);
      return;
    }
    onVisitPublicCampaign(campaignId);
    setNotice({
      title: "参观房间需要先登录账号",
      body: "登录或注册一个账号后即可参观。完成后会自动进入你选择的房间。",
    });
  };

  const accountName =
    gmAccess?.accountName?.replace(/@.*$/, "") ||
    session?.user?.email?.replace(/@.*$/, "") ||
    "";
  const activePlayerCampaign = activeCampaigns.find(
    (campaign) => campaign.role === "player",
  );
  useEffect(() => {
    if (activePlayerCampaign) setStartNew(false);
  }, [activePlayerCampaign?.campaignId]);
  const showCampaignHome = Boolean(
    session && activeCampaigns.length > 0 && !startNew,
  );
  const heading = !session
    ? signedOutMode === "signup"
      ? "注册账号"
      : "账号登录"
    : showCampaignHome
      ? "我的战役"
      : accountTab === "gm"
        ? gmAccess?.status === "approved"
          ? "创建战役"
          : "申请成为 GM"
        : joinRequest
          ? "入店申请"
          : "加入战役";

  const joinRequestPanel = joinRequest ? (
    <div className="access-form gm-approval" aria-live="polite">
      <dl>
        <dt>申请班次</dt>
        <dd>{joinRequest.campaignName}</dd>
        <dt>角色与岗位</dt>
        <dd>
          {joinRequest.characterName}（{joinRequest.jobTitle}）
        </dd>
        <dt>审批状态</dt>
        <dd>
          {joinRequest.status === "pending"
            ? "等待 GM 审批"
            : joinRequest.status === "approved"
              ? "GM 已批准，正在核对排班"
              : "入店申请未通过"}
        </dd>
      </dl>
      {joinRequest.status === "rejected" && (
        <p>请联系 GM 核对申请。同一账号重复提交不会重置审批结果。</p>
      )}
      {joinRequest.reviewNote && <p>GM 备注：{joinRequest.reviewNote}</p>}
      <button
        className="access-submit"
        type="button"
        disabled={busy}
        onClick={() => void run(onRefreshJoinRequest)}
      >
        {busy ? "正在查询" : "刷新入店审批结果"}
      </button>
      {joinRequest.status === "pending" && (
        <button
          className="access-signout"
          type="button"
          disabled={busy}
          onClick={() => void run(() => onCancelJoinRequest(joinRequest.id))}
        >
          撤回入店申请
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="access-screen">
      <div className="access-scene" aria-hidden="true" />
      <div className="access-shade" aria-hidden="true" />

      <div className="access-side">
        <header className="access-brand">
          <p className="access-kicker">汉○王员工专用内部文件</p>
          <h1>
            危机营业
            <br />
            签到处
          </h1>
          <p className="access-decree">
            顾客至上，品质为王，<strong>永不停止营业。</strong>
          </p>
          <div className="access-alert">
            <ShieldAlert aria-hidden="true" />
            <span>救援尚未抵达。请保持岗位意识。</span>
          </div>
        </header>

        <aside className="public-room-dock" aria-labelledby="public-rooms-title">
          <section className="public-room-browser">
            <header>
              <div>
                <small>无需班次码，只读访问</small>
                <h3 id="public-rooms-title">公开参观房间</h3>
              </div>
              <Eye aria-hidden="true" />
            </header>
            {publicCampaignsLoading ? (
              <p>正在查看公开房间…</p>
            ) : publicCampaigns.length ? (
              <div className="public-room-list">
                {publicCampaigns.map((campaign) => (
                  <button
                    type="button"
                    key={campaign.id}
                    onClick={() => visitPublicCampaign(campaign.id)}
                  >
                    <span>
                      <strong>{campaign.name}</strong>
                      <small>汉堡屋指数 {campaign.burgerIndex}</small>
                    </span>
                    <span className="public-room-message-count">
                      <MessageSquare aria-hidden="true" />
                      {campaign.messageCount}
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p>当前没有开放参观的房间。</p>
            )}
          </section>
        </aside>
      </div>

      <main className="access-manual" aria-label="危机营业员工报到">
        <div className="manual-spine" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="manual-sheet">
          <div className="manual-heading">
            <div>
              <h2>{heading}</h2>
            </div>
            <span className="manual-file-number">BK-ZM-09</span>
          </div>

          {!session ? (
            <>
              <div className="access-tabs" role="tablist" aria-label="账号">
                <button
                  type="button"
                  role="tab"
                  aria-selected={signedOutMode === "signin"}
                  className={signedOutMode === "signin" ? "is-active" : ""}
                  onClick={() => {
                    setSignedOutMode("signin");
                    setError("");
                  }}
                >
                  <KeyRound aria-hidden="true" />
                  登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={signedOutMode === "signup"}
                  className={signedOutMode === "signup" ? "is-active" : ""}
                  onClick={() => {
                    setSignedOutMode("signup");
                    setError("");
                  }}
                >
                  <UserPlus aria-hidden="true" />
                  注册
                </button>
              </div>
              <form className="access-form" onSubmit={submitAccount} {...imeGuard}>
                <label>
                  <span>账号名</span>
                  <input
                    required
                    minLength={3}
                    maxLength={20}
                    pattern={"[a-z0-9_\\-]{3,20}"}
                    value={username}
                    onChange={(event) =>
                      setUsername(
                        event.target.value.toLowerCase().replace(/\s+/g, ""),
                      )
                    }
                    placeholder="manager_zhou"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <small>3–20 位小写字母、数字、下划线或短横线</small>
                </label>
                {signedOutMode === "signup" && (
                  <label>
                    <span>昵称</span>
                    <input
                      required
                      maxLength={32}
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="例：晚班阿强"
                      autoComplete="name"
                    />
                  </label>
                )}
                <PasswordField label="密码" required value={password}
                  minLength={signedOutMode === "signup" ? GM_PASSWORD_MIN_LENGTH : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={signedOutMode === "signup" ? "new-password" : "current-password"} />
                {signedOutMode === "signup" && (
                  <>
                    <PasswordField label="确认密码" required value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
                    <small>新密码至少 15 个字符，最多 72 个 UTF-8 字节。建议使用密码管理器保存。</small>
                  </>
                )}
                <button className="access-submit" type="submit" disabled={busy}>
                  {busy
                    ? signedOutMode === "signup"
                      ? "正在注册"
                      : "正在登录"
                    : signedOutMode === "signup"
                      ? "注册账号"
                      : "登录"}
                  {!busy && <ArrowRight aria-hidden="true" />}
                </button>
              </form>
              <button type="button" className="access-signout account-recovery" onClick={() => setNotice({
                title: "忘记密码",
                body: "当前账号没有绑定可收信邮箱，暂不支持邮件自助找回。请联系站长，提供账号名及原战役信息；站长需通过此前已有的联系渠道核实本人后重置密码。不要发送旧密码，也不要仅凭角色同名认领账号。",
              })}>忘记密码？</button>
            </>
          ) : (
            <>
              <div className="account-summary">
                <span>
                  <BadgeCheck aria-hidden="true" />
                  {session.user.displayName}
                  {accountName ? `（${accountName}）` : ""}
                </span>
                <button
                  type="button"
                  className="access-signout"
                  disabled={busy}
                  onClick={() => void run(onSignOut)}
                >
                  <LogOut aria-hidden="true" />
                  退出账号
                </button>
              </div>

              <button type="button" className="access-signout account-settings-entry"
                onClick={() => setSettingsOpen(true)}><Settings aria-hidden="true" />账号设置</button>

              {showCampaignHome ? (
                <>
                  <section
                    className="campaign-access-list"
                    aria-label="进行中的战役"
                  >
                    <div className="campaign-access-rows">
                      {activeCampaigns.map((campaign) => (
                        <button
                          type="button"
                          key={campaign.campaignId}
                          onClick={() => onEnterCampaign(campaign.campaignId)}
                        >
                          <span
                            className={`campaign-access-role is-${campaign.role}`}
                          >
                            {campaign.role === "gm" ? (
                              <Store aria-hidden="true" />
                            ) : (
                              <UserRound aria-hidden="true" />
                            )}
                          </span>
                          <span className="campaign-access-name">
                            <strong>{campaign.name}</strong>
                            <small>
                              {campaign.characterName}　
                              {campaignRoleLabel(campaign)}
                            </small>
                          </span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </section>
                  {joinRequestPanel}
                  <button
                    className="access-submit campaign-start-new"
                    type="button"
                    onClick={() => setStartNew(true)}
                  >
                    重新开始战役
                    <Plus aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  {activeCampaigns.length > 0 && (
                    <button
                      className="access-signout campaign-back"
                      type="button"
                      onClick={() => setStartNew(false)}
                    >
                      <ArrowLeft aria-hidden="true" />
                      返回我的战役
                    </button>
                  )}
              <div className="access-tabs" role="tablist" aria-label="游玩方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={accountTab === "employee"}
                  className={accountTab === "employee" ? "is-active" : ""}
                  onClick={() => setAccountTab("employee")}
                >
                  <UserRound aria-hidden="true" />
                  员工参与
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={accountTab === "gm"}
                  className={accountTab === "gm" ? "is-active" : ""}
                  onClick={() => setAccountTab("gm")}
                >
                  <Store aria-hidden="true" />
                  GM / 店长
                </button>
              </div>

              {accountTab === "employee" ? (
                activePlayerCampaign ? (
                  <div className="access-form participation-notice">
                    <span>
                      <BadgeCheck aria-hidden="true" />
                      当前员工战役
                    </span>
                    <strong>{activePlayerCampaign.name}</strong>
                    <p>
                      {activePlayerCampaign.characterName}（
                      {activePlayerCampaign.jobTitle}）。
                      一个账号同时只能以员工身份参与一场进行中的战役，但不影响你管理其他战役。
                    </p>
                    <button
                      className="access-submit"
                      type="button"
                      onClick={() =>
                        onEnterCampaign(activePlayerCampaign.campaignId)
                      }
                    >
                      继续以员工身份进入
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                ) : joinRequest ? (
                  joinRequestPanel
                ) : (
                  <form className="access-form" onSubmit={submitJoin} {...imeGuard}>
                  <label>
                    <span>本场角色名</span>
                    <input
                      required
                      maxLength={40}
                      value={characterName}
                      onChange={(event) => setCharacterName(event.target.value)}
                      placeholder="例：倒霉的晚班阿强"
                      autoComplete="nickname"
                    />
                  </label>
                  <label>
                    <span>岗位 / 身份称呼</span>
                    <input
                      required
                      maxLength={40}
                      list="employee-position-presets"
                      value={jobTitle}
                      onChange={(event) => setJobTitle(event.target.value)}
                      placeholder="例：厨师、保安、流浪记者"
                    />
                    <datalist id="employee-position-presets">
                      {employeePositions.map((position) => (
                        <option key={position} value={position} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    <span>角色资料（房间成员可见，可选）</span>
                    <textarea
                      maxLength={2000}
                      rows={3}
                      value={profileText}
                      onChange={(event) => setProfileText(event.target.value)}
                      placeholder="背景、能力、随身物品或需要队友知道的信息"
                    />
                  </label>
                  <label>
                    <span>6 位班次码</span>
                    <input
                      required
                      className="join-code-input"
                      minLength={6}
                      maxLength={6}
                      pattern="[A-Za-z0-9]{6}"
                      value={joinCode}
                      onChange={(event) =>
                        setJoinCode(
                          event.target.value
                            .replace(/[^a-z0-9]/gi, "")
                            .toUpperCase(),
                        )
                      }
                      placeholder="A1B2C3"
                      autoCapitalize="characters"
                      autoComplete="off"
                    />
                  </label>
                  <button className="access-submit" type="submit" disabled={busy}>
                    {busy ? "正在提交入店申请" : "申请加入班次"}
                    {!busy && <ArrowRight aria-hidden="true" />}
                  </button>
                </form>
                )
              ) : gmAccess?.status === "approved" ? (
                <form className="access-form" onSubmit={submitCampaign} {...imeGuard}>
                  <label>
                    <span>战役名称</span>
                    <input
                      required
                      maxLength={80}
                      value={campaignName}
                      onChange={(event) => setCampaignName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>店长角色名</span>
                    <input
                      required
                      maxLength={40}
                      value={gmCharacterName}
                      onChange={(event) => setGmCharacterName(event.target.value)}
                      placeholder="例：临时代理店长老周"
                    />
                  </label>
                  <button className="access-submit" type="submit" disabled={busy}>
                    {busy ? "正在张贴营业公告" : "创建战役并开始营业"}
                    {!busy && <Store aria-hidden="true" />}
                  </button>
                </form>
              ) : gmAccess ? (
                <div className="access-form gm-approval" aria-live="polite">
                  <dl>
                    <dt>申请账号</dt>
                    <dd>{accountName}</dd>
                    <dt>审批状态</dt>
                    <dd>
                      {gmAccess.status === "pending"
                        ? "等待站长审批"
                        : gmAccess.status === "rejected"
                          ? "申请未通过"
                          : gmAccess.status === "revoked"
                            ? "GM 权限已撤销"
                            : "审批状态读取失败"}
                    </dd>
                  </dl>
                  <p>
                    {gmAccess.status === "pending"
                      ? "站长批准后即可创建战役。"
                      : "如需开通权限，请联系站长确认。"}
                  </p>
                  {gmAccess.reviewNote && <p>站长备注：{gmAccess.reviewNote}</p>}
                  <button
                    className="access-submit"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(onRefreshGmAccess)}
                  >
                    {busy ? "正在查询" : "刷新审批结果"}
                  </button>
                </div>
              ) : (
                <div className="access-form">
                  <button
                    className="access-submit"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(onApplyGm)}
                  >
                    {busy ? "正在提交申请" : "申请成为 GM"}
                    {!busy && <UserPlus aria-hidden="true" />}
                  </button>
                </div>
              )}
                </>
              )}
            </>
          )}

          {(error || accessError) && (
            <p className="access-error" role="alert">
              {error || accessError}
            </p>
          )}

          <footer className="manual-rules">
            <span>
              <ChefHat aria-hidden="true" />
              没有任务时，制作汉堡
            </span>
            <span>
              <Wrench aria-hidden="true" />
              设施用途不限于标签
            </span>
            <span>
              <ShieldAlert aria-hidden="true" />
              异常顾客不办会员
            </span>
          </footer>
        </div>
      </main>

      {settingsOpen && session && (
        <Suspense fallback={<p className="toast is-visible" role="status">正在打开账号设置</p>}>
          <AccountSettingsDialog session={session}
            onClose={() => setSettingsOpen(false)} onUpdated={onAccountUpdated} />
        </Suspense>
      )}
      {notice && (
        <div
          className="approval-notice-overlay"
          role="presentation"
          onMouseDown={() => setNotice(null)}
        >
          <section
            className="approval-notice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-notice-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ShieldAlert aria-hidden="true" />
            <h2 id="approval-notice-title">{notice.title}</h2>
            <p>{notice.body}</p>
            <button
              type="button"
              className="publish-button"
              autoFocus
              onClick={() => setNotice(null)}
            >
              我知道了
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
