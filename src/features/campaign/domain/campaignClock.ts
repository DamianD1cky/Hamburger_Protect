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
  calendarVersion?: 1;
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

/** Signed timestamps are needed for campaign years before 1970. Reserve one
 * day at each UTC edge so local dates also fit in UTC±14 time zones. */
export const CAMPAIGN_CLOCK_MIN_MS = -62167305600000;
export const CAMPAIGN_CLOCK_MAX_MS = 253402387199999;

/** Date constructors interpret 0–99 as 1900–1999. setFullYear preserves the
 * literal campaign year; clamping the day keeps Feb 29 in February. */
export function campaignDateInYear(valueMs: number, year: number) {
  const date = new Date(valueMs);
  const month = date.getMonth(), day = date.getDate();
  date.setDate(1);
  date.setFullYear(year);
  const end = new Date(date);
  end.setMonth(month + 1, 0);
  date.setDate(Math.min(day, end.getDate()));
  return date.getTime();
}

export function configureCampaignClockValue(
  config: CampaignClockConfig,
  valueMs: number,
  now = new Date(),
): CampaignClockConfig {
  return {
    ...config,
    eraYear: config.mode === "clock" ? new Date(valueMs).getFullYear() : config.eraYear,
    valueMs,
    initialValueMs: valueMs,
    referenceAt: now.toISOString(),
    calendarVersion: 1,
  };
}

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
    calendarVersion: 1,
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
  const normalized: CampaignClockConfig = {
    mode,
    style,
    era: /^[A-Z]{2}$/.test(era) ? era : fallback.era,
    eraYear:
      Number.isInteger(eraYear) && eraYear >= 0 && eraYear <= 9999
        ? eraYear
        : fallback.eraYear,
    running: Boolean(value.running),
    valueMs:
      Number.isFinite(valueMs) && valueMs >= (mode === "clock" ? CAMPAIGN_CLOCK_MIN_MS : 0) &&
      valueMs <= CAMPAIGN_CLOCK_MAX_MS ? valueMs : fallback.valueMs,
    initialValueMs:
      Number.isFinite(initialValueMs) && initialValueMs >= (mode === "clock" ? CAMPAIGN_CLOCK_MIN_MS : 0) &&
      initialValueMs <= CAMPAIGN_CLOCK_MAX_MS
        ? initialValueMs
        : fallback.initialValueMs,
    referenceAt: Number.isNaN(referenceAt.getTime())
      ? fallback.referenceAt
      : referenceAt.toISOString(),
  };
  // Legacy clocks stored the year label separately. Align their date once on
  // read, preserving the reference time and the reset date's relative year.
  if (mode === "clock" && value.calendarVersion !== 1) {
    const offset = normalized.eraYear - new Date(normalized.valueMs).getFullYear();
    if (offset) {
      normalized.valueMs = campaignDateInYear(normalized.valueMs, normalized.eraYear);
      normalized.initialValueMs = campaignDateInYear(normalized.initialValueMs,
        Math.min(9999, Math.max(0, new Date(normalized.initialValueMs).getFullYear() + offset)));
    }
  }
  // After alignment the instant is authoritative. Do not reapply the legacy
  // label offset when another time zone sees a different year near New Year.
  normalized.calendarVersion = 1;
  if (mode === "clock") normalized.eraYear = new Date(normalized.valueMs).getFullYear();
  return normalized;
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
  const valueMs = campaignClockValue(config, now.getTime());
  return {
    ...config,
    eraYear: campaignClockYear(config, now.getTime()),
    valueMs,
    referenceAt: now.toISOString(),
  };
}

export function campaignClockYear(config: CampaignClockConfig, now = Date.now()) {
  return config.mode === "clock" ? new Date(campaignClockValue(config, now)).getFullYear() : config.eraYear;
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
