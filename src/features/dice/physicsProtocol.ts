import type { TrayDie } from "./trayModels";
import type { DiePose } from "./trayPlacement";
import type { ThrowLaunch } from "./trayPhysics";

export interface PhysicsRequest {
  id: number;
  dice: TrayDie[];
  stationary: { die: TrayDie; pose: DiePose }[];
  launch?: ThrowLaunch | null;
}
export interface ReplayTrack {
  die: TrayDie;
  samples: Float32Array;
  correction: [number, number, number, number];
}
export interface PhysicsResponse {
  id: number;
  tracks?: ReplayTrack[];
  error?: string;
}
