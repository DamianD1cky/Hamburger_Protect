import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "../../lib/backend";
import { requireSupabase, rpc } from "../../lib/supabase/client";
import type { CampaignBoard } from "../campaign/domain/types";
import { getDiceState } from "./repository";

export const diceEmotions = ["👏", "🔥", "😂", "😱", "🍀", "💪"] as const;
export interface DiceSocial {
  rolling: string[];
  reactions: { actor_id: string; emoji: string; sent_at: string }[];
}
const localKey = (id: string) => `hp-dice-reactions:${id}`;
export function useDiceSocial(board: CampaignBoard, enabled: boolean) {
  const cache = useQueryClient();
  const key = ["dice-social", board.campaign.id, board.viewer.id] as const;
  const query = useQuery({
    queryKey: key, enabled, staleTime: 500, refetchInterval: enabled ? 1200 : false,
    refetchIntervalInBackground: false, retry: 1,
    queryFn: async (): Promise<DiceSocial> => {
      if (backend === "supabase") return rpc("get_dice_social", { p_campaign_id: board.campaign.id });
      const state = await getDiceState(board);
      const reactions = JSON.parse(localStorage.getItem(localKey(board.campaign.id)) ?? "[]") as DiceSocial["reactions"];
      return {
        rolling: [...new Set(state.rolls.filter((roll) => Date.now() - Date.parse(roll.created_at) < 6000).map((roll) => roll.actor_id))],
        reactions: reactions.filter((reaction) => Date.now() - Date.parse(reaction.sent_at) < 4000),
      };
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void cache.invalidateQueries({ queryKey: key }); };
    if (backend === "local") {
      window.addEventListener("storage", refresh);
      window.addEventListener("hp-dice-update", refresh);
      return () => {
        window.removeEventListener("storage", refresh); window.removeEventListener("hp-dice-update", refresh);
      };
    }
    const client = requireSupabase();
    const channel = client.channel(`dice-social:${board.campaign.id}:${board.viewer.id}`);
    for (const table of ["dice_rolls", "dice_reactions"]) channel.on("postgres_changes", {
      event: "*", schema: "public", table, filter: `campaign_id=eq.${board.campaign.id}`,
    }, refresh);
    channel.subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    return () => { void client.removeChannel(channel); cache.removeQueries({ queryKey: key }); };
  }, [enabled, board.campaign.id, board.viewer.id, cache]);
  const react = async (emoji: string) => {
    if (backend === "supabase") await rpc("send_dice_reaction", { p_campaign_id: board.campaign.id, p_emoji: emoji });
    else {
      const existing = JSON.parse(localStorage.getItem(localKey(board.campaign.id)) ?? "[]") as DiceSocial["reactions"];
      localStorage.setItem(localKey(board.campaign.id), JSON.stringify([
        ...existing.filter((reaction) => reaction.actor_id !== board.viewer.id && Date.now() - Date.parse(reaction.sent_at) < 4000),
        { actor_id: board.viewer.id, emoji, sent_at: new Date().toISOString() },
      ]));
      window.dispatchEvent(new CustomEvent("hp-dice-update"));
    }
    await query.refetch();
  };
  return { ...query, react };
}
