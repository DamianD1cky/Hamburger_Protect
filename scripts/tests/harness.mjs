import assert from "node:assert/strict";
import { applyOperations, emptyBoard, newBlock, visibleBoard } from "../../src/features/harness/model.ts";
import { createAgentHandler } from "../../supabase/functions/board-agent/handler.ts";
const resource = { ...newBlock("counter", "补给"), value: 5, editable: "players" };
const secret = { ...newBlock("note", "真相"), text: "隐藏答案", visibility: "gm" };
const board = applyOperations(emptyBoard(), [{ type: "create", block: resource }, { type: "create", block: secret }], "gm");
assert.equal(visibleBoard(board, "player").blocks.length, 1);
assert.equal(applyOperations(board, [{ type: "adjust", id: resource.id, delta: -1 }], "player").blocks[0].value, 4);
assert.throws(() => applyOperations(board, [{ type: "write", id: secret.id, text: "泄露" }], "player"));
assert.throws(() => applyOperations(board, [{ type: "adjust", id: resource.id, delta: -6 }], "player"));
assert.throws(() => applyOperations(board, [{ type: "configure", id: resource.id, max: 2, title: "改名", visibility: "members", editable: "players" }], "gm"));
assert.equal(applyOperations(board, [{ type: "configure", id: resource.id, max: 20, title: "改名", visibility: "members", editable: "players" }], "gm").blocks[0].value, 5);
assert.equal(board.blocks[0].value, 5);
const config = { supabaseUrl: "https://example.supabase.co", publicKey: "public", modelUrl: "https://model.test/chat/completions", modelKey: "test-only", model: "test", origins: ["capacitor://localhost"] };
const request = (body, auth = true, origin = "capacitor://localhost") => new Request("https://example.test/board-agent", {
  method: "POST", headers: { "Content-Type": "application/json", origin, ...(auth ? { authorization: "Bearer caller" } : {}) }, body: JSON.stringify(body),
});
const input = { campaignId: crypto.randomUUID(), prompt: "补给减少一份" };
let modelCalls = 0; let resultOps = [{ type: "adjust", id: resource.id, delta: -1 }];
const mockFetch = async (url, init) => {
  if (url.endsWith("get_harness_board")) {
    assert.equal(init.headers.authorization, "Bearer caller");
    return Response.json(visibleBoard(board, "player"));
  }
  if (url.endsWith("reserve_harness_agent_request")) return Response.json("player");
  assert.equal(url, config.modelUrl);
  modelCalls++;
  assert.ok(!init.body.includes("隐藏答案"));
  assert.ok(!init.body.includes(secret.id));
  return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "建议领取一份", operations: resultOps }) } }] });
};
const handler = createAgentHandler(config, mockFetch);
assert.equal((await handler(request(input, false))).status, 401);
assert.equal((await handler(request(input, true, "https://untrusted.test"))).status, 403);
assert.equal(modelCalls, 0);
const response = await handler(request(input));
assert.equal(response.status, 200);
assert.equal((await response.json()).revision, 1);
resultOps = [{ type: "create", block: newBlock("counter", "越权") }];
assert.equal((await handler(request(input))).status, 422);
resultOps = [];
assert.equal((await handler(request(input))).status, 200);
const unavailable = createAgentHandler({ ...config, modelKey: "" }, mockFetch);
assert.equal((await unavailable(request(input))).status, 503);
const forbidden = createAgentHandler(config, async () => new Response("", { status: 403 }));
assert.equal((await forbidden(request(input))).status, 403);
assert.equal((await handler(request({ ...input, prompt: "x".repeat(13000) }))).status, 413);
console.log("Harness domain + Agent: permissions, value preservation, bounded requests, filtered context and caller JWT passed.");
