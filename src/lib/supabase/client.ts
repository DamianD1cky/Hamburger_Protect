import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const isSupabaseConfigured = Boolean(url && key);
const storageKey = url ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token` : "";
export const supabase = url && key
  ? createClient(url, key, { auth: { storageKey } })
  : null;

export function clearLocalAuthStorage() {
  if (!storageKey) return;
  for (const suffix of ["", "-code-verifier", "-user"]) {
    window.localStorage.removeItem(storageKey + suffix);
  }
}
export function requireSupabase() {
  if (!supabase) throw new Error("Supabase 尚未配置");
  return supabase;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
