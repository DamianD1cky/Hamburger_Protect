import { useRef, useState } from "react";
import { resourceGroups, resourceGroupTitle } from "../../features/campaign/domain/resources";
import type { CampaignBoard, CampaignSettingsPatch, CampaignSettingsUpdate } from "../../features/campaign/domain/types";
import { applySettingsPatch, settingsUpdate } from "../../features/campaign/domain/settingsUpdate";
import { useImeEnterGuard } from "../../hooks/useImeEnterGuard";

export function ResourceCategorySettings({ board, onSave, onOpenSheet, onBusyChange }: {
  board: CampaignBoard; onSave: (update: CampaignSettingsUpdate) => Promise<CampaignSettingsPatch>;
  onOpenSheet: (group: number) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [titles, setTitles] = useState(() => Object.fromEntries(resourceGroups.map((group) =>
    [String(group.id), resourceGroupTitle(group.id, board.settings.resourceTitles)])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const original = useRef(board);
  const editable = board.viewer.role === "gm" && board.campaign.status === "active";
  const ime = useImeEnterGuard();
  return <form className="resource-category-settings" {...ime} onSubmit={async (event) => {
    event.preventDefault();
    if (!editable || busy) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const resourceTitles: Record<string, string | null> = {};
      for (const group of resourceGroups) {
        const title = titles[String(group.id)].trim();
        if (!title) throw new Error("分类标题不能为空。");
        resourceTitles[String(group.id)] = title === group.title ? null : title;
      }
      const saved = await onSave(settingsUpdate(original.current, { resourceTitles }));
      original.current = applySettingsPatch(original.current, saved);
    } catch (error) { setError(error instanceof Error ? error.message : "分类保存失败，请重试。"); }
    finally { setBusy(false); onBusyChange(false); }
  }}>
    <fieldset disabled={!editable || busy}>
      {resourceGroups.map((group) => <div className="resource-category-row" key={group.id}>
        <label className="field"><span>{group.title}</span><input maxLength={32} required
          aria-label={`${group.title}的分类标题`} value={titles[String(group.id)]}
          onChange={(event) => setTitles({ ...titles, [String(group.id)]: event.target.value })} /></label>
        <button className="text-button" type="button" onClick={() => onOpenSheet(group.id)}>
          编辑物资
        </button>
      </div>)}
    </fieldset>
    {error && <p className="access-error" role="alert">{error}</p>}
    <footer className="composer-actions"><button className="publish-button" type="submit" disabled={!editable || busy}>
      {busy ? "保存中…" : "保存分类标题"}
    </button></footer>
  </form>;
}
