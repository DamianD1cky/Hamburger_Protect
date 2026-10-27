import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { query } from "./cloud.mjs";
const file = process.argv[2];
const credentialsPath = ".secrets.gm-migration.json";
try {
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  const admin = createClient(
    process.env.MIGRATION_SUPABASE_URL,
    process.env.MIGRATION_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const gm = snapshot.users.filter((u) => !u.is_anonymous && !u.disabled);
  const page = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (page.error) throw new Error("AUTH_LIST_FAILED");
  const targets = new Map(page.data.users.map((u) => [u.email, u]));
  let saved = [];
  try {
    saved = JSON.parse(await readFile(credentialsPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await query(
    "update private.runtime set migration_until=now()+interval '14 days' where singleton;select 'identity_binding_window_open' result;",
  );
  let created = 0,
    linked = 0;
  try {
    for (const source of gm) {
      const existing = saved.find((x) => x.actorId === source.id);
      let target = targets.get(source.email);
      let password = existing?.initialPassword;
      if (!target) {
        password = randomBytes(24).toString("base64url");
        const result = await admin.auth.admin.createUser({
          email: source.email,
          password,
          email_confirm: true,
          user_metadata: {
            displayName: source.display_name,
            gmUsername: source.email.split("@")[0],
          },
        });
        if (result.error) throw new Error("GM_CREATE_FAILED");
        target = result.data.user;
        targets.set(source.email, target);
        created++;
      }
      if (!existing) {
        saved.push({
          actorId: source.id,
          authUserId: target.id,
          accountName: source.email,
          status:
            snapshot.tables.gm_access.find((g) => g.user_id === source.id)
              ?.status ?? "pending",
          initialPassword: password ?? null,
        });
        await writeFile(
          credentialsPath,
          JSON.stringify(saved, null, 2) + "\n",
          { mode: 0o600 },
        );
      } else if (existing.authUserId !== target.id)
        throw new Error("TARGET_ACCOUNT_CONFLICT");
      const binding = await admin.rpc("complete_identity_migration", {
        p_actor_id: source.id,
        p_auth_user_id: target.id,
      });
      if (binding.error) throw new Error("GM_BIND_FAILED");
      linked++;
    }
  } finally {
    await query(
      "update private.runtime set migration_until=null where singleton;select 'identity_binding_window_closed' result;",
    );
  }
  console.log(
    JSON.stringify({
      gmAccountsReserved: gm.length,
      created,
      linked,
      initialPasswordsStoredPrivately: credentialsPath,
      approvalsUnchanged: true,
    }),
  );
} catch (e) {
  console.error("GM reservation failed: " + e.message);
  process.exitCode = 1;
}
