import type { Session } from "@supabase/supabase-js";
import type { AppSession } from "../domain/types";
import { requireSupabase, rpc } from "../../../lib/supabase/client";
interface Profile {
  id: string;
  display_name: string;
  disabled: boolean;
}
let current: AppSession | null = null;
let pending: { id: string; promise: Promise<AppSession> } | null = null;
export function getSupabaseAppSession() {
  return current;
}
export function clearSupabaseAppSession() {
  current = null;
  pending = null;
}
export async function prepareSupabaseSession(
  session: Session,
): Promise<AppSession> {
  if (current?.user.authUserId === session.user.id) return current;
  if (pending?.id === session.user.id) return pending.promise;
  const promise = (async () => {
    const client = requireSupabase();
    const { data: existing, error } = await client
      .from("profiles")
      .select("id,display_name,disabled")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    let profile = existing as Profile | null;
    if (!profile) profile = await rpc<Profile>("ensure_actor");
    if (!profile || profile.disabled)
      throw new Error("账号已停用，请联系站长。");
    const next: AppSession = {
      user: {
        id: profile.id,
        authUserId: session.user.id,
        displayName: profile.display_name,
        isAnonymous: Boolean(session.user.is_anonymous),
        email: session.user.email,
        metadata: session.user.user_metadata,
      },
    };
    const { data: latest } = await client.auth.getSession();
    if (latest.session?.user.id !== session.user.id)
      throw new Error("会话已变更，请刷新。");
    current = next;
    return next;
  })();
  pending = { id: session.user.id, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
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
  try {
    await requireSupabase().auth.signOut();
  } catch {
    // Local state is cleared below regardless of the network result.
  }
  clearSupabaseAppSession();
}
