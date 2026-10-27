import { requireSupabase, rpc } from "../../../lib/supabase/client";
import {
  clearSupabaseAppSession,
  prepareSupabaseSession,
  requireSupabaseSession,
} from "./supabaseSession";
import { usernameToEmail } from "../domain/account";
import type {
  GmAccess,
  CampaignJoinRequest,
  ActiveCampaignAccess,
} from "../domain/types";
import type { EmployeePosition } from "../../campaign/domain/types";
import type {
  PublicCampaign,
  VisitorMessage,
} from "../../campaign/domain/types";
interface RemoteRequest {
  id: string;
  campaign_id: string;
  user_id: string;
  campaign_name: string;
  character_name: string;
  job_title: CampaignJoinRequest["jobTitle"];
  profile_text: string;
  status: CampaignJoinRequest["status"];
  requested_at: string;
  reviewed_at: string | null;
  review_note: string;
}
function toRequest(r: RemoteRequest): CampaignJoinRequest {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    userId: r.user_id,
    campaignName: r.campaign_name,
    characterName: r.character_name,
    jobTitle: r.job_title,
    profileText: r.profile_text,
    status: r.status,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
  };
}
export async function getActiveCampaign(): Promise<ActiveCampaignAccess | null> {
  const session = await requireSupabaseSession();
  const { data, error } = await requireSupabase()
    .from("campaign_members")
    .select(
      "campaign_id,role,character_name,job_title,campaign:campaigns(name,join_code,status)",
    )
    .eq("user_id", session.user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    campaign_id: string;
    role: ActiveCampaignAccess["role"];
    character_name: string;
    job_title: EmployeePosition;
    campaign: {
      name: string;
      join_code: string;
      status: "active" | "archived";
    };
  };
  return {
    campaignId: row.campaign_id,
    name: row.campaign.name,
    joinCode: row.campaign.join_code,
    status: row.campaign.status,
    role: row.role,
    characterName: row.character_name,
    jobTitle: row.job_title,
  };
}
export async function getGmAccess(): Promise<GmAccess> {
  const r = await rpc<{
    user_id: string;
    account_name: string;
    display_name: string;
    status: GmAccess["status"];
    requested_at: string;
    reviewed_at: string | null;
    review_note: string;
  }>("request_gm_access");
  return {
    userId: r.user_id,
    accountName: r.account_name,
    displayName: r.display_name,
    status: r.status,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
  };
}
export async function registerGm(input: {
  username: string;
  password: string;
  displayName: string;
}) {
  const { data, error } = await requireSupabase().auth.signUp({
    email: usernameToEmail(input.username),
    password: input.password,
    options: {
      data: {
        displayName: input.displayName.trim() || "值班店长",
        gmUsername: input.username.trim().toLowerCase(),
      },
    },
  });
  if (error) throw error;
  if (!data.session) throw new Error("账号需激活，请联系站长检查注册配置。");
  return prepareSupabaseSession(data.session);
}
export async function signInGm(input: { username: string; password: string }) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: usernameToEmail(input.username),
    password: input.password,
  });
  if (error) throw error;
  if (!data.session) throw new Error("AUTH_REQUIRED");
  return prepareSupabaseSession(data.session);
}
export async function createCampaign(input: {
  name: string;
  characterName: string;
}) {
  await rpc("create_campaign", {
    p_name: input.name.trim(),
    p_character_name: input.characterName.trim(),
    p_job_title: "店长",
  });
}
export async function joinCampaign(input: {
  joinCode: string;
  characterName: string;
  jobTitle: string;
  profileText: string;
}) {
  const client = requireSupabase();
  let {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    const r = await client.auth.signInAnonymously({
      options: {
        data: {
          displayName: input.characterName.trim(),
          employeePosition: input.jobTitle,
          profileText: input.profileText,
        },
      },
    });
    if (r.error) throw r.error;
    session = r.data.session;
  }
  if (!session?.user.is_anonymous) throw new Error("PLAYER_ACCOUNT_REQUIRED");
  await prepareSupabaseSession(session);
  if (await getActiveCampaign())
    throw new Error("ONE_ACTIVE_CAMPAIGN_PER_PLAYER");
  await rpc("request_campaign_join", {
    p_join_code: input.joinCode.trim().toUpperCase(),
    p_character_name: input.characterName.trim(),
    p_job_title: input.jobTitle,
    p_profile_text: input.profileText.trim(),
  });
}
export async function getOwnJoinRequest(): Promise<CampaignJoinRequest | null> {
  const session = await requireSupabaseSession();
  if (!session.user.isAnonymous) return null;
  const { data, error } = await requireSupabase()
    .from("campaign_join_requests")
    .select("*")
    .eq("user_id", session.user.id)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toRequest(data as RemoteRequest) : null;
}
export async function getCampaignJoinInbox(campaignId: string) {
  const { data, error, count } = await requireSupabase()
    .from("campaign_join_requests")
    .select("*", { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("requested_at")
    .order("id")
    .limit(30);
  if (error) throw error;
  return {
    requests: (data as RemoteRequest[]).map(toRequest),
    total: count ?? 0,
  };
}
export async function reviewCampaignJoin(
  id: string,
  approved: boolean,
  note: string,
) {
  await rpc("review_campaign_join", {
    p_request_id: id,
    p_approved: approved,
    p_note: note.trim(),
  });
}
export async function cancelCampaignJoin(id: string) {
  await rpc("cancel_campaign_join", { p_request_id: id });
}
export async function listPublicCampaigns(): Promise<PublicCampaign[]> {
  const rows = await rpc<
    Array<{
      id: string;
      name: string;
      burger_index: number;
      published_at: string;
      message_count: number;
    }>
  >("list_public_campaigns");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    burgerIndex: row.burger_index,
    publishedAt: row.published_at,
    messageCount: Number(row.message_count),
  }));
}
export async function getVisitorMessages(
  campaignId: string,
): Promise<VisitorMessage[]> {
  const rows = await rpc<
    Array<{
      id: string;
      display_name: string;
      body: string;
      created_at: string;
      is_own: boolean;
    }>
  >("get_visitor_messages", { p_campaign_id: campaignId });
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
    isOwn: row.is_own,
  }));
}
export async function submitVisitorMessage(input: {
  campaignId: string;
  displayName: string;
  body: string;
}) {
  const client = requireSupabase();
  let {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    const result = await client.auth.signInAnonymously({
      options: { data: { displayName: input.displayName.trim() } },
    });
    if (result.error) throw result.error;
    session = result.data.session;
  }
  if (!session) throw new Error("AUTH_REQUIRED");
  await prepareSupabaseSession(session);
  await rpc("submit_visitor_message", {
    p_campaign_id: input.campaignId,
    p_display_name: input.displayName.trim(),
    p_body: input.body.trim(),
  });
}
export async function deleteVisitorMessage(
  campaignId: string,
  messageId: string,
) {
  await rpc("delete_visitor_message", {
    p_campaign_id: campaignId,
    p_message_id: messageId,
  });
}
export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
  clearSupabaseAppSession();
}
