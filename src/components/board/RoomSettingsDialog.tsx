import { Copy, Globe2, Image, Upload, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import type { BoardAppearance, BoardAppearanceFiles } from "../../features/campaign/domain/boardAppearance";
import { AppearancePreview } from "./BoardAppearance";
import type {
  CampaignBoard,
  CampaignMediaKind,
  CampaignSettingsUpdate,
  CampaignSettingsPatch,
} from "../../features/campaign/domain/types";
import { applySettingsPatch, settingsUpdate } from "../../features/campaign/domain/settingsUpdate";
import { MenuPopover } from "./MenuPopover";
import { ColorField } from "./ColorField";

/**
 * 房间级配置：名称、公开参观、成员、图片。
 * 名称和外观独立保存，其他模块设置不随房间草稿写回。
 */
export function RoomSettingsDialog({
  board,
  onClose,
  onSave,
  onSaveAppearance,
  onUpload,
  onClearMedia,
  onSetPublic,
  onOpenRoster,
  anchor,
}: {
  anchor: HTMLElement | null;
  board: CampaignBoard;
  onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<CampaignSettingsPatch>;
  onSaveAppearance: (appearance: BoardAppearance, files: BoardAppearanceFiles, expected: BoardAppearance) => Promise<unknown>;
  onUpload: (kind: CampaignMediaKind, file: File) => Promise<unknown>;
  onClearMedia: (kind: CampaignMediaKind) => Promise<unknown>;
  onSetPublic: (isPublic: boolean) => Promise<unknown>;
  onOpenRoster: () => void;
}) {
  const [campaignName, setCampaignName] = useState(board.campaign.name);
  const [tab, setTab] = useState<"room" | "appearance">("room");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [appearance, setAppearance] = useState(() => structuredClone(board.settings.appearance));
  const [files, setFiles] = useState<BoardAppearanceFiles>({});
  const [previews, setPreviews] = useState<Partial<Record<keyof BoardAppearanceFiles, string>>>({});
  const previewUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const baseDraft = useRef(JSON.stringify({ name: board.campaign.name, appearance: board.settings.appearance }));
  const original = useRef(board);
  const resetOnOpen = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  useLayoutEffect(() => {
    if (!anchor) return;
    const clean = !Object.keys(files).length &&
      JSON.stringify({ name: campaignName, appearance }) === baseDraft.current;
    if (clean || resetOnOpen.current) {
      setCampaignName(board.campaign.name);
      setAppearance(structuredClone(board.settings.appearance));
      setFiles({}); setPreviews({}); setError("");
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
      baseDraft.current = JSON.stringify({ name: board.campaign.name, appearance: board.settings.appearance });
      original.current = board;
      resetOnOpen.current = false;
    }
    // Refresh clean drafts on reopening; outside dismissal preserves dirty drafts.
  }, [anchor]);
  const room = appearance.room;
  const updateRoom = (patch: Partial<BoardAppearance["room"]>) =>
    setAppearance((current) => ({ ...current, room: { ...current.room, ...patch } }));
  const chooseAppearanceImage = (kind: keyof BoardAppearanceFiles) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
        setError("请选择不超过 20 MiB 的 JPEG、PNG 或 WebP 图片");
        return;
      }
      const url = URL.createObjectURL(file);
      setBusy(`prepare-${kind}`);
      try {
        const image = new window.Image();
        image.src = url;
        await image.decode();
        if (!image.width || !image.height) throw new Error("图片无法读取");
        if (!mounted.current) { URL.revokeObjectURL(url); return; }
        previewUrls.current.push(url);
        setFiles((current) => ({ ...current, [kind]: file }));
        setPreviews((current) => ({ ...current, [kind]: url }));
        setAppearance((current) => kind === "background"
          ? { ...current, room: { ...current.room, kind: "image" } }
          : { ...current, surface: { ...current.surface, kind: "image" } });
        setError("");
      } catch {
        URL.revokeObjectURL(url);
        if (mounted.current) setError("图片无法读取，请换一张图片");
      } finally {
        if (mounted.current) setBusy("");
      }
    };
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
    <MenuPopover
      anchor={anchor}
      id="room-settings-menu"
      width={440}
      title="房间配置"
      className="room-settings-dialog"
      onClose={() => { if (!busy) onClose(); }}
    >
      <div className="room-settings-tabs" role="tablist" aria-label="房间设置分类">
        {([["room", "房间"], ["appearance", "外观"]] as const).map(([key, label]) =>
          <button type="button" role="tab" key={key} id={`room-tab-${key}`}
            aria-selected={tab === key} aria-controls={`room-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "room" : event.key === "End" ? "appearance" :
                tab === "room" ? "appearance" : "room";
              setTab(next);
              document.getElementById(`room-tab-${next}`)?.focus();
            }}
            onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="room-settings-grid">
        <div role="tabpanel" id="room-panel-room" aria-labelledby="room-tab-room" hidden={tab !== "room"}>
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
          disabled={!!busy}
          onClick={onOpenRoster}
        >
          <Users />
          管理成员与角色资料
        </button>
        </div>
        <section className="room-settings-section media-settings" role="tabpanel" id="room-panel-appearance"
          aria-labelledby="room-tab-appearance" hidden={tab !== "appearance"}>
          <header>
            <div>
              <h2>公告板外观</h2>
            </div>
            <Image />
          </header>
          <AppearancePreview appearance={appearance}
            backgroundUrl={previews.background ?? board.settings.backgroundUrl}
            surfaceUrl={previews.boardTexture ?? board.settings.boardTextureUrl} />
          <fieldset className="appearance-fields" disabled={!editable || Boolean(busy)}>
            <legend>房间背景</legend>
            <div className="appearance-options">
              {([["default", "门店"], ["color", "纯色"], ["image", "图片"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={room.kind === value}
                  disabled={value === "image" && !room.imagePath && !files.background}
                  onClick={() => updateRoom({ kind: value })}>{label}</button>)}
              {([["crossing", "路口"], ["station", "车站"]] as const).map(([scene, label]) =>
                <button type="button" key={scene} aria-pressed={room.kind === "perspective" && room.scene === scene}
                  onClick={() => updateRoom({ kind: "perspective", scene, animated: room.animated ?? true,
                    fit: room.fit === "tile" ? "cover" : room.fit })}>{label}</button>)}
              <label className="text-button file-button">
                <Upload aria-hidden="true" />选择背景图片
                <input type="file" aria-label="选择背景图片" accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void chooseAppearanceImage("background")(event)} />
              </label>
            </div>
            {room.kind === "perspective" && <label className="appearance-animation">
              <input type="checkbox" aria-label="动态透视" checked={room.animated ?? true}
                onChange={(event) => updateRoom({ animated: event.target.checked })} />动态透视
            </label>}
            <ColorField label="底色" accessibleLabel="房间底色" value={room.color}
              onChange={(color) => updateRoom({ color })} disabled={!editable || !!busy} />
            {room.kind !== "color" && (
              <div className="appearance-image-controls">
                <label>适配方式<select aria-label="背景适配方式" value={room.fit}
                  onChange={(event) => updateRoom({ fit: event.target.value as typeof room.fit })}>
                  <option value="cover">铺满</option><option value="contain">完整显示</option>
                  {room.kind !== "perspective" && <option value="tile">平铺</option>}
                </select></label>
                <label>水平焦点<input type="range" aria-label="背景水平焦点" min="0" max="100"
                  value={room.positionX} onChange={(event) => updateRoom({ positionX: Number(event.target.value) })} /></label>
                <label>垂直焦点<input type="range" aria-label="背景垂直焦点" min="0" max="100"
                  value={room.positionY} onChange={(event) => updateRoom({ positionY: Number(event.target.value) })} /></label>
              </div>
            )}
            <label className="appearance-range">暗化
              <input type="range" aria-label="背景暗化" min="0" max="80"
                value={Math.round(room.dim * 100)} onChange={(event) => updateRoom({ dim: Number(event.target.value) / 100 })} />
            </label>
          </fieldset>
          <fieldset className="appearance-fields" disabled={!editable || Boolean(busy)}>
            <legend>板面材质</legend>
            <div className="appearance-options">
              {([["felt", "黑板"], ["cork", "软木"], ["paper", "纸张"], ["image", "自定义"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={appearance.surface.kind === value}
                  disabled={value === "image" && !appearance.surface.imagePath && !files.boardTexture}
                  onClick={() => setAppearance((current) => ({ ...current, surface: { ...current.surface, kind: value } }))}>{label}</button>)}
              <label className="text-button file-button"><Upload aria-hidden="true" />选择板面纹理
                <input type="file" aria-label="选择板面纹理" accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void chooseAppearanceImage("boardTexture")(event)} />
              </label>
            </div>
          </fieldset>
          <fieldset className="appearance-fields" disabled={!editable || Boolean(busy)}>
            <legend>边框样式</legend>
            <div className="appearance-options">
              {([["burger", "汉堡店"], ["wood", "木框"], ["metal", "金属"], ["none", "无边框"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={appearance.frame === value}
                  onClick={() => setAppearance((current) => ({ ...current, frame: value }))}>{label}</button>)}
            </div>
          </fieldset>
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
          onClick={() => { resetOnOpen.current = true; onClose(); }}
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
              const saved = await onSave(settingsUpdate(original.current, { name: campaignName.trim() }));
              original.current = applySettingsPatch(original.current, saved);
              const activeFiles: BoardAppearanceFiles = {
                ...(appearance.room.kind === "image" && files.background ? { background: files.background } : {}),
                ...(appearance.surface.kind === "image" && files.boardTexture ? { boardTexture: files.boardTexture } : {}),
              };
              if (JSON.stringify(appearance) !== JSON.stringify(original.current.settings.appearance) || Object.keys(activeFiles).length) {
                await onSaveAppearance(appearance, activeFiles, original.current.settings.appearance);
              }
              resetOnOpen.current = true;
              onClose();
            })
          }
        >
          {busy === "save" ? "保存中…" : "保存共享配置"}
        </button>
      </footer>
    </MenuPopover>
  );
}
