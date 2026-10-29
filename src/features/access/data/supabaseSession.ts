import type { Session } from "@supabase/supabase-js";
import type { AppSession } from "../domain/types";
import { requireSupabase, rpc } from "../../../lib/supabase/client";
import { nhost } from "../../../lib/nhost/client";
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
    const storedLegacy = nhost?.getUserSession();
    if (!profile && storedLegacy && nhost) {
      if (storedLegacy.user?.isAnonymous) {
        // A legacy anonymous player is migrated onto this session — but
        // only onto an anonymous one, never onto a GM account.
        if (!session.user.is_anonymous)
          throw new Error("请先恢复旧玩家身份，或联系站长处理账号关联。");
        const legacy = await nhost.refreshSession(0);
        if (!legacy) throw new Error("旧身份已失效，请联系站长恢复角色。");
        const result = await client.functions.invoke("migrate-identity", {
          body: { legacyAccessToken: legacy.accessToken },
        });
        if (result.error)
          throw new Error("旧角色恢复失败，请重试或联系站长；不要重新创建角色。");
      } else if (!session.user.is_anonymous) {
        // A legacy GM identity cannot be auto-bound, and that only matters
        // for GM sign-ins. It must never block a fresh anonymous employee
        // or visitor session that merely shares the same browser: those
        // fall through and get their own actor from ensure_actor below.
        throw new Error("旧 GM 账号需要站长绑定，请使用迁移后的 GM 账号登录。");
      }
    }
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
 * Escape hatch for a browser stuck on an unusable identity (e.g. a stale
 * legacy GM session): drops every local session so the sign-in page can
 * start over. Server-side accounts and characters are not deleted.
 */
export async function clearStuckIdentities() {
  try {
    await requireSupabase().auth.signOut();
  } catch {
    // Local state is cleared below regardless of the network result.
  }
  try {
    nhost?.clearSession();
  } catch {
    // No legacy session to clear.
  }
  clearSupabaseAppSession();
}
export async function restoreLegacyPlayer() {
  if (!nhost?.getUserSession()?.user?.isAnonymous) return;
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) {
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
  }
}
