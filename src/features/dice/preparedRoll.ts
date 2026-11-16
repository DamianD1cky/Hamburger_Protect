import type { DiceRoll, RollInput } from "./types";

/** One committed roll intent survives gesture cancellation and failed reads.
 * Preparing, releasing and retrying all share its immutable request payload. */
export class PreparedRoll {
  readonly input: RollInput;
  readonly ids?: string[];
  result: DiceRoll | null = null;
  private flight: Promise<DiceRoll> | null = null;

  constructor(input: RollInput, ids?: string[]) {
    this.input = Object.freeze({ ...input });
    this.ids = ids ? [...ids] : undefined;
  }

  resolve(send: (input: RollInput) => Promise<DiceRoll>): Promise<DiceRoll> {
    if (this.result) return Promise.resolve(this.result);
    if (this.flight) return this.flight;
    this.flight = send(this.input).then((result) => {
      this.result = result;
      return result;
    }).finally(() => { this.flight = null; });
    return this.flight;
  }
}
