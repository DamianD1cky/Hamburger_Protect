import {
  Copy,
  Eye,
  EyeOff,
  Globe2,
  Image,
  RotateCcw,
  Upload,
  Users,
} from "lucide-react";
import { useState, type ChangeEvent } from "react";
import {
  campaignSections,
  defaultSectionColors,
  defaultSectionTitles,
  normalizeColor,
} from "../../features/campaign/domain/campaignSettings";
import {
  defaultResourceTitles,
  resourceGroups,
} from "../../features/campaign/domain/resources";
import type {
  CampaignBoard,
  CampaignMediaKind,
  CampaignSectionKey,
  CampaignSettingsDraft,
} from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";

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
  const [titles, setTitles] = useState(() => ({
    ...defaultSectionTitles,
    ...board.settings.sectionTitles,
  }));
  const [colors, setColors] = useState<Record<CampaignSectionKey, string>>(
    () => {
      const preset = { ...defaultSectionColors };
      for (const [key, value] of Object.entries(
        board.settings.sectionColors ?? {},
      )) {
        const normalized = normalizeColor(value);
        if (normalized) preset[key as CampaignSectionKey] = normalized;
      }
      return preset;
    },
  );
  const [groupTitles, setGroupTitles] = useState<Record<string, string>>(
    () => {
      const preset: Record<string, string> = { ...defaultResourceTitles };
      for (const [key, value] of Object.entries(
        board.settings.resourceTitles ?? {},
      )) {
        if (value) preset[key] = value;
      }
      return preset;
    },
  );
  const [hidden, setHidden] = useState<CampaignSectionKey[]>(
    board.settings.hiddenSections,
  );
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
  const toggleHidden = (key: CampaignSectionKey) => {
    setHidden((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
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
            void run("public", () =>
              onSetPublic(!board.settings.isPublic),
            )
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
      <section className="room-settings-section board-sections-setting">
        <header>
          <div>
            <small>隐藏不删除数据</small>
            <h2>公告板区块</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="恢复默认标题与底色"
            aria-label="恢复所有默认标题与底色"
            onClick={() => {
              setTitles({ ...defaultSectionTitles });
              setColors({ ...defaultSectionColors });
            }}
          >
            <RotateCcw />
          </button>
        </header>
        <div className="section-settings-list">
          {campaignSections.map((section) => {
            const isHidden = hidden.includes(section.id);
            return (
              <div className="section-setting-row" key={section.id}>
                <label className="field">
                  <span>{defaultSectionTitles[section.id]}</span>
                  <input
                    value={titles[section.id]}
                    maxLength={32}
                    disabled={!editable || Boolean(busy)}
                    onChange={(event) =>
                      setTitles((current) => ({
                        ...current,
                        [section.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label
                  className="sign-color-field"
                  title={`设置「${titles[section.id] || section.defaultTitle}」的底色`}
                >
                  <input
                    type="color"
                    className="sign-color-input"
                    value={colors[section.id]}
                    disabled={!editable || Boolean(busy)}
                    aria-label={`${section.defaultTitle}的底色`}
                    onChange={(event) =>
                      setColors((current) => ({
                        ...current,
                        [section.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className={
                    isHidden
                      ? "visibility-toggle is-hidden"
                      : "visibility-toggle"
                  }
                  onClick={() => toggleHidden(section.id)}
                  disabled={!editable || Boolean(busy)}
                  aria-label={
                    isHidden
                      ? `恢复${section.defaultTitle}`
                      : `隐藏${section.defaultTitle}`
                  }
                  title={isHidden ? "恢复显示" : "隐藏区块"}
                >
                  {isHidden ? <EyeOff /> : <Eye />}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="room-settings-section resource-titles-setting">
        <header>
          <div>
            <small>仅 GM 可编辑，玩家看到的是改后的标题</small>
            <h2>物资便签标题</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="恢复默认物资标题"
            aria-label="恢复默认物资标题"
            onClick={() => setGroupTitles({ ...defaultResourceTitles })}
          >
            <RotateCcw />
          </button>
        </header>
        <div className="section-settings-list">
          {resourceGroups.map((group) => (
            <div className="section-setting-row" key={group.id}>
              <label className="field">
                <span>{group.title}</span>
                <input
                  value={groupTitles[String(group.id)] ?? ""}
                  maxLength={32}
                  disabled={!editable || Boolean(busy)}
                  onChange={(event) =>
                    setGroupTitles((current) => ({
                      ...current,
                      [String(group.id)]: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </section>
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
          disabled={
            !editable ||
            Boolean(busy) ||
            !campaignName.trim() ||
            campaignSections.some((section) => !titles[section.id].trim()) ||
            resourceGroups.some(
              (group) => !(groupTitles[String(group.id)] ?? "").trim(),
            )
          }
          onClick={() =>
            void run("save", async () => {
              await onSave({
                name: campaignName.trim(),
                sectionTitles: Object.fromEntries(
                  campaignSections
                    .filter(
                      (section) =>
                        titles[section.id].trim() !== section.defaultTitle,
                    )
                    .map((section) => [section.id, titles[section.id].trim()]),
                ),
                sectionColors: Object.fromEntries(
                  campaignSections
                    .filter(
                      (section) =>
                        colors[section.id] !==
                        defaultSectionColors[section.id],
                    )
                    .map((section) => [section.id, colors[section.id]]),
                ),
                resourceTitles: Object.fromEntries(
                  resourceGroups
                    .filter((group) => {
                      const value = (
                        groupTitles[String(group.id)] ?? ""
                      ).trim();
                      return value.length > 0 && value !== group.title;
                    })
                    .map((group) => [
                      String(group.id),
                      (groupTitles[String(group.id)] ?? "").trim(),
                    ]),
                ),
                hiddenSections: hidden,
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
