export type CampaignClockMode = "clock" | "countdown" | "stopwatch";
export type CampaignClockStyle = "nixie" | "quartz" | "digital";

export interface CampaignClockConfig {
  mode: CampaignClockMode;
  style: CampaignClockStyle;
  era: string;
  eraYear: number;
  running: boolean;
  valueMs: number;
  initialValueMs: number;
  referenceAt: string;
}

const modes = new Set<CampaignClockMode>([
  "clock",
  "countdown",
  "stopwatch",
]);
const styles = new Set<CampaignClockStyle>([
  "nixie",
  "quartz",
  "digital",
]);

export function defaultCampaignClock(now = new Date()): CampaignClockConfig {
  return {
    mode: "clock",
    style: "digital",
    era: "AD",
    eraYear: now.getFullYear(),
    running: true,
    valueMs: now.getTime(),
    initialValueMs: now.getTime(),
    referenceAt: now.toISOString(),
  };
}

export function normalizeCampaignClock(
  value: Partial<CampaignClockConfig> | null | undefined,
  now = new Date(),
): CampaignClockConfig {
  const fallback = defaultCampaignClock(now);
  if (!value) return fallback;
  const mode = modes.has(value.mode as CampaignClockMode)
    ? (value.mode as CampaignClockMode)
    : fallback.mode;
  const style = styles.has(value.style as CampaignClockStyle)
    ? (value.style as CampaignClockStyle)
    : fallback.style;
  const era = String(value.era ?? fallback.era).toUpperCase();
  const eraYear = Number(value.eraYear);
  const valueMs = Number(value.valueMs);
  const initialValueMs = Number(value.initialValueMs);
  const referenceAt = new Date(value.referenceAt ?? fallback.referenceAt);
  return {
    mode,
    style,
    era: /^[A-Z]{2}$/.test(era) ? era : fallback.era,
    eraYear:
      Number.isInteger(eraYear) && eraYear >= 0 && eraYear <= 9999
        ? eraYear
        : fallback.eraYear,
    running: Boolean(value.running),
    valueMs:
      Number.isFinite(valueMs) && valueMs >= 0 ? valueMs : fallback.valueMs,
    initialValueMs:
      Number.isFinite(initialValueMs) && initialValueMs >= 0
        ? initialValueMs
        : fallback.initialValueMs,
    referenceAt: Number.isNaN(referenceAt.getTime())
      ? fallback.referenceAt
      : referenceAt.toISOString(),
  };
}

export function campaignClockValue(
  config: CampaignClockConfig,
  now = Date.now(),
) {
  if (!config.running) return config.valueMs;
  const reference = new Date(config.referenceAt).getTime();
  const elapsed = Math.max(0, now - reference);
  return config.mode === "countdown"
    ? Math.max(0, config.valueMs - elapsed)
    : config.valueMs + elapsed;
}

export function materializeCampaignClock(
  config: CampaignClockConfig,
  now = new Date(),
): CampaignClockConfig {
  return {
    ...config,
    valueMs: campaignClockValue(config, now.getTime()),
    referenceAt: now.toISOString(),
  };
}

export function formatClockDuration(valueMs: number) {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value, index) =>
      index === 0
        ? String(value).padStart(2, "0")
        : String(value).padStart(2, "0"),
    )
    .join(":");
}
