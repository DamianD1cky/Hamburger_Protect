import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { query } from "./cloud.mjs";
import { runSourceSQL } from "./nhost.mjs";

const bcrypt = /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;
const credentialsPath = ".secrets.gm-migration.json";
const requestedEmail = process.argv[2]?.toLowerCase();

try {
  const local = JSON.parse(await readFile(credentialsPath, "utf8"));
  const localByEmail = new Map(
    local.map((record) => [record.accountName.toLowerCase(), record]),
  );
  const sourceUsers = await runSourceSQL(
    `select lower(email) email, display_name, password_hash
     from auth.users
     where not is_anonymous and not disabled
     order by lower(email)`,
  );
  const withPassword = sourceUsers.filter((user) => {
    if (!user.password_hash || user.password_hash === "NULL") return false;
    if (requestedEmail) return user.email === requestedEmail;
    return !localByEmail.get(user.email)?.passwordHashMigratedAt;
  });
  if (!withPassword.length) throw new Error("SOURCE_PASSWORD_HASH_MISSING");
  if (withPassword.some((user) => !bcrypt.test(user.password_hash))) {
    throw new Error("UNSUPPORTED_PASSWORD_HASH");
  }

  const admin = createClient(
    process.env.MIGRATION_SUPABASE_URL,
    process.env.MIGRATION_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error("TARGET_AUTH_LIST_FAILED");
  const targets = new Map(
    listed.data.users.map((user) => [user.email?.toLowerCase(), user]),
  );

  let recreated = 0;
  for (const source of withPassword) {
    const record = localByEmail.get(source.email);
    if (!record) throw new Error("LOCAL_IDENTITY_MAPPING_MISSING");
    const existing = targets.get(source.email);
    const targetId = existing?.id ?? record.authUserId;
    if (targetId !== record.authUserId) {
      throw new Error("TARGET_ACCOUNT_CONFLICT");
    }
    const userMetadata = existing?.user_metadata ?? {
      displayName: source.display_name,
      gmUsername: source.email.split("@")[0],
    };
    const appMetadata = existing?.app_metadata;

    if (existing) {
      const removed = await admin.auth.admin.deleteUser(existing.id);
      if (removed.error) throw new Error("TARGET_AUTH_DELETE_FAILED");
    }
    const created = await admin.auth.admin.createUser({
      id: targetId,
      email: source.email,
      password_hash: source.password_hash,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (created.error) throw new Error("TARGET_AUTH_RECREATE_FAILED");
    const binding = await admin.rpc("complete_identity_migration", {
      p_actor_id: record.actorId,
      p_auth_user_id: targetId,
    });
    if (binding.error) throw new Error("TARGET_IDENTITY_REBIND_FAILED");
    recreated++;
  }

  const targetHashes = await query(
    `select lower(email) email, encrypted_password password_hash
     from auth.users
     where lower(email) = any(array[${withPassword.map((user) => `'${user.email.replaceAll("'", "''")}'`).join(",")}])
     order by lower(email);`,
  );
  const verified = new Map(
    targetHashes.map((row) => [row.email, row.password_hash]),
  );
  if (
    withPassword.some(
      (source) => verified.get(source.email) !== source.password_hash,
    )
  ) {
    throw new Error("TARGET_PASSWORD_HASH_VERIFY_FAILED");
  }

  const migratedEmails = new Set(withPassword.map((user) => user.email));
  const migratedAt = new Date().toISOString();
  for (const record of local) {
    if (migratedEmails.has(record.accountName.toLowerCase())) {
      record.initialPassword = null;
      record.passwordHashMigratedAt = migratedAt;
    }
  }
  await writeFile(credentialsPath, JSON.stringify(local, null, 2) + "\n", {
    mode: 0o600,
  });

  console.log(
    JSON.stringify({
      accountsRecreated: recreated,
      requestedEmail: requestedEmail ?? null,
      dickyPasswordRestored: migratedEmails.has("dicky@gm.local"),
      hashesVerified: true,
      authIdsPreserved: true,
      approvalsChanged: false,
    }),
  );
} catch (error) {
  console.error("GM password migration failed: " + error.message);
  process.exitCode = 1;
}
