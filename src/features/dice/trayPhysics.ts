import * as C from "cannon-es";
import { Quaternion } from "three";
import { faceCorrection, type DieShape } from "./diceShapes.ts";
import type { TrayDie } from "./trayModels";
import { trayEdges, type DiePose } from "./trayPlacement.ts";

export { traySize } from "./trayPlacement.ts";
export type { DiePose } from "./trayPlacement";
export interface ThrowLaunch {
  dice: { sides: TrayDie["sides"]; pose: DiePose }[];
  velocity: [number, number, number];
}
export interface ThrowTrack { die: TrayDie; frames: DiePose[]; correction: Quaternion }
export interface StationaryDie { die: TrayDie; shape: DieShape; pose: DiePose }

function collisionShape(die: TrayDie, shape: DieShape) {
  return die.sides === 6 || die.sides === "F" || shape.faces.length === 6
    ? new C.Box(new C.Vec3(.5, .5, .5))
    : new C.ConvexPolyhedron({
      vertices: shape.vertices.map((v) => new C.Vec3(v.x, v.y, v.z)),
      faces: shape.faces.map((f) => f.vertices),
    });
}

export function buildThrow(dice: TrayDie[], shapes: DieShape[], stationary: StationaryDie[] = [], launch?: ThrowLaunch | null): ThrowTrack[] {
  const world = new C.World({ gravity: new C.Vec3(0, -18, 0), allowSleep: true });
  world.broadphase = new C.SAPBroadphase(world);
  const material = new C.Material("dice");
  world.defaultContactMaterial.friction = .35;
  world.defaultContactMaterial.restitution = .32;
  const addWall = (half: C.Vec3, position: C.Vec3) => {
    const body = new C.Body({ mass: 0, material, shape: new C.Box(half), position });
    world.addBody(body);
  };
  addWall(new C.Vec3(6, .2, 5.5), new C.Vec3(0, -.2, 0));
  for (const edge of trayEdges) {
    const body = new C.Body({ mass: 0, material,
      shape: new C.Box(new C.Vec3(edge.length / 2 + .2, 5, .2)),
      position: new C.Vec3((edge.x + edge.nextX) / 2 - edge.nx * .2, 4.8,
        (edge.z + edge.nextZ) / 2 - edge.nz * .2),
    });
    body.quaternion.setFromEuler(0, Math.atan2(-(edge.nextZ - edge.z), edge.nextX - edge.x), 0);
    world.addBody(body);
  }
  for (const { die, shape, pose } of stationary) {
    world.addBody(new C.Body({
      mass: 0, material, shape: collisionShape(die, shape),
      position: new C.Vec3(...pose.position), quaternion: new C.Quaternion(...pose.quaternion),
    }));
  }
  const tracks: ThrowTrack[] = [];
  const sources = [...launch?.dice ?? []];
  const bodies = dice.map((die, i) => {
    const shape = shapes[i];
    const collider = collisionShape(die, shape);
    const column = i % 5, row = Math.floor(i / 5);
    const body = new C.Body({
      mass: 1, material, shape: collider,
      position: new C.Vec3(-3.7 + column * 1.6, 2 + row * 1.15, -2 + (row % 2) * 1.6),
      sleepSpeedLimit: .15, sleepTimeLimit: .22, linearDamping: .18, angularDamping: .2,
    });
    body.quaternion.setFromEuler(.5 + i * .76, 1.1 + i * .39, .7 + i * .63);
    body.velocity.set(2.4 - column * .75, .2 + (i % 3) * .3, 2.5 + (i % 2) * .4);
    body.angularVelocity.set(8 + i % 3, -10 + i % 5, 6 - i % 4);
    const sourceIndex = sources.findIndex((source) => source.sides === die.sides);
    const source = sourceIndex >= 0 ? sources.splice(sourceIndex, 1)[0] : undefined;
    if (source && launch) {
      body.position.set(...source.pose.position);
      body.quaternion.set(...source.pose.quaternion);
      body.velocity.set(...launch.velocity.map((value) => Math.max(-12, Math.min(12, value))) as [number, number, number]);
      body.angularVelocity.set(launch.velocity[2] * 1.2 + 3, 4 + i % 3, -launch.velocity[0] * 1.2 - 3);
    }
    world.addBody(body);
    tracks.push({ die, frames: [{
      position: [body.position.x, body.position.y, body.position.z],
      quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
    }], correction: new Quaternion() });
    return body;
  });
  // Replay a precomputed local physical trajectory, then apply a model
  // symmetry for the committed face. No face/texture changes at rest.
  for (let step = 0; step < 480; step++) {
    world.step(1 / 120);
    bodies.forEach((body, i) => tracks[i].frames.push({
      position: [body.position.x, body.position.y, body.position.z],
      quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
    }));
    if (step > 60 && bodies.every((body) => body.sleepState === C.Body.SLEEPING)) break;
  }
  tracks.forEach((track, i) => {
    if (track.die.value === null) return;
    const faceValue = track.die.sides === "F" ? track.die.value < 0 ? 1 : track.die.value === 0 ? 3 : 5 : track.die.value;
    const final = track.frames.at(-1)!;
    track.correction.copy(faceCorrection(shapes[i], new Quaternion(...final.quaternion), faceValue));
  });
  return tracks;
}
