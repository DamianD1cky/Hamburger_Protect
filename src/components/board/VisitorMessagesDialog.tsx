import { Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type { VisitorMessage } from "../../features/campaign/domain/types";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { MenuPopover } from "./MenuPopover";

/**
 * Apple HIG 访客留言浮层：清晰的表单分组卡 + 气泡流列表。
 */
export function VisitorMessagesDialog({
  anchor,
  messages,
  defaultName,
  canModerate,
  onClose,
  onSubmit,
  onDelete,
  loading = false,
  loadError = "",
}: {
  anchor: HTMLElement | null;
  messages: VisitorMessage[];
  defaultName: string;
  canModerate: boolean;
  onClose: () => void;
  onSubmit: (displayName: string, body: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  loading?: boolean;
  loadError?: string;
}) {
  const [displayName, setDisplayName] = useState(
    defaultName === "访客" ? "" : defaultName,
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const imeGuard = useImeEnterGuard();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !displayName.trim() || !body.trim()) return;
    setBusy("submit");
    setError("");
    try {
      await onSubmit(displayName.trim(), body.trim());
      setBody("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("VISITOR_MESSAGE_RATE_LIMIT")
          ? "留言太快了，请等待 30 秒后再发。"
          : message.includes("PUBLIC_CAMPAIGN_REQUIRED")
            ? "房间已关闭公开参观，无法继续留言。"
            : "留言发布失败，请稍后重试。",
      );
    } finally {
      setBusy("");
    }
  };

  const remove = async (messageId: string) => {
    if (busy) return;
    setBusy(messageId);
    setError("");
    try {
      await onDelete(messageId);
    } catch {
      setError("留言删除失败，请刷新后重试。");
    } finally {
      setBusy("");
    }
  };

  return (
    <MenuPopover
      anchor={anchor}
      id="visitor-messages-menu"
      width={440}
      title={`访客留言（${messages.length}）`}
      className="visitor-messages-dialog hig-popover"
      onClose={onClose}
    >
      <div className="hig-editor-sections">
        <form
          className="hig-editor-group visitor-message-form"
          onSubmit={submit}
          {...imeGuard}
        >
          <span className="hig-section-label">写下留言</span>
          <label className="field">
            <span>署名</span>
            <input
              aria-label="署名"
              required
              maxLength={40}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="输入你的称呼…"
              disabled={Boolean(busy)}
            />
          </label>
          <label className="field">
            <span>留言内容</span>
            <textarea
              aria-label="留言"
              required
              maxLength={500}
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="写下对这个房间的留言…"
              disabled={Boolean(busy)}
            />
          </label>
          <div className="hig-form-right-action">
            <button
              type="submit"
              className="publish-button"
              disabled={Boolean(busy) || !displayName.trim() || !body.trim()}
            >
              <Send aria-hidden="true" />
              {busy === "submit" ? "发布中…" : "发布留言"}
            </button>
          </div>
        </form>

        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}

        <div className="hig-popover-section">
          <span className="hig-section-label">全部留言</span>
          {loading && (
            <div className="hig-empty-card" role="status">
              正在读取留言…
            </div>
          )}
          {loadError && (
            <p className="access-error" role="alert">
              留言读取失败，请稍后重试。
            </p>
          )}
          {!loading && !loadError && !messages.length && (
            <div className="hig-empty-card">还没有访客留言</div>
          )}
          {messages.length > 0 && (
            <div className="hig-grouped-list">
              {messages.map((message) => (
                <article key={message.id} className="hig-visitor-item">
                  <span className="hig-roster-avatar" aria-hidden="true">
                    {message.displayName.slice(0, 1)}
                  </span>
                  <div className="hig-visitor-copy">
                    <header>
                      <strong>{message.displayName}</strong>
                      <time dateTime={message.createdAt}>
                        {formatNoteTimestamp(message.createdAt)}
                      </time>
                    </header>
                    <p>{message.body}</p>
                  </div>
                  {canModerate && (
                    <button
                      type="button"
                      className="visibility-toggle is-danger"
                      onClick={() => void remove(message.id)}
                      disabled={Boolean(busy)}
                      aria-label={`删除${message.displayName}的留言`}
                      title="删除留言"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </article>
              ))}
            </div>
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
