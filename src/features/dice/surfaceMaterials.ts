import {
  CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace,
  RepeatWrapping, SRGBColorSpace, type Material, type Texture,
} from "three";
import {
  configForPreset, DICE_MATERIAL_PRESETS, validateCustomDiceGlslSyntax,
  type DiceMaterialConfig, type DiceShaderPreset, type DiceTexturePattern,
} from "./diceMaterialConfig.ts";

export type SurfaceSlot = "body" | "marks" | "rim" | "lining" | "trim" | "stitch";
export interface SurfaceStyle {
  color: string;
  roughness: number;
  metalness: number;
  physical?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  transmission?: number;
  thickness?: number;
  ior?: number;
  dispersion?: number;
  attenuationColor?: string;
  attenuationDistance?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  emissive?: string;
  emissiveIntensity?: number;
  texturePattern?: DiceTexturePattern | "felt";
  map?: Texture | null;
  normalMap?: Texture | null;
  normalScale?: number;
  roughnessMap?: Texture | null;
  metalnessMap?: Texture | null;
  bumpMap?: Texture | null;
  bumpScale?: number;
  /** Declare distinct shader code with a distinct key; uniform values stay mutable. */
  shader?: { key: string; apply: Material["onBeforeCompile"] };
}
export type SurfaceSkin = Record<SurfaceSlot, SurfaceStyle>;

export interface SurfaceMaterialOptions {
  /** Secret/blind dice must remain opaque so hidden faces cannot show through. */
  opaque?: boolean;
  config?: DiceMaterialConfig | null;
}

const baseSkin: SurfaceSkin = {
  body: {
    color: "#8fb9a5", roughness: .25, metalness: 0, physical: true,
    clearcoat: .28, clearcoatRoughness: .18, texturePattern: "stone",
  },
  marks: { color: "#173d32", roughness: .4, metalness: .08 },
  rim: { color: "#73503a", roughness: .42, metalness: 0, texturePattern: "wood" },
  lining: {
    color: "#18382f", roughness: .96, metalness: 0, physical: true,
    sheen: .72, sheenRoughness: .85, sheenColor: "#2e5c4e", texturePattern: "felt",
  },
  trim: { color: "#bba477", roughness: .32, metalness: .86, texturePattern: "brushed" },
  stitch: { color: "#9eaa89", roughness: .85, metalness: 0 },
};

function skinFromPresetConfig(config: DiceMaterialConfig): SurfaceSkin {
  const lining = new Color(config.liningColor);
  const sheenColor = `#${lining.clone().offsetHSL(0, .05, .14).getHexString()}`;
  const isNeonMarks = config.emissiveIntensity > 0.02;
  return {
    ...baseSkin,
    body: {
      ...baseSkin.body,
      color: config.bodyColor,
      roughness: config.roughness,
      metalness: config.metalness,
      physical: true,
      clearcoat: config.clearcoat,
      clearcoatRoughness: Math.max(0.05, config.roughness * 0.65),
      iridescence: config.iridescence,
      iridescenceIOR: 1.52,
      iridescenceThicknessRange: [140, 760],
      transmission: config.transmission,
      thickness: 1.15,
      ior: config.ior,
      dispersion: config.transmission > 0.1 ? 0.32 : 0,
      attenuationColor: config.accentColor,
      attenuationDistance: 1.85,
      texturePattern: config.texturePattern,
      emissive: config.shaderPreset === "none" ? "#000000" : config.accentColor,
      emissiveIntensity: config.shaderPreset === "none" ? 0 : 0.08,
    },
    marks: {
      ...baseSkin.marks,
      color: config.marksColor,
      roughness: isNeonMarks ? .3 : .42,
      metalness: config.metalness > .6 ? .18 : .08,
      emissive: isNeonMarks ? config.accentColor : "#000000",
      emissiveIntensity: isNeonMarks ? config.emissiveIntensity : 0,
    },
    lining: {
      ...baseSkin.lining,
      color: config.liningColor,
      sheenColor,
    },
  };
}

const skins = new Map<string, SurfaceSkin>(
  DICE_MATERIAL_PRESETS.map((preset) => [preset.id, skinFromPresetConfig(preset.config)]),
);
let revision = 0;

/** Register a skin without changing geometry or physics. Texture ownership stays
 * with the caller; replacing a skin affects subsequently acquired material sets.
 */
export function registerSurfaceSkin(id: string, overrides: Partial<Record<SurfaceSlot, Partial<SurfaceStyle>>>) {
  const previous = skins.get(id);
  const result = { ...baseSkin };
  for (const slot of Object.keys(baseSkin) as SurfaceSlot[]) {
    result[slot] = { ...baseSkin[slot], ...overrides[slot] };
  }
  skins.set(id, result);
  revision++;
  return () => {
    if (skins.get(id) !== result) return;
    if (previous) skins.set(id, previous);
    else skins.delete(id);
    revision++;
  };
}

const SHADER_VERTEX_HEADER = `
varying vec3 vDicePos;
varying vec3 vDiceNormal;
varying vec3 vDiceWorldPos;
`;

const SHADER_FRAGMENT_HEADER = `
uniform float uTime;
uniform vec3 uAccentColor;
uniform float uIntensity;
uniform float uSpeed;
varying vec3 vDicePos;
varying vec3 vDiceNormal;
varying vec3 vDiceWorldPos;

float hpHash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float hpNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hpHash31(i + vec3(0.0, 0.0, 0.0)), hpHash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hpHash31(i + vec3(0.0, 1.0, 0.0)), hpHash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hpHash31(i + vec3(0.0, 0.0, 1.0)), hpHash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hpHash31(i + vec3(0.0, 1.0, 1.0)), hpHash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float hpFbm3(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * hpNoise3(p);
    p = p * 2.07 + vec3(13.1, 7.7, 5.3);
    amp *= 0.5;
  }
  return value;
}

float hpVoronoi3(vec3 p) {
  vec3 g = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 lattice = vec3(float(x), float(y), float(z));
        vec3 cell = g + lattice;
        vec3 offset = vec3(
          hpHash31(cell + vec3(1.1, 2.3, 3.7)),
          hpHash31(cell + vec3(4.5, 1.9, 6.1)),
          hpHash31(cell + vec3(7.3, 5.2, 2.9))
        );
        vec3 diff = lattice + offset - f;
        float dist = dot(diff, diff);
        if (dist < d1) {
          d2 = d1;
          d1 = dist;
        } else if (dist < d2) {
          d2 = dist;
        }
      }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
`;

function builtInShaderBody(preset: Exclude<DiceShaderPreset, "none" | "custom">): string {
  switch (preset) {
    case "nebula":
      return `
      {
        float t = uTime * max(0.0, uSpeed);
        vec3 viewDir = normalize(vViewPosition);
        vec3 p = vDicePos * 2.6 + vec3(sin(t * 0.25) * 0.35, t * 0.18, cos(t * 0.21) * 0.35);
        float cloudA = hpFbm3(p);
        float cloudB = hpFbm3(p * 1.9 + vec3(cloudA * 2.2, -t * 0.14, cloudA * 1.4));
        float nebula = smoothstep(0.32, 0.82, cloudB);
        vec3 starCell = floor((vDicePos + viewDir * 0.08) * 26.0);
        float starSeed = hpHash31(starCell);
        float twinkle = 0.55 + 0.45 * sin(t * 4.5 + starSeed * 48.0);
        float sparkle = step(0.955, starSeed) * twinkle;
        vec3 coolTint = vec3(0.28, 0.78, 1.0);
        vec3 mixCol = mix(uAccentColor, coolTint, smoothstep(0.35, 0.78, cloudA));
        diffuseColor.rgb = mix(diffuseColor.rgb, mixCol * 0.85, nebula * 0.62 * uIntensity);
        totalEmissiveRadiance += (mixCol * nebula * 0.42 + vec3(1.0, 0.96, 0.88) * sparkle * 1.35) * uIntensity;
      }`;
    case "molten":
      return `
      {
        float t = uTime * max(0.0, uSpeed);
        vec3 p = vDicePos * 3.8 + vec3(0.0, t * 0.12, 0.0);
        float warp = hpFbm3(p * 1.25) * 0.65;
        float cracks = hpVoronoi3(p + vec3(warp));
        float lava = 1.0 - smoothstep(0.03, 0.18, cracks);
        float core = 1.0 - smoothstep(0.0, 0.07, cracks);
        float pulse = 0.72 + 0.28 * sin(t * 2.8 + warp * 8.0);
        vec3 hotCore = mix(uAccentColor, vec3(1.0, 0.92, 0.45), core * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor * 0.45, lava * 0.55 * uIntensity);
        totalEmissiveRadiance += hotCore * (lava * 0.95 + core * 1.15) * pulse * uIntensity;
      }`;
    case "holo":
      return `
      {
        float t = uTime * max(0.0, uSpeed);
        vec3 viewDir = normalize(vViewPosition);
        float ndv = clamp(abs(dot(normalize(vNormal), viewDir)), 0.0, 1.0);
        float fresnel = pow(1.0 - ndv, 2.2);
        float phase = (1.0 - ndv) * 4.6 + dot(vDicePos, vec3(1.8, 2.3, 1.4)) + t * 0.95;
        vec3 rainbow = 0.52 + 0.48 * cos(phase + vec3(0.0, 2.094, 4.188));
        vec3 prism = mix(rainbow, uAccentColor, 0.28);
        diffuseColor.rgb = mix(diffuseColor.rgb, prism, (0.34 + fresnel * 0.48) * uIntensity);
        totalEmissiveRadiance += prism * (0.14 + fresnel * 0.65) * uIntensity;
      }`;
    case "liquid":
      return `
      {
        float t = uTime * max(0.0, uSpeed);
        vec3 viewDir = normalize(vViewPosition);
        vec3 parallax = vDicePos - viewDir * 0.18;
        float angle = t * 0.55 + length(parallax.xz) * 2.8;
        float c = cos(angle), s = sin(angle);
        vec3 swirled = vec3(parallax.x * c - parallax.z * s, parallax.y, parallax.x * s + parallax.z * c);
        float flow = hpFbm3(swirled * 3.1 + vec3(0.0, t * 0.25, 0.0));
        float ribbons = smoothstep(0.42, 0.78, sin(flow * 11.0 + t * 1.4) * 0.5 + 0.5);
        vec3 micaCell = floor(swirled * 22.0);
        float mica = step(0.94, hpHash31(micaCell)) * (0.6 + 0.4 * sin(t * 5.0 + hpHash31(micaCell) * 31.0));
        float rim = pow(1.0 - clamp(abs(dot(normalize(vNormal), viewDir)), 0.0, 1.0), 2.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor, ribbons * 0.58 * uIntensity);
        totalEmissiveRadiance += (uAccentColor * (ribbons * 0.44 + rim * 0.42) + vec3(0.95, 1.0, 1.0) * mica * 0.95) * uIntensity;
      }`;
    case "arcane":
      return `
      {
        float t = uTime * max(0.0, uSpeed);
        vec3 viewDir = normalize(vViewPosition);
        float wave = sin(dot(vDicePos, vec3(2.4, 3.2, 2.0)) - t * 2.6);
        float sweep = smoothstep(0.82, 0.995, wave * 0.5 + 0.5);
        vec3 ap = abs(fract(vDicePos * 4.0) - 0.5);
        float lattice = 1.0 - smoothstep(0.02, 0.07, min(min(ap.x, ap.y), ap.z));
        float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormal), viewDir)), 0.0, 1.0), 2.8);
        float runeMask = lattice * (0.28 + sweep * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAccentColor, runeMask * 0.5 * uIntensity);
        totalEmissiveRadiance += uAccentColor * (runeMask * 0.95 + sweep * 0.35 + fresnel * 0.42) * uIntensity;
      }`;
  }
}

export function testCompileDiceGlsl(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null | undefined,
  snippet: string,
): { ok: true } | { ok: false; error: string } {
  const syntax = validateCustomDiceGlslSyntax(snippet);
  if (!syntax.ok) return syntax;
  if (!gl) return { ok: true };
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!shader) return { ok: true };
  const source = `
    precision mediump float;
    ${SHADER_FRAGMENT_HEADER}
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      vec4 diffuseColor = vec4(1.0);
      vec3 totalEmissiveRadiance = vec3(0.0);
      ${snippet}
      gl_FragColor = vec4(diffuseColor.rgb + totalEmissiveRadiance, 1.0);
    }
  `;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = Boolean(gl.getShaderParameter(shader, gl.COMPILE_STATUS));
  const log = ok ? "" : (gl.getShaderInfoLog(shader) ?? "GLSL 编译失败").trim();
  gl.deleteShader(shader);
  if (ok) return { ok: true };
  const concise = log.split("\n").slice(0, 3).join(" ").replace(/^ERROR:\s*/i, "");
  return { ok: false, error: concise || "GLSL 编译错误" };
}

let noiseSeed = 7;
function random() {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  return noiseSeed / 4294967296;
}

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

interface ProceduralTextureBundle {
  map: CanvasTexture;
  bump: CanvasTexture;
  normal: CanvasTexture;
  roughness: CanvasTexture;
}

function makeTextureSet(kind: Exclude<DiceTexturePattern, "smooth"> | "felt"): ProceduralTextureBundle {
  const size = 256;
  const height = new Float32Array(size * size);
  const seeds: Record<typeof kind, number> = {
    stone: 17, marble: 41, brushed: 59, hammered: 83, wood: 71, felt: 93,
  };
  noiseSeed = seeds[kind];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = random();
      let h = 0.5;
      if (kind === "stone") {
        h = 0.72 + Math.sin(x * .025 + Math.sin(y * .025) * 3) * .12 + Math.cos(y * .05 - x * .03) * .05 + grain * .09;
      } else if (kind === "marble") {
        const swirl = Math.sin((x + y * 0.65) * 0.045 + Math.sin(y * 0.032) * 3.8 + Math.cos(x * 0.028) * 2.4);
        const vein = Math.pow(Math.abs(swirl), 0.35);
        h = 0.55 + vein * 0.36 + grain * 0.04;
      } else if (kind === "brushed") {
        const streak = Math.sin(y * 0.85 + Math.sin(x * 0.025) * 1.4) * 0.14 + (random() - 0.5) * 0.16;
        const fine = Math.sin(y * 2.9) * 0.06;
        h = 0.74 + streak + fine;
      } else if (kind === "hammered") {
        const cx = ((x % 32) - 16) / 16;
        const cy = ((y % 32) - 16) / 16;
        const cx2 = (((x + 16) % 32) - 16) / 16;
        const cy2 = (((y + 16) % 32) - 16) / 16;
        const d1 = Math.min(1, Math.hypot(cx, cy));
        const d2 = Math.min(1, Math.hypot(cx2, cy2));
        const dimple = Math.min(d1 * d1, d2 * d2);
        h = 0.45 + dimple * 0.45 + grain * 0.06;
      } else if (kind === "wood") {
        const wave = Math.sin(x * Math.PI * 2 / size * 4 + Math.sin(y * Math.PI * 2 / size) * 2);
        h = 0.62 + wave * 0.18 + Math.sin(x * .7 + wave * 2) * .06 + grain * .08;
      } else {
        // felt / velvet weave
        h = 0.68 + grain * 0.22 + (x % 2 === y % 2 ? 0.07 : -0.05);
      }
      height[y * size + x] = Math.max(0, Math.min(1, h));
    }
  }

  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = albedoCanvas.height = size;
  const albedoCtx = albedoCanvas.getContext("2d")!;
  const albedoData = albedoCtx.createImageData(size, size);

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d")!;
  const normalData = normalCtx.createImageData(size, size);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext("2d")!;
  const roughData = roughCtx.createImageData(size, size);

  const strength = kind === "hammered" ? 3.2 : kind === "wood" ? 2.4 : kind === "felt" ? 2.0 : kind === "brushed" ? 1.8 : 1.1;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const idx = y * size + x;
      const h = height[idx];
      const p = idx * 4;

      // Subtle albedo modulation (keeps base color faithful while adding natural micro-contrast)
      const shade = Math.round(188 + h * 67);
      albedoData.data[p] = albedoData.data[p + 1] = albedoData.data[p + 2] = shade;
      albedoData.data[p + 3] = 255;

      // Sobel tangent-space normal map
      const tl = height[ym * size + xm], t = height[ym * size + x], tr = height[ym * size + xp];
      const l = height[y * size + xm], r = height[y * size + xp];
      const bl = height[yp * size + xm], b = height[yp * size + x], br = height[yp * size + xp];
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const nz = 1;
      const invLen = 1 / Math.hypot(dx, dy, nz);
      normalData.data[p] = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      normalData.data[p + 1] = Math.round(((-dy * invLen) * 0.5 + 0.5) * 255);
      normalData.data[p + 2] = Math.round(((nz * invLen) * 0.5 + 0.5) * 255);
      normalData.data[p + 3] = 255;

      // Roughness micro-variation around 0.85..1.0 so slider roughness stays accurate
      const roughByte = Math.round((0.84 + (1 - h) * 0.16) * 255);
      roughData.data[p] = roughData.data[p + 1] = roughData.data[p + 2] = roughByte;
      roughData.data[p + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoData, 0, 0);
  normalCtx.putImageData(normalData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);

  const map = new CanvasTexture(albedoCanvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;

  const bump = new CanvasTexture(albedoCanvas);
  bump.colorSpace = NoColorSpace;
  bump.wrapS = bump.wrapT = RepeatWrapping;

  const normal = new CanvasTexture(normalCanvas);
  normal.colorSpace = NoColorSpace;
  normal.wrapS = normal.wrapT = RepeatWrapping;

  const roughness = new CanvasTexture(roughCanvas);
  roughness.colorSpace = NoColorSpace;
  roughness.wrapS = roughness.wrapT = RepeatWrapping;

  return { map, bump, normal, roughness };
}

function makeAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let tile = 0; tile <= 34; tile++) {
    const text = tile <= 20 ? String(tile) : tile <= 30 ? String((tile - 21) * 10).padStart(2, "0") :
      tile === 31 ? "?" : tile === 32 ? "−" : tile === 33 ? "•" : "+";
    const x = (tile % 8) * 128 + 64, y = Math.floor(tile / 8) * 128 + 64;
    ctx.font = `${tile === 32 || tile === 34 ? 500 : 600} ${text.length === 2 ? 83 : 94}px Georgia, serif`;
    ctx.fillText(text, x, y + 2);
    if (text === "6" || text === "9") ctx.fillRect(x - 17, y + 42, 34, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Scene-scoped ownership: shared resources across all dice, released on close. */
export function createSurfaceLibrary(gl?: WebGLRenderingContext | WebGL2RenderingContext | null) {
  const textures: Record<Exclude<DiceTexturePattern, "smooth"> | "felt", ProceduralTextureBundle> = {
    stone: makeTextureSet("stone"),
    marble: makeTextureSet("marble"),
    brushed: makeTextureSet("brushed"),
    hammered: makeTextureSet("hammered"),
    wood: makeTextureSet("wood"),
    felt: makeTextureSet("felt"),
  };
  const atlas = makeAtlas();
  const materials = new Map<string, MeshStandardMaterial>();
  const generatedTextures: Texture[] = [
    ...Object.values(textures).flatMap((bundle) => [bundle.map, bundle.bump, bundle.normal, bundle.roughness]),
    atlas,
  ];
  const sharedUniforms = {
    uTime: { value: 0 },
    uAccentColor: { value: new Color("#5fe3c2") },
    uIntensity: { value: 1 },
    uSpeed: { value: 1 },
  };
  let activeConfig: DiceMaterialConfig | null = null;
  let lastValidCustomGlsl = configForPreset("jade").customGlsl;

  const buildShaderHook = (
    preset: DiceShaderPreset,
    customSnippet: string,
  ): SurfaceStyle["shader"] | undefined => {
    if (preset === "none") return undefined;
    const body = preset === "custom" ? customSnippet : builtInShaderBody(preset);
    const key = preset === "custom" ? `custom:${hashString(body)}` : `builtin:${preset}`;
    return {
      key,
      apply(shader) {
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.uniforms.uAccentColor = sharedUniforms.uAccentColor;
        shader.uniforms.uIntensity = sharedUniforms.uIntensity;
        shader.uniforms.uSpeed = sharedUniforms.uSpeed;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${SHADER_VERTEX_HEADER}`)
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\nvDicePos = position;\nvDiceNormal = normal;`,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>\nvDiceWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${SHADER_FRAGMENT_HEADER}`)
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>\n${body}`,
          );
      },
    };
  };

  const resolveStyle = (slot: SurfaceSlot, skin: string, overrideConfig?: DiceMaterialConfig | null): SurfaceStyle => {
    const cfg = overrideConfig ?? activeConfig;
    if (cfg) {
      const derived = skinFromPresetConfig(cfg);
      if (slot === "body") {
        const shader = buildShaderHook(
          cfg.shaderPreset,
          cfg.shaderPreset === "custom" ? lastValidCustomGlsl : cfg.customGlsl,
        );
        return { ...derived.body, shader };
      }
      return derived[slot];
    }
    const presetConfig = DICE_MATERIAL_PRESETS.find((item) => item.id === skin)?.config;
    const base = (skins.get(skin) ?? baseSkin)[slot];
    if (slot === "body" && presetConfig && presetConfig.shaderPreset !== "none" && !base.shader) {
      return { ...base, shader: buildShaderHook(presetConfig.shaderPreset, presetConfig.customGlsl) };
    }
    return base;
  };

  const syncUniforms = (cfg: DiceMaterialConfig | null, skin: string) => {
    const source = cfg ?? DICE_MATERIAL_PRESETS.find((item) => item.id === skin)?.config;
    if (!source) return;
    sharedUniforms.uAccentColor.value.set(source.accentColor);
    sharedUniforms.uIntensity.value = source.shaderIntensity;
    sharedUniforms.uSpeed.value = source.shaderSpeed;
  };

  return {
    setTime(seconds: number) {
      sharedUniforms.uTime.value = seconds;
    },
    setConfig(config: DiceMaterialConfig | null): { ok: true } | { ok: false; error: string } {
      activeConfig = config;
      if (config) {
        syncUniforms(config, config.presetId);
        if (config.shaderPreset === "custom") {
          const check = testCompileDiceGlsl(gl, config.customGlsl);
          if (!check.ok) {
            return check;
          }
          lastValidCustomGlsl = config.customGlsl;
        }
      }
      return { ok: true };
    },
    material(slot: SurfaceSlot, skin = "jade", labels = false, options?: SurfaceMaterialOptions) {
      const opaque = !!options?.opaque;
      const override = options?.config ?? activeConfig;
      syncUniforms(override, skin);
      const style = resolveStyle(slot, skin, override);
      const shaderKey = style.shader?.key ?? "pbr";
      const effectiveTransmission = opaque ? 0 : (style.transmission ?? 0);
      const transmissiveBucket = effectiveTransmission > 0.01 ? "glass" : "solid";
      const patternBucket = style.texturePattern ?? (slot === "body" && skin !== "ivory" ? "stone" : slot === "rim" ? "wood" : slot === "lining" ? "felt" : "smooth");
      const key = `${revision}:${override ? "custom" : skin}:${slot}:${labels}:${opaque}:${shaderKey}:${transmissiveBucket}:${patternBucket}`;

      let material = materials.get(key);
      if (!material) {
        const needsPhysical = Boolean(
          style.physical ||
          (style.clearcoat ?? 0) > 0 ||
          (style.iridescence ?? 0) > 0 ||
          effectiveTransmission > 0.01 ||
          (style.sheen ?? 0) > 0,
        );
        material = needsPhysical ? new MeshPhysicalMaterial() : new MeshStandardMaterial();
        material.name = slot;

        const defaultPattern: Exclude<DiceTexturePattern, "smooth"> | "felt" | null =
          patternBucket === "smooth" ? null : patternBucket as Exclude<DiceTexturePattern, "smooth"> | "felt";
        const detail = defaultPattern ? textures[defaultPattern] : null;
        const useDetailMap = detail && effectiveTransmission < 0.2;

        material.map = style.map === undefined ? (useDetailMap ? detail.map : null) : style.map;
        material.normalMap = style.normalMap === undefined ? (useDetailMap ? detail.normal : null) : style.normalMap;
        if (material.normalMap) {
          const scale = style.normalScale ?? (
            defaultPattern === "hammered" ? 0.55
              : defaultPattern === "wood" ? 0.42
              : defaultPattern === "felt" ? 0.48
              : defaultPattern === "brushed" ? 0.34
              : 0.22
          );
          material.normalScale.set(scale, scale);
        }
        material.roughnessMap = style.roughnessMap === undefined ? (useDetailMap ? detail.roughness : null) : style.roughnessMap;
        material.bumpMap = style.bumpMap === undefined ? null : style.bumpMap;
        material.bumpScale = style.bumpScale ?? (slot === "lining" ? .013 : slot === "rim" ? .012 : .001);
        material.metalnessMap = style.metalnessMap ?? null;

        if (labels) {
          material.map = style.map === undefined ? atlas : style.map;
          material.normalMap = null;
          material.roughnessMap = null;
          material.bumpMap = null;
          material.transparent = true;
          material.alphaTest = .18;
          material.depthWrite = false;
          material.polygonOffset = true;
          material.polygonOffsetFactor = -1;
        }
        if (style.shader) {
          material.onBeforeCompile = style.shader.apply;
          material.customProgramCacheKey = () => `${slot}:${labels}:${opaque}:${style.shader!.key}`;
        }
        materials.set(key, material);
      }

      // Live in-place scalar & color updates (zero GPU shader recompile on slider drags!)
      material.color.set(style.color);
      material.roughness = style.roughness;
      material.metalness = style.metalness;
      material.emissive.set(style.emissive ?? "#000000");
      material.emissiveIntensity = style.emissiveIntensity ?? 1;

      if (material instanceof MeshPhysicalMaterial) {
        material.clearcoat = style.clearcoat ?? 0;
        material.clearcoatRoughness = style.clearcoatRoughness ?? .2;
        material.iridescence = style.iridescence ?? 0;
        material.iridescenceIOR = style.iridescenceIOR ?? 1.5;
        material.iridescenceThicknessRange = style.iridescenceThicknessRange ?? [140, 760];
        material.transmission = effectiveTransmission;
        if (effectiveTransmission > 0.01) {
          material.thickness = style.thickness ?? 1.15;
          material.ior = style.ior ?? 1.5;
          material.attenuationColor.set(style.attenuationColor ?? style.color);
          material.attenuationDistance = style.attenuationDistance ?? 1.85;
          if ("dispersion" in material) {
            (material as MeshPhysicalMaterial & { dispersion: number }).dispersion = style.dispersion ?? 0.3;
          }
        }
        if ((style.sheen ?? 0) > 0) {
          material.sheen = style.sheen!;
          material.sheenRoughness = style.sheenRoughness ?? 0.85;
          material.sheenColor.set(style.sheenColor ?? style.color);
        }
      }
      return material;
    },
    dispose() {
      materials.forEach((material) => material.dispose());
      generatedTextures.forEach((texture) => texture.dispose());
      materials.clear();
    },
  };
}
export type SurfaceLibrary = ReturnType<typeof createSurfaceLibrary>;
