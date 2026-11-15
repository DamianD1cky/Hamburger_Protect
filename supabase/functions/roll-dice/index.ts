import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.118.0/cors";
import * as engine from "npm:@dice-roller/rpg-dice-roller@5.5.1";
import { evaluateDice, validateDiceNotation } from "../../../src/features/dice/engine.ts";
import { diceAllowedOrigins, diceCorsHeaders } from "./cors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigins = diceAllowedOrigins(Deno.env.get("DICE_ALLOWED_ORIGINS"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = diceCorsHeaders(origin, allowedOrigins, corsHeaders);
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return respond({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  const bearer = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/i.test(bearer)) return respond({ error: "AUTH_REQUIRED" }, 401);
  const user = createClient(url, key, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await user.auth.getUser(bearer.slice(7));
  if (authError || !auth.user) return respond({ error: "AUTH_REQUIRED" }, 401);
  try {
    const bodyText = await request.text();
    if (bodyText.length > 4096) return respond({ error: "DICE_INPUT_TOO_LARGE" }, 413);
    const body = JSON.parse(bodyText);
    if (!uuid.test(body.campaignId ?? "") || !uuid.test(body.requestId ?? "") ||
        typeof body.notation !== "string" || typeof body.label !== "string" ||
        body.label.length > 80 || !["public", "gm", "blind", "self"].includes(body.visibility) ||
        (body.parentId && !uuid.test(body.parentId)) || (body.checkId && !uuid.test(body.checkId))) {
      return respond({ error: "INVALID_DICE_INPUT" }, 400);
    }
    const notation = validateDiceNotation(body.notation);
    engine.Parser.parse(notation);
    const args = {
      p_campaign_id: body.campaignId, p_id: body.requestId,
      p_notation: notation, p_label: body.label, p_visibility: body.visibility,
      p_parent_id: body.parentId ?? null, p_check_id: body.checkId ?? null,
    };
    const { data: receipt, error: beginError } = await user.rpc("begin_dice_roll", args);
    if (beginError) return respond({ error: beginError.message }, beginError.message === "DICE_RATE_LIMIT" ? 429 : 403);
    if (receipt.status === "failed") return respond({ error: "计算失败，请修改公式后重新投掷。" }, 400);
    if (receipt.status !== "complete") {
      const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      let result;
      try { result = evaluateDice(receipt.notation, engine); }
      catch (error) {
        await admin.rpc("fail_dice_roll", { p_id: receipt.id });
        throw error;
      }
      const { error: finishError } = await admin.rpc("finish_dice_roll", {
        p_id: receipt.id, p_result: result,
      });
      if (finishError) return respond({ error: "DICE_SAVE_FAILED" }, 503);
    }
    // Query with the user's JWT, never return the service-role result. Blind
    // rolls return a receipt with no result, including retries and duplicates.
    const { data, error } = await user.rpc("get_dice_roll", { p_id: receipt.id });
    return error ? respond({ error: "DICE_ACCESS_REQUIRED" }, 403) : respond(data);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "INVALID_DICE_INPUT" }, 400);
  }
});
