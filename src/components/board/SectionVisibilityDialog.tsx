import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import {
  campaignSections,
  sectionTitle,
} from "../../features/campaign/domain/campaignSettings";
import type {
  CampaignBoard,
  CampaignSectionKey,
  CampaignSettingsPatch,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

/**
 * 恢复被隐藏的区块。区块藏起来之后标题和按钮都看不见了，
 * 所以需要一个固定入口把按钮再找回来。切换即时生效。
 */
export function SectionVisibilityDialog({
  board,
  onClose,
  onSave,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onSave: (patch: CampaignSettingsPatch) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<CampaignSectionKey | null>(null);
  const [error, setError] = useState("");
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const hidden = board.settings.hiddenSections;

  const toggle = async (key: CampaignSectionKey) => {
    if (busy || !editable) return;
    setBusy(key);
    setError("");
    try {
      const next = hidden.includes(key)
        ? hidden.filter((item) => item !== key)
        : [...hidden, key];
      await onSave({ hiddenSections: next });
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

  return (
    <PaperDialog
      title="公告板区块"
      className="section-visibility-dialog"
      onClose={onClose}
    >
      <p className="dialog-hint">
        隐藏只会收起区块，里面的数据全部保留，随时可以恢复。
      </p>
      <div className="section-visibility-list">
        {campaignSections.map((section) => {
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
                aria-label={
                  isHidden ? "恢复" + custom : "隐藏" + custom
                }
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
      <footer className="composer-actions">
        <button type="button" className="publish-button" onClick={onClose}>
          完成
        </button>
      </footer>
    </PaperDialog>
  );
}
