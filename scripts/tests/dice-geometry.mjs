import assert from "node:assert/strict";
import { Box3, Quaternion, Vector3 } from "three";
import { makeDieShape, faceCorrection, readDieFace } from "../../src/features/dice/trayModels.ts";
import { buildThrow, traySize } from "../../src/features/dice/trayPhysics.ts";
import { matchThrowDice } from "../../src/features/dice/traySelection.ts";
import { PreparedRoll } from "../../src/features/dice/preparedRoll.ts";
import { HeldReplay } from "../../src/features/dice/heldReplay.ts";
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
    const rotation = new Quaternion(...pose.quaternion);
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
  assert.ok(tracks.every((track) => track.preparationFrames === tracks[0].preparationFrames),
    "mixed dice enter their shared collision timeline together");
  for (const [i, track] of tracks.entries()) {
    assert.deepEqual(track.frames[0].position, launch.dice[i].pose.position, "toss begins where the user released it");
    const last = track.frames.at(-1);
    const points = shapes[i].vertices.map((v) => v.clone().applyQuaternion(new Quaternion(...last.quaternion))
      .add(new Vector3(...last.position)));
    assert.ok(points.every((p) => trayEdges.every((edge) =>
      (p.x - edge.x) * edge.nx + (p.z - edge.z) * edge.nz >= -.002)), "released hull stays in the hexagonal tray");
    const rotation = new Quaternion(...last.quaternion);
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
    const rotation = new Quaternion(...pose.quaternion);
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
const pendingDice = [{ id: "a", sides: 6, value: null, kept: true }, { id: "b", sides: 20, value: null, kept: true }];
const shapes = pendingDice.map((die) => makeDieShape(die.sides));
const launch = { dice: pendingDice.map((die, i) => ({
  sides: die.sides, pose: { position: [-1 + i * 2, 1.8, 0], quaternion: [0, 0, 0, 1] },
})), velocity: [4, .5, 2] };
const results = [{ ...pendingDice[1], id: "confirmed:0", value: 12 }, { ...pendingDice[0], id: "confirmed:1", value: 4 }];
const matched = matchThrowDice(pendingDice, results);
assert.equal(matched.get("a").id, "confirmed:1", "mixed dice match by type without moving positions");
assert.equal(matchThrowDice(pendingDice, results.slice(0, 1)), null);
shapes.forEach((shape) => shape.geometry.dispose());
for (const sides of [4, 6, 8, 10, 12, 20, 100, "F"]) {
  const shape = makeDieShape(sides);
  for (const face of shape.faces) {
    const from = { position: [0, 1.8, 0], quaternion: new Quaternion().setFromAxisAngle(new Vector3(.3, .7, .2).normalize(), 1.31).toArray() };
    const value = sides === "F" ? face.value <= 2 ? -1 : face.value <= 4 ? 0 : 1 : face.value;
    const [track] = buildThrow([{ id: "committed", sides, value, kept: true }], [shape], [],
      { dice: [{ sides, pose: from }], velocity: [3, .5, 2] });
    assert.deepEqual(track.frames[0].position, from.position, "preparation begins at the held position");
    assert.ok(new Quaternion(...track.frames[0].quaternion).angleTo(new Quaternion(...from.quaternion)) < 1e-6,
      "preparation begins without changing the previous face");
    let previous = new Quaternion(...from.quaternion);
    for (const pose of track.frames) {
      const rotation = new Quaternion(...pose.quaternion);
      assert.ok(previous.angleTo(rotation) < .5, "precomputed replay has no per-frame snap");
      previous = rotation;
    }
    assert.equal("correction" in track, false, "the player receives no late face correction");
    const final = track.frames.at(-1);
    const targetValue = sides === "F" ? value < 0 ? 1 : value === 0 ? 3 : 5 : value;
    assert.equal(readDieFace(shape, new Quaternion(...final.quaternion)).value, targetValue);
    assert.ok(track.frames.slice(0, track.preparationFrames).every((frame) =>
      JSON.stringify(frame.position) === JSON.stringify(from.position)), "no falling before preflight orientation is ready");
  }
  shape.geometry.dispose();
}
let calls = 0, release;
const input = { requestId: "committed-id", notation: "1d6", label: "", visibility: "public" };
const prepared = new PreparedRoll(input, ["die-a"]);
const result = { id: input.requestId, status: "complete", result: { total: 4 } };
const send = async (payload) => { calls++; assert.deepEqual(payload, input); return new Promise((resolve) => { release = resolve; }); };
const held = prepared.resolve(send);
const released = prepared.resolve(send);
assert.equal(held, released, "grab and release share one in-flight request");
release(result);
assert.equal(await held, result);
assert.equal(await prepared.resolve(send), result, "cancel and resume reuse the committed result");
assert.equal(calls, 1);
input.notation = "10d20";
assert.equal(prepared.input.notation, "1d6", "later edits cannot change the locked request");
const retry = new PreparedRoll({ ...input, requestId: "retry-id" });
await assert.rejects(retry.resolve(async () => { throw new Error("network"); }));
await retry.resolve(async (payload) => { assert.equal(payload.requestId, "retry-id"); return result; });
console.log("All dice types have result-first immutable replays; grab/release/cancel/retry share one locked result.");

const builds = [], completions = [], failures = [];
const heldPreparation = new HeldReplay((request) => new Promise((resolve) => builds.push({ request, resolve })),
  [], (candidate) => completions.push(candidate), (error) => failures.push(error));
const committedDice = [{ id: "prepared", sides: 6, value: 4, kept: true }];
const launchAt = (x) => ({ dice: [{ sides: 6, pose: { position: [x, 1.8, 0], quaternion: [0, 0, 0, 1] } }], velocity: [4, .5, 2] });
heldPreparation.setLaunch(launchAt(0));
assert.equal(builds.length, 0, "hand physics waits for an authoritative result");
heldPreparation.setDice(committedDice);
heldPreparation.setLaunch(launchAt(1));
heldPreparation.setLaunch(launchAt(2));
assert.equal(builds.length, 1, "rapid drag moves cannot create an unbounded worker queue");
builds[0].resolve([]);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(completions.length, 0, "an old hand trajectory cannot change the currently held orientation");
assert.equal(builds.length, 2);
assert.equal(builds[1].request.launch.dice[0].pose.position[0], 2, "worker takes the newest hand position");
const replay = [{ die: committedDice[0], preparationFrames: 18,
  samples: new Float32Array([2, 1.8, 0, 0, 0, 0, 1]) }];
builds[1].resolve(replay);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(heldPreparation.candidate.tracks, replay);
heldPreparation.setLaunch(launchAt(2));
assert.equal(builds.length, 2, "release at the prepared pose reuses its trajectory");
heldPreparation.setLaunch(launchAt(3));
assert.equal(heldPreparation.candidate, null, "moving again invalidates the old prepared launch");
heldPreparation.cancel();
builds[2].resolve(replay);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(completions.length, 1, "a late reply after cancelling cannot rotate dice or start a throw");
assert.equal(failures.length, 0);
console.log("Hand preparation coalesces movement, reuses ready trajectories and discards cancelled replies.");
