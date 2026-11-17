import {
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import {
  campaignDateInYear,
  configureCampaignClockValue,
  materializeCampaignClock,
  normalizeCampaignClock,
  type CampaignClockConfig,
  type CampaignClockMode,
  type CampaignClockStyle,
} from "../../features/campaign/domain/campaignClock";
import { PaperDialog } from "../composer/PaperDialog";
import { NixieDisplay } from "./NixieDisplay";

const modeOptions: Array<{
  value: CampaignClockMode;
  label: string;
}> = [
  { value: "clock", label: "时钟" },
  { value: "countdown", label: "倒计时" },
  { value: "stopwatch", label: "正计时" },
];

const styleOptions: Array<{
  value: CampaignClockStyle;
  label: string;
  sample: string;
}> = [
  { value: "nixie", label: "辉光管", sample: "21:17" },
  { value: "quartz", label: "石英", sample: "10:09" },
  { value: "digital", label: "数字", sample: "18:42" },
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
  // Native date inputs reject year zero, which remains a supported campaign
  // year. Edit its month/day/time directly without exposing a surrogate year.
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
  onClose,
  onSave,
}: {
  config: CampaignClockConfig;
  onClose: () => void;
  onSave: (config: CampaignClockConfig) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => {
    const current = materializeCampaignClock(normalizeCampaignClock(config));
    return current.mode === "countdown" && current.valueMs === 0
      ? { ...current, running: false }
      : current;
  });
  const [eraYearText, setEraYearText] = useState(() => String(draft.eraYear));
  const yearEditDate = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      className="clock-settings-dialog"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
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

          <section className="clock-settings-section">
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
                  onFocus={() => { yearEditDate.current = materializeCampaignClock(draft).valueMs; }}
                  onBlur={() => { yearEditDate.current = null; }}
                  onChange={(event) => setEraYear(event.target.value)}
                />
              </label>
              <output className="clock-era-preview">
                {draft.era || "AD"}.
                {String(draft.eraYear || 0).padStart(4, "0")}
              </output>
            </div>

            {draft.mode === "clock" ? (
              <CampaignDateTimeEditor valueMs={draft.valueMs} onChange={setConfiguredValue} />
            ) : (
              <DurationEditor
                valueMs={draft.valueMs}
                disabled={busy}
                onChange={setConfiguredValue}
              />
            )}
          </section>

          <section className="clock-settings-section">
            <div
              className="clock-style-picker"
              role="radiogroup"
              aria-label="时钟样式"
            >
              {styleOptions.map((option) => (
                <label
                  key={option.value}
                  data-clock-style={option.value}
                  className={
                    draft.style === option.value ? "is-selected" : ""
                  }
                >
                  <input
                    type="radio"
                    name="clock-style"
                    value={option.value}
                    checked={draft.style === option.value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        style: option.value,
                      }))
                    }
                  />
                  <strong aria-hidden="true">
                    {option.value === "nixie" ? (
                      <NixieDisplay text={option.sample} />
                    ) : (
                      option.sample
                    )}
                  </strong>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
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
              {draft.running ? "暂停" : "开始"}
            </button>
            <button type="button" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              复位
            </button>
          </div>
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
