import { RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  campaignSections,
  defaultSectionColors,
  normalizeColor,
  sectionTitle,
} from "../../features/campaign/domain/campaignSettings";
import {
  resourceGroupTitle,
  resourceGroups,
} from "../../features/campaign/domain/resources";
import type {
  CampaignBoard,
  CampaignSectionKey,
  CampaignSettingsPatch,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

/**
 * 单个区块的标题、底色，以及物资区块里三张便签的小标题。
 * 入口是公告板上每个区块标题旁的铅笔按钮。
 */
export function SectionSettingsDialog({
  sectionKey,
  board,
  onClose,
  onSave,
}: {
  sectionKey: CampaignSectionKey;
  board: CampaignBoard;
  onClose: () => void;
  onSave: (patch: CampaignSettingsPatch) => Promise<unknown>;
}) {
  const section =
    campaignSections.find((item) => item.id === sectionKey) ??
    campaignSections[0];
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";

  const [title, setTitle] = useState(() =>
    sectionTitle(sectionKey, board.settings.sectionTitles),
  );
  const [color, setColor] = useState(
    () =>
      normalizeColor(board.settings.sectionColors?.[sectionKey]) ??
      defaultSectionColors[sectionKey],
  );
  const [groupTitles, setGroupTitles] = useState<Record<string, string>>(
    () => {
      const preset: Record<string, string> = {};
      for (const group of resourceGroups) {
        preset[String(group.id)] = resourceGroupTitle(
          group.id,
          board.settings.resourceTitles ?? {},
        );
      }
      return preset;
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isInventory = sectionKey === "inventory";

  const save = async () => {
    if (busy || !editable) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("标题不能为空。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextTitles = { ...board.settings.sectionTitles };
      if (trimmed !== section.defaultTitle) {
        nextTitles[sectionKey] = trimmed;
      } else {
        delete nextTitles[sectionKey];
      }

      const nextColors = { ...board.settings.sectionColors };
      if (color !== defaultSectionColors[sectionKey]) {
        nextColors[sectionKey] = color;
      } else {
        delete nextColors[sectionKey];
      }

      const patch: CampaignSettingsPatch = {
        sectionTitles: nextTitles,
        sectionColors: nextColors,
      };

      if (isInventory) {
        const nextResourceTitles = { ...board.settings.resourceTitles };
        for (const group of resourceGroups) {
          const value = (groupTitles[String(group.id)] ?? "").trim();
          if (value && value !== group.title) {
            nextResourceTitles[String(group.id)] = value;
          } else {
            delete nextResourceTitles[String(group.id)];
          }
        }
        patch.resourceTitles = nextResourceTitles;
      }

      await onSave(patch);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "保存失败，请检查权限后重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = () => {
    setTitle(section.defaultTitle);
    setColor(defaultSectionColors[sectionKey]);
    if (isInventory) {
      const preset: Record<string, string> = {};
      for (const group of resourceGroups) preset[String(group.id)] = group.title;
      setGroupTitles(preset);
    }
  };

  return (
    <PaperDialog
      title={"设置「" + section.defaultTitle + "」"}
      className="section-settings-dialog"
      onClose={onClose}
    >
      <p className="dialog-hint">
        标题与底色只影响你自己的房间，玩家看到的是修改后的样子。
      </p>

      <section className="section-settings-block">
        <label className="field">
          <span>区块标题</span>
          <input
            value={title}
            maxLength={32}
            disabled={!editable || busy}
            onChange={(event) => setTitle(event.target.value)}
            aria-label={section.defaultTitle + "的标题"}
          />
        </label>
        <label className="sign-color-field section-color-field">
          <span>标题底色</span>
          <input
            type="color"
            className="sign-color-input"
            value={color}
            disabled={!editable || busy}
            onChange={(event) => setColor(event.target.value)}
            aria-label={section.defaultTitle + "的底色"}
          />
        </label>
      </section>

      {isInventory && (
        <section className="section-settings-block">
          <h2 className="section-settings-heading">物资便签标题</h2>
          {resourceGroups.map((group) => (
            <label className="field" key={group.id}>
              <span>{group.title}</span>
              <input
                value={groupTitles[String(group.id)] ?? ""}
                maxLength={32}
                disabled={!editable || busy}
                onChange={(event) =>
                  setGroupTitles((current) => ({
                    ...current,
                    [String(group.id)]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </section>
      )}

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}

      <footer className="composer-actions">
        <button
          type="button"
          className="text-button"
          onClick={resetDefaults}
          disabled={!editable || busy}
        >
          <RotateCcw aria-hidden="true" />
          恢复默认
        </button>
        <button
          type="button"
          className="text-button"
          onClick={onClose}
          disabled={busy}
        >
          取消
        </button>
        <button
          type="button"
          className="publish-button"
          onClick={() => void save()}
          disabled={!editable || busy || !title.trim()}
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </footer>
    </PaperDialog>
  );
}
