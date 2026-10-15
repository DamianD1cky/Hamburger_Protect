import { nhost } from "../../../lib/nhost/client";
import type { CampaignRole, EmployeePosition } from "../../campaign/domain/types";

/**
 * Nhost 的邮箱密码认证需要一个邮箱作为账号标识，但店长不需要看到这一层。
 * 账号名统一映射到合成地址，密码哈希、会话签发与刷新仍由 Nhost 托管。
 */
const GM_ACCOUNT_DOMAIN = "gm.local";

export const GM_USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
export const GM_PASSWORD_MIN_LENGTH = 8;

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

export function normalizeGmUsername(username: string) {
  return username.trim().toLowerCase();
}

function usernameToEmail(username: string) {
  return normalizeGmUsername(username) + "@" + GM_ACCOUNT_DOMAIN;
}

export function getAccessErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("already exists") || normalized.includes("uniqueness")) {
    return "该账号名已被占用，请换一个或直接登录。";
  }
  if (
    normalized.includes("invalid email or password") ||
    normalized.includes("incorrect password")
  ) {
    return "账号或密码不正确。";
  }
  if (normalized.includes("user not found")) {
    return "没有找到这个店长账号，请先注册。";
  }
  if (normalized.includes("password") && normalized.includes("short")) {
    return "密码至少需要 " + GM_PASSWORD_MIN_LENGTH + " 位。";
  }
  if (normalized.includes("rate") || normalized.includes("429")) {
    return "请求过于频繁，请稍后再试。";
  }
  if (normalized.includes("unverified") || normalized.includes("not verified")) {
    return "账号尚未激活，请联系总部处理。";
  }
  return "操作未完成。请检查账号信息或网络后重试。";
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

export async function registerGm(input: {
  username: string;
  password: string;
  displayName: string;
}) {
  const client = requireClient();
  const response = await client.auth.signUpEmailPassword({
    email: usernameToEmail(input.username),
    password: input.password,
    options: {
      displayName: input.displayName.trim() || "值班店长",
      locale: "zh",
      defaultRole: "user",
      allowedRoles: ["user"],
      metadata: { gmUsername: normalizeGmUsername(input.username) },
    },
  });
  if (!response.body.session) throw new Error("注册未返回会话");
  return response.body.session;
}

export async function signInGm(input: { username: string; password: string }) {
  const client = requireClient();
  const response = await client.auth.signInEmailPassword({
    email: usernameToEmail(input.username),
    password: input.password,
  });
  if (!response.body.session) throw new Error("登录未返回会话");
  return response.body.session;
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
