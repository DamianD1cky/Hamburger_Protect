import { Group, Mesh, Shape, ShapeGeometry, Vector2, Vector3 } from "three";
import { SurfaceBuilder } from "./proceduralGeometry.ts";
import { trayOutline } from "./trayPlacement.ts";
import type { SurfaceLibrary, SurfaceSlot } from "./surfaceMaterials.ts";

/** A continuous swept hexagonal profile creates the rim, bevel and metal inlay.
 * All vertices are generated in the same coordinate system as the six colliders.
 */
function roundedOutline(inset: number) {
  const points = trayOutline.map(([x, z]) => new Vector2(x, z));
  const result: Vector2[] = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length], point = points[i], next = points[(i + 1) % points.length];
    const a = point.clone().lerp(previous, .055), b = point.clone().lerp(next, .055);
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const p = a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(point, 2 * t * (1 - t))
        .addScaledVector(b, t * t);
      p.multiplyScalar(1 + inset / 5.45);
      result.push(p);
    }
  }
  return result;
}
export function createProceduralTray(library: SurfaceLibrary, skin = "jade") {
  const group = new Group();
  group.name = "Procedural hexagonal tray";
  const profile = [
    { inset: -.03, y: -.06, slot: "rim" },
    { inset: -.03, y: .38, slot: "rim" },
    { inset: -.015, y: .46, slot: "rim" },
    { inset: .03, y: .515, slot: "rim" },
    { inset: .10, y: .55, slot: "rim" },
    { inset: .18, y: .555, slot: "trim" },
    { inset: .205, y: .555, slot: "rim" },
    { inset: .40, y: .555, slot: "rim" },
    { inset: .46, y: .54, slot: "rim" },
    { inset: .49, y: .49, slot: "rim" },
    { inset: .49, y: -.10, slot: "rim" },
    { inset: .46, y: -.16, slot: "rim" },
    { inset: .0, y: -.16, slot: "rim" },
  ] as { inset: number; y: number; slot: SurfaceSlot }[];
  const outlines = profile.map((p) => roundedOutline(p.inset));
  const builders = new Map<SurfaceSlot, SurfaceBuilder>();
  const count = outlines[0].length;
  for (let band = 0; band < profile.length - 1; band++) {
    const builder = builders.get(profile[band].slot) ?? new SurfaceBuilder();
    builders.set(profile[band].slot, builder);
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      const points = [[band, i], [band, next], [band + 1, next], [band + 1, i]].map(([row, column]) =>
        new Vector3(outlines[row][column].x, profile[row].y, outlines[row][column].y));
      const normal = points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0])).normalize();
      const uv = points.map((p) => new Vector2(p.x * .3, p.z * .3 + p.y * .3));
      builder.quad(points, points.map(() => normal), uv);
    }
  }
  const add = (geometry: ReturnType<SurfaceBuilder["geometry"]>, slot: SurfaceSlot) => {
    const mesh = new Mesh(geometry, library.material(slot, skin));
    mesh.name = slot; mesh.userData.surfaceSlot = slot; mesh.userData.ownedGeometry = true;
    mesh.receiveShadow = true; mesh.castShadow = slot !== "lining" && slot !== "stitch";
    group.add(mesh);
  };
  for (const [slot, builder] of builders) add(builder.geometry(), slot);
  const floorOutline = roundedOutline(-.035);
  const shape = new Shape(floorOutline);
  const floor = new ShapeGeometry(shape);
  floor.rotateX(-Math.PI / 2);
  // Shape's second dimension maps to -Z, while the outline is symmetric.
  const uv = floor.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  floor.translate(0, -.014, 0);
  add(floor, "lining");

  // Two slim concentric seam lines are geometric bands, not a baked shadow.
  const seams = new SurfaceBuilder();
  for (const inset of [-.20, -.24]) {
    const line = roundedOutline(inset);
    for (let i = 0; i < line.length; i++) {
      const a = line[i], b = line[(i + 1) % line.length];
      const distance = a.distanceTo(b), steps = Math.max(1, Math.floor(distance / .12));
      for (let j = 0; j < steps; j++) {
        const start = a.clone().lerp(b, j / steps), end = a.clone().lerp(b, (j + .56) / steps);
        const perpendicular = end.clone().sub(start).rotateAround(new Vector2(), Math.PI / 2).normalize().multiplyScalar(.007);
        const points = [start.clone().sub(perpendicular), end.clone().sub(perpendicular),
          end.clone().add(perpendicular), start.clone().add(perpendicular)]
          .map((p) => new Vector3(p.x, -.012, p.y));
        seams.quad(points, points.map(() => new Vector3(0, 1, 0)));
      }
    }
  }
  add(seams.geometry(), "stitch");
  group.userData.model = "procedural-tray";
  return group;
}
