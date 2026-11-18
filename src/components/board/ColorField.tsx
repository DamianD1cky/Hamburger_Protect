import { useState } from "react";
import {
  hexToRgb,
  normalizeColor,
  rgbToHex,
} from "../../features/campaign/domain/campaignSettings";

export interface ColorPresetOption {
  value: string;
  label: string;
}

/**
 * 全站统一取色控件（模块标题、事件钟、自由展板、便签纸张底色、图钉颜色共用）：
 * 支持原生取色盘、#rrggbb / rgb(r,g,b) 文本输入、R/G/B 0-255 数值微调以及可选预设快捷色点。
 */
export function ColorField({
  label,
  value,
  onChange,
  disabled,
  accessibleLabel = label,
  presets,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  accessibleLabel?: string;
  presets?: readonly ColorPresetOption[];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const hex = normalizeColor(value) ?? "#e8d786";
  const [r, g, b] = hexToRgb(hex);

  const updateChannel = (index: 0 | 1 | 2, rawVal: string) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(rawVal) || 0)));
    const next: [number, number, number] = [r, g, b];
    next[index] = n;
    setDraft(null);
    onChange(rgbToHex(next[0], next[1], next[2]));
  };

  return (
    <div className="module-color-field unified-color-field">
      <div className="unified-color-head">
        <span>{label}</span>
        {presets && presets.length > 0 && (
          <span className="unified-color-presets" role="group" aria-label={`${accessibleLabel}快捷预设`}>
            {presets.map((p) => {
              const pHex = normalizeColor(p.value) ?? p.value;
              const isCurrent = pHex.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  type="button"
                  key={p.value}
                  disabled={disabled}
                  title={`${p.label} (${pHex})`}
                  aria-label={`设为${p.label}`}
                  aria-pressed={isCurrent}
                  className={isCurrent ? "color-preset-dot is-active" : "color-preset-dot"}
                  style={{ background: pHex }}
                  onClick={() => {
                    setDraft(null);
                    onChange(pHex);
                  }}
                />
              );
            })}
          </span>
        )}
      </div>

      <span className="color-inputs unified-color-inputs">
        <input
          type="color"
          className="sign-color-input"
          value={hex}
          disabled={disabled}
          aria-label={`${accessibleLabel}的取色器`}
          onChange={(event) => {
            onChange(event.target.value.toLowerCase());
            setDraft(null);
          }}
        />
        <input
          type="text"
          className="color-hex-input"
          value={draft ?? hex}
          maxLength={22}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          placeholder="#rrggbb 或 rgb()"
          aria-label={`${accessibleLabel}的十六进制色号`}
          onChange={(event) => {
            setDraft(event.target.value);
            const normalized = normalizeColor(event.target.value);
            if (normalized) onChange(normalized);
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="color-rgb-triplet" aria-label={`${accessibleLabel} RGB 数值`}>
          <label title="Red (0-255)">
            <i>R</i>
            <input
              type="number"
              min={0}
              max={255}
              disabled={disabled}
              aria-label={`${accessibleLabel} R`}
              value={r}
              onChange={(e) => updateChannel(0, e.target.value)}
            />
          </label>
          <label title="Green (0-255)">
            <i>G</i>
            <input
              type="number"
              min={0}
              max={255}
              disabled={disabled}
              aria-label={`${accessibleLabel} G`}
              value={g}
              onChange={(e) => updateChannel(1, e.target.value)}
            />
          </label>
          <label title="Blue (0-255)">
            <i>B</i>
            <input
              type="number"
              min={0}
              max={255}
              disabled={disabled}
              aria-label={`${accessibleLabel} B`}
              value={b}
              onChange={(e) => updateChannel(2, e.target.value)}
            />
          </label>
        </span>
      </span>
    </div>
  );
}
