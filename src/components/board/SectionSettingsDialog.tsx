import { Layers, Palette, RotateCcw } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  boardModuleKeys,
  type BoardModuleKey,
} from "../../features/campaign/domain/boardModules";
import {
  defaultCardVisualEffect,
  normalizeCardVisualEffect,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import {
  campaignSections,
  defaultSectionColors,
  normalizeColor,
  sectionTitle,
} from "../../features/campaign/domain/campaignSettings";
import type {
  CampaignBoard,
  CampaignSectionKey,
  CampaignSettingsPatch,
  CampaignSettingsUpdate,
} from "../../features/campaign/domain/types";
import {
  applySettingsPatch,
  settingsUpdate,
} from "../../features/campaign/domain/settingsUpdate";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { PaperDialog } from "../composer/PaperDialog";
import { BoardSectionHeader } from "./BoardSectionPrimitives";
import { CardEffectPicker } from "./CardEffectLayer";
import { ColorField } from "./ColorField";

/**
 * 历史兼容模块与独立事件钟卡片的编辑检查器：
 * 采用与原子展示板块完全一致的 Apple HIG 分段标签（内容管理 | 外观与材质着色）与 Inset Grouped 视觉规范。
 */
export function SectionSettingsDialog({
  sectionKey,
  board,
  onClose,
  onSave,
  onSaveModuleEffect,
  onSaveSectionFontSize,
  renderContent,
}: {
  sectionKey: CampaignSectionKey;
  board: CampaignBoard;
  onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<CampaignSettingsPatch>;
  onSaveModuleEffect?: (
    key: BoardModuleKey,
    effect: CardVisualEffect | null,
  ) => Promise<unknown>;
  onSaveSectionFontSize?: (
    key: CampaignSectionKey,
    fontSize: number,
  ) => Promise<unknown>;
  renderContent?: (onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const section =
    campaignSections.find((item) => item.id === sectionKey) ??
    campaignSections[0];
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const isBoardModule = boardModuleKeys.includes(sectionKey as BoardModuleKey);
  const storedEffect = isBoardModule
    ? normalizeCardVisualEffect(
        board.settings.moduleLayout[sectionKey as BoardModuleKey]?.effect,
      )
    : defaultCardVisualEffect();

  const [tab, setTab] = useState<"content" | "appearance">(
    renderContent ? "content" : "appearance",
  );
  const [title, setTitle] = useState(() =>
    sectionTitle(sectionKey, board.settings.sectionTitles),
  );
  const [color, setColor] = useState(
    () =>
      normalizeColor(board.settings.sectionColors?.[sectionKey]) ??
      defaultSectionColors[sectionKey],
  );
  const [cardEffect, setCardEffect] = useState<CardVisualEffect>(() =>
    structuredClone(storedEffect),
  );
  const initialFontSize =
    board.settings.styleTokens.sectionFontSizes?.[sectionKey] ?? 14;
  const [sectionFontSize, setSectionFontSize] = useState<number>(initialFontSize);
  const original = useRef(board);
  const savedEffectRef = useRef(JSON.stringify(storedEffect));
  const [busy, setBusy] = useState(false);
  const [contentBusy, setContentBusy] = useState(false);
  const [error, setError] = useState("");
  const ime = useImeEnterGuard();

  const save = async () => {
    if (busy || contentBusy || !editable) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("标题不能为空。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const update = settingsUpdate(original.current, {
        sectionTitles: {
          [sectionKey]: trimmed === section.defaultTitle ? null : trimmed,
        },
        sectionColors: {
          [sectionKey]:
            color === defaultSectionColors[sectionKey] ? null : color,
        },
      });
      if (Object.keys(update.patch).length) {
        const saved = await onSave(update);
        original.current = applySettingsPatch(original.current, saved);
      }
      if (
        isBoardModule &&
        onSaveModuleEffect &&
        JSON.stringify(cardEffect) !== savedEffectRef.current
      ) {
        await onSaveModuleEffect(sectionKey as BoardModuleKey, cardEffect);
        savedEffectRef.current = JSON.stringify(cardEffect);
      }
      if (onSaveSectionFontSize && sectionFontSize !== initialFontSize) {
        await onSaveSectionFontSize(sectionKey, sectionFontSize);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaperDialog
      title={`编辑「${section.defaultTitle}」`}
      className="section-settings-dialog hig-inspector-sheet"
      onClose={() => {
        if (!busy && !contentBusy) onClose();
      }}
    >
      {renderContent && (
        <div
          className="hig-inspector-segmented"
          role="tablist"
          aria-label="模块编辑分页"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "content"}
            className={tab === "content" ? "is-active" : ""}
            onClick={() => setTab("content")}
          >
            <Layers aria-hidden="true" />
            内容管理
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "appearance"}
            className={tab === "appearance" ? "is-active" : ""}
            onClick={() => setTab("appearance")}
          >
            <Palette aria-hidden="true" />
            外观与材质着色
          </button>
        </div>
      )}

      {tab === "content" && renderContent ? (
        <fieldset className="hig-editor-sections" disabled={busy}>
          <section className="hig-editor-group">
            {renderContent(setContentBusy)}
          </section>
        </fieldset>
      ) : (
        <form
          className="module-common-settings"
          aria-label="模块外观设置"
          {...ime}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset
            className="hig-editor-sections"
            disabled={!editable || busy || contentBusy}
          >
            <section className="hig-editor-group">
              <div className="hig-editor-top-grid">
                <label className="field">
                  <span>板块标题</span>
                  <input
                    value={title}
                    maxLength={32}
                    required
                    onChange={(event) => setTitle(event.target.value)}
                    aria-label={`${section.defaultTitle}的标题`}
                  />
                </label>
                <ColorField
                  label="标题栏底色"
                  accessibleLabel={section.defaultTitle}
                  value={color}
                  onChange={setColor}
                  disabled={!editable || busy || contentBusy}
                />
              </div>
              <div className="module-header-preview" aria-label="标题预览">
                <BoardSectionHeader
                  title={title || section.defaultTitle}
                  color={color}
                />
              </div>
              {onSaveSectionFontSize && (
                <label className="hig-range-field">
                  <span>
                    板块文字字号 <strong>{sectionFontSize}px</strong>
                  </span>
                  <input
                    type="range"
                    aria-label="板块文字字号"
                    min={11}
                    max={24}
                    step={1}
                    value={sectionFontSize}
                    onChange={(e) => setSectionFontSize(Number(e.target.value))}
                  />
                </label>
              )}
            </section>

            {isBoardModule && onSaveModuleEffect && (
              <section className="hig-editor-group">
                <CardEffectPicker
                  value={cardEffect}
                  disabled={!editable || busy || contentBusy}
                  onChange={setCardEffect}
                />
              </section>
            )}
          </fieldset>

          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}

          <footer className="composer-actions hig-sheet-footer">
            <button
              className="text-button"
              type="button"
              disabled={!editable || busy || contentBusy}
              onClick={() => {
                setTitle(section.defaultTitle);
                setColor(defaultSectionColors[sectionKey]);
                setCardEffect(defaultCardVisualEffect());
                setError("");
              }}
            >
              <RotateCcw aria-hidden="true" />
              恢复默认
            </button>
            <span className="action-spacer" />
            <button
              className="text-button"
              type="button"
              disabled={busy || contentBusy}
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="publish-button"
              type="submit"
              disabled={!editable || busy || contentBusy || !title.trim()}
            >
              {busy ? "保存中…" : "完成并保存"}
            </button>
          </footer>
        </form>
      )}
    </PaperDialog>
  );
}
