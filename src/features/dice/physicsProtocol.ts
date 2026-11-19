import type { TrayDie } from "./trayModels";
import type { DiePose } from "./trayPlacement";
import type { ThrowImpact, ThrowLaunch } from "./trayPhysics";

export interface PhysicsRequest {
  id: number;
  dice: TrayDie[];
  stationary: { die: TrayDie; pose: DiePose }[];
  launch?: ThrowLaunch | null;
}
export interface ReplayTrack {
  die: TrayDie;
  samples: Float32Array;
  preparationFrames: number;
  impacts?: ThrowImpact[];
}
export interface PhysicsResponse {
  id: number;
  tracks?: ReplayTrack[];
  error?: string;
}
