import type { Session } from "@supabase/supabase-js";
import type { AppSession } from "../domain/types";
import { requireSupabase, rpc } from "../../../lib/supabase/client";
import { createSessionStore } from "../domain/sessionStore";
import { clearLocalAuthStorage } from "../../../lib/supabase/client";
interface Profile {
  id: string;
  display_name: string;
  disabled: boolean;
}
const store = createSessionStore<AppSession>();
export function getSupabaseAppSession() {
  return store.peek();
}
export function clearSupabaseAppSession() {
  store.clear();
}
export async function prepareSupabaseSession(session: Session): Promise<AppSession> {
  if (session.user.is_anonymous) {
    store.clear();
    throw new Error("ANONYMOUS_IDENTITY_DISABLED");
  }
  return store.load(`${session.user.id}:${session.access_token}`, async () => {
    // ensure_actor checks disabled status server-side, even when RLS hides
    // the profile. A deleted/banned profile cannot revive from cached data.
    const profile = await rpc<Profile>("ensure_actor");
    if (!profile?.id || profile.disabled) throw new Error("ACCOUNT_DISABLED");
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    if (data.session?.access_token !== session.access_token)
      throw new Error("SESSION_CHANGED");
    return {
      user: {
        id: profile.id,
        authUserId: session.user.id,
        displayName: profile.display_name,
        isAnonymous: false,
        email: session.user.email,
        metadata: session.user.user_metadata,
      },
    };
  });
}
export async function requireSupabaseSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("AUTH_REQUIRED");
  return prepareSupabaseSession(data.session);
}
/**
 * Escape hatch for a browser stuck on an unusable local session. Server-side
 * accounts and characters are not deleted.
 */
export async function clearStuckIdentities() {
  // This is explicitly a local recovery action. Do not wait for a failing
  // network, revoke other devices, or clear unrelated application storage.
  requireSupabase().auth.stopAutoRefresh();
  clearLocalAuthStorage();
  clearSupabaseAppSession();
}
