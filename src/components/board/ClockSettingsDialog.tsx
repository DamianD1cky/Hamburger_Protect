import {
  BookmarkPlus,
  Clock3,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { BoardAppearance } from "../../features/campaign/domain/boardAppearance";
import type { BoardStyleTokens } from "../../features/campaign/domain/boardStyleTokens";
import {
  campaignDateInYear,
  configureCampaignClockValue,
  materializeCampaignClock,
  normalizeCampaignClock,
  type CampaignClockConfig,
  type CampaignClockMode,
  type CampaignClockStyle,
} from "../../features/campaign/domain/campaignClock";
import {
  CLOCK_THEME_PRESET_LIST,
  defaultBoardClockAppearance,
  normalizeBoardClockAppearance,
  resolveClockVisual,
  synthesizeClockStyleFromPrompt,
  type BoardClockAppearance,
  type ClockFontStyle,
  type ClockFrameStyle,
} from "../../features/campaign/domain/clockAppearance";
import {
  saveAccountAsset,
  useAccountAssets,
} from "../../features/assets/accountAssetLibrary";
import { useAccountLocalFonts } from "../../features/fonts/localFontLibrary";
import { PaperDialog } from "../composer/PaperDialog";
import { BoardClock } from "./BoardClock";
import { ColorField } from "./ColorField";

const modeOptions: Array<{
  value: CampaignClockMode;
  label: string;
}> = [
  { value: "clock", label: "时钟" },
  { value: "countdown", label: "倒计时" },
  { value: "stopwatch", label: "正计时" },
];

const dialOptions: Array<{
  value: CampaignClockStyle;
  label: string;
  desc: string;
}> = [
  { value: "digital", label: "电子数字", desc: "清晰等宽数码读数" },
  { value: "nixie", label: "辉光管", desc: "经典阴极辉光灯管" },
  { value: "quartz", label: "宫廷石英钟", desc: "古代宫廷鎏金珐琅 Shader" },
];

const AI_CLOCK_PROMPTS = [
  "赛博紫霓虹全息矩阵扫描线时钟",
  "星象奥术天文怀表，蓝金辉光",
  "复古羊皮纸黄铜古典怀表",
  "熔岩余烬锻铁辉光管计时器",
  "深海极光透明毛玻璃现代时钟",
];

function durationParts(valueMs: number) {
  const total = Math.max(0, Math.floor(valueMs / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function localDateTime(valueMs: number) {
  const date = new Date(valueMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function CampaignDateTimeEditor({ valueMs, onChange }: {
  valueMs: number; onChange: (valueMs: number) => void;
}) {
  const dateTime = localDateTime(valueMs);
  const date = new Date(valueMs);
  if (date.getFullYear() === 0) {
    const end = new Date(date);
    end.setMonth(date.getMonth() + 1, 0);
    const changeDate = (month: number, day: number) => {
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) return;
      const next = new Date(date);
      next.setDate(1);
      next.setMonth(month - 1);
      const last = new Date(next);
      last.setMonth(month, 0);
      next.setDate(Math.min(day, last.getDate()));
      onChange(next.getTime());
    };
    return <div className="clock-duration-fields clock-zero-date-fields">
      <label><span>月</span><input type="number" aria-label="月份" min={1} max={12} required
        value={date.getMonth() + 1} onChange={(event) => changeDate(Number(event.target.value), date.getDate())} /></label>
      <label><span>日</span><input type="number" aria-label="日期" min={1} max={end.getDate()} required
        value={date.getDate()} onChange={(event) => changeDate(date.getMonth() + 1, Number(event.target.value))} /></label>
      <label><span>时间</span><input type="time" aria-label="时间" step={1} required value={dateTime.slice(11)}
        onChange={(event) => {
          if (!event.target.value) return;
          const [hours, minutes, seconds = 0] = event.target.value.split(":").map(Number);
          const next = new Date(date);
          next.setHours(hours, minutes, seconds, 0);
          onChange(next.getTime());
        }} /></label>
    </div>;
  }
  return <label className="field clock-datetime-field">
    <span>日期与时间</span>
    <input type="datetime-local" aria-label="日期与时间" step="1" required
      min="0001-01-01T00:00:00" max="9999-12-31T23:59:59" value={dateTime}
      onChange={(event) => {
        const value = new Date(event.target.value).getTime();
        if (Number.isFinite(value)) onChange(value);
      }} />
  </label>;
}

function DurationEditor({
  valueMs,
  disabled,
  onChange,
}: {
  valueMs: number;
  disabled: boolean;
  onChange: (valueMs: number) => void;
}) {
  const parts = durationParts(valueMs);
  const update = (
    key: keyof ReturnType<typeof durationParts>,
    value: number,
  ) => {
    const next = {
      ...parts,
      [key]: Math.max(0, Math.floor(value || 0)),
    };
    onChange(
      ((next.hours * 60 + Math.min(59, next.minutes)) * 60 +
        Math.min(59, next.seconds)) *
        1000,
    );
  };
  return (
    <div className="clock-duration-fields">
      <label>
        <span>时</span>
        <input
          type="number"
          min="0"
          max="9999"
          value={parts.hours}
          disabled={disabled}
          onChange={(event) => update("hours", Number(event.target.value))}
        />
      </label>
      <label>
        <span>分</span>
        <input
          type="number"
          min="0"
          max="59"
          value={parts.minutes}
          disabled={disabled}
          onChange={(event) => update("minutes", Number(event.target.value))}
        />
      </label>
      <label>
        <span>秒</span>
        <input
          type="number"
          min="0"
          max="59"
          value={parts.seconds}
          disabled={disabled}
          onChange={(event) => update("seconds", Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export function ClockSettingsDialog({
  config,
  boardAppearance,
  styleTokens,
  ownerId,
  onClose,
  onSave,
}: {
  config: CampaignClockConfig;
  boardAppearance?: BoardAppearance;
  styleTokens?: BoardStyleTokens;
  ownerId?: string;
  onClose: () => void;
  onSave: (
    config: CampaignClockConfig,
    clockAppearance?: BoardClockAppearance,
  ) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"time" | "style">("time");
  const [draft, setDraft] = useState(() => {
    const current = materializeCampaignClock(normalizeCampaignClock(config));
    return current.mode === "countdown" && current.valueMs === 0
      ? { ...current, running: false }
      : current;
  });
  const [clockAppearance, setClockAppearance] = useState<BoardClockAppearance>(() =>
    normalizeBoardClockAppearance(styleTokens?.clockAppearance),
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiFeedback, setAiFeedback] = useState("");
  const [eraYearText, setEraYearText] = useState(() => String(draft.eraYear));
  const yearEditDate = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clockAssets = useAccountAssets(ownerId ?? "local-guest", "clock_style");
  const localFonts = useAccountLocalFonts(ownerId ?? "local-guest");
  const resolvedVisual = resolveClockVisual(clockAppearance, boardAppearance, {
    cardStyle: styleTokens?.cardStyle,
    surfaceShader: styleTokens?.surfaceShader?.shader,
  });

  const setMode = (mode: CampaignClockMode) => {
    if (mode === draft.mode) return;
    const now = new Date();
    const valueMs =
      mode === "clock"
        ? campaignDateInYear(now.getTime(), draft.eraYear)
        : mode === "countdown"
          ? 60 * 60 * 1000
          : 0;
    const next = configureCampaignClockValue({
      ...draft,
      mode,
      running: mode === "clock",
    }, valueMs, now);
    setDraft(next);
    setEraYearText(String(next.eraYear));
    yearEditDate.current = null;
  };

  const setConfiguredValue = (valueMs: number) => {
    const next = configureCampaignClockValue(draft, valueMs);
    setDraft(next);
    setEraYearText(String(next.eraYear));
    yearEditDate.current = null;
  };

  const setEraYear = (text: string) => {
    setEraYearText(text);
    const year = Number(text);
    if (!text || !Number.isInteger(year) || year < 0 || year > 9999) return;
    if (draft.mode === "clock") {
      yearEditDate.current ??= materializeCampaignClock(draft).valueMs;
      setDraft(configureCampaignClockValue(draft, campaignDateInYear(yearEditDate.current, year)));
    } else {
      setDraft((current) => ({ ...current, eraYear: year }));
    }
  };

  const setRunning = (running: boolean) => {
    const next = { ...materializeCampaignClock(draft), running };
    setDraft(next);
    setEraYearText(String(next.eraYear));
  };

  const reset = () => {
    const next = {
      ...draft,
      eraYear: draft.mode === "clock" ? new Date(draft.initialValueMs).getFullYear() : draft.eraYear,
      valueMs: draft.initialValueMs,
      running: false,
      referenceAt: new Date().toISOString(),
    };
    setDraft(next);
    setEraYearText(String(next.eraYear));
    yearEditDate.current = null;
  };

  const patchCustomAppearance = (partial: Partial<BoardClockAppearance>) => {
    setClockAppearance((current) => {
      const base = resolveClockVisual(current, boardAppearance, {
        cardStyle: styleTokens?.cardStyle,
        surfaceShader: styleTokens?.surfaceShader?.shader,
      });
      return normalizeBoardClockAppearance({
        ...current,
        preset: "custom",
        label: current.label || "自定义时钟样式",
        surfaceColor: current.surfaceColor ?? base.surfaceColor,
        borderColor: current.borderColor ?? base.borderColor,
        textColor: current.textColor ?? base.textColor,
        accentColor: current.accentColor ?? base.accentColor,
        glowColor: current.glowColor ?? base.glowColor,
        fontStyle: current.fontStyle ?? base.fontStyle,
        frameStyle: current.frameStyle ?? base.frameStyle,
        glowStrength: current.glowStrength ?? base.glowStrength,
        ...partial,
      });
    });
  };

  const generateWithAi = (inputPrompt?: string) => {
    const text = (inputPrompt ?? aiPrompt).trim();
    if (!text) return;
    const { appearance, recommendedDial, reply } = synthesizeClockStyleFromPrompt(text);
    setClockAppearance(appearance);
    setDraft((current) => ({ ...current, style: recommendedDial }));
    setAiPrompt(text);
    if (ownerId) {
      saveAccountAsset(ownerId, {
        name: appearance.label || "AI 定制时钟",
        description: appearance.aiPrompt || text,
        source: "ai",
        prompt: text,
        previewColors: [
          appearance.surfaceColor || "#182028",
          appearance.accentColor || "#2be4dc",
          appearance.borderColor || "#b8905c",
        ],
        payload: {
          kind: "clock_style",
          clockStyle: recommendedDial,
          clockAppearance: appearance,
        },
      });
      setAiFeedback(`${reply} 已自动收入「我的资产库」。`);
    } else {
      setAiFeedback(reply);
    }
  };

  const saveCurrentToAssetLibrary = () => {
    if (!ownerId) return;
    const snapshot: BoardClockAppearance =
      clockAppearance.preset === "custom"
        ? clockAppearance
        : {
            ...defaultBoardClockAppearance(),
            preset: "custom",
            label: `${resolvedVisual.label} · 定制`,
            surfaceColor: resolvedVisual.surfaceColor,
            borderColor: resolvedVisual.borderColor,
            textColor: resolvedVisual.textColor,
            accentColor: resolvedVisual.accentColor,
            glowColor: resolvedVisual.glowColor,
            fontStyle: resolvedVisual.fontStyle,
            frameStyle: resolvedVisual.frameStyle,
            scanlines: resolvedVisual.scanlines,
            glowStrength: resolvedVisual.glowStrength,
          };
    saveAccountAsset(ownerId, {
      name: snapshot.label || "我的时钟样式",
      description: `表盘：${dialOptions.find((d) => d.value === draft.style)?.label ?? draft.style}`,
      source: "custom",
      previewColors: [
        resolvedVisual.surfaceColor,
        resolvedVisual.accentColor,
        resolvedVisual.borderColor,
      ],
      payload: {
        kind: "clock_style",
        clockStyle: draft.style,
        clockAppearance: snapshot,
      },
    });
    setAiFeedback("已保存到当前账号的「我的资产库」。");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const era = draft.era.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(era)) {
      setError("纪元代号必须是两个英文字母。");
      return;
    }
    if (
      !Number.isInteger(draft.eraYear) ||
      draft.eraYear < 0 ||
      draft.eraYear > 9999
    ) {
      setError("纪年需要在 0–9999 之间。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(
        materializeCampaignClock({
          ...draft,
          era,
        }),
        clockAppearance,
      );
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "时钟设置保存失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaperDialog
      title="战役时钟"
      className="clock-settings-dialog hig-clock-dialog"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="clock-live-preview-stage">
            <BoardClock
              config={draft}
              clockAppearance={clockAppearance}
              boardAppearance={boardAppearance}
              styleTokens={styleTokens}
              preview
            />
            <span className="clock-preview-caption">
              当前样式：{resolvedVisual.label} ·{" "}
              {dialOptions.find((d) => d.value === draft.style)?.label}
            </span>
          </div>

          <div
            className="hig-inspector-segmented clock-dialog-segmented"
            role="tablist"
            aria-label="时钟设置分页"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "time"}
              onClick={() => setTab("time")}
            >
              <Clock3 aria-hidden="true" />
              时间与模式
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "style"}
              onClick={() => setTab("style")}
            >
              <Palette aria-hidden="true" />
              主题与 AI 样式
            </button>
          </div>

          {tab === "time" ? (
            <div className="hig-editor-sections">
              <section className="hig-editor-group">
                <span className="hig-section-label">计时模式</span>
                <div
                  className="clock-mode-tabs"
                  role="tablist"
                  aria-label="计时模式"
                >
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={draft.mode === option.value}
                      className={draft.mode === option.value ? "is-active" : ""}
                      onClick={() => setMode(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="hig-editor-group">
                <span className="hig-section-label">纪元与时间</span>
                <div className="clock-era-fields">
                  <label className="field">
                    <span>纪元</span>
                    <input
                      value={draft.era}
                      maxLength={2}
                      autoCapitalize="characters"
                      spellCheck={false}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          era: event.target.value
                            .replace(/[^a-z]/gi, "")
                            .toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>纪年</span>
                    <input
                      type="number"
                      aria-label="纪年"
                      min="0"
                      max="9999"
                      step="1"
                      required
                      value={eraYearText}
                      onFocus={() => {
                        yearEditDate.current = materializeCampaignClock(draft).valueMs;
                      }}
                      onBlur={() => {
                        yearEditDate.current = null;
                      }}
                      onChange={(event) => setEraYear(event.target.value)}
                    />
                  </label>
                  <output className="clock-era-preview">
                    {draft.era || "AD"}.
                    {String(draft.eraYear || 0).padStart(4, "0")}
                  </output>
                </div>

                {draft.mode === "clock" ? (
                  <CampaignDateTimeEditor
                    valueMs={draft.valueMs}
                    onChange={setConfiguredValue}
                  />
                ) : (
                  <DurationEditor
                    valueMs={draft.valueMs}
                    disabled={busy}
                    onChange={setConfiguredValue}
                  />
                )}
              </section>

              <div className="clock-run-controls">
                <button
                  type="button"
                  className={draft.running ? "is-active" : ""}
                  onClick={() => setRunning(!draft.running)}
                >
                  {draft.running ? (
                    <Pause aria-hidden="true" />
                  ) : (
                    <Play aria-hidden="true" />
                  )}
                  {draft.running ? "暂停走时" : "开始走时"}
                </button>
                <button type="button" onClick={reset}>
                  <RotateCcw aria-hidden="true" />
                  复位基准
                </button>
              </div>
            </div>
          ) : (
            <div className="hig-editor-sections">
              <section className="hig-editor-group">
                <span className="hig-section-label">表盘显示引擎</span>
                <div
                  className="clock-dial-grid"
                  role="radiogroup"
                  aria-label="时钟样式"
                >
                  {dialOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      role="radio"
                      aria-checked={draft.style === option.value}
                      className={
                        draft.style === option.value
                          ? "clock-dial-card is-selected"
                          : "clock-dial-card"
                      }
                      onClick={() =>
                        setDraft((current) => ({ ...current, style: option.value }))
                      }
                    >
                      <strong>{option.label}</strong>
                      <small>{option.desc}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="hig-editor-group">
                <span className="hig-section-label">主题配套时钟样式</span>
                <div className="clock-theme-grid" role="radiogroup" aria-label="主题配套样式">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={clockAppearance.preset === "auto"}
                    className={
                      clockAppearance.preset === "auto"
                        ? "clock-theme-card is-selected"
                        : "clock-theme-card"
                    }
                    onClick={() =>
                      setClockAppearance(defaultBoardClockAppearance())
                    }
                  >
                    <span
                      className="clock-theme-swatch"
                      style={{
                        background:
                          "linear-gradient(135deg, #261f1a 0%, #1b2229 50%, #efe2c6 100%)",
                      }}
                    />
                    <strong>自动跟随主题</strong>
                    <small>随当前板面预设智能切换</small>
                  </button>
                  {CLOCK_THEME_PRESET_LIST.map((preset) => {
                    const selected = clockAppearance.preset === preset.id;
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        role="radio"
                        aria-checked={selected}
                        className={
                          selected
                            ? "clock-theme-card is-selected"
                            : "clock-theme-card"
                        }
                        onClick={() => {
                          setClockAppearance({
                            ...defaultBoardClockAppearance(),
                            preset: preset.id,
                            label: preset.label,
                            fontStyle: preset.fontStyle,
                            frameStyle: preset.frameStyle,
                            scanlines: preset.scanlines,
                            glowStrength: preset.glowStrength,
                          });
                          setDraft((current) => ({
                            ...current,
                            style: preset.recommendedDial,
                          }));
                        }}
                      >
                        <span
                          className="clock-theme-swatch"
                          style={{
                            background: `linear-gradient(135deg, ${preset.surfaceColor} 0%, ${preset.accentColor} 100%)`,
                            borderColor: preset.borderColor,
                          }}
                        />
                        <strong>{preset.label}</strong>
                        <small>{preset.tagline}</small>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="hig-editor-group clock-ai-box">
                <span className="hig-section-label">
                  <Sparkles size={13} aria-hidden="true" /> AI 定制时钟样式（自动存入账号资产库）
                </span>
                <div className="clock-ai-input-row">
                  <input
                    type="text"
                    aria-label="AI 时钟样式描述"
                    value={aiPrompt}
                    maxLength={140}
                    placeholder="例如：复古黄铜蒸汽朋克辉光管、赛博紫红扫描线..."
                    onChange={(event) => setAiPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        generateWithAi();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="clock-ai-generate-btn"
                    disabled={!aiPrompt.trim()}
                    onClick={() => generateWithAi()}
                  >
                    <WandSparkles size={14} aria-hidden="true" />
                    生成
                  </button>
                </div>
                <div className="hig-chip-options">
                  {AI_CLOCK_PROMPTS.map((sample) => (
                    <button
                      type="button"
                      key={sample}
                      className="effect-chip"
                      onClick={() => generateWithAi(sample)}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                {aiFeedback && (
                  <p className="clock-ai-feedback" role="status">
                    {aiFeedback}
                  </p>
                )}
              </section>

              {clockAssets.length > 0 && (
                <section className="hig-editor-group">
                  <span className="hig-section-label">我的资产库 · 时钟样式</span>
                  <div className="hig-asset-quick-list">
                    {clockAssets.slice(0, 8).map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        className="hig-asset-quick-chip"
                        onClick={() => {
                          const payload = asset.payload;
                          if (payload.kind !== "clock_style") return;
                          setClockAppearance(
                            structuredClone(payload.clockAppearance),
                          );
                          const dial = payload.clockStyle;
                          if (dial) {
                            setDraft((current) => ({
                              ...current,
                              style: dial,
                            }));
                          }
                          setAiFeedback(`已从资产库套用「${asset.name}」。`);
                        }}
                      >
                        <span
                          className="hig-asset-swatch-dot"
                          style={{
                            background:
                              asset.previewColors.length >= 2
                                ? `linear-gradient(135deg, ${asset.previewColors[0]}, ${asset.previewColors[1]})`
                                : asset.previewColors[0] ?? "#7cc4ff",
                          }}
                          aria-hidden="true"
                        />
                        <span>{asset.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="hig-editor-group">
                <div className="clock-custom-head">
                  <span className="hig-section-label">精细色彩与质感微调</span>
                  {ownerId && (
                    <button
                      type="button"
                      className="hig-inline-add-btn"
                      onClick={saveCurrentToAssetLibrary}
                    >
                      <BookmarkPlus size={14} aria-hidden="true" />
                      存入资产库
                    </button>
                  )}
                </div>
                <div className="clock-custom-colors">
                  <ColorField
                    label="表盘底色"
                    value={resolvedVisual.surfaceColor}
                    onChange={(surfaceColor) =>
                      patchCustomAppearance({ surfaceColor })
                    }
                  />
                  <ColorField
                    label="边框色"
                    value={resolvedVisual.borderColor}
                    onChange={(borderColor) =>
                      patchCustomAppearance({ borderColor })
                    }
                  />
                  <ColorField
                    label="数字与文字色"
                    value={resolvedVisual.textColor}
                    onChange={(textColor) =>
                      patchCustomAppearance({ textColor })
                    }
                  />
                  <ColorField
                    label="强调与辉光色"
                    value={resolvedVisual.accentColor}
                    onChange={(accentColor) =>
                      patchCustomAppearance({ accentColor, glowColor: accentColor })
                    }
                  />
                </div>
                <div className="hig-sliders-grid">
                  <label className="field">
                    <span>字体风格</span>
                    <select
                      aria-label="时钟字体风格"
                      value={
                        resolvedVisual.customFontFamily
                          ? `local:${resolvedVisual.customFontFamily}`
                          : resolvedVisual.fontStyle
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith("local:")) {
                          patchCustomAppearance({
                            customFontFamily: val.slice(6),
                          });
                        } else {
                          patchCustomAppearance({
                            fontStyle: val as ClockFontStyle,
                            customFontFamily: null,
                          });
                        }
                      }}
                    >
                      <option value="mono">等宽数码 (Mono)</option>
                      <option value="display">现代无衬线 (Display)</option>
                      <option value="serif">古典衬线 (Serif)</option>
                      <option value="handwritten">手写体 (Handwritten)</option>
                      {localFonts.map((font) => (
                        <option key={font.id} value={`local:${font.family}`}>
                          本地字体：{font.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>外壳质感</span>
                    <select
                      aria-label="时钟外壳质感"
                      value={resolvedVisual.frameStyle}
                      onChange={(e) =>
                        patchCustomAppearance({
                          frameStyle: e.target.value as ClockFrameStyle,
                        })
                      }
                    >
                      <option value="glass">液态毛玻璃</option>
                      <option value="bezel">金属 / 木框仪表</option>
                      <option value="parchment">羊皮卷宗</option>
                      <option value="terminal">全息终端</option>
                    </select>
                  </label>
                </div>
                <div className="clock-extra-toggles">
                  <label className="hig-range-field" style={{ flex: 1 }}>
                    <span>
                      时钟字号 <strong>{resolvedVisual.fontSize}px</strong>
                    </span>
                    <input
                      type="range"
                      aria-label="时钟数字字号"
                      min="14"
                      max="34"
                      step="1"
                      value={resolvedVisual.fontSize}
                      onChange={(e) =>
                        patchCustomAppearance({
                          fontSize: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="hig-range-field" style={{ flex: 1 }}>
                    <span>
                      辉光强度 <strong>{resolvedVisual.glowStrength.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={resolvedVisual.glowStrength}
                      onChange={(e) =>
                        patchCustomAppearance({
                          glowStrength: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="clock-scanline-check">
                    <input
                      type="checkbox"
                      checked={resolvedVisual.scanlines}
                      onChange={(e) =>
                        patchCustomAppearance({ scanlines: e.target.checked })
                      }
                    />
                    <span>全息扫描线</span>
                  </label>
                </div>
              </section>
            </div>
          )}
        </fieldset>
        {error && <p className="access-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存共享时钟"}
          </button>
        </div>
      </form>
    </PaperDialog>
  );
}
