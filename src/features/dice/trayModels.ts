import { Group, Mesh, type BufferGeometry } from "three";
import type { DiePose } from "./trayPlacement";
import { getDieShape } from "./diceShapes.ts";
import { buildDieGeometry } from "./proceduralGeometry.ts";
import type { SurfaceLibrary } from "./surfaceMaterials.ts";

export { makeDieShape, getDieShape, faceCorrection, readDieFace } from "./diceShapes.ts";
export type { DieShape, DieFace } from "./diceShapes.ts";

export interface TrayDie {
  id: string;
  sides: number | "F";
  value: number | null;
  kept: boolean;
  rollId?: string;
  initialPose?: DiePose;
}
type DieGeometry = { body: BufferGeometry; marks: BufferGeometry; recessed: boolean };

/** One geometry per die type/hidden state, shared across all instances. */
export function createModelLibrary(surfaces: SurfaceLibrary) {
  const geometries = new Map<string, DieGeometry>();
  return {
    create(die: TrayDie, skin: string) {
      const hidden = !!die.rollId && die.value === null;
      const key = `${die.sides}:${hidden}`;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = buildDieGeometry(die.sides, hidden);
        geometries.set(key, geometry);
      }
      const group = new Group();
      const body = new Mesh(geometry.body, surfaces.material("body", skin));
      body.name = "body"; body.userData.surfaceSlot = "body";
      body.castShadow = true; body.receiveShadow = true;
      group.add(body);
      const marks = new Mesh(geometry.marks, surfaces.material("marks", skin, !geometry.recessed));
      marks.name = "marks"; marks.userData.surfaceSlot = "marks";
      group.add(marks);
      group.userData.dieId = die.id;
      group.userData.model = String(die.sides);
      group.userData.hidden = hidden;
      return { group, body, shape: getDieShape(die.sides) };
    },
    dispose() {
      for (const geometry of geometries.values()) {
        geometry.body.dispose(); geometry.marks.dispose();
      }
      geometries.clear();
    },
  };
}
export type ModelLibrary = ReturnType<typeof createModelLibrary>;

/** Per-instance removal never disposes shared resources owned by a library. */
export function disposeModel(group: Group) {
  group.traverse((node) => {
    if (node instanceof Mesh && node.userData.ownedGeometry) node.geometry.dispose();
  });
  group.clear();
}
