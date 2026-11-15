export type DiceVisibility = "public" | "gm" | "blind" | "self";
export const diceVisibilityLabels: Record<DiceVisibility, string> = {
  public: "全员可见", gm: "我和 GM", blind: "暗骰 · 仅 GM", self: "仅自己",
};
export interface DieResult {
  value: number;
  sides: number | "F";
  kept: boolean;
  flags: string;
}
export interface DiceOutcome {
  total: number;
  output: string;
  dice: DieResult[];
  detail: unknown[];
}
export interface DiceRoll {
  id: string;
  campaign_id: string;
  actor_id: string;
  actor_name: string;
  notation: string;
  label: string;
  visibility: DiceVisibility;
  status: "pending" | "complete" | "failed";
  result: DiceOutcome | null;
  parent_id: string | null;
  check_id: string | null;
  revealed_at: string | null;
  created_at: string;
}
export interface DicePreset {
  id: string;
  campaign_id: string;
  owner_id: string;
  name: string;
  notation: string;
  visibility: DiceVisibility;
  shared: boolean;
}
export interface DiceCheck {
  id: string;
  campaign_id: string;
  title: string;
  notation: string;
  visibility: DiceVisibility;
  targets: Array<{ id: string; name: string }>;
  responses: Record<string, boolean>;
  open: boolean;
  created_at: string;
}
export interface DiceState {
  rolls: DiceRoll[];
  presets: DicePreset[];
  checks: DiceCheck[];
  hasMore: boolean;
}
export interface RollInput {
  requestId: string;
  notation: string;
  label: string;
  visibility: DiceVisibility;
  parentId?: string;
  checkId?: string;
}
