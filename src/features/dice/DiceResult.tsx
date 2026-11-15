import type { DiceRoll } from "./types";

export function DiceResult({ roll }: { roll: DiceRoll }) {
  if (!roll.result) return <span>已投出 · 结果不可见</span>;
  const additive = /^(\d+d(?:\d+|F)(?:\+\d+d(?:\d+|F))*)([+-]\d+)?$/i.exec(roll.notation);
  const modifier = additive?.[2] ? Number(additive[2]) : 0;
  return <div className="dice-result-equation" aria-label={`${roll.actor_name}的投掷结果`}>
    <span className="dice-result-terms">
      {roll.result.dice.map((die, index) => <span key={index} className={die.kept ? "dice-result-die" : "dice-result-die is-dropped"}>
        {index > 0 && additive && <i aria-hidden="true">+</i>}
        <small>d{die.sides}</small>
        <b>{die.sides === "F" && die.value > 0 ? `+${die.value}` : die.value}</b>
        {!die.kept && <em>舍弃</em>}
        {die.flags && <em>{die.flags}</em>}
      </span>)}
      {modifier !== 0 && <span className="dice-result-modifier"><i>{modifier > 0 ? "+" : "−"}</i><small>修正</small><b>{Math.abs(modifier)}</b></span>}
      {!additive && <code>{roll.notation}</code>}
    </span>
    <span className="dice-result-total"><i>{additive ? "=" : "结果"}</i><strong>{roll.result.total}</strong></span>
  </div>;
}
