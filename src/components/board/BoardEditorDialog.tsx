import { useState, type FormEvent } from "react";
import type {
  CampaignBoard,
  ChecklistDraft,
} from "../../features/campaign/domain/types";
import {
  burgerIndexInfo,
  burgerIndexSteps,
} from "../../features/campaign/domain/burgerIndex";
import { PaperDialog } from "../composer/PaperDialog";

export type BoardEditorKind = "checklist" | "index";
export function BoardEditorDialog({
  kind,
  board,
  onClose,
  onSaveChecklist,
  onDeleteChecklist,
  onSetIndex,
}: {
  kind: BoardEditorKind;
  board: CampaignBoard;
  onClose: () => void;
  onSaveChecklist: (draft: ChecklistDraft, id?: string) => Promise<unknown>;
  onDeleteChecklist: (id: string) => Promise<unknown>;
  onSetIndex: (value: number) => Promise<unknown>;
}) {
  const items = board.checklist;
  const [id, setId] = useState(items[0]?.id ?? "");
  const [name, setName] = useState(items[0]?.label ?? "");
  const [index, setIndex] = useState(board.campaign.burgerIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const info = burgerIndexInfo(index);
  const select = (value: string) => {
    setId(value);
    setName(items.find((item) => item.id === value)?.label ?? "");
    setConfirmDelete(false);
    setError("");
  };
  const run = async (operation: () => Promise<unknown>) => {
    if (!editable || busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      onClose();
    } catch {
      setError("操作未完成，请检查网络或权限后重试。未保存的内容已保留。");
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === "index") void run(() => onSetIndex(index));
    else if (name.trim())
      void run(() => onSaveChecklist({ label: name.trim() }, id || undefined));
  };
  return (
    <PaperDialog
      title={kind === "index" ? "调整汉堡屋指数" : "编辑每日检查清单"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset className="editor-fields" disabled={busy || !editable}>
          {kind === "index" ? (
            <>
              <p className="editor-help">
                由 GM 根据餐厅状况手动调整，游戏初始位置为黄2。
              </p>
              <div
                className="index-picker"
                role="radiogroup"
                aria-label="汉堡屋指数"
              >
                {burgerIndexSteps.map((step) => (
                  <label
                    key={step.value}
                    data-color={step.color}
                    className={index === step.value ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="burger-index"
                      value={step.value}
                      checked={index === step.value}
                      onChange={() => setIndex(step.value)}
                    />
                    {step.label}
                  </label>
                ))}
              </div>
              <p className="index-summary">
                <strong>
                  {info.label} · {info.service}
                </strong>
                <br />
                {info.description}
                <br />
                {info.bonus}
              </p>
              {index === 1 && (
                <p className="access-error">
                  红1：立即败北。请由 GM 处理战役结局。
                </p>
              )}
            </>
          ) : (
            <>
              <label className="field">
                <span>选择条目</span>
                <select value={id} onChange={(e) => select(e.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                  <option value="">＋ 新增检查项</option>
                </select>
              </label>
              <label className="field">
                <span>检查内容</span>
                <textarea
                  aria-label="检查内容"
                  rows={4}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                  required
                />
              </label>
            </>
          )}
        </fieldset>
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <footer className="composer-actions">
          {kind === "checklist" && id && editable && (
            <button
              className="text-button danger-button"
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirmDelete) setConfirmDelete(true);
                else void run(() => onDeleteChecklist(id));
              }}
            >
              {confirmDelete ? "确认移除" : "移除"}
            </button>
          )}
          <span className="action-spacer" />
          <button
            className="text-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="publish-button"
            type="submit"
            disabled={busy || !editable}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </PaperDialog>
  );
}
