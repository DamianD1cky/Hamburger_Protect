import { Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  CampaignBoard,
  ChecklistDraft,
} from "../../features/campaign/domain/types";
import {
  burgerIndexInfo,
  burgerIndexSteps,
} from "../../features/campaign/domain/burgerIndex";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { PaperDialog } from "../composer/PaperDialog";

export type BoardEditorKind = "checklist" | "index";
export function BoardEditorDialog({
  kind,
  board,
  onClose,
  onSaveChecklist,
  onDeleteChecklist,
  onSaveCategory,
  onDeleteCategory,
  onSetIndex,
}: {
  kind: BoardEditorKind;
  board: CampaignBoard;
  onClose: () => void;
  onSaveChecklist: (draft: ChecklistDraft, id?: string) => Promise<unknown>;
  onDeleteChecklist: (id: string) => Promise<unknown>;
  onSaveCategory: (name: string, id?: string) => Promise<unknown>;
  onDeleteCategory: (id: string) => Promise<unknown>;
  onSetIndex: (value: number) => Promise<unknown>;
}) {
  const items = board.checklist;
  // "Edit" and "create" are separate modes with separate drafts: picking an
  // item only ever happens in edit mode, and the text field there always
  // belongs to the picked item. In create mode the fields start empty and
  // saving always creates a new item.
  const [mode, setMode] = useState<"edit" | "create">(
    items.length ? "edit" : "create",
  );
  const [id, setId] = useState(items[0]?.id ?? "");
  const [name, setName] = useState(items[0]?.label ?? "");
  const [categoryId, setCategoryId] = useState(items[0]?.categoryId ?? "");
  const [catMode, setCatMode] = useState<"edit" | "create">(
    board.checklistCategories.length ? "edit" : "create",
  );
  const [managedCategoryId, setManagedCategoryId] = useState(
    board.checklistCategories[0]?.id ?? "",
  );
  const [categoryName, setCategoryName] = useState(
    board.checklistCategories[0]?.name ?? "",
  );
  const [index, setIndex] = useState(board.campaign.burgerIndex);
  const imeGuard = useImeEnterGuard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const info = burgerIndexInfo(index);
  const select = (value: string) => {
    setId(value);
    const selected = items.find((item) => item.id === value);
    setName(selected?.label ?? "");
    setCategoryId(selected?.categoryId ?? "");
    setConfirmDelete(false);
    setError("");
  };
  const switchMode = (next: "edit" | "create") => {
    setConfirmDelete(false);
    setError("");
    if (next === "create") {
      setMode("create");
      setId("");
      setName("");
      setCategoryId("");
    } else if (items.length) {
      setMode("edit");
      select(id || items[0].id);
    }
  };
  const switchCatMode = (next: "edit" | "create") => {
    setError("");
    if (next === "create") {
      setCatMode("create");
      setManagedCategoryId("");
      setCategoryName("");
    } else if (board.checklistCategories.length) {
      setCatMode("edit");
      const target =
        board.checklistCategories.find(
          (category) => category.id === managedCategoryId,
        ) ?? board.checklistCategories[0];
      setManagedCategoryId(target.id);
      setCategoryName(target.name);
    }
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
      void run(() =>
        onSaveChecklist(
          { label: name.trim(), categoryId: categoryId || null },
          mode === "edit" ? id || undefined : undefined,
        ),
      );
  };
  return (
    <PaperDialog
      title={kind === "index" ? "调整汉堡屋指数" : "编辑每日检查清单"}
      className={
        kind === "index" ? "editor-dialog index-dialog" : "editor-dialog checklist-dialog"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} {...imeGuard}>
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
                  {info.label}（{info.service}）
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
            <div className="checklist-columns">
              <div className="checklist-main">
              <div
                className="compose-type checklist-mode"
                role="tablist"
                aria-label="检查项操作"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "edit"}
                  className={mode === "edit" ? "is-active" : ""}
                  disabled={!items.length}
                  onClick={() => switchMode("edit")}
                >
                  <Pencil aria-hidden="true" />
                  修改条目
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "create"}
                  className={mode === "create" ? "is-active" : ""}
                  onClick={() => switchMode("create")}
                >
                  <Plus aria-hidden="true" />
                  新增条目
                </button>
              </div>
              {mode === "edit" && (
                <div
                  className="checklist-item-list"
                  role="listbox"
                  aria-label="选择要修改的条目"
                >
                  {items.map((item) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={id === item.id}
                      key={item.id}
                      className={id === item.id ? "is-selected" : ""}
                      onClick={() => select(item.id)}
                    >
                      <span>{item.label}</span>
                      <small>
                        {board.checklistCategories.find(
                          (category) => category.id === item.categoryId,
                        )?.name ?? "未分类"}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              <label className="field">
                <span>检查内容</span>
                <textarea
                  aria-label="检查内容"
                  rows={3}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                  required
                  autoFocus={mode === "create"}
                />
              </label>
              <label className="field">
                <span>所属分类</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">未分类</option>
                  {board.checklistCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              </div>
              <div className="category-manager">
                <div
                  className="compose-type checklist-mode"
                  role="tablist"
                  aria-label="分类操作"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={catMode === "edit"}
                    className={catMode === "edit" ? "is-active" : ""}
                    disabled={!board.checklistCategories.length}
                    onClick={() => switchCatMode("edit")}
                  >
                    <Pencil aria-hidden="true" />
                    修改分类
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={catMode === "create"}
                    className={catMode === "create" ? "is-active" : ""}
                    onClick={() => switchCatMode("create")}
                  >
                    <Plus aria-hidden="true" />
                    新建分类
                  </button>
                </div>
                {catMode === "edit" && (
                  <label className="field">
                    <span>选择分类</span>
                    <select
                      value={managedCategoryId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setManagedCategoryId(value);
                        setCategoryName(
                          board.checklistCategories.find(
                            (category) => category.id === value,
                          )?.name ?? "",
                        );
                      }}
                    >
                      {board.checklistCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>分类名称</span>
                  <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    maxLength={40}
                    placeholder="例：开店准备"
                  />
                </label>
                <div className="category-actions">
                  {catMode === "edit" && managedCategoryId && (
                    <button
                      className="text-button danger-button"
                      type="button"
                      onClick={() =>
                        void run(() => onDeleteCategory(managedCategoryId))
                      }
                    >
                      删除分类
                    </button>
                  )}
                  <button
                    className="text-button"
                    type="button"
                    disabled={!categoryName.trim()}
                    onClick={() =>
                      void run(() =>
                        onSaveCategory(
                          categoryName.trim(),
                          catMode === "edit"
                            ? managedCategoryId || undefined
                            : undefined,
                        ),
                      )
                    }
                  >
                    {catMode === "edit" ? "保存分类" : "新增分类"}
                  </button>
                </div>
                <p className="editor-help">
                  删除分类会把其中的检查项移到「未分类」，不会删除内容或完成状态。
                </p>
              </div>
            </div>
          )}
        </fieldset>
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <footer className="composer-actions">
          {kind === "checklist" && mode === "edit" && id && editable && (
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
            {busy
              ? "保存中…"
              : kind === "checklist"
                ? mode === "create"
                  ? "新增条目"
                  : "保存修改"
                : "保存"}
          </button>
        </footer>
      </form>
    </PaperDialog>
  );
}
