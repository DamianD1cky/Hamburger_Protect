import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "./boardGeometry.ts";

export function normalizeStickerRotation(angle: number) {
  if (!Number.isFinite(angle)) throw new Error("贴纸旋转角度无效");
  return Math.round(((angle + 180) % 360 + 360) % 360 - 180);
}

/** x/y keep referring to the unrotated square. Only its glyph is rotated. */
export function stickerPosition(x: number, y: number, scale: number, rotation: number) {
  const size = STICKER_SIZE * scale;
  const radians = rotation * Math.PI / 180;
  const overhang = Math.ceil(size * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)) - 1) / 2 - 1e-8);
  return {
    x: Math.round(Math.max(overhang, Math.min(BOARD_WIDTH - Math.ceil(size) - overhang, x))),
    y: Math.round(Math.max(overhang, Math.min(BOARD_HEIGHT - Math.ceil(size) - overhang, y))),
  };
}
