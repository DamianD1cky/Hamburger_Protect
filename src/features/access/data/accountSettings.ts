import { createClient } from "@supabase/supabase-js";
import { requireSupabase, rpc } from "../../../lib/supabase/client";
import {
  clearSupabaseAppSession,
  requireSupabaseSession,
} from "./supabaseSession";
import { validateDisplayName, validateNewPassword } from "../domain/account";

export async function updateAccountName(displayName: string) {
  await rpc("update_account_profile", {
    p_display_name: validateDisplayName(displayName),
  });
  clearSupabaseAppSession();
}

export async function changePassword(
  currentPassword: string,
  password: string,
  confirmation: string,
) {
  validateNewPassword(password, confirmation);
  if (!currentPassword) throw new Error("INVALID_CURRENT_PASSWORD");
  if (currentPassword === password) throw new Error("SAME_PASSWORD");
  const session = await requireSupabaseSession();
  if (!session.user.email) throw new Error("AUTH_REQUIRED");
  const original = await requireSupabase().auth.getSession();
  if (original.error) throw original.error;
  const originalAuth = original.data.session;
  if (originalAuth?.user.id !== session.user.authUserId)
    throw new Error("SESSION_CHANGED");
  // Verify the old password using a transient SDK client. It cannot overwrite
  // the signed-in browser session or emit sign-in events in other tabs.
  const verifier = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storageKey: `hp-password-verification:${session.user.authUserId}`,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  try {
    const { data, error } = await verifier.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (error) {
      if (error.code === "invalid_credentials")
        throw new Error("INVALID_CURRENT_PASSWORD");
      throw error;
    }
    if (data.user?.id !== session.user.authUserId)
      throw new Error("SESSION_CHANGED");
  } finally {
    // Close the proof session before binding the original session below.
    const { error } = await verifier.auth.signOut({ scope: "local" });
    if (error) throw error;
  }
  const latest = await requireSupabaseSession();
  if (latest.user.id !== session.user.id) throw new Error("SESSION_CHANGED");
  // Bind this request to the original session, not a global SDK instance
  // which could switch accounts in another tab while the request is pending.
  const bound = await verifier.auth.setSession({
    access_token: originalAuth.access_token,
    refresh_token: originalAuth.refresh_token,
  });
  if (bound.error) throw bound.error;
  if (bound.data.user?.id !== session.user.authUserId)
    throw new Error("SESSION_CHANGED");
  const result = await verifier.auth.updateUser({
    current_password: currentPassword,
    password,
  });
  if (result.error) throw result.error;
  // The transient client has no persistent storage, timer or broadcast channel.
  // Do not sign it out again: it now holds the original browser's session.
  clearSupabaseAppSession();
}

export async function signOutOtherDevices() {
  const { error } = await requireSupabase().auth.signOut({ scope: "others" });
  if (error) throw error;
}
