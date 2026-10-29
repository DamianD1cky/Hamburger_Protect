import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase/client";
import type { AppSession } from "../domain/types";
import {
  clearSupabaseAppSession,
  getSupabaseAppSession,
  prepareSupabaseSession,
} from "../data/supabaseSession";
export function useAuthSession() {
  const [state, setState] = useState<{
    session: AppSession | null;
    loading: boolean;
    error: string;
  }>({
    session: getSupabaseAppSession(),
    loading: true,
    error: "",
  });
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let disposed = false;
    let version = 0;
    async function load() {
      const ticket = ++version;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data.session
          ? await prepareSupabaseSession(data.session)
          : null;
        if (!session) clearSupabaseAppSession();
        if (!disposed && ticket === version)
          setState({ session, loading: false, error: "" });
      } catch (error) {
        if (!disposed && ticket === version)
          setState({
            session: null,
            loading: false,
            error: error instanceof Error ? error.message : "身份恢复失败",
          });
      }
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      const previous = getSupabaseAppSession();
      if (!next || (previous && previous.user.authUserId !== next.user.id)) {
        clearSupabaseAppSession();
        if (!disposed) setState({ session: null, loading: true, error: "" });
      }
      queueMicrotask(() => {
        if (!disposed) void load();
      });
    });
    void load();
    return () => {
      disposed = true;
      version++;
      subscription.unsubscribe();
    };
  }, []);
  return state;
}
