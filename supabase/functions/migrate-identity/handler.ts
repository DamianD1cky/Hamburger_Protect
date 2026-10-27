export type MigrationConfig = {
  supabaseUrl: string;
  publicKey: string;
  secretKey: string;
  nhostGraphqlUrl: string;
  allowedOrigins: string[];
  endsAt: string;
};
export function createMigrationHandler(
  config: MigrationConfig,
  request: typeof fetch = fetch,
) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const allowed = !origin || config.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] =
      "authorization,apikey,content-type,x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST,OPTIONS";
    const response = (status: number, error: string) =>
      new Response(JSON.stringify({ error }), { status, headers });
    if (!allowed) return response(403, "ORIGIN_DENIED");
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return response(405, "METHOD_NOT_ALLOWED");
    if (
      !Number.isFinite(Date.parse(config.endsAt)) ||
      Date.parse(config.endsAt) <= Date.now()
    )
      return response(410, "MIGRATION_CLOSED");
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return response(401, "AUTH_REQUIRED");
    try {
      // The target Auth server verifies the JWT; no user IDs or verification URLs come from the body.
      const targetResponse = await request(
        `${config.supabaseUrl}/auth/v1/user`,
        {
          headers: { apikey: config.publicKey, Authorization: authorization },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!targetResponse.ok) return response(401, "TARGET_SESSION_INVALID");
      const target = (await targetResponse.json()) as {
        id?: string;
        is_anonymous?: boolean;
      };
      if (!target.id || !target.is_anonymous)
        return response(403, "PLAYER_ACCOUNT_REQUIRED");
      const rpc = async (name: string, body: Record<string, unknown>) =>
        request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: config.secretKey,
            ...(config.secretKey.startsWith("eyJ")
              ? { Authorization: `Bearer ${config.secretKey}` }
              : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
      const limited = await rpc("consume_identity_attempt", {
        p_auth_user_id: target.id,
      });
      if (!limited.ok) return response(429, "MIGRATION_RATE_LIMIT");
      // Stream with a byte limit; token bodies are never included in logs or errors.
      const reader = req.body?.getReader();
      if (!reader) return response(400, "INVALID_REQUEST");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 12000) {
          await reader.cancel();
          return response(413, "REQUEST_TOO_LARGE");
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const body = JSON.parse(new TextDecoder().decode(bytes)) as {
        legacyAccessToken?: unknown;
      };
      if (
        typeof body.legacyAccessToken !== "string" ||
        !body.legacyAccessToken ||
        body.legacyAccessToken.length > 10000
      )
        return response(400, "INVALID_REQUEST");
      // Nhost /user forbids anonymous users. Hasura validates the JWT signature,
      // expiry and allowed role before executing this read-only authentication probe.
      const legacyResponse = await request(config.nhostGraphqlUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${body.legacyAccessToken}`,
          "x-hasura-role": "anonymous",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "query VerifyMigrationSession { __typename }",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!legacyResponse.ok) return response(401, "LEGACY_SESSION_INVALID");
      const verification = (await legacyResponse.json()) as {
        data?: { __typename?: string };
        errors?: unknown[];
      };
      if (
        verification.errors?.length ||
        verification.data?.__typename !== "query_root"
      ) {
        return response(401, "LEGACY_SESSION_INVALID");
      }
      // Decode claims only after the source Hasura server has authenticated the token.
      const encoded = body.legacyAccessToken.split(".")[1];
      if (!encoded) return response(401, "LEGACY_SESSION_INVALID");
      const decoded = JSON.parse(
        atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
      ) as Record<string, unknown>;
      const claims = decoded["https://hasura.io/jwt/claims"] as
        Record<string, unknown> | undefined;
      const actorId = claims?.["x-hasura-user-id"];
      const roles = claims?.["x-hasura-allowed-roles"];
      if (
        typeof actorId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actorId) ||
        !Array.isArray(roles) ||
        !roles.includes("anonymous")
      ) {
        return response(403, "LEGACY_IDENTITY_INVALID");
      }
      const result = await rpc("complete_identity_migration", {
        p_actor_id: actorId,
        p_auth_user_id: target.id,
      });
      if (!result.ok) return response(409, "IDENTITY_LINK_FAILED");
      return new Response(JSON.stringify({ actorId }), {
        status: 200,
        headers,
      });
    } catch {
      return response(502, "MIGRATION_FAILED");
    }
  };
}
