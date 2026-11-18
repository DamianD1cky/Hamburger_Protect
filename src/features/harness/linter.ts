import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  boardModuleKeys,
  boardModules,
  canPlaceRect,
  clampModuleSize,
  clampToBoard,
  moduleRect,
  nearestFreeSpotForRect,
  rectsOverlap,
  snap,
  type BoardModuleKey,
  type BoardModuleLayout,
  type BoardModuleRect,
} from "../campaign/domain/boardModules.ts";
import type { BoardAppearance } from "../campaign/domain/boardAppearance.ts";
import {
  hasActiveCardEffect,
  normalizeCardVisualEffect,
} from "../campaign/domain/cardEffects.ts";
import { normalizeBoardStyleTokens } from "../campaign/domain/boardStyleTokens.ts";
import { normalizeCampaignClock } from "../campaign/domain/campaignClock.ts";
import {
  defaultSectionColors,
  defaultSectionTitles,
  normalizeColor,
} from "../campaign/domain/campaignSettings.ts";
import {
  CUSTOM_PANEL_LIMIT,
  normalizeCustomPanel,
  type BoardCustomPanel,
} from "../campaign/domain/customPanels.ts";
import { EVENT_CLOCK_LIMIT, validateEventClock } from "../campaign/domain/eventClock.ts";
import { eventClockRects } from "../campaign/domain/eventClockLayout.ts";
import { defaultResourceTitles } from "../campaign/domain/resources.ts";
import type {
  BoardNote,
  BoardNoteLink,
  CampaignBoard,
  CampaignSectionKey,
  NoteColor,
  PinColor,
  ResourceStatus,
} from "../campaign/domain/types.ts";
import type {
  BoardHarnessBlueprint,
  CompiledBoardBlueprint,
  CompiledNoteUpdate,
  CompiledSettingsPayload,
} from "./schema.ts";

const NOTE_W = 276;
const NOTE_H = 196;
const VALID_NOTE_COLORS: readonly NoteColor[] = ["yellow", "pink", "blue", "green"];
const VALID_PIN_COLORS: readonly PinColor[] = ["red", "blue", "green", "yellow", "black"];
const VALID_RESOURCE_STATUS: readonly ResourceStatus[] = ["ok", "low", "out"];

export interface BoardSpatialLintIssue {
  kind: "overlap" | "out_of_bounds";
  message: string;
}

/** 扫描当前公告板可见模块与自定义面板是否存在重叠或越界（供 Eyes 上下文与自纠环使用）。 */
export function lintBoardLayout(board: CampaignBoard): BoardSpatialLintIssue[] {
  const issues: BoardSpatialLintIssue[] = [];
  const hidden = new Set(board.settings.hiddenSections);
  const items: Array<{ label: string; rect: BoardModuleRect }> = [];

  const clockMap = eventClockRects(
    board.eventClocks,
    board.settings.moduleLayout,
    board.settings.hiddenSections,
  );
  for (const key of boardModuleKeys) {
    if (hidden.has(key)) continue;
    if (key === "index" && board.eventClocks.length > 0) {
      for (const clock of board.eventClocks) {
        const rect = clockMap.get(clock.id);
        if (rect) {
          items.push({ label: `事件钟：${clock.name}`, rect });
        }
      }
      continue;
    }
    items.push({
      label: board.settings.sectionTitles[key] ?? boardModules[key].label,
      rect: moduleRect(key, board.settings.moduleLayout),
    });
  }
  for (const panel of board.settings.customPanels) {
    items.push({
      label: panel.title,
      rect: { x: panel.x, y: panel.y, w: panel.w, h: panel.h },
    });
  }

  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (
      a.rect.x < 0 ||
      a.rect.y < 0 ||
      a.rect.x + a.rect.w > BOARD_WIDTH ||
      a.rect.y + a.rect.h > BOARD_HEIGHT
    ) {
      issues.push({
        kind: "out_of_bounds",
        message: `模块「${a.label}」超出 2144×1206 画布范围`,
      });
    }
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j];
      if (rectsOverlap(a.rect, b.rect)) {
        issues.push({
          kind: "overlap",
          message: `「${a.label}」与「${b.label}」存在区域重叠`,
        });
      }
    }
  }
  return issues;
}

export function captureSettingsSnapshot(
  board: CampaignBoard,
): CompiledSettingsPayload {
  return structuredClone({
    campaignName: board.campaign.name,
    appearance: board.settings.appearance,
    styleTokens: board.settings.styleTokens,
    sectionTitles: board.settings.sectionTitles,
    sectionColors: board.settings.sectionColors,
    resourceTitles: board.settings.resourceTitles,
    hiddenSections: board.settings.hiddenSections,
    moduleLayout: board.settings.moduleLayout,
    customPanels: board.settings.customPanels,
    clock: board.settings.clock,
  });
}

function mergeAppearance(
  current: BoardAppearance,
  patch: BoardHarnessBlueprint["appearance"],
): BoardAppearance {
  if (!patch) return structuredClone(current);
  const next = structuredClone(current);
  if (patch.frame && ["burger", "wood", "metal", "none"].includes(patch.frame)) {
    next.frame = patch.frame;
  }
  if (patch.surface?.kind && ["felt", "cork", "paper"].includes(patch.surface.kind)) {
    next.surface = { kind: patch.surface.kind, imagePath: null };
  }
  if (patch.room) {
    const r = patch.room;
    if (r.kind && ["default", "color", "perspective"].includes(r.kind)) {
      next.room.kind = r.kind;
      if (r.kind !== "image") next.room.imagePath = null;
    }
    if (r.color) {
      const hex = normalizeColor(r.color);
      if (hex) next.room.color = hex;
    }
    if (typeof r.dim === "number" && Number.isFinite(r.dim)) {
      next.room.dim = Math.max(0, Math.min(0.8, Number(r.dim.toFixed(2))));
    }
    if (r.fit && ["cover", "contain", "tile"].includes(r.fit)) {
      next.room.fit =
        next.room.kind === "perspective" && r.fit === "tile" ? "cover" : r.fit;
    }
    if (next.room.kind === "perspective") {
      next.room.scene =
        r.scene && ["crossing", "station"].includes(r.scene)
          ? r.scene
          : next.room.scene ?? "crossing";
      next.room.animated =
        typeof r.animated === "boolean"
          ? r.animated
          : next.room.animated ?? true;
      if (next.room.fit === "tile") next.room.fit = "cover";
    }
  }
  return next;
}

/** 在未被模块或已有便签占据的画布空白区挑选便签落点。 */
function findOpenNotePosition(
  preferredX: number | undefined,
  preferredY: number | undefined,
  obstacles: readonly BoardModuleRect[],
  placedNotes: readonly BoardModuleRect[],
  index: number,
): { x: number; y: number } {
  const clampNote = (x: number, y: number) => ({
    x: Math.max(24, Math.min(BOARD_WIDTH - NOTE_W - 24, Math.round(x))),
    y: Math.max(24, Math.min(BOARD_HEIGHT - NOTE_H - 24, Math.round(y))),
  });

  if (
    preferredX !== undefined &&
    preferredY !== undefined &&
    Number.isFinite(preferredX) &&
    Number.isFinite(preferredY)
  ) {
    const candidate = clampNote(preferredX, preferredY);
    const box = { ...candidate, w: NOTE_W, h: NOTE_H };
    const hitsNote = placedNotes.some((n) => rectsOverlap(box, n, -40));
    const hitsModule = obstacles.some((m) => rectsOverlap(box, m, 8));
    if (!hitsNote && !hitsModule) return candidate;
  }

  // Scan right-to-left columns first (traditional investigation area), then entire board
  const cols = [1480, 1790, 1160, 840, 520, 200];
  const rows = [64, 300, 536, 772, 960];
  for (const cx of cols) {
    for (const cy of rows) {
      const jitterX = ((index % 3) - 1) * 14;
      const jitterY = ((index % 2) * 12);
      const candidate = clampNote(cx + jitterX, cy + jitterY);
      const box = { ...candidate, w: NOTE_W, h: NOTE_H };
      if (
        !obstacles.some((m) => rectsOverlap(box, m, 12)) &&
        !placedNotes.some((n) => rectsOverlap(box, n, 12))
      ) {
        return candidate;
      }
    }
  }

  const fallbackSpot = nearestFreeSpotForRect(
    NOTE_W,
    NOTE_H,
    preferredX ?? 1500,
    preferredY ?? 120 + (index % 4) * 240,
    [...obstacles, ...placedNotes],
    8,
  );
  if (fallbackSpot) return clampNote(fallbackSpot.x, fallbackSpot.y);

  return clampNote(1460 + (index % 2) * 300, 80 + (index % 4) * 235);
}

/**
 * 核心编译器：将 AI 声明式蓝图通过几何碰撞求解器（Spatial Linter）与字段校验，
 * 输出可直接渲染的 Ghost 预览公告板以及可原子提交数据库的净荷。
 */
export function compileHarnessBlueprint(
  board: CampaignBoard,
  raw: BoardHarnessBlueprint,
): CompiledBoardBlueprint {
  const preApplySettings = captureSettingsSnapshot(board);
  const lintNotes: string[] = [];
  const changeBadges: string[] = [];

  const nextName =
    raw.campaignName && raw.campaignName.trim()
      ? raw.campaignName.trim().slice(0, 80)
      : board.campaign.name;
  if (nextName !== board.campaign.name) {
    changeBadges.push(`战役更名「${nextName}」`);
  }

  const nextAppearance = mergeAppearance(board.settings.appearance, raw.appearance);
  if (JSON.stringify(nextAppearance) !== JSON.stringify(board.settings.appearance)) {
    changeBadges.push("更新场景与板面材质");
  }

  const nextStyleTokens = normalizeBoardStyleTokens({
    ...board.settings.styleTokens,
    ...(raw.styleTokens ?? {}),
  });
  if (JSON.stringify(nextStyleTokens) !== JSON.stringify(board.settings.styleTokens)) {
    changeBadges.push("切换排版样式 Token");
  }

  const sectionTitles: Partial<Record<CampaignSectionKey, string>> = {
    ...board.settings.sectionTitles,
  };
  const sectionColors: Partial<Record<CampaignSectionKey, string>> = {
    ...board.settings.sectionColors,
  };
  const resourceTitles: Partial<Record<string, string>> = {
    ...board.settings.resourceTitles,
  };
  const hiddenSet = new Set<CampaignSectionKey>(board.settings.hiddenSections);

  if (raw.notesVisible !== undefined) {
    if (raw.notesVisible) hiddenSet.delete("notes");
    else hiddenSet.add("notes");
  }
  if (raw.notesTitle !== undefined) {
    const trimmed = raw.notesTitle?.trim() ?? "";
    if (!trimmed || trimmed === defaultSectionTitles.notes) delete sectionTitles.notes;
    else sectionTitles.notes = trimmed.slice(0, 32);
  }
  if (raw.notesColor !== undefined) {
    const hex = normalizeColor(raw.notesColor);
    if (!hex || hex === defaultSectionColors.notes) delete sectionColors.notes;
    else sectionColors.notes = hex;
  }

  if (raw.resourceTitles) {
    for (const key of ["0", "1", "2"] as const) {
      if (!(key in raw.resourceTitles)) continue;
      const val = raw.resourceTitles[key]?.trim() ?? "";
      if (!val || val === defaultResourceTitles[key]) delete resourceTitles[key];
      else resourceTitles[key] = val.slice(0, 32);
    }
  }

  const requestedModules = new Map(
    (raw.modules ?? []).map((item) => [item.key, item]),
  );
  for (const [key, spec] of requestedModules) {
    if (!boardModuleKeys.includes(key)) continue;
    if (spec.visible !== undefined) {
      if (spec.visible) hiddenSet.delete(key);
      else hiddenSet.add(key);
    }
    if (spec.title !== undefined) {
      const trimmed = spec.title?.trim() ?? "";
      if (!trimmed || trimmed === defaultSectionTitles[key]) delete sectionTitles[key];
      else sectionTitles[key] = trimmed.slice(0, 32);
    }
    if (spec.color !== undefined) {
      const hex = normalizeColor(spec.color);
      if (!hex || hex === defaultSectionColors[key]) delete sectionColors[key];
      else sectionColors[key] = hex;
    }
  }

  // Spatial Solver: place explicitly requested visible modules first, then remaining visible modules
  const nextModuleLayout: BoardModuleLayout = { ...board.settings.moduleLayout };
  const placedRects: BoardModuleRect[] = [];
  const orderedKeys: BoardModuleKey[] = [
    ...boardModuleKeys.filter((k) => requestedModules.has(k) && !hiddenSet.has(k)),
    ...boardModuleKeys.filter((k) => !requestedModules.has(k) && !hiddenSet.has(k)),
  ];

  let movedOrResizedCount = 0;
  let moduleEffectCount = 0;
  for (const key of orderedKeys) {
    const spec = requestedModules.get(key);
    const currentRect = moduleRect(key, board.settings.moduleLayout);
    const currentEffect = board.settings.moduleLayout[key]?.effect ?? null;
    const nextEffect =
      spec && "effect" in spec
        ? spec.effect
          ? normalizeCardVisualEffect(spec.effect)
          : null
        : currentEffect;
    const activeEffect =
      nextEffect && hasActiveCardEffect(nextEffect) ? nextEffect : null;
    if (JSON.stringify(activeEffect) !== JSON.stringify(currentEffect ?? null)) {
      moduleEffectCount += 1;
    }

    const size = clampModuleSize(
      key,
      spec?.w ?? currentRect.w,
      spec?.h ?? currentRect.h,
    );
    const desiredX = snap(spec?.x ?? currentRect.x);
    const desiredY = snap(spec?.y ?? currentRect.y);
    const clamped = clampToBoard(desiredX, desiredY, size.w, size.h);
    let finalPos = clamped;

    if (!canPlaceRect({ ...clamped, ...size }, placedRects, 8)) {
      const resolved = nearestFreeSpotForRect(
        size.w,
        size.h,
        clamped.x,
        clamped.y,
        placedRects,
        8,
      );
      if (resolved) {
        finalPos = resolved;
        if (spec) {
          lintNotes.push(
            `已自动微调「${sectionTitles[key] ?? boardModules[key].label}」至 (${resolved.x}, ${resolved.y}) 以避免区块重叠`,
          );
        }
      }
    }

    const base = boardModules[key].rect;
    const isDefaultPos =
      finalPos.x === base.x &&
      finalPos.y === base.y &&
      size.w === base.w &&
      size.h === base.h;
    if (isDefaultPos && !activeEffect) {
      delete nextModuleLayout[key];
    } else {
      nextModuleLayout[key] = {
        x: finalPos.x,
        y: finalPos.y,
        ...(size.w !== base.w ? { w: size.w } : {}),
        ...(size.h !== base.h ? { h: size.h } : {}),
        ...(activeEffect ? { effect: activeEffect } : {}),
      };
    }
    if (
      finalPos.x !== currentRect.x ||
      finalPos.y !== currentRect.y ||
      size.w !== currentRect.w ||
      size.h !== currentRect.h
    ) {
      movedOrResizedCount += 1;
    }
    placedRects.push({ x: finalPos.x, y: finalPos.y, w: size.w, h: size.h });
  }
  if (movedOrResizedCount > 0 || (raw.modules && raw.modules.length > 0)) {
    changeBadges.push(`编排 ${Math.max(movedOrResizedCount, raw.modules?.length ?? 0)} 个内置模块`);
  }
  if (moduleEffectCount > 0) {
    changeBadges.push(`更新 ${moduleEffectCount} 张卡片装饰特效`);
  }

  // Custom Panels merge/replace + Spatial Solver
  const removedIds = new Set(raw.removeCustomPanelIds ?? []);
  const basePanels =
    raw.customPanelsMode === "replace"
      ? []
      : board.settings.customPanels.filter((p) => !removedIds.has(p.id));
  const mergedPanelsMap = new Map<string, BoardCustomPanel>(
    basePanels.map((p) => [p.id, structuredClone(p)]),
  );

  for (const spec of raw.customPanels ?? []) {
    const existing = spec.id ? mergedPanelsMap.get(spec.id) : undefined;
    const normalized = normalizeCustomPanel({
      ...(existing ?? {}),
      ...spec,
      effect:
        spec.effect !== undefined
          ? normalizeCardVisualEffect(spec.effect)
          : existing?.effect,
      id: existing?.id ?? spec.id ?? `panel-${crypto.randomUUID().slice(0, 8)}`,
    });
    mergedPanelsMap.set(normalized.id, normalized);
  }

  const nextCustomPanels: BoardCustomPanel[] = [];
  for (const panel of [...mergedPanelsMap.values()].slice(0, CUSTOM_PANEL_LIMIT)) {
    const clamped = clampToBoard(panel.x, panel.y, panel.w, panel.h);
    let pos = clamped;
    if (!canPlaceRect({ ...clamped, w: panel.w, h: panel.h }, placedRects, 8)) {
      const resolved = nearestFreeSpotForRect(
        panel.w,
        panel.h,
        clamped.x,
        clamped.y,
        placedRects,
        8,
      );
      if (resolved) {
        pos = resolved;
        lintNotes.push(
          `已自动安排自定义面板「${panel.title}」至 (${resolved.x}, ${resolved.y}) 空位`,
        );
      }
    }
    const finalPanel = { ...panel, x: pos.x, y: pos.y };
    nextCustomPanels.push(finalPanel);
    placedRects.push({ x: finalPanel.x, y: finalPanel.y, w: finalPanel.w, h: finalPanel.h });
  }
  if (
    JSON.stringify(nextCustomPanels) !==
    JSON.stringify(board.settings.customPanels)
  ) {
    changeBadges.push(`配置 ${nextCustomPanels.length} 块自由面板`);
  }

  // Campaign clock
  const nextClock = raw.clock
    ? normalizeCampaignClock({ ...board.settings.clock, ...raw.clock })
    : board.settings.clock;

  // Notes, Note Updates & Note Links
  const normalizeNoteCol = (c: string | undefined, idx: number): NoteColor => {
    if (c && VALID_NOTE_COLORS.includes(c as NoteColor)) return c as NoteColor;
    const hex = normalizeColor(c);
    if (hex) return hex;
    return (["yellow", "blue", "pink", "green"] as const)[idx % 4];
  };
  const normalizePinCol = (c: string | undefined): PinColor => {
    if (c && VALID_PIN_COLORS.includes(c as PinColor)) return c as PinColor;
    const hex = normalizeColor(c);
    if (hex) return hex;
    return "red";
  };

  const compiledNoteUpdatesMap = new Map<string, CompiledNoteUpdate>();
  for (const spec of raw.noteUpdates ?? []) {
    const matchedNotes = board.notes.filter((n) => {
      if (spec.id && spec.id !== "*" && n.id === spec.id) return true;
      if (spec.id === "*" && !spec.matchTitle) return true;
      if (spec.matchTitle && n.title.includes(spec.matchTitle.trim())) return true;
      return !spec.id && !spec.matchTitle;
    });
    for (const target of matchedNotes) {
      const prev = compiledNoteUpdatesMap.get(target.id) ?? { id: target.id };
      if (spec.color !== undefined) {
        const hex = VALID_NOTE_COLORS.includes(spec.color as NoteColor)
          ? spec.color
          : normalizeColor(spec.color);
        if (hex) prev.color = hex;
      }
      if (spec.pinColor !== undefined) {
        const pHex = VALID_PIN_COLORS.includes(spec.pinColor as PinColor)
          ? spec.pinColor
          : normalizeColor(spec.pinColor);
        if (pHex) prev.pinColor = pHex;
      }
      if (typeof spec.rotation === "number" && Number.isFinite(spec.rotation)) {
        prev.rotation = Math.max(-180, Math.min(180, Math.round(spec.rotation)));
      }
      if (typeof spec.scale === "number" && Number.isFinite(spec.scale)) {
        prev.scale = Math.max(0.6, Math.min(2.2, Number(spec.scale.toFixed(2))));
      }
      if (spec.effect !== undefined) {
        prev.effect = spec.effect
          ? normalizeCardVisualEffect(spec.effect)
          : null;
      }
      compiledNoteUpdatesMap.set(target.id, prev);
    }
  }
  const compiledNoteUpdates = [...compiledNoteUpdatesMap.values()];
  if (compiledNoteUpdates.length > 0) {
    changeBadges.push(`更新 ${compiledNoteUpdates.length} 张既有便签样式/Shader`);
  }

  const existingNoteBoxes: BoardModuleRect[] = board.notes.map((n) => {
    const sc = n.scale ?? 1;
    return {
      x: n.x,
      y: n.y,
      w: Math.round(NOTE_W * sc),
      h: Math.round(NOTE_H * sc),
    };
  });
  const refToPreviewId = new Map<string, string>();
  const compiledNotes = (raw.notes ?? []).slice(0, 24).map((spec, idx) => {
    const scale =
      typeof spec.scale === "number" && Number.isFinite(spec.scale)
        ? Math.max(0.6, Math.min(2.2, Number(spec.scale.toFixed(2))))
        : 1;
    const pos = findOpenNotePosition(
      spec.x,
      spec.y,
      placedRects,
      existingNoteBoxes,
      idx,
    );
    existingNoteBoxes.push({
      ...pos,
      w: Math.round(NOTE_W * scale),
      h: Math.round(NOTE_H * scale),
    });
    const color = normalizeNoteCol(spec.color, idx);
    const pinColor = normalizePinCol(spec.pinColor);
    const rotation =
      typeof spec.rotation === "number" && Number.isFinite(spec.rotation)
        ? Math.max(-180, Math.min(180, spec.rotation))
        : ([-1.8, 1.4, -0.8, 2.0][idx % 4]);
    const effect = spec.effect ? normalizeCardVisualEffect(spec.effect) : null;
    const previewId = `preview-note-${idx + 1}`;
    if (spec.refId?.trim()) {
      refToPreviewId.set(spec.refId.trim(), previewId);
    }
    return {
      previewId,
      refId: spec.refId?.trim() || undefined,
      title: (spec.title?.trim() || "调查线索").slice(0, 80),
      body: (spec.body?.trim() || "待补充记录").slice(0, 1000),
      color,
      pinColor,
      x: pos.x,
      y: pos.y,
      rotation,
      scale,
      effect,
      pinned: Boolean(spec.pinned),
    };
  });
  if (compiledNotes.length > 0) {
    changeBadges.push(`新增 ${compiledNotes.length} 张便签`);
  }

  const compiledLinks = (raw.noteLinks ?? [])
    .slice(0, 32)
    .map((link) => ({
      from: link.from.trim(),
      to: link.to.trim(),
      label: link.label?.trim() ? link.label.trim().slice(0, 24) : null,
    }))
    .filter((link) => link.from && link.to && link.from !== link.to);
  if (compiledLinks.length > 0) {
    changeBadges.push(`建立 ${compiledLinks.length} 条线索连线`);
  }

  const compiledQuests = (raw.quests ?? [])
    .slice(0, 16)
    .filter((q) => q.title?.trim())
    .map((q) => ({
      title: q.title.trim().slice(0, 80),
      body: (q.body?.trim() || "按小队计划推进并回报结果。").slice(0, 1000),
      assigneeName: (q.assigneeName?.trim() || "待认领").slice(0, 40),
      due: q.due?.trim() ?? "",
    }));
  if (compiledQuests.length > 0) {
    changeBadges.push(`发布 ${compiledQuests.length} 项委托`);
  }

  const compiledResources = (raw.resources ?? [])
    .slice(0, 24)
    .filter((r) => r.name?.trim())
    .map((r) => ({
      name: r.name.trim().slice(0, 80),
      quantity: (r.quantity ?? "").trim().slice(0, 80),
      status: VALID_RESOURCE_STATUS.includes(r.status) ? r.status : "ok",
      group: Math.max(0, Math.min(2, Math.round(Number(r.group) || 0))),
    }));
  if (compiledResources.length > 0) {
    changeBadges.push(`登记 ${compiledResources.length} 项物资`);
  }

  const remainingClockSlots = Math.max(0, EVENT_CLOCK_LIMIT - board.eventClocks.length);
  const compiledClocks = (raw.eventClocks ?? [])
    .slice(0, Math.min(12, remainingClockSlots))
    .map((c) => {
      const segments = Math.max(2, Math.min(24, Math.round(Number(c.segments) || 6)));
      const progress = Math.max(0, Math.min(segments, Math.round(Number(c.progress) || 0)));
      return validateEventClock({
        name: (c.name?.trim() || "新事件钟").slice(0, 80),
        segments,
        progress,
        consequence: (c.consequence?.trim() || "事态升级，由 GM 裁定后果。").slice(0, 500),
        color: normalizeColor(c.color) ?? "#b24b37",
      });
    });
  if (compiledClocks.length > 0) {
    changeBadges.push(`新增 ${compiledClocks.length} 个事件钟`);
  }

  const compiledChecklist = (raw.checklist ?? [])
    .slice(0, 24)
    .filter((item) => item.label?.trim())
    .map((item) => ({
      label: item.label.trim().slice(0, 120),
      categoryName: item.categoryName?.trim()
        ? item.categoryName.trim().slice(0, 40)
        : null,
    }));
  if (compiledChecklist.length > 0) {
    changeBadges.push(`添加 ${compiledChecklist.length} 条检查项`);
  }

  // Construct Ghost Preview Board
  const nowIso = new Date().toISOString();
  const maxLayer = board.notes.reduce((m, n) => Math.max(m, n.layer), 0);
  const previewNotes: BoardNote[] = [
    ...board.notes.map((existing) => {
      const patch = compiledNoteUpdatesMap.get(existing.id);
      if (!patch) return existing;
      return {
        ...existing,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.pinColor !== undefined ? { pinColor: patch.pinColor } : {}),
        ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
        ...(patch.scale !== undefined ? { scale: patch.scale } : {}),
        ...(patch.effect !== undefined ? { effect: patch.effect } : {}),
      };
    }),
    ...compiledNotes.map((n, idx) => ({
      id: n.previewId,
      title: n.title,
      body: n.body,
      color: n.color,
      pinColor: n.pinColor,
      x: n.x,
      y: n.y,
      rotation: n.rotation,
      scale: n.scale,
      effect: n.effect,
      createdAt: nowIso,
      authorId: board.viewer.id,
      authorName: board.viewer.displayName,
      pinned: n.pinned,
      pinnedAt: n.pinned ? nowIso : null,
      layer: maxLayer + idx + 1,
      imagePath: null,
      imageUrl: null,
    })),
  ];

  const previewLinks: BoardNoteLink[] = [
    ...board.noteLinks,
    ...compiledLinks.flatMap((link, idx) => {
      const fromId = refToPreviewId.get(link.from) ?? link.from;
      const toId = refToPreviewId.get(link.to) ?? link.to;
      if (
        !previewNotes.some((n) => n.id === fromId) ||
        !previewNotes.some((n) => n.id === toId)
      ) {
        return [];
      }
      return [
        {
          id: `preview-link-${idx + 1}`,
          fromNoteId: fromId,
          toNoteId: toId,
          label: link.label,
        },
      ];
    }),
  ];

  const previewCategories = [...board.checklistCategories];
  const previewChecklist = [...board.checklist];
  compiledChecklist.forEach((chk, idx) => {
    let categoryId: string | null = null;
    if (chk.categoryName) {
      let existingCat = previewCategories.find((c) => c.name === chk.categoryName);
      if (!existingCat) {
        existingCat = { id: `preview-cat-${idx + 1}`, name: chk.categoryName };
        previewCategories.push(existingCat);
      }
      categoryId = existingCat.id;
    }
    previewChecklist.push({
      id: `preview-chk-${idx + 1}`,
      label: chk.label,
      completed: false,
      categoryId,
    });
  });

  const hiddenSections = [...hiddenSet];
  const previewBoard: CampaignBoard = {
    ...board,
    campaign: {
      ...board.campaign,
      name: nextName,
    },
    notes: previewNotes,
    noteLinks: previewLinks,
    quests: [
      ...board.quests,
      ...compiledQuests.map((q, idx) => ({
        id: `preview-quest-${idx + 1}`,
        title: q.title,
        body: q.body,
        assigneeName: q.assigneeName,
        due: q.due,
        status: "open" as const,
        createdBy: board.viewer.id,
        claimedBy: null,
      })),
    ],
    resources: [
      ...board.resources,
      ...compiledResources.map((r, idx) => ({
        id: `preview-res-${idx + 1}`,
        group: r.group,
        name: r.name,
        quantity: r.quantity,
        status: r.status,
      })),
    ],
    eventClocks: [
      ...board.eventClocks,
      ...compiledClocks.map((c, idx) => {
        const anchor = moduleRect("index", nextModuleLayout);
        const spot =
          board.eventClocks.length === 0 && idx === 0 && canPlaceRect({ ...anchor, w: 340, h: 221 }, placedRects.filter((r) => r.x !== anchor.x || r.y !== anchor.y), 8)
            ? { x: anchor.x, y: anchor.y }
            : nearestFreeSpotForRect(340, 221, anchor.x, anchor.y, placedRects, 8) ?? { x: anchor.x, y: anchor.y };
        placedRects.push({ x: spot.x, y: spot.y, w: 340, h: 221 });
        return {
          id: `preview-clock-${idx + 1}`,
          ...c,
          mode: "progress" as const,
          stages: null,
          revision: 1,
          position: spot,
        };
      }),
    ],
    checklistCategories: previewCategories,
    checklist: previewChecklist,
    settings: {
      ...board.settings,
      appearance: nextAppearance,
      styleTokens: nextStyleTokens,
      sectionTitles,
      sectionColors,
      resourceTitles,
      hiddenSections,
      moduleLayout: nextModuleLayout,
      customPanels: nextCustomPanels,
      clock: nextClock,
    },
  };

  const summary =
    raw.summary?.trim().slice(0, 120) || "AI 帷幕编排方案";
  const assistantReply =
    raw.assistantReply?.trim() ||
    `已为你生成「${summary}」草稿预览，请查看身后公告板效果并点击应用。`;

  return {
    summary,
    assistantReply,
    previewBoard,
    preApplySettings,
    lintNotes,
    changeBadges,
    commitPayload: {
      summary,
      campaignName: nextName !== board.campaign.name ? nextName : undefined,
      appearance: nextAppearance,
      styleTokens: nextStyleTokens,
      sectionTitles,
      sectionColors,
      resourceTitles,
      hiddenSections,
      moduleLayout: nextModuleLayout,
      customPanels: nextCustomPanels,
      clock: raw.clock ? nextClock : undefined,
      notes: compiledNotes.map((n) => ({
        ...(n.refId ? { refId: n.refId } : {}),
        title: n.title,
        body: n.body,
        color: n.color,
        pinColor: n.pinColor,
        x: n.x,
        y: n.y,
        rotation: n.rotation,
        scale: n.scale,
        effect: n.effect,
        pinned: n.pinned,
      })),
      noteUpdates: compiledNoteUpdates,
      noteLinks: compiledLinks,
      quests: compiledQuests,
      resources: compiledResources,
      eventClocks: compiledClocks,
      checklist: compiledChecklist,
    },
  };
}
