import type { TrayDie } from "./trayModels";
import type { DiceRoll } from "./types";

export const standardDice = [4, 6, 8, 10, 12, 20, 100];

/** The two physical percentile dice always represent one logical d100. */
export function expandDiceSelection(dice: TrayDie[], ids: string[]): string[] {
  const selected = new Set(ids);
  for (const die of dice) {
    if (die.sides !== 100) continue;
    const units = `${die.id}:units`;
    if (selected.has(die.id) || selected.has(units)) {
      selected.add(die.id);
      selected.add(units);
    }
  }
  return dice.filter((die) => selected.has(die.id)).map((die) => die.id);
}

export function trayNotation(dice: TrayDie[], modifier = 0): string {
  const terms = new Map<number | "F", number>();
  for (const die of dice) {
    if (die.id.endsWith(":units") && dice.some((other) =>
      other.sides === 100 && `${other.id}:units` === die.id)) continue;
    terms.set(die.sides, (terms.get(die.sides) ?? 0) + 1);
  }
  return [...terms].map(([sides, count]) => `${count}d${sides}`).join("+") +
    (modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : "");
}

export function rollTrayDice(roll: DiceRoll, hiddenPool?: TrayDie[]): TrayDie[] {
  if (!roll.result) {
    // Preserve the known dice types/count without exposing any hidden value.
    const pool = hiddenPool?.length ? hiddenPool : [{ sides: 6, kept: true }];
    return pool.filter((die) => !("id" in die && die.id.endsWith(":units") && pool.some((other) =>
      "id" in other && other.sides === 100 && `${other.id}:units` === die.id))).flatMap((die, index) => {
      const base = {
        id: `${roll.id}:${index}`, sides: die.sides, kept: die.kept,
        value: null, rollId: roll.id,
      };
      return die.sides === 100
        ? [base, { ...base, id: `${base.id}:units`, sides: 10 }] : [base];
    });
  }
  return roll.result.dice.slice(0, 20).flatMap((die, index) => {
    const base = { id: `${roll.id}:${index}`, kept: die.kept, rollId: roll.id };
    if (die.sides === 100) return [
      { ...base, sides: 100, value: Math.floor((die.value % 100) / 10) + 1 },
      { ...base, id: `${base.id}:units`, sides: 10, value: die.value % 10 || 10 },
    ];
    if (die.sides !== "F" && !standardDice.includes(die.sides)) return [];
    return [{ ...base, sides: die.sides, value: die.value }];
  });
}

export function replaceTrayDice(
  current: TrayDie[], ids: string[] | undefined, results: TrayDie[],
): TrayDie[] {
  if (!ids) return results.slice(0, 20);
  const selected = new Set(ids);
  const first = current.findIndex((die) => selected.has(die.id));
  if (first < 0) return current;
  const remaining = current.filter((die) => !selected.has(die.id));
  const insertion = current.slice(0, first).filter((die) => !selected.has(die.id)).length;
  return [
    ...remaining.slice(0, insertion),
    ...results.slice(0, 20 - remaining.length),
    ...remaining.slice(insertion),
  ];
}
