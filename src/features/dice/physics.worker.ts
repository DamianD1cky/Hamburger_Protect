import { getDieShape } from "./diceShapes";
import { buildThrow } from "./trayPhysics";
import type { PhysicsRequest, PhysicsResponse, ReplayTrack } from "./physicsProtocol";

self.onmessage = (event: MessageEvent<PhysicsRequest>) => {
  const { id, dice, stationary, launch } = event.data;
  try {
    const tracks: ReplayTrack[] = buildThrow(dice, dice.map((die) => getDieShape(die.sides)),
      stationary.map((item) => ({ ...item, shape: getDieShape(item.die.sides) })), launch).map((track) => {
      const samples = new Float32Array(track.frames.length * 7);
      track.frames.forEach((pose, index) => {
        samples.set(pose.position, index * 7);
        samples.set(pose.quaternion, index * 7 + 3);
      });
      return { die: track.die, samples, correction: track.correction.toArray() };
    });
    self.postMessage({ id, tracks } satisfies PhysicsResponse, { transfer: tracks.map((track) => track.samples.buffer) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "物理轨迹计算失败" } satisfies PhysicsResponse);
  }
};
