import { useEffect, useState } from "react";
import type { BoardClockAppearance } from "../campaign/domain/clockAppearance.ts";
import type { CampaignClockStyle } from "../campaign/domain/campaignClock.ts";
import {
  hasActiveAmbientShader,
  hasActiveCardEffect,
  type BoardAmbientShader,
  type CardVisualEffect,
} from "../campaign/domain/cardEffects.ts";
import type { BoardStyleTokens } from "../campaign/domain/boardStyleTokens.ts";
import type { DiceMaterialConfig } from "../dice/diceMaterialConfig.ts";
import type { CompiledBoardBlueprint } from "../harness/schema.ts";

export type AccountAssetKind =
  | "card_shader"
  | "ambient_shader"
  | "board_style"
  | "clock_style"
  | "dice_material";

export interface CardShaderAssetPayload {
  kind: "card_shader";
  target: "card" | "note";
  effect: CardVisualEffect;
  noteColor?: string;
  pinColor?: string;
}

export interface AmbientShaderAssetPayload {
  kind: "ambient_shader";
  role: "surface" | "frame" | "both";
  surfaceShader?: BoardAmbientShader;
  frameShader?: BoardAmbientShader;
}

export interface BoardStyleAssetPayload {
  kind: "board_style";
  styleTokens: BoardStyleTokens;
}

export interface ClockStyleAssetPayload {
  kind: "clock_style";
  clockStyle?: CampaignClockStyle;
  clockAppearance: BoardClockAppearance;
}

export interface DiceMaterialAssetPayload {
  kind: "dice_material";
  config: DiceMaterialConfig;
}

export type AccountAssetPayload =
  | CardShaderAssetPayload
  | AmbientShaderAssetPayload
  | BoardStyleAssetPayload
  | ClockStyleAssetPayload
  | DiceMaterialAssetPayload;

export interface AccountDesignAsset {
  id: string;
  ownerId: string;
  kind: AccountAssetKind;
  name: string;
  description: string;
  source: "ai" | "custom";
  prompt?: string | null;
  previewColors: string[];
  payload: AccountAssetPayload;
  favorite: boolean;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export const ACCOUNT_ASSET_KIND_LABELS: Record<AccountAssetKind, string> = {
  card_shader: "卡片 / 便签 Shader",
  ambient_shader: "黑板 / 外框 Shader",
  board_style: "全局视觉样式",
  clock_style: "时钟样式",
  dice_material: "骰子材质 / Shader",
};

const STORAGE_PREFIX = "vb-account-assets-v1:";
const CHANGE_EVENT = "vb:account-assets-changed";
const MAX_ASSETS_PER_ACCOUNT = 120;

function storageKey(ownerId: string) {
  return `${STORAGE_PREFIX}${ownerId || "local-guest"}`;
}

function stableHash(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export function fingerprintAssetPayload(payload: AccountAssetPayload): string {
  return `${payload.kind}:${stableHash(JSON.stringify(payload))}`;
}

function safeReadStorage(ownerId: string): AccountDesignAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AccountDesignAsset =>
        Boolean(item && typeof item === "object" && typeof item.id === "string" && item.payload),
    );
  } catch {
    return [];
  }
}

function safeWriteStorage(ownerId: string, assets: AccountDesignAsset[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(assets.slice(0, MAX_ASSETS_PER_ACCOUNT)));
  } catch {
    // Ignore quota errors gracefully.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ownerId } }));
  }
}

export function listAccountAssets(
  ownerId: string,
  kind?: AccountAssetKind,
): AccountDesignAsset[] {
  const all = safeReadStorage(ownerId);
  const filtered = kind ? all.filter((item) => item.kind === kind) : all;
  return filtered.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function saveAccountAsset(
  ownerId: string,
  input: {
    name: string;
    description: string;
    source: "ai" | "custom";
    prompt?: string | null;
    previewColors: string[];
    payload: AccountAssetPayload;
  },
): { asset: AccountDesignAsset; created: boolean } {
  const now = new Date().toISOString();
  const fp = fingerprintAssetPayload(input.payload);
  const current = safeReadStorage(ownerId);
  const existingIndex = current.findIndex((item) => item.fingerprint === fp);
  if (existingIndex >= 0) {
    const updated: AccountDesignAsset = {
      ...current[existingIndex],
      name: input.name.trim() || current[existingIndex].name,
      description: input.description.trim() || current[existingIndex].description,
      prompt: input.prompt ?? current[existingIndex].prompt,
      previewColors: input.previewColors.length
        ? input.previewColors
        : current[existingIndex].previewColors,
      updatedAt: now,
    };
    const next = [updated, ...current.filter((_, idx) => idx !== existingIndex)];
    safeWriteStorage(ownerId, next);
    return { asset: updated, created: false };
  }

  const asset: AccountDesignAsset = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId: ownerId || "local-guest",
    kind: input.payload.kind,
    name: input.name.trim().slice(0, 48) || "未命名资产",
    description: input.description.trim().slice(0, 140),
    source: input.source,
    prompt: input.prompt?.trim().slice(0, 200) ?? null,
    previewColors: input.previewColors.slice(0, 4),
    payload: structuredClone(input.payload),
    favorite: false,
    fingerprint: fp,
    createdAt: now,
    updatedAt: now,
  };
  safeWriteStorage(ownerId, [asset, ...current]);
  return { asset, created: true };
}

export function toggleAccountAssetFavorite(ownerId: string, assetId: string) {
  const current = safeReadStorage(ownerId);
  const next = current.map((item) =>
    item.id === assetId
      ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() }
      : item,
  );
  safeWriteStorage(ownerId, next);
}

export function deleteAccountAsset(ownerId: string, assetId: string) {
  const current = safeReadStorage(ownerId);
  safeWriteStorage(
    ownerId,
    current.filter((item) => item.id !== assetId),
  );
}

/**
 * 自动提取 AI 蓝图生成的所有 Shader、板面材质、全局样式与时钟样式，
 * 收入当前登录账号的个人资产库（自动去重，不重复刷屏）。
 */
export function captureBlueprintAssetsToAccount(
  ownerId: string,
  compiled: CompiledBoardBlueprint,
  prompt?: string | null,
): AccountDesignAsset[] {
  if (!ownerId) return [];
  const saved: AccountDesignAsset[] = [];
  const tokens = compiled.commitPayload.styleTokens;
  const before = compiled.preApplySettings.styleTokens;
  const labelBase = compiled.summary.trim() || "AI 生成资产";

  // 1. 黑板板面 / 外框 Shader
  const surfaceChanged =
    hasActiveAmbientShader(tokens.surfaceShader) &&
    JSON.stringify(tokens.surfaceShader) !== JSON.stringify(before.surfaceShader);
  const frameChanged =
    hasActiveAmbientShader(tokens.frameShader) &&
    JSON.stringify(tokens.frameShader) !== JSON.stringify(before.frameShader);

  if (surfaceChanged || frameChanged) {
    const role = surfaceChanged && frameChanged ? "both" : surfaceChanged ? "surface" : "frame";
    const active = surfaceChanged ? tokens.surfaceShader! : tokens.frameShader!;
    const { asset } = saveAccountAsset(ownerId, {
      name: active.shaderName || `${labelBase} · 板面环境`,
      description:
        role === "both"
          ? "AI 生成的黑板板面 + 外框 WebGL2 环境着色器"
          : role === "surface"
            ? "AI 生成的黑板板面 WebGL2 着色器"
            : "AI 生成的外框 WebGL2 着色器",
      source: "ai",
      prompt,
      previewColors: [active.primaryColor, active.secondaryColor],
      payload: {
        kind: "ambient_shader",
        role,
        surfaceShader: surfaceChanged ? tokens.surfaceShader : undefined,
        frameShader: frameChanged ? tokens.frameShader : undefined,
      },
    });
    saved.push(asset);
  }

  // 2. 卡片 / 便签 Shader（默认或面板/便签内生成的 ai_glsl / 特殊材质）
  const seenCardEffects = new Set<string>();
  const trySaveCardEffect = (
    effect: CardVisualEffect | null | undefined,
    target: "card" | "note",
    extra?: { noteColor?: string; pinColor?: string },
  ) => {
    if (!effect || !hasActiveCardEffect(effect)) return;
    const key = JSON.stringify([target, effect.shader, effect.customGlsl ?? "", effect.accentColor ?? "", effect.progress]);
    if (seenCardEffects.has(key)) return;
    seenCardEffects.add(key);
    const { asset } = saveAccountAsset(ownerId, {
      name:
        effect.shaderName ||
        (effect.shader === "ai_glsl"
          ? `${labelBase} · 自定义 GLSL`
          : target === "note"
            ? `${labelBase} · 便签材质`
            : `${labelBase} · 卡片 Shader`),
      description:
        effect.shader === "ai_glsl"
          ? "AI 编写的自定义 WebGL2 片段着色器"
          : `着色器：${effect.shader} · 强度 ${effect.glowIntensity.toFixed(1)}`,
      source: "ai",
      prompt,
      previewColors: [
        extra?.noteColor || "#2c241d",
        effect.accentColor || "#ff6a2b",
      ],
      payload: {
        kind: "card_shader",
        target,
        effect,
        noteColor: extra?.noteColor,
        pinColor: extra?.pinColor,
      },
    });
    saved.push(asset);
  };

  if (
    hasActiveCardEffect(tokens.defaultCardEffect) &&
    JSON.stringify(tokens.defaultCardEffect) !== JSON.stringify(before.defaultCardEffect)
  ) {
    trySaveCardEffect(tokens.defaultCardEffect, "card");
  }
  if (
    hasActiveCardEffect(tokens.defaultNoteEffect) &&
    JSON.stringify(tokens.defaultNoteEffect) !== JSON.stringify(before.defaultNoteEffect)
  ) {
    trySaveCardEffect(tokens.defaultNoteEffect, "note");
  }
  for (const panel of compiled.commitPayload.customPanels) {
    if (panel.effect?.shader === "ai_glsl") {
      trySaveCardEffect(panel.effect, "card");
    }
  }
  for (const note of compiled.commitPayload.notes) {
    if (note.effect && hasActiveCardEffect(note.effect)) {
      trySaveCardEffect(note.effect, "note", {
        noteColor: note.color,
        pinColor: note.pinColor,
      });
    }
  }
  for (const update of compiled.commitPayload.noteUpdates) {
    if (update.effect && hasActiveCardEffect(update.effect)) {
      trySaveCardEffect(update.effect, "note", {
        noteColor: update.color,
        pinColor: update.pinColor,
      });
    }
  }

  // 3. 时钟样式
  const clockAppearanceChanged =
    tokens.clockAppearance &&
    tokens.clockAppearance.preset !== "auto" &&
    JSON.stringify(tokens.clockAppearance) !== JSON.stringify(before.clockAppearance);
  if (clockAppearanceChanged && tokens.clockAppearance) {
    const ca = tokens.clockAppearance;
    const { asset } = saveAccountAsset(ownerId, {
      name: ca.label || `${labelBase} · 时钟样式`,
      description: ca.aiPrompt || `时钟视觉主题（${ca.preset}）`,
      source: "ai",
      prompt,
      previewColors: [
        ca.surfaceColor || "#182028",
        ca.accentColor || "#2be4dc",
        ca.borderColor || "#b8905c",
      ],
      payload: {
        kind: "clock_style",
        clockStyle: compiled.commitPayload.clock?.style,
        clockAppearance: ca,
      },
    });
    saved.push(asset);
  }

  // 4. 全局视觉风格配方（当字体/卡片样式/连线变化时）
  const styleChanged =
    tokens.fontPreset !== before.fontPreset ||
    tokens.cardStyle !== before.cardStyle ||
    tokens.cardBackground !== before.cardBackground ||
    tokens.linkStyle !== before.linkStyle;
  if (styleChanged) {
    const { asset } = saveAccountAsset(ownerId, {
      name: `${labelBase} · 视觉样式`,
      description: `卡片 ${tokens.cardStyle} · 字体 ${tokens.fontPreset} · 连线 ${tokens.linkStyle}`,
      source: "ai",
      prompt,
      previewColors: [
        tokens.cardBackground || (tokens.cardStyle === "terminal" ? "#101b18" : tokens.cardStyle === "slate" ? "#232a2e" : "#efe2c4"),
        tokens.linkStyle === "neon_cyan" ? "#2be4dc" : tokens.linkStyle === "gold_thread" ? "#d4a644" : "#d32029",
      ],
      payload: {
        kind: "board_style",
        styleTokens: tokens,
      },
    });
    saved.push(asset);
  }

  return saved;
}

export function useAccountAssets(ownerId: string, kind?: AccountAssetKind) {
  const [assets, setAssets] = useState<AccountDesignAsset[]>(() =>
    listAccountAssets(ownerId, kind),
  );

  useEffect(() => {
    setAssets(listAccountAssets(ownerId, kind));
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string }>).detail;
      if (!detail?.ownerId || detail.ownerId === ownerId) {
        setAssets(listAccountAssets(ownerId, kind));
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(ownerId)) {
        setAssets(listAccountAssets(ownerId, kind));
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [ownerId, kind]);

  return assets;
}
