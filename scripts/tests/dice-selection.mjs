import assert from "node:assert/strict";
import { expandDiceSelection, replaceTrayDice, rollTrayDice, trayNotation } from "../../src/features/dice/traySelection.ts";
import { Group, PerspectiveCamera, Vector3 } from "three";
import { fitPortraitTrayCamera } from "../../src/features/dice/trayViewport.ts";
import { trayOuter } from "../../src/features/dice/trayPlacement.ts";

const die = (id, sides, extra = {}) => ({ id, sides, value: null, kept: true, ...extra });
const pool = [die("a", 6), die("b", 20), die("c", 6), die("f", "F")];
assert.equal(trayNotation(pool, 3), "2d6+1d20+1dF+3");
assert.equal(trayNotation(pool.slice(0, 2), -4), "1d6+1d20-4");
assert.deepEqual(expandDiceSelection(pool, ["b", "a", "a", "gone"]), ["a", "b"]);

const percentile = [
  die("roll:0", 100, { value: 8, rollId: "roll" }),
  die("roll:0:units", 10, { value: 7, rollId: "roll" }),
  die("other", 10),
];
assert.deepEqual(expandDiceSelection(percentile, ["roll:0:units"]), ["roll:0", "roll:0:units"]);
assert.deepEqual(expandDiceSelection(percentile, ["roll:0"]), ["roll:0", "roll:0:units"]);
assert.equal(trayNotation(percentile), "1d100+1d10");
assert.equal(trayNotation(percentile.slice(0, 2)), "1d100");

const saved = {
  id: "saved", result: { dice: [
    { sides: 6, value: 4, kept: true },
    { sides: 20, value: 12, kept: true },
  ] },
};
const results = rollTrayDice(saved);
const replaced = replaceTrayDice(pool, ["a", "b"], results);
assert.equal(replaced.length, 4);
assert.equal(replaced[2], pool[2], "unselected dice retain their object/value");
assert.equal(replaced[3], pool[3]);
assert.deepEqual(replaced.slice(0, 2).map((item) => item.value), [4, 12]);
assert.equal(replaceTrayDice(pool, ["gone"], results), pool, "late results cannot replace a different selection");
assert.deepEqual(replaceTrayDice(pool, undefined, results), results);

const hidden = rollTrayDice({ id: "blind", result: null }, percentile);
assert.equal(hidden.length, 3, "blind receipts preserve logical d100 pairs");
assert.ok(hidden.every((item) => item.value === null));
assert.equal(trayNotation(hidden), "1d100+1d10");
assert.deepEqual(expandDiceSelection(hidden, ["blind:0:units"]), ["blind:0", "blind:0:units"]);

const full = Array.from({ length: 20 }, (_, i) => die(`full-${i}`, 6));
const limited = replaceTrayDice(full, ["full-3", "full-8"], [...results, ...results]);
assert.equal(limited.length, 20);
assert.equal(limited.filter((item) => full.includes(item)).length, 18, "all unselected dice survive the tray limit");
console.log("Dice selection: mixed pools, scope replacement, hidden receipts, percentile pairs and tray limits passed.");
for (const [width, height] of [[320, 364], [390, 566], [430, 654], [540, 740]]) {
  const camera = new PerspectiveCamera(38, width / height, .1, 100), playfield = new Group();
  playfield.rotation.y = Math.PI / 2; playfield.updateMatrixWorld(true);
  fitPortraitTrayCamera(camera, playfield);
  const points = trayOuter.map(([x, z]) => new Vector3(x, .3, z).applyMatrix4(playfield.matrixWorld).project(camera));
  const projectedWidth = (Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))) / 2;
  assert.ok(projectedWidth >= .8, `portrait ${width}x${height}: tray uses at least 80% of available width`);
  for (const [x, z] of trayOuter) for (const y of [0, 1.8]) {
    const point = new Vector3(x, y, z).applyMatrix4(playfield.matrixWorld).project(camera);
    assert.ok(Math.abs(point.x) <= .941 && Math.abs(point.y) <= .941,
      "enlarging preserves room for lifted dice and the entire tray rim");
  }
}
console.log("Portrait cameras fill available width while keeping the rim and lifted dice inside the viewport.");
