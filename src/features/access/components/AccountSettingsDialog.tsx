import { useRef, useState } from "react";
import { PaperDialog } from "../../../components/composer/PaperDialog";
import { useImeEnterGuard } from "../../../hooks/useImeEnterGuard";
import type { AppSession } from "../domain/types";
import { getAccessErrorMessage, PASSWORD_MIN_LENGTH } from "../domain/account";
import {
  changePassword,
  signOutOtherDevices,
  updateAccountName,
} from "../data/accountSettings";
import { PasswordField } from "./PasswordField";

export function AccountSettingsDialog({
  session,
  onClose,
  onUpdated,
}: {
  session: AppSession;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [nickname, setNickname] = useState(session.user.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const imeGuard = useImeEnterGuard();
  const run = async (action: () => Promise<void>, success: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (reason) {
      setError(getAccessErrorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <PaperDialog
      title="账号设置"
      onClose={onClose}
      className="account-settings-dialog"
    >
      <p className="account-settings-hint">
        登录账号：{session.user.email?.split("@")[0]}
      </p>
      {(error || notice) && (
        <div className="account-settings-feedback">
          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="account-settings-success" role="status">
              {notice}
            </p>
          )}
        </div>
      )}
      <form
        className="access-form"
        {...imeGuard}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await updateAccountName(nickname);
            await onUpdated();
          }, "账号昵称已更新。");
        }}
      >
        <label>
          <span>账号昵称</span>
          <input
            required
            maxLength={32}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            autoComplete="nickname"
          />
        </label>
        <small>昵称用于账号展示，各场战役的角色名分别保存。</small>
        <button className="access-submit" disabled={busy}>
          保存昵称
        </button>
      </form>
      <form
        className="access-form account-settings-section"
        {...imeGuard}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await changePassword(currentPassword, password, confirmation);
            setCurrentPassword("");
            setPassword("");
            setConfirmation("");
            await onUpdated();
          }, "密码已更新，请在密码管理器中保存新密码。");
        }}
      >
        <h2>修改密码</h2>
        <PasswordField
          label="当前密码"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <PasswordField
          label="新密码"
          required
          autoComplete="new-password"
          value={password}
          minLength={PASSWORD_MIN_LENGTH}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordField
          label="确认新密码"
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <small>至少 15 个字符；支持空格和长口令，最多 72 个 UTF-8 字节。</small>
        <button className="access-submit" disabled={busy}>
          更新密码
        </button>
      </form>
      <section className="account-settings-section">
        <h2>其他设备</h2>
        <p>
          撤销其他设备的登录会话，保留当前设备。已签发的访问令牌在到期前仍可能有效。
        </p>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("退出其他设备？当前设备会继续保持登录。"))
              void run(
                signOutOtherDevices,
                "已撤销其他设备的续期资格，现有访问令牌到期后需要重新登录。",
              );
          }}
        >
          退出其他设备
        </button>
      </section>
    </PaperDialog>
  );
}
