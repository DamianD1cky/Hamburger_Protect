import type { StoredSession } from "@nhost/nhost-js";
import { useEffect, useState } from "react";
import { nhost } from "../../../lib/nhost/client";

export function useNhostSession() {
  const [session, setSession] = useState<StoredSession | null>(
    () => nhost?.getUserSession() ?? null,
  );

  useEffect(() => {
    if (!nhost) return;
    setSession(nhost.getUserSession());
    return nhost.sessionStorage.onChange(setSession);
  }, []);

  return session;
}
