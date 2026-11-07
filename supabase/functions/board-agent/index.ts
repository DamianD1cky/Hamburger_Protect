import { createAgentHandler } from "./handler.ts";

const modelUrl = Deno.env.get("HARNESS_MODEL_URL") ?? "";
if (modelUrl && new URL(modelUrl).protocol !== "https:") throw new Error("Model URL must use HTTPS");
Deno.serve(createAgentHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  publicKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  modelUrl,
  modelKey: Deno.env.get("HARNESS_MODEL_KEY") ?? "",
  model: Deno.env.get("HARNESS_MODEL") ?? "",
  origins: (Deno.env.get("HARNESS_ALLOWED_ORIGINS") ?? "capacitor://localhost,https://localhost")
    .split(",").map(value => value.trim()).filter(Boolean),
}));
