/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: "local" | "supabase";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GM_ACCOUNT_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
