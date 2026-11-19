import assert from "node:assert/strict";
import { MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { buildDieGeometry } from "../../src/features/dice/proceduralGeometry.ts";
import { getDieShape, faceCorrection, readDieFace } from "../../src/features/dice/diceShapes.ts";
import { createModelLibrary, disposeModel } from "../../src/features/dice/trayModels.ts";
import { createProceduralTray } from "../../src/features/dice/proceduralTray.ts";
import { trayEdges } from "../../src/features/dice/trayPlacement.ts";
import { buildThrow } from "../../src/features/dice/trayPhysics.ts";
import {
  CUSTOM_DICE_GLSL_TEMPLATES,
  DICE_MATERIAL_PRESETS,
  configForPreset,
  isAnimatedDiceConfig,
  sanitizeDiceMaterialConfig,
  validateCustomDiceGlslSyntax,
} from "../../src/features/dice/diceMaterialConfig.ts";

const materials = new Map();
const opaqueCalls = [];
const surfaces = { material(slot, skin, labels, options) {
  if (options?.opaque) opaqueCalls.push(`${slot}:${skin}`);
  const key = `${slot}:${skin}:${labels}:${Boolean(options?.opaque)}`;
  if (!materials.has(key)) materials.set(key, new MeshStandardMaterial());
  return materials.get(key);
} };
let checked = 0;
for (const sides of [4, 6, 8, 10, 12, 20, 100, "F"]) {
  const geometry = buildDieGeometry(sides), shape = getDieShape(sides);
  assert.ok(geometry.body.getAttribute("position").count / 3 < 3200, `d${sides} geometry budget`);
  for (const mesh of [geometry.body, geometry.marks]) {
    const position = mesh.getAttribute("position"), normal = mesh.getAttribute("normal"), uv = mesh.getAttribute("uv");
    assert.equal(position.count, normal.count);
    assert.equal(position.count, uv.count, "every surface supports replacement textures");
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3().fromBufferAttribute(position, i);
      assert.ok(Number.isFinite(p.lengthSq()));
      assert.ok(Math.abs(new Vector3().fromBufferAttribute(normal, i).length() - 1) < .001);
      assert.ok(shape.faces.every((face) => p.dot(face.normal) <= face.center.dot(face.normal) + .002),
        `d${sides}: round body, pips and numbers fit the physics hull`);
    }
  }
  for (const face of shape.faces) {
    for (const axis of [new Vector3(.3, .7, .4), new Vector3(-.4, .1, .8)]) {
      const resting = new Quaternion().setFromAxisAngle(axis.normalize(), 1.12);
      const corrected = resting.clone().multiply(faceCorrection(shape, resting, face.value));
      assert.equal(readDieFace(shape, corrected).value, face.value);
    }
    checked++;
  }
  geometry.body.dispose(); geometry.marks.dispose();
}
const library = createModelLibrary(surfaces);
const die = { id: "a", sides: 20, value: 12, kept: true, rollId: "test" };
const first = library.create(die, "jade"), second = library.create({ ...die, id: "b" }, "jade");
assert.equal(first.body.geometry, second.body.geometry);
assert.equal(first.body.material, second.body.material);
assert.notEqual(first.group, second.group);
const pipDie = library.create({ id: "pip", sides: 6, value: 4, kept: true, rollId: "result" }, "jade");
pipDie.group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), .3);
const rootPose = pipDie.group.quaternion.clone();
const numberedBody = pipDie.body.geometry;
library.appearance(pipDie, "jade", "rolling");
assert.equal(pipDie.marks.visible, true, "unconfirmed motion keeps the numbered dice visible");
assert.equal(pipDie.body.geometry, numberedBody, "rolling d6 keeps its recessed pips instead of becoming a blank cube");
const correction = faceCorrection(pipDie.shape, rootPose, 4);
pipDie.group.quaternion.copy(rootPose.clone().multiply(correction));
const settledPose = pipDie.group.quaternion.clone();
library.appearance(pipDie, "jade", "numbered");
assert.ok(pipDie.group.quaternion.equals(settledPose), "result publication never changes the completed root pose");
assert.equal(readDieFace(pipDie.shape, pipDie.group.quaternion).value, 4);
assert.ok(pipDie.body.quaternion.equals(new Quaternion()) && pipDie.marks.quaternion.equals(new Quaternion()),
  "the printed pips and body never rotate independently");
assert.equal(pipDie.body.geometry, numberedBody, "confirmation reuses the original numbered geometry");
library.appearance(pipDie, "jade", "secret");
assert.equal(pipDie.group.userData.hidden, true, "blind dice remain secret instead of revealing a local point value");
assert.equal(pipDie.marks.visible, true, "secret dice show only their question-mark glyph");
for (const sides of [4, 6, 8, 10, 12, 20, 100, "F"]) {
  const shape = getDieShape(sides);
  const die = library.create({ id: `visible-${sides}`, sides, value: null, kept: true }, "jade");
  const root = new Quaternion().setFromUnitVectors(shape.faces[0].readNormal, new Vector3(0, 1, 0));
  die.group.quaternion.copy(root);
  for (const face of shape.faces) {
    library.appearance(die, "jade", "rolling");
    assert.equal(die.marks.visible, true);
    die.group.quaternion.copy(root.clone().multiply(faceCorrection(shape, root, face.value)));
    const completed = die.group.quaternion.clone();
    library.appearance(die, "jade", "numbered");
    assert.equal(readDieFace(shape, die.group.quaternion.clone().multiply(die.body.quaternion)).value, face.value,
      `d${sides}: the first numbered presentation already has the authoritative value`);
    assert.ok(die.group.quaternion.equals(completed), `d${sides}: confirmation cannot rotate a settled physical pose`);
    assert.ok(die.body.quaternion.equals(new Quaternion()) && die.marks.quaternion.equals(new Quaternion()),
      `d${sides}: each printed face remains fixed relative to the die`);
  }
}
let disposed = false;
first.body.geometry.addEventListener("dispose", () => { disposed = true; });
disposeModel(first.group);
assert.equal(disposed, false, "removing one die must not release another die's shared geometry");
const hidden = library.create({ ...die, value: null }, "jade");
assert.notEqual(hidden.body.geometry, second.body.geometry, "hidden outcomes have a separate unmarked body");
const tray = createProceduralTray(surfaces);
assert.deepEqual(tray.children.map((mesh) => mesh.userData.surfaceSlot).sort(), ["lining", "rim", "stitch", "trim"]);
for (const mesh of tray.children) assert.ok(mesh.geometry.getAttribute("uv"));
assert.equal(trayEdges.length, 6);
library.dispose();
assert.equal(disposed, true, "the owning library releases geometry at tray close");
disposeModel(tray); materials.forEach((material) => material.dispose());

// Material & Shader Studio config, secret-die opacity guard & physics impact telemetry
assert.ok(opaqueCalls.length >= 2, "secret dice explicitly request opaque body materials so blind rolls never leak");
assert.ok(DICE_MATERIAL_PRESETS.length >= 10, "expanded built-in dice material presets");
for (const preset of DICE_MATERIAL_PRESETS) {
  const sanitized = sanitizeDiceMaterialConfig(preset.config);
  assert.equal(sanitized.presetId, preset.id);
  assert.ok(sanitized.transmission <= 0.92 && sanitized.roughness >= 0.04);
}
assert.equal(isAnimatedDiceConfig(configForPreset("jade")), false, "static PBR presets stay on-demand without idle GPU loop");
assert.equal(isAnimatedDiceConfig(configForPreset("molten_ember")), true, "shader presets request live animation loop");
for (const tpl of CUSTOM_DICE_GLSL_TEMPLATES) {
  assert.equal(validateCustomDiceGlslSyntax(tpl.code).ok, true, `template ${tpl.id} passes GLSL syntax guard`);
}
assert.equal(validateCustomDiceGlslSyntax("while(true){}").ok, false, "while loops are rejected");
assert.equal(validateCustomDiceGlslSyntax("#version 300 es\n").ok, false, "preprocessor directives are rejected");
assert.equal(validateCustomDiceGlslSyntax("if (true) {").ok, false, "unbalanced braces are rejected");
const impactShape = getDieShape(20);
const [impactTrack] = buildThrow([{ id: "imp", sides: 20, value: 17, kept: true }], [impactShape]);
assert.ok(Array.isArray(impactTrack.impacts) && impactTrack.impacts.length > 0, "physics simulation records bounce impacts for audio foley");
assert.ok(impactTrack.impacts.every((imp) => imp.frame >= impactTrack.preparationFrames && imp.intensity > 0 && imp.intensity <= 1));

console.log(`${checked} procedural face mappings passed; UVs, smooth normals, resource sharing, hidden models, material presets, GLSL guards and physics impact telemetry passed.`);
