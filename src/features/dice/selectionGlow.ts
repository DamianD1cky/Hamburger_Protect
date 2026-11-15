import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Screen-space silhouettes follow every die face without covering its numbers. */
export function createSelectionGlow(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.Camera) {
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  const outline = new OutlinePass(new T.Vector2(1, 1), scene, camera);
  const output = new OutputPass();
  outline.visibleEdgeColor.set("#a5d9ff");
  outline.hiddenEdgeColor.set(0x000000);
  outline.edgeStrength = 3;
  outline.edgeThickness = 1.5;
  outline.edgeGlow = 1.5;
  outline.pulsePeriod = 0;
  // Preserve the transparent canvas around the tray. OutlinePass's default
  // additive alpha would make this independent layer opaque when selected.
  outline.overlayMaterial.blending = T.CustomBlending;
  outline.overlayMaterial.blendSrc = T.SrcAlphaFactor;
  outline.overlayMaterial.blendDst = T.OneFactor;
  outline.overlayMaterial.blendSrcAlpha = T.ZeroFactor;
  outline.overlayMaterial.blendDstAlpha = T.OneFactor;
  let faceLabels: T.Object3D[] = [];
  const renderOutline = outline.render.bind(outline);
  outline.render = (...args) => {
    // Decals are rendered in the color pass, but their rectangular backing
    // planes must not occlude the body's silhouette in the depth/mask pass.
    const visibility = faceLabels.map((label) => label.visible);
    faceLabels.forEach((label) => { label.visible = false; });
    try { renderOutline(...args); }
    finally { faceLabels.forEach((label, index) => { label.visible = visibility[index]; }); }
  };
  composer.addPass(render);
  composer.addPass(outline);
  composer.addPass(output);
  return {
    select(objects: T.Object3D[]) {
      outline.selectedObjects = objects;
      faceLabels = objects.flatMap((body) => body.parent?.children.filter((child) => child !== body) ?? []);
    },
    resize(width: number, height: number) { composer.setSize(width, height); },
    render() { composer.render(); },
    dispose() {
      render.dispose(); outline.dispose(); output.dispose(); composer.dispose();
    },
  };
}
