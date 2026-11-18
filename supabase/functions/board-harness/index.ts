import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.118.0/cors";
import {
  COMPOSE_BOARD_TOOL_SCHEMA,
  HARNESS_SYSTEM_PROMPT,
} from "../../../src/features/harness/eyes.ts";
import { diceAllowedOrigins, diceCorsHeaders } from "../roll-dice/cors.ts";
import {
  extractBlueprintFromModelJson,
  resolveHarnessCredentials,
} from "./gateway.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const allowedOrigins = diceAllowedOrigins(
  Deno.env.get("HARNESS_ALLOWED_ORIGINS") ?? Deno.env.get("DICE_ALLOWED_ORIGINS"),
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = diceCorsHeaders(origin, allowedOrigins, corsHeaders);
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  if (origin && !allowedOrigins.has(origin)) {
    return respond({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const bearer = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/i.test(bearer)) {
    return respond({ error: "AUTH_REQUIRED" }, 401);
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser(
    bearer.slice(7),
  );
  if (authError || !auth.user) {
    return respond({ error: "AUTH_REQUIRED" }, 401);
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 65_536) {
      return respond({ error: "HARNESS_INPUT_TOO_LARGE" }, 413);
    }
    const body = JSON.parse(rawBody) as {
      campaignId?: string;
      prompt?: string;
      boardContext?: unknown;
      history?: Array<{ role?: string; content?: string }>;
      byok?: {
        provider?: "openai_compat" | "anthropic";
        baseUrl?: string;
        apiKey?: string;
        model?: string;
      } | null;
    };

    if (
      !uuid.test(body.campaignId ?? "") ||
      typeof body.prompt !== "string" ||
      !body.prompt.trim() ||
      body.prompt.length > 4000
    ) {
      return respond({ error: "INVALID_HARNESS_INPUT" }, 400);
    }

    // Verify caller is an active GM of this active campaign under RLS
    const { data: boardData, error: boardError } = await supabase.rpc(
      "get_campaign_board",
      { p_campaign_id: body.campaignId },
    );
    if (boardError || !boardData) {
      return respond({ error: "CAMPAIGN_ACCESS_REQUIRED" }, 403);
    }
    const actorRes = await supabase.rpc("ensure_actor");
    const actorId = actorRes.data?.id;
    const isGm =
      boardData.status === "active" &&
      Array.isArray(boardData.members) &&
      boardData.members.some(
        (m: { user_id: string; role: string; active: boolean }) =>
          m.user_id === actorId && m.role === "gm" && m.active,
      );
    if (!isGm) {
      return respond({ error: "GM_REQUIRED" }, 403);
    }

    const creds = resolveHarnessCredentials(body.byok, {
      apiKey: Deno.env.get("HARNESS_API_KEY"),
      baseUrl: Deno.env.get("HARNESS_BASE_URL"),
      model: Deno.env.get("HARNESS_MODEL"),
      provider: Deno.env.get("HARNESS_PROVIDER"),
    });

    const historyMessages = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .filter(
            (m) =>
              (m?.role === "user" || m?.role === "assistant") &&
              typeof m.content === "string",
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: String(m.content).slice(0, 2000),
          }))
      : [];

    const userContent = `当前公告板状态快照（JSON）：\n${JSON.stringify(body.boardContext ?? {})}\n\nGM 编排需求：\n${body.prompt.trim()}`;

    const upstream =
      creds.provider === "anthropic"
        ? await fetch(`${creds.baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": creds.apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: creds.model,
              max_tokens: 4096,
              system: HARNESS_SYSTEM_PROMPT,
              messages: [
                ...historyMessages,
                { role: "user", content: userContent },
              ],
              tools: [
                {
                  name: COMPOSE_BOARD_TOOL_SCHEMA.name,
                  description: COMPOSE_BOARD_TOOL_SCHEMA.description,
                  input_schema: COMPOSE_BOARD_TOOL_SCHEMA.parameters,
                },
              ],
              tool_choice: {
                type: "tool",
                name: COMPOSE_BOARD_TOOL_SCHEMA.name,
              },
            }),
          })
        : await fetch(`${creds.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${creds.apiKey}`,
            },
            body: JSON.stringify({
              model: creds.model,
              temperature: 0.4,
              messages: [
                { role: "system", content: HARNESS_SYSTEM_PROMPT },
                ...historyMessages,
                { role: "user", content: userContent },
              ],
              tools: [
                {
                  type: "function",
                  function: COMPOSE_BOARD_TOOL_SCHEMA,
                },
              ],
              tool_choice: {
                type: "function",
                function: { name: COMPOSE_BOARD_TOOL_SCHEMA.name },
              },
            }),
          });

    if (!upstream.ok) {
      return respond(
        { error: `UPSTREAM_MODEL_ERROR_${upstream.status}` },
        502,
      );
    }

    const upstreamJson = await upstream.json();
    const blueprint = extractBlueprintFromModelJson(
      creds.provider,
      upstreamJson,
    );
    return respond({ blueprint });
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "INVALID_HARNESS_INPUT";
    const status = code === "HARNESS_KEY_REQUIRED" ? 400 : 422;
    return respond({ error: code }, status);
  }
});
