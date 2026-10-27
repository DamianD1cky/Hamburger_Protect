import { isNhostConfigured } from "./nhost/client";
import { isSupabaseConfigured } from "./supabase/client";
export type Backend = "local" | "nhost" | "supabase";
const configured = import.meta.env.VITE_BACKEND?.trim();
export const backend: Backend =
  configured === "local" || configured === "nhost" || configured === "supabase"
    ? configured
    : isSupabaseConfigured
      ? "supabase"
      : isNhostConfigured
        ? "nhost"
        : "local";
export const backendError =
  configured && !["local", "nhost", "supabase"].includes(configured)
    ? "后端配置无效，请联系站长。"
    : backend === "supabase" && !isSupabaseConfigured
      ? "Supabase 尚未配置，请联系站长。"
      : backend === "nhost" && !isNhostConfigured
        ? "Nhost 尚未配置，请联系站长。"
        : !configured && import.meta.env.PROD && backend === "local"
          ? "线上后端尚未配置，请联系站长。"
          : "";
