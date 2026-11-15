import assert from "node:assert/strict";
import { corsHeaders } from "@supabase/supabase-js/cors";
import {
  diceAllowedOrigins,
  diceCorsHeaders,
} from "../../supabase/functions/roll-dice/cors.ts";
import { diceInvocationError } from "../../src/features/dice/invocationError.ts";

const origins = diceAllowedOrigins();
for (const hostname of ["localhost", "127.0.0.1"]) {
  for (const port of [5173, 5174, 4173]) {
    const origin = `http://${hostname}:${port}`;
    assert.equal(diceCorsHeaders(origin, origins, corsHeaders)["Access-Control-Allow-Origin"], origin);
  }
}
for (const origin of ["http://localhost:5174.attacker.test", "https://evil.example", "http://localhost:5175"]) {
  assert.equal(diceCorsHeaders(origin, origins, corsHeaders)["Access-Control-Allow-Origin"], "");
}
const configured = diceAllowedOrigins("https://custom.example");
assert.ok(configured.has("https://custom.example"));
assert.ok(!configured.has("http://localhost:5174"), "explicit deployment policy overrides defaults");
const actualHeaders = diceCorsHeaders("http://localhost:5174", origins, corsHeaders);
assert.equal(actualHeaders["Access-Control-Allow-Headers"], corsHeaders["Access-Control-Allow-Headers"]);
assert.equal(actualHeaders.Vary, "Origin");
assert.equal(actualHeaders["Cache-Control"], "no-store");

assert.match(await diceInvocationError({ name: "FunctionsFetchError" }), /无法连接骰子服务/);
assert.match(await diceInvocationError({}, new Response('{"message":"Invalid JWT"}', { status: 401 })), /重新登录/);
assert.match(await diceInvocationError({}, new Response('{"error":"ORIGIN_NOT_ALLOWED"}', { status: 403 })), /页面地址未获/);
assert.match(await diceInvocationError({}, new Response('{"message":"DICE_RATE_LIMIT"}', { status: 429 })), /DICE_RATE_LIMIT/);
assert.match(await diceInvocationError({}, new Response("upstream failure", { status: 502 })), /502/);
assert.match(await diceInvocationError({}, new Response("not found", { status: 404 })), /尚未部署/);
console.log("Dice CORS origin pairs, SDK headers and transport error handling passed");
