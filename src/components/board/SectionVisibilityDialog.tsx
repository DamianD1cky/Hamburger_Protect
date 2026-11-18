import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  coreCampaignSections,
  sectionTitle,
} from "../../features/campaign/domain/campaignSettings";
import {
  ATOMIC_PANEL_TEMPLATES,
  type BoardCustomPanel,
} from "../../features/campaign/domain/customPanels";
import type {
  CampaignBoard,
  CampaignSectionKey,
  CampaignSettingsUpdate,
} from "../../features/campaign/domain/types";
import { settingsUpdate } from "../../features/campaign/domain/settingsUpdate";
import { MenuPopover } from "./MenuPopover";

/**
 * 管理初始核心板块（成员名册、事件钟、行动记录、便签）与由原子能力自由拼装的业务展板。
 */
export function SectionVisibilityDialog({
  board,
  onClose,
  onSave,
  onCreateCustomPanel,
  onInstantiateAtomicPanel,
  onEditCustomPanel,
  onDeleteCustomPanel,
  anchor,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<unknown>;
  onCreateCustomPanel?: () => void;
  onInstantiateAtomicPanel?: (panel: BoardCustomPanel) => Promise<unknown>;
  onEditCustomPanel?: (panel: BoardCustomPanel) => void;
  onDeleteCustomPanel?: (panelId: string) => void;
  anchor: HTMLElement;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const hidden = board.settings.hiddenSections;

  const toggle = async (key: CampaignSectionKey) => {
    if (busy || !editable) return;
    setBusy(key);
    setError("");
    try {
      await onSave(
        settingsUpdate(board, {
          hiddenSections: { [key]: !hidden.includes(key) },
        }),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "切换失败，请检查权限后重试。",
      );
    } finally {
      setBusy(null);
    }
  };

  const quickAssemble = async (
    tpl: (typeof ATOMIC_PANEL_TEMPLATES)[number],
  ) => {
    if (busy || !editable || !onInstantiateAtomicPanel) return;
    setBusy(tpl.id);
    setError("");
    try {
      await onInstantiateAtomicPanel(tpl.create());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加原子板块失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <MenuPopover
      anchor={anchor}
      id="board-visibility-menu"
      title="核心板块与原子展板"
      className="section-visibility-dialog"
      onClose={onClose}
    >
      <div className="section-visibility-list">
        {coreCampaignSections.map((section) => {
          const isHidden = hidden.includes(section.id);
          const custom = sectionTitle(
            section.id,
            board.settings.sectionTitles,
          );
          return (
            <div
              className={
                isHidden
                  ? "section-visibility-row is-hidden"
                  : "section-visibility-row"
              }
              key={section.id}
            >
              <span className="section-visibility-name">
                <strong>{custom}</strong>
                {custom !== section.defaultTitle && (
                  <small>原名：{section.defaultTitle}</small>
                )}
              </span>
              <button
                type="button"
                className={
                  isHidden
                    ? "visibility-toggle is-hidden"
                    : "visibility-toggle"
                }
                onClick={() => void toggle(section.id)}
                disabled={!editable || busy !== null}
                aria-label={isHidden ? "恢复" + custom : "隐藏" + custom}
                title={isHidden ? "恢复显示" : "隐藏区块"}
              >
                {busy === section.id ? (
                  <span aria-hidden="true">…</span>
                ) : isHidden ? (
                  <EyeOff />
                ) : (
                  <Eye />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}

      {editable && onCreateCustomPanel && (
        <div className="custom-panel-visibility-group">
          <div className="custom-panel-visibility-header">
            <strong>原子能力展板（{board.settings.customPanels.length}）</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onClose();
                onCreateCustomPanel();
              }}
            >
              <Plus aria-hidden="true" />
              自由拼装
            </button>
          </div>

          {onInstantiateAtomicPanel && (
            <div className="atomic-template-quick-list">
              {ATOMIC_PANEL_TEMPLATES.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  className="atomic-template-chip"
                  disabled={busy !== null}
                  onClick={() => void quickAssemble(tpl)}
                >
                  <Plus aria-hidden="true" />
                  <span>{tpl.label}</span>
                </button>
              ))}
            </div>
          )}

          {board.settings.customPanels.map((panel) => (
            <div className="section-visibility-row" key={panel.id}>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onClose();
                  onEditCustomPanel?.(panel);
                }}
              >
                {panel.title}
              </button>
              {onDeleteCustomPanel && (
                <button
                  type="button"
                  className="visibility-toggle"
                  aria-label={`移除自由展板${panel.title}`}
                  title="移除自由展板"
                  onClick={() => onDeleteCustomPanel(panel.id)}
                >
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <footer className="composer-actions">
        <button type="button" className="publish-button" onClick={onClose}>
          完成
        </button>
      </footer>
    </MenuPopover>
  );
}
