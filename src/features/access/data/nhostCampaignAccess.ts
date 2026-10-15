import { generatePKCEPair } from "@nhost/nhost-js/auth";
import { nhost } from "../../../lib/nhost/client";
import type { CampaignRole, EmployeePosition } from "../../campaign/domain/types";

const PKCE_VERIFIER_KEY = "hamburger-protect-gm-pkce-verifier";

export interface ActiveCampaignAccess {
  campaignId: string;
  name: string;
  joinCode: string;
  status: "active" | "archived";
  role: CampaignRole;
  characterName: string;
  jobTitle: EmployeePosition;
}

interface ActiveCampaignResponse {
  campaign_members: Array<{
    campaign_id: string;
    role: CampaignRole;
    character_name: string;
    job_title: EmployeePosition;
    campaign: {
      name: string;
      join_code: string;
      status: "active" | "archived";
    };
  }>;
}

function requireClient() {
  if (!nhost) throw new Error("Nhost 尚未配置");
  return nhost;
}

async function request<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await requireClient().graphql.request<T>({
    query,
    variables,
  });
  if (!response.body.data) throw new Error("云端没有返回数据");
  return response.body.data;
}

export function getAccessErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PKCE")) return message;
  if (message.includes("already exists") || message.includes("Uniqueness")) {
    return "你已经参加了一个仍在营业的战役，不能重复入店。";
  }
  if (message.includes("rate") || message.includes("429")) {
    return "请求过于频繁，请稍后再试。";
  }
  return "操作未完成。请检查房间码或网络后重试。";
}

export async function getActiveCampaign(): Promise<ActiveCampaignAccess | null> {
  const session = requireClient().getUserSession();
  if (!session?.user) return null;
  const data = await request<ActiveCampaignResponse>(
    `query ActiveCampaignAccess($userId: uuid!) {
      campaign_members(
        where: { user_id: { _eq: $userId }, active: { _eq: true } }
        limit: 1
      ) {
        campaign_id role character_name job_title
        campaign { name join_code status }
      }
    }`,
    { userId: session.user.id },
  );
  const membership = data.campaign_members[0];
  if (!membership) return null;
  return {
    campaignId: membership.campaign_id,
    name: membership.campaign.name,
    joinCode: membership.campaign.join_code,
    status: membership.campaign.status,
    role: membership.role,
    characterName: membership.character_name,
    jobTitle: membership.job_title,
  };
}

export async function sendGmMagicLink(email: string, displayName: string) {
  const client = requireClient();
  const { verifier, challenge } = await generatePKCEPair();
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  const redirectTo = new URL(window.location.pathname, window.location.origin);
  redirectTo.searchParams.set("auth", "verify");
  await client.auth.signInPasswordlessEmail({
    email: email.trim(),
    codeChallenge: challenge,
    options: {
      displayName: displayName.trim() || "值班店长",
      defaultRole: "user",
      allowedRoles: ["user"],
      locale: "zh",
      redirectTo: redirectTo.toString(),
    },
  });
}

export function hasMagicLinkCallback() {
  return new URLSearchParams(window.location.search).has("code");
}

export async function completeGmMagicLink() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;
  const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    throw new Error("PKCE 验证信息不存在，请在发起登录的同一浏览器重新获取链接。");
  }
  try {
    const response = await requireClient().auth.tokenExchange({
      code,
      codeVerifier: verifier,
    });
    return response.body.session ?? null;
  } finally {
    localStorage.removeItem(PKCE_VERIFIER_KEY);
  }
}

export function clearMagicLinkCallback() {
  window.history.replaceState({}, "", window.location.pathname);
}

export async function createCampaign(input: {
  name: string;
  characterName: string;
}) {
  const data = await request<{ create_campaign: { id: string } }>(
    `mutation CreateCampaign($args: create_campaign_args!) {
      create_campaign(args: $args) { id }
    }`,
    {
      args: {
        p_name: input.name.trim(),
        p_character_name: input.characterName.trim(),
        p_job_title: "店长",
      },
    },
  );
  return data.create_campaign.id;
}

export async function joinCampaign(input: {
  joinCode: string;
  characterName: string;
  jobTitle: Exclude<EmployeePosition, "店长">;
}) {
  const client = requireClient();
  let session = client.getUserSession();
  if (!session?.user) {
    const response = await client.auth.signInAnonymous({
      displayName: input.characterName.trim(),
      locale: "zh",
      metadata: { employeePosition: input.jobTitle },
    });
    if (!response.body.session) throw new Error("匿名员工签到失败");
    session = client.getUserSession();
  }
  if (!session?.user?.isAnonymous) {
    throw new Error("玩家入口需要匿名员工会话，请先退出店长账号。");
  }
  const data = await request<{ join_campaign: { campaign_id: string } }>(
    `mutation JoinCampaign($args: join_campaign_args!) {
      join_campaign(args: $args) { campaign_id }
    }`,
    {
      args: {
        p_join_code: input.joinCode.trim().toUpperCase(),
        p_character_name: input.characterName.trim(),
        p_job_title: input.jobTitle,
      },
    },
  );
  return data.join_campaign.campaign_id;
}

export async function signOut() {
  const client = requireClient();
  const session = client.getUserSession();
  if (!session) return;
  try {
    await client.auth.signOut({ refreshToken: session.refreshToken });
  } finally {
    client.clearSession();
  }
}
