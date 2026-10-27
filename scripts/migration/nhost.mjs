import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const authBase = "https://otsispdzcwxyqzbfntmj.auth.eu-central-1.nhost.run/v1";
const endpoint =
  "https://otsispdzcwxyqzbfntmj.graphql.eu-central-1.nhost.run/v1";
export async function managementQuery(query, variables) {
  const path = join(homedir(), ".nhost/state/auth.json");
  const credentials = JSON.parse(await readFile(path, "utf8"));
  if (!credentials.oauth2RefreshToken)
    throw new Error("NHOST_CLI_AUTH_REQUIRED");
  const discoveryResponse = await fetch(
    authBase + "/.well-known/oauth-authorization-server",
    { signal: AbortSignal.timeout(10000) },
  );
  if (!discoveryResponse.ok) throw new Error("NHOST_DISCOVERY_FAILED");
  const discovery = await discoveryResponse.json();
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.oauth2RefreshToken,
      client_id: "NhostCLI",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("NHOST_TOKEN_REFRESH_FAILED");
  const tokens = await response.json();
  if (
    tokens.refresh_token &&
    tokens.refresh_token !== credentials.oauth2RefreshToken
  )
    await writeFile(
      path,
      JSON.stringify({
        ...credentials,
        oauth2RefreshToken: tokens.refresh_token,
      }),
      { mode: 0o600 },
    );
  const remote = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + tokens.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await remote.json();
  if (!remote.ok || body.errors?.length)
    throw new Error("NHOST_MANAGEMENT_QUERY_FAILED");
  return body.data;
}
export async function setLegacyRegistration(closed) {
  const project = JSON.parse(await readFile(".nhost/project.json", "utf8"));
  const backup = ".secrets.nhost-auth-before-cutover.json";
  let previous;
  if (closed) {
    const data = await managementQuery(
      "query($id:uuid!){app(id:$id){auth:config(resolve:false){auth{signUp{enabled} method{anonymous{enabled}}}}}}",
      { id: project.id },
    );
    previous = data.app.auth.auth;
    try {
      await writeFile(backup, JSON.stringify(previous, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  } else {
    previous = JSON.parse(await readFile(backup, "utf8"));
  }
  const desired = closed
    ? { signUp: { enabled: false }, method: { anonymous: { enabled: false } } }
    : previous;
  const result = await managementQuery(
    "mutation($id:uuid!,$config:ConfigConfigUpdateInput!){updateConfig(appID:$id,config:$config){auth{signUp{enabled} method{anonymous{enabled}}}}}",
    { id: project.id, config: { auth: desired } },
  );
  console.log(
    JSON.stringify({
      legacyRegistration: result.updateConfig.auth.signUp.enabled,
      legacyAnonymousCreation:
        result.updateConfig.auth.method.anonymous.enabled,
    }),
  );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file://").href
) {
  try {
    if (process.argv[2] === "close-registration")
      await setLegacyRegistration(true);
    else if (process.argv[2] === "restore-registration")
      await setLegacyRegistration(false);
    else throw new Error("UNKNOWN_COMMAND");
  } catch (e) {
    console.error("Nhost operation failed: " + e.message);
    process.exitCode = 1;
  }
}
