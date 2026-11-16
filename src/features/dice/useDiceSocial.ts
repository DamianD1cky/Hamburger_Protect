import { useEffect, useState } from "react";
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
interface SocialResponse extends DiceSocial {
  server_time: string;
  rolling_until: { actor_id: string; expires_at: string }[];
}
interface SocialSnapshot {
  rolling: { actor_id: string; expiresAt: number }[];
  reactions: (DiceSocial["reactions"][number] & { expiresAt: number })[];
}
const localKey = (id: string) => `hp-dice-reactions:${id}`;

export function useDiceSocial(board: CampaignBoard, enabled: boolean) {
  const cache = useQueryClient();
  const key = ["dice-social", board.campaign.id, board.viewer.id] as const;
  const [connected, setConnected] = useState(false);
  const [, expire] = useState(0);
  const query = useQuery({
    queryKey: key, enabled, staleTime: 3_000,
    refetchInterval: enabled && backend === "supabase" ? (connected ? 30_000 : 5_000) : false,
    refetchIntervalInBackground: false, retry: 1,
    queryFn: async (): Promise<SocialSnapshot> => {
      let data: SocialResponse;
      if (backend === "supabase") {
        data = await rpc("get_dice_social", { p_campaign_id: board.campaign.id });
      } else {
        const state = await getDiceState(board);
        data = {
          server_time: new Date().toISOString(), rolling: [],
          rolling_until: state.rolls.map((roll) => ({
            actor_id: roll.actor_id,
            expires_at: new Date(Date.parse(roll.created_at) + (roll.status === "pending" ? 20_000 : 6_000)).toISOString(),
          })),
          reactions: JSON.parse(localStorage.getItem(localKey(board.campaign.id)) ?? "[]"),
        };
      }
      const receivedAt = Date.now();
      const serverTime = Date.parse(data.server_time) || receivedAt;
      const offset = receivedAt - serverTime;
      // The old response remains readable during a rolling deployment.
      const rolling = data.rolling_until ?? data.rolling.map((actor_id) => ({
        actor_id, expires_at: new Date(serverTime + 6_000).toISOString(),
      }));
      return {
        rolling: rolling.map((item) => ({ actor_id: item.actor_id, expiresAt: Date.parse(item.expires_at) + offset })),
        reactions: data.reactions.map((item) => ({ ...item, expiresAt: Date.parse(item.sent_at) + 4_000 + offset })),
      };
    },
  });
  const now = Date.now();
  const data: DiceSocial | undefined = query.data && {
    rolling: [...new Set(query.data.rolling.filter((item) => item.expiresAt > now).map((item) => item.actor_id))],
    reactions: query.data.reactions.filter((item) => item.expiresAt > now),
  };
  const nextExpiry = query.data && Math.min(...[...query.data.rolling, ...query.data.reactions]
    .map((item) => item.expiresAt).filter((time) => time > now));
  useEffect(() => {
    if (!enabled || !nextExpiry || !Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => expire((tick) => tick + 1), Math.max(1, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [enabled, nextExpiry]);
  useEffect(() => {
    setConnected(false);
    if (!enabled) return;
    let active = true, timer: number | undefined;
    const refresh = () => {
      if (!active || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void cache.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
      }, 50);
    };
    const cleanup = () => {
      active = false; window.clearTimeout(timer);
      cache.removeQueries({ queryKey: key });
    };
    if (backend === "local") {
      window.addEventListener("storage", refresh);
      window.addEventListener("hp-dice-update", refresh);
      return () => {
        cleanup(); window.removeEventListener("storage", refresh); window.removeEventListener("hp-dice-update", refresh);
      };
    }
    const client = requireSupabase();
    const channel = client.channel(`dice-social:${board.campaign.id}:${board.viewer.id}`)
      .on("system", {}, (event) => {
        if (!active || event.extension !== "postgres_changes") return;
        setConnected(event.status === "ok");
        if (event.status === "ok") refresh();
      });
    for (const table of ["dice_rolls", "dice_reactions"]) channel.on("postgres_changes", {
      event: "*", schema: "public", table, filter: `campaign_id=eq.${board.campaign.id}`,
    }, refresh);
    channel.subscribe((status) => {
      if (!active) return;
      if (status !== "SUBSCRIBED") setConnected(false);
      else refresh();
    });
    return () => { cleanup(); void client.removeChannel(channel); };
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
    await cache.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
  };
  return { ...query, data, react };
}
