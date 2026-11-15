import { Box3, Quaternion, Vector3, type BufferGeometry } from "three";
import modelGeometry from "./modelGeometry.json" with { type: "json" };

export const trayOutline = modelGeometry.tray.inner;
export const trayOuter = modelGeometry.tray.outer;
export const traySize = { width: 10.9, depth: 9.4 };
export const trayEdges = trayOutline.map(([x, z], index) => {
  const [nextX, nextZ] = trayOutline[(index + 1) % trayOutline.length];
  const length = Math.hypot(nextX - x, nextZ - z);
  return { x, z, nextX, nextZ, length, nx: -(nextZ - z) / length, nz: (nextX - x) / length };
});
export interface DiePose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}
export interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number }

export function dieBounds(geometry: BufferGeometry, pose: DiePose): Box3 {
  const bounds = new Box3();
  const rotation = new Quaternion(...pose.quaternion), offset = new Vector3(...pose.position);
  const vertices = geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    bounds.expandByPoint(new Vector3().fromBufferAttribute(vertices, i).applyQuaternion(rotation).add(offset));
  }
  return bounds;
}

export function footprint(bounds: Box3): Footprint {
  return { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z };
}

export function fitsTray(bounds: Footprint, padding = 0): boolean {
  return trayEdges.every(({ x, z, nx, nz }) =>
    ((nx >= 0 ? bounds.minX : bounds.maxX) - x) * nx +
    ((nz >= 0 ? bounds.minZ : bounds.maxZ) - z) * nz >= padding);
}

/** Keep a lifted group inside all six walls without changing its spacing. */
export function clampTrayMove(bounds: Footprint[], dx: number, dz: number) {
  let fraction = 1;
  for (const box of bounds) {
    for (const { x, z, nx, nz } of trayEdges) {
      const distance = ((nx >= 0 ? box.minX : box.maxX) - x) * nx +
        ((nz >= 0 ? box.minZ : box.maxZ) - z) * nz - .04;
      const delta = dx * nx + dz * nz;
      if (delta < 0) fraction = Math.min(fraction, Math.max(0, distance / -delta));
    }
  }
  return { x: dx * fraction, z: dz * fraction };
}

/** Allocate floor space without moving, stacking or covering existing dice. */
export function findTraySpace(bounds: Box3, occupied: Footprint[], preferred?: { x: number; z: number }): DiePose["position"] | null {
  const gap = .14, step = .16;
  const available = (x: number, z: number) => fitsTray({
    minX: x + bounds.min.x, maxX: x + bounds.max.x, minZ: z + bounds.min.z, maxZ: z + bounds.max.z,
  }, gap) && !occupied.some((other) => x + bounds.max.x + gap > other.minX && x + bounds.min.x - gap < other.maxX &&
    z + bounds.max.z + gap > other.minZ && z + bounds.min.z - gap < other.maxZ);
  if (preferred && available(preferred.x, preferred.z)) return [preferred.x, -bounds.min.y + .025, preferred.z];
  let best: { x: number; z: number; score: number } | null = null;
  for (let ix = -33; ix <= 33; ix++) for (let iz = -29; iz <= 29; iz++) {
    const x = ix * step, z = iz * step;
    if (!available(x, z)) continue;
    const score = preferred ? (x - preferred.x) ** 2 + (z - preferred.z) ** 2 : x * x + z * z * 2 + Math.abs(z) * .2;
    if (!best || score < best.score) best = { x, z, score };
  }
  return best ? [best.x, -bounds.min.y + .025, best.z] : null;
}
