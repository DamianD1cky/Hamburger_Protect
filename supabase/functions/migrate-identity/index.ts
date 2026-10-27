import { createMigrationHandler } from "./handler.ts";
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
};
const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
const nhostGraphqlUrl = env("NHOST_GRAPHQL_URL").replace(/\/$/, "");
for (const value of [supabaseUrl, nhostGraphqlUrl]) {
  const url = new URL(value);
  const local =
    ["localhost", "127.0.0.1", "kong"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("HTTPS configuration required outside local development");
  }
}
Deno.serve(
  createMigrationHandler({
    supabaseUrl,
    nhostGraphqlUrl,
    publicKey: env("MIGRATION_PUBLISHABLE_KEY"),
    secretKey: env("MIGRATION_SECRET_KEY"),
    endsAt: env("MIGRATION_ENDS_AT"),
    allowedOrigins: env("MIGRATION_ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }),
);
