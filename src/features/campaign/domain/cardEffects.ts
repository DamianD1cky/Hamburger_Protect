import { normalizeColor } from "./campaignSettings.ts";

/**
 * 卡片与便签材质着色器类型：
 * - "none"：经典纯净纸面
 * - "burnt"：真实纸张火焰燃烧与炭裂镂空着色器（模块卡片唯一内置预设，烧焦处自动隐去字迹）
 * - "parchment"：羊皮纸便签预设着色器（手工毛边、陈年羊皮纤维肌理、折痕与墨晕暗角）
 * - "hologram"：全息投影便签预设着色器（半透明全息光场、动态扫描线、菲涅尔发光边与四角投影准星）
 * - "ai_glsl"：由 AI 帷幕编排官动态生成的 WebGL2 GLSL 片段着色器
 */
export type CardShaderKind =
  | "none"
  | "burnt"
  | "parchment"
  | "hologram"
  | "ai_glsl";

export type CardShaderTopology = "corner" | "bottom" | "perimeter" | "point";

// Legacy compatibility mirror types
export type CardOrnamentKind =
  | "none"
  | "overgrown"
  | "inferno"
  | "frost"
  | "eldritch"
  | "sealed";
export type CardOrnamentPlacement = "bottom" | "around" | "corners" | "top";
export type CardEdgeWear =
  | "clean"
  | "scorched"
  | "mossy"
  | "frosted"
  | "aged";
export type CardEffectIntensity = "subtle" | "medium" | "lush";

export const MAX_CUSTOM_GLSL_LENGTH = 2800;

export interface CardVisualEffect {
  shader: CardShaderKind;
  topology: CardShaderTopology;
  progress: number;
  origin: [number, number];
  glowIntensity: number;
  spreadWidth: number;
  noiseAmount: number;
  seed: number;
  accentColor: string | null;
  customGlsl?: string | null;
  shaderName?: string | null;

  // Backward-compatible legacy mirror fields
  ornament: CardOrnamentKind;
  placement: CardOrnamentPlacement;
  edgeWear: CardEdgeWear;
  intensity: CardEffectIntensity;
}

/**
 * 公告板背景（BoardSurface）与边框（BoardFrame）的 AI 可控环境着色器。
 */
export type AmbientShaderKind =
  | "none"
  | "ember_ash"
  | "hologram_grid"
  | "ancient_vellum"
  | "abyssal_mist"
  | "ai_glsl";

export interface BoardAmbientShader {
  shader: AmbientShaderKind;
  intensity: number;
  speed: number;
  primaryColor: string;
  secondaryColor: string;
  customGlsl?: string | null;
  shaderName?: string | null;
}

const TOPOLOGIES: readonly CardShaderTopology[] = [
  "corner",
  "bottom",
  "perimeter",
  "point",
];
const PLACEMENTS: readonly CardOrnamentPlacement[] = [
  "bottom",
  "around",
  "corners",
  "top",
];
const INTENSITIES: readonly CardEffectIntensity[] = [
  "subtle",
  "medium",
  "lush",
];
const AMBIENT_SHADERS: readonly AmbientShaderKind[] = [
  "none",
  "ember_ash",
  "hologram_grid",
  "ancient_vellum",
  "abyssal_mist",
  "ai_glsl",
];

function clampNum(
  v: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Number(Math.min(max, Math.max(min, n)).toFixed(3));
}

/** 过滤危险预处理器指令，确保 AI 生成的 GLSL 片段安全可控。 */
export function sanitizeCustomGlsl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(
      /#\s*(?:version|extension|pragma|define|undef|ifdef|ifndef|if|else|elif|endif|error|line)\b[^\n]*/gi,
      "",
    )
    .trim()
    .slice(0, MAX_CUSTOM_GLSL_LENGTH);
  return cleaned.length >= 12 ? cleaned : null;
}

export function defaultCardVisualEffect(): CardVisualEffect {
  return {
    shader: "none",
    topology: "corner",
    progress: 0,
    origin: [0.88, 0.1],
    glowIntensity: 2.3,
    spreadWidth: 0.22,
    noiseAmount: 0.45,
    seed: 7,
    accentColor: null,
    customGlsl: null,
    shaderName: null,
    ornament: "none",
    placement: "bottom",
    edgeWear: "clean",
    intensity: "medium",
  };
}

export function normalizeCardVisualEffect(raw: unknown): CardVisualEffect {
  const base = defaultCardVisualEffect();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const sanitizedGlsl = sanitizeCustomGlsl(r.customGlsl);
  let shader: CardShaderKind = "none";

  if (r.shader === "ai_glsl" && sanitizedGlsl) {
    shader = "ai_glsl";
  } else if (r.shader === "parchment") {
    shader = "parchment";
  } else if (r.shader === "hologram") {
    shader = "hologram";
  } else if (
    r.shader === "burnt" ||
    (r.shader === "ai_glsl" && !sanitizedGlsl) ||
    r.ornament === "inferno" ||
    r.edgeWear === "scorched"
  ) {
    shader = "burnt";
  } else if (sanitizedGlsl && r.shader !== "none") {
    shader = "ai_glsl";
  }

  if (shader === "none") return base;

  const defaultTopo: CardShaderTopology =
    shader === "parchment" || shader === "hologram"
      ? "perimeter"
      : r.placement === "around"
        ? "perimeter"
        : r.placement === "bottom"
          ? "bottom"
          : "corner";
  const topology: CardShaderTopology = TOPOLOGIES.includes(
    r.topology as CardShaderTopology,
  )
    ? (r.topology as CardShaderTopology)
    : defaultTopo;

  const defaultProgress =
    shader === "parchment" || shader === "hologram"
      ? 0.35
      : r.intensity === "lush"
        ? 0.36
        : r.intensity === "subtle"
          ? 0.2
          : 0.32;
  const progress = clampNum(r.progress, defaultProgress, 0.04, 0.92);

  let origin: [number, number] =
    topology === "bottom" || topology === "point"
      ? [0.5, 0.08]
      : topology === "perimeter"
        ? [0.5, 0.5]
        : [0.88, 0.1];
  if (Array.isArray(r.origin) && r.origin.length >= 2) {
    origin = [
      clampNum(r.origin[0], origin[0], 0, 1),
      clampNum(r.origin[1], origin[1], 0, 1),
    ];
  }

  const defaultGlow =
    shader === "parchment" ? 0.4 : shader === "hologram" ? 2.1 : 2.3;
  const glowIntensity = clampNum(r.glowIntensity, defaultGlow, 0, 5);
  const spreadWidth = clampNum(r.spreadWidth, 0.22, 0.03, 0.5);
  const noiseAmount = clampNum(r.noiseAmount, 0.45, 0.05, 0.88);
  const seed = Math.round(clampNum(r.seed, 7, 1, 999));
  const accentColor =
    typeof r.accentColor === "string" ? normalizeColor(r.accentColor) : null;
  const shaderName =
    typeof r.shaderName === "string" && r.shaderName.trim()
      ? r.shaderName.trim().slice(0, 48)
      : shader === "ai_glsl"
        ? "AI 编排着色器"
        : null;

  const placement: CardOrnamentPlacement = PLACEMENTS.includes(
    r.placement as CardOrnamentPlacement,
  )
    ? (r.placement as CardOrnamentPlacement)
    : topology === "perimeter"
      ? "around"
      : topology === "bottom"
        ? "bottom"
        : "corners";

  const intensity: CardEffectIntensity = INTENSITIES.includes(
    r.intensity as CardEffectIntensity,
  )
    ? (raw as Record<string, CardEffectIntensity>).intensity
    : progress >= 0.35
      ? "lush"
      : progress <= 0.2
        ? "subtle"
        : "medium";

  return {
    shader,
    topology,
    progress,
    origin,
    glowIntensity,
    spreadWidth,
    noiseAmount,
    seed,
    accentColor,
    customGlsl: shader === "ai_glsl" ? sanitizedGlsl : null,
    shaderName,
    ornament: "inferno",
    placement,
    edgeWear: "scorched",
    intensity,
  };
}

export function hasActiveCardEffect(
  effect: CardVisualEffect | null | undefined,
): boolean {
  if (!effect) return false;
  return effect.shader !== "none" && effect.progress > 0;
}

export function defaultBoardAmbientShader(): BoardAmbientShader {
  return {
    shader: "none",
    intensity: 1,
    speed: 1,
    primaryColor: "#243b42",
    secondaryColor: "#2ee6d6",
    customGlsl: null,
    shaderName: null,
  };
}

export function normalizeBoardAmbientShader(raw: unknown): BoardAmbientShader {
  const base = defaultBoardAmbientShader();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const cleanGlsl = sanitizeCustomGlsl(r.customGlsl);
  let shader: AmbientShaderKind = AMBIENT_SHADERS.includes(
    r.shader as AmbientShaderKind,
  )
    ? (r.shader as AmbientShaderKind)
    : cleanGlsl
      ? "ai_glsl"
      : "none";
  if (shader === "ai_glsl" && !cleanGlsl) {
    shader = "ember_ash";
  }
  if (shader === "none") return base;

  const defaultColors: Record<
    Exclude<AmbientShaderKind, "none">,
    [string, string]
  > = {
    ember_ash: ["#1c110d", "#ea580c"],
    hologram_grid: ["#091a22", "#2be4dc"],
    ancient_vellum: ["#3a2a19", "#d4a644"],
    abyssal_mist: ["#0f1722", "#6366f1"],
    ai_glsl: ["#171b21", "#f59e0b"],
  };
  const [defPri, defSec] = defaultColors[shader];

  return {
    shader,
    intensity: clampNum(r.intensity, 1.0, 0.1, 2.5),
    speed: clampNum(r.speed, 1.0, 0, 3.0),
    primaryColor:
      typeof r.primaryColor === "string"
        ? normalizeColor(r.primaryColor) ?? defPri
        : defPri,
    secondaryColor:
      typeof r.secondaryColor === "string"
        ? normalizeColor(r.secondaryColor) ?? defSec
        : defSec,
    customGlsl: shader === "ai_glsl" ? cleanGlsl : null,
    shaderName:
      typeof r.shaderName === "string" && r.shaderName.trim()
        ? r.shaderName.trim().slice(0, 48)
        : shader === "ai_glsl"
          ? "AI 场景着色器"
          : null,
  };
}

export function hasActiveAmbientShader(
  s: BoardAmbientShader | null | undefined,
): boolean {
  return Boolean(s && s.shader !== "none");
}

/** 模块与展板卡片内置预设：仅保留火焰燃烧系列。 */
export const cardEffectPresets: ReadonlyArray<{
  id: string;
  label: string;
  effect: CardVisualEffect;
}> = [
  {
    id: "none",
    label: "完好如初",
    effect: defaultCardVisualEffect(),
  },
  {
    id: "burnt_smoke",
    label: "轻微烟熏焦边",
    effect: normalizeCardVisualEffect({
      shader: "burnt",
      topology: "perimeter",
      progress: 0.18,
      glowIntensity: 0.9,
      spreadWidth: 0.24,
      noiseAmount: 0.42,
      seed: 11,
    }),
  },
  {
    id: "burnt_corner_ember",
    label: "边角烧焦（活余烬）",
    effect: normalizeCardVisualEffect({
      shader: "burnt",
      topology: "corner",
      origin: [0.88, 0.1],
      progress: 0.35,
      glowIntensity: 2.3,
      spreadWidth: 0.24,
      noiseAmount: 0.46,
      seed: 7,
    }),
  },
  {
    id: "burnt_bottom_heavy",
    label: "底部焚毁穿孔",
    effect: normalizeCardVisualEffect({
      shader: "burnt",
      topology: "bottom",
      origin: [0.5, 0.08],
      progress: 0.36,
      glowIntensity: 2.4,
      spreadWidth: 0.22,
      noiseAmount: 0.45,
      seed: 17,
    }),
  },
  {
    id: "burnt_cold_char",
    label: "熄灭死灰炭卷",
    effect: normalizeCardVisualEffect({
      shader: "burnt",
      topology: "corner",
      origin: [0.86, 0.14],
      progress: 0.32,
      glowIntensity: 0,
      spreadWidth: 0.26,
      noiseAmount: 0.48,
      seed: 29,
    }),
  },
];

/** 便签系统专属预设：包含经典便利贴、羊皮纸便签、全息投影便签与烈焰烧焦便签。 */
export const noteEffectPresets: ReadonlyArray<{
  id: string;
  label: string;
  recommendedNoteColor?: string;
  recommendedPinColor?: string;
  effect: CardVisualEffect;
}> = [
  {
    id: "note_classic",
    label: "经典便利贴",
    effect: defaultCardVisualEffect(),
  },
  {
    id: "note_parchment",
    label: "羊皮纸便签",
    recommendedNoteColor: "#ead6b1",
    recommendedPinColor: "#8c5a2b",
    effect: normalizeCardVisualEffect({
      shader: "parchment",
      topology: "perimeter",
      progress: 0.36,
      glowIntensity: 0.5,
      spreadWidth: 0.28,
      noiseAmount: 0.44,
      seed: 15,
    }),
  },
  {
    id: "note_hologram",
    label: "全息投影便签",
    recommendedNoteColor: "#0b2530",
    recommendedPinColor: "#2be4dc",
    effect: normalizeCardVisualEffect({
      shader: "hologram",
      topology: "perimeter",
      progress: 0.38,
      glowIntensity: 2.2,
      spreadWidth: 0.22,
      noiseAmount: 0.35,
      seed: 42,
      accentColor: "#2be4dc",
    }),
  },
  {
    id: "note_burnt",
    label: "烈焰烧焦便签",
    recommendedNoteColor: "#f3e3bd",
    recommendedPinColor: "#b82e1f",
    effect: normalizeCardVisualEffect({
      shader: "burnt",
      topology: "corner",
      origin: [0.88, 0.12],
      progress: 0.33,
      glowIntensity: 2.3,
      spreadWidth: 0.23,
      noiseAmount: 0.46,
      seed: 13,
    }),
  },
];
