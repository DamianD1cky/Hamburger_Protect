import { Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatNoteTimestamp } from "../../features/campaign/domain/noteMetadata";
import type { VisitorMessage } from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

export function VisitorMessagesDialog({
  messages,
  defaultName,
  canModerate,
  onClose,
  onSubmit,
  onDelete,
}: {
  messages: VisitorMessage[];
  defaultName: string;
  canModerate: boolean;
  onClose: () => void;
  onSubmit: (displayName: string, body: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(
    defaultName === "访客" ? "" : defaultName,
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

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
    <PaperDialog
      title={`访客留言 · ${messages.length} 条`}
      className="visitor-messages-dialog"
      onClose={onClose}
    >
      <div className="visitor-layout">
      <form className="visitor-message-form" onSubmit={submit}>
        <label className="field">
          <span>署名</span>
          <input
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="例：隔壁夜班顾客"
            disabled={Boolean(busy)}
          />
        </label>
        <label className="field">
          <span>留言</span>
          <textarea
            required
            maxLength={500}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="写下对这个房间的留言"
            disabled={Boolean(busy)}
          />
        </label>
        <button
          type="submit"
          className="publish-button"
          disabled={Boolean(busy) || !displayName.trim() || !body.trim()}
        >
          <Send aria-hidden="true" />
          {busy === "submit" ? "发布中…" : "发布留言"}
        </button>
      </form>
      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
      <div className="visitor-message-list">
        {!messages.length && <p className="editor-help">还没有访客留言。</p>}
        {messages.map((message) => (
          <article key={message.id} className="visitor-message">
            <header>
              <strong>{message.displayName}</strong>
              <time dateTime={message.createdAt}>
                {formatNoteTimestamp(message.createdAt)}
              </time>
            </header>
            <p>{message.body}</p>
            {canModerate && (
              <button
                type="button"
                className="icon-button danger-button"
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
      </div>
    </PaperDialog>
  );
}
