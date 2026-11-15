import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import modelGeometry from "./modelGeometry.json" with { type: "json" };

export interface DieFace {
  value: number;
  normal: Vector3;
  readNormal: Vector3;
  center: Vector3;
  up: Vector3;
  frame: Quaternion;
  size: number;
  vertices: number[];
}
export interface DieShape {
  geometry: BufferGeometry;
  vertices: Vector3[];
  faces: DieFace[];
}
type Definition = {
  vertices: number[][];
  faces: { value: number; vertices: number[]; readNormal: number[] }[];
};
const definitions = modelGeometry as unknown as Record<string, Definition>;
const cache = new Map<number | "F", DieShape>();

/** Immutable low-poly hull shared by placement, physics and face reading. */
export function getDieShape(sides: number | "F"): DieShape {
  const cached = cache.get(sides);
  if (cached) return cached;
  const number = sides === "F" ? 6 : sides === 100 ? 10 : sides;
  const definition = definitions[String(number)] ?? definitions["6"];
  const vertices = definition.vertices.map((p) => new Vector3(...p as [number, number, number]));
  const positions: number[] = [];
  const faces = definition.faces.map((face): DieFace => {
    const points = face.vertices.map((id) => vertices[id]);
    const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const up = points.map((p) => p.clone().sub(center)).sort((a, b) => b.lengthSq() - a.lengthSq())[0].normalize();
    const right = up.clone().cross(normal).normalize();
    for (let i = 1; i < points.length - 1; i++) {
      for (const p of [points[0], points[i], points[i + 1]]) positions.push(p.x, p.y, p.z);
    }
    return {
      value: sides === 100 ? face.value === 10 ? 1 : face.value + 1 : face.value,
      normal, readNormal: new Vector3(...face.readNormal as [number, number, number]),
      center, up, vertices: face.vertices,
      frame: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal)),
      size: Math.min(...points.map((p) => p.distanceTo(center))) * 1.05,
    };
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const shape = { geometry, vertices, faces };
  cache.set(sides, shape);
  return shape;
}

/** Compatibility for callers that explicitly dispose their temporary hull. */
export function makeDieShape(sides: number | "F"): DieShape {
  const shape = getDieShape(sides);
  return { ...shape, geometry: shape.geometry.clone() };
}

export function readDieFace(shape: DieShape, rotation: Quaternion): DieFace {
  const direction = new Vector3(0, 1, 0).applyQuaternion(rotation.clone().invert());
  return shape.faces.reduce((best, face) =>
    face.readNormal.dot(direction) > best.readNormal.dot(direction) ? face : best);
}

export function faceCorrection(shape: DieShape, resting: Quaternion, value: number): Quaternion {
  const best = readDieFace(shape, resting);
  const target = shape.faces.find((face) => face.value === value);
  return target ? best.frame.clone().multiply(target.frame.clone().invert()) : new Quaternion();
}
