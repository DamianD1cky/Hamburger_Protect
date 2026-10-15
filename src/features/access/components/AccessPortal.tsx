import type { StoredSession } from "@nhost/nhost-js";
import {
  ArrowRight,
  BadgeCheck,
  ChefHat,
  KeyRound,
  Mail,
  ShieldAlert,
  Store,
  UserRound,
  Wrench,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { EmployeePosition } from "../../campaign/domain/types";
import { getAccessErrorMessage } from "../data/nhostCampaignAccess";

const employeePositions: Array<{
  value: Exclude<EmployeePosition, "店长">;
  label: string;
}> = [
  { value: "厨师", label: "厨师 · 继续出餐或利用厨房设备" },
  { value: "维修师", label: "维修师 · 电路、设备与应急电源" },
  { value: "服务员", label: "服务员 · 物资、顾客与临时防线" },
  { value: "顾客", label: "顾客 · 搬运、建议或等待订单" },
];

type PortalMode = "employee" | "gm";
type VerificationState = "idle" | "verifying" | "failed";

interface AccessPortalProps {
  session: StoredSession | null;
  verificationState: VerificationState;
  verificationError: string;
  onSendMagicLink: (email: string, displayName: string) => Promise<void>;
  onCreateCampaign: (name: string, characterName: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onJoinCampaign: (input: {
    joinCode: string;
    characterName: string;
    jobTitle: Exclude<EmployeePosition, "店长">;
  }) => Promise<void>;
}

export function AccessPortal({
  session,
  verificationState,
  verificationError,
  onSendMagicLink,
  onCreateCampaign,
  onSignOut,
  onJoinCampaign,
}: AccessPortalProps) {
  const regularUser = Boolean(session?.user && !session.user.isAnonymous);
  const [mode, setMode] = useState<PortalMode>(regularUser ? "gm" : "employee");
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const [gmName, setGmName] = useState(session?.user?.displayName ?? "");
  const [campaignName, setCampaignName] = useState("汉○王夜班危机营业");
  const [characterName, setCharacterName] = useState(
    session?.user?.displayName ?? "",
  );
  const [joinCode, setJoinCode] = useState("");
  const [jobTitle, setJobTitle] = useState<Exclude<EmployeePosition, "店长">>(
    () => {
      const stored = session?.user?.metadata?.employeePosition;
      return stored === "厨师" ||
        stored === "维修师" ||
        stored === "服务员" ||
        stored === "顾客"
        ? stored
        : "服务员";
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mailSent, setMailSent] = useState(false);

  const view = useMemo(() => {
    if (verificationState !== "idle") return "verification";
    if (regularUser) return "create";
    return mode;
  }, [mode, regularUser, verificationState]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (operationError) {
      setError(getAccessErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  };

  const submitMagicLink = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await onSendMagicLink(email, gmName);
      setMailSent(true);
    });
  };

  const submitCampaign = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onCreateCampaign(campaignName, gmName));
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onJoinCampaign({ joinCode, characterName, jobTitle }));
  };

  return (
    <div className="access-screen">
      <div className="access-scene" aria-hidden="true" />
      <div className="access-shade" aria-hidden="true" />

      <header className="access-brand">
        <p className="access-kicker">汉○王员工专用 · 内部文件</p>
        <h1>危机营业<br />签到处</h1>
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
                {view === "create"
                  ? "建立本次夜班"
                  : view === "verification"
                    ? "核验值班身份"
                    : view === "gm"
                      ? "值班身份认证"
                      : "员工报到单"}
              </h2>
            </div>
            <span className="manual-file-number">BK-ZM-09</span>
          </div>

          {!regularUser && verificationState === "idle" && (
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

          {view === "verification" && (
            <section className="verification-state" aria-live="polite">
              {verificationState === "verifying" ? (
                <>
                  <span className="verification-spinner" aria-hidden="true" />
                  <h3>正在核对总部值班记录</h3>
                  <p>通信线路仍然正常。至少目前如此。</p>
                </>
              ) : (
                <>
                  <ShieldAlert aria-hidden="true" />
                  <h3>值班身份核验失败</h3>
                  <p>{verificationError}</p>
                  <button type="button" onClick={() => window.location.assign(window.location.pathname)}>
                    重新签到
                  </button>
                </>
              )}
            </section>
          )}

          {view === "employee" && (
            <form className="access-form" onSubmit={submitJoin}>
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
                <span>当前岗位</span>
                <select
                  value={jobTitle}
                  onChange={(event) =>
                    setJobTitle(
                      event.target.value as Exclude<EmployeePosition, "店长">,
                    )
                  }
                >
                  {employeePositions.map((position) => (
                    <option key={position.value} value={position.value}>
                      {position.label}
                    </option>
                  ))}
                </select>
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
                      event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
                    )
                  }
                  placeholder="A1B2C3"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>
              <button className="access-submit" type="submit" disabled={busy}>
                {busy ? "正在分配岗位" : "确认报到并进入餐厅"}
                {!busy && <ArrowRight aria-hidden="true" />}
              </button>
            </form>
          )}

          {view === "gm" && (
            <form className="access-form" onSubmit={submitMagicLink}>
              <label>
                <span>值班店长姓名</span>
                <input
                  required
                  maxLength={32}
                  value={gmName}
                  onChange={(event) => setGmName(event.target.value)}
                  placeholder="例：周店长"
                  autoComplete="name"
                />
              </label>
              <label>
                <span>公司邮箱</span>
                <div className="access-input-icon">
                  <Mail aria-hidden="true" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="manager@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>
              <button className="access-submit" type="submit" disabled={busy || mailSent}>
                {mailSent ? "值班链接已发送" : busy ? "正在联系总部" : "发送值班登录链接"}
                {mailSent ? <BadgeCheck aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              </button>
              {mailSent && (
                <p className="form-notice">
                  请在当前浏览器打开邮件中的链接。授权码将在 5 分钟后失效。
                </p>
              )}
            </form>
          )}

          {view === "create" && (
            <form className="access-form" onSubmit={submitCampaign}>
              <div className="manager-confirmed">
                <BadgeCheck aria-hidden="true" />
                <span>总部已确认：{session?.user?.email}</span>
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
              <button className="access-signout" type="button" onClick={() => void onSignOut()}>
                退出店长账号
              </button>
            </form>
          )}

          {(error || (verificationState === "failed" && verificationError)) &&
            view !== "verification" && (
              <p className="access-error" role="alert">
                {error || verificationError}
              </p>
            )}

          {view !== "verification" && (
            <footer className="manual-rules">
              <span><ChefHat aria-hidden="true" />没有任务时，制作汉堡</span>
              <span><Wrench aria-hidden="true" />设施用途不限于标签</span>
              <span><ShieldAlert aria-hidden="true" />异常顾客不办会员</span>
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}
