import { useState, type FormEvent } from "react";
import type {
  CampaignBoard,
  ResourceDraft,
  ResourceItem,
} from "../../features/campaign/domain/types";
import {
  resourceGroups,
  resourceLabels,
} from "../../features/campaign/domain/resources";
import { PaperDialog } from "../composer/PaperDialog";

interface ResourceRowProps {
  item?: ResourceItem;
  group: number;
  onSave: (draft: ResourceDraft, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onBusy: (busy: boolean) => void;
  onDone?: () => void;
}

function ResourceRow({
  item,
  group,
  onSave,
  onDelete,
  onBusy,
  onDone,
}: ResourceRowProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? "");
  const [status, setStatus] = useState(item?.status ?? "ok");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setMessage("");
    try {
      await operation();
      setMessage("已保存");
      onDone?.();
    } catch {
      setMessage("保存失败，请检查网络或权限后重试，草稿已保留。");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void run(() =>
      onSave(
        { name: name.trim(), quantity: quantity.trim(), status, group },
        item?.id,
      ),
    );
  };
  return (
    <form
      className="resource-edit-row"
      onSubmit={save}
      aria-label={item ? `编辑物资：${item.name}` : "新增物资"}
    >
      <fieldset className="editor-fields" disabled={busy}>
        <label className="field">
          <span>名称</span>
          <input
            aria-label="物资名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </label>
        <div className="resource-edit-fields">
          <label className="field">
            <span>数量与单位</span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              maxLength={80}
              placeholder="例如：12 瓶"
            />
          </label>
          <label className="field">
            <span>状态</span>
            <select
              aria-label="物资状态"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as ResourceItem["status"])
              }
            >
              {Object.entries(resourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="resource-edit-actions">
          {item && (
            <button
              type="button"
              className="text-button danger-button"
              onClick={() => {
                if (!confirmDelete) setConfirmDelete(true);
                else void run(() => onDelete(item.id));
              }}
            >
              {confirmDelete ? "确认删除条目" : "删除条目"}
            </button>
          )}
          {confirmDelete && (
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirmDelete(false)}
            >
              保留
            </button>
          )}
          {!item && onDone && (
            <button type="button" className="text-button" onClick={onDone}>
              取消新增
            </button>
          )}
          <button type="submit" className="publish-button">
            {busy ? "保存中…" : "保存条目"}
          </button>
        </div>
      </fieldset>
      {message && (
        <p
          className={message === "已保存" ? "resource-saved" : "access-error"}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}

export function ResourceSheetDialog({
  group,
  board,
  onClose,
  onSave,
  onDelete,
}: {
  group: number;
  board: CampaignBoard;
  onClose: () => void;
  onSave: ResourceRowProps["onSave"];
  onDelete: ResourceRowProps["onDelete"];
}) {
  const items = board.resources.filter((item) => item.group === group);
  const sheet = resourceGroups.find((sheet) => sheet.id === group)!;
  const canEdit =
    board.viewer.role !== "observer" && board.campaign.status === "active";
  const [adding, setAdding] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const onBusy = (busy: boolean) =>
    setBusyCount((count) => count + (busy ? 1 : -1));
  return (
    <PaperDialog
      title={sheet.title}
      kicker="物资便签"
      className="resource-dialog"
      onClose={() => {
        if (!busyCount) onClose();
      }}
    >
      <div className={`resource-sheet-body sheet-${sheet.color}`}>
        <p className="editor-help">
          {canEdit
            ? "所有在岗员工都可以登记名称、数量和状态，修改后保存条目。"
            : "当前物资清单为只读。"}
        </p>
        {!items.length && !adding && (
          <p className="sheet-empty">
            便签还是空白的
            {canEdit ? "，点击下方添加第一条。" : "，等待 GM 登记。"}
          </p>
        )}
        {canEdit ? (
          items.map((item) => (
            <ResourceRow
              key={item.id}
              item={item}
              group={group}
              onSave={onSave}
              onDelete={onDelete}
              onBusy={onBusy}
            />
          ))
        ) : (
          <ul className="resource-read-list">
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.quantity || "未登记数量"}</span>
                <span>{resourceLabels[item.status]}</span>
              </li>
            ))}
          </ul>
        )}
        {canEdit &&
          (adding ? (
            <ResourceRow
              group={group}
              onSave={onSave}
              onDelete={onDelete}
              onBusy={onBusy}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button
              className="text-button add-resource"
              type="button"
              onClick={() => setAdding(true)}
            >
              ＋ 添加条目
            </button>
          ))}
      </div>
      <footer className="composer-actions">
        <span className="action-spacer" />
        <button
          type="button"
          className="text-button"
          disabled={busyCount > 0}
          onClick={onClose}
        >
          完成
        </button>
      </footer>
    </PaperDialog>
  );
}
