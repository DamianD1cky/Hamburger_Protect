import type { AppSession } from "../domain/types";
import {
  ArrowRight,
  BadgeCheck,
  ChefHat,
  Eye,
  KeyRound,
  MessageSquare,
  ShieldAlert,
  Store,
  UserPlus,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { PublicCampaign } from "../../campaign/domain/types";
import {
  getAccessErrorMessage,
  GM_PASSWORD_MIN_LENGTH,
  type GmAccess,
  type CampaignJoinRequest,
} from "../data/campaignAccess";

const employeePositions = ["厨师", "维修师", "服务员", "顾客"] as const;

type PortalMode = "employee" | "gm";
type GmMode = "signin" | "signup";

interface AccessPortalProps {
  session: AppSession | null;
  gmAccess: GmAccess | null;
  joinRequest: CampaignJoinRequest | null;
  onRefreshJoinRequest: () => Promise<void>;
  onCancelJoinRequest: (id: string) => Promise<void>;
  onRefreshGmAccess: () => Promise<void>;
  accessError: string;
  publicCampaigns: PublicCampaign[];
  publicCampaignsLoading: boolean;
  onVisitPublicCampaign: (campaignId: string) => void;
  onSignInGm: (input: { username: string; password: string }) => Promise<void>;
  onRegisterGm: (input: {
    username: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  onCreateCampaign: (name: string, characterName: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onJoinCampaign: (input: {
    joinCode: string;
    characterName: string;
    jobTitle: string;
    profileText: string;
  }) => Promise<void>;
}

export function AccessPortal({
  session,
  gmAccess,
  joinRequest,
  onRefreshJoinRequest,
  onCancelJoinRequest,
  onRefreshGmAccess,
  accessError,
  publicCampaigns,
  publicCampaignsLoading,
  onVisitPublicCampaign,
  onSignInGm,
  onRegisterGm,
  onCreateCampaign,
  onSignOut,
  onJoinCampaign,
}: AccessPortalProps) {
  const regularUser = Boolean(session?.user && !session.user.isAnonymous);
  const [mode, setMode] = useState<PortalMode>(regularUser ? "gm" : "employee");
  const [gmMode, setGmMode] = useState<GmMode>("signin");
  const [gmUsername, setGmUsername] = useState("");
  const [gmPassword, setGmPassword] = useState("");
  const [gmName, setGmName] = useState("");
  const [campaignName, setCampaignName] = useState("汉○王夜班危机营业");
  const [characterName, setCharacterName] = useState(
    session?.user?.displayName ?? "",
  );
  const [joinCode, setJoinCode] = useState("");
  const [jobTitle, setJobTitle] = useState(() => {
    const stored = session?.user?.metadata?.employeePosition;
    return typeof stored === "string" && stored.trim() ? stored : "服务员";
  });
  const [profileText, setProfileText] = useState(() => {
    const stored = session?.user?.metadata?.profileText;
    return typeof stored === "string" ? stored : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!regularUser) return;
    setGmName((current) => current || session?.user?.displayName || "");
  }, [regularUser, session?.user?.displayName]);

  const view = useMemo(() => {
    if (regularUser)
      return gmAccess?.status === "approved" ? "create" : "approval";
    if (joinRequest && mode === "employee") return "join-approval";
    return mode;
  }, [mode, regularUser, gmAccess?.status, joinRequest]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (operationError) {
      console.error("[access]", operationError);
      setError(getAccessErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  };

  const submitGm = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (gmMode === "signup") {
        await onRegisterGm({
          username: gmUsername,
          password: gmPassword,
          displayName: gmName,
        });
      } else {
        await onSignInGm({ username: gmUsername, password: gmPassword });
      }
    });
  };

  const submitCampaign = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onCreateCampaign(campaignName, gmName));
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    void run(() =>
      onJoinCampaign({ joinCode, characterName, jobTitle, profileText }),
    );
  };

  return (
    <div className="access-screen">
      <div className="access-scene" aria-hidden="true" />
      <div className="access-shade" aria-hidden="true" />

      <header className="access-brand">
        <p className="access-kicker">汉○王员工专用 · 内部文件</p>
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
              <small>危机应对与持续营业指南</small>
              <h2>
                {view === "join-approval"
                  ? "入店申请"
                  : view === "approval"
                    ? "GM 权限申请"
                    : view === "create"
                      ? "建立本次夜班"
                      : view === "gm"
                        ? gmMode === "signup"
                          ? "申请店长账号"
                          : "店长账号登录"
                        : "员工报到单"}
              </h2>
            </div>
            <span className="manual-file-number">BK-ZM-09</span>
          </div>

          {!regularUser && (
            <div className="access-tabs" role="tablist" aria-label="报到身份">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "employee"}
                className={mode === "employee" ? "is-active" : ""}
                onClick={() => setMode("employee")}
              >
                <UserRound aria-hidden="true" />
                员工 / 顾客
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "gm"}
                className={mode === "gm" ? "is-active" : ""}
                onClick={() => setMode("gm")}
              >
                <KeyRound aria-hidden="true" />
                GM / 店长
              </button>
            </div>
          )}

          {view === "employee" && (
            <form className="access-form" onSubmit={submitJoin}>
              <p className="gm-application-notice">
                班次码用于申请加入。请先与 GM 确认身份，批准后才能进入公告板。
              </p>
              <label>
                <span>员工姓名 / 角色名</span>
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
                  rows={4}
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
          )}

          {view === "join-approval" && joinRequest && (
            <div className="access-form gm-approval" aria-live="polite">
              <p className="gm-application-notice">
                入店申请已提交给本班次
                GM。等待期间请保留当前浏览器身份，批准后会自动进入公告板。
              </p>
              <dl>
                <dt>申请班次</dt>
                <dd>{joinRequest.campaignName}</dd>
                <dt>角色与岗位</dt>
                <dd>
                  {joinRequest.characterName} · {joinRequest.jobTitle}
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
              {joinRequest.reviewNote && (
                <p>GM 备注：{joinRequest.reviewNote}</p>
              )}
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
                  onClick={() =>
                    void run(() => onCancelJoinRequest(joinRequest.id))
                  }
                >
                  撤回入店申请
                </button>
              )}
              <button
                className="access-signout"
                type="button"
                onClick={() => void onSignOut()}
              >
                退出当前身份
              </button>
            </div>
          )}

          {view === "gm" && (
            <form className="access-form" onSubmit={submitGm}>
              <p className="gm-application-notice">
                GM
                需联系站长申请。注册后请提供账号名，审批通过后才能创建班次和使用
                GM 功能。
              </p>
              <label>
                <span>店长账号名</span>
                <input
                  required
                  minLength={3}
                  maxLength={20}
                  pattern={"[a-z0-9_\\-]{3,20}"}
                  value={gmUsername}
                  onChange={(event) =>
                    setGmUsername(
                      event.target.value.toLowerCase().replace(/\s+/g, ""),
                    )
                  }
                  placeholder="manager_zhou"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <small className="access-field-hint">
                  3–20 位小写字母、数字、下划线或短横线
                </small>
              </label>

              {gmMode === "signup" && (
                <label>
                  <span>店长称呼</span>
                  <input
                    required
                    maxLength={32}
                    value={gmName}
                    onChange={(event) => setGmName(event.target.value)}
                    placeholder="例：临时代理店长老周"
                    autoComplete="name"
                  />
                </label>
              )}

              <label>
                <span>密码</span>
                <div className="access-input-icon">
                  <KeyRound aria-hidden="true" />
                  <input
                    required
                    type="password"
                    minLength={GM_PASSWORD_MIN_LENGTH}
                    maxLength={50}
                    value={gmPassword}
                    onChange={(event) => setGmPassword(event.target.value)}
                    placeholder={"至少 " + GM_PASSWORD_MIN_LENGTH + " 位"}
                    autoComplete={
                      gmMode === "signup" ? "new-password" : "current-password"
                    }
                  />
                </div>
              </label>

              <button className="access-submit" type="submit" disabled={busy}>
                {busy
                  ? gmMode === "signup"
                    ? "正在提交申请"
                    : "正在核对店长身份"
                  : gmMode === "signup"
                    ? "注册并申请 GM 权限"
                    : "进入店长后台"}
                {!busy &&
                  (gmMode === "signup" ? (
                    <UserPlus aria-hidden="true" />
                  ) : (
                    <ArrowRight aria-hidden="true" />
                  ))}
              </button>

              <button
                className="access-switch"
                type="button"
                onClick={() => {
                  setGmMode(gmMode === "signup" ? "signin" : "signup");
                  setError("");
                }}
              >
                {gmMode === "signup"
                  ? "已有店长账号？改为登录"
                  : "还没有店长账号？联系站长申请"}
              </button>
            </form>
          )}

          {view === "approval" && (
            <div className="access-form gm-approval" aria-live="polite">
              <p className="gm-application-notice">
                GM 需联系站长申请。请向站长提供下方账号名，无需提供密码。
              </p>
              <dl>
                <dt>申请账号</dt>
                <dd>
                  {gmAccess?.accountName.replace(/@gm\.local$/, "") ??
                    String(
                      session?.user?.metadata?.gmUsername ??
                        session?.user?.email ??
                        "",
                    )}
                </dd>
                <dt>审批状态</dt>
                <dd>
                  {gmAccess?.status === "pending"
                    ? "等待站长审批"
                    : gmAccess?.status === "rejected"
                      ? "申请未通过"
                      : gmAccess?.status === "revoked"
                        ? "GM 权限已撤销"
                        : "审批状态读取失败"}
                </dd>
              </dl>
              <p>
                {gmAccess?.status === "pending"
                  ? "站长批准后，此页面会自动更新。"
                  : "如需开通权限，请联系站长确认。"}
              </p>
              {gmAccess?.reviewNote && <p>站长备注：{gmAccess.reviewNote}</p>}
              <button
                className="access-submit"
                type="button"
                disabled={busy}
                onClick={() => void run(onRefreshGmAccess)}
              >
                {busy ? "正在查询" : "刷新审批结果"}
              </button>
              <button
                className="access-signout"
                type="button"
                onClick={() => void onSignOut()}
              >
                退出店长账号
              </button>
            </div>
          )}

          {view === "create" && (
            <form className="access-form" onSubmit={submitCampaign}>
              <div className="manager-confirmed">
                <BadgeCheck aria-hidden="true" />
                <span>站长已批准 GM 权限：{session?.user?.displayName}</span>
              </div>
              <label>
                <span>本次战役 / 夜班名称</span>
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
                  value={gmName}
                  onChange={(event) => setGmName(event.target.value)}
                  placeholder="例：临时代理店长老周"
                />
              </label>
              <button className="access-submit" type="submit" disabled={busy}>
                {busy ? "正在张贴营业公告" : "创建战役并开始营业"}
                {!busy && <Store aria-hidden="true" />}
              </button>
              <button
                className="access-signout"
                type="button"
                onClick={() => void onSignOut()}
              >
                退出店长账号
              </button>
            </form>
          )}

          {(error || accessError) && (
            <p className="access-error" role="alert">
              {error || accessError}
            </p>
          )}

          <section className="public-room-browser" aria-labelledby="public-rooms-title">
            <header>
              <div>
                <small>无需班次码 · 只读访问</small>
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
                    onClick={() => onVisitPublicCampaign(campaign.id)}
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
    </div>
  );
}
