import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campaignDateInYear,
  campaignClockValue,
  campaignClockYear,
  configureCampaignClockValue,
  defaultCampaignClock,
  materializeCampaignClock,
  normalizeCampaignClock,
} from "../../src/features/campaign/domain/campaignClock.ts";

function localDate(year, month, day, hours = 12, minutes = 34, seconds = 56) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hours, minutes, seconds, 0);
  return date;
}
function parts(value) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
}
const reference = new Date("2026-11-17T00:00:00Z");
const base = defaultCampaignClock(reference);

test("era changes preserve the literal year, date and wall time, including 0–99", () => {
  const date = localDate(2026, 11, 17);
  for (const year of [0, 1, 79, 80, 1969, 9999]) {
    assert.deepEqual(parts(campaignDateInYear(date.getTime(), year)), [year, 11, 17, 12, 34, 56]);
  }
});
test("leap-day year changes stay in February and valid leap years keep the day", () => {
  const leap = localDate(2000, 2, 29);
  assert.deepEqual(parts(campaignDateInYear(leap.getTime(), 79)), [79, 2, 28, 12, 34, 56]);
  assert.deepEqual(parts(campaignDateInYear(leap.getTime(), 2004)), [2004, 2, 29, 12, 34, 56]);
  assert.deepEqual(parts(campaignDateInYear(leap.getTime(), 2100)), [2100, 2, 28, 12, 34, 56]);
  assert.deepEqual(parts(campaignDateInYear(leap.getTime(), 0)), [0, 2, 29, 12, 34, 56]);
});
test("configuring a calendar date updates both its era year and reset baseline", () => {
  const valueMs = localDate(79, 8, 9).getTime();
  const configured = configureCampaignClockValue(base, valueMs, reference);
  assert.equal(configured.eraYear, 79);
  assert.equal(configured.initialValueMs, valueMs);
  assert.equal(configured.valueMs, valueMs);
  assert.equal(configured.referenceAt, reference.toISOString());
});
test("calendar normalization retains signed timestamps and aligns old independent labels", () => {
  const initial = localDate(2025, 12, 31).getTime();
  const value = localDate(2026, 1, 2).getTime();
  const config = normalizeCampaignClock({ ...base, calendarVersion: undefined, eraYear: 79, valueMs: value, initialValueMs: initial });
  assert.deepEqual(parts(config.valueMs), [79, 1, 2, 12, 34, 56]);
  assert.deepEqual(parts(config.initialValueMs), [78, 12, 31, 12, 34, 56]);
  assert.deepEqual(normalizeCampaignClock(config), config);
  assert.equal(config.referenceAt, base.referenceAt);
});
test("canonical timestamps do not jump a year when viewed from another time zone", () => {
  const instant = Date.parse("2160-01-01T00:00:00Z");
  const canonical = normalizeCampaignClock({ ...base, calendarVersion: 1, eraYear: 2160, valueMs: instant, initialValueMs: instant });
  assert.equal(canonical.valueMs, instant);
  assert.equal(canonical.eraYear, new Date(instant).getFullYear());
});
test("running calendar clocks and materialized snapshots advance the year together", () => {
  const valueMs = localDate(79, 12, 31, 23, 59, 59).getTime();
  const config = { ...base, eraYear: 79, valueMs, initialValueMs: valueMs };
  const next = new Date(reference.getTime() + 2_000);
  assert.deepEqual(parts(campaignClockValue(config, next.getTime())), [80, 1, 1, 0, 0, 1]);
  assert.equal(campaignClockYear(config, next.getTime()), 80);
  const saved = materializeCampaignClock(config, next);
  assert.equal(saved.eraYear, 80);
  assert.equal(saved.initialValueMs, valueMs, "pause/materialization does not change the reset baseline");
});
test("duration edits and progress do not rewrite the chosen campaign era", () => {
  for (const mode of ["countdown", "stopwatch"]) {
    const config = configureCampaignClockValue({ ...base, mode, eraYear: 79 }, 60_000, reference);
    assert.equal(config.eraYear, 79);
    const next = new Date(reference.getTime() + 2_000);
    assert.equal(materializeCampaignClock(config, next).eraYear, 79);
    assert.equal(campaignClockValue(config, next.getTime()), mode === "countdown" ? 58_000 : 62_000);
    assert.ok(normalizeCampaignClock({ ...config, valueMs: -1 }).valueMs >= 0);
  }
});
