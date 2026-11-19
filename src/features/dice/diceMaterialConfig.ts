export type DiceTexturePattern = "stone" | "marble" | "brushed" | "hammered" | "wood" | "smooth";
export type DiceShaderPreset = "none" | "nebula" | "molten" | "holo" | "liquid" | "arcane" | "custom";
export type DiceAcousticProfile = "stone" | "resin" | "metal" | "crystal" | "wood";

export interface DiceMaterialConfig {
  presetId: string;
  bodyColor: string;
  marksColor: string;
  accentColor: string;
  liningColor: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  iridescence: number;
  transmission: number;
  ior: number;
  emissiveIntensity: number;
  texturePattern: DiceTexturePattern;
  shaderPreset: DiceShaderPreset;
  shaderSpeed: number;
  shaderIntensity: number;
  customGlsl: string;
  acousticProfile: DiceAcousticProfile;
}

export interface DiceMaterialPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  swatch: string;
  config: DiceMaterialConfig;
}

export interface CustomDiceGlslTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const DEFAULT_CUSTOM_DICE_GLSL = `// 可用变量：
// uTime (秒), uAccentColor (强调色 vec3), uIntensity (强度 float)
// vDicePos (模型空间三维坐标 vec3), vDiceNormal (模型法线 vec3)
// 内置函数：hpHash31(vec3), hpNoise3(vec3), hpFbm3(vec3), hpVoronoi3(vec3)
// 可直接修改 diffuseColor.rgb 与 totalEmissiveRadiance

float n = hpFbm3(vDicePos * 3.2 + vec3(0.0, uTime * 0.45, uTime * 0.25));
float vein = smoothstep(0.56, 0.78, n);
float edge = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor, vein * 0.55 * uIntensity);
totalEmissiveRadiance += uAccentColor * (vein * 0.45 + edge * 0.65) * uIntensity;`;

export const CUSTOM_DICE_GLSL_TEMPLATES: CustomDiceGlslTemplate[] = [
  {
    id: "jade-vein",
    name: "翡翠流脉",
    description: "3D FBM 玉石流纹 + 菲涅耳边光",
    code: DEFAULT_CUSTOM_DICE_GLSL,
  },
  {
    id: "cyber-scan",
    name: "赛博扫描",
    description: "动态全息扫描带 + 脉冲边棱",
    code: `float scan = sin(vDicePos.y * 18.0 - uTime * 4.2) * 0.5 + 0.5;
float band = smoothstep(0.84, 0.99, scan);
float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.5);
float grid = smoothstep(0.92, 0.99, abs(sin(vDicePos.x * 16.0)) * abs(sin(vDicePos.z * 16.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor * 0.65, (band * 0.35 + grid * 0.25) * uIntensity);
totalEmissiveRadiance += uAccentColor * (band * 0.75 + fresnel * 0.85 + grid * 0.5) * uIntensity;`,
  },
  {
    id: "gold-kintsugi",
    name: "金缮裂纹",
    description: "Voronoi 陶瓷裂隙填充流动金箔",
    code: `float crack = hpVoronoi3(vDicePos * 4.4);
float seam = 1.0 - smoothstep(0.03, 0.11, crack);
float shimmer = 0.72 + 0.28 * sin(uTime * 2.6 + vDicePos.x * 6.0 + vDicePos.y * 5.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor * 1.15, seam * 0.92 * uIntensity);
totalEmissiveRadiance += uAccentColor * seam * shimmer * 0.75 * uIntensity;`,
  },
];

export const DICE_TEXTURE_LABELS: Record<DiceTexturePattern, string> = {
  stone: "玉石细纹",
  marble: "大理石云纹",
  brushed: "拉丝金属",
  hammered: "锻打锤纹",
  wood: "胡桃木纹",
  smooth: "纯滑抛光",
};

export const DICE_SHADER_LABELS: Record<DiceShaderPreset, string> = {
  none: "标准 PBR",
  nebula: "星云流沙",
  molten: "熔岩余烬",
  holo: "极光全息",
  liquid: "液态秘境",
  arcane: "奥术符文",
  custom: "自定义 GLSL",
};

export const DICE_ACOUSTIC_LABELS: Record<DiceAcousticProfile, string> = {
  stone: "玉石沉响",
  resin: "树脂脆击",
  metal: "金属铿锵",
  crystal: "水晶清鸣",
  wood: "木质温润",
};

const makeConfig = (
  presetId: string,
  overrides: Partial<DiceMaterialConfig>,
): DiceMaterialConfig => ({
  presetId,
  bodyColor: "#8fb9a5",
  marksColor: "#173d32",
  accentColor: "#5fe3c2",
  liningColor: "#18382f",
  roughness: 0.25,
  metalness: 0,
  clearcoat: 0.25,
  iridescence: 0,
  transmission: 0,
  ior: 1.5,
  emissiveIntensity: 0,
  texturePattern: "stone",
  shaderPreset: "none",
  shaderSpeed: 1,
  shaderIntensity: 1,
  customGlsl: DEFAULT_CUSTOM_DICE_GLSL,
  acousticProfile: "stone",
  ...overrides,
});

export const DICE_MATERIAL_PRESETS: DiceMaterialPreset[] = [
  {
    id: "jade",
    name: "青玉",
    badge: "经典",
    description: "温润抛光青玉，清漆微光",
    swatch: "linear-gradient(135deg, #a7d1bd 0%, #63967f 100%)",
    config: makeConfig("jade", {
      bodyColor: "#8fb9a5",
      marksColor: "#173d32",
      accentColor: "#b8eed4",
      liningColor: "#18382f",
      roughness: 0.25,
      metalness: 0,
      clearcoat: 0.3,
      texturePattern: "stone",
      shaderPreset: "none",
      acousticProfile: "stone",
    }),
  },
  {
    id: "ivory",
    name: "象牙",
    badge: "经典",
    description: "哑光象牙与深墨刻字",
    swatch: "linear-gradient(135deg, #fbf4e4 0%, #d8c6a2 100%)",
    config: makeConfig("ivory", {
      bodyColor: "#f3e7cd",
      marksColor: "#342e28",
      accentColor: "#d9b984",
      liningColor: "#18382f",
      roughness: 0.27,
      metalness: 0,
      clearcoat: 0.22,
      texturePattern: "smooth",
      shaderPreset: "none",
      acousticProfile: "resin",
    }),
  },
  {
    id: "obsidian",
    name: "黑曜石",
    badge: "经典",
    description: "镜面玄黑曜石配鎏金字面",
    swatch: "linear-gradient(135deg, #3c4f5c 0%, #162028 100%)",
    config: makeConfig("obsidian", {
      bodyColor: "#25343e",
      marksColor: "#e3d0a2",
      accentColor: "#f0c979",
      liningColor: "#1a2832",
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.55,
      texturePattern: "marble",
      shaderPreset: "none",
      acousticProfile: "stone",
    }),
  },
  {
    id: "neon",
    name: "霓虹",
    badge: "经典",
    description: "深海青金属感与荧光青数字",
    swatch: "linear-gradient(135deg, #1b4a59 0%, #24b3a1 100%)",
    config: makeConfig("neon", {
      bodyColor: "#15323e",
      marksColor: "#9aeee2",
      accentColor: "#2ee6d0",
      liningColor: "#10242c",
      roughness: 0.24,
      metalness: 0.28,
      clearcoat: 0.45,
      emissiveIntensity: 0.35,
      texturePattern: "brushed",
      shaderPreset: "none",
      acousticProfile: "resin",
    }),
  },
  {
    id: "gilded_metal",
    name: "鎏金锻铜",
    badge: "PBR 金属",
    description: "锻打锤纹古铜与暗金高光",
    swatch: "linear-gradient(135deg, #e7c27d 0%, #8f632b 100%)",
    config: makeConfig("gilded_metal", {
      bodyColor: "#c89d58",
      marksColor: "#231a11",
      accentColor: "#ffe2a1",
      liningColor: "#241d19",
      roughness: 0.26,
      metalness: 0.92,
      clearcoat: 0.15,
      texturePattern: "hammered",
      shaderPreset: "none",
      acousticProfile: "metal",
    }),
  },
  {
    id: "crystal",
    name: "秘银水晶",
    badge: "物理折射",
    description: "真实光学折射水晶（暗骰自动不透明）",
    swatch: "linear-gradient(135deg, #d7f2ff 0%, #6ba8e5 55%, #b48cff 100%)",
    config: makeConfig("crystal", {
      bodyColor: "#cce9ff",
      marksColor: "#ffffff",
      accentColor: "#78c8ff",
      liningColor: "#162638",
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      iridescence: 0.35,
      transmission: 0.84,
      ior: 1.54,
      emissiveIntensity: 0.15,
      texturePattern: "smooth",
      shaderPreset: "none",
      acousticProfile: "crystal",
    }),
  },
  {
    id: "nebula_core",
    name: "星云流沙",
    badge: "Shader",
    description: "3D 三平面深空星云与细闪星尘",
    swatch: "linear-gradient(135deg, #2d1e5f 0%, #7d4dff 55%, #4de1ff 100%)",
    config: makeConfig("nebula_core", {
      bodyColor: "#1b163c",
      marksColor: "#f7e7b8",
      accentColor: "#a26bff",
      liningColor: "#121329",
      roughness: 0.16,
      metalness: 0.15,
      clearcoat: 0.9,
      iridescence: 0.25,
      texturePattern: "smooth",
      shaderPreset: "nebula",
      shaderSpeed: 0.9,
      shaderIntensity: 1.15,
      acousticProfile: "resin",
    }),
  },
  {
    id: "molten_ember",
    name: "熔岩余烬",
    badge: "Shader",
    description: "黑曜焦壳下脉动的灼热熔岩裂隙",
    swatch: "linear-gradient(135deg, #2b1d1b 0%, #c83e18 55%, #ffbe42 100%)",
    config: makeConfig("molten_ember", {
      bodyColor: "#1e1a1c",
      marksColor: "#ffdf9e",
      accentColor: "#ff5a1f",
      liningColor: "#221817",
      roughness: 0.44,
      metalness: 0.12,
      clearcoat: 0.15,
      emissiveIntensity: 0.2,
      texturePattern: "stone",
      shaderPreset: "molten",
      shaderSpeed: 1.0,
      shaderIntensity: 1.25,
      acousticProfile: "stone",
    }),
  },
  {
    id: "holo_prism",
    name: "极光全息",
    badge: "薄膜干涉",
    description: "物理虹彩薄膜 + 视角光谱棱镜",
    swatch: "linear-gradient(135deg, #62f4ff 0%, #c57bff 50%, #ff8bc8 100%)",
    config: makeConfig("holo_prism", {
      bodyColor: "#cadbf0",
      marksColor: "#161d2e",
      accentColor: "#72f5ff",
      liningColor: "#182230",
      roughness: 0.12,
      metalness: 0.55,
      clearcoat: 1,
      iridescence: 1,
      texturePattern: "smooth",
      shaderPreset: "holo",
      shaderSpeed: 1.1,
      shaderIntensity: 1.0,
      acousticProfile: "crystal",
    }),
  },
  {
    id: "liquid_core",
    name: "液态秘境",
    badge: "Shader",
    description: "视差旋涡液芯与悬浮云母星光",
    swatch: "linear-gradient(135deg, #0b4a57 0%, #1fd4b2 55%, #b9fff1 100%)",
    config: makeConfig("liquid_core", {
      bodyColor: "#0e3b46",
      marksColor: "#eefcf7",
      accentColor: "#3ff2cf",
      liningColor: "#122b30",
      roughness: 0.08,
      metalness: 0.08,
      clearcoat: 1,
      iridescence: 0.42,
      texturePattern: "smooth",
      shaderPreset: "liquid",
      shaderSpeed: 1.05,
      shaderIntensity: 1.15,
      acousticProfile: "crystal",
    }),
  },
  {
    id: "arcane_rune",
    name: "奥术符文",
    badge: "Shader",
    description: "玄铁骰体与周期扫过的奥术秘纹",
    swatch: "linear-gradient(135deg, #1b2838 0%, #3d75b8 55%, #8ef6ff 100%)",
    config: makeConfig("arcane_rune", {
      bodyColor: "#1b2432",
      marksColor: "#8ef6ff",
      accentColor: "#57d9ff",
      liningColor: "#151d29",
      roughness: 0.24,
      metalness: 0.72,
      clearcoat: 0.4,
      emissiveIntensity: 0.22,
      texturePattern: "brushed",
      shaderPreset: "arcane",
      shaderSpeed: 1.0,
      shaderIntensity: 1.1,
      acousticProfile: "metal",
    }),
  },
];

const presetMap = new Map(DICE_MATERIAL_PRESETS.map((preset) => [preset.id, preset]));

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
};

const safeHex = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
};

export function configForPreset(presetId?: string | null): DiceMaterialConfig {
  const preset = presetMap.get(presetId ?? "jade") ?? DICE_MATERIAL_PRESETS[0];
  return { ...preset.config };
}

export function sanitizeDiceMaterialConfig(
  raw: Partial<DiceMaterialConfig> | null | undefined,
  fallbackPresetId = "jade",
): DiceMaterialConfig {
  const base = configForPreset(raw?.presetId ?? fallbackPresetId);
  if (!raw || typeof raw !== "object") return base;
  const texturePattern = raw.texturePattern && raw.texturePattern in DICE_TEXTURE_LABELS
    ? raw.texturePattern : base.texturePattern;
  const shaderPreset = raw.shaderPreset && raw.shaderPreset in DICE_SHADER_LABELS
    ? raw.shaderPreset : base.shaderPreset;
  const acousticProfile = raw.acousticProfile && raw.acousticProfile in DICE_ACOUSTIC_LABELS
    ? raw.acousticProfile : base.acousticProfile;
  return {
    presetId: typeof raw.presetId === "string" && raw.presetId ? raw.presetId : base.presetId,
    bodyColor: safeHex(raw.bodyColor, base.bodyColor),
    marksColor: safeHex(raw.marksColor, base.marksColor),
    accentColor: safeHex(raw.accentColor, base.accentColor),
    liningColor: safeHex(raw.liningColor, base.liningColor),
    roughness: clamp(raw.roughness, 0.04, 1, base.roughness),
    metalness: clamp(raw.metalness, 0, 1, base.metalness),
    clearcoat: clamp(raw.clearcoat, 0, 1, base.clearcoat),
    iridescence: clamp(raw.iridescence, 0, 1, base.iridescence),
    transmission: clamp(raw.transmission, 0, 0.92, base.transmission),
    ior: clamp(raw.ior, 1.1, 2.33, base.ior),
    emissiveIntensity: clamp(raw.emissiveIntensity, 0, 2, base.emissiveIntensity),
    texturePattern,
    shaderPreset,
    shaderSpeed: clamp(raw.shaderSpeed, 0, 3, base.shaderSpeed),
    shaderIntensity: clamp(raw.shaderIntensity, 0, 2, base.shaderIntensity),
    customGlsl: typeof raw.customGlsl === "string" && raw.customGlsl.trim()
      ? raw.customGlsl.slice(0, 3200)
      : base.customGlsl,
    acousticProfile,
  };
}

export function isAnimatedDiceConfig(config: DiceMaterialConfig): boolean {
  if (config.shaderPreset === "none") return false;
  if (config.shaderSpeed <= 0.001) return false;
  return true;
}

export function validateCustomDiceGlslSyntax(code: string): { ok: true } | { ok: false; error: string } {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "GLSL 代码不能为空。" };
  if (trimmed.length > 3200) return { ok: false, error: "GLSL 代码过长（上限 3200 字符）。" };
  if (/^\s*#\s*(version|include|extension|pragma)/m.test(trimmed)) {
    return { ok: false, error: "无需填写 #version / #include 等预处理指令，直接编写着色片段逻辑即可。" };
  }
  if (/\bwhile\s*\(/i.test(trimmed)) {
    return { ok: false, error: "为避免 GPU 死循环，自定义 Shader 不允许使用 while 循环。" };
  }
  if (/\bfor\s*\([^;]*;[^;]*;[^)]*\)/i.test(trimmed)) {
    const loopCount = (trimmed.match(/\bfor\s*\(/gi) ?? []).length;
    if (loopCount > 2) {
      return { ok: false, error: "为保证骰盘流畅，自定义 Shader 最多允许 2 个 for 循环。" };
    }
  }
  let depth = 0;
  for (const ch of trimmed) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) return { ok: false, error: "花括号 { } 未成对匹配。" };
  }
  if (depth !== 0) return { ok: false, error: "花括号 { } 未闭合。" };
  return { ok: true };
}

export function diceMaterialSignature(config: DiceMaterialConfig): string {
  return JSON.stringify([
    config.presetId,
    config.bodyColor,
    config.marksColor,
    config.accentColor,
    config.liningColor,
    config.roughness.toFixed(3),
    config.metalness.toFixed(3),
    config.clearcoat.toFixed(3),
    config.iridescence.toFixed(3),
    config.transmission.toFixed(3),
    config.ior.toFixed(2),
    config.emissiveIntensity.toFixed(2),
    config.texturePattern,
    config.shaderPreset,
    config.shaderSpeed.toFixed(2),
    config.shaderIntensity.toFixed(2),
    config.shaderPreset === "custom" ? config.customGlsl : "",
    config.acousticProfile,
  ]);
}
