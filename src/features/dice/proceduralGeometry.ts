import {
  BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Vector3,
} from "three";
import { getDieShape, type DieFace } from "./diceShapes.ts";

/** A small triangle builder keeps all repeated surfaces in one draw call. */
export class SurfaceBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  triangle(points: Vector3[], normals: Vector3[], uvs: Vector2[] = []) {
    const cross = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    if (cross.lengthSq() < 1e-15) return;
    const order = cross.dot(normals[0]) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const index of order) {
      this.positions.push(...points[index].toArray());
      this.normals.push(...normals[index].toArray());
      this.uvs.push(...(uvs[index] ?? new Vector2()).toArray());
    }
  }
  quad(points: Vector3[], normals: Vector3[], uvs: Vector2[] = []) {
    this.triangle([points[0], points[1], points[2]], [normals[0], normals[1], normals[2]],
      [uvs[0], uvs[1], uvs[2]]);
    this.triangle([points[0], points[2], points[3]], [normals[0], normals[2], normals[3]],
      [uvs[0], uvs[2], uvs[3]]);
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const pointPatterns = [
  [], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
];
function faceAxes(face: DieFace) {
  // Keep numbers upright rather than pointing them toward arbitrary vertices.
  const up = new Vector3(0, 1, 0).addScaledVector(face.normal, -face.normal.y);
  if (up.lengthSq() < .01) up.set(0, 0, -1).addScaledVector(face.normal, face.normal.z);
  up.normalize();
  return { up, right: up.clone().cross(face.normal).normalize() };
}
function interpolateNormal(a: Vector3, b: Vector3, fraction: number) {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return a.clone();
  return a.clone().multiplyScalar(Math.sin((1 - fraction) * angle))
    .addScaledVector(b, Math.sin(fraction * angle)).divideScalar(Math.sin(angle)).normalize();
}
const bevelSteps = 5;

/** Minkowski rounded hull: planar faces, cylindrical edges, spherical corners.
 * The hull only shrinks inward, so rendering never penetrates the physics wall.
 * All surfaces have UVs and explicit smooth normals; no high-poly source asset.
 */
export function buildDieGeometry(sides: number | "F", hidden = false) {
  const shape = getDieShape(sides);
  const inradius = Math.min(...shape.faces.map((face) => face.center.dot(face.normal)));
  const radius = Math.min(.048, inradius * .13);
  const factor = 1 - radius / inradius;
  const inner = shape.vertices.map((v) => v.clone().multiplyScalar(factor));
  const body = new SurfaceBuilder(), pips = new SurfaceBuilder(), marks = new SurfaceBuilder();
  const isPipDie = sides === 6 && !hidden;
  const edges = new Map<string, { a: number; b: number; faces: DieFace[] }>();
  const normalsByVertex = shape.vertices.map(() => [] as Vector3[]);

  for (const face of shape.faces) {
    for (let i = 0; i < face.vertices.length; i++) {
      const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length];
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const edge = edges.get(key) ?? { a, b, faces: [] };
      edge.faces.push(face); edges.set(key, edge);
      normalsByVertex[a].push(face.normal);
    }
    const { up, right } = faceAxes(face);
    const middle = face.center.clone().multiplyScalar(factor).addScaledVector(face.normal, radius);
    const polygon = face.vertices.map((id) => inner[id].clone().addScaledVector(face.normal, radius));
    const contour = polygon.map((p) => {
      const local = p.clone().sub(middle);
      return new Vector2(local.dot(right), local.dot(up));
    });
    const uvScale = Math.max(...contour.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) * 2;
    const uvFor = (p: Vector2) => new Vector2(p.x / uvScale + .5, p.y / uvScale + .5);
    const holes: Vector2[][] = [];
    if (isPipDie) {
      for (const [x, y] of pointPatterns[face.value]) {
        const cx = x * .235, cy = y * .235, holeRadius = .066;
        holes.push(Array.from({ length: 20 }, (_, i) => {
          const angle = i * Math.PI * 2 / 20;
          return new Vector2(cx + Math.cos(angle) * holeRadius, cy + Math.sin(angle) * holeRadius);
        }));
        // A real recessed pip with a rounded lip and dark curved bottom.
        const rings = [{ r: holeRadius, depth: 0 }, { r: holeRadius * .88, depth: .008 },
          { r: holeRadius * .65, depth: .020 }, { r: 0, depth: .026 }];
        for (let ring = 0; ring < rings.length - 1; ring++) {
          const point = (band: number, angle: number) => middle.clone()
            .addScaledVector(right, cx + Math.cos(angle) * rings[band].r)
            .addScaledVector(up, cy + Math.sin(angle) * rings[band].r)
            .addScaledVector(face.normal, -rings[band].depth);
          const normal = (band: number, angle: number) => face.normal.clone()
            .addScaledVector(right, -Math.cos(angle) * (band === 3 ? 0 : band === 0 ? .05 : .6))
            .addScaledVector(up, -Math.sin(angle) * (band === 3 ? 0 : band === 0 ? .05 : .6)).normalize();
          const builder = ring === 0 ? body : pips;
          for (let i = 0; i < 20; i++) {
            const a = i * Math.PI * 2 / 20, b = (i + 1) * Math.PI * 2 / 20;
            const points = [point(ring, a), point(ring, b), point(ring + 1, b), point(ring + 1, a)];
            const normals = [normal(ring, a), normal(ring, b), normal(ring + 1, b), normal(ring + 1, a)];
            builder.quad(points, normals, points.map((p) => {
              const local = p.clone().sub(middle);
              return uvFor(new Vector2(local.dot(right), local.dot(up)));
            }));
          }
        }
      }
    }
    const planar = [...contour, ...holes.flat()];
    const positions = planar.map((p) => middle.clone().addScaledVector(right, p.x).addScaledVector(up, p.y));
    for (const indices of ShapeUtils.triangulateShape(contour, holes)) {
      body.triangle(indices.map((i) => positions[i]), indices.map(() => face.normal),
        indices.map((i) => uvFor(planar[i])));
    }

    if (!isPipDie) {
      // Single merged label mesh; each glyph occupies a fixed atlas tile.
      const addLabel = (value: number, center: Vector3, labelUp: Vector3, width: number) => {
        const labelRight = labelUp.clone().cross(face.normal).normalize();
        const half = width / 2;
        const points = [
          center.clone().addScaledVector(labelRight, -half).addScaledVector(labelUp, -half),
          center.clone().addScaledVector(labelRight, half).addScaledVector(labelUp, -half),
          center.clone().addScaledVector(labelRight, half).addScaledVector(labelUp, half),
          center.clone().addScaledVector(labelRight, -half).addScaledVector(labelUp, half),
        ];
        // Tiles 0..20: ordinary numbers; 21..30: percentile; 31..34: ?, −, ·, +.
        const tile = hidden ? 31 : sides === "F" ? value <= 2 ? 32 : value <= 4 ? 33 : 34 :
          sides === 100 ? 21 + value - 1 : sides === 10 && value === 10 ? 0 : value;
        const x = tile % 8, y = Math.floor(tile / 8);
        const u0 = (x + .025) / 8, u1 = (x + .975) / 8;
        const v0 = 1 - (y + .975) / 8, v1 = 1 - (y + .025) / 8;
        marks.quad(points, points.map(() => face.normal),
          [new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1)]);
      };
      const clearance = Math.min(...contour.map((p, i) => {
        const q = contour[(i + 1) % contour.length];
        return Math.abs(p.x * q.y - p.y * q.x) / p.distanceTo(q);
      }));
      if (sides === 4 && !hidden) {
        // Tetrahedral dice show the apex value repeated beside that vertex.
        for (const id of face.vertices) {
          const reading = shape.faces.find((f) => !f.vertices.includes(id))!;
          const direction = shape.vertices[id].clone().sub(face.center);
          direction.addScaledVector(face.normal, -direction.dot(face.normal)).normalize();
          const center = middle.clone().lerp(polygon[face.vertices.indexOf(id)], .49)
            .addScaledVector(face.normal, .0015);
          addLabel(reading.value, center, direction, .18);
        }
      } else {
        addLabel(face.value, middle.clone().addScaledVector(face.normal, .0015), up,
          clearance * 1.38);
      }
    }
  }
  for (const edge of edges.values()) {
    const [a, b] = edge.faces.map((f) => f.normal);
    for (let i = 0; i < bevelSteps; i++) {
      const na = interpolateNormal(a, b, i / bevelSteps), nb = interpolateNormal(a, b, (i + 1) / bevelSteps);
      const points = [inner[edge.a].clone().addScaledVector(na, radius), inner[edge.b].clone().addScaledVector(na, radius),
        inner[edge.b].clone().addScaledVector(nb, radius), inner[edge.a].clone().addScaledVector(nb, radius)];
      body.quad(points, [na, na, nb, nb],
        [new Vector2(0, i / bevelSteps), new Vector2(1, i / bevelSteps),
          new Vector2(1, (i + 1) / bevelSteps), new Vector2(0, (i + 1) / bevelSteps)]);
    }
  }
  for (const [id, normals] of normalsByVertex.entries()) {
    const center = shape.vertices[id].clone().normalize();
    const up = normals[0].clone().addScaledVector(center, -normals[0].dot(center)).normalize();
    const right = up.clone().cross(center).normalize();
    normals.sort((a, b) => Math.atan2(a.dot(up), a.dot(right)) - Math.atan2(b.dot(up), b.dot(right)));
    const border: Vector3[] = [];
    normals.forEach((normal, i) => {
      const next = normals[(i + 1) % normals.length];
      for (let j = 0; j < bevelSteps; j++) border.push(interpolateNormal(normal, next, j / bevelSteps));
    });
    for (let i = 0; i < border.length; i++) {
      const a = border[i], b = border[(i + 1) % border.length];
      const point = (n: Vector3) => inner[id].clone().addScaledVector(n, radius);
      const ca = interpolateNormal(center, a, .5), cb = interpolateNormal(center, b, .5);
      body.triangle([point(center), point(ca), point(cb)], [center, ca, cb]);
      body.quad([point(ca), point(a), point(b), point(cb)], [ca, a, b, cb]);
    }
  }
  return { body: body.geometry(), marks: isPipDie ? pips.geometry() : marks.geometry(), recessed: isPipDie };
}
