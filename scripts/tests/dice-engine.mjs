import assert from "node:assert/strict";
import * as library from "@dice-roller/rpg-dice-roller";
import { evaluateDice, validateDiceNotation } from "../../src/features/dice/engine.ts";
let checks = 0;
for (const notation of ["1d20+5", "4d6dl1", "2d20kh1", "2d20kl1", "6d6>=5", "4dF", "1d100", "2d6+1d8"]) {
  for (let i = 0; i < 20; i++) {
    const result = evaluateDice(notation, library);
    assert.ok(Number.isFinite(result.total));
    assert.ok(result.dice.length >= 1);
    for (const die of result.dice) {
      assert.ok(Number.isInteger(die.value));
      assert.ok(die.sides === "F" ? die.value >= -1 && die.value <= 1 : die.value >= 1 && die.value <= die.sides);
    }
    if (notation === "4d6dl1") {
      assert.equal(result.dice.filter((d) => d.kept).length, 3);
      assert.equal(result.total, result.dice.filter((d) => d.kept).reduce((sum, d) => sum + d.value, 0));
    }
    if (notation === "2d20kh1") assert.equal(result.total, Math.max(...result.dice.map((d) => d.value)));
    if (notation === "2d20kl1") assert.equal(result.total, Math.min(...result.dice.map((d) => d.value)));
    if (notation === "6d6>=5") assert.equal(result.total, result.dice.filter((d) => d.value >= 5).length);
    checks++;
  }
}
for (const invalid of ["1000000d6", "0d6", "1d1", "1d1001", "99d6+2d6", "1d6;alert(1)", "1d6+constructor", "(((1d6)", "1d6/0"]) {
  assert.throws(() => evaluateDice(invalid, library));
  checks++;
}
assert.equal(validateDiceNotation(" 2d6 + 3 "), "2d6+3");
// Force every draw to be six, proving that a nonterminating explosion is
// bounded and the process-global engine is restored even after failure.
const originalRandom = crypto.getRandomValues.bind(crypto);
const oldEngine = library.NumberGenerator.generator.engine;
crypto.getRandomValues = (array) => { array.fill(5); return array; };
try { assert.throws(() => evaluateDice("1d6!", library), /安全上限/); }
finally { crypto.getRandomValues = originalRandom; }
assert.equal(library.NumberGenerator.generator.engine, oldEngine);
console.log(`${checks + 3} dice engine assertions passed`);
