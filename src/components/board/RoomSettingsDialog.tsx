import { Copy, Globe2, Image, Upload, Users } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import type {
  CampaignBoard,
  CampaignMediaKind,
  CampaignSettingsDraft,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

/**
 * 房间级配置：名称、公开参观、成员、图片。
 * 区块标题 / 底色 / 显隐 / 物资便签标题都挪到公告板上各自的标题旁了，
 * 这里保存时按当前值原样带回，避免把那边改过的内容清掉。
 */
export function RoomSettingsDialog({
  board,
  onClose,
  onSave,
  onUpload,
  onClearMedia,
  onSetPublic,
  onOpenRoster,
}: {
  board: CampaignBoard;
  onClose: () => void;
  onSave: (draft: CampaignSettingsDraft) => Promise<unknown>;
  onUpload: (kind: CampaignMediaKind, file: File) => Promise<unknown>;
  onClearMedia: (kind: CampaignMediaKind) => Promise<unknown>;
  onSetPublic: (isPublic: boolean) => Promise<unknown>;
  onOpenRoster: () => void;
}) {
  const [campaignName, setCampaignName] = useState(board.campaign.name);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const editable =
    board.viewer.role === "gm" && board.campaign.status === "active";
  const run = async (key: string, operation: () => Promise<unknown>) => {
    if (busy || !editable) return;
    setBusy(key);
    setError("");
    try {
      await operation();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "房间配置保存失败，请重试。",
      );
    } finally {
      setBusy("");
    }
  };
  const upload =
    (kind: CampaignMediaKind) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void run(`upload-${kind}`, () => onUpload(kind, file));
    };
  return (
    <PaperDialog
      title="房间配置"
      className="room-settings-dialog"
      onClose={onClose}
    >
      <div className="room-settings-grid">
        <section className="campaign-name-setting">
          <label className="field">
            <span>战役名称</span>
            <input
              value={campaignName}
              maxLength={80}
              required
              disabled={!editable || Boolean(busy)}
              onChange={(event) => setCampaignName(event.target.value)}
              aria-label="战役名称"
            />
          </label>
        </section>
        <section className="public-access-setting">
          <div>
            <Globe2 aria-hidden="true" />
            <span>
              <strong>公开参观</strong>
              <small>
                {board.settings.isPublic
                  ? "所有访客可只读查看公告板并留言"
                  : "仅房间成员可以查看公告板"}
              </small>
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={board.settings.isPublic}
            className={
              board.settings.isPublic
                ? "public-access-toggle is-public"
                : "public-access-toggle"
            }
            disabled={!editable || Boolean(busy)}
            onClick={() =>
              void run("public", () => onSetPublic(!board.settings.isPublic))
            }
          >
            {busy === "public"
              ? "保存中…"
              : board.settings.isPublic
                ? "已公开"
                : "未公开"}
          </button>
          {board.settings.isPublic && (
            <button
              type="button"
              className="text-button public-share-button"
              onClick={() => {
                const url = new URL(window.location.href);
                url.search = "";
                url.searchParams.set("visit", board.campaign.id);
                void navigator.clipboard.writeText(url.toString()).then(() => {
                  setShareCopied(true);
                  window.setTimeout(() => setShareCopied(false), 1600);
                });
              }}
            >
              <Copy aria-hidden="true" />
              {shareCopied ? "参观链接已复制" : "复制参观链接"}
            </button>
          )}
        </section>
        <button
          type="button"
          className="room-roster-shortcut"
          onClick={onOpenRoster}
        >
          <Users />
          管理成员与角色资料
        </button>
        <section className="room-settings-section media-settings">
          <header>
            <div>
              <small>JPEG、PNG 或 WebP，最大 5 MiB</small>
              <h2>房间图片</h2>
            </div>
            <Image />
          </header>
          <div className="media-setting-row">
            <div>
              <strong>场景背景</strong>
              <span>
                {board.settings.backgroundPath
                  ? "已使用自定义背景"
                  : "使用默认门店场景"}
              </span>
            </div>
            <label className="text-button file-button">
              <Upload />
              {busy === "upload-background" ? "上传中…" : "选择图片"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!editable || Boolean(busy)}
                onChange={upload("background")}
              />
            </label>
            {board.settings.backgroundPath && (
              <button
                type="button"
                className="text-button danger-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run("clear-background", () => onClearMedia("background"))
                }
              >
                恢复默认
              </button>
            )}
          </div>
          <div className="media-setting-row">
            <div>
              <strong>便签纸张</strong>
              <span>
                {board.settings.noteTexturePath
                  ? "已使用自定义纸张"
                  : "使用默认彩色便签"}
              </span>
            </div>
            <label className="text-button file-button">
              <Upload />
              {busy === "upload-noteTexture" ? "上传中…" : "选择图片"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!editable || Boolean(busy)}
                onChange={upload("noteTexture")}
              />
            </label>
            {board.settings.noteTexturePath && (
              <button
                type="button"
                className="text-button danger-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run("clear-note", () => onClearMedia("noteTexture"))
                }
              >
                恢复默认
              </button>
            )}
          </div>
        </section>
      </div>
      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
      <footer className="composer-actions">
        <button
          type="button"
          className="text-button"
          onClick={onClose}
          disabled={Boolean(busy)}
        >
          取消
        </button>
        <button
          type="button"
          className="publish-button"
          disabled={!editable || Boolean(busy) || !campaignName.trim()}
          onClick={() =>
            void run("save", async () => {
              await onSave({
                name: campaignName.trim(),
                sectionTitles: board.settings.sectionTitles,
                sectionColors: board.settings.sectionColors,
                resourceTitles: board.settings.resourceTitles,
                moduleLayout: board.settings.moduleLayout,
                hiddenSections: board.settings.hiddenSections,
              });
              onClose();
            })
          }
        >
          {busy === "save" ? "保存中…" : "保存共享配置"}
        </button>
      </footer>
    </PaperDialog>
  );
}
