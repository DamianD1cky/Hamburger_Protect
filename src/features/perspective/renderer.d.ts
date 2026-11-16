import type { PerspectiveScene } from "../campaign/domain/boardAppearance";
export interface PerspectiveState {
  depth: number; vx: number; hy: number; layout: number; time: number; blue: number;
}
export function perspectiveState(scene: PerspectiveScene, time: number): PerspectiveState;
export function renderPerspective(ctx: CanvasRenderingContext2D, scene: PerspectiveScene, time: number): PerspectiveState;
