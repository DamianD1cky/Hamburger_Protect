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
export type DieAppearance = "numbered" | "rolling" | "secret";
interface DieModel { group: Group; body: Mesh; marks: Mesh; shape: ReturnType<typeof getDieShape> }

/** One geometry per die type/hidden state, shared across all instances. */
export function createModelLibrary(surfaces: SurfaceLibrary) {
  const geometries = new Map<string, DieGeometry>();
  const geometryFor = (sides: TrayDie["sides"], hidden: boolean) => {
    const key = `${sides}:${hidden}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = buildDieGeometry(sides, hidden);
      geometries.set(key, geometry);
    }
    return geometry;
  };
  const appearance = (model: DieModel, skin: string, state: DieAppearance) => {
    const sides = model.group.userData.sides as TrayDie["sides"];
    const geometry = geometryFor(sides, state === "secret");
    model.body.geometry = geometry.body;
    model.body.material = surfaces.material("body", skin);
    model.marks.geometry = geometry.marks;
    model.marks.material = surfaces.material("marks", skin, !geometry.recessed);
    model.marks.visible = true;
    // Fixed markings: neither numeric results nor network timing can rotate
    // pips, numbers or the body independently of the whole die.
    model.body.quaternion.identity();
    model.marks.quaternion.identity();
    model.group.userData.appearance = state;
    model.group.userData.hidden = state === "secret";
  };
  return {
    create(die: TrayDie, skin: string) {
      const hidden = !!die.rollId && die.value === null;
      const geometry = geometryFor(die.sides, hidden);
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
      group.userData.sides = die.sides;
      group.userData.hidden = hidden;
      group.userData.appearance = hidden ? "secret" : "numbered";
      return { group, body, marks, shape: getDieShape(die.sides) };
    },
    appearance,
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
