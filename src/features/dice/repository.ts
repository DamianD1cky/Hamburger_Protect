import { backend } from "../../lib/backend";
import { requireSupabase, rpc } from "../../lib/supabase/client";
import type { CampaignBoard } from "../campaign/domain/types";
import { evaluateDice, validateDiceNotation } from "./engine";
import { diceInvocationError, DiceRequestRejected } from "./invocationError";
import type { DiceCheck, DicePreset, DiceRoll, DiceState, DiceVisibility, RollInput } from "./types";

const storageKey = (campaign: string) => `hp-dice:${campaign}`;
function localState(board: CampaignBoard): DiceState {
  const saved = localStorage.getItem(storageKey(board.campaign.id));
  return saved ? JSON.parse(saved) : { rolls: [], presets: [], checks: [], hasMore: false };
}
function saveLocal(board: CampaignBoard, data: DiceState) {
  localStorage.setItem(storageKey(board.campaign.id), JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("hp-dice-update"));
}
const localVisible = (board: CampaignBoard, roll: DiceRoll) =>
  roll.visibility === "public" || roll.revealed_at ||
  (roll.visibility === "self" && roll.actor_id === board.viewer.id) ||
  (roll.visibility === "gm" && (board.viewer.role === "gm" || roll.actor_id === board.viewer.id)) ||
  (roll.visibility === "blind" && board.viewer.role === "gm");

export async function getDiceState(board: CampaignBoard, before?: string): Promise<DiceState> {
  if (backend === "supabase") return rpc("get_dice_state", {
    p_campaign_id: board.campaign.id, p_before: before ?? null,
  });
  const data = localState(board);
  return {
    ...data,
    rolls: data.rolls.filter((roll) =>
      (!before || roll.created_at < before) && (roll.actor_id === board.viewer.id || localVisible(board, roll)))
      .map((roll) => localVisible(board, roll) ? roll : { ...roll, result: null }),
    presets: data.presets.filter((preset) => preset.shared || preset.owner_id === board.viewer.id),
  };
}

export async function rollDice(board: CampaignBoard, input: RollInput): Promise<DiceRoll> {
  let notation: string;
  try { notation = validateDiceNotation(input.notation); }
  catch (error) { throw new DiceRequestRejected(error instanceof Error ? error.message : "骰子公式不合法。"); }
  if (backend === "supabase") {
    const { data, error, response } = await requireSupabase().functions.invoke("roll-dice", {
      body: { ...input, notation, campaignId: board.campaign.id },
    });
    if (error) {
      const message = await diceInvocationError(error, response);
      const http = response ?? (error.context instanceof Response ? error.context : undefined);
      if (http?.status === 400 || http?.status === 413) throw new DiceRequestRejected(message);
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data as DiceRoll;
  }
  const state = localState(board);
  const existing = state.rolls.find((roll) =>
    roll.id === input.requestId || (input.checkId && roll.check_id === input.checkId && roll.actor_id === board.viewer.id));
  if (existing) return localVisible(board, existing) ? existing : { ...existing, result: null };
  const engine = await import("@dice-roller/rpg-dice-roller");
  let outcome;
  try { outcome = evaluateDice(notation, engine); }
  catch (error) { throw new DiceRequestRejected(error instanceof Error ? error.message : "骰子公式无法计算。"); }
  const roll: DiceRoll = {
    id: input.requestId, campaign_id: board.campaign.id,
    actor_id: board.viewer.id, actor_name: board.viewer.displayName,
    notation, label: input.label, visibility: input.visibility, status: "complete",
    result: outcome, parent_id: input.parentId ?? null,
    check_id: input.checkId ?? null, revealed_at: null, created_at: new Date().toISOString(),
  };
  state.rolls.unshift(roll);
  if (input.checkId) {
    const check = state.checks.find((item) => item.id === input.checkId);
    if (check) check.responses[board.viewer.id] = true;
  }
  saveLocal(board, state);
  return localVisible(board, roll) ? roll : { ...roll, result: null };
}

export async function revealDice(board: CampaignBoard, id: string) {
  if (backend === "supabase") return rpc("reveal_dice_roll", { p_id: id });
  const state = localState(board);
  const roll = state.rolls.find((item) => item.id === id);
  if (roll) roll.revealed_at = new Date().toISOString();
  saveLocal(board, state);
}

export async function saveDicePreset(board: CampaignBoard, name: string, notation: string, visibility: DiceVisibility, shared: boolean) {
  validateDiceNotation(notation);
  if (backend === "local") (await import("@dice-roller/rpg-dice-roller")).Parser.parse(notation);
  if (backend === "supabase") return rpc("save_dice_preset", {
    p_campaign_id: board.campaign.id, p_name: name.trim(),
    p_notation: notation, p_visibility: visibility, p_shared: shared,
  });
  const state = localState(board);
  const existing = state.presets.find((item) => item.owner_id === board.viewer.id && item.name === name.trim());
  const preset: DicePreset = {
    id: existing?.id ?? crypto.randomUUID(), campaign_id: board.campaign.id,
    owner_id: board.viewer.id, name: name.trim(), notation, visibility, shared,
  };
  state.presets = [...state.presets.filter((item) => item.id !== preset.id), preset];
  saveLocal(board, state);
}
export async function deleteDicePreset(board: CampaignBoard, id: string) {
  if (backend === "supabase") return rpc("delete_dice_preset", { p_id: id });
  const state = localState(board);
  state.presets = state.presets.filter((item) => item.id !== id);
  saveLocal(board, state);
}
export async function createDiceCheck(board: CampaignBoard, title: string, notation: string, visibility: DiceVisibility, targets: string[]) {
  validateDiceNotation(notation);
  if (backend === "local") (await import("@dice-roller/rpg-dice-roller")).Parser.parse(notation);
  if (backend === "supabase") return rpc("create_dice_check", {
    p_campaign_id: board.campaign.id, p_title: title,
    p_notation: notation, p_visibility: visibility, p_targets: targets,
  });
  const state = localState(board);
  const check: DiceCheck = {
    id: crypto.randomUUID(), campaign_id: board.campaign.id, title, notation, visibility,
    targets: board.members.filter((m) => targets.includes(m.userId)).map((m) => ({ id: m.userId, name: m.characterName })),
    responses: {}, open: true, created_at: new Date().toISOString(),
  };
  state.checks.unshift(check);
  saveLocal(board, state);
}
export async function closeDiceCheck(board: CampaignBoard, id: string) {
  if (backend === "supabase") return rpc("close_dice_check", { p_id: id });
  const state = localState(board);
  const check = state.checks.find((item) => item.id === id);
  if (check) check.open = false;
  saveLocal(board, state);
}
