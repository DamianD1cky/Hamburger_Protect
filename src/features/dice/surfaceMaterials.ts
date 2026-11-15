import {
  CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping,
  SRGBColorSpace, type Material, type Texture,
} from "three";

export type SurfaceSlot = "body" | "marks" | "rim" | "lining" | "trim" | "stitch";
export interface SurfaceStyle {
  color: string;
  roughness: number;
  metalness: number;
  physical?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: Texture | null;
  normalMap?: Texture | null;
  roughnessMap?: Texture | null;
  metalnessMap?: Texture | null;
  bumpMap?: Texture | null;
  bumpScale?: number;
  /** Declare distinct shader code with a distinct key; uniform values stay mutable. */
  shader?: { key: string; apply: Material["onBeforeCompile"] };
}
export type SurfaceSkin = Record<SurfaceSlot, SurfaceStyle>;
const baseSkin: SurfaceSkin = {
  body: { color: "#8fb9a5", roughness: .25, metalness: 0, physical: true, clearcoat: .25, clearcoatRoughness: .19 },
  marks: { color: "#173d32", roughness: .4, metalness: .08 },
  rim: { color: "#73503a", roughness: .42, metalness: 0 },
  lining: { color: "#18382f", roughness: .98, metalness: 0 },
  trim: { color: "#bba477", roughness: .36, metalness: .82 },
  stitch: { color: "#9eaa89", roughness: .85, metalness: 0 },
};
const skins = new Map<string, SurfaceSkin>([
  ["jade", baseSkin],
  ["ivory", { ...baseSkin, body: { ...baseSkin.body, color: "#f3e7cd", roughness: .27 },
    marks: { color: "#342e28", roughness: .48, metalness: .05 } }],
  ["obsidian", { ...baseSkin, body: { ...baseSkin.body, color: "#25343e", roughness: .19 },
    marks: { ...baseSkin.marks, color: "#e3d0a2" } }],
  ["neon", { ...baseSkin, body: { ...baseSkin.body, color: "#15323e", metalness: .25 },
    marks: { color: "#9aeee2", roughness: .35, metalness: .2, emissive: "#2cae9e", emissiveIntensity: .25 } }],
]);
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

let noiseSeed = 7;
function random() {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  return noiseSeed / 4294967296;
}
function makeTexture(kind: "stone" | "wood" | "felt") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(256, 256);
  noiseSeed = kind === "stone" ? 17 : kind === "wood" ? 71 : 93;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const grain = random();
    const wave = Math.sin(x * Math.PI * 2 / 256 * 4 + Math.sin(y * Math.PI * 2 / 256) * 2);
    const value = kind === "stone" ? 227 + Math.sin(x * .023 + Math.sin(y * .023) * 3) * 14 + grain * 8 :
      kind === "wood" ? 191 + wave * 25 + Math.sin(x * .7 + wave * 2) * 8 + grain * 12 :
      204 + grain * 31 + (x % 2 === y % 2 ? 12 : -8);
    const i = (y * 256 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  // Bump is data, with a separate Texture object sharing the same CPU image.
  const bump = new CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = RepeatWrapping;
  return { map, bump };
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
export function createSurfaceLibrary() {
  const stone = makeTexture("stone"), wood = makeTexture("wood"), felt = makeTexture("felt");
  const atlas = makeAtlas();
  const materials = new Map<string, MeshStandardMaterial>();
  const generatedTextures = [stone.map, stone.bump, wood.map, wood.bump, felt.map, felt.bump, atlas];
  return {
    material(slot: SurfaceSlot, skin = "jade", labels = false) {
      const key = `${revision}:${skin}:${slot}:${labels}`;
      const cached = materials.get(key);
      if (cached) return cached;
      const style = (skins.get(skin) ?? baseSkin)[slot];
      const material = style.physical ? new MeshPhysicalMaterial() : new MeshStandardMaterial();
      material.name = slot;
      material.color.set(style.color); material.roughness = style.roughness; material.metalness = style.metalness;
      if (material instanceof MeshPhysicalMaterial) {
        material.clearcoat = style.clearcoat ?? 0;
        material.clearcoatRoughness = style.clearcoatRoughness ?? .2;
      }
      const detail = slot === "body" && skin !== "ivory" ? stone : slot === "rim" ? wood : slot === "lining" ? felt : null;
      material.map = style.map === undefined ? detail?.map ?? null : style.map;
      material.bumpMap = style.bumpMap === undefined ? detail?.bump ?? null : style.bumpMap;
      material.bumpScale = style.bumpScale ?? (slot === "lining" ? .013 : slot === "rim" ? .012 : .001);
      material.normalMap = style.normalMap ?? null;
      material.roughnessMap = style.roughnessMap ?? null;
      material.metalnessMap = style.metalnessMap ?? null;
      material.emissive = new Color(style.emissive ?? "#000000");
      material.emissiveIntensity = style.emissiveIntensity ?? 1;
      if (labels) {
        material.map = style.map === undefined ? atlas : style.map;
        material.bumpMap = null;
        material.transparent = true; material.alphaTest = .18;
        material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -1;
      }
      if (style.shader) {
        material.onBeforeCompile = style.shader.apply;
        material.customProgramCacheKey = () => `${slot}:${labels}:${style.shader!.key}`;
      }
      materials.set(key, material);
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
