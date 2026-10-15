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

/**
 * Hasura 会把函数里 raise exception 的文案藏在 extensions 中，只把
 * 「database query error」当作 errors[].message 返回，这里把两层都取出，
 * 交给 getAccessErrorMessage 做中文映射。
 */
function graphqlErrorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const { message, extensions } = error as {
    message?: string;
    extensions?: unknown;
  };
  return [message ?? "", extensions ? JSON.stringify(extensions) : ""]
    .filter(Boolean)
    .join(" ");
}

async function request<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await requireClient().graphql.request<T>({
    query,
    variables,
  });
  if (response.body.errors?.length) {
    throw new Error(response.body.errors.map(graphqlErrorText).join("; "));
  }
  if (!response.body.data) throw new Error("云端没有返回数据");
  return response.body.data;
}

export function normalizeGmUsername(username: string) {
  return username.trim().toLowerCase();
}

function usernameToEmail(username: string) {
  return normalizeGmUsername(username) + "@" + GM_ACCOUNT_DOMAIN;
}

/**
 * Nhost 同时给出人类可读消息和连字符错误码，两者都参与匹配，
 * 避免只依赖某一种文案格式而失效。
 */
function describeError(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  else parts.push(String(error));
  const body = (error as { body?: unknown } | null)?.body;
  if (body && typeof body === "object") {
    parts.push(JSON.stringify(body));
  } else if (typeof body === "string") {
    parts.push(body);
  }
  return parts.join(" ").toLowerCase();
}

const accessErrorMessages: Array<[string[], string]> = [
  [["one_active_campaign_per_player"], "你已经参加了一个仍在营业的战役，不能重复入店。"],
  [["campaign_not_found"], "班次码无效，或该战役已经打烊。"],
  [["user-already-exists", "already exists", "uniqueness"], "该账号名已被占用，请换一个或直接登录。"],
  [["invalid-email-password", "invalid email or password", "incorrect password"], "账号或密码不正确。"],
  [["password-too-short"], "密码至少需要 " + GM_PASSWORD_MIN_LENGTH + " 位。"],
  [["disabled-endpoint", "signup-disabled"], "该入口已被总部关闭。"],
  [["unverified-user", "unverified"], "账号尚未激活，请联系总部处理。"],
  [["role-not-allowed", "disabled-user"], "该账号没有值班权限。"],
  [["gm_account_required"], "只有店长账号可以创建战役。"],
  [["gm_job_title_required", "invalid_job_title"], "岗位不符合员工手册规定。"],
  [["auth_required"], "会话已失效，请重新签到。"],
  [["rate", "429"], "请求过于频繁，请稍后再试。"],
];

export function getAccessErrorMessage(error: unknown) {
  const normalized = describeError(error);
  const matched = accessErrorMessages.find(([needles]) =>
    needles.some((needle) => normalized.includes(needle)),
  );
  return matched ? matched[1] : "操作未完成。请检查账号信息或网络后重试。";
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

/**
 * 与仓储层的 callFunction 保持一致：只确认函数成功执行，不读取返回行。
 * 本实例下返回复合类型的函数调用固定回传 null，真正的结果状态由调用方的
 * 战役查询负责确认。
 */
export async function createCampaign(input: {
  name: string;
  characterName: string;
}) {
  await request(
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
  // 玩家一次只能参加一个仍在营业的战役。先自查一次，避免把 Hasura 折叠后的
  // 错误笼统显示成班次码问题。
  if (await getActiveCampaign()) {
    throw new Error("ONE_ACTIVE_CAMPAIGN_PER_PLAYER");
  }
  try {
    await request(
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
  } catch (error) {
    // 本实例下函数返回行固定回传 null，函数只能靠异常报错，而 Hasura 会把
    // 函数内的 raise 折叠成 database query error。重复入店已在上面排除，
    // 因此这里剩下的可能只有班次码查无此局。
    if (describeError(error).includes("database query error")) {
      throw new Error("CAMPAIGN_NOT_FOUND");
    }
    throw error;
  }
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
