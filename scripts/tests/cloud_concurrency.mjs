// Manual post-import verification against the real target; only isolated test identities are used.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { query } from "../migration/cloud.mjs";
const admin = createClient(
  process.env.MIGRATION_SUPABASE_URL,
  process.env.MIGRATION_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const client = () =>
  createClient(
    process.env.MIGRATION_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const users = [],
  actors = [];
let campaign;
let checks = 0;
const check = (condition) => {
  assert.ok(condition, "Cloud concurrency invariant failed");
  checks++;
};
const rpc = async (c, name, args = {}) => {
  const result = await c.rpc(name, args);
  if (result.error)
    throw new Error("RPC_FAILED:" + name + ":" + result.error.code);
  return result.data;
};
try {
  const state = await query(
    "select business_writes from private.runtime where singleton;",
  );
  if (state[0]?.business_writes !== true)
    throw new Error("TARGET_WRITES_MUST_BE_OPEN");
  const gm = client();
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email: "migration-" + randomBytes(5).toString("hex") + "@gm.local",
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error("TEST_GM_CREATE");
  users.push(created.data.user.id);
  const login = await gm.auth.signInWithPassword({
    email: created.data.user.email,
    password,
  });
  if (login.error) throw new Error("TEST_GM_LOGIN");
  const gmActor = await rpc(gm, "ensure_actor");
  actors.push(gmActor.id);
  await rpc(gm, "request_gm_access");
  await query(
    `update public.gm_access set status='approved' where user_id='${gmActor.id}'::uuid;select 'test_gm_approved' result;`,
  );
  campaign = await rpc(gm, "create_campaign", {
    p_name: "迁移并发验收",
    p_character_name: "验收 GM",
    p_job_title: "店长",
  });
  const players = [];
  const requests = [];
  for (let i = 0; i < 3; i++) {
    const c = client();
    const auth = await c.auth.signInAnonymously();
    if (auth.error) throw new Error("TEST_PLAYER_CREATE");
    users.push(auth.data.user.id);
    const actor = await rpc(c, "ensure_actor");
    actors.push(actor.id);
    players.push(c);
    const request = await rpc(c, "request_campaign_join", {
      p_join_code: campaign.join_code,
      p_character_name: "验收玩家" + i,
      p_job_title: "厨师",
    });
    requests.push(request);
    if (i < 2) {
      const twice = await Promise.all(
        [0, 1].map(() =>
          gm.rpc("review_campaign_join", {
            p_request_id: request.id,
            p_approved: true,
            p_note: "",
          }),
        ),
      );
      check(twice.every((x) => !x.error));
    }
  }
  const quest = await rpc(gm, "create_quest", {
    p_campaign_id: campaign.id,
    p_title: "并发领取验证",
    p_body: "验收临时任务",
    p_assignee_label: "待认领",
    p_due_at: null,
  });
  const claims = await Promise.all(
    players
      .slice(0, 2)
      .map((c) => c.rpc("claim_quest", { p_quest_id: quest.id })),
  );
  check(claims.filter((x) => !x.error).length === 1);
  const winner = claims.findIndex((x) => !x.error);
  const submission = await rpc(players[winner], "submit_quest", {
    p_quest_id: quest.id,
    p_message: "并发验收报告",
  });
  const outcomes = await Promise.all([
    gm.rpc("review_quest_submission", {
      p_submission_id: submission.id,
      p_approved: true,
      p_message: "",
    }),
    gm.rpc("review_campaign_join", {
      p_request_id: requests[2].id,
      p_approved: true,
      p_note: "",
    }),
    gm.rpc("archive_campaign", { p_campaign_id: campaign.id }),
  ]);
  check(!outcomes[2].error);
  const board = await rpc(gm, "get_campaign_board", {
    p_campaign_id: campaign.id,
  });
  check(board.status === "archived");
  check(board.members.every((m) => !m.active));
  const late = await players[winner].rpc("submit_quest", {
    p_quest_id: quest.id,
    p_message: "归档后提交",
  });
  check(Boolean(late.error));
  const own = await gm
    .from("campaign_join_requests")
    .select("status")
    .eq("campaign_id", campaign.id);
  check(own.data?.every((r) => r.status !== "pending"));
  const archive = await gm
    .from("campaign_archives")
    .select("snapshot")
    .eq("campaign_id", campaign.id)
    .single();
  check(Boolean(archive.data?.snapshot));
  const other = await players[winner]
    .from("campaign_archives")
    .select("snapshot")
    .eq("campaign_id", campaign.id);
  check(!other.error && other.data.length === 0);
  console.log(
    JSON.stringify({
      cloudConcurrency: "passed",
      checks,
      doubleClaimExactlyOneWinner: true,
      archiveBlocksLaterWrites: true,
      concurrentReviewAndArchiveConsistent: true,
    }),
  );
} catch (e) {
  console.error("Cloud concurrency verification failed: " + e.message);
  process.exitCode = 1;
} finally {
  if (campaign) {
    await query(
      `begin;delete from public.quests where campaign_id='${campaign.id}'::uuid;delete from public.notes where campaign_id='${campaign.id}'::uuid;delete from public.resources where campaign_id='${campaign.id}'::uuid;delete from public.checklist_items where campaign_id='${campaign.id}'::uuid;delete from public.campaigns where id='${campaign.id}'::uuid;commit;select 'test_campaign_removed' result;`,
    );
  }
  if (actors.length) {
    await query(
      `delete from private.identity_migrations where actor_id=any(array[${actors.map((id) => "'" + id + "'::uuid").join(",")}]);delete from public.profiles where id=any(array[${actors.map((id) => "'" + id + "'::uuid").join(",")}]);select 'test_profiles_removed' result;`,
    );
  }
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) {
      console.log("Test Auth cleanup failed");
      process.exitCode = 1;
    }
  }
  console.log(
    "Cloud concurrency fixtures removed; historical campaigns were not edited.",
  );
}
