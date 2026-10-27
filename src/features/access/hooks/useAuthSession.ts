import { useEffect, useState } from "react";
import { backend } from "../../../lib/backend";
import type { StoredSession } from "@nhost/nhost-js";
import { nhost } from "../../../lib/nhost/client";
import { supabase } from "../../../lib/supabase/client";
import type { AppSession } from "../domain/types";
import {
  clearSupabaseAppSession,
  getSupabaseAppSession,
  prepareSupabaseSession,
  restoreLegacyPlayer,
} from "../data/supabaseSession";
function fromLegacy(session: StoredSession | null): AppSession | null {
  return session?.user ? { user: session.user } : null;
}
export function useAuthSession() {
  const [state, setState] = useState<{
    session: AppSession | null;
    loading: boolean;
    error: string;
  }>({
    session:
      backend === "nhost"
        ? fromLegacy(nhost?.getUserSession() ?? null)
        : getSupabaseAppSession(),
    loading: backend === "supabase",
    error: "",
  });
  useEffect(() => {
    if (backend === "nhost")
      return nhost?.sessionStorage.onChange((session) =>
        setState({ session: fromLegacy(session), loading: false, error: "" }),
      );
    if (backend !== "supabase" || !supabase) return;
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
    void restoreLegacyPlayer()
      .then(load)
      .catch((error) => {
        if (!disposed)
          setState({
            session: null,
            loading: false,
            error: error instanceof Error ? error.message : "旧身份恢复失败",
          });
      });
    return () => {
      disposed = true;
      version++;
      subscription.unsubscribe();
    };
  }, []);
  return state;
}
