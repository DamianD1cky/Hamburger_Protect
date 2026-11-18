import { RotateCcw } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { boardModuleKeys, type BoardModuleKey } from "../../features/campaign/domain/boardModules";
import {
  defaultCardVisualEffect,
  normalizeCardVisualEffect,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import { campaignSections, defaultSectionColors, normalizeColor, sectionTitle } from "../../features/campaign/domain/campaignSettings";
import type { CampaignBoard, CampaignSectionKey, CampaignSettingsPatch, CampaignSettingsUpdate } from "../../features/campaign/domain/types";
import { applySettingsPatch, settingsUpdate } from "../../features/campaign/domain/settingsUpdate";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";
import { PaperDialog } from "../composer/PaperDialog";
import { BoardSectionHeader } from "./BoardSectionPrimitives";
import { CardEffectPicker } from "./CardEffectLayer";
import { ColorField } from "./ColorField";

/** A fixed appearance form and a separate, type-specific editor share one dialog. */
export function SectionSettingsDialog({ sectionKey, board, onClose, onSave, onSaveModuleEffect, renderContent }: {
  sectionKey: CampaignSectionKey; board: CampaignBoard; onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<CampaignSettingsPatch>;
  onSaveModuleEffect?: (key: BoardModuleKey, effect: CardVisualEffect | null) => Promise<unknown>;
  renderContent?: (onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const section = campaignSections.find((item) => item.id === sectionKey) ?? campaignSections[0];
  const editable = board.viewer.role === "gm" && board.campaign.status === "active";
  const isBoardModule = boardModuleKeys.includes(sectionKey as BoardModuleKey);
  const storedEffect = isBoardModule
    ? normalizeCardVisualEffect(board.settings.moduleLayout[sectionKey as BoardModuleKey]?.effect)
    : defaultCardVisualEffect();
  const [title, setTitle] = useState(() => sectionTitle(sectionKey, board.settings.sectionTitles));
  const [color, setColor] = useState(() =>
    normalizeColor(board.settings.sectionColors?.[sectionKey]) ?? defaultSectionColors[sectionKey]);
  const [cardEffect, setCardEffect] = useState<CardVisualEffect>(() => structuredClone(storedEffect));
  const original = useRef(board);
  const savedEffectRef = useRef(JSON.stringify(storedEffect));
  const [busy, setBusy] = useState(false), [contentBusy, setContentBusy] = useState(false);
  const [error, setError] = useState("");
  const ime = useImeEnterGuard();
  const save = async () => {
    if (busy || contentBusy || !editable) return;
    const trimmed = title.trim();
    if (!trimmed) { setError("标题不能为空。"); return; }
    setBusy(true); setError("");
    try {
      const update = settingsUpdate(original.current, {
        sectionTitles: { [sectionKey]: trimmed === section.defaultTitle ? null : trimmed },
        sectionColors: { [sectionKey]: color === defaultSectionColors[sectionKey] ? null : color },
      });
      if (Object.keys(update.patch).length) {
        const saved = await onSave(update);
        original.current = applySettingsPatch(original.current, saved);
      }
      if (isBoardModule && onSaveModuleEffect && JSON.stringify(cardEffect) !== savedEffectRef.current) {
        await onSaveModuleEffect(sectionKey as BoardModuleKey, cardEffect);
        savedEffectRef.current = JSON.stringify(cardEffect);
      }
      // Keep the type-specific draft open; saving appearance never saves it.
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally { setBusy(false); }
  };
  return <PaperDialog title={`设置「${section.defaultTitle}」`} className="section-settings-dialog"
    onClose={() => { if (!busy && !contentBusy) onClose(); }}>
    <div className="module-settings-layout">
      <form className="module-common-settings" aria-label="模块外观设置" {...ime} onSubmit={(event) => {
        event.preventDefault(); void save();
      }}>
        <h2 className="section-settings-heading">外观</h2>
        <fieldset disabled={!editable || busy || contentBusy}>
          <label className="field"><span>标题</span><input value={title} maxLength={32} required
            onChange={(event) => setTitle(event.target.value)} aria-label={`${section.defaultTitle}的标题`} /></label>
          <ColorField label="标题底色" accessibleLabel={section.defaultTitle} value={color} onChange={setColor}
            disabled={!editable || busy || contentBusy} />
          {isBoardModule && onSaveModuleEffect && (
            <CardEffectPicker value={cardEffect} disabled={!editable || busy || contentBusy} onChange={setCardEffect} />
          )}
          <div className="module-header-preview" aria-label="标题预览">
            <BoardSectionHeader title={title || section.defaultTitle} color={color} />
          </div>
        </fieldset>
        {error && <p className="access-error" role="alert">{error}</p>}
        <footer className="composer-actions section-appearance-actions">
          <button className="text-button" type="button" disabled={!editable || busy || contentBusy}
            onClick={() => { setTitle(section.defaultTitle); setColor(defaultSectionColors[sectionKey]); setCardEffect(defaultCardVisualEffect()); setError(""); }}>
            <RotateCcw aria-hidden="true" />恢复默认
          </button>
          <button className="publish-button" type="submit" disabled={!editable || busy || contentBusy || !title.trim()}>
            {busy ? "保存中…" : "保存模块外观"}
          </button>
        </footer>
      </form>
      {renderContent && <fieldset className="module-specific-settings" disabled={busy}>
        <legend className="section-settings-heading">内容</legend>
        {renderContent(setContentBusy)}
      </fieldset>}
    </div>
  </PaperDialog>;
}
