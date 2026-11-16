import { useState } from "react";
import { normalizeColor } from "../../features/campaign/domain/campaignSettings";

/** The picker and hex input always edit the same normalized color value. */
export function ColorField({ label, value, onChange, disabled, accessibleLabel = label }: {
  label: string; value: string; onChange: (color: string) => void;
  disabled?: boolean; accessibleLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <div className="module-color-field">
    <span>{label}</span>
    <span className="color-inputs">
      <input type="color" className="sign-color-input" value={value} disabled={disabled}
        aria-label={`${accessibleLabel}的取色器`} onChange={(event) => {
          onChange(event.target.value); setDraft(null);
        }} />
      <input type="text" className="color-hex-input" value={draft ?? value} maxLength={7}
        spellCheck={false} autoComplete="off" disabled={disabled} placeholder="#rrggbb"
        aria-label={`${accessibleLabel}的十六进制色号`} onChange={(event) => {
          setDraft(event.target.value);
          const normalized = normalizeColor(event.target.value);
          if (normalized) onChange(normalized);
        }} onBlur={() => setDraft(null)} />
    </span>
  </div>;
}
