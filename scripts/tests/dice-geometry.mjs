import assert from "node:assert/strict";
import { Box3, Quaternion, Vector3 } from "three";
import { makeDieShape, faceCorrection, readDieFace } from "../../src/features/dice/trayModels.ts";
import { buildThrow, traySize } from "../../src/features/dice/trayPhysics.ts";
import { dieBounds, findTraySpace, footprint, fitsTray, trayEdges } from "../../src/features/dice/trayPlacement.ts";
let checks = 0;
for (const sides of [4, 6, 8, 10, 12, 20]) {
  const shape = makeDieShape(sides);
  assert.equal(shape.faces.length, sides, `d${sides} has ${sides} flat faces`); checks++;
  for (const value of shape.faces.map((face) => face.value)) {
    const resting = new Quaternion().setFromAxisAngle(new Vector3(.3, .7, .4).normalize(), 1.12);
    const correction = faceCorrection(shape, resting, value);
    const rotation = resting.clone().multiply(correction);
    const top = readDieFace(shape, rotation);
    assert.equal(top.value, value, `d${sides} face mapping ${value}`);
    // A correction must map the whole hull onto itself, not just one normal.
    for (const vertex of shape.vertices) {
      const corrected = vertex.clone().applyQuaternion(correction);
      assert.ok(shape.vertices.some((v) => v.distanceTo(corrected) < .002), `d${sides} preserves collider symmetry`);
    }
    checks++;
  }
  const dice = Array.from({ length: Math.min(sides, 6) }, (_, index) =>
    ({ id: `die-${index}`, sides, value: index + 1, kept: true }));
  const tracks = buildThrow(dice, dice.map(() => shape));
  for (const track of tracks) {
    const pose = track.frames.at(-1);
    assert.ok(Math.abs(pose.position[0]) < traySize.width / 2 && Math.abs(pose.position[2]) < traySize.depth / 2);
    const rotation = new Quaternion(...pose.quaternion).multiply(track.correction);
    const top = readDieFace(shape, rotation);
    assert.equal(top.value, track.die.value, "physical replay shows committed value");
    checks++;
  }
  shape.geometry.dispose();
}
const d6 = makeDieShape(6);
const retainedPose = { position: [2, .51, 1], quaternion: [0, 0, 0, 1] };
const track = buildThrow([{ id: "reroll", sides: 6, value: 4, kept: true }], [d6], [
  { die: { id: "retained", sides: 6, value: 2, kept: true }, shape: d6, pose: retainedPose },
]);
assert.equal(track.length, 1, "only selected dice receive a throw track");
assert.deepEqual(retainedPose.position, [2, .51, 1], "stationary dice are not mutated by the simulation");
d6.geometry.dispose();
checks += 2;
const occupied = [];
for (const sides of [6, 20, 8, 4, 10, 12, 100, 10, "F", 6, 20, 8, 12, 4, 6, 20, 8, 4, 6, 10]) {
  const shape = makeDieShape(sides);
  const quaternion = new Quaternion().setFromUnitVectors(shape.faces[0].readNormal, new Vector3(0, 1, 0)).toArray();
  const bounds = dieBounds(shape.geometry, { position: [0, 0, 0], quaternion });
  const position = findTraySpace(bounds, occupied);
  assert.ok(position, `mixed dice have room for die ${occupied.length + 1}`);
  const next = footprint(bounds.translate(new Vector3(...position)));
  assert.ok(fitsTray(next), "placement follows the six inner tray walls");
  assert.ok(occupied.every((other) => next.maxX <= other.minX || next.minX >= other.maxX ||
    next.maxZ <= other.minZ || next.minZ >= other.maxZ), "new dice never intersect existing footprints");
  occupied.push(next);
  shape.geometry.dispose();
  checks += 3;
}
assert.equal(findTraySpace(new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5)),
  [{ minX: -5.5, maxX: 5.5, minZ: -5, maxZ: 5 }]), null, "full trays reject placement instead of stacking");
checks++;
for (const direction of [[8, .5, 3], [-8, .5, -3], [0, .5, 0]]) {
  const dice = [{ id: "toss-six", sides: 6, value: 4, kept: true }, { id: "toss-tens", sides: 100, value: 7, kept: true }];
  const shapes = dice.map((die) => makeDieShape(die.sides));
  const launch = {
    dice: dice.map((die, index) => ({ sides: die.sides, pose: { position: [-1 + index * 2, 1.8, 0], quaternion: [0, 0, 0, 1] } })),
    velocity: direction,
  };
  const tracks = buildThrow(dice, shapes, [], launch);
  for (const [i, track] of tracks.entries()) {
    assert.deepEqual(track.frames[0].position, launch.dice[i].pose.position, "toss begins where the user released it");
    const last = track.frames.at(-1);
    const points = shapes[i].vertices.map((v) => v.clone().applyQuaternion(new Quaternion(...last.quaternion))
      .add(new Vector3(...last.position)));
    assert.ok(points.every((p) => trayEdges.every((edge) =>
      (p.x - edge.x) * edge.nx + (p.z - edge.z) * edge.nz >= -.002)), "released hull stays in the hexagonal tray");
    const rotation = new Quaternion(...last.quaternion).multiply(track.correction);
    const top = readDieFace(shapes[i], rotation);
    assert.equal(top.value, dice[i].value, "gesture velocity cannot change the committed face, including percentile tens");
    checks += 3;
  }
  shapes.forEach((shape) => shape.geometry.dispose());
}
console.log(`${checks} dice model, face symmetry and physical replay assertions passed`);
for (const sides of [4, 6, 8, 10, 12, 20]) {
  const shape = makeDieShape(sides);
  const dice = Array.from({ length: 20 }, (_, i) => ({ id: `dense-${i}`, sides, value: i % sides + 1, kept: true }));
  const tracks = buildThrow(dice, dice.map(() => shape));
  const occupied = [];
  for (const track of tracks) {
    const pose = track.frames.at(-1);
    const rotation = new Quaternion(...pose.quaternion).multiply(track.correction);
    const face = readDieFace(shape, rotation);
    assert.equal(face.value, track.die.value, "settlement preserves the authoritative value");
    assert.ok(face.readNormal.clone().applyQuaternion(rotation).y > .9999,
      `d${sides} never finishes wedged on an edge`);
    const bounds = dieBounds(shape.geometry, { ...pose, quaternion: rotation.toArray() });
    assert.ok(Math.abs(bounds.min.y - .025) < .002, "every moving die rests on the tray floor");
    const box = footprint(bounds);
    assert.ok(fitsTray(box), "settled dice stay inside the six walls");
    assert.ok(occupied.every((other) => box.maxX < other.minX || box.minX > other.maxX ||
      box.maxZ < other.minZ || box.minZ > other.maxZ), "dense pools settle without stacking or overlaps");
    occupied.push(box);
  }
  shape.geometry.dispose();
}
console.log("120 dense-pool dice settle flat, separated and with unambiguous authoritative faces.");
