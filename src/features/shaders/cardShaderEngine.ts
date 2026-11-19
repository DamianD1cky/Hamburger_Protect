import {
  sanitizeCustomGlsl,
  type AmbientShaderKind,
  type BoardAmbientShader,
  type CardShaderKind,
  type CardShaderTopology,
  type CardVisualEffect,
} from "../campaign/domain/cardEffects";

const VERTEX_SHADER_300 = `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * 默认卡片与便签片段材质函数体：
 * - uShaderKind == 1 (burnt)：完整物理燃烧层次（烟熏 -> 焦黄 -> 卷边 -> 闪烁 HDR 余烬火星 -> 炭黑龟裂 -> 灰带镂空）。
 * - uShaderKind == 2 (parchment)：羊皮纸便签预设（手工毛边、陈旧羊皮肌理、茶褐暗角、古旧折痕）。
 * - uShaderKind == 3 (hologram)：全息投影便签预设（半透明全息光场、动态扫描线、菲涅尔边缘辉光、四角光学准星）。
 */
const DEFAULT_CARD_MATERIAL_GLSL = `
  if (uShaderKind == 2) {
    // ============== PARCHMENT (羊皮纸便签着色器) ==============
    vec2 px = uv * uResolution;
    vec2 edgePx = min(px, uResolution - px);
    float minEdgePx = min(edgePx.x, edgePx.y);
    float deckle = fbm(uv * 24.0 + uSeed * 1.3) * 4.5 + hash(floor(px * 0.5) + uSeed) * 1.4;
    if (minEdgePx < deckle * 0.72) discard;

    vec3 vellumBase = mix(uBaseColor, vec3(0.91, 0.82, 0.65), 0.55);
    float coarse = fbm(uv * 5.2 + uSeed * 0.37);
    float fine = fbm(uv * 28.0 - uSeed * 0.91);
    float creaseH = exp(-pow((uv.y - 0.52 + (coarse - 0.5) * 0.03) * 55.0, 2.0));
    float creaseV = exp(-pow((uv.x - 0.48 + (fine - 0.5) * 0.02) * 65.0, 2.0));
    vec3 col = vellumBase + (coarse - 0.5) * 0.11 + (fine - 0.5) * 0.045;

    // 四周陈年茶褐氧化晕边 + 羊皮折痕微光
    vec2 vigUv = (uv - 0.5) * 2.0;
    float vig = clamp(dot(vigUv, vigUv) * 0.52, 0.0, 1.0);
    col = mix(col, vec3(0.45, 0.30, 0.15), vig * (0.36 + 0.34 * coarse));
    col = mix(col, vec3(0.32, 0.20, 0.09), smoothstep(14.0, 0.0, minEdgePx) * 0.48);
    col += vec3(0.10, 0.08, 0.05) * (creaseH * 0.55 + creaseV * 0.35);

    // 古典双细墨框线
    if (abs(minEdgePx - 11.0) < 0.75) {
      col = mix(col, vec3(0.36, 0.24, 0.12), 0.38 * (0.5 + 0.5 * fine));
    }
    return vec4(clamp(col, 0.0, 1.0), 1.0);
  }

  if (uShaderKind == 3) {
    // ============== HOLOGRAM (全息投影便签着色器) ==============
    vec2 px = uv * uResolution;
    vec2 edgePx = min(px, uResolution - px);
    float minEdgePx = min(edgePx.x, edgePx.y);

    // 切角光学投影轮廓
    float cornerCut = (uResolution.x - edgePx.x) < 9999.0 ? (edgePx.x + edgePx.y) : 99.0;
    if (cornerCut < 11.0) discard;

    vec3 holoAccent = uHasAccent > 0.5 ? uAccentColor : vec3(0.17, 0.90, 0.87);
    vec3 darkCore = mix(vec3(0.03, 0.11, 0.15), uBaseColor * 0.32, 0.35);

    float scanFine = 0.5 + 0.5 * sin(px.y * 1.65 - uTime * 7.5);
    float sweep = exp(-pow(fract(uv.y - uTime * 0.22) - 0.5, 2.0) * 42.0);
    float grid = max(
      smoothstep(0.95, 1.0, cos(px.x * 0.26)),
      smoothstep(0.95, 1.0, cos(px.y * 0.26))
    ) * 0.14;
    float fresnel = exp(-minEdgePx * 0.14);

    vec3 col = darkCore;
    col += holoAccent * (0.09 + 0.08 * scanFine + grid + sweep * 0.22);
    col += holoAccent * fresnel * (0.52 + 0.18 * uGlowIntensity);

    // 外发光边框与四角精密投影准星
    if (minEdgePx < 2.2) {
      col = mix(holoAccent, vec3(0.92, 1.0, 1.0), 0.55);
    } else if ((edgePx.x < 18.0 && abs(edgePx.y - 6.0) < 1.1) || (edgePx.y < 18.0 && abs(edgePx.x - 6.0) < 1.1)) {
      col = mix(col, vec3(0.9, 1.0, 1.0), 0.85);
    }

    float holoAlpha = clamp(0.84 + fresnel * 0.14, 0.0, 0.97);
    return vec4(clamp(col, 0.0, 1.0), holoAlpha);
  }

  // ============== BURNT (真实纸张火焰燃烧与炭裂余烬) ==============
  if (d >= 0.0) {
    float scorch = smoothstep(uSpreadWidth, 0.0, d);
    float blotch = fbm(uv * 7.0 - uSeed);
    float amt = scorch * (0.55 + 0.45 * blotch);
    vec3 s = mix(color, vec3(0.62, 0.38, 0.13), amt * 0.78);
    s = mix(s, vec3(0.22, 0.10, 0.035), pow(amt, 2.3) * 0.88);
    s *= 1.0 - smoothstep(uSpreadWidth * 1.7, uSpreadWidth * 0.6, d) * 0.22 * (0.4 + 0.6 * blotch);
    color = s;
    color *= 1.0 - 0.28 * exp(-d * 38.0);
    color *= 1.0 + 0.11 * exp(-abs(d - 0.045) * 60.0);
  } else {
    float behind = -d;
    float crack = pow(ridge(uv * 34.0 + uSeed), 6.0) * 0.7
                + pow(ridge(uv * 13.0 - uSeed), 4.0) * 0.3;
    vec3 charCol = vec3(0.035, 0.028, 0.025) * (0.6 + 0.8 * ashNoise) + crack * 0.055;
    vec3 ashCol = mix(
      vec3(0.10, 0.09, 0.085),
      vec3(0.52, 0.50, 0.47),
      smoothstep(uCharWidth, uAshWidth, behind) * (0.35 + 0.65 * ashNoise)
    );
    ashCol *= 1.0 - crack * 0.45;
    vec3 burnt = mix(charCol, ashCol, smoothstep(uCharWidth * 0.7, uAshWidth, behind));

    float emberBand = smoothstep(uEmberWidth, 0.0, behind);
    float flicker = 0.72 + 0.28 * sin(uTime * 11.0 + n * 42.0 + sin(uTime * 23.0 + uv.x * 31.0));
    float sparks = smoothstep(0.62, 0.95, fbm(uv * 19.0 + vec2(0.0, -uTime * 0.55) + uSeed));
    vec3 emberHot = uHasAccent > 0.5 ? uAccentColor : vec3(1.0, 0.16, 0.01);
    vec3 emberBright = uHasAccent > 0.5 ? mix(uAccentColor, vec3(1.0), 0.48) : vec3(1.0, 0.58, 0.09);
    burnt += mix(emberHot, emberBright, sparks) * uGlowIntensity * flicker * (0.55 + 0.75 * sparks) * emberBand;
    color = burnt;
    alpha *= mix(1.0, 0.3 + 0.7 * ashNoise, smoothstep(uCharWidth, uAshWidth, behind));
  }
  return vec4(color, alpha);
`;

function buildCardFragmentShaderSource(customBody: string | null): string {
  const materialBody = customBody ?? DEFAULT_CARD_MATERIAL_GLSL;
  return `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform int   uShaderKind;
uniform int   uTopology;
uniform int   uMaskMode;
uniform float uTime;
uniform float uProgress;
uniform vec2  uOrigin;
uniform float uCardAspect;
uniform vec2  uResolution;
uniform float uNoiseScale;
uniform float uNoiseAmount;
uniform float uCharWidth;
uniform float uAshWidth;
uniform float uEmberWidth;
uniform float uSpreadWidth;
uniform float uGlowIntensity;
uniform float uSeed;
uniform vec3  uBaseColor;
uniform vec3  uAccentColor;
uniform float uHasAccent;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.3;
    a *= 0.5;
  }
  return v;
}

float ridge(vec2 p) {
  return 1.0 - abs(vnoise(p) * 2.0 - 1.0);
}

vec3 synthesizeBasePaper(vec2 uv) {
  float grain = (hash(floor(uv * uResolution * 0.85)) - 0.5) * 0.035;
  float mottle = (fbm(uv * 6.5 + uSeed * 0.13) - 0.5) * 0.045;
  vec3 col = clamp(uBaseColor + grain + mottle, 0.0, 1.0);

  vec2 px = uv * uResolution;
  vec2 pxFromEdge = min(px, uResolution - px);
  float minPx = min(pxFromEdge.x, pxFromEdge.y);

  float isLight = dot(uBaseColor, vec3(0.299, 0.587, 0.114));
  vec3 ruleCol = isLight > 0.45
    ? mix(uBaseColor, vec3(0.42, 0.33, 0.20), 0.42)
    : mix(uBaseColor, vec3(0.75, 0.78, 0.76), 0.28);

  if (minPx < 2.0) {
    col = mix(col, ruleCol, 0.75);
  } else if (abs(minPx - 9.5) < 0.85) {
    col = mix(col, ruleCol, 0.35);
  }
  return col;
}

float computeSignedDistance(vec2 uv, float n, float n2) {
  float perturb = (n - 0.5) * uNoiseAmount + (n2 - 0.5) * uNoiseAmount * 0.35;

  if (uTopology == 1) {
    float field = uv.y + perturb * 0.62;
    float front = mix(-0.12, 1.05, uProgress);
    return field - front;
  }

  if (uTopology == 2) {
    vec2 aspectScale = vec2(min(uCardAspect, 1.35), 1.0);
    vec2 edgeDist = min(uv, 1.0 - uv) * aspectScale;
    float minEdge = min(edgeDist.x, edgeDist.y);
    float cornerDist = length(edgeDist) * 0.62;
    float baseField = mix(minEdge, cornerDist, 0.32);
    float field = baseField + perturb * 0.32;
    float front = mix(-0.07, 0.48, uProgress);
    return field - front;
  }

  vec2 p = vec2(uv.x * uCardAspect, uv.y);
  vec2 o = vec2(uOrigin.x * uCardAspect, uOrigin.y);
  float field = length(p - o) + perturb;
  float maxCorner = max(
    max(length(vec2(0.0, 0.0) - o), length(vec2(uCardAspect, 0.0) - o)),
    max(length(vec2(0.0, 1.0) - o), length(vec2(uCardAspect, 1.0) - o))
  ) + uNoiseAmount * 0.55;
  float front = mix(-0.16, maxCorner, uProgress);
  return field - front;
}

vec4 evaluateMaterial(vec2 uv, float d, vec3 color, float n, float n2, float ashNoise) {
  float alpha = 1.0;
  ${materialBody}
}

void main() {
  vec2 uv = vUv;
  float n = fbm(uv * uNoiseScale + uSeed);
  float n2 = fbm(uv * uNoiseScale * 2.7 - uSeed * 1.7);
  float d = computeSignedDistance(uv, n, n2);
  float ashNoise = fbm(uv * 26.0 + uSeed * 3.1);

  // 仅火焰燃烧 (burnt == 1) 与 AI 自定义材质 (ai_glsl == 4) 进行火焰穿孔与烧焦隐字裁剪；
  // 羊皮纸 (2) 与全息投影 (3) 保持完整文字可读性。
  if (uShaderKind == 1 || uShaderKind == 4) {
    if (d < -uAshWidth) discard;
    if (d < -uAshWidth * 0.45 && ashNoise < 0.42) discard;
    if (d < 0.0 && ashNoise < 0.18 * smoothstep(0.0, -uAshWidth, d)) discard;

    if (uMaskMode == 2) {
      if (d <= 0.008) discard;
      float inkSurvive = smoothstep(0.008, 0.030, d);
      fragColor = vec4(1.0, 1.0, 1.0, inkSurvive);
      return;
    }
  } else if (uMaskMode == 2) {
    fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    return;
  }

  vec3 basePaper = synthesizeBasePaper(uv);
  vec4 result = evaluateMaterial(uv, d, basePaper, n, n2, ashNoise);
  if (result.a <= 0.01) discard;

  if (uMaskMode == 1) {
    fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    return;
  }

  fragColor = result;
}
`;
}

/**
 * 公告板背景（uRole == 0）与外边框（uRole == 1）的 WebGL2 环境着色器：
 * 支持 AI 命令驱动余烬焦木/熔岩桌面（ember_ash）、全息投影战术网格与流光边框（hologram_grid）、
 * 古旧羊皮星图与鎏金符文框（ancient_vellum）、深渊迷雾（abyssal_mist）以及 AI 编写的任意 GLSL！
 */
const DEFAULT_AMBIENT_GLSL_BODY = `
  vec2 px = uv * uResolution;
  vec2 edgePx = min(px, uResolution - px);
  float minEdgePx = min(edgePx.x, edgePx.y);
  float t = uTime * uSpeed;

  if (uPreset == 1) {
    // ember_ash: 余烬焦土板面 / 炭化熔火木框
    float grain = fbm(uv * vec2(12.0, 7.5));
    float cracks = pow(ridge(uv * 22.0 + 3.7), 6.0);
    float heatWave = 0.55 + 0.45 * sin(t * 2.6 + grain * 14.0);
    vec3 col = mix(uPrimaryColor * 0.65, uPrimaryColor * 1.35, grain);
    if (uRole == 1) {
      // 边框斜接木纹 + 内缘余烬火脉
      float innerDist = abs(minEdgePx - 32.0);
      float emberRim = exp(-innerDist * 0.16) * (0.5 + 0.5 * cracks);
      col += uSecondaryColor * uIntensity * (cracks * 0.55 * heatWave + emberRim * 0.95);
      col *= 0.78 + 0.22 * sin(minEdgePx * 0.45);
    } else {
      float sparks = smoothstep(0.76, 0.98, fbm(uv * 16.0 + vec2(t * 0.08, -t * 0.18)));
      col += uSecondaryColor * uIntensity * (cracks * 0.28 * heatWave + sparks * 0.65);
    }
    return vec4(clamp(col, 0.0, 1.0), 1.0);
  }

  if (uPreset == 2) {
    // hologram_grid: 全息战术网格背景 / 霓虹能量流光边框
    vec3 col = uPrimaryColor;
    if (uRole == 1) {
      float groove = exp(-abs(minEdgePx - 17.0) * 0.35);
      float innerRim = exp(-abs(minEdgePx - 33.0) * 0.45);
      float pulse = 0.5 + 0.5 * sin((uv.x + uv.y) * 18.0 - t * 3.4);
      col += uSecondaryColor * uIntensity * (groove * (0.45 + 0.55 * pulse) + innerRim * 0.85);
      // 四角装甲刻度
      if (edgePx.x < 48.0 && edgePx.y < 48.0) {
        col += uSecondaryColor * 0.35 * step(0.5, fract(minEdgePx * 0.18));
      }
    } else {
      float gx = smoothstep(0.965, 1.0, cos(px.x * 0.1047));
      float gy = smoothstep(0.965, 1.0, cos(px.y * 0.1047));
      float subX = smoothstep(0.985, 1.0, cos(px.x * 0.523));
      float subY = smoothstep(0.985, 1.0, cos(px.y * 0.523));
      float radar = exp(-abs(length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)) - fract(t * 0.12) * 1.1) * 28.0);
      float scan = 0.93 + 0.07 * sin(px.y * 1.2 - t * 5.0);
      col *= scan;
      col += uSecondaryColor * uIntensity * ((gx + gy) * 0.24 + (subX + subY) * 0.08 + radar * 0.36);
    }
    return vec4(clamp(col, 0.0, 1.0), 1.0);
  }

  if (uPreset == 3) {
    // ancient_vellum: 古旧羊皮航海星图 / 鎏金符文古框
    float mottle = fbm(uv * 6.5 + 2.1);
    float fine = fbm(uv * 24.0 - 4.3);
    vec3 col = mix(uPrimaryColor, uPrimaryColor * 1.38 + vec3(0.12, 0.09, 0.04), mottle);
    if (uRole == 1) {
      float inlay = exp(-abs(minEdgePx - 16.0) * 0.55) + exp(-abs(minEdgePx - 28.0) * 0.65);
      float shimmer = 0.72 + 0.28 * sin(t * 1.8 + (uv.x - uv.y) * 14.0);
      col = mix(col, uSecondaryColor, clamp(inlay * 0.68 * uIntensity * shimmer, 0.0, 0.92));
    } else {
      vec2 centered = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float r = length(centered);
      float rings = exp(-abs(r - 0.28) * 90.0) + exp(-abs(r - 0.52) * 90.0) + exp(-abs(r - 0.76) * 90.0);
      float vig = clamp(dot(uv - 0.5, uv - 0.5) * 1.4, 0.0, 1.0);
      col = mix(col, uPrimaryColor * 0.52, vig * 0.65);
      col += uSecondaryColor * rings * 0.26 * uIntensity * (0.5 + 0.5 * fine);
    }
    return vec4(clamp(col, 0.0, 1.0), 1.0);
  }

  // abyssal_mist: 深渊迷雾暗涌
  float mist1 = fbm(uv * 4.5 + vec2(t * 0.07, t * 0.04));
  float mist2 = fbm(uv * 9.0 - vec2(t * 0.05, -t * 0.06) + mist1 * 1.4);
  vec3 col = mix(uPrimaryColor * 0.7, uPrimaryColor * 1.3, mist1);
  col += uSecondaryColor * pow(mist2, 2.4) * 0.65 * uIntensity;
  if (uRole == 1) {
    col += uSecondaryColor * exp(-abs(minEdgePx - 32.0) * 0.22) * 0.55 * uIntensity;
  }
  return vec4(clamp(col, 0.0, 1.0), 1.0);
`;

function buildAmbientFragmentShaderSource(customBody: string | null): string {
  const body = customBody ?? DEFAULT_AMBIENT_GLSL_BODY;
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform int   uRole;
uniform int   uPreset;
uniform float uTime;
uniform vec2  uResolution;
uniform float uIntensity;
uniform float uSpeed;
uniform vec3  uPrimaryColor;
uniform vec3  uSecondaryColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.3;
    a *= 0.5;
  }
  return v;
}
float ridge(vec2 p) {
  return 1.0 - abs(vnoise(p) * 2.0 - 1.0);
}

vec4 evaluateAmbient(vec2 uv) {
  ${body}
}

void main() {
  fragColor = evaluateAmbient(vUv);
}
`;
}

function parseCssHexToRgb01(
  hex: string | null | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  return fallback;
}

function shaderKindToInt(kind: CardShaderKind): number {
  switch (kind) {
    case "burnt":
      return 1;
    case "parchment":
      return 2;
    case "hologram":
      return 3;
    case "ai_glsl":
      return 4;
    default:
      return 0;
  }
}

function ambientPresetToInt(kind: AmbientShaderKind): number {
  switch (kind) {
    case "ember_ash":
      return 1;
    case "hologram_grid":
      return 2;
    case "ancient_vellum":
      return 3;
    case "abyssal_mist":
      return 4;
    case "ai_glsl":
      return 5;
    default:
      return 0;
  }
}

function topologyToInt(topology: CardShaderTopology): number {
  if (topology === "bottom") return 1;
  if (topology === "perimeter") return 2;
  return 0;
}

interface CompiledCardProgram {
  program: WebGLProgram;
  uShaderKind: WebGLUniformLocation | null;
  uTopology: WebGLUniformLocation | null;
  uMaskMode: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uProgress: WebGLUniformLocation | null;
  uOrigin: WebGLUniformLocation | null;
  uCardAspect: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uNoiseScale: WebGLUniformLocation | null;
  uNoiseAmount: WebGLUniformLocation | null;
  uCharWidth: WebGLUniformLocation | null;
  uAshWidth: WebGLUniformLocation | null;
  uEmberWidth: WebGLUniformLocation | null;
  uSpreadWidth: WebGLUniformLocation | null;
  uGlowIntensity: WebGLUniformLocation | null;
  uSeed: WebGLUniformLocation | null;
  uBaseColor: WebGLUniformLocation | null;
  uAccentColor: WebGLUniformLocation | null;
  uHasAccent: WebGLUniformLocation | null;
}

interface CompiledAmbientProgram {
  program: WebGLProgram;
  uRole: WebGLUniformLocation | null;
  uPreset: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uIntensity: WebGLUniformLocation | null;
  uSpeed: WebGLUniformLocation | null;
  uPrimaryColor: WebGLUniformLocation | null;
  uSecondaryColor: WebGLUniformLocation | null;
}

interface CompiledPalaceQuartzProgram {
  program: WebGLProgram;
  uTime: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uHourAngle: WebGLUniformLocation | null;
  uMinuteAngle: WebGLUniformLocation | null;
  uSecondAngle: WebGLUniformLocation | null;
  uSurfaceColor: WebGLUniformLocation | null;
  uBorderColor: WebGLUniformLocation | null;
  uAccentColor: WebGLUniformLocation | null;
  uRunning: WebGLUniformLocation | null;
}

const PALACE_QUARTZ_FRAGMENT_300 = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;
uniform float uHourAngle;
uniform float uMinuteAngle;
uniform float uSecondAngle;
uniform vec3  uSurfaceColor;
uniform vec3  uBorderColor;
uniform vec3  uAccentColor;
uniform float uRunning;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float sdSegment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 rotateCW(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float sdBreguetHand(vec2 p, float angle, float len, float tail, float baseW, float tipW, float ringPos, float ringR) {
  vec2 q = rotateCW(p, -angle);
  float h = 0.0;
  float shaft = sdSegment(q, vec2(0.0, -tail), vec2(0.0, len), h);
  float w = mix(baseW, tipW, smoothstep(0.0, 1.0, h));
  // Subtle baroque diamond swell before the Breguet ring
  float swell = exp(-pow((h - 0.56) * 8.0, 2.0)) * baseW * 0.72;
  float dShaft = shaft - (w + swell);
  // Iconic Breguet pomme (open gold ring near tip)
  float dRingOuter = length(q - vec2(0.0, ringPos)) - ringR;
  float dRingInner = -(length(q - vec2(0.0, ringPos)) - ringR * 0.52);
  float dRing = max(dRingOuter, dRingInner);
  return min(dShaft, dRing);
}

float sdSecondHand(vec2 p, float angle, float len, float tail) {
  vec2 q = rotateCW(p, -angle);
  float h = 0.0;
  float shaft = sdSegment(q, vec2(0.0, -tail), vec2(0.0, len), h);
  float w = mix(0.015, 0.006, h);
  float dShaft = shaft - w;
  // Counterweight crescent/ornament at tail
  float dTailRing = abs(length(q - vec2(0.0, -tail * 0.85)) - 0.042) - 0.012;
  return min(dShaft, dTailRing);
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float aa = 2.2 / max(64.0, min(uResolution.x, uResolution.y));
  // 0 at 12 o'clock, increasing clockwise
  float theta = atan(p.x, p.y);
  float theta01 = mod(theta + TAU, TAU);

  // 24-petal baroque imperial lotus scalloped gold outer rim
  float scallop = 0.018 * cos(theta * 24.0);
  float outerR = 0.968 + scallop;
  float outerAlpha = smoothstep(outerR + aa, outerR - aa, r);
  if (outerAlpha <= 0.001) discard;

  // Metallic burnished imperial gold palette harmonized with active theme border
  vec3 goldDark = vec3(0.42, 0.28, 0.09);
  vec3 goldMid  = mix(vec3(0.84, 0.65, 0.28), uBorderColor, 0.24);
  vec3 goldHi   = vec3(1.0, 0.93, 0.70);
  vec3 crimson  = vec3(0.68, 0.11, 0.13);

  float shimmerPhase = uTime * 0.45 * (0.35 + 0.65 * uRunning);
  float aniso = 0.5 + 0.5 * cos(theta * 2.0 - shimmerPhase);
  float topLight = clamp(dot(normalize(p + vec2(0.0001)), normalize(vec2(-0.55, 0.83))) * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = vec3(0.0);

  // ── 1. Outer Filigree Gilt Bezel (r: 0.79 .. outerR) ──
  if (r >= 0.785) {
    float t = clamp((r - 0.785) / max(0.001, outerR - 0.785), 0.0, 1.0);
    float bevel = sin(t * PI);
    float filigree = 0.5 + 0.5 * cos(theta * 24.0) * sin(t * PI * 2.0);
    vec3 bezelCol = mix(goldDark, goldMid, 0.35 + 0.65 * bevel);
    bezelCol = mix(bezelCol, goldHi, pow(aniso, 3.0) * 0.48 * bevel + topLight * 0.22);
    bezelCol *= 0.86 + 0.18 * filigree;

    // 36 gilded pearl beads inset along the bezel crown
    float pearlSector = mod(theta01, TAU / 36.0) - (TAU / 72.0);
    vec2 pearlDelta = vec2(pearlSector * 0.885, r - 0.885);
    float pearlD = length(pearlDelta);
    float pearlMask = smoothstep(0.032 + aa, 0.026 - aa, pearlD);
    float pearlShade = clamp(1.0 - pearlD / 0.034, 0.0, 1.0);
    vec3 pearlCol = mix(goldDark, goldHi, pow(pearlShade, 0.65) * (0.65 + 0.35 * topLight));
    bezelCol = mix(bezelCol, pearlCol, pearlMask * 0.9);

    // Fine dark engraved groove separating bezel from dial
    float groove = smoothstep(0.785 + aa * 2.0, 0.798, r);
    col = bezelCol * (0.58 + 0.42 * groove);
  } else {
    // ── 2. Porcelain Ivory Enamel Chapter Ring (r: 0.46 .. 0.785) ──
    float guilloche = 0.5 + 0.5 * sin(r * 74.0 + cos(theta * 12.0) * 1.45);
    vec3 ivoryBase = mix(vec3(0.95, 0.90, 0.79), uSurfaceColor, 0.11);
    vec3 dialCol = ivoryBase - vec3(0.035, 0.03, 0.022) * (1.0 - guilloche);
    // Warm aged patina near bezel + subtle inner dome shading
    dialCol *= 1.0 - smoothstep(0.68, 0.79, r) * 0.16;

    // ── 3. Inner Royal Cloisonné Astronomical Medallion (r < 0.465) ──
    float innerMask = smoothstep(0.468 + aa, 0.456 - aa, r);
    if (innerMask > 0.001) {
      vec3 lapisDeep = mix(vec3(0.05, 0.11, 0.24), uAccentColor * 0.25, 0.20);
      vec3 lapisMid  = mix(vec3(0.11, 0.22, 0.44), uAccentColor * 0.45, 0.24);
      vec3 enamel = mix(lapisMid, lapisDeep, smoothstep(0.05, 0.46, r));

      // 12-ray gilded imperial sunburst astrolabe filigree
      float rayA = pow(max(0.0, cos(theta * 12.0 + shimmerPhase * 0.22)), 6.0);
      float rayB = pow(max(0.0, cos(theta * 12.0 + PI / 12.0 - shimmerPhase * 0.15)), 10.0);
      float sunFade = smoothstep(0.44, 0.10, r);
      enamel = mix(enamel, goldMid, (rayA * 0.48 + rayB * 0.26) * sunFade);
      enamel += goldHi * rayA * sunFade * 0.16 * (0.65 + 0.35 * aniso);

      // Astrolabe concentric golden filigree arcs
      float astroRing1 = smoothstep(0.012 + aa, 0.004, abs(r - 0.30));
      float astroRing2 = smoothstep(0.010 + aa, 0.003, abs(r - 0.18));
      enamel = mix(enamel, goldMid, (astroRing1 * 0.65 + astroRing2 * 0.45));

      // Subtle gilded star-dust dots inside celestial enamel
      float starAngle = mod(theta01 + 0.26, TAU / 12.0) - TAU / 24.0;
      float starD = length(vec2(starAngle * 0.37, r - 0.37));
      float starMask = smoothstep(0.018 + aa, 0.007, starD);
      float twinkle = 0.72 + 0.28 * sin(uTime * 2.4 + floor(theta01 * 12.0 / TAU) * 3.7);
      enamel = mix(enamel, goldHi, starMask * twinkle * 0.92);

      dialCol = mix(dialCol, enamel, innerMask);
    }

    // Golden filigree ring bordering inner enamel medallion
    float innerBorder = smoothstep(0.018 + aa, 0.006, abs(r - 0.462));
    dialCol = mix(dialCol, mix(goldMid, goldHi, 0.35 * aniso), innerBorder);

    // Outer railway minute track (60 fine ticks + twin hairline rails)
    float railOuter = smoothstep(0.009 + aa, 0.002, abs(r - 0.768));
    float railInner = smoothstep(0.008 + aa, 0.002, abs(r - 0.715));
    float minSector = abs(mod(theta01 + TAU / 120.0, TAU / 60.0) - TAU / 120.0) * r;
    float minTick = smoothstep(0.008 + aa, 0.003, minSector) * step(0.715, r) * step(r, 0.768);
    dialCol = mix(dialCol, vec3(0.24, 0.18, 0.12), max(max(railOuter, railInner) * 0.72, minTick * 0.62));

    // 12 Ornate Faceted Hour Indices (cardinal 12/3/6/9 accented with imperial ruby!)
    float hourIdx = mod(floor((theta01 + TAU / 24.0) / (TAU / 12.0)), 12.0);
    float hourSector = mod(theta01 + TAU / 24.0, TAU / 12.0) - TAU / 24.0;
    vec2 hp = vec2(hourSector * r, r - 0.61);
    bool isCardinal = (mod(hourIdx, 3.0) < 0.5);
    // Diamond/lozenge SDF
    float diam = abs(hp.x) * (isCardinal ? 2.1 : 3.0) + abs(hp.y) * (isCardinal ? 1.15 : 1.45);
    float markerMask = smoothstep(0.082 + aa, 0.072 - aa, diam);
    vec3 markerCol = isCardinal
      ? mix(crimson, vec3(1.0, 0.42, 0.34), clamp(0.65 - diam * 4.5, 0.0, 0.65))
      : mix(goldDark, goldHi, 0.45 + 0.45 * step(0.0, -hp.x));
    // Fine gold bezel around cardinal ruby markers
    float cardinalRim = isCardinal ? smoothstep(0.095 + aa, 0.082, diam) * (1.0 - markerMask) : 0.0;
    dialCol = mix(dialCol, goldMid, cardinalRim * 0.92);
    dialCol = mix(dialCol, markerCol, markerMask);

    col = dialCol;
  }

  // ── 4. Sculpted Baroque Breguet Hands + Soft Drop Shadows ──
  vec2 sp = p - vec2(0.020, -0.026);
  float dHourS = sdBreguetHand(sp, uHourAngle, 0.44, 0.10, 0.032, 0.011, 0.30, 0.056);
  float dMinS  = sdBreguetHand(sp, uMinuteAngle, 0.64, 0.12, 0.025, 0.008, 0.48, 0.048);
  float dSecS  = sdSecondHand(sp, uSecondAngle, 0.71, 0.17);
  float shadowMask =
    smoothstep(0.028, -0.005, dHourS) * 0.34 +
    smoothstep(0.025, -0.005, dMinS) * 0.30 +
    smoothstep(0.018, -0.004, dSecS) * 0.22;
  col *= 1.0 - clamp(shadowMask, 0.0, 0.46) * step(r, 0.79);

  float dHour = sdBreguetHand(p, uHourAngle, 0.44, 0.10, 0.032, 0.011, 0.30, 0.056);
  float hourMask = smoothstep(aa, -aa, dHour);
  vec3 handGold = mix(goldDark, goldHi, 0.48 + 0.42 * topLight);
  col = mix(col, handGold, hourMask);

  float dMin = sdBreguetHand(p, uMinuteAngle, 0.64, 0.12, 0.025, 0.008, 0.48, 0.048);
  float minMask = smoothstep(aa, -aa, dMin);
  col = mix(col, mix(goldMid, goldHi, 0.55), minMask);

  float dSec = sdSecondHand(p, uSecondAngle, 0.71, 0.17);
  float secMask = smoothstep(aa, -aa, dSec);
  vec3 secCol = mix(crimson, vec3(0.96, 0.34, 0.26), 0.35 + 0.35 * topLight);
  col = mix(col, secCol, secMask);

  // ── 5. Center Ruby Cabochon Boss & Domed Sapphire Glass Glint ──
  float bossRim = smoothstep(0.082 + aa, 0.072 - aa, r);
  float bossGem = smoothstep(0.054 + aa, 0.044 - aa, r);
  col = mix(col, mix(goldDark, goldHi, 0.55 + 0.35 * topLight), bossRim);
  vec3 rubyCol = mix(vec3(0.45, 0.05, 0.08), vec3(1.0, 0.38, 0.32), smoothstep(0.052, 0.0, length(p - vec2(-0.016, 0.018))));
  col = mix(col, rubyCol, bossGem);

  // Subtle curved sapphire crystal reflection across upper-left glass dome
  float glassArc = smoothstep(0.77, 0.73, r)
    * smoothstep(0.24, 0.68, dot(p, normalize(vec2(-0.55, 0.83))))
    * smoothstep(0.55, 0.08, abs(dot(p, normalize(vec2(0.83, 0.55)))));
  col += vec3(1.0, 0.98, 0.93) * glassArc * 0.18;

  fragColor = vec4(clamp(col, 0.0, 1.0), outerAlpha);
}
`;

export interface CardShaderDrawParams {
  width: number;
  height: number;
  baseColorHex: string;
  effect: CardVisualEffect;
  seedOffset?: number;
}

export interface AmbientShaderDrawParams {
  width: number;
  height: number;
  role: "surface" | "frame";
  ambient: BoardAmbientShader;
}

export interface PalaceQuartzDrawParams {
  size: number;
  hourRad: number;
  minuteRad: number;
  secondRad: number;
  surfaceColorHex: string;
  borderColorHex: string;
  accentColorHex: string;
  running: boolean;
}

export type CardShaderMaskMode = 0 | 1 | 2;

class SharedCardGlEngine {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly vertexShader: WebGLShader;
  readonly defaultCardProgram: CompiledCardProgram;
  readonly defaultAmbientProgram: CompiledAmbientProgram;
  private palaceQuartzProgram: CompiledPalaceQuartzProgram | null = null;
  private readonly customCardPrograms = new Map<string, CompiledCardProgram | false>();
  private readonly customAmbientPrograms = new Map<string, CompiledAmbientProgram | false>();

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error("WEBGL2_UNAVAILABLE");
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    this.canvas = canvas;
    this.gl = gl;
    this.vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_300);
    this.defaultCardProgram = this.buildCardProgram(null);
    this.defaultAmbientProgram = this.buildAmbientProgram(null);
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) ?? "SHADER_COMPILE_FAILED";
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }

  private linkProgram(fsSource: string): WebGLProgram {
    const { gl } = this;
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, this.vertexShader);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog) ?? "SHADER_LINK_FAILED";
      gl.deleteProgram(prog);
      throw new Error(info);
    }
    return prog;
  }

  private buildCardProgram(customBody: string | null): CompiledCardProgram {
    const prog = this.linkProgram(buildCardFragmentShaderSource(customBody));
    const U = (name: string) => this.gl.getUniformLocation(prog, name);
    return {
      program: prog,
      uShaderKind: U("uShaderKind"),
      uTopology: U("uTopology"),
      uMaskMode: U("uMaskMode"),
      uTime: U("uTime"),
      uProgress: U("uProgress"),
      uOrigin: U("uOrigin"),
      uCardAspect: U("uCardAspect"),
      uResolution: U("uResolution"),
      uNoiseScale: U("uNoiseScale"),
      uNoiseAmount: U("uNoiseAmount"),
      uCharWidth: U("uCharWidth"),
      uAshWidth: U("uAshWidth"),
      uEmberWidth: U("uEmberWidth"),
      uSpreadWidth: U("uSpreadWidth"),
      uGlowIntensity: U("uGlowIntensity"),
      uSeed: U("uSeed"),
      uBaseColor: U("uBaseColor"),
      uAccentColor: U("uAccentColor"),
      uHasAccent: U("uHasAccent"),
    };
  }

  private buildAmbientProgram(customBody: string | null): CompiledAmbientProgram {
    const prog = this.linkProgram(buildAmbientFragmentShaderSource(customBody));
    const U = (name: string) => this.gl.getUniformLocation(prog, name);
    return {
      program: prog,
      uRole: U("uRole"),
      uPreset: U("uPreset"),
      uTime: U("uTime"),
      uResolution: U("uResolution"),
      uIntensity: U("uIntensity"),
      uSpeed: U("uSpeed"),
      uPrimaryColor: U("uPrimaryColor"),
      uSecondaryColor: U("uSecondaryColor"),
    };
  }

  resolveCardProgram(effect: CardVisualEffect): CompiledCardProgram {
    if (effect.shader !== "ai_glsl" || !effect.customGlsl) {
      return this.defaultCardProgram;
    }
    const clean = sanitizeCustomGlsl(effect.customGlsl);
    if (!clean) return this.defaultCardProgram;
    const cached = this.customCardPrograms.get(clean);
    if (cached === false) return this.defaultCardProgram;
    if (cached) return cached;
    try {
      const compiled = this.buildCardProgram(clean);
      this.customCardPrograms.set(clean, compiled);
      return compiled;
    } catch {
      this.customCardPrograms.set(clean, false);
      return this.defaultCardProgram;
    }
  }

  resolveAmbientProgram(ambient: BoardAmbientShader): CompiledAmbientProgram {
    if (ambient.shader !== "ai_glsl" || !ambient.customGlsl) {
      return this.defaultAmbientProgram;
    }
    const clean = sanitizeCustomGlsl(ambient.customGlsl);
    if (!clean) return this.defaultAmbientProgram;
    const cached = this.customAmbientPrograms.get(clean);
    if (cached === false) return this.defaultAmbientProgram;
    if (cached) return cached;
    try {
      const compiled = this.buildAmbientProgram(clean);
      this.customAmbientPrograms.set(clean, compiled);
      return compiled;
    } catch {
      this.customAmbientPrograms.set(clean, false);
      return this.defaultAmbientProgram;
    }
  }

  renderCardFrame(
    params: CardShaderDrawParams,
    timeSec: number,
    maskMode: CardShaderMaskMode = 0,
  ): HTMLCanvasElement {
    const { gl, canvas } = this;
    const w = Math.max(64, Math.min(1400, Math.round(params.width)));
    const h = Math.max(64, Math.min(1200, Math.round(params.height)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    const eff = params.effect;
    const u = this.resolveCardProgram(eff);
    gl.useProgram(u.program);

    const baseRgb = parseCssHexToRgb01(params.baseColorHex, [0.953, 0.918, 0.824]);
    const accentRgb = parseCssHexToRgb01(eff.accentColor, [1.0, 0.22, 0.02]);

    gl.uniform1i(u.uShaderKind, shaderKindToInt(eff.shader));
    gl.uniform1i(u.uTopology, topologyToInt(eff.topology));
    gl.uniform1i(u.uMaskMode, maskMode);
    gl.uniform1f(u.uTime, timeSec);
    gl.uniform1f(u.uProgress, eff.progress);
    gl.uniform2f(u.uOrigin, eff.origin[0], eff.origin[1]);
    gl.uniform1f(u.uCardAspect, w / h);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform1f(u.uNoiseScale, 5.0);
    gl.uniform1f(u.uNoiseAmount, eff.noiseAmount);
    gl.uniform1f(u.uCharWidth, 0.055);
    gl.uniform1f(u.uAshWidth, 0.1);
    gl.uniform1f(u.uEmberWidth, 0.02);
    gl.uniform1f(u.uSpreadWidth, eff.spreadWidth);
    gl.uniform1f(u.uGlowIntensity, eff.glowIntensity);
    gl.uniform1f(u.uSeed, eff.seed + (params.seedOffset ?? 0));
    gl.uniform3f(u.uBaseColor, baseRgb[0], baseRgb[1], baseRgb[2]);
    gl.uniform3f(u.uAccentColor, accentRgb[0], accentRgb[1], accentRgb[2]);
    gl.uniform1f(u.uHasAccent, eff.accentColor ? 1.0 : 0.0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }

  private resolvePalaceQuartzProgram(): CompiledPalaceQuartzProgram {
    if (this.palaceQuartzProgram) return this.palaceQuartzProgram;
    const prog = this.linkProgram(PALACE_QUARTZ_FRAGMENT_300);
    const U = (name: string) => this.gl.getUniformLocation(prog, name);
    this.palaceQuartzProgram = {
      program: prog,
      uTime: U("uTime"),
      uResolution: U("uResolution"),
      uHourAngle: U("uHourAngle"),
      uMinuteAngle: U("uMinuteAngle"),
      uSecondAngle: U("uSecondAngle"),
      uSurfaceColor: U("uSurfaceColor"),
      uBorderColor: U("uBorderColor"),
      uAccentColor: U("uAccentColor"),
      uRunning: U("uRunning"),
    };
    return this.palaceQuartzProgram;
  }

  renderPalaceQuartzFrame(
    params: PalaceQuartzDrawParams,
    timeSec: number,
  ): HTMLCanvasElement {
    const { gl, canvas } = this;
    const s = Math.max(64, Math.min(256, Math.round(params.size)));
    if (canvas.width !== s || canvas.height !== s) {
      canvas.width = s;
      canvas.height = s;
    }
    gl.viewport(0, 0, s, s);
    const u = this.resolvePalaceQuartzProgram();
    gl.useProgram(u.program);

    const surf = parseCssHexToRgb01(params.surfaceColorHex, [0.95, 0.90, 0.79]);
    const bord = parseCssHexToRgb01(params.borderColorHex, [0.84, 0.65, 0.28]);
    const acc = parseCssHexToRgb01(params.accentColorHex, [0.16, 0.34, 0.62]);

    gl.uniform1f(u.uTime, timeSec);
    gl.uniform2f(u.uResolution, s, s);
    gl.uniform1f(u.uHourAngle, params.hourRad);
    gl.uniform1f(u.uMinuteAngle, params.minuteRad);
    gl.uniform1f(u.uSecondAngle, params.secondRad);
    gl.uniform3f(u.uSurfaceColor, surf[0], surf[1], surf[2]);
    gl.uniform3f(u.uBorderColor, bord[0], bord[1], bord[2]);
    gl.uniform3f(u.uAccentColor, acc[0], acc[1], acc[2]);
    gl.uniform1f(u.uRunning, params.running ? 1.0 : 0.0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }

  renderAmbientFrame(
    params: AmbientShaderDrawParams,
    timeSec: number,
  ): HTMLCanvasElement {
    const { gl, canvas } = this;
    const w = Math.max(128, Math.min(1440, Math.round(params.width)));
    const h = Math.max(128, Math.min(900, Math.round(params.height)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    const amb = params.ambient;
    const u = this.resolveAmbientProgram(amb);
    gl.useProgram(u.program);

    const pri = parseCssHexToRgb01(amb.primaryColor, [0.1, 0.16, 0.2]);
    const sec = parseCssHexToRgb01(amb.secondaryColor, [0.17, 0.9, 0.85]);

    gl.uniform1i(u.uRole, params.role === "frame" ? 1 : 0);
    gl.uniform1i(u.uPreset, ambientPresetToInt(amb.shader));
    gl.uniform1f(u.uTime, timeSec);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform1f(u.uIntensity, amb.intensity);
    gl.uniform1f(u.uSpeed, amb.speed);
    gl.uniform3f(u.uPrimaryColor, pri[0], pri[1], pri[2]);
    gl.uniform3f(u.uSecondaryColor, sec[0], sec[1], sec[2]);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
}

let engineInstance: SharedCardGlEngine | null | false = null;

function getSharedEngine(): SharedCardGlEngine | null {
  if (engineInstance === false) return null;
  if (engineInstance) return engineInstance;
  if (typeof document === "undefined") return null;
  try {
    engineInstance = new SharedCardGlEngine();
    return engineInstance;
  } catch {
    engineInstance = false;
    return null;
  }
}

export function blitCardShaderToCanvas(
  target: HTMLCanvasElement,
  params: CardShaderDrawParams,
  timeSec: number,
): boolean {
  const engine = getSharedEngine();
  if (!engine) return false;
  const w = Math.max(64, Math.min(1400, Math.round(params.width)));
  const h = Math.max(64, Math.min(1200, Math.round(params.height)));
  if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  const rendered = engine.renderCardFrame(params, timeSec, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(rendered, 0, 0, w, h);
  return true;
}

export type ShaderQualityMode = "high" | "balanced" | "eco";

const SHADER_QUALITY_KEY = "vb-shader-quality";
const qualityListeners = new Set<(mode: ShaderQualityMode) => void>();
let currentQualityMode: ShaderQualityMode = (() => {
  if (typeof localStorage === "undefined") return "balanced";
  const saved = localStorage.getItem(SHADER_QUALITY_KEY);
  return saved === "high" || saved === "balanced" || saved === "eco"
    ? saved
    : "balanced";
})();

export function getShaderQualityMode(): ShaderQualityMode {
  return currentQualityMode;
}

export function setShaderQualityMode(mode: ShaderQualityMode) {
  currentQualityMode = mode;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SHADER_QUALITY_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }
  qualityListeners.forEach((fn) => fn(mode));
}

export function subscribeShaderQuality(
  fn: (mode: ShaderQualityMode) => void,
): () => void {
  qualityListeners.add(fn);
  return () => {
    qualityListeners.delete(fn);
  };
}

export function blitPalaceQuartzToCanvas(
  target: HTMLCanvasElement,
  params: PalaceQuartzDrawParams,
  timeSec: number,
): boolean {
  const engine = getSharedEngine();
  if (!engine) return false;
  const s = Math.max(64, Math.min(256, Math.round(params.size)));
  if (target.width !== s || target.height !== s) {
    target.width = s;
    target.height = s;
  }
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  const rendered = engine.renderPalaceQuartzFrame({ ...params, size: s }, timeSec);
  ctx.clearRect(0, 0, s, s);
  ctx.drawImage(rendered, 0, 0, s, s);
  return true;
}

export function blitAmbientShaderToCanvas(
  target: HTMLCanvasElement,
  params: AmbientShaderDrawParams,
  timeSec: number,
): boolean {
  const engine = getSharedEngine();
  if (!engine) return false;
  const scale =
    currentQualityMode === "high"
      ? 1
      : currentQualityMode === "balanced"
        ? 0.72
        : 0.65;
  const w = Math.max(128, Math.min(1280, Math.round(params.width * scale)));
  const h = Math.max(128, Math.min(760, Math.round(params.height * scale)));
  if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  const rendered = engine.renderAmbientFrame({ ...params, width: w, height: h }, timeSec);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(rendered, 0, 0, w, h);
  return true;
}

const maskCache = new Map<string, string>();

function bakeMaskByMode(
  params: CardShaderDrawParams,
  mode: 1 | 2,
): string | null {
  const engine = getSharedEngine();
  if (!engine) return null;
  if (
    mode === 2 &&
    (params.effect.shader === "parchment" || params.effect.shader === "hologram")
  ) {
    return null;
  }
  const aspect = Math.max(0.25, params.width / Math.max(1, params.height));
  const mw = Math.round(Math.min(380, Math.max(180, 280 * aspect)));
  const mh = Math.round(mw / aspect);
  const e = params.effect;
  const glslHash = e.customGlsl
    ? e.customGlsl.length + ":" + e.customGlsl.slice(0, 24)
    : "std";
  const cacheKey = [
    mode,
    mw,
    mh,
    e.shader,
    glslHash,
    e.topology,
    e.progress,
    e.origin[0],
    e.origin[1],
    e.noiseAmount,
    e.seed + (params.seedOffset ?? 0),
  ].join(":");
  const cached = maskCache.get(cacheKey);
  if (cached) return cached;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mw;
  maskCanvas.height = mh;
  const ctx = maskCanvas.getContext("2d");
  if (!ctx) return null;

  const rendered = engine.renderCardFrame(
    { ...params, width: mw, height: mh },
    0,
    mode,
  );
  ctx.clearRect(0, 0, mw, mh);
  ctx.drawImage(rendered, 0, 0, mw, mh);
  const url = maskCanvas.toDataURL("image/png");
  if (maskCache.size > 96) {
    const oldest = maskCache.keys().next().value;
    if (oldest) maskCache.delete(oldest);
  }
  maskCache.set(cacheKey, url);
  return url;
}

export function bakeCardCutoutMaskUrl(
  params: CardShaderDrawParams,
): string | null {
  return bakeMaskByMode(params, 1);
}

export function bakeCardContentSurvivalMaskUrl(
  params: CardShaderDrawParams,
): string | null {
  return bakeMaskByMode(params, 2);
}

type FrameSubscriber = (timeSec: number) => void;
const subscribers = new Set<FrameSubscriber>();
let rafId = 0;
let lastTickMs = 0;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;

function tick(now: number) {
  if (!subscribers.size) {
    rafId = 0;
    return;
  }
  if (currentQualityMode !== "eco") {
    const minIntervalMs = currentQualityMode === "high" ? 15 : 33;
    const diceOpen =
      typeof document !== "undefined" &&
      Boolean(document.querySelector(".dice-dialog[open]"));
    if (!document.hidden && !diceOpen && now - lastTickMs >= minIntervalMs) {
      lastTickMs = now;
      const elapsed = (now - t0) / 1000;
      subscribers.forEach((fn) => fn(elapsed));
    }
  }
  rafId = window.requestAnimationFrame(tick);
}

export function subscribeCardShaderClock(fn: FrameSubscriber): () => void {
  subscribers.add(fn);
  if (!rafId && typeof window !== "undefined") {
    rafId = window.requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && rafId && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}
