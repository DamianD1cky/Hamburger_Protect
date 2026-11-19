import { Layers, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
 * Apple HIG 板块与原子组件库浮层：
 * 使用分段控制器清晰拆分「桌面板块管理」与「原子拼装模板库」，消除长列表滚屏负担。
 */
export function SectionVisibilityDialog({
  board,
  onClose,
  onSave,
  onCreateCustomPanel,
  onInstantiateAtomicPanel,
  onEditCustomPanel,
  onToggleCustomPanelVisibility,
  onDeleteCustomPanel,
  anchor,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<unknown>;
  onCreateCustomPanel?: () => void;
  onInstantiateAtomicPanel?: (panel: BoardCustomPanel) => Promise<unknown>;
  onEditCustomPanel?: (panel: BoardCustomPanel) => void;
  onToggleCustomPanelVisibility?: (
    panelId: string,
    hidden: boolean,
  ) => Promise<unknown>;
  onDeleteCustomPanel?: (panelId: string) => void;
  anchor: HTMLElement;
}) {
  const [tab, setTab] = useState<"active" | "templates">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const hidden = board.settings.hiddenSections;
  const hiddenPanelIds = new Set(
    board.settings.styleTokens?.hiddenPanelIds ?? [],
  );

  const togglePanel = async (panelId: string) => {
    if (busy || !editable || !onToggleCustomPanelVisibility) return;
    setBusy(`panel:${panelId}`);
    setError("");
    try {
      await onToggleCustomPanelVisibility(panelId, !hiddenPanelIds.has(panelId));
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "切换板块显示失败，请重试。",
      );
    } finally {
      setBusy(null);
    }
  };

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
      setError(err instanceof Error ? err.message : "添加板块失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <MenuPopover
      anchor={anchor}
      id="board-visibility-menu"
      width={390}
      title="板块与原子组件库"
      className="section-visibility-dialog hig-popover"
      onClose={onClose}
    >
      <div
        className="hig-inspector-segmented"
        role="tablist"
        aria-label="板块库视图"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={tab === "active" ? "is-active" : ""}
          onClick={() => setTab("active")}
        >
          <Layers aria-hidden="true" />
          桌面板块（{board.settings.customPanels.length}）
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "templates"}
          className={tab === "templates" ? "is-active" : ""}
          onClick={() => setTab("templates")}
        >
          <Sparkles aria-hidden="true" />
          原子拼装模板（{ATOMIC_PANEL_TEMPLATES.length}）
        </button>
      </div>

      {tab === "active" ? (
        <div className="hig-editor-sections">
          {editable && onCreateCustomPanel && (
            <div className="hig-popover-section">
              <div className="hig-popover-section-head">
                <span className="hig-section-label">当前展示板块</span>
                <button
                  type="button"
                  className="hig-pill-action"
                  onClick={() => {
                    onClose();
                    onCreateCustomPanel();
                  }}
                >
                  <Plus aria-hidden="true" />
                  新建空白板块
                </button>
              </div>

              <div className="hig-grouped-list">
                {board.settings.customPanels.length === 0 && (
                  <p className="hig-empty-inline">
                    当前桌面暂无板块，可切换到「原子拼装模板」一键添加。
                  </p>
                )}
                {board.settings.customPanels.map((panel) => {
                  const isPanelHidden = hiddenPanelIds.has(panel.id);
                  return (
                    <div className="hig-grouped-row" key={panel.id}>
                      <span
                        className="hig-row-color-dot"
                        style={{
                          background: panel.color,
                          opacity: isPanelHidden ? 0.4 : 1,
                        }}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className="hig-row-main-btn"
                        onClick={() => {
                          onClose();
                          onEditCustomPanel?.(panel);
                        }}
                      >
                        <strong>{panel.title}</strong>
                        <small>
                          {panel.blocks.length} 个原子积木 ·{" "}
                          {isPanelHidden ? "已隐藏" : "显示中"}
                        </small>
                      </button>
                      {onToggleCustomPanelVisibility && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!isPanelHidden}
                          className={
                            !isPanelHidden ? "hig-switch is-on" : "hig-switch"
                          }
                          disabled={!editable || busy !== null}
                          aria-label={
                            isPanelHidden
                              ? `恢复显示板块 ${panel.title}`
                              : `隐藏板块 ${panel.title}`
                          }
                          title={isPanelHidden ? "恢复显示板块" : "隐藏板块"}
                          onClick={() => void togglePanel(panel.id)}
                        >
                          <span className="hig-switch-thumb" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="visibility-toggle"
                        aria-label={`编辑板块${panel.title}`}
                        title="编辑板块"
                        onClick={() => {
                          onClose();
                          onEditCustomPanel?.(panel);
                        }}
                      >
                        <Pencil />
                      </button>
                      {onDeleteCustomPanel && (
                        <button
                          type="button"
                          className="visibility-toggle is-danger"
                          aria-label={`删除自由展板${panel.title}`}
                          title="永久删除板块"
                          onClick={() => onDeleteCustomPanel(panel.id)}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="hig-popover-section">
            <span className="hig-section-label">画布图层显示</span>
            <div className="hig-grouped-list">
              {coreCampaignSections.map((section) => {
                const isHidden = hidden.includes(section.id);
                const custom = sectionTitle(
                  section.id,
                  board.settings.sectionTitles,
                );
                return (
                  <div className="hig-grouped-row" key={section.id}>
                    <span className="hig-row-main-static">
                      <strong>{custom}</strong>
                      <small>{isHidden ? "已隐藏" : "显示中"}</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!isHidden}
                      className={
                        !isHidden ? "hig-switch is-on" : "hig-switch"
                      }
                      onClick={() => void toggle(section.id)}
                      disabled={!editable || busy !== null}
                      aria-label={isHidden ? "恢复" + custom : "隐藏" + custom}
                    >
                      <span className="hig-switch-thumb" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="hig-popover-section">
          <span className="hig-section-label">
            点击任意模板，立即在桌面上拼装为可编辑板块
          </span>
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
                <div>
                  <strong>{tpl.label}</strong>
                  <small>{tpl.description}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
    </MenuPopover>
  );
}
