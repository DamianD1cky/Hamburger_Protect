import type { CampaignBoard, CampaignSectionKey, CampaignSettingsPatch, CampaignSettingsUpdate } from "./types";

const mapFields = ["sectionTitles", "sectionColors", "resourceTitles"] as const;
export const settingsConflictMessage = "其他 GM 已修改这项设置，请重新打开后再调整。";

/** Capture only values the user edits, including deletion and visibility intent. */
export function settingsUpdate(board: CampaignBoard, desired: CampaignSettingsPatch): CampaignSettingsUpdate {
  const patch: CampaignSettingsPatch = {}, expected: CampaignSettingsPatch = {};
  if (desired.name !== undefined && desired.name.trim() !== board.campaign.name) {
    patch.name = desired.name.trim(); expected.name = board.campaign.name;
  }
  for (const field of mapFields) {
    for (const [key, value] of Object.entries(desired[field] ?? {})) {
      if (value === undefined) continue;
      const before = (board.settings[field] as Record<string, string>)[key] ?? null;
      if (value !== before) {
        const changes = (patch[field] ??= {}) as Record<string, string | null>;
        const originals = (expected[field] ??= {}) as Record<string, string | null>;
        changes[key] = value; originals[key] = before;
      }
    }
  }
  for (const [key, value] of Object.entries(desired.hiddenSections ?? {})) {
    if (value === undefined) continue;
    const section = key as CampaignSectionKey;
    const before = board.settings.hiddenSections.includes(section);
    if (value !== before) {
      (patch.hiddenSections ??= {})[section] = value;
      (expected.hiddenSections ??= {})[section] = before;
    }
  }
  if (desired.noteTexturePath !== undefined && desired.noteTexturePath !== board.settings.noteTexturePath) {
    patch.noteTexturePath = desired.noteTexturePath;
    expected.noteTexturePath = board.settings.noteTexturePath;
  }
  return { patch, expected };
}

/** Merge a write receipt by edited key, never by an old full-board snapshot. */
export function applySettingsPatch(board: CampaignBoard, patch: CampaignSettingsPatch): CampaignBoard {
  const settings = { ...board.settings };
  for (const field of mapFields) {
    if (!patch[field]) continue;
    const merged: Record<string, string | undefined> = { ...settings[field] };
    for (const [key, value] of Object.entries(patch[field])) {
      if (value === null) delete merged[key];
      else if (value !== undefined) merged[key] = value;
    }
    settings[field] = merged;
  }
  if (patch.hiddenSections) {
    const hidden = new Set(settings.hiddenSections);
    for (const [key, value] of Object.entries(patch.hiddenSections)) {
      if (value) hidden.add(key as CampaignSectionKey); else hidden.delete(key as CampaignSectionKey);
    }
    settings.hiddenSections = [...hidden];
  }
  if (patch.noteTexturePath !== undefined) {
    settings.noteTexturePath = patch.noteTexturePath;
    settings.noteTextureUrl = null;
  }
  return { ...board, campaign: { ...board.campaign, name: patch.name ?? board.campaign.name }, settings };
}

export function assertSettingsExpected(board: CampaignBoard, update: CampaignSettingsUpdate) {
  const current = settingsUpdate(board, update.patch).expected;
  // A matching final value is idempotent even if a previous request succeeded.
  for (const field of Object.keys(current) as Array<keyof CampaignSettingsPatch>) {
    if (field === "sectionTitles" || field === "sectionColors" || field === "resourceTitles" || field === "hiddenSections") {
      for (const [key, value] of Object.entries(current[field] as object)) {
        if (value !== (update.expected[field] as Record<string, unknown> | undefined)?.[key])
          throw new Error(settingsConflictMessage);
      }
    } else if (current[field] !== update.expected[field]) throw new Error(settingsConflictMessage);
  }
}
