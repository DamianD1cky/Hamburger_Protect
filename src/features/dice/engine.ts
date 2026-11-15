import type { DiceOutcome, DieResult } from "./types.ts";

// This module is also bundled into the Edge Function. The library is injected
// so Deno and Vite can resolve the same pinned engine in their own runtimes.
export function validateDiceNotation(input: string): string {
  const notation = input.trim().replace(/\s+/g, "");
  if (!notation || notation.length > 160 ||
      !/^[0-9dDfFkhKlLrRoO!<>=+\-*/().,{}%]+$/.test(notation)) {
    throw new Error("公式仅支持骰子、四则运算、取高低、重投、爆炸和比较。");
  }
  let count = 0;
  let terms = 0;
  for (const match of notation.matchAll(/(\d*)[dD](\d+|[fF])/g)) {
    const quantity = Number(match[1] || 1);
    const sides = match[2].toUpperCase() === "F" ? 6 : Number(match[2]);
    if (quantity < 1 || quantity > 100 || sides < 2 || sides > 1000) {
      throw new Error("每组 1–100 颗骰子，骰面范围 2–1000。");
    }
    count += quantity;
    terms++;
  }
  if (!terms || count > 100) throw new Error("每次最多投掷 100 颗骰子。");
  let depth = 0;
  for (const token of notation) {
    if (token === "(" || token === "{") depth++;
    if (token === ")" || token === "}") depth--;
    if (depth < 0 || depth > 8) throw new Error("括号不匹配或嵌套超过 8 层。");
  }
  if (depth) throw new Error("括号不匹配。");
  return notation;
}

interface EngineLibrary {
  DiceRoll: new (notation: string) => {
    total: number; output: string; rolls: unknown[];
  };
  NumberGenerator: {
    generator: { engine: { next(): number } | null };
  };
}

export function evaluateDice(input: string, library: EngineLibrary): DiceOutcome {
  const notation = validateDiceNotation(input);
  let draws = 0;
  const generator = library.NumberGenerator.generator;
  const previous = generator.engine;
  generator.engine = {
    next() {
      if (++draws > 1000) throw new Error("重投或爆炸次数超过安全上限。");
      return crypto.getRandomValues(new Int32Array(1))[0];
    },
  };
  try {
    const roll = new library.DiceRoll(notation);
    if (!Number.isFinite(roll.total) || Math.abs(roll.total) > 1e12) {
      throw new Error("结果超出范围，或公式包含除以零。");
    }
    const detail = JSON.parse(JSON.stringify(roll.rolls)) as unknown[];
    const sides = [...notation.matchAll(/\d*[dD](\d+|[fF])/g)]
      .map((match) => match[1].toUpperCase() === "F" ? "F" as const : Number(match[1]));
    const dice: DieResult[] = [];
    let group = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const item = node as Record<string, unknown>;
      if (item.type === "roll-results" && Array.isArray(item.rolls)) {
        const dieSides = sides[group++] ?? 6;
        for (const die of item.rolls as Record<string, unknown>[]) {
          dice.push({
            value: Number(die.value), sides: dieSides,
            kept: Boolean(die.useInTotal), flags: String(die.modifierFlags ?? ""),
          });
        }
      } else if (Array.isArray(item.results)) walk(item.results);
    };
    walk(detail);
    if (dice.length > 1000) throw new Error("骰子结果超过安全上限。");
    return { total: roll.total, output: roll.output, detail, dice };
  } finally {
    generator.engine = previous;
  }
}
