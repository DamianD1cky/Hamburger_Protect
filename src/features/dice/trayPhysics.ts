import * as C from "cannon-es";
import { Quaternion, Vector3 } from "three";
import { faceCorrection, readDieFace, type DieShape } from "./diceShapes.ts";
import type { TrayDie } from "./trayModels";
import { dieBounds, findTraySpace, footprint, trayEdges, type DiePose } from "./trayPlacement.ts";

export { traySize } from "./trayPlacement.ts";
export type { DiePose } from "./trayPlacement";
export interface ThrowLaunch {
  dice: { sides: TrayDie["sides"]; pose: DiePose }[];
  velocity: [number, number, number];
}
export interface ThrowTrack { die: TrayDie; frames: DiePose[]; preparationFrames: number }
export interface StationaryDie { die: TrayDie; shape: DieShape; pose: DiePose }

function collisionShape(die: TrayDie, shape: DieShape) {
  return die.sides === 6 || die.sides === "F" || shape.faces.length === 6
    ? new C.Box(new C.Vec3(.5, .5, .5))
    : new C.ConvexPolyhedron({
      vertices: shape.vertices.map((v) => new C.Vec3(v.x, v.y, v.z)),
      faces: shape.faces.map((f) => f.vertices),
    });
}

/** Offline simulation. Rendering never advances an unconfirmed physical roll. */
function createThrowSimulation(dice: TrayDie[], shapes: DieShape[], stationary: StationaryDie[] = [], launch?: ThrowLaunch | null) {
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
    return body;
  });
  return {
    step() { world.step(1 / 120); },
    poses(): DiePose[] {
      return bodies.map((body) => ({
        position: [body.position.x, body.position.y, body.position.z],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
      }));
    },
    sleeping() { return bodies.every((body) => body.sleepState === C.Body.SLEEPING); },
  };
}

export function buildThrow(dice: TrayDie[], shapes: DieShape[], stationary: StationaryDie[] = [], launch?: ThrowLaunch | null): ThrowTrack[] {
  const simulation = createThrowSimulation(dice, shapes, stationary, launch);
  const initial = simulation.poses();
  const tracks: ThrowTrack[] = dice.map((die, i) => ({
    die, frames: [{ position: [...initial[i].position], quaternion: [...initial[i].quaternion] }], preparationFrames: 18,
  }));
  // Result matching and all geometric settlement happen before playback.
  for (let step = 0; step < 480; step++) {
    simulation.step();
    simulation.poses().forEach((pose, i) => tracks[i].frames.push(pose));
    if (step > 60 && simulation.sleeping()) break;
  }
  const stationaryFootprints = stationary.map(({ shape, pose }) => footprint(dieBounds(shape.geometry, pose)));
  // A sharp collision hull can sleep wedged against another die or a wall.
  // Finish with a short, smooth settlement to separated floor space rather
  // than treating the timeout or a numerically selected face as a readable pose.
  const finalPoses = tracks.map((track, i) => {
    const last = track.frames.at(-1)!;
    const resting = new Quaternion(...last.quaternion);
    const up = readDieFace(shapes[i], resting).readNormal.clone().applyQuaternion(resting);
    const rotation = new Quaternion().setFromUnitVectors(up, new Vector3(0, 1, 0)).multiply(resting).normalize();
    return { position: last.position, rotation, resting, origin: last.position };
  });
  const allocateRest = (nearby: boolean) => {
    const occupied = [...stationaryFootprints];
    for (const [i, target] of finalPoses.entries()) {
      const bounds = dieBounds(shapes[i].geometry, { position: [0, 0, 0], quaternion: target.rotation.toArray() });
      const position = findTraySpace(bounds, occupied, nearby ? { x: target.origin[0], z: target.origin[2] } : undefined);
      if (!position) return false;
      target.position = position;
      occupied.push(footprint(bounds.translate(new Vector3(...position))));
    }
    return true;
  };
  if (!allocateRest(true) && !allocateRest(false)) {
    // Dense pools need a consistent yaw to avoid fragmented gaps left by
    // twenty different bounding boxes. Only the moving dice are rearranged.
    finalPoses.forEach((target, i) => {
      let smallest = Infinity, best = target.rotation.clone();
      for (let step = 0; step < 18; step++) {
        const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), step * Math.PI / 18)
          .multiply(target.rotation);
        const bounds = dieBounds(shapes[i].geometry, { position: [0, 0, 0], quaternion: rotation.toArray() });
        const area = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
        if (area < smallest) { smallest = area; best = rotation; }
      }
      target.rotation = best;
    });
    if (!allocateRest(false)) throw new Error("骰盘没有足够的空间让骰子平稳落地。");
  }
  for (let step = 1; step <= 36; step++) {
    const t = step / 36, eased = t * t * (3 - 2 * t);
    tracks.forEach((track, i) => {
      const target = finalPoses[i];
      track.frames.push({
        position: target.origin.map((value, axis) =>
          value + (target.position[axis] - value) * eased) as DiePose["position"],
        quaternion: target.resting.clone().slerp(target.rotation, eased).toArray(),
      });
    });
  }
  tracks.forEach((track, i) => {
    if (track.die.value !== null) {
      const faceValue = track.die.sides === "F" ? track.die.value < 0 ? 1 : track.die.value === 0 ? 3 : 5 : track.die.value;
      const correction = faceCorrection(shapes[i], new Quaternion(...track.frames.at(-1)!.quaternion), faceValue);
      for (const frame of track.frames) {
        frame.quaternion = new Quaternion(...frame.quaternion).multiply(correction).normalize().toArray();
      }
    }
    // Orient the whole die while it is still held, before the flight starts.
    // This prefix is also immutable replay data, never a late result patch.
    const ready = new Quaternion(...track.frames[0].quaternion);
    const held = new Quaternion(...initial[i].quaternion);
    // Ease-in/out peaks at 1.5 times the average angular speed. Keep a
    // half-turn preparation from looking like a one-frame face change.
    track.preparationFrames = Math.max(18, Math.ceil(held.angleTo(ready) * 1.5 / 10 * 120));
  });
  // Dice that collided in the simulation must share the same playback time.
  const preparationFrames = Math.max(18, ...tracks.map((track) => track.preparationFrames));
  tracks.forEach((track, i) => {
    track.preparationFrames = preparationFrames;
    const ready = new Quaternion(...track.frames[0].quaternion);
    const held = new Quaternion(...initial[i].quaternion);
    const prefix: DiePose[] = [];
    for (let step = 0; step < track.preparationFrames; step++) {
      const t = step / track.preparationFrames;
      prefix.push({
        position: [...initial[i].position],
        quaternion: held.clone().slerp(ready, t * t * (3 - 2 * t)).toArray(),
      });
    }
    track.frames.unshift(...prefix);
  });
  return tracks;
}
