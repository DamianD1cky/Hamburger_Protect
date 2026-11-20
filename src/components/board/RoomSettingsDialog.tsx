import {
  ChevronRight,
  Copy,
  Globe2,
  Palette,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  Users,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  boardAppearancePresets,
  type BoardAppearance,
  type BoardAppearanceFiles,
} from "../../features/campaign/domain/boardAppearance";
import {
  boardStylePresetLabels,
  type BoardFontPreset,
  type BoardStyleTokens,
} from "../../features/campaign/domain/boardStyleTokens";
import {
  deleteLocalFont,
  formatFontSizeBytes,
  importLocalFontFile,
  useAccountLocalFonts,
} from "../../features/fonts/localFontLibrary";
import { defaultBoardAmbientShader } from "../../features/campaign/domain/cardEffects";
import { useAccountAssets } from "../../features/assets/accountAssetLibrary";
import type {
  CampaignBoard,
  CampaignMediaKind,
  CampaignSettingsPatch,
  CampaignSettingsUpdate,
} from "../../features/campaign/domain/types";
import {
  applySettingsPatch,
  settingsUpdate,
} from "../../features/campaign/domain/settingsUpdate";
import { AppearancePreview } from "./BoardAppearance";
import { ColorField } from "./ColorField";
import { MenuPopover } from "./MenuPopover";

/**
 * 房间级配置（Apple Settings Inset Grouped 风格）：
 * 「房间」与「外观」通过顶部 Segmented Control 清晰隔离，名称和外观独立原子保存。
 */
export function RoomSettingsDialog({
  board,
  onClose,
  onSave,
  onSaveAppearance,
  onSaveStyleTokens,
  onUpload: _onUpload,
  onClearMedia: _onClearMedia,
  onSetPublic,
  onOpenRoster,
  anchor,
}: {
  anchor: HTMLElement | null;
  board: CampaignBoard;
  onClose: () => void;
  onSave: (update: CampaignSettingsUpdate) => Promise<CampaignSettingsPatch>;
  onSaveAppearance: (
    appearance: BoardAppearance,
    files: BoardAppearanceFiles,
    expected: BoardAppearance,
  ) => Promise<unknown>;
  onSaveStyleTokens?: (tokens: BoardStyleTokens) => Promise<unknown>;
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
  const [appearance, setAppearance] = useState(() =>
    structuredClone(board.settings.appearance),
  );
  const [styleTokens, setStyleTokens] = useState<BoardStyleTokens>(() =>
    structuredClone(board.settings.styleTokens),
  );
  const accountAssets = useAccountAssets(board.viewer.id);
  const localFonts = useAccountLocalFonts(board.viewer.id);
  const [fontMessage, setFontMessage] = useState("");
  const boardAssets = accountAssets.filter(
    (item) => item.kind === "board_style",
  );
  const [files, setFiles] = useState<BoardAppearanceFiles>({});
  const [previews, setPreviews] = useState<
    Partial<Record<keyof BoardAppearanceFiles, string>>
  >({});
  const previewUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const baseDraft = useRef(
    JSON.stringify({
      name: board.campaign.name,
      appearance: board.settings.appearance,
      styleTokens: board.settings.styleTokens,
    }),
  );
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
    const clean =
      !Object.keys(files).length &&
      JSON.stringify({ name: campaignName, appearance, styleTokens }) ===
        baseDraft.current;
    if (clean || resetOnOpen.current) {
      setCampaignName(board.campaign.name);
      setAppearance(structuredClone(board.settings.appearance));
      setStyleTokens(structuredClone(board.settings.styleTokens));
      setFiles({});
      setPreviews({});
      setError("");
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
      baseDraft.current = JSON.stringify({
        name: board.campaign.name,
        appearance: board.settings.appearance,
        styleTokens: board.settings.styleTokens,
      });
      original.current = board;
      resetOnOpen.current = false;
    }
  }, [anchor]);

  const room = appearance.room;
  const updateRoom = (patch: Partial<BoardAppearance["room"]>) =>
    setAppearance((current) => ({
      ...current,
      room: { ...current.room, ...patch },
    }));

  const chooseAppearanceImage =
    (kind: keyof BoardAppearanceFiles) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      ) {
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
        if (!mounted.current) {
          URL.revokeObjectURL(url);
          return;
        }
        previewUrls.current.push(url);
        setFiles((current) => ({ ...current, [kind]: file }));
        setPreviews((current) => ({ ...current, [kind]: url }));
        setAppearance((current) =>
          kind === "background"
            ? { ...current, room: { ...current.room, kind: "image" } }
            : { ...current, surface: { ...current.surface, kind: "image" } },
        );
        if (kind === "boardTexture") {
          setStyleTokens((current) => ({
            ...current,
            surfaceShader: defaultBoardAmbientShader(),
          }));
        }
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

  return (
    <MenuPopover
      anchor={anchor}
      id="room-settings-menu"
      width={460}
      title="房间配置"
      className="room-settings-dialog hig-popover"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="hig-inspector-segmented"
        role="tablist"
        aria-label="房间设置分类"
      >
        {(
          [
            ["room", "基本与访问", SlidersHorizontal],
            ["appearance", "外观与材质", Palette],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            type="button"
            role="tab"
            key={key}
            id={`room-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`room-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "room"
                  : event.key === "End"
                    ? "appearance"
                    : tab === "room"
                      ? "appearance"
                      : "room";
              setTab(next);
              document.getElementById(`room-tab-${next}`)?.focus();
            }}
            onClick={() => setTab(key)}
          >
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="room-settings-grid">
        <div
          className="hig-editor-sections"
          role="tabpanel"
          id="room-panel-room"
          aria-labelledby="room-tab-room"
          hidden={tab !== "room"}
        >
          <section className="hig-editor-group">
            <span className="hig-section-label">房间信息</span>
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

          <section className="hig-editor-group">
            <span className="hig-section-label">公开参观与分享</span>
            <div className="hig-permission-row">
              <div className="hig-icon-row-copy">
                <Globe2 aria-hidden="true" />
                <div>
                  <strong>允许访客公开参观</strong>
                  <small>
                    {board.settings.isPublic
                      ? "所有持链接访客可只读查看公告板并留言"
                      : "仅房间内成员可查看当前公告板"}
                  </small>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="公开参观"
                aria-checked={board.settings.isPublic}
                className={
                  board.settings.isPublic ? "hig-switch is-on" : "hig-switch"
                }
                disabled={!editable || Boolean(busy)}
                onClick={() =>
                  void run("public", () =>
                    onSetPublic(!board.settings.isPublic),
                  )
                }
              >
                <span className="hig-switch-thumb" />
              </button>
            </div>

            {board.settings.isPublic && (
              <button
                type="button"
                className="hig-inline-add-btn"
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.search = "";
                  url.searchParams.set("visit", board.campaign.id);
                  void navigator.clipboard
                    .writeText(url.toString())
                    .then(() => {
                      setShareCopied(true);
                      window.setTimeout(() => setShareCopied(false), 1600);
                    });
                }}
              >
                <Copy aria-hidden="true" />
                {shareCopied ? "参观链接已复制" : "复制公开参观链接"}
              </button>
            )}
          </section>

          <div className="hig-grouped-list">
            <button
              type="button"
              className="hig-disclosure-row"
              disabled={!!busy}
              onClick={onOpenRoster}
            >
              <Users aria-hidden="true" />
              <span>管理成员与角色资料</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>

        <section
          className="hig-editor-sections media-settings"
          role="tabpanel"
          id="room-panel-appearance"
          aria-labelledby="room-tab-appearance"
          hidden={tab !== "appearance"}
        >
          <div className="hig-editor-group hig-preview-card">
            <AppearancePreview
              appearance={appearance}
              backgroundUrl={previews.background ?? board.settings.backgroundUrl}
              surfaceUrl={
                previews.boardTexture ?? board.settings.boardTextureUrl
              }
            />
          </div>

          <fieldset
            className="hig-editor-group"
            disabled={!editable || Boolean(busy)}
          >
            <span className="hig-section-label">主题氛围预设</span>
            <div className="hig-chip-options">
              {boardAppearancePresets.map((preset) => {
                const active =
                  appearance.frame === preset.appearance.frame &&
                  appearance.surface.kind === preset.appearance.surface.kind &&
                  appearance.room.kind === preset.appearance.room.kind;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    aria-pressed={active}
                    className={active ? "effect-chip is-active" : "effect-chip"}
                    onClick={() => {
                      setAppearance(structuredClone(preset.appearance));
                      setStyleTokens((current) => ({
                        ...current,
                        surfaceShader: defaultBoardAmbientShader(),
                        frameShader: defaultBoardAmbientShader(),
                      }));
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset
            className="hig-editor-group"
            disabled={!editable || Boolean(busy)}
          >
            <span className="hig-section-label">房间背景</span>
            <div className="hig-chip-options">
              {(
                [
                  ["default", "默认"],
                  ["color", "纯色"],
                  ["image", "图片"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={room.kind === value}
                  className={
                    room.kind === value
                      ? "effect-chip is-active"
                      : "effect-chip"
                  }
                  disabled={value === "image" && !room.imagePath && !files.background}
                  onClick={() => updateRoom({ kind: value })}
                >
                  {label}
                </button>
              ))}
              <label className="hig-inline-add-btn file-button">
                <Upload aria-hidden="true" />
                上传背景
                <input
                  type="file"
                  aria-label="选择背景图片"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void chooseAppearanceImage("background")(event)
                  }
                />
              </label>
            </div>

            <ColorField
              label="房间底色"
              accessibleLabel="房间底色"
              value={room.color}
              onChange={(color) => updateRoom({ color })}
              disabled={!editable || !!busy}
            />

            {room.kind !== "color" && (
              <div className="hig-sliders-grid">
                <label className="field">
                  <span>适配方式</span>
                  <select
                    aria-label="背景适配方式"
                    value={room.fit}
                    onChange={(event) =>
                      updateRoom({
                        fit: event.target.value as typeof room.fit,
                      })
                    }
                  >
                    <option value="cover">铺满</option>
                    <option value="contain">完整显示</option>
                    <option value="tile">平铺</option>
                  </select>
                </label>
                <label className="hig-range-field">
                  <span>
                    水平焦点 <strong>{room.positionX}%</strong>
                  </span>
                  <input
                    type="range"
                    aria-label="背景水平焦点"
                    min="0"
                    max="100"
                    value={room.positionX}
                    onChange={(event) =>
                      updateRoom({ positionX: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="hig-range-field">
                  <span>
                    垂直焦点 <strong>{room.positionY}%</strong>
                  </span>
                  <input
                    type="range"
                    aria-label="背景垂直焦点"
                    min="0"
                    max="100"
                    value={room.positionY}
                    onChange={(event) =>
                      updateRoom({ positionY: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            )}

            <label className="hig-range-field">
              <span>
                背景暗化遮罩 <strong>{Math.round(room.dim * 100)}%</strong>
              </span>
              <input
                type="range"
                aria-label="背景暗化"
                min="0"
                max="80"
                value={Math.round(room.dim * 100)}
                onChange={(event) =>
                  updateRoom({ dim: Number(event.target.value) / 100 })
                }
              />
            </label>
          </fieldset>

          <fieldset
            className="hig-editor-group"
            disabled={!editable || Boolean(busy)}
          >
            <span className="hig-section-label">板面材质与外框</span>
            <div className="hig-chip-options">
              {(
                [
                  ["felt", "毛毡黑板"],
                  ["cork", "软木板"],
                  ["paper", "纸质"],
                  ["image", "自定义"],
                ] as const
              ).map(([value, label]) => {
                const isActive = appearance.surface.kind === value;
                return (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={isActive}
                    className={isActive ? "effect-chip is-active" : "effect-chip"}
                    disabled={
                      value === "image" &&
                      !appearance.surface.imagePath &&
                      !files.boardTexture
                    }
                    onClick={() => {
                      setAppearance((current) => ({
                        ...current,
                        surface: { ...current.surface, kind: value },
                      }));
                      setStyleTokens((current) => ({
                        ...current,
                        surfaceShader: defaultBoardAmbientShader(),
                      }));
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <label className="hig-inline-add-btn file-button">
                <Upload aria-hidden="true" />
                上传板面纹理
                <input
                  type="file"
                  aria-label="选择板面纹理"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void chooseAppearanceImage("boardTexture")(event)
                  }
                />
              </label>
            </div>

            <div className="hig-chip-options">
              {(
                [
                  ["wood", "木框"],
                  ["metal", "金属框"],
                  ["burger", "主题框"],
                  ["none", "无边框"],
                ] as const
              ).map(([value, label]) => {
                const isActive = appearance.frame === value;
                return (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={isActive}
                    className={isActive ? "effect-chip is-active" : "effect-chip"}
                    onClick={() => {
                      setAppearance((current) => ({ ...current, frame: value }));
                      setStyleTokens((current) => ({
                        ...current,
                        frameShader: defaultBoardAmbientShader(),
                      }));
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {boardAssets.length > 0 && (
            <fieldset
              className="hig-editor-group"
              disabled={!editable || Boolean(busy)}
            >
              <span className="hig-section-label">我的资产库 · 快速套用</span>
              <div className="hig-asset-quick-list">
                {boardAssets.slice(0, 6).map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    className="hig-asset-quick-chip"
                    onClick={() => {
                      if (asset.payload.kind === "board_style") {
                        setStyleTokens({
                          ...structuredClone(asset.payload.styleTokens),
                          surfaceShader: defaultBoardAmbientShader(),
                          frameShader: defaultBoardAmbientShader(),
                        });
                      }
                    }}
                  >
                    <span
                      className="hig-asset-swatch-dot"
                      style={{
                        background:
                          asset.previewColors.length >= 2
                            ? `linear-gradient(135deg, ${asset.previewColors[0]}, ${asset.previewColors[1]})`
                            : asset.previewColors[0] ?? "#6ab9ff",
                      }}
                      aria-hidden="true"
                    />
                    <span>{asset.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset
            className="hig-editor-group"
            disabled={!editable || Boolean(busy)}
          >
            <span className="hig-section-label">
              <Type size={13} aria-hidden="true" /> 全局字体、字号与本地字体导入
            </span>

            <label className="hig-range-field">
              <span>
                全局字号缩放{" "}
                <strong>{Math.round((styleTokens.fontSizeScale ?? 1) * 100)}%</strong>
              </span>
              <input
                type="range"
                aria-label="全局字号缩放"
                min={0.75}
                max={1.5}
                step={0.05}
                value={styleTokens.fontSizeScale ?? 1}
                onChange={(e) =>
                  setStyleTokens((current) => ({
                    ...current,
                    fontSizeScale: Number(e.target.value),
                  }))
                }
              />
            </label>

            <div className="hig-chip-options">
              {(
                [
                  [0.85, "小 85%"],
                  [1, "标准 100%"],
                  [1.15, "大 115%"],
                  [1.3, "特大 130%"],
                ] as const
              ).map(([val, label]) => (
                <button
                  type="button"
                  key={val}
                  className={
                    Math.abs((styleTokens.fontSizeScale ?? 1) - val) < 0.02
                      ? "effect-chip is-active"
                      : "effect-chip"
                  }
                  onClick={() =>
                    setStyleTokens((current) => ({
                      ...current,
                      fontSizeScale: val,
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="hig-chip-options">
              {(
                [
                  ["handwritten", "手写体"],
                  ["serif", "古典衬线"],
                  ["typewriter", "打字机"],
                  ["mono", "等宽代码"],
                ] as Array<[BoardFontPreset, string]>
              ).map(([preset, label]) => {
                const active =
                  !styleTokens.customFontFamily && styleTokens.fontPreset === preset;
                return (
                  <button
                    type="button"
                    key={preset}
                    aria-pressed={active}
                    className={active ? "effect-chip is-active" : "effect-chip"}
                    onClick={() =>
                      setStyleTokens((current) => ({
                        ...current,
                        fontPreset: preset,
                        customFontFamily: null,
                      }))
                    }
                  >
                    {label}
                  </button>
                );
              })}
              <label className="hig-inline-add-btn file-button">
                <Upload aria-hidden="true" />
                导入本地字体
                <input
                  type="file"
                  aria-label="导入本地字体文件"
                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setError("");
                    setFontMessage("");
                    try {
                      const imported = await importLocalFontFile(
                        board.viewer.id,
                        file,
                      );
                      setStyleTokens((current) => ({
                        ...current,
                        customFontFamily: imported.family,
                      }));
                      setFontMessage(
                        `已导入并启用本地字体「${imported.name}」（保存在本机 IndexedDB，支持离线持久使用）。`,
                      );
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "本地字体导入失败。",
                      );
                    }
                  }}
                />
              </label>
            </div>

            {localFonts.length > 0 && (
              <div className="hig-local-font-list">
                {localFonts.map((font) => {
                  const selected = styleTokens.customFontFamily === font.family;
                  return (
                    <div
                      key={font.id}
                      className={
                        selected
                          ? "hig-local-font-row is-selected"
                          : "hig-local-font-row"
                      }
                    >
                      <button
                        type="button"
                        className="hig-local-font-pick"
                        style={{ fontFamily: `"${font.family}", sans-serif` }}
                        onClick={() =>
                          setStyleTokens((current) => ({
                            ...current,
                            customFontFamily: selected ? null : font.family,
                          }))
                        }
                      >
                        <strong>{font.name}</strong>
                        <small>{formatFontSizeBytes(font.sizeBytes)}</small>
                      </button>
                      <button
                        type="button"
                        className="hig-local-font-del"
                        aria-label={`删除本地字体 ${font.name}`}
                        onClick={() => {
                          void deleteLocalFont(board.viewer.id, font.id);
                          if (selected) {
                            setStyleTokens((current) => ({
                              ...current,
                              customFontFamily: null,
                            }));
                          }
                        }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {fontMessage && (
              <p className="clock-ai-feedback" role="status">
                {fontMessage}
              </p>
            )}
          </fieldset>

          <fieldset
            className="hig-editor-group"
            disabled={!editable || Boolean(busy)}
          >
            <span className="hig-section-label">全局卡片与连线风格</span>
            <div className="hig-chip-options">
              {Object.entries(boardStylePresetLabels).map(([id, preset]) => {
                const active =
                  styleTokens.fontPreset === preset.tokens.fontPreset &&
                  styleTokens.cardStyle === preset.tokens.cardStyle &&
                  styleTokens.linkStyle === preset.tokens.linkStyle;
                return (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={active}
                    className={active ? "effect-chip is-active" : "effect-chip"}
                    onClick={() =>
                      setStyleTokens((current) => ({
                        ...structuredClone(preset.tokens),
                        surfaceShader: current.surfaceShader,
                        frameShader: current.frameShader,
                        clockAppearance: current.clockAppearance,
                        fontSizeScale: current.fontSizeScale,
                        customFontFamily: current.customFontFamily,
                        noteFontSizes: current.noteFontSizes,
                        sectionFontSizes: current.sectionFontSizes,
                        archiveEntries: current.archiveEntries,
                      }))
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>
      </div>

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}

      <footer className="composer-actions hig-sheet-footer">
        <span className="action-spacer" />
        <button
          type="button"
          className="text-button"
          onClick={() => {
            resetOnOpen.current = true;
            onClose();
          }}
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
              const saved = await onSave(
                settingsUpdate(original.current, { name: campaignName.trim() }),
              );
              original.current = applySettingsPatch(original.current, saved);
              const activeFiles: BoardAppearanceFiles = {
                ...(appearance.room.kind === "image" && files.background
                  ? { background: files.background }
                  : {}),
                ...(appearance.surface.kind === "image" && files.boardTexture
                  ? { boardTexture: files.boardTexture }
                  : {}),
              };
              if (
                JSON.stringify(appearance) !==
                  JSON.stringify(board.settings.appearance) ||
                Object.keys(activeFiles).length
              ) {
                await onSaveAppearance(
                  appearance,
                  activeFiles,
                  board.settings.appearance,
                );
              }
              if (
                onSaveStyleTokens &&
                JSON.stringify(styleTokens) !==
                  JSON.stringify(board.settings.styleTokens)
              ) {
                await onSaveStyleTokens(styleTokens);
              }
              resetOnOpen.current = true;
              onClose();
            })
          }
        >
          {busy === "save" ? "保存中…" : "保存配置"}
        </button>
      </footer>
    </MenuPopover>
  );
}
