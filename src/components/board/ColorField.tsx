import { useState } from "react";
import {
  hexToRgb,
  normalizeColor,
  rgbToHex,
} from "../../features/campaign/domain/campaignSettings";

/**
 * 全站统一取色控件（模块标题、事件钟、自由展板、房间底色、便签底色、图钉颜色共用）：
 * - 原生圆形取色盘 + #rrggbb / rgb() 输入框 + R / G / B 三通道纯文本数字输入（无上下微调箭头）；
 * - 遵循 Apple HIG 清晰与一致性原则，全站所有颜色入口外观与交互完全统一。
 */
export function ColorField({
  label,
  value,
  onChange,
  disabled,
  accessibleLabel = label,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  accessibleLabel?: string;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [rgbDraft, setRgbDraft] = useState<{
    index: 0 | 1 | 2;
    text: string;
  } | null>(null);

  const hex = normalizeColor(value) ?? "#e8d786";
  const rgb = hexToRgb(hex);

  const handleChannelChange = (index: 0 | 1 | 2, raw: string) => {
    const digitsOnly = raw.replace(/\D/g, "").slice(0, 3);
    setRgbDraft({ index, text: digitsOnly });
    if (digitsOnly === "") return;
    const clamped = Math.max(0, Math.min(255, Number.parseInt(digitsOnly, 10)));
    const next: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
    next[index] = clamped;
    setHexDraft(null);
    onChange(rgbToHex(next[0], next[1], next[2]));
  };

  const commitChannelBlur = (index: 0 | 1 | 2) => {
    if (rgbDraft && rgbDraft.index === index && rgbDraft.text === "") {
      const next: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
      next[index] = 0;
      onChange(rgbToHex(next[0], next[1], next[2]));
    }
    setRgbDraft(null);
  };

  const channelValue = (index: 0 | 1 | 2) =>
    rgbDraft?.index === index ? rgbDraft.text : String(rgb[index]);

  return (
    <div className="module-color-field unified-color-field">
      <div className="unified-color-head">
        <span>{label}</span>
      </div>

      <div className="color-inputs unified-color-inputs">
        <label className="color-well-wrap" title={`选择${accessibleLabel}`}>
          <input
            type="color"
            className="sign-color-input"
            value={hex}
            disabled={disabled}
            aria-label={`${accessibleLabel}的取色器`}
            onChange={(event) => {
              onChange(event.target.value.toLowerCase());
              setHexDraft(null);
              setRgbDraft(null);
            }}
          />
          <span
            className="color-well-swatch"
            style={{ background: hex }}
            aria-hidden="true"
          />
        </label>

        <input
          type="text"
          className="color-hex-input"
          value={hexDraft ?? hex}
          maxLength={22}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          placeholder="#rrggbb"
          aria-label={`${accessibleLabel}的十六进制色号`}
          onChange={(event) => {
            setHexDraft(event.target.value);
            const normalized = normalizeColor(event.target.value);
            if (normalized) {
              setRgbDraft(null);
              onChange(normalized);
            }
          }}
          onBlur={() => setHexDraft(null)}
        />

        <div
          className="color-rgb-triplet"
          role="group"
          aria-label={`${accessibleLabel} RGB 数值`}
        >
          {(
            [
              [0, "R", "Red (0-255)"],
              [1, "G", "Green (0-255)"],
              [2, "B", "Blue (0-255)"],
            ] as const
          ).map(([idx, tag, title]) => (
            <label key={tag} title={title}>
              <i>{tag}</i>
              <input
                type="text"
                className="rgb-channel-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                aria-label={`${accessibleLabel} ${tag}`}
                value={channelValue(idx)}
                onChange={(e) => handleChannelChange(idx, e.target.value)}
                onBlur={() => commitChannelBlur(idx)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
