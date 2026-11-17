import { PerspectiveCamera, Object3D, Vector3 } from "three";
import { trayOuter } from "./trayPlacement.ts";

/** Fit the portrait tray in both directions instead of only moving a fixed
 * camera farther away. Leave space for the rim and lifted dice as well. */
export function fitPortraitTrayCamera(camera: PerspectiveCamera, playfield: Object3D) {
  const update = (distance: number) => {
    camera.position.set(0, distance, distance * .34);
    camera.lookAt(0, .2, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let extent = 0;
    for (const [x, z] of trayOuter) for (const y of [0, 1.8]) {
      const corner = new Vector3(x, y, z).applyMatrix4(playfield.matrixWorld).project(camera);
      extent = Math.max(extent, Math.abs(corner.x), Math.abs(corner.y));
    }
    return extent;
  };
  let near = 4, far = 48;
  for (let i = 0; i < 18; i++) {
    const distance = (near + far) / 2;
    if (update(distance) <= .94) far = distance;
    else near = distance;
  }
  update(far);
}
