import type { StoredSession } from "@nhost/nhost-js";
import {
  ArrowRight,
  BadgeCheck,
  ChefHat,
  KeyRound,
  ShieldAlert,
  Store,
  UserPlus,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { EmployeePosition } from "../../campaign/domain/types";
import {
  getAccessErrorMessage,
  GM_PASSWORD_MIN_LENGTH,
} from "../data/nhostCampaignAccess";

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
type GmMode = "signin" | "signup";

interface AccessPortalProps {
  session: StoredSession | null;
  accessError: string;
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
    jobTitle: Exclude<EmployeePosition, "店长">;
  }) => Promise<void>;
}

export function AccessPortal({
  session,
  accessError,
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

  useEffect(() => {
    if (!regularUser) return;
    setGmName(
      (current) => current || session?.user?.displayName || "",
    );
  }, [regularUser, session?.user?.displayName]);

  const view = useMemo(() => {
    if (regularUser) return "create";
    return mode;
  }, [mode, regularUser]);

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
                  : view === "gm"
                    ? gmMode === "signup"
                      ? "登记店长账号"
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
            <form className="access-form" onSubmit={submitGm}>
              <label>
                <span>店长账号名</span>
                <input
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9_-]{3,20}"
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
                    ? "正在登记总部档案"
                    : "正在核对店长身份"
                  : gmMode === "signup"
                    ? "注册并开始值班"
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
                  : "还没有店长账号？立即注册"}
              </button>
            </form>
          )}

          {view === "create" && (
            <form className="access-form" onSubmit={submitCampaign}>
              <div className="manager-confirmed">
                <BadgeCheck aria-hidden="true" />
                <span>总部已确认店长身份：{session?.user?.displayName}</span>
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

          {(error || accessError) && (
            <p className="access-error" role="alert">
              {error || accessError}
            </p>
          )}

          <footer className="manual-rules">
            <span><ChefHat aria-hidden="true" />没有任务时，制作汉堡</span>
            <span><Wrench aria-hidden="true" />设施用途不限于标签</span>
            <span><ShieldAlert aria-hidden="true" />异常顾客不办会员</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
