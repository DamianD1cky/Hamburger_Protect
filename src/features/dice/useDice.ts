import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "../../lib/backend";
import { requireSupabase } from "../../lib/supabase/client";
import type { CampaignBoard } from "../campaign/domain/types";
import { getDiceState, rollDice } from "./repository";
import type { DiceRoll, DiceState, RollInput } from "./types";

export function useDice(board: CampaignBoard, onResult: (roll: DiceRoll) => void) {
  const cache = useQueryClient();
  const key = ["dice", board.campaign.id, board.viewer.id, board.viewer.role] as const;
  const [connected, setConnected] = useState(backend === "local");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const generation = useRef(0);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getDiceState(board),
    // Reconnect/backfill is authoritative; a slow fallback covers websocket
    // outages without binding dice to the board's position cache.
    refetchInterval: connected ? 30_000 : 5_000,
    refetchIntervalInBackground: false, staleTime: 3_000, retry: 1,
  });
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (!query.data) return;
    const complete = query.data.rolls.filter((roll) => roll.status === "complete" && roll.result);
    const fresh = complete.filter((roll) => !seen.current.has(roll.id));
    complete.forEach((roll) => seen.current.add(roll.id));
    if (initialized.current && fresh.length) onResultRef.current(fresh[0]);
    initialized.current = true;
  }, [query.data]);
  useEffect(() => {
    const ownKey = ["dice", board.campaign.id, board.viewer.id, board.viewer.role] as const;
    if (backend === "local") {
      const refresh = () => void cache.invalidateQueries({ queryKey: keyRef.current });
      window.addEventListener("hp-dice-update", refresh);
      window.addEventListener("storage", refresh);
      return () => {
        window.removeEventListener("hp-dice-update", refresh);
        window.removeEventListener("storage", refresh);
      };
    }
    let active = true;
    const client = requireSupabase();
    const channel = client.channel(`dice:${board.campaign.id}:${board.viewer.id}`)
      .on("system", {}, (event) => {
        if (!active || event.extension !== "postgres_changes") return;
        setConnected(event.status === "ok");
        if (event.status === "ok") void cache.invalidateQueries({ queryKey: ownKey });
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "dice_rolls",
        filter: `campaign_id=eq.${board.campaign.id}`,
      }, () => void cache.invalidateQueries({ queryKey: keyRef.current }))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "dice_rolls",
        filter: `campaign_id=eq.${board.campaign.id}`,
      }, (event) => {
        if (!active) return;
        const roll = event.new as DiceRoll;
        if (roll.status !== "complete" || !roll.result || seen.current.has(roll.id)) return;
        seen.current.add(roll.id);
        onResultRef.current(roll);
        void cache.invalidateQueries({ queryKey: keyRef.current });
      });
    for (const table of ["dice_checks", "dice_presets"]) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table,
        filter: `campaign_id=eq.${board.campaign.id}`,
      }, () => void cache.invalidateQueries({ queryKey: keyRef.current }));
    }
    channel.subscribe((status) => {
      if (!active) return;
      if (status !== "SUBSCRIBED") setConnected(false);
    });
    return () => {
      active = false;
      generation.current++;
      seen.current.clear();
      initialized.current = false;
      void client.removeChannel(channel);
      // Sensitive per-user roll caches are discarded on room/account exit.
      cache.removeQueries({ queryKey: ownKey });
    };
  }, [board.campaign.id, board.viewer.id, board.viewer.role, cache]);

  const roll = async (input: RollInput) => {
    const ownGeneration = generation.current;
    const saved = await rollDice(board, input);
    if (ownGeneration !== generation.current) throw new Error("已退出当前战役。");
    const notified = seen.current.has(saved.id);
    seen.current.add(saved.id);
    await cache.cancelQueries({ queryKey: key });
    if (ownGeneration !== generation.current) throw new Error("已退出当前战役。");
    cache.setQueryData<DiceState>(key, (current) => current ? {
      ...current, rolls: [saved, ...current.rolls.filter((r) => r.id !== saved.id)],
    } : { rolls: [saved], presets: [], checks: [], hasMore: false });
    if (!notified) onResultRef.current(saved);
    void cache.invalidateQueries({ queryKey: key });
    return saved;
  };
  return { ...query, roll, connected };
}
